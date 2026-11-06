import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeanScopeSessionService } from '../../leanscope/leanscope-session.service';
import { PendingStepForm } from '../../leanscope/ui/pending-step-form';
import { Transcript } from '../../leanscope/ui/transcript';

const STATE_LABELS = {
  idle: 'Not started',
  connecting: 'Connecting…',
  waiting: 'Waiting to start',
  working: 'Agents are working…',
  asking: 'Your turn',
  ended: 'Ended',
  error: 'Error',
} as const;

/** Runs a session of the configured choreo: conversation plus the form for the open question. */
@Component({
  selector: 'app-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Transcript, PendingStepForm],
  template: `
    <header class="bar">
      <h1>Session</h1>
      <span class="state" [attr.data-state]="session.state()" aria-live="polite">{{
        labels[session.state()]
      }}</span>
      @if (session.session(); as s) {
        <a [href]="s.uiUrl" target="_blank" rel="noopener">Open in LeanScope</a>
      }
    </header>

    @if (session.error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    <ls-transcript
      [steps]="session.steps()"
      [pendingGuid]="session.pendingQuestion()?.guid ?? null"
    />

    @if (session.pendingQuestion(); as question) {
      <ls-pending-step-form [question]="question" [busy]="sending()" (answered)="answer($event)" />
    }

    @if (session.state() === 'waiting') {
      <button type="button" (click)="session.begin()">Start</button>
    }

    @if (session.state() === 'ended' || session.state() === 'error') {
      <footer class="bar">
        @if (session.endReason(); as reason) {
          <span>The session ended ({{ reason }}).</span>
        }
        <button type="button" (click)="session.start()">Start again</button>
        <a routerLink="/">Back</a>
      </footer>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }
    .bar {
      display: flex;
      align-items: center;
      gap: 1rem;
      flex-wrap: wrap;
    }
    h1 {
      margin: 0;
    }
    .state {
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      background: var(--ls-surface);
      font-size: 0.85rem;
    }
    .state[data-state='asking'] {
      background: var(--ls-accent-soft);
    }
    .state[data-state='error'] {
      color: var(--ls-danger);
    }
    .error {
      color: var(--ls-danger);
      margin: 0;
    }
  `,
})
export class SessionPage implements OnInit, OnDestroy {
  protected readonly session = inject(LeanScopeSessionService);
  protected readonly labels = STATE_LABELS;
  protected readonly sending = signal(false);

  ngOnInit(): void {
    if (!this.session.isActive()) void this.session.start();
  }

  ngOnDestroy(): void {
    this.session.stop();
  }

  protected async answer(answer: Record<string, unknown>): Promise<void> {
    this.sending.set(true);
    try {
      await this.session.submit(answer);
    } finally {
      this.sending.set(false);
    }
  }
}
