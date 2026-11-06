import { TestBed } from '@angular/core/testing';
import type { Step } from './agent-server.types';
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
  const stream = new ReadableStream<Uint8Array>({ start: (c) => (events = c) });
  let pending: unknown = { status: 'working' };
  const calls: { method: string; url: string; init?: RequestInit }[] = [];

  const fetchFn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    calls.push({ method, url, init });
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
    if (url === `${CONTROLLER}/events`) return new Response(stream, { status: 200 });
    if (url === `${CONTROLLER}/steps/pending`) return json(pending);
    if (method === 'POST' && url === `${CONTROLLER}/submit`)
      return new Response(null, { status: 204 });
    return new Response('not found', { status: 404 });
  });

  return {
    fetchFn,
    calls,
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
