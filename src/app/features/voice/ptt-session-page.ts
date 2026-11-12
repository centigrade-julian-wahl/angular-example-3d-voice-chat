import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideMic, LucidePause, LucidePlay, LucideX } from '@lucide/angular';
import { CharacterAvatar } from '../character/character-avatar';
import { mapAvatarState } from '../character/avatar-state';
import { messageParts } from './message-parts';
import { PttVoiceService, type VoiceSessionState } from './ptt-voice.service';

const STATE_LABELS: Record<VoiceSessionState, string> = {
  idle: 'Bereit',
  connecting: 'Gespräch wird vorbereitet …',
  working: 'Der Wichtel hört zu …',
  asking: 'Du bist dran',
  recording: 'Aufnahme läuft · zum Senden loslassen',
  transcribing: 'Deine Antwort wird verstanden …',
  thinking: 'Der Wichtel denkt nach …',
  speaking: 'Der Wichtel spricht …',
  ended: 'Gespräch beendet',
  error: 'Ein Problem ist aufgetreten',
};

@Component({
  selector: 'app-ptt-session-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CharacterAvatar, LucideMic, LucidePause, LucidePlay, LucideX],
  template: `
    <header class="bar">
      <div>
        <h1>Dein Jahresrückblick</h1>
      </div>
    </header>

    @if (voice.error(); as message) {
      <p class="error" role="alert">{{ message }}</p>
    }

    <ls-character-avatar
      class="session-character"
      [state]="mapAvatarState(voice.state(), audioPlaying())"
      [mouthLevel]="mouthLevel()"
      label="Dein digitaler Weihnachtswichtel"
      loadingText="Der Wichtel wird geladen …"
    />
    <span class="session-state" [attr.data-state]="conversationPaused() ? 'paused' : voice.state()" aria-live="polite">{{ conversationPaused() ? 'Pausiert' : labels[voice.state()] }}</span>

    @if (voice.messages().length) {
      <section class="conversation" aria-label="Gesprächsverlauf" aria-live="polite">
        @for (message of voice.messages(); track message.guid) {
          <article class="message" [class.from-user]="message.fromUser">
            <header>{{ message.author }}</header>
            <p>
              @for (part of messageParts(message.text); track $index) {
                @if (part.href) {
                  @if (part.booking) {
                    <a class="booking-action" [href]="part.href" target="_blank" rel="noopener noreferrer">
                      Termin mit Thomas vereinbaren
                    </a>
                  } @else {
                    <a [href]="part.href" target="_blank" rel="noopener noreferrer">{{ part.text }}</a>
                  }
                } @else {
                  {{ part.text }}
                }
              }
            </p>
          </article>
        }
      </section>
    }

    @if (voice.state() === 'idle' || voice.state() === 'error') {
      <section class="start-panel">
        <p>Ich bin dein Weihnachtswichtel und freue mich, dich kennenzulernen. Gemeinsam blicken wir auf deine besonderen Momente in diesem Jahr, was dich beruflich bewegt hat und deine Wünsche für 2027.</p>
        <button type="button" class="primary" (click)="startConversation()">Gespräch beginnen</button>
      </section>
    }

    @if (voice.sessionId() && voice.state() !== 'ended') {
      <section class="controls" aria-label="Deine Antwort">
        <div class="ptt-control">
          <button
            type="button"
            class="ptt"
            [class.recording]="voice.state() === 'recording'"
            [disabled]="conversationPaused() || (voice.state() !== 'asking' && voice.state() !== 'recording') || audioPlaying()"
            [attr.aria-pressed]="voice.state() === 'recording'"
            [attr.aria-label]="voice.state() === 'recording' ? 'Loslassen zum Senden' : 'Zum Sprechen gedrückt halten'"
            [attr.title]="voice.state() === 'recording' ? 'Loslassen zum Senden' : 'Zum Sprechen gedrückt halten'"
            (pointerdown)="pressToTalk($event)"
            (pointerup)="releaseToTalk()"
            (pointercancel)="releaseToTalk()"
            (keydown)="onPttKeyDown($event)"
            (keyup)="onPttKeyUp($event)"
          >
            <svg lucideMic class="mic-icon" aria-hidden="true"></svg>
          </button>
          <span class="ptt-label" aria-live="polite">
            {{ voice.state() === 'recording' ? 'Loslassen zum Senden' : 'Zum Sprechen gedrückt halten' }}
          </span>
        </div>
        <button
          type="button"
          class="text-toggle"
          [disabled]="conversationPaused() || voice.state() !== 'asking'"
          [attr.aria-expanded]="showTextInput()"
          (click)="showTextInput.update((open) => !open)"
        >
          {{ showTextInput() ? 'Sprachaufnahme verwenden' : 'Per Text antworten' }}
        </button>
        @if (showTextInput()) {
          <form class="text-entry" (submit)="submitText($event)">
            <textarea
              [value]="typedText()"
              (input)="typedText.set($any($event.target).value)"
              [disabled]="conversationPaused() || voice.state() !== 'asking'"
              rows="2"
              aria-label="Textantwort"
              placeholder="Deine Antwort …"
            ></textarea>
            <button type="submit" class="secondary" [disabled]="conversationPaused() || voice.state() !== 'asking' || !typedText().trim()">
              Absenden
            </button>
          </form>
        }
        <div class="session-actions">
          <button type="button" class="secondary" [disabled]="voice.state() === 'recording' || voice.state() === 'transcribing'" [attr.aria-pressed]="conversationPaused()" (click)="togglePause()">
            @if (conversationPaused()) {
              <svg lucidePlay class="action-icon" aria-hidden="true"></svg>
              Fortsetzen
            } @else {
              <svg lucidePause class="action-icon" aria-hidden="true"></svg>
              Pause
            }
          </button>
          <button type="button" class="secondary cancel" (click)="abortConversation()">
            <svg lucideX class="action-icon" aria-hidden="true"></svg>
            Abbrechen
          </button>
        </div>
      </section>
    }

    <section class="audio-response" aria-label="Sprachantwort" [hidden]="!voice.audioUrl()">
      <audio #player (play)="onPlaybackStarted()" (pause)="onPlaybackPaused()" (ended)="finishPlayback()" (error)="onPlaybackBlocked()" aria-label="Antwort des Wichtels"></audio>
      @if (playbackBlocked()) {
        <button type="button" class="playback-button" (click)="playResponse()">
          <svg lucidePlay class="play-icon" aria-hidden="true"></svg>
          Antwort abspielen
        </button>
      }
    </section>

    @if (voice.state() === 'ended') {
      <footer class="bar ending">
        <span>Das Gespräch ist beendet.</span>
        <button type="button" class="primary" (click)="startConversation()">Noch einmal starten</button>
        <a routerLink="/">Zur Startseite</a>
      </footer>
    }
  `,
  styles: `
    :host { display:flex; flex-direction:column; gap:1rem; max-width:54rem; margin:0 auto; padding:1.4rem 0 2rem; }
    .bar { display:flex; align-items:center; justify-content:space-between; gap:1rem; flex-wrap:wrap; }
    h1 { margin:0; font-size:1.55rem; line-height:1.2; }
    a { color:#74c9f0; }
    .session-state { align-self:center; margin:-.45rem 0 .25rem; padding:.35rem .7rem; border:1px solid var(--ls-border); border-radius:.3rem; background:var(--ls-surface); color:var(--ls-muted); font-size:.76rem; }
    .session-state[data-state='asking'] { border-color:#219cf5; background:#18384d; color:#a8e3ff; }
    .error { margin:0; padding:.75rem 1rem; border:1px solid rgba(255,142,135,.45); border-radius:.35rem; background:rgba(91,34,39,.35); color:var(--ls-danger); }
    .session-character { display:block; width:min(100%,28rem); height:min(54svh,26rem); min-height:20rem; margin:-.3rem auto -.5rem; }
    .conversation { display:flex; flex-direction:column; gap:.75rem; min-height:2rem; }
    .message { max-width:82%; padding:.7rem .9rem; border:1px solid var(--ls-border); border-radius:.4rem; background:var(--ls-surface); }
    .message.from-user { align-self:flex-end; border-color:#219cf5; background:#193958; }
    .message header { margin-bottom:.2rem; color:#aebdd0; font-size:.72rem; font-weight:700; }
    .message a { color:#74c9f0; text-decoration:underline; text-underline-offset:.15em; }
    .message .booking-action,.session-actions button { display:inline-flex; align-items:center; margin-top:.4rem; padding:.45rem .7rem; border:1px solid #74c9f0; border-radius:.3rem; background:#18384d; color:#d5f1ff; font-weight:700; text-decoration:none; white-space:nowrap; }
    .message p,.controls p,.start-panel p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
    .controls { display:flex; flex-direction:column; align-items:stretch; gap:.75rem; padding:1rem; border:1px solid var(--ls-border); border-radius:.4rem; background:#172235; }
    .session-actions { display:flex; align-items:center; justify-content:center; gap:.6rem; flex-wrap:wrap; }
    .start-panel { display:flex; flex-direction:column; align-items:center; gap:1.25rem; max-width:38rem; margin:0 auto; text-align:center; }
    .start-panel p { color:var(--ls-muted); line-height:1.65; }
    .ptt-control { display:flex; flex-direction:column; align-items:center; gap:.55rem; }
    .ptt { display:grid; place-items:center; align-self:center; width:5rem; height:5rem; padding:0; border:1px solid #fff; border-radius:50%; background:#219cf5; color:#fff; touch-action:none; user-select:none; }
    .ptt.recording { background:#d83b48; }
    .mic-icon { display:block; width:1.5rem; height:1.5rem; }
    .ptt-label { color:var(--ls-muted); font-size:.88rem; line-height:1.35; text-align:center; }
    .text-entry { display:flex; align-items:flex-end; gap:.65rem; }
    .text-toggle { align-self:center; padding:.25rem .4rem; border:0; background:transparent; color:#a8e3ff; font-size:.86rem; text-decoration:underline; }
    textarea { flex:1; min-width:0; resize:vertical; padding:.7rem; border:1px solid #fff; border-radius:.35rem; background:#121826; color:var(--ls-text); font:inherit; }
    .primary,.secondary { border:1px solid #fff; border-radius:.35rem; background:#219cf5; color:#fff; font:inherit; font-weight:700; padding:.65rem 1rem; }
    .secondary { flex:none; }
    .session-actions .secondary { box-sizing:border-box; width:min(11rem,calc(50% - .3rem)); justify-content:center; }
    .session-actions .cancel { border-color:rgba(255,142,135,.6); background:transparent; color:#ffaaa4; }
    .action-icon,.play-icon { display:block; width:1rem; height:1rem; flex:none; }
    .ptt:disabled,.primary:disabled,.secondary:disabled { opacity:.5; }
    audio { display:none; }
    .playback-button { display:flex; align-items:center; justify-content:center; gap:.55rem; min-height:2.75rem; align-self:center; padding:.55rem .9rem; border:1px solid #fff; border-radius:.35rem; background:#219cf5; color:#fff; font:inherit; font-weight:700; }
    .ending { justify-content:flex-start; padding-top:1rem; border-top:1px solid var(--ls-border); }
    @media(min-width:641px) {
      .start-panel { text-align:left; }
    }
    @media(max-width:640px) { :host{padding-top:1rem} h1{font-size:1.35rem} .session-character{height:min(42svh,22rem);min-height:17rem} .message{max-width:96%} .text-entry{align-items:stretch;flex-direction:column} .secondary{align-self:flex-end} }
  `,
})
export class PttSessionPage implements OnDestroy {
  protected readonly voice = inject(PttVoiceService);
  protected readonly labels = STATE_LABELS;
  protected readonly mapAvatarState = mapAvatarState;
  protected readonly messageParts = messageParts;
  protected readonly typedText = signal('');
  protected readonly showTextInput = signal(false);
  protected readonly audioPlaying = signal(false);
  protected readonly conversationPaused = signal(false);
  protected readonly mouthLevel = signal(0);
  protected readonly playbackBlocked = signal(false);

