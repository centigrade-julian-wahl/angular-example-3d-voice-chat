import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { PassThrough } from 'node:stream';
import { readEnvFile } from '../scripts/sync-env.mjs';

const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
const MAX_JSON_BYTES = 128 * 1024;
const SESSION_RETENTION_MS = 30 * 60 * 1000;
const EVENT_STREAM_RETRY_MS = 500;
const DEFAULT_AGENT_URL = 'https://dev.api.agents.leanscope.ai';
const DEFAULT_VOICE_ID = '89gcX1AeMGgcsN8ypHLu';

export function createVoiceApiServer({ env = runtimeEnv(), fetchImpl = fetch } = {}) {
  const sessions = new Map();
  const server = createServer((request, response) => {
    void handleRequest(request, response, { env, fetchImpl, sessions });
  });

  server.on('close', () => {
    for (const session of sessions.values()) {
      session.abort.abort();
      clearTimeout(session.cleanupTimer);
    }
  });

  return server;
}

async function handleRequest(request, response, context) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const { env, fetchImpl, sessions } = context;
  const method = request.method ?? 'GET';

  if (!url.pathname.startsWith('/api/voice/')) {
    return sendJson(response, 404, { error: 'Not found.' });
  }
  if (!isAllowedOrigin(request, env)) {
    return sendJson(response, 403, { error: 'Request origin is not allowed.' });
  }

  if (method === 'GET' && url.pathname === '/api/voice/config') {
    return sendJson(response, 200, publicConfig(env));
  }

  if (method === 'POST' && url.pathname === '/api/voice/sessions') {
    return createVoiceSession(request, response, context);
  }

  const closeMatch = url.pathname.match(/^\/api\/voice\/sessions\/([a-zA-Z0-9_-]+)$/);
  if (method === 'DELETE' && closeMatch) {
    const session = sessions.get(closeMatch[1]);
    if (session) {
      session.ended = true;
      publish(session, 'ended', { reason: 'client-closed' });
      session.abort.abort();
      clearTimeout(session.cleanupTimer);
      sessions.delete(session.id);
    }
    response.writeHead(204, { 'Cache-Control': 'no-store' });
    return response.end();
  }

  const audioMatch = url.pathname.match(/^\/api\/voice\/sessions\/([a-zA-Z0-9_-]+)\/audio\/([a-zA-Z0-9_-]+)$/);
  if (method === 'GET' && audioMatch) {
    return serveAudio(response, sessions.get(audioMatch[1]), audioMatch[2]);
  }

  const sessionMatch = url.pathname.match(/^\/api\/voice\/sessions\/([a-zA-Z0-9_-]+)(?:\/(events|status|turn|text))?$/);
  if (!sessionMatch) return sendJson(response, 404, { error: 'Not found.' });

  const session = sessions.get(sessionMatch[1]);
  if (!session) return sendJson(response, 404, { error: 'Voice session not found.' });

  const action = sessionMatch[2] ?? '';
  if (method === 'GET' && action === 'events') return streamEvents(request, response, session);
  if (method === 'GET' && action === 'status') return readStatus(response, session, fetchImpl);
  if (method === 'POST' && action === 'turn') return submitAudioTurn(request, response, session, fetchImpl, env);
  if (method === 'POST' && action === 'text') return submitTextTurn(request, response, session, fetchImpl);

  return sendJson(response, 404, { error: 'Not found.' });
}

