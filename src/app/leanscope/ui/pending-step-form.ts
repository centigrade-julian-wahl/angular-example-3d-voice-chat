import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import type { PendingQuestion } from '../agent-server.types';
import { answerFields, toAnswer, type AnswerField } from '../answer-fields';

/** The form for the question a session asks right now. Emits the answer object on submit. */
@Component({
  selector: 'ls-pending-step-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  // The question itself is the persona's last message, which the transcript already shows.
  template: `
    <form [formGroup]="form()" (ngSubmit)="send()">
      @for (field of fields(); track field.key) {
        <label class="field" [class.inline]="field.kind === 'boolean'">
          @if (field.kind !== 'boolean') {
            <span
              >{{ field.label }}
              @if (field.required) {
                <abbr title="required">*</abbr>
              }
            </span>
          }
          @switch (field.kind) {
            @case ('textarea') {
              <textarea [formControlName]="field.key" rows="4"></textarea>
            }
            @case ('json') {
              <textarea
                [formControlName]="field.key"
                rows="6"
                class="mono"
                placeholder="JSON"
              ></textarea>
            }
            @case ('number') {
              <input type="number" [formControlName]="field.key" />
            }
            @case ('boolean') {
              <input type="checkbox" [formControlName]="field.key" />
              <span>{{ field.label }}</span>
            }
            @case ('choice') {
              <select [formControlName]="field.key">
                <option [ngValue]="null" disabled>Choose…</option>
                @for (choice of field.choices; track $index) {
                  <option [ngValue]="choice.value">{{ choice.label }}</option>
                }
              </select>
            }
            @default {
              <input type="text" [formControlName]="field.key" autocomplete="off" />
            }
          }
          @if (field.description) {
            <small>{{ field.description }}</small>
          }
        </label>
      }
      @if (formError(); as message) {
        <p class="error" role="alert">{{ message }}</p>
      }
      <button type="submit" [disabled]="form().invalid || busy()">Send</button>
    </form>
  `,
  styles: `
    :host {
      display: block;
      padding: 1rem;
      border-radius: 0.75rem;
      background: var(--ls-surface);
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    .field.inline {
      flex-direction: row;
      align-items: center;
      gap: 0.5rem;
    }
    input:not([type='checkbox']),
    textarea,
    select {
      font: inherit;
      padding: 0.5rem;
      border: 1px solid var(--ls-border);
      border-radius: 0.5rem;
    }
    .mono {
      font-family: ui-monospace, monospace;
    }
    small {
      color: var(--ls-muted);
    }
    abbr {
      text-decoration: none;
      color: var(--ls-danger);
      margin-left: 0.15rem;
    }
    .error {
      color: var(--ls-danger);
      margin: 0;
    }
    button {
      align-self: flex-start;
    }
  `,
})
export class PendingStepForm {
  readonly question = input.required<PendingQuestion>();
  /** True while the answer is being sent. */
  readonly busy = input(false);
  readonly answered = output<Record<string, unknown>>();

  protected readonly fields = computed(() => answerFields(this.question()));
  protected readonly form = computed(() => buildForm(this.fields()));
  protected readonly formError = signal<string | null>(null);

  protected send(): void {
    if (this.form().invalid) return;
    try {
      this.formError.set(null);
      this.answered.emit(toAnswer(this.fields(), this.form().getRawValue()));
    } catch (err) {
      this.formError.set(err instanceof Error ? err.message : String(err));
    }
  }
}

function buildForm(fields: AnswerField[]): FormGroup<Record<string, FormControl<unknown>>> {
  const controls: Record<string, FormControl<unknown>> = {};
  for (const field of fields) {
    const requiredValidator =
      field.kind === 'boolean' ? [] : field.required ? [Validators.required] : [];
    controls[field.key] = new FormControl<unknown>(field.initial, {
      validators: requiredValidator,
    });
  }
  return new FormGroup(controls);
}
