import assert from 'node:assert/strict';
import { once } from 'node:events';
import { afterEach, test } from 'node:test';
import { createVoiceApiServer } from './voice-api.mjs';

const activeServers = new Set();
const BASE_ENV = {
  LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN: 'repo-token-test',
  LEANSCOPE_CHOREO_SCENARIO_GUID: 'choreo-guid-test',
  LEANSCOPE_MISTRAL_API_KEY: 'mistral-key-test',
  LEANSCOPE_TYPESAFE_API_KEY: 'typesafe-key-test',
  LEANSCOPE_ELEVENLABS_API_KEY: 'elevenlabs-key-test',
  LEANSCOPE_ELEVENLABS_VOICE_ID: 'voice-id-test',
  LEANSCOPE_VOICE_ALLOWED_ORIGINS: 'http://localhost:4200',
};

async function startServer(options = {}) {
  const server = createVoiceApiServer(options);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  activeServers.add(server);
  return `http://127.0.0.1:${server.address().port}`;
}

afterEach(async () => {
  await Promise.all(
    [...activeServers].map(
      (server) =>
        new Promise((resolve) => server.close(() => resolve())),
    ),
  );
  activeServers.clear();
});

test('config reports missing names but never exposes secret values', async () => {
  const origin = await startServer({ env: { ...BASE_ENV, LEANSCOPE_MISTRAL_API_KEY: '' } });
  const response = await fetch(`${origin}/api/voice/config`);
  const config = await response.json();

  assert.equal(config.ready, false);
  assert.ok(config.missing.includes('LEANSCOPE_MISTRAL_API_KEY'));
  assert.equal(JSON.stringify(config).includes('elevenlabs-key-test'), false);
  assert.equal(JSON.stringify(config).includes('repo-token-test'), false);
});

test('allows a second local Angular dev-server port', async () => {
  const origin = await startServer({ env: BASE_ENV });
  const response = await fetch(`${origin}/api/voice/config`, {
    headers: { Origin: 'http://localhost:4201' },
  });
  assert.equal(response.status, 200);
});

test('production requires an explicit allowed origin', async () => {
  const origin = await startServer({ env: { ...BASE_ENV, NODE_ENV: 'production' } });
  const response = await fetch(`${origin}/api/voice/config`, {
    headers: { Origin: 'http://localhost:4201' },
  });
  assert.equal(response.status, 403);
});

test('conversation errors use a custom event, not EventSource error semantics', async () => {
  const encoder = new TextEncoder();
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      return Response.json({
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
      });
    }
    if (url.endsWith('/events')) {
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('event: error\ndata: {"message":"upstream"}\n\n'));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const created = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  const { sessionId } = await created.json();
  const events = await fetch(`${origin}/api/voice/sessions/${sessionId}/events`);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let eventText = '';
  while (!eventText.includes('event: conversation_error')) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    eventText += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  assert.match(eventText, /event: conversation_error/);
  assert.doesNotMatch(eventText, /event: error\n/);
});

