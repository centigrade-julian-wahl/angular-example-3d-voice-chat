import { Injectable, signal } from '@angular/core';

export type VoiceSessionState =
  | 'idle'
  | 'connecting'
  | 'working'
  | 'asking'
  | 'recording'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'ended'
  | 'error';

export interface VoiceMessage {
  guid: string;
  author: string;
  fromUser: boolean;
  text: string;
}

export interface VoicePendingQuestion {
  question: string;
  fieldKeys: string[];
  required: string[];
  schema: Record<string, unknown> | null;
}

interface VoiceConfig {
  ready: boolean;
  missing: string[];
  maxRecordingSeconds: number;
}

@Injectable({ providedIn: 'root' })
export class PttVoiceService {
  private readonly _state = signal<VoiceSessionState>('idle');
  private readonly _messages = signal<VoiceMessage[]>([]);
  private readonly _pending = signal<VoicePendingQuestion | null>(null);
  private readonly _sessionId = signal<string | null>(null);
  private readonly _audioUrl = signal<string | null>(null);
  private readonly _error = signal<string | null>(null);
  private eventSource: EventSource | null = null;
  private statusPollTimer: ReturnType<typeof setTimeout> | null = null;
  private messageCounter = 0;

  readonly state = this._state.asReadonly();
  readonly messages = this._messages.asReadonly();
  readonly pending = this._pending.asReadonly();
  readonly sessionId = this._sessionId.asReadonly();
  readonly audioUrl = this._audioUrl.asReadonly();
  readonly error = this._error.asReadonly();
  readonly maxRecordingSeconds = signal(90);

  async start(): Promise<void> {
    this.stop();
    this._state.set('connecting');
    this._error.set(null);

    try {
      const configResponse = await fetch('/api/voice/config');
      if (!configResponse.ok) throw new Error('Die Voice-Konfiguration konnte nicht gelesen werden.');
      const config = (await configResponse.json()) as VoiceConfig;
      this.maxRecordingSeconds.set(config.maxRecordingSeconds || 90);
      if (!config.ready) {
        this.fail(`Auf dem Backend fehlen noch: ${config.missing.join(', ')}.`);
        return;
      }

      const response = await fetch('/api/voice/sessions', { method: 'POST' });
      const body = await readResponse<{ sessionId?: string; error?: string }>(response);
      if (!response.ok || !body.sessionId) {
        throw new Error(body.error ?? `Die Gesprächssitzung konnte nicht gestartet werden (${response.status}).`);
      }

      this._sessionId.set(body.sessionId);
      this._state.set('working');
      this.follow(body.sessionId);
      void this.refreshStatus(body.sessionId);
    } catch (error) {
      this.fail(error instanceof Error ? error.message : 'Die Gesprächssitzung konnte nicht gestartet werden.');
    }
  }

  beginRecording(): boolean {
    if (this._state() !== 'asking') return false;
    this._audioUrl.set(null);
    this._error.set(null);
    this._state.set('recording');
    return true;
  }

  cancelRecording(): void {
    if (this._state() === 'recording') this._state.set(this._pending() ? 'asking' : 'working');
  }

  setLocalError(message: string): void {
    this._error.set(message);
    if (this._state() === 'recording') this._state.set(this._pending() ? 'asking' : 'working');
  }

