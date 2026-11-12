import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LeanScopeSessionService } from '../../leanscope/leanscope-session.service';
import { PendingStepForm } from '../../leanscope/ui/pending-step-form';
import { Transcript } from '../../leanscope/ui/transcript';
import { CharacterAvatar } from '../../features/character/character-avatar';
import { mapAvatarState } from '../../features/character/avatar-state';

const STATE_LABELS = {
  idle: 'Nicht gestartet',
  connecting: 'Verbindung wird aufgebaut …',
  waiting: 'Bereit zum Start',
  working: 'Der Wichtel denkt nach …',
  asking: 'Du bist dran',
  ended: 'Beendet',
  error: 'Fehler',
} as const;

/** Runs a session of the configured choreo: conversation plus the form for the open question. */
@Component({
  selector: 'app-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Transcript, PendingStepForm, CharacterAvatar],
  template: `
    <header class="bar">
      <div>
        <p class="eyebrow">WEIHNACHTSGRUSS 2026</p>
        <h1>Dein Jahresrückblick</h1>
      </div>
      <span class="state" [attr.data-state]="session.state()" aria-live="polite">{{
        labels[session.state()]
      }}</span>
      @if (session.session(); as s) {
        <a [href]="s.uiUrl" target="_blank" rel="noopener">In LeanScope öffnen</a>
      }
    </header>

    @if (session.error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    <ls-character-avatar
      class="session-character"
      [state]="avatarState()"
      label="Dein digitaler Weihnachtswichtel"
      loadingText="Der Wichtel wird geladen …"
    />

    <ls-transcript
      [steps]="session.steps()"
      [pendingGuid]="session.pendingQuestion()?.guid ?? null"
      userLabel="Du"
      agentLabel="Wichtel"
      emptyText="Das Gespräch beginnt gleich …"
    />

    @if (session.pendingQuestion(); as question) {
      <ls-pending-step-form
        [question]="question"
        [busy]="sending()"
        [sendLabel]="sending() ? 'Wird gesendet …' : 'Absenden'"
        choosePlaceholder="Bitte wählen …"
        (answered)="answer($event)"
      />
    }

    @if (session.state() === 'waiting') {
      <button type="button" (click)="session.begin()">Gespräch starten</button>
    }

    @if (session.state() === 'ended' || session.state() === 'error') {
      <footer class="bar ending">
        @if (session.endReason(); as reason) {
          <span>Das Gespräch wurde beendet ({{ reason }}).</span>
        }
        <button type="button" (click)="session.start()">Noch einmal starten</button>
        <a routerLink="/">Zur Startseite</a>
      </footer>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: 1.1rem;
      max-width: 54rem;
      margin: 0 auto;
      padding: 1.4rem 0 2rem;
    }
    .bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      flex-wrap: wrap;
    }
    .eyebrow {
      margin: 0 0 0.25rem;
      color: #58bce9;
      font-size: 0.64rem;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    h1 {
      margin: 0;
      font-size: 1.55rem;
      line-height: 1.2;
    }
    a {
      color: #74c9f0;
    }
    .state {
      padding: 0.35rem 0.7rem;
      border: 1px solid var(--ls-border);
      border-radius: 0.3rem;
      background: var(--ls-surface);
      color: var(--ls-muted);
      font-size: 0.78rem;
    }
    .state[data-state='asking'] {
      border-color: #2da4dc;
      background: var(--ls-accent-soft);
      color: #a8e3ff;
    }
    .state[data-state='error'] {
      color: var(--ls-danger);
    }
    .error {
      color: var(--ls-danger);
      margin: 0;
      padding: 0.75rem 1rem;
      border: 1px solid rgba(255, 142, 135, 0.45);
      border-radius: 0.35rem;
      background: rgba(91, 34, 39, 0.35);
    }
    .session-character {
      display: block;
      width: min(100%, 19rem);
      height: 14rem;
      margin: -0.3rem auto -0.5rem;
    }
    .ending {
      justify-content: flex-start;
      padding-top: 1rem;
      border-top: 1px solid var(--ls-border);
    }
    @media (max-width: 640px) {
      :host { padding-top: 1rem; }
      h1 { font-size: 1.35rem; }
      .session-character { height: 11rem; }
    }
  `,
})
export class SessionPage implements OnInit, OnDestroy {
  protected readonly session = inject(LeanScopeSessionService);
  protected readonly labels = STATE_LABELS;
  protected readonly sending = signal(false);
  protected readonly avatarState = computed(() => mapAvatarState(this.session.state()));

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
