import { TestBed } from '@angular/core/testing';
import type { ActorsFrame, SessionEndingFrame, Step, TtsAudioEndFrame, TtsAudioFrame } from './agent-server.types';
import { LEANSCOPE_CONFIG, LEANSCOPE_FETCH, type LeanScopeConfig } from './leanscope.config';
import { LeanScopeSessionService } from './leanscope-session.service';

const SERVER = 'https://agents.example';
const CONTROLLER = `${SERVER}/api/v1/sessions/tok`;

const config: LeanScopeConfig = {
  agentServerUrl: SERVER,
  choreoScenarioGuid: 'choreo-1',
  locale: 'en',
  accessToken: 'secret-token',
  apiKeys: { openai: 'sk-1', anthropic: '', typesafe: 'ts-1' },
};

const step = (guid: string, line: string, actorSymbolRef = 'agent', action = 'CREATE'): Step => ({
  action,
  guid,
  scenarioGuid: 'session-1',
  listIndex: null,
  title: null,
  line,
  actorSymbolRef,
  predecessorRefs: null,
  questions: null,
  actions: null,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** A fake agent server: answers by method + URL and lets the test push SSE frames. */
function fakeServer() {
  const encoder = new TextEncoder();
  let events!: ReadableStreamDefaultController<Uint8Array>;
  let pending: unknown = { status: 'working' };
  const calls: { method: string; url: string; init?: RequestInit }[] = [];
  const responses = new Map<string, () => Response | Promise<Response>>();

  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, init });
    const respond = responses.get(url);
    if (respond) return respond();
    if (method === 'POST' && url === `${SERVER}/api/v1/sessions`) {
      return json({
        sessionId: '1',
        sessionScenarioGuid: 'session-1',
        sessionToken: 'tok',
        controllerUrl: CONTROLLER,
        uiUrl: 'https://ui',
        markdown: '',
      });
    }
    if (url === `${CONTROLLER}/history`) return json({ steps: [step('a', 'Hello!')] });
    if (url === `${CONTROLLER}/events`) {
      const stream = new ReadableStream<Uint8Array>({ start: (controller) => (events = controller) });
      return new Response(stream, { status: 200 });
    }
    if (url === `${CONTROLLER}/steps/pending`) return json(pending);
    if (method === 'POST' && url === `${CONTROLLER}/submit`)
      return new Response(null, { status: 204 });
    return new Response('not found', { status: 404 });
  });

  return {
    fetchFn,
    calls,
    respond: (path: string, handler: () => Response | Promise<Response>) =>
      responses.set(`${CONTROLLER}${path}`, handler),
    setPending: (value: unknown) => (pending = value),
    emit: (event: string, data: unknown) =>
      events.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)),
    close: () => events.close(),
  };
}

function setup(server = fakeServer(), cfg = config) {
  TestBed.configureTestingModule({
    providers: [
      { provide: LEANSCOPE_CONFIG, useValue: cfg },
      { provide: LEANSCOPE_FETCH, useValue: server.fetchFn },
    ],
  });
  return { server, service: TestBed.inject(LeanScopeSessionService) };
}