async function createVoiceSession(request, response, { env, fetchImpl, sessions }) {
  const missing = requiredNames(env);
  if (missing.length) {
    return sendJson(response, 503, {
      error: 'Voice service is not configured.',
      missing,
    });
  }

  try {
    const agentBaseUrl = trimTrailingSlash(env.LEANSCOPE_AGENT_SERVER_URL || DEFAULT_AGENT_URL);
    const agentResponse = await fetchImpl(`${agentBaseUrl}/api/v1/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        choreoScenarioGuid: env.LEANSCOPE_CHOREO_SCENARIO_GUID,
        apiKeys: {
          mistral: env.LEANSCOPE_MISTRAL_API_KEY,
          ...(env.LEANSCOPE_TYPESAFE_API_KEY?.trim()
            ? { typesafe: env.LEANSCOPE_TYPESAFE_API_KEY }
            : {}),
        },
        locale: 'de-DE',
        autoStart: true,
        expiresAt: new Date(Date.now() + SESSION_RETENTION_MS).toISOString(),
      }),
    });

    if (!agentResponse.ok) {
      return sendJson(response, 502, {
        error: `LeanScope could not start the conversation (${agentResponse.status}).`,
      });
    }

    const agentSession = await agentResponse.json();
    const id = randomBytes(24).toString('base64url');
    const session = {
      id,
      controllerUrl: trimTrailingSlash(agentSession.controllerUrl),
      sessionToken: agentSession.sessionToken,
      abort: new AbortController(),
      clients: new Set(),
      eventHistory: [],
      nextEventId: 0,
      audio: new Map(),
      agentSteps: new Map(),
      spokenStepGuids: new Set(),
      answersByStepGuid: new Map(),
      ended: false,
      cleanupTimer: null,
    };
    sessions.set(id, session);
    void followAgentSession(session, fetchImpl, env);

    return sendJson(response, 201, { sessionId: id });
  } catch {
    return sendJson(response, 502, { error: 'Could not reach the LeanScope Agent Server.' });
  }
}

async function followAgentSession(session, fetchImpl, env) {
  while (!session.abort.signal.aborted && !session.ended) {
    try {
      const response = await fetchImpl(`${session.controllerUrl}/events`, {
        headers: { Accept: 'text/event-stream' },
        signal: session.abort.signal,
      });
      if (!response.ok || !response.body) {
        publish(session, 'conversation_error', { message: 'Could not connect to the conversation event stream.' });
      } else {
        for await (const frame of parseSse(response.body)) {
          if (session.abort.signal.aborted) return;
          if (frame.event === 'step') {
            await handleStep(session, frame.data, fetchImpl, env);
          } else if (frame.event === 'message_complete') {
            await handleMessageComplete(session, frame.data, fetchImpl, env);
          } else if (frame.event === 'session_ending') {
            session.ended = true;
            publish(session, 'ended', { reason: frame.data?.reason ?? 'terminal' });
            scheduleCleanup(session);
          } else if (frame.event === 'error') {
            publish(session, 'conversation_error', { message: 'The LeanScope conversation reported an error.' });
          }
        }
      }
    } catch {
      if (session.abort.signal.aborted) return;
      publish(session, 'conversation_error', { message: 'The conversation connection was interrupted.' });
    }

    if (session.abort.signal.aborted || session.ended) return;
    await publishPendingStatus(session, fetchImpl);
    if (session.abort.signal.aborted || session.ended) return;
    await new Promise((resolve) => setTimeout(resolve, EVENT_STREAM_RETRY_MS));
  }
}

async function handleStep(session, step, fetchImpl, env) {
  if (!step || typeof step !== 'object' || typeof step.guid !== 'string') return;
  if (step.action === 'DELETE') {
    session.agentSteps.delete(step.guid);
    return;
  }
  const fromUser = step.actorSymbolRef === 'human';
  const text = fromUser
    ? session.answersByStepGuid.get(step.guid) ?? answerText(step.line)
    : agentDisplayText(step.line);
  if (!fromUser || text?.trim()) {
    publish(session, 'message', {
      guid: step.guid,
      author: fromUser ? 'Du' : step.title?.trim() || 'Weihnachtswichtel',
      fromUser,
      text,
    });
  }

  if (!fromUser) {
    session.agentSteps.set(step.guid, { ...step, line: text });
  }

  await publishPendingStatus(session, fetchImpl);
}

async function handleMessageComplete(session, message, fetchImpl, env) {
  const stepGuid = message?.stepGuid;
  if (typeof stepGuid !== 'string' || session.spokenStepGuids.has(stepGuid)) return;
  const step = session.agentSteps.get(stepGuid);
  if (!step?.line?.trim()) return;

  session.spokenStepGuids.add(stepGuid);
  publish(session, 'status', { state: 'speaking' });
  await synthesizeStep(session, step, fetchImpl, env);
  await publishPendingStatus(session, fetchImpl);
}

async function synthesizeStep(session, step, fetchImpl, env) {
  let audioId;
  let audioStream;
  try {
    const voiceId = env.LEANSCOPE_ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
    const modelId = env.LEANSCOPE_ELEVENLABS_TTS_MODEL_ID || 'eleven_v3';
    const endpoint = new URL(
      `/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
      'https://api.elevenlabs.io',
    );
    endpoint.searchParams.set('output_format', env.LEANSCOPE_ELEVENLABS_OUTPUT_FORMAT || 'mp3_44100_128');

    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': env.LEANSCOPE_ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: step.line,
        model_id: modelId,
        language_code: 'de',
      }),
      signal: session.abort.signal,
    });

    if (!response.ok) {
      publish(session, 'speech_error', { stepGuid: step.guid, message: 'Die Sprachausgabe ist fehlgeschlagen.' });
      return;
    }

    audioId = randomBytes(12).toString('base64url');
    audioStream = new PassThrough();
    session.audio.set(audioId, { stream: audioStream, contentType: response.headers.get('content-type') || 'audio/mpeg' });
    publish(session, 'speech', {
      stepGuid: step.guid,
      audioUrl: `/api/voice/sessions/${session.id}/audio/${audioId}`,
    });

    if (!response.body) throw new Error('ElevenLabs returned no audio stream.');
    for await (const chunk of response.body) {
      if (session.abort.signal.aborted) break;
      if (!audioStream.write(Buffer.from(chunk))) {
        await new Promise((resolve) => audioStream.once('drain', resolve));
      }
    }
    audioStream.end();
  } catch {
    if (audioId) session.audio.delete(audioId);
    audioStream?.destroy();
    if (!session.abort.signal.aborted) {
      publish(session, 'speech_error', { stepGuid: step.guid, message: 'Die Sprachausgabe ist gerade nicht erreichbar.' });
    }
  }
}