test('reconnects to the agent event stream after an interruption', async () => {
  const encoder = new TextEncoder();
  let eventConnections = 0;
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      return Response.json({
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
      });
    }
    if (url.endsWith('/events')) {
      eventConnections += 1;
      if (eventConnections === 1) {
        return new Response(new ReadableStream({
          start(controller) {
            controller.error(new Error('temporary stream failure'));
          },
        }), { headers: { 'Content-Type': 'text/event-stream' } });
      }
      return new Response(new ReadableStream({
        start(controller) {
          const step = { guid: 'agent-step', title: 'Wichtel', line: '', actorSymbolRef: 'agent' };
          controller.enqueue(encoder.encode(`event: step\ndata: ${JSON.stringify(step)}\n\n`));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.endsWith('/steps/pending?waitSeconds=0')) {
      return Response.json({ status: 'asking', step: { question: 'Say hello', fieldKeys: ['message'] } });
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const created = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  const { sessionId } = await created.json();
  const events = await fetch(`${origin}/api/voice/sessions/${sessionId}/events`);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let eventText = '';
  while (!eventText.includes('event: message')) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    eventText += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  assert.ok(eventConnections >= 2);
  assert.match(eventText, /event: conversation_error/);
  assert.match(eventText, /event: message/);
});

test('human steps display their submitted answer in the transcript', async () => {
  const encoder = new TextEncoder();
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      return Response.json({
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
      });
    }
    if (url.endsWith('/events')) {
      const step = {
        guid: 'human-step',
        line: JSON.stringify({ message: 'Ein heller Moment im Team.' }),
        actorSymbolRef: 'human',
      };
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: step\ndata: ${JSON.stringify(step)}\n\n`));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.endsWith('/steps/pending?waitSeconds=0')) {
      return Response.json({ status: 'asking', step: { fieldKeys: ['message'] } });
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const created = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  const { sessionId } = await created.json();
  const events = await fetch(`${origin}/api/voice/sessions/${sessionId}/events`);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let eventText = '';
  while (!eventText.includes('event: message')) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    eventText += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  const messageBlock = eventText.split('\n\n').find((block) => block.includes('event: message'));
  const message = JSON.parse(messageBlock.split('\n').find((line) => line.startsWith('data: ')).slice(6));
  assert.equal(message.fromUser, true);
  assert.equal(message.text, 'Ein heller Moment im Team.');
});

test('does not emit an empty transcript bubble for a pending human turn', async () => {
  const encoder = new TextEncoder();
  const fetchImpl = async (input) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      return Response.json({
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
      });
    }
    if (url.endsWith('/events')) {
      const step = {
        guid: 'pending-human-step',
        line: JSON.stringify({ message: '' }),
        actorSymbolRef: 'human',
      };
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`event: step\ndata: ${JSON.stringify(step)}\n\n`));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.endsWith('/steps/pending?waitSeconds=0')) {
      return Response.json({ status: 'asking', step: { fieldKeys: ['message'] } });
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const created = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  const { sessionId } = await created.json();
  const events = await fetch(`${origin}/api/voice/sessions/${sessionId}/events`);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let eventText = '';
  while (!eventText.includes('event: status')) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    eventText += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  assert.doesNotMatch(eventText, /event: message/);
  assert.match(eventText, /"state":"asking"/);
});

test('submitted text wins over nested upstream step data in the transcript', async () => {
  const encoder = new TextEncoder();
  let upstreamController;
  let resolveEventsReady;
  const eventsReady = new Promise((resolve) => { resolveEventsReady = resolve; });
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      return Response.json({
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
      });
    }
    if (url.endsWith('/events')) {
      return new Response(new ReadableStream({
        start(controller) {
          upstreamController = controller;
          resolveEventsReady();
          init.signal?.addEventListener('abort', () => controller.close(), { once: true });
        },
      }), { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.endsWith('/steps/pending?waitSeconds=0')) {
      return Response.json({
        status: 'asking',
        step: {
          guid: 'human-step',
          fieldKeys: ['message'],
          schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
        },
      });
    }
    if (url.endsWith('/submit')) {
      const step = {
        guid: 'human-step',
        line: JSON.stringify({ message: 'server value', metadata: { source: 'agent' } }),
        actorSymbolRef: 'human',
      };
      upstreamController.enqueue(encoder.encode(`event: step\ndata: ${JSON.stringify(step)}\n\n`));
      return new Response(null, { status: 204 });
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const created = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  const { sessionId } = await created.json();
  const events = await fetch(`${origin}/api/voice/sessions/${sessionId}/events`);
  const reader = events.body.getReader();
  const decoder = new TextDecoder();
  let eventText = '';
  await eventsReady;

  const submittedText = 'Die Vorweihnachtszeit ist ruhig und ich freue mich auf die Feiertage.';
  const submitted = await fetch(`${origin}/api/voice/sessions/${sessionId}/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: submittedText }),
  });
  assert.equal(submitted.status, 200);

  while (!eventText.includes('event: message')) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    eventText += decoder.decode(value, { stream: true });
  }
  await reader.cancel();

  const messageBlock = eventText.split('\n\n').find((block) => block.includes('event: message'));
  const message = JSON.parse(messageBlock.split('\n').find((line) => line.startsWith('data: ')).slice(6));
  assert.equal(message.fromUser, true);
  assert.equal(message.text, submittedText);
});

