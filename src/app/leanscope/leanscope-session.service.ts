import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  EndReason,
  GateFrame,
  HistoryResponse,
  PendingQuestion,
  PendingStep,
  SessionEndingFrame,
  SessionRequest,
  SessionResponse,
  SseFrame,
  Step,
} from './agent-server.types';
import {
  LEANSCOPE_CONFIG,
  LEANSCOPE_FETCH,
  missingConfig,
  nonEmptyApiKeys,
} from './leanscope.config';
import { readSseFrames } from './sse-parser';

/**
 * Where a session is:
 * - `idle`: none started yet (or stopped).
 * - `connecting`: being created.
 * - `waiting`: created with `autoStart: false`; waits for `begin()`.
 * - `working`: the agents are at it.
 * - `asking`: waits for the user's answer (see `pendingQuestion`).
 * - `ended`: over (see `endReason`).
 * - `error`: couldn't be created or lost its connection (see `error`).
 */
export type SessionState =
  'idle' | 'connecting' | 'waiting' | 'working' | 'asking' | 'ended' | 'error';

/**
 * Runs one LeanScope choreo session against the Agent Server and exposes it as signals.
 *
 *   start()  → POST /api/v1/sessions, then GET …/history and GET …/events (SSE)
 *   step frames update `steps`; after each one, GET …/steps/pending updates `pendingQuestion`
 *   submit() → POST …/submit with the answer
 *
 * Use this service rather than calling the API from components.
 */
@Injectable({ providedIn: 'root' })
export class LeanScopeSessionService {
  private readonly config = inject(LEANSCOPE_CONFIG);
  private readonly fetch = inject(LEANSCOPE_FETCH);

  private readonly _state = signal<SessionState>('idle');
  private readonly _steps = signal<Step[]>([]);
  private readonly _pendingQuestion = signal<PendingQuestion | null>(null);
  private readonly _session = signal<SessionResponse | null>(null);
  private readonly _error = signal<string | null>(null);
  private readonly _endReason = signal<EndReason | null>(null);

  readonly state = this._state.asReadonly();
  /** The conversation so far, in order. */
  readonly steps = this._steps.asReadonly();
  /** What the session asks the user right now, when `state` is `asking`. */
  readonly pendingQuestion = this._pendingQuestion.asReadonly();
  readonly session = this._session.asReadonly();
  readonly error = this._error.asReadonly();
  readonly endReason = this._endReason.asReadonly();
  readonly isActive = computed(() =>
    ['connecting', 'waiting', 'working', 'asking'].includes(this._state()),
  );

  /** Every SSE frame, also those this service ignores (`inventory`, `tool_activity`, …). */
  private readonly frameListeners = new Set<(frame: SseFrame) => void>();

  private abort: AbortController | null = null;
  /** Bumped on every start/stop, so answers to an older session's requests are dropped. */
  private run = 0;
  private refreshing: Promise<void> | null = null;
  private refreshAgain = false;