async function submitAudioTurn(request, response, session, fetchImpl, env) {
  if (session.ended) return sendJson(response, 410, { error: 'This conversation has ended.' });
  if (!env.LEANSCOPE_ELEVENLABS_API_KEY) {
    return sendJson(response, 503, { error: 'LEANSCOPE_ELEVENLABS_API_KEY is not configured.' });
  }

  const pending = await getPending(session, fetchImpl);
  if (pending?.status !== 'asking' || !pending.step) {
    return sendJson(response, 409, { error: 'The conversation is not waiting for an answer.' });
  }

  const contentType = String(request.headers['content-type'] ?? 'audio/webm').split(';')[0];
  if (!contentType.startsWith('audio/')) {
    return sendJson(response, 415, { error: 'Expected an audio recording.' });
  }

  try {
    const audio = await readBody(request, MAX_AUDIO_BYTES);
    if (!audio.length) return sendJson(response, 400, { error: 'The audio recording is empty.' });

    const form = new FormData();
    form.append('file', new Blob([audio], { type: contentType }), `recording.${extensionFor(contentType)}`);
    form.append('model_id', env.LEANSCOPE_ELEVENLABS_STT_MODEL_ID || 'scribe_v2');
    form.append('language_code', 'de');
    form.append('tag_audio_events', 'false');

    const transcription = await fetchImpl('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST',
      headers: { 'xi-api-key': env.LEANSCOPE_ELEVENLABS_API_KEY },
      body: form,
      signal: session.abort.signal,
    });
    if (!transcription.ok) {
      return sendJson(response, 502, { error: `ElevenLabs-STT ist fehlgeschlagen (${transcription.status}).` });
    }

    const result = await transcription.json();
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    if (!text) return sendJson(response, 422, { error: 'Es wurde keine Sprache erkannt. Bitte versuche es noch einmal.' });

    const answer = answerForPending(pending.step, text);
    if (!answer.ok) return sendJson(response, 422, { error: answer.error });
    if (typeof pending.step.guid === 'string') session.answersByStepGuid.set(pending.step.guid, text);
    const submitted = await submitAnswer(session, answer.value, fetchImpl);
    if (!submitted.ok) {
      if (typeof pending.step.guid === 'string') session.answersByStepGuid.delete(pending.step.guid);
      return sendJson(response, submitted.status, { error: submitted.error });
    }

    publish(session, 'status', { state: 'thinking' });
    return sendJson(response, 200, { transcript: text });
  } catch (error) {
    const status = error?.status === 413 ? 413 : 500;
    const message = status === 413 ? 'Die Aufnahme ist zu lang.' : 'Die Spracheingabe konnte nicht verarbeitet werden.';
    return sendJson(response, status, { error: message });
  }
}