test('audio turn transcribes server-side and submits a schema-shaped answer', async () => {
  const calls = [];
  const encoder = new TextEncoder();
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    calls.push({ url, method, headers: init.headers, body: init.body });

    if (url.endsWith('/api/v1/sessions')) {
      return Response.json({
        sessionId: 'internal-id',
        sessionScenarioGuid: 'session-scenario',
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
        uiUrl: 'https://agent.example/?sessionToken=private-agent-token',
        markdown: '',
      });
    }
    if (url.endsWith('/events')) {
      const stream = new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.close(), { once: true });
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } });
    }
    if (url.endsWith('/steps/pending?waitSeconds=0')) {
      return Response.json({
        status: 'asking',
        step: {
          guid: 'pending-guid',
          fieldKeys: ['message'],
          required: ['message'],
          schema: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'] },
        },
      });
    }
    if (url === 'https://api.elevenlabs.io/v1/speech-to-text') {
      assert.equal(new Headers(init.headers).get('xi-api-key'), 'elevenlabs-key-test');
      assert.ok(init.body instanceof FormData);
      assert.equal(init.body.get('model_id'), 'scribe_v2');
      return Response.json({ text: 'Ein heller Moment im Team.' });
    }
    if (url.endsWith('/submit')) {
      assert.equal(new Headers(init.headers).get('content-type'), 'application/json');
      assert.deepEqual(JSON.parse(init.body), { message: 'Ein heller Moment im Team.' });
      return new Response(null, { status: 204 });
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const created = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  assert.equal(created.status, 201);
  const { sessionId } = await created.json();
  assert.equal(typeof sessionId, 'string');
  assert.equal(JSON.stringify({ sessionId }).includes('private-agent-token'), false);

  const audioTurn = await fetch(`${origin}/api/voice/sessions/${sessionId}/turn`, {
    method: 'POST',
    headers: {
      'Content-Type': 'audio/webm',
      Origin: 'http://localhost:4200',
    },
    body: new Blob([encoder.encode('fake audio')], { type: 'audio/webm' }),
  });
  assert.equal(audioTurn.status, 200);
  assert.deepEqual(await audioTurn.json(), { transcript: 'Ein heller Moment im Team.' });
  assert.ok(calls.some((call) => call.url.endsWith('/submit')));
});

test('session creation keeps access and model credentials on the server', async () => {
  let agentRequest;
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      agentRequest = { headers: new Headers(init.headers), body: JSON.parse(init.body) };
      return Response.json({
        sessionId: 'internal-id',
        sessionScenarioGuid: 'session-scenario',
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
        uiUrl: 'https://agent.example/?sessionToken=private-agent-token',
        markdown: '',
      });
    }
    if (url.endsWith('/events')) {
      return new Response(new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.close(), { once: true });
        },
      }));
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const response = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  assert.equal(response.status, 201);
  const body = await response.json();

  assert.deepEqual(Object.keys(body), ['sessionId']);
  assert.equal(agentRequest.headers.get('authorization'), 'Bearer repo-token-test');
  assert.deepEqual(agentRequest.body.apiKeys, {
    mistral: 'mistral-key-test',
    typesafe: 'typesafe-key-test',
  });
  assert.equal(agentRequest.body.choreoScenarioGuid, 'choreo-guid-test');
  assert.equal(JSON.stringify(body).includes('private-agent-token'), false);
  assert.equal(JSON.stringify(body).includes('mistral-key-test'), false);
  assert.equal(JSON.stringify(body).includes('typesafe-key-test'), false);
});

test('session creation omits the optional TypeSafe key when it is not configured', async () => {
  let agentRequest;
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      agentRequest = { body: JSON.parse(init.body) };
      return Response.json({
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
      });
    }
    if (url.endsWith('/events')) {
      return new Response(new ReadableStream({
        start(controller) {
          init.signal?.addEventListener('abort', () => controller.close(), { once: true });
        },
      }));
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({
    env: { ...BASE_ENV, LEANSCOPE_TYPESAFE_API_KEY: '' },
    fetchImpl,
  });
  const response = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  assert.equal(response.status, 201);
  assert.deepEqual(agentRequest.body.apiKeys, { mistral: 'mistral-key-test' });
});

