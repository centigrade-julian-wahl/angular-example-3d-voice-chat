import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CharacterAvatar } from '../../features/character/character-avatar';

/** Landing page behind the QR code on the Christmas card. */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CharacterAvatar],
  template: `
    <section class="welcome" aria-labelledby="welcome-title">
      <div class="hero-copy">
        <p class="eyebrow"><span class="dot"></span> EIN DIGITALER WEIHNACHTSGRUSS</p>
        <h1 id="welcome-title">Unwrap<br />the Future<span>.</span></h1>
        <p class="intro">
          Unser digitaler Weihnachtswichtel hat ein Upgrade erhalten. Blick mit ihm auf dein Jahr
          2026 zurück und wirf einen Blick auf das kommende Jahr.
        </p>
      </div>

      <figure class="stage">
        <ls-character-avatar
          label="Dein digitaler Weihnachtswichtel"
          loadingText="Der Wichtel wird geladen …"
        />
        <figcaption>
          <span class="name">DEIN DIGITALER WEIHNACHTSWICHTEL</span>
          <span class="line">„Ich bin ganz Ohr.“</span>
        </figcaption>
      </figure>

      <div class="interaction">
        <p class="mic-note">Mikrofon erlauben oder per Text starten</p>
        <button class="start" type="button" (click)="startConversation()">
          <span>Gespräch starten</span>
          <span class="mark" aria-hidden="true">→</span>
        </button>
      </div>

      <footer class="footer">
        <span>Wir wünschen dir und deiner Familie ein schönes Weihnachtsfest</span>
        <span class="rule" aria-hidden="true"></span>
        <span>und einen guten Start in 2027.</span>
      </footer>
    </section>
  `,
  styles: `
    :host {
      display: block;
    }
    .welcome {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr) auto auto;
      align-items: center;
      min-height: calc(100svh - 4.5rem);
      padding: 1.2rem 0 1.1rem;
      text-align: center;
    }
    .hero-copy {
      max-width: 48rem;
      margin: 0 auto;
      animation: rise-in 650ms ease-out both;
    }
    .eyebrow {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.7rem;
      margin: 0 0 0.65rem;
      color: #58bce9;
      font-size: 0.7rem;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .dot {
      width: 0.45rem;
      height: 0.45rem;
      border-radius: 50%;
      background: var(--ls-accent);
      box-shadow: 0 0 0 4px rgba(45, 164, 220, 0.15);
    }
    h1 {
      margin: 0;
      font-size: 4.2rem;
      line-height: 0.96;
    }
    h1 span {
      color: var(--ls-accent);
    }
    .intro {
      max-width: 42rem;
      margin: 0.9rem auto 0;
      color: #c1ccda;
      line-height: 1.6;
    }
    .stage {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 0;
      margin: 0;
      animation: appear 900ms ease-out both;
    }
    .stage ls-character-avatar {
      display: block;
      width: min(100%, 29rem);
      height: min(43svh, 28rem);
      min-height: 19rem;
    }
    figcaption {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.15rem;
      margin-top: -0.5rem;
    }
    .name {
      color: #77c9ee;
      font-size: 0.66rem;
      font-weight: 700;
      letter-spacing: 0.12em;
    }
    .line {
      font-style: italic;
    }
    .interaction {
      padding-top: 0.4rem;
      animation: rise-in 700ms ease-out 120ms both;
    }
    .mic-note {
      margin: 0 0 0.7rem;
      color: #d0d9e5;
      font-size: 0.85rem;
    }
    .start {
      display: inline-flex;
      align-items: center;
      justify-content: space-between;
      gap: 2rem;
      min-width: 17rem;
      min-height: 3.25rem;
      padding: 0.4rem 0.5rem 0.4rem 1.2rem;
      border: 1px solid #50b9e8;
      border-radius: 0.4rem;
      color: #081522;
      font-size: 0.9rem;
      font-weight: 700;
    }
    .mark {
      display: grid;
      flex: none;
      place-items: center;
      width: 2.35rem;
      height: 2.35rem;
      border-radius: 0.25rem;
      background: #1687bf;
      color: #fff;
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.85rem;
      margin-top: 0.9rem;
      color: #9eacbd;
      font-size: 0.68rem;
    }
    .rule {
      width: 1.5rem;
      height: 1px;
      background: var(--ls-accent);
    }
    @keyframes rise-in {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes appear {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @media (max-width: 760px) {
      .welcome {
        min-height: calc(100svh - 4rem);
        padding: 1.35rem 0 1rem;
      }
      h1 {
        font-size: 3.2rem;
      }
      .intro {
        font-size: 0.9rem;
      }
      .stage ls-character-avatar {
        width: min(100%, 23rem);
        height: min(34svh, 19rem);
        min-height: 15rem;
      }
      .footer {
        flex-wrap: wrap;
        gap: 0.5rem;
        font-size: 0.62rem;
      }
      .rule {
        display: none;
      }
    }
    @media (max-width: 390px) {
      h1 {
        font-size: 2.85rem;
      }
      .stage ls-character-avatar {
        min-height: 13.5rem;
      }
      .start {
        min-width: min(17rem, 100%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .hero-copy,
      .stage,
      .interaction {
        animation: none;
      }
    }
  `,
})
export class HomePage {
  private readonly router = inject(Router);

  startConversation(): void {
    void this.router.navigateByUrl('/session');
  }
}