async function submitTextTurn(request, response, session, fetchImpl) {
  if (session.ended) return sendJson(response, 410, { error: 'This conversation has ended.' });
  const pending = await getPending(session, fetchImpl);
  if (pending?.status !== 'asking' || !pending.step) {
    return sendJson(response, 409, { error: 'The conversation is not waiting for an answer.' });
  }

  try {
    const body = await readJson(request, MAX_JSON_BYTES);
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    if (!text) return sendJson(response, 400, { error: 'Bitte gib eine Antwort ein.' });
    const answer = answerForPending(pending.step, text);
    if (!answer.ok) return sendJson(response, 422, { error: answer.error });
    if (typeof pending.step.guid === 'string') session.answersByStepGuid.set(pending.step.guid, text);
    const submitted = await submitAnswer(session, answer.value, fetchImpl);
    if (!submitted.ok) {
      if (typeof pending.step.guid === 'string') session.answersByStepGuid.delete(pending.step.guid);
      return sendJson(response, submitted.status, { error: submitted.error });
    }
    publish(session, 'status', { state: 'thinking' });
    return sendJson(response, 200, { accepted: true });
  } catch {
    return sendJson(response, 400, { error: 'Ungültige Texteingabe.' });
  }
}

function answerForPending(step, text) {
  const fields = step.fieldKeys ?? [];
  if (fields.length !== 1) {
    return { ok: false, error: 'Die aktuelle Frage muss genau ein Antwortfeld haben, damit Spracheingabe zugeordnet werden kann.' };
  }
  const key = fields[0];
  const property = step.schema?.properties?.[key] ?? {};
  let value = text;
  const type = Array.isArray(property.type) ? property.type[0] : property.type;

  if (type === 'boolean') {
    const normalized = normalize(text);
    if (/^(ja|j[aä]|yes|yeah|gerne|unbedingt|klar|stimmt)\b/.test(normalized)) value = true;
    else if (/^(nein|no|nope|nicht|lieber nicht)\b/.test(normalized)) value = false;
    else return { ok: false, error: 'Bitte antworte mit Ja oder Nein.' };
  } else if (type === 'number' || type === 'integer') {
    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed)) return { ok: false, error: 'Bitte nenne eine gültige Zahl.' };
    value = type === 'integer' ? Math.trunc(parsed) : parsed;
  } else if (Array.isArray(property.enum)) {
    const match = property.enum.find((option) => normalize(String(option)) === normalize(text));
    if (match === undefined) return { ok: false, error: 'Die Antwort passt nicht zu den angebotenen Optionen.' };
    value = match;
  }

  return { ok: true, value: { [key]: value } };
}

