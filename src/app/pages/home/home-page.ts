import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LEANSCOPE_CONFIG, missingConfig } from '../../leanscope/leanscope.config';

/** Start page: shows whether the app is configured and starts a session. */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <h1>Your LeanScope MVP starts here</h1>
    <p>
      This app runs a LeanScope choreo through the Agent Server and shows the conversation. Ask your
      coding agent to build your MVP screens around it.
    </p>

    @if (missing.length === 0) {
      <p>
        Choreo: <code>{{ config.choreoScenarioGuid }}</code>
      </p>
      <a class="button" routerLink="/session">Start session</a>
    } @else {
      <section class="setup" aria-labelledby="setup-title">
        <h2 id="setup-title">Finish the setup</h2>
        <p>Still missing:</p>
        <ul>
          @for (item of missing; track item) {
            <li>{{ item }}</li>
          }
        </ul>
        <p>
          Don't know your choreo's guid? Ask your coding agent:
          <em>"Show me the choreos in my LeanScope repository."</em>
        </p>
      </section>
    }
  `,
  styles: `
    .setup {
      padding: 1rem;
      border-radius: 0.75rem;
      background: var(--ls-surface);
    }
    .setup h2 {
      margin-top: 0;
    }
  `,
})
export class HomePage {
  protected readonly config = inject(LEANSCOPE_CONFIG);
  protected readonly missing = missingConfig(this.config);
}