  private readonly audioPlayer = viewChild<ElementRef<HTMLAudioElement>>('player');
  private audioContext: AudioContext | null = null;
  private audioSource: MediaElementAudioSourceNode | null = null;
  private audioAnalyser: AnalyserNode | null = null;
  private readonly audioSamples = new Uint8Array(512);
  private mouthFrameId = 0;
  private recorder: MediaRecorder | null = null;
  private recordingStream: MediaStream | null = null;
  private recordingChunks: BlobPart[] = [];
  private recordingTimer: ReturnType<typeof setTimeout> | null = null;
  private pressed = false;
  private discardRecording = false;
  private readonly audioEffect = effect(() => {
    const audioUrl = this.voice.audioUrl();
    const player = this.audioPlayer()?.nativeElement;
    if (!audioUrl || !player || player.src.endsWith(audioUrl)) return;
    player.src = new URL(audioUrl, location.origin).href;
    player.load();
    this.playbackBlocked.set(false);
    if (!this.conversationPaused()) void player.play().catch(() => this.onPlaybackBlocked());
  });

  protected async startConversation(): Promise<void> {
    this.showTextInput.set(false);
    this.conversationPaused.set(false);
    this.preparePlayback();
    await this.voice.start();
  }

  protected async pressToTalk(event: Event): Promise<void> {
    event.preventDefault();
    if (this.pressed || !this.voice.beginRecording()) return;
    this.pressed = true;
    const pointerEvent = event as PointerEvent;
    if (typeof pointerEvent.pointerId === 'number' && event.currentTarget instanceof HTMLElement) {
      try {
        event.currentTarget.setPointerCapture(pointerEvent.pointerId);
      } catch {
        // Pointer capture is optional; pointerup and pointercancel remain fallbacks.
      }
    }

    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Sprachaufnahme wird in diesem Browser nicht unterstützt. Nutze bitte die Texteingabe.');
      }
      this.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!this.pressed) {
        this.stopRecordingTracks();
        this.voice.cancelRecording();
        return;
      }

      const supportedType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
      this.recorder = new MediaRecorder(this.recordingStream, supportedType ? { mimeType: supportedType } : undefined);
      this.recordingChunks = [];
      this.recorder.addEventListener('dataavailable', (recordingEvent) => {
        if (recordingEvent.data.size > 0) this.recordingChunks.push(recordingEvent.data);
      });
      this.recorder.addEventListener('stop', () => {
        const blob = new Blob(this.recordingChunks, { type: this.recorder?.mimeType || 'audio/webm' });
        this.recordingChunks = [];
        this.recorder = null;
        this.stopRecordingTracks();
        const discard = this.discardRecording;
        this.discardRecording = false;
        if (!discard && blob.size > 0) void this.voice.submitAudio(blob);
        else this.voice.cancelRecording();
      }, { once: true });
      this.recorder.start(250);
      this.recordingTimer = setTimeout(() => {
        this.releaseToTalk();
        this.voice.setLocalError('Die Aufnahme wurde nach der erlaubten Höchstdauer beendet.');
      }, this.voice.maxRecordingSeconds() * 1000);
    } catch (error) {
      this.pressed = false;
      this.stopRecordingTracks();
      if (this.voice.state() === 'ended') return;
      this.voice.setLocalError(error instanceof Error ? error.message : 'Mikrofonzugriff nicht möglich.');
    }
  }

  protected releaseToTalk(): void {
    if (!this.pressed) return;
    this.pressed = false;
    if (this.recordingTimer) clearTimeout(this.recordingTimer);
    this.recordingTimer = null;
    if (this.recorder?.state === 'recording') this.recorder.stop();
    else this.voice.cancelRecording();
  }

  protected onPttKeyDown(event: KeyboardEvent): void {
    if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) void this.pressToTalk(event);
  }

  protected onPttKeyUp(event: KeyboardEvent): void {
    if (event.code === 'Space' || event.code === 'Enter') this.releaseToTalk();
  }

  protected async submitText(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (await this.voice.submitText(this.typedText())) {
      this.typedText.set('');
      this.showTextInput.set(false);
    }
  }

  protected finishPlayback(): void {
    this.audioPlaying.set(false);
    this.stopMouthTracking();
    this.voice.setPlaybackEnded();
  }

  protected onPlaybackStarted(): void {
    this.playbackBlocked.set(false);
    this.audioPlaying.set(true);
    this.voice.setPlaybackStarted();
    this.preparePlayback();
    this.updateMouth();
  }

  protected onPlaybackBlocked(): void {
    if (this.voice.state() === 'ended') return;
    this.playbackBlocked.set(true);
    this.audioPlaying.set(false);
    this.stopMouthTracking();
    this.voice.setPlaybackBlocked();
  }

  protected onPlaybackPaused(): void {
    if (this.voice.state() === 'ended') return;
    this.audioPlaying.set(false);
    this.stopMouthTracking();
  }

  protected togglePause(): void {
    const player = this.audioPlayer()?.nativeElement;
    if (!this.conversationPaused()) {
      this.conversationPaused.set(true);
      if (player && !player.paused) player.pause();
      return;
    }

    this.conversationPaused.set(false);
    if (player && this.voice.audioUrl() && player.paused) {
      this.preparePlayback();
      void player.play().catch(() => this.onPlaybackBlocked());
    }
  }

  protected abortConversation(): void {
    this.voice.abortSession();
    this.pressed = false;
    if (this.recordingTimer) clearTimeout(this.recordingTimer);
    this.recordingTimer = null;
    if (this.recorder) {
      this.discardRecording = true;
      if (this.recorder.state === 'recording') this.recorder.stop();
    }
    this.stopRecordingTracks();

    const player = this.audioPlayer()?.nativeElement;
    player?.pause();
    if (player) {
      player.removeAttribute('src');
      player.load();
    }
    this.audioPlaying.set(false);
    this.conversationPaused.set(false);
    this.playbackBlocked.set(false);
    this.stopMouthTracking();
  }

  protected playResponse(): void {
    const player = this.audioPlayer()?.nativeElement;
    if (!player) return;
    this.preparePlayback();
    void player.play().catch(() => this.onPlaybackBlocked());
  }

  ngOnDestroy(): void {
    this.releaseToTalk();
    this.voice.stop();
    this.stopRecordingTracks();
    this.stopMouthTracking();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      void this.audioContext.close();
    }
  }

  private preparePlayback(): void {
    const player = this.audioPlayer()?.nativeElement;
    if (!player || typeof AudioContext === 'undefined') return;

    try {
      this.audioContext ??= new AudioContext();
      this.audioAnalyser ??= this.audioContext.createAnalyser();
      this.audioAnalyser.fftSize = this.audioSamples.length;
      if (!this.audioSource) {
        this.audioSource = this.audioContext.createMediaElementSource(player);
        this.audioSource.connect(this.audioAnalyser);
        this.audioAnalyser.connect(this.audioContext.destination);
      }
      if (this.audioContext.state === 'suspended') void this.audioContext.resume().catch(() => undefined);
    } catch {
      this.audioAnalyser = null;
    }
  }

  private readonly updateMouth = (): void => {
    if (!this.audioPlaying() || !this.audioAnalyser) {
      this.mouthLevel.set(0);
      return;
    }

    this.audioAnalyser.getByteTimeDomainData(this.audioSamples);
    let power = 0;
    for (const sample of this.audioSamples) {
      const amplitude = (sample - 128) / 128;
      power += amplitude * amplitude;
    }
    const rms = Math.sqrt(power / this.audioSamples.length);
    this.mouthLevel.set(Math.min(1, Math.max(0, (rms - 0.02) * 8)));
    this.mouthFrameId = requestAnimationFrame(this.updateMouth);
  };

  private stopMouthTracking(): void {
    cancelAnimationFrame(this.mouthFrameId);
    this.mouthFrameId = 0;
    this.mouthLevel.set(0);
  }

  private stopRecordingTracks(): void {
    for (const track of this.recordingStream?.getTracks() ?? []) track.stop();
    this.recordingStream = null;
  }
}