async function submitAnswer(session, value, fetchImpl) {
  try {
    const response = await fetchImpl(`${session.controllerUrl}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(value),
      signal: session.abort.signal,
    });
    if (response.status === 204 || response.ok) return { ok: true };
    return { ok: false, status: response.status, error: `LeanScope hat die Antwort nicht angenommen (${response.status}).` };
  } catch {
    return { ok: false, status: 502, error: 'LeanScope ist gerade nicht erreichbar.' };
  }
}

async function readStatus(response, session, fetchImpl) {
  const pending = await getPending(session, fetchImpl);
  if (!pending) return sendJson(response, 502, { error: 'Der Gesprächsstatus konnte nicht gelesen werden.' });
  return sendJson(response, 200, sanitizePending(pending));
}

async function publishPendingStatus(session, fetchImpl) {
  const pending = await getPending(session, fetchImpl);
  if (!pending) return;
  const safe = sanitizePending(pending);
  publish(session, 'status', safe);
  if (pending.status === 'ended') {
    session.ended = true;
    publish(session, 'ended', { reason: pending.endReason ?? 'terminal' });
    scheduleCleanup(session);
  }
}

async function getPending(session, fetchImpl) {
  try {
    const response = await fetchImpl(`${session.controllerUrl}/steps/pending?waitSeconds=0`, {
      signal: session.abort.signal,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

function sanitizePending(pending) {
  return {
    state: pending.status === 'asking' ? 'asking' : pending.status === 'ended' ? 'ended' : 'thinking',
    question: pending.step?.question ?? '',
    fieldKeys: pending.step?.fieldKeys ?? [],
    required: pending.step?.required ?? [],
    schema: pending.step?.schema ?? null,
  };
}

function serveAudio(response, session, audioId) {
  const audio = session?.audio.get(audioId);
  if (!audio) return sendJson(response, 404, { error: 'Audio response not found.' });
  response.writeHead(200, {
    'Content-Type': audio.contentType,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  audio.stream.pipe(response);
}

function streamEvents(request, response, session) {
  response.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  response.write('retry: 2000\n\n');
  const lastEventId = Number(request.headers['last-event-id']);
  const replayAfterId = Number.isSafeInteger(lastEventId) && lastEventId >= 0 ? lastEventId : 0;
  for (const event of session.eventHistory) {
    if (event.id > replayAfterId) writeEvent(response, event);
  }
  if (session.ended) {
    response.end();
    return;
  }

  session.clients.add(response);
  const heartbeat = setInterval(() => response.write(': heartbeat\n\n'), 15000);
  heartbeat.unref?.();
  response.on('close', () => {
    clearInterval(heartbeat);
    session.clients.delete(response);
  });
}

function publish(session, event, data) {
  const item = { id: ++session.nextEventId, event, data };
  session.eventHistory.push(item);
  if (session.eventHistory.length > 100) session.eventHistory.shift();
  for (const client of session.clients) writeEvent(client, item);
}

function writeEvent(response, item) {
  if (response.destroyed || response.writableEnded) return;
  response.write(`id: ${item.id}\nevent: ${item.event}\ndata: ${JSON.stringify(item.data)}\n\n`);
}

function scheduleCleanup(session) {
  if (session.cleanupTimer) return;
  session.cleanupTimer = setTimeout(() => {
    session.abort.abort();
  }, SESSION_RETENTION_MS);
  session.cleanupTimer.unref?.();
}

async function* parseSse(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let separator;
      while ((separator = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const block = buffer.slice(0, separator);
        const delimiter = buffer.slice(separator).match(/^\r?\n\r?\n/)[0];
        buffer = buffer.slice(separator + delimiter.length);
        const frame = decodeSseBlock(block);
        if (frame) yield frame;
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

function decodeSseBlock(block) {
  let event = 'message';
  const data = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  const raw = data.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
}

function answerText(line) {
  if (typeof line !== 'string') return '';
  try {
    const parsed = JSON.parse(line);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const values = Object.values(parsed);
      return values.length === 1 ? String(values[0] ?? '') : values.map(String).join('\n');
    }
    return typeof parsed === 'string' ? parsed : line;
  } catch {
    return line;
  }
}

function agentDisplayText(line) {
  if (typeof line !== 'string') return '';
  try {
    const parsed = JSON.parse(line);
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      parsed.kind === 'review' &&
      typeof parsed.note === 'string'
    ) {
      return parsed.note;
    }
    return typeof parsed === 'string' ? parsed : line;
  } catch {
    return line;
  }
}

function requiredNames(env) {
  const required = [
    'LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN',
    'LEANSCOPE_CHOREO_SCENARIO_GUID',
    'LEANSCOPE_MISTRAL_API_KEY',
    'LEANSCOPE_ELEVENLABS_API_KEY',
  ];
  return required.filter((name) => !env[name]?.trim());
}

function publicConfig(env) {
  const missing = requiredNames(env);
  return {
    ready: missing.length === 0,
    missing,
    maxRecordingSeconds: Number(env.LEANSCOPE_VOICE_MAX_RECORDING_SECONDS || 90),
  };
}

function runtimeEnv() {
  return { ...readEnvFile(), ...process.env };
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.origin;
  if (!origin) return true;
  const allowed = (env.LEANSCOPE_VOICE_ALLOWED_ORIGINS || 'http://localhost:4200,http://127.0.0.1:4200')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (allowed.includes(origin)) return true;
  if (env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function normalize(value) {
  return value.trim().toLocaleLowerCase('de-DE').replace(/[.!?\s]+$/g, '');
}

function extensionFor(contentType) {
  if (contentType.includes('mp4')) return 'm4a';
  if (contentType.includes('ogg')) return 'ogg';
  if (contentType.includes('wav')) return 'wav';
  if (contentType.includes('mpeg') || contentType.includes('mp3')) return 'mp3';
  return 'webm';
}

async function readJson(request, limit) {
  const body = await readBody(request, limit);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new Error('Invalid JSON.');
  }
}

async function readBody(request, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Request body too large.');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function sendJson(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(payload);
}

const port = Number(process.env.LEANSCOPE_VOICE_API_PORT || 3001);
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const server = createVoiceApiServer();
  server.listen(port, process.env.LEANSCOPE_VOICE_API_HOST || '127.0.0.1', () => {
    console.log(`Voice backend listening on http://${process.env.LEANSCOPE_VOICE_API_HOST || '127.0.0.1'}:${port}`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
  }
}