  async submitAudio(audio: Blob): Promise<void> {
    const sessionId = this._sessionId();
    if (!sessionId) return;
    this._state.set('transcribing');
    this._error.set(null);

    try {
      const response = await fetch(`/api/voice/sessions/${sessionId}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': audio.type || 'audio/webm' },
        body: audio,
      });
      const body = await readResponse<{ transcript?: string; error?: string }>(response);
      if (this._sessionId() !== sessionId) return;
      if (!response.ok) throw new Error(body.error ?? `Die Spracheingabe ist fehlgeschlagen (${response.status}).`);
      this._state.set('thinking');
      void this.refreshStatus(sessionId);
    } catch (error) {
      if (this._sessionId() !== sessionId) return;
      this._error.set(error instanceof Error ? error.message : 'Die Spracheingabe ist fehlgeschlagen.');
      this._state.set(this._pending() ? 'asking' : 'error');
    }
  }

  async submitText(text: string): Promise<boolean> {
    const sessionId = this._sessionId();
    const value = text.trim();
    if (!sessionId || !value) return false;

    this._state.set('thinking');
    this._error.set(null);
    try {
      const response = await fetch(`/api/voice/sessions/${sessionId}/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: value }),
      });
      const body = await readResponse<{ error?: string }>(response);
      if (this._sessionId() !== sessionId) return false;
      if (!response.ok) throw new Error(body.error ?? `Die Antwort wurde nicht angenommen (${response.status}).`);
      void this.refreshStatus(sessionId);
      return true;
    } catch (error) {
      if (this._sessionId() !== sessionId) return false;
      this._error.set(error instanceof Error ? error.message : 'Die Antwort wurde nicht angenommen.');
      this._state.set(this._pending() ? 'asking' : 'error');
      return false;
    }
  }

  setPlaybackStarted(): void {
    if (this._state() === 'ended') return;
    this._state.set('speaking');
  }

  setPlaybackBlocked(): void {
    this._error.set('Automatische Wiedergabe blockiert. Tippe auf „Antwort abspielen“.');
    if (this._state() !== 'ended') this._state.set(this._pending() ? 'asking' : 'thinking');
  }

  setPlaybackEnded(): void {
    this._audioUrl.set(null);
    if (this._state() === 'ended') return;
    const state = this._pending() ? 'asking' : 'working';
    this._state.set(state);
  }

  abortSession(): void {
    const sessionId = this._sessionId();
    this.eventSource?.close();
    this.eventSource = null;
    this.clearStatusPoll();
    this._sessionId.set(null);
    this._pending.set(null);
    this._audioUrl.set(null);
    this._state.set('ended');

    if (sessionId) {
      void fetch(`/api/voice/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => undefined);
    }
  }

  stop(): void {
    const sessionId = this._sessionId();
    if (sessionId) {
      void fetch(`/api/voice/sessions/${sessionId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    this.eventSource?.close();
    this.eventSource = null;
    this.clearStatusPoll();
    this._state.set('idle');
    this._messages.set([]);
    this._pending.set(null);
    this._sessionId.set(null);
    this._audioUrl.set(null);
    this._error.set(null);
    this.messageCounter = 0;
  }

  private follow(sessionId: string): void {
    this.eventSource?.close();
    const source = new EventSource(`/api/voice/sessions/${sessionId}/events`);
    this.eventSource = source;
    source.addEventListener('message', (event) => this.onMessage(event as MessageEvent<string>));
    source.addEventListener('status', (event) => this.onStatus(event as MessageEvent<string>));
    source.addEventListener('speech', (event) => this.onSpeech(event as MessageEvent<string>));
    source.addEventListener('speech_error', (event) => this.onSpeechError(event as MessageEvent<string>));
    source.addEventListener('conversation_error', (event) => this.onConversationError(event as MessageEvent<string>));
    source.addEventListener('ended', (event) => this.onEnded(event as MessageEvent<string>));
    source.addEventListener('error', () => {
      if (this._state() !== 'ended' && this._state() !== 'error') {
        this._error.set('Die Verbindung zum Gespräch wurde unterbrochen.');
      }
    });
  }

  private onMessage(event: MessageEvent<string>): void {
    if (!this._sessionId()) return;
    try {
      const message = JSON.parse(event.data) as VoiceMessage;
      this._messages.update((messages) => {
        const index = messages.findIndex((item) => item.guid === message.guid);
        if (index < 0) return [...messages, { ...message, text: displayText(message.text) }];
        const updated = [...messages];
        updated[index] = { ...message, text: displayText(message.text) };
        return updated;
      });
      this._error.set(null);
    } catch {
      this._error.set('Eine Gesprächsnachricht konnte nicht gelesen werden.');
    }
  }

  private onStatus(event: MessageEvent<string>): void {
    if (!this._sessionId()) return;
    try {
      const status = JSON.parse(event.data) as {
        state?: VoiceSessionState;
        question?: string;
        fieldKeys?: string[];
        required?: string[];
        schema?: Record<string, unknown> | null;
      };
      if (status.state === 'asking') {
        this.clearStatusPoll();
        this._pending.set({
          question: status.question ?? '',
          fieldKeys: status.fieldKeys ?? [],
          required: status.required ?? [],
          schema: status.schema ?? null,
        });
        if (this._state() !== 'speaking') this._state.set('asking');
      } else if (status.state === 'ended') {
        this.clearStatusPoll();
        this._state.set('ended');
      } else if (status.state) {
        this._pending.set(null);
        if (this._state() !== 'speaking') this._state.set(status.state);
        this.scheduleStatusPoll();
      }
    } catch {
      this._error.set('Der Gesprächsstatus konnte nicht gelesen werden.');
    }
  }

  private onSpeech(event: MessageEvent<string>): void {
    if (!this._sessionId()) return;
    try {
      const speech = JSON.parse(event.data) as { audioUrl?: string };
      if (speech.audioUrl) this._audioUrl.set(speech.audioUrl);
    } catch {
      this._error.set('Die Sprachausgabe konnte nicht geladen werden.');
    }
  }

  private onSpeechError(event: MessageEvent<string>): void {
    try {
      const body = JSON.parse(event.data) as { message?: string };
      this._error.set(body.message ?? 'Die Sprachausgabe ist fehlgeschlagen.');
    } catch {
      this._error.set('Die Sprachausgabe ist fehlgeschlagen.');
    }
    this.setPlaybackEnded();
  }

  private onConversationError(event: MessageEvent<string>): void {
    try {
      const body = JSON.parse(event.data) as { message?: string };
      this._error.set(body.message ?? 'Im Gespräch ist ein Fehler aufgetreten.');
    } catch {
      this._error.set('Im Gespräch ist ein Fehler aufgetreten.');
    }
  }

  private onEnded(event: MessageEvent<string>): void {
    this._pending.set(null);
    this._state.set('ended');
    try {
      const body = JSON.parse(event.data) as { reason?: string };
      if (body.reason && body.reason !== 'terminal') this._error.set(`Gespräch beendet: ${body.reason}`);
    } catch {
      // The end state is sufficient when no detail is supplied.
    }
    this.eventSource?.close();
  }

  private async refreshStatus(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`/api/voice/sessions/${sessionId}/status`);
      if (this._sessionId() !== sessionId) return;
      if (!response.ok) {
        this.scheduleStatusPoll();
        return;
      }
      const status = (await response.json()) as {
        state?: VoiceSessionState;
        question?: string;
        fieldKeys?: string[];
        required?: string[];
        schema?: Record<string, unknown> | null;
      };
      if (this._sessionId() !== sessionId) return;
      this.onStatus({ data: JSON.stringify(status) } as MessageEvent<string>);
    } catch {
      if (this._sessionId() === sessionId) this.scheduleStatusPoll();
    }
  }

  private scheduleStatusPoll(): void {
    const sessionId = this._sessionId();
    if (!sessionId || this.statusPollTimer) return;
    this.statusPollTimer = setTimeout(() => {
      this.statusPollTimer = null;
      if (this._sessionId() === sessionId) void this.refreshStatus(sessionId);
    }, 1000);
  }

  private clearStatusPoll(): void {
    if (this.statusPollTimer) clearTimeout(this.statusPollTimer);
    this.statusPollTimer = null;
  }

  private fail(message: string): void {
    this._error.set(message);
    this._state.set('error');
  }
}

async function readResponse<T>(response: Response): Promise<T> {
  return response.json().catch(() => ({} as T));
}

function displayText(line: string): string {
  try {
    const parsed: unknown = JSON.parse(line);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const values = Object.values(parsed as Record<string, unknown>);
      if (values.length === 1) return String(values[0] ?? '');
      return values.map(String).join('\n');
    }
    return typeof parsed === 'string' ? parsed : line;
  } catch {
    return line;
  }
}
