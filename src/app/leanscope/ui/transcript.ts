import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { Step } from '../agent-server.types';

interface Message {
  guid: string;
  fromUser: boolean;
  author: string;
  text: string;
}

/** The conversation of a session: agent and user messages, oldest first. */
@Component({
  selector: 'ls-transcript',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (message of messages(); track message.guid) {
      <article class="message" [class.from-user]="message.fromUser">
        <header>{{ message.author }}</header>
        <p>{{ message.text }}</p>
      </article>
    } @empty {
      <p class="empty">No messages yet.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .message {
      max-width: 80%;
      padding: 0.6rem 0.9rem;
      border-radius: 0.75rem;
      background: var(--ls-surface);
    }
    .message.from-user {
      align-self: flex-end;
      background: var(--ls-accent-soft);
    }
    header {
      font-size: 0.75rem;
      font-weight: 600;
      color: var(--ls-muted);
      margin-bottom: 0.25rem;
    }
    p {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .empty {
      color: var(--ls-muted);
    }
  `,
})
export class Transcript {
  readonly steps = input.required<Step[]>();
  /** The step that waits for an answer; it is shown as the form, not as a message. */
  readonly pendingGuid = input<string | null>(null);

  protected readonly messages = computed<Message[]>(() =>
    this.steps()
      .filter((step) => step.guid !== this.pendingGuid() && !step.pending && step.line?.trim())
      .map((step) => {
        const fromUser = step.actorSymbolRef === 'human';
        return {
          guid: step.guid,
          fromUser,
          author: fromUser ? 'You' : step.title?.trim() || step.actorSymbolRef || 'Agent',
          text: fromUser ? answerText(step.line) : step.line,
        };
      }),
  );
}

/**
 * A user step's line is the submitted answer as JSON, either plain (`{"message":"…"}`) or wrapped
 * by the server as `{"kind":"review","schema":{…},"data":{…}}`. Shows only the answer, as text;
 * a picked choice shows its title instead of its value.
 */
export function answerText(line: string): string {
  try {
    let answer = JSON.parse(line) as unknown;
    let titles: Record<string, Record<string, string>> = {};
    if (isRecord(answer) && isRecord(answer['data']) && 'schema' in answer) {
      titles = choiceTitles(answer['schema']);
      answer = answer['data'];
    }
    if (isRecord(answer)) {
      const entries = Object.entries(answer).map(
        ([key, value]) => [key, titles[key]?.[String(value)] ?? value] as const,
      );
      // One field (a message, a picked choice): just its value.
      if (entries.length === 1) {
        const [, value] = entries[0];
        return (typeof value === 'string' ? value : JSON.stringify(value)).trim();
      }
      return entries
        .map(
          ([key, value]) => `${key}: ${typeof value === 'string' ? value : JSON.stringify(value)}`,
        )
        .join('\n');
    }
    return typeof answer === 'string' ? answer : line;
  } catch {
    return line;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** For each choice field of a schema: value → title (from `oneOf: [{ const, title }]`). */
function choiceTitles(schema: unknown): Record<string, Record<string, string>> {
  const properties = isRecord(schema) && isRecord(schema['properties']) ? schema['properties'] : {};
  const titles: Record<string, Record<string, string>> = {};
  for (const [key, property] of Object.entries(properties)) {
    const options = isRecord(property) && Array.isArray(property['oneOf']) ? property['oneOf'] : [];
    for (const option of options) {
      if (isRecord(option) && 'const' in option && typeof option['title'] === 'string') {
        (titles[key] ??= {})[String(option['const'])] = option['title'];
      }
    }
  }
  return titles;
}
