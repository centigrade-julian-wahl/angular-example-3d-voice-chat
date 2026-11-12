import { TestBed } from '@angular/core/testing';
import { PttVoiceService } from './ptt-voice.service';

describe('PttVoiceService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('aborts the active session while preserving the conversation transcript', async () => {
    const calls: { url: string; method: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = init.method ?? 'GET';
      calls.push({ url, method });
      if (url === '/api/voice/config') {
        return Response.json({ ready: true, missing: [], maxRecordingSeconds: 90 });
      }
      if (url === '/api/voice/sessions') return Response.json({ sessionId: 'session-1' });
      if (url.endsWith('/status')) return Response.json({ state: 'asking' });
      if (method === 'DELETE') return new Response(null, { status: 204 });
      return Response.json({});
    }));
    class FakeEventSource {
      static latest: FakeEventSource;
      private readonly listeners = new Map<string, (event: MessageEvent<string>) => void>();

      constructor() {
        FakeEventSource.latest = this;
      }

      addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        this.listeners.set(type, listener as (event: MessageEvent<string>) => void);
      }

      close(): void {}

      emit(type: string, data: unknown): void {
        this.listeners.get(type)?.({ data: JSON.stringify(data) } as MessageEvent<string>);
      }
    }
    vi.stubGlobal('EventSource', FakeEventSource);

    TestBed.configureTestingModule({ providers: [PttVoiceService] });
    const service = TestBed.inject(PttVoiceService);
    await service.start();
    FakeEventSource.latest.emit('message', { guid: 'message-1', author: 'Wichtel', fromUser: false, text: 'Hallo!' });
    expect(service.messages()).toHaveLength(1);
    service.abortSession();

    await vi.waitFor(() => {
      expect(calls).toContainEqual({ url: '/api/voice/sessions/session-1', method: 'DELETE' });
    });
    expect(service.state()).toBe('ended');
    expect(service.sessionId()).toBeNull();
    expect(service.pending()).toBeNull();
    expect(service.messages()).toEqual([
      { guid: 'message-1', author: 'Wichtel', fromUser: false, text: 'Hallo!' },
    ]);
    FakeEventSource.latest.emit('status', { state: 'asking' });
    expect(service.state()).toBe('ended');
  });
});