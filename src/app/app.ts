import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="top">
      <a routerLink="/" class="brand">LeanScope MVP</a>
    </header>
    <main>
      <router-outlet />
    </main>
  `,
  styles: `
    .top {
      padding: 0.75rem 1.5rem;
      border-bottom: 1px solid var(--ls-border);
    }
    .brand {
      font-weight: 700;
      color: inherit;
      text-decoration: none;
    }
    main {
      max-width: 52rem;
      margin: 0 auto;
      padding: 1.5rem;
    }
  `,
})
export class App {}