test('streams ElevenLabs speech to the browser without exposing its key', async () => {
  const spokenBytes = Buffer.from('mock-mp3-audio');
  const fetchImpl = async (input, init = {}) => {
    const url = String(input);
    if (url.endsWith('/api/v1/sessions')) {
      return Response.json({
        sessionId: 'internal-id',
        sessionScenarioGuid: 'session-scenario',
        sessionToken: 'private-agent-token',
        controllerUrl: 'https://agent.example/api/v1/sessions/private-agent-token',
        uiUrl: 'https://agent.example/?sessionToken=private-agent-token',
        markdown: '',
      });
    }
    if (url.endsWith('/events')) {
      const step = {
        action: 'CREATE',
        guid: 'agent-step-1',
        title: 'Herausforderung 2026',
        line: JSON.stringify({
          kind: 'review',
          schema: { type: 'object', properties: { challenge: { type: 'string' } } },
          data: { challenge: 'review' },
          note: 'Welche Herausforderung hatte das Unternehmen in diesem Jahr besonders?',
        }),
        actorSymbolRef: 'agent',
      };
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`event: step\ndata: ${JSON.stringify(step)}\n\n`));
            init.signal?.addEventListener('abort', () => controller.close(), { once: true });
          },
        }),
        { headers: { 'Content-Type': 'text/event-stream' } },
      );
    }
    if (url.endsWith('/steps/pending?waitSeconds=0')) {
      return Response.json({ status: 'asking', step: { guid: 'human-step', fieldKeys: ['message'], required: ['message'] } });
    }
    if (url.startsWith('https://api.elevenlabs.io/v1/text-to-speech/')) {
      assert.ok(url.includes('/voice-id-test/stream'));
      assert.equal(new Headers(init.headers).get('xi-api-key'), 'elevenlabs-key-test');
      assert.equal(JSON.parse(init.body).model_id, 'eleven_v3');
      assert.equal(JSON.parse(init.body).text, 'Welche Herausforderung hatte das Unternehmen in diesem Jahr besonders?');
      return new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(spokenBytes.subarray(0, 5));
          controller.enqueue(spokenBytes.subarray(5));
          controller.close();
        },
      }), { headers: { 'Content-Type': 'audio/mpeg' } });
    }
    return new Response('not found', { status: 404 });
  };

  const origin = await startServer({ env: BASE_ENV, fetchImpl });
  const sessionResponse = await fetch(`${origin}/api/voice/sessions`, { method: 'POST' });
  const { sessionId } = await sessionResponse.json();
  const eventResponse = await fetch(`${origin}/api/voice/sessions/${sessionId}/events`);
  const reader = eventResponse.body.getReader();
  const decoder = new TextDecoder();
  let eventText = '';
  let visibleMessage;
  let audioUrl;
  while (!audioUrl) {
    const { value, done } = await reader.read();
    assert.equal(done, false);
    eventText += decoder.decode(value, { stream: true });
    const messageEvent = eventText.split('\n\n').find((block) => block.includes('event: message'));
    if (messageEvent) {
      visibleMessage = JSON.parse(messageEvent.split('\n').find((line) => line.startsWith('data: ')).slice(6));
    }
    const speechEvent = eventText.split('\n\n').find((block) => block.includes('event: speech'));
    if (speechEvent) audioUrl = JSON.parse(speechEvent.split('\n').find((line) => line.startsWith('data: ')).slice(6)).audioUrl;
  }
  assert.equal(visibleMessage.text, 'Welche Herausforderung hatte das Unternehmen in diesem Jahr besonders?');
  assert.doesNotMatch(visibleMessage.text, /\[object Object\]|"schema"|"data"/);
  const speechEvent = eventText.split('\n\n').find((block) => block.includes('event: speech'));
  const speechEventId = Number(speechEvent.match(/^id: (\d+)$/m)?.[1]);
  assert.ok(Number.isInteger(speechEventId));
  await reader.cancel();

  const resumedResponse = await fetch(`${origin}/api/voice/sessions/${sessionId}/events`, {
    headers: { 'Last-Event-ID': String(speechEventId) },
  });
  const resumedReader = resumedResponse.body.getReader();
  let resumedText = '';
  while (!resumedText.includes('event:')) {
    const { value, done } = await resumedReader.read();
    assert.equal(done, false);
    resumedText += decoder.decode(value, { stream: true });
  }
  await resumedReader.cancel();
  assert.match(resumedText, /event: status/);
  assert.doesNotMatch(resumedText, /event: speech/);

  const audioResponse = await fetch(new URL(audioUrl, origin));
  assert.equal(audioResponse.status, 200);
  assert.equal(audioResponse.headers.get('content-type'), 'audio/mpeg');
  assert.deepEqual(Buffer.from(await audioResponse.arrayBuffer()), spokenBytes);
});
