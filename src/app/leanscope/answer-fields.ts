import type { AnswerPropertySchema, PendingQuestion } from './agent-server.types';

export type AnswerFieldKind = 'text' | 'textarea' | 'number' | 'boolean' | 'choice' | 'json';

export interface AnswerChoice {
  value: unknown;
  label: string;
}

/** One input of the answer form, derived from the pending step's JSON Schema. */
export interface AnswerField {
  key: string;
  label: string;
  description?: string;
  kind: AnswerFieldKind;
  required: boolean;
  choices: AnswerChoice[];
  /** The value the input starts with (from `prefill`, else the schema's `default`). */
  initial: unknown;
}

/**
 * The form inputs for a pending question. Flat schemas (strings, numbers, booleans, choices) get
 * one input per field; anything nested gets a JSON text area, so every question can be answered.
 * A question without a schema is answered as plain text (`{ message }`).
 */
export function answerFields(question: PendingQuestion): AnswerField[] {
  const properties = question.schema?.properties;
  if (!properties || Object.keys(properties).length === 0) {
    return [
      {
        key: 'message',
        label: 'Your answer',
        kind: 'text',
        required: true,
        choices: [],
        initial: question.prefill?.['message'] ?? '',
      },
    ];
  }

  const keys = question.fieldKeys.length > 0 ? question.fieldKeys : Object.keys(properties);
  return keys
    .filter((key) => properties[key])
    .map((key) => {
      const property = properties[key];
      const choices = choicesOf(property);
      const kind = choices.length > 0 ? 'choice' : kindOf(property);
      return {
        key,
        label: property.title ?? (key === 'message' ? 'Your answer' : humanize(key)),
        description: property.description,
        kind,
        required: question.required.includes(key),
        choices,
        initial: initialValue(kind, question.prefill?.[key] ?? property.default),
      };
    });
}

/**
 * Turns the form's raw values into the answer object `POST …/submit` takes. Empty optional
 * fields are left out. Throws with a readable message when a JSON field doesn't parse.
 */
export function toAnswer(
  fields: AnswerField[],
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const answer: Record<string, unknown> = {};
  for (const field of fields) {
    const value = raw[field.key];
    switch (field.kind) {
      case 'boolean':
        answer[field.key] = Boolean(value);
        break;
      case 'number':
        if (value !== '' && value !== null && value !== undefined)
          answer[field.key] = Number(value);
        break;
      case 'json':
        if (typeof value === 'string' && value.trim()) {
          try {
            answer[field.key] = JSON.parse(value);
          } catch {
            throw new Error(`"${field.label}" is not valid JSON.`);
          }
        }
        break;
      case 'choice':
        if (value !== null && value !== undefined && value !== '') answer[field.key] = value;
        break;
      default:
        if (typeof value === 'string' && value !== '') answer[field.key] = value;
    }
  }
  return answer;
}

function choicesOf(property: AnswerPropertySchema): AnswerChoice[] {
  if (Array.isArray(property.enum)) {
    return property.enum.map((value) => ({ value, label: String(value) }));
  }
  const options = property.oneOf ?? property.anyOf;
  if (Array.isArray(options) && options.length > 0 && options.every((o) => 'const' in o)) {
    return options.map((o) => ({ value: o.const, label: o.title ?? String(o.const) }));
  }
  return [];
}

function kindOf(property: AnswerPropertySchema): AnswerFieldKind {
  const types = Array.isArray(property.type) ? property.type : [property.type];
  if (types.includes('boolean')) return 'boolean';
  if (types.includes('number') || types.includes('integer')) return 'number';
  if (types.includes('string') || property.type === undefined) {
    const long = property.format === 'textarea' || (property.maxLength ?? 0) > 200;
    return long ? 'textarea' : 'text';
  }
  return 'json';
}

function initialValue(kind: AnswerFieldKind, value: unknown): unknown {
  if (kind === 'json') return value === undefined ? '' : JSON.stringify(value, null, 2);
  if (kind === 'boolean') return Boolean(value);
  if (kind === 'choice') return value ?? null;
  return value ?? '';
}

function humanize(key: string): string {
  const words = key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
