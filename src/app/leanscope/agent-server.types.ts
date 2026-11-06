// Types for the parts of the LeanScope Agent Server API this app uses.
//
// Written by hand from the server's OpenAPI spec. The full API, with every route and frame type:
//   https://dev.api.agents.leanscope.ai/api/v1/docs          (readable docs)
//   https://dev.api.agents.leanscope.ai/api/v1/openapi.json  (the spec)

/** Body of `POST /api/v1/sessions`. Only the fields this app sends; the server accepts more. */
export interface SessionRequest {
  choreoScenarioGuid: string;
  /** Optional when the Bearer is a repository access token: the server fills it in. */
  choreoRepositoryId?: string;
  /** Your own LLM keys. At least one of openai / anthropic / mistral. Empty values must be left out. */
  apiKeys?: Partial<Record<ApiKeyVendor, string>>;
  /** e.g. 'en', 'de', 'de-DE'. */
  locale?: string;
  /** Values the session starts with, keyed like the choreo's inputs. */
  initialInput?: Record<string, unknown>;
  /** Default true. With false, the session waits until `POST …/start`. */
  autoStart?: boolean;
  lmProvider?: string;
  lmModel?: string;
}

export type ApiKeyVendor = 'openai' | 'anthropic' | 'mistral' | 'elevenlabs' | 'typesafe';

/** Response of `POST /api/v1/sessions`. */
export interface SessionResponse {
  sessionId: string;
  sessionScenarioGuid: string;
  /** The only id the browser needs. Every session route is authorized by it alone. */
  sessionToken: string;
  /** `…/api/v1/sessions/<sessionToken>`: base for /events, /history, /submit, … */
  controllerUrl: string;
  /** The server's own UI for this session. Handy for debugging. */
  uiUrl: string;
  markdown: string;
}

/** One step of a running session, as `GET …/history` and the `step` frame carry it. */
export interface Step {
  action: 'CREATE' | 'UPDATE' | 'DELETE' | string;
  guid: string;
  scenarioGuid: string | null;
  listIndex: number | null;
  title: string | null;
  /** The step's content. For a human step: the submitted answer, usually as JSON. */
  line: string;
  /** `'human'` for a step the user answers; anything else is a persona/agent. */
  actorSymbolRef: string | null;
  predecessorRefs: string[] | null;
  /** Serialized form schema, when the step asks for input. Use `GET …/steps/pending` instead. */
  questions: string | null;
  actions: string | null;
  meanTime?: string | null;
  actorGuid?: string | null;
  /** Live `step` frames only: whether this is the step the session is waiting on. */
  pending?: boolean;
}

export interface HistoryResponse {
  steps: Step[];
  degraded?: boolean;
}

/** JSON Schema of an expected answer (a small subset is typed here; the rest passes through). */
export interface AnswerSchema {
  type?: string;
  title?: string;
  description?: string;
  properties?: Record<string, AnswerPropertySchema>;
  required?: string[];
  [key: string]: unknown;
}

export interface AnswerPropertySchema {
  type?: string | string[];
  title?: string;
  description?: string;
  enum?: unknown[];
  oneOf?: { const?: unknown; title?: string; [key: string]: unknown }[];
  anyOf?: { const?: unknown; title?: string; [key: string]: unknown }[];
  format?: string;
  maxLength?: number;
  default?: unknown;
  [key: string]: unknown;
}

export type EndReason =
  'terminal' | 'infinite-loop' | 'choreo-structure-changed' | 'composed-turn-refused' | string;

/** Response of `GET …/steps/pending`. */
export interface PendingStep {
  status: 'asking' | 'working' | 'ended';
  /** Present exactly when `status` is `asking`. */
  step?: PendingQuestion;
  /** Present exactly when `status` is `ended`. */
  endReason?: EndReason;
}

export interface PendingQuestion {
  /** The step that waits for the answer. */
  guid: string;
  /** What the session said right before asking. */
  question?: string;
  /** Guid of the persona that asked, when known. */
  askedBy?: string;
  /** JSON Schema of the answer. A plain-text prompt is a one-field form: `{ message }`. */
  schema?: AnswerSchema;
  /** The answer's keys, in schema order. */
  fieldKeys: string[];
  required: string[];
  prefill?: Record<string, unknown>;
}

/** `gate` frame: the session's start gate. */
export interface GateFrame {
  state: 'waiting' | 'open' | string;
}

/** `session_ending` frame. */
export interface SessionEndingFrame {
  reason: EndReason;
}

/** One parsed frame of `GET …/events`. */
export interface SseFrame {
  /** The `event:` name, e.g. `step`, `gate`, `session_ending`. `message` when none was sent. */
  event: string;
  /** The `data:` payload, parsed as JSON. */
  data: unknown;
}
