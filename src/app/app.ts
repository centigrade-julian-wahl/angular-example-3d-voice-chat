import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <main>
      <router-outlet />
    </main>
    <footer class="attribution">
      <span>presented by</span>
      <a routerLink="/" class="footer-brand" aria-label="Centigrade">
        <img
          class="footer-logo"
          src="/centigrade-logo-transparent.png"
          alt="Centigrade"
        />
      </a>
    </footer>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      min-height: 100svh;
      background:
        linear-gradient(160deg, rgba(33, 54, 80, 0.3), transparent 44%),
        #121826;
      color: var(--ls-text);
    }
    main {
      flex: 1 0 auto;
      width: min(100%, 88rem);
      margin: 0 auto;
      padding: 0 3rem;
    }
    .attribution {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.55rem;
      padding: 1rem 1.25rem 1.2rem;
      border-top: 1px solid rgba(183, 195, 210, 0.14);
      color: #b7c3d2;
      font-size: 0.68rem;
    }
    .footer-logo {
      display: block;
      width: min(9rem, 38vw);
      height: 2.15rem;
      border-radius: 0.2rem;
      background: transparent;
      object-fit: cover;
      object-position: center;
    }
    .footer-brand {
      display: block;
      text-decoration: none;
    }
    @media (max-width: 640px) {
      main {
        padding: 0 1.25rem;
      }
    }
  `,
})
export class App {}