describe('LeanScopeSessionService', () => {
  it('delivers typed native audio, actors and ending frames without consuming their payloads', async () => {
    const { server, service } = setup();
    const onAudio = vi.fn<(frame: TtsAudioFrame) => void>();
    const onAudioEnd = vi.fn<(frame: TtsAudioEndFrame) => void>();
    const onActors = vi.fn<(frame: ActorsFrame) => void>();
    const onEnding = vi.fn<(frame: SessionEndingFrame) => void>();
    service.onFrame('tts_audio', onAudio);
    service.onFrame('tts_audio_end', onAudioEnd);
    service.onFrame('actors', onActors);
    service.onFrame('session_ending', onEnding);
    await service.start();

    const audio: TtsAudioFrame = {
      stepGuid: 'a', audioBase64: 'YXVkaW8=', mimeType: 'audio/mpeg',
      alignment: { characters: ['H', 'i'], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.3] },
    };
    const actors: ActorsFrame = { actors: [{
      guid: 'persona-1', name: 'Example persona',
      resources: [{
        guid: 'model-1', name: 'Example character', kind: { guid: 'kind-1', name: '3D Model' },
        parameters: { idleClip: 'idle', mouthParam: 'mouthOpen' },
        files: [{ guid: 'file-1', name: 'character.glb', mimeType: 'model/gltf-binary', url: '/api/v1/sessions/tok/files/leanscope/file-1' }],
      }],
    }] };
    server.emit('actors', actors);
    server.emit('tts_audio', audio);
    server.emit('tts_audio', { stepGuid: 'a', audioBase64: 'bmV4dA==', mimeType: 'audio/mpeg' });
    server.emit('tts_audio_end', { stepGuid: 'a', chunks: 2 });
    await vi.waitFor(() => expect(onAudioEnd).toHaveBeenCalledOnce());
    expect(onActors).toHaveBeenCalledExactlyOnceWith(actors);
    expect(onAudio).toHaveBeenNthCalledWith(1, audio);
    expect(onAudio).toHaveBeenNthCalledWith(2, { stepGuid: 'a', audioBase64: 'bmV4dA==', mimeType: 'audio/mpeg' });
    expect(onAudioEnd).toHaveBeenCalledWith({ stepGuid: 'a', chunks: 2 });
    expect(service.state()).toBe('working');

    const ending: SessionEndingFrame = { reason: 'error', error: { code: 'llm-unavailable', message: 'Try later' } };
    server.emit('session_ending', ending);
    await vi.waitFor(() => expect(service.state()).toBe('ended'));
    expect(onEnding).toHaveBeenCalledExactlyOnceWith(ending);
    expect(service.endReason()).toBe('error');
    service.stop();
  });

  it('preserves unknown events and unsubscribes both listener variants', async () => {
    const { server, service } = setup();
    const onAny = vi.fn();
    const onAudioEnd = vi.fn();
    const unsubscribeAny = service.onFrame(onAny);
    const unsubscribeAudioEnd = service.onFrame('tts_audio_end', onAudioEnd);
    await service.start();
    server.emit('future_event', { feature: 'new' });
    server.emit('tts_audio_end', { stepGuid: 'a', chunks: 0 });
    await vi.waitFor(() => expect(onAny).toHaveBeenCalledTimes(2));
    expect(onAny).toHaveBeenNthCalledWith(1, { event: 'future_event', data: { feature: 'new' } });
    expect(onAudioEnd).toHaveBeenCalledExactlyOnceWith({ stepGuid: 'a', chunks: 0 });

    unsubscribeAny();
    unsubscribeAudioEnd();
    server.emit('tts_audio_end', { stepGuid: 'b', chunks: 1 });
    server.emit('session_ending', { reason: 'expired' });
    await vi.waitFor(() => expect(service.state()).toBe('ended'));
    expect(onAny).toHaveBeenCalledTimes(2);
    expect(onAudioEnd).toHaveBeenCalledOnce();
    expect(service.endReason()).toBe('expired');
    service.stop();
  });

  it('does not send voice requests without a session', async () => {
    const { server, service } = setup();
    expect(await service.transcribe(new Blob(['audio']), 'de')).toBeNull();
    expect(await service.setTtsActive(true)).toBe(false);
    expect(server.fetchFn).not.toHaveBeenCalled();
  });

  it.each(['audio/webm;codecs=opus', 'audio/mp4', ''])('transcribes raw %s audio without submitting it', async (mimeType) => {
    const { server, service } = setup();
    await service.start();
    server.respond('/stt?language=de', () => json({ text: 'Mein Jahresrueckblick' }));
    const blob = new Blob(['recording'], { type: mimeType });

    expect(await service.transcribe(blob, 'de')).toBe('Mein Jahresrueckblick');
    const request = server.calls.find((call) => call.url.endsWith('/stt?language=de'));
    expect(request?.method).toBe('POST');
    expect(request?.init?.body).toBe(blob);
    expect(request?.init?.headers).toEqual({ 'Content-Type': mimeType || 'application/octet-stream' });
    expect(server.calls.some((call) => call.url.endsWith('/submit'))).toBe(false);
    expect(service.state()).toBe('working');
    service.stop();
  });

  it('allows silence and an omitted language hint', async () => {
    const { server, service } = setup();
    await service.start();
    server.respond('/stt', () => json({ text: '' }));
    expect(await service.transcribe(new Blob(['silence']))).toBe('');
    expect(service.error()).toBeNull();
    service.stop();
  });

  it.each([true, false])('sets native TTS to %s without sending credentials', async (active) => {
    const { server, service } = setup();
    await service.start();
    server.respond('/tts', () => json({ active }));
    expect(await service.setTtsActive(active)).toBe(true);
    const request = server.calls.find((call) => call.url.endsWith('/tts'));
    expect(request?.method).toBe('POST');
    expect(request?.init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(request?.init?.body))).toEqual({ active });
    service.stop();
  });

  it('reports STT failures and clears the error after a successful retry', async () => {
    const { server, service } = setup();
    await service.start();
    server.respond('/stt', () => json({ error: { message: 'Audio too large' } }, 413));
    expect(await service.transcribe(new Blob(['audio']))).toBeNull();
    expect(service.error()).toContain('413');
    expect(service.error()).toContain('Audio too large');
    expect(service.state()).toBe('working');
    server.respond('/stt', () => json({ text: 'Retry' }));
    expect(await service.transcribe(new Blob(['audio']))).toBe('Retry');
    expect(service.error()).toBeNull();
    service.stop();
  });

  it.each([{}, { text: 123 }, null])('rejects an invalid transcript response: %j', async (payload) => {
    const { server, service } = setup();
    await service.start();
    server.respond('/stt', () => json(payload));
    expect(await service.transcribe(new Blob(['audio']))).toBeNull();
    expect(service.error()).toContain('invalid transcript');
    service.stop();
  });

  it('reports a rejected or unconfirmed TTS toggle', async () => {
    const { server, service } = setup();
    await service.start();
    server.respond('/tts', () => json({ error: { message: 'TTS unavailable' } }, 503));
    expect(await service.setTtsActive(true)).toBe(false);
    expect(service.error()).toContain('TTS unavailable');
    server.respond('/tts', () => json({ active: false }));
    expect(await service.setTtsActive(true)).toBe(false);
    expect(service.error()).toContain('did not confirm');
    service.stop();
  });

  it.each(['stt', 'tts'])('drops a late %s response after stopping', async (route) => {
    const { server, service } = setup();
    await service.start();
    let resolveResponse!: (response: Response) => void;
    server.respond(`/${route}`, () => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const request = route === 'stt' ? service.transcribe(new Blob(['audio'])) : service.setTtsActive(true);
    service.stop();
    resolveResponse(json(route === 'stt' ? { text: 'Old session' } : { active: true }));
    expect(await request).toBe(route === 'stt' ? null : false);
    expect(service.error()).toBeNull();
    expect(service.state()).toBe('idle');
  });

  it('does not publish a late network error into the next session', async () => {
    const { server, service } = setup();
    await service.start();
    let rejectResponse!: (error: Error) => void;
    server.respond('/stt', () => new Promise<Response>((_resolve, reject) => { rejectResponse = reject; }));
    const request = service.transcribe(new Blob(['audio']));
    await service.start();
    rejectResponse(new Error('Old connection failed'));
    expect(await request).toBeNull();
    expect(service.error()).toBeNull();
    service.stop();
  });

  it('creates the session with the bearer token, the choreo and only non-empty keys', async () => {
    const { server, service } = setup();
    await service.start();

    const create = server.calls[0];
    expect(create.url).toBe(`${SERVER}/api/v1/sessions`);
    expect((create.init?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer secret-token',
    );
    expect(JSON.parse(String(create.init?.body))).toEqual({
      choreoScenarioGuid: 'choreo-1',
      apiKeys: { openai: 'sk-1', typesafe: 'ts-1' },
      autoStart: true,
      locale: 'en',
    });
    expect(service.session()?.sessionToken).toBe('tok');
    expect(service.steps().map((s) => s.guid)).toEqual(['a']);
    expect(service.state()).toBe('working');
    service.stop();
  });

  it('follows step frames, asks, submits and ends', async () => {
    const { server, service } = setup();
    await service.start();

    server.emit('step', step('a', 'Hello! How are you?', 'agent', 'UPDATE'));
    server.setPending({
      status: 'asking',
      step: { guid: 'h1', question: 'How are you?', fieldKeys: ['message'], required: ['message'] },
    });
    server.emit('step', { ...step('h1', '', 'human'), pending: true });

    await vi.waitFor(() => expect(service.state()).toBe('asking'));
    expect(service.pendingQuestion()?.guid).toBe('h1');
    expect(service.steps().map((s) => [s.guid, s.line])).toEqual([
      ['a', 'Hello! How are you?'],
      ['h1', ''],
    ]);

    server.setPending({ status: 'working' });
    expect(await service.submit({ message: 'Fine' })).toBe(true);
    const submit = server.calls.find((c) => c.url.endsWith('/submit'));
    expect(submit?.init?.body).toBe('{"message":"Fine"}');
    expect(service.state()).toBe('working');
    expect(service.pendingQuestion()).toBeNull();

    server.emit('session_ending', { reason: 'terminal' });
    await vi.waitFor(() => expect(service.state()).toBe('ended'));
    expect(service.endReason()).toBe('terminal');
  });

  it('removes deleted steps and ends when the stream closes', async () => {
    const { server, service } = setup();
    await service.start();
    server.emit('step', step('a', '', 'agent', 'DELETE'));
    await vi.waitFor(() => expect(service.steps()).toEqual([]));
    server.close();
    await vi.waitFor(() => expect(service.state()).toBe('ended'));
  });

  it('explains a rejected token', async () => {
    const server = fakeServer();
    server.fetchFn.mockImplementationOnce(async () =>
      json({ error: { message: 'bad token' } }, 403),
    );
    const { service } = setup(server);
    await service.start();
    expect(service.state()).toBe('error');
    expect(service.error()).toContain('did not accept the access token');
    expect(service.error()).toContain('bad token');
  });

  it('does not call the server while configuration is missing', async () => {
    const { server, service } = setup(fakeServer(), { ...config, accessToken: '', apiKeys: {} });
    await service.start();
    expect(server.fetchFn).not.toHaveBeenCalled();
    expect(service.state()).toBe('error');
    expect(service.error()).toContain('LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN');
  });
});