  /** Creates a session for the configured choreo and follows it. Stops a running one first. */
  async start(overrides: Partial<SessionRequest> = {}): Promise<void> {
    this.stop();
    const run = this.run;
    const missing = missingConfig(this.config);
    if (missing.length > 0) {
      this.fail(`Missing configuration: ${missing.join('; ')}.`);
      return;
    }

    this._state.set('connecting');
    const request: SessionRequest = {
      choreoScenarioGuid: this.config.choreoScenarioGuid.trim(),
      apiKeys: nonEmptyApiKeys(this.config.apiKeys),
      autoStart: true,
      ...(this.config.locale ? { locale: this.config.locale } : {}),
      ...overrides,
    };

    try {
      const res = await this.fetch(
        `${this.config.agentServerUrl.replace(/\/+$/, '')}/api/v1/sessions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.config.accessToken.trim()}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(request),
        },
      );
      if (run !== this.run) return;
      if (!res.ok) {
        this.fail(await createErrorMessage(res));
        return;
      }
      const session = (await res.json()) as SessionResponse;
      if (run !== this.run) return;
      this._session.set(session);
      this._state.set(request.autoStart === false ? 'waiting' : 'working');

      await this.loadHistory(run);
      this.follow(run);
      void this.refreshPending();
    } catch (err) {
      if (run === this.run) this.fail(`Could not reach the agent server: ${messageOf(err)}`);
    }
  }

  /** Opens the start gate of a session created with `autoStart: false`. */
  async begin(): Promise<void> {
    const res = await this.call('/start', { method: 'POST' });
    if (res && !res.ok) this._error.set(`Could not start the session (${res.status}).`);
  }

  /** Answers the pending question. `answer` matches `pendingQuestion().schema`. */
  async submit(answer: Record<string, unknown>): Promise<boolean> {
    const res = await this.call('/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(answer),
    });
    if (!res) return false;
    if (res.status === 204 || res.ok) {
      this._error.set(null);
      this._pendingQuestion.set(null);
      if (this._state() === 'asking') this._state.set('working');
      void this.refreshPending();
      return true;
    }
    if (res.status === 409) {
      this._error.set('That question is no longer open.');
      void this.refreshPending();
    } else if (res.status === 503) {
      this._error.set('The session has not started yet. Try again in a moment.');
    } else {
      this._error.set(`Your answer was not accepted (${res.status}): ${await errorText(res)}`);
    }
    return false;
  }

  /** Stops following the session. The session itself keeps running on the server until it ends. */
  stop(): void {
    this.run++;
    this.abort?.abort();
    this.abort = null;
    this.refreshing = null;
    this.refreshAgain = false;
    this._state.set('idle');
    this._steps.set([]);
    this._pendingQuestion.set(null);
    this._session.set(null);
    this._error.set(null);
    this._endReason.set(null);
  }

  /** Calls `listener` with every SSE frame. Returns a function that removes it. */
  onFrame(listener: (frame: SseFrame) => void): () => void {
    this.frameListeners.add(listener);
    return () => this.frameListeners.delete(listener);
  }

  private async loadHistory(run: number): Promise<void> {
    const res = await this.call('/history');
    if (!res?.ok || run !== this.run) return;
    const history = (await res.json()) as HistoryResponse;
    if (run !== this.run) return;
    for (const step of history.steps ?? []) this.upsertStep(step);
  }

  /** Reads `GET …/events` in the background until the stream ends or `stop()` aborts it. */
  private follow(run: number): void {
    const session = this._session();
    if (!session) return;
    const abort = new AbortController();
    this.abort = abort;

    void (async () => {
      try {
        const res = await this.fetch(`${session.controllerUrl}/events`, {
          headers: { Accept: 'text/event-stream' },
          signal: abort.signal,
        });
        if (!res.ok || !res.body) throw new Error(`events stream answered ${res.status}`);
        for await (const frame of readSseFrames(res.body)) {
          if (run !== this.run) return;
          this.handleFrame(frame);
        }
        // The server closes the stream when the session is over.
        if (run === this.run && this._state() !== 'ended')
          this.end(this._endReason() ?? 'terminal');
      } catch (err) {
        if (abort.signal.aborted || run !== this.run) return;
        if (this._state() !== 'ended')
          this.fail(`Lost the connection to the session: ${messageOf(err)}`);
      }
    })();
  }

  private handleFrame(frame: SseFrame): void {
    for (const listener of this.frameListeners) listener(frame);
    switch (frame.event) {
      case 'step':
        this.upsertStep(frame.data as Step);
        void this.refreshPending();
        break;
      case 'gate': {
        const { state } = frame.data as GateFrame;
        if (state === 'waiting' && this._state() === 'working') this._state.set('waiting');
        if (state === 'open' && this._state() === 'waiting') this._state.set('working');
        break;
      }
      case 'session_ending':
        this.end((frame.data as SessionEndingFrame).reason);
        break;
      case 'error':
        this._error.set(
          (frame.data as { message?: string })?.message ?? 'The session reported an error.',
        );
        break;
    }
  }

  /** Step frames carry the step's full current state, so a frame replaces the step with its guid. */
  private upsertStep(step: Step): void {
    this._steps.update((steps) => {
      const index = steps.findIndex((s) => s.guid === step.guid);
      if (step.action === 'DELETE')
        return index === -1 ? steps : steps.filter((_, i) => i !== index);
      if (index === -1) return [...steps, step];
      const next = [...steps];
      next[index] = step;
      return next;
    });
  }

  /** Asks `GET …/steps/pending` what the session waits for. Calls never overlap. */
  private refreshPending(): Promise<void> {
    if (this.refreshing) {
      this.refreshAgain = true;
      return this.refreshing;
    }
    const run = this.run;
    this.refreshing = (async () => {
      do {
        this.refreshAgain = false;
        const res = await this.call('/steps/pending');
        if (!res?.ok || run !== this.run) return;
        const pending = (await res.json()) as PendingStep;
        if (run !== this.run || this._state() === 'ended' || this._state() === 'error') return;
        if (pending.status === 'asking' && pending.step) {
          this._pendingQuestion.set(pending.step);
          this._state.set('asking');
        } else if (pending.status === 'ended') {
          this.end(pending.endReason ?? 'terminal');
        } else {
          this._pendingQuestion.set(null);
          if (this._state() === 'asking') this._state.set('working');
        }
      } while (this.refreshAgain && run === this.run);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (run === this.run) this.refreshing = null;
      });
    return this.refreshing;
  }

  /** A request to the session's own routes (`…/sessions/<token><path>`); null without a session. */
  private async call(path: string, init: RequestInit = {}): Promise<Response | null> {
    const session = this._session();
    if (!session) return null;
    try {
      return await this.fetch(`${session.controllerUrl}${path}`, init);
    } catch (err) {
      this._error.set(`Could not reach the session: ${messageOf(err)}`);
      return null;
    }
  }

  private end(reason: EndReason): void {
    this._endReason.set(reason);
    this._pendingQuestion.set(null);
    this._state.set('ended');
    this.abort?.abort();
  }

  private fail(message: string): void {
    this._error.set(message);
    this._state.set('error');
    this.abort?.abort();
  }
}

async function createErrorMessage(res: Response): Promise<string> {
  const detail = await errorText(res);
  switch (res.status) {
    case 401:
    case 403:
      return `LeanScope did not accept the access token (${res.status}). Check LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN in .env. ${detail}`;
    case 404:
      return `The choreo was not found (404). Check LEANSCOPE_CHOREO_SCENARIO_GUID in .env. ${detail}`;
    case 422:
      return `The agent server needs your own LLM key (422). Add an OpenAI, Anthropic or Mistral key to .env. ${detail}`;
    default:
      return `Could not create the session (${res.status}). ${detail}`;
  }
}

async function errorText(res: Response): Promise<string> {
  const text = await res.text().catch(() => '');
  try {
    // The server's error envelope is `{ error: { message } }`.
    const body = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    return message ?? body.message ?? text;
  } catch {
    return text.slice(0, 300);
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
