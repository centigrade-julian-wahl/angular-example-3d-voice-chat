# Release notes

## 0.1.2 — 2026-10-31

- **The choreo guid moved to `.env`.** Set `LEANSCOPE_CHOREO_SCENARIO_GUID` in `.env` instead of
  `choreoScenarioGuid` in `src/environments/environment.ts`, so your choreo stays local and isn't
  committed. `npm start` and `npm run build` pass it in with the secrets.
  - **Update your `.env`:** add `LEANSCOPE_CHOREO_SCENARIO_GUID=<your choreo's _guid>`. Until then
    the home page lists it as missing.

## 0.1.1 — 2026-10-30

- **The question is no longer shown twice.** The answer form shows only the input; the question is
  the persona's last message in the conversation above it.
- **Your answers read as text.** The conversation unwraps the server's answer envelope
  (`kind` / `schema` / `data`) and shows just what you wrote; a picked choice shows its label.

## 0.1.0 — 2026-10-30

The first version of the template: fork it to build an Angular MVP on a LeanScope choreo.

- **Angular 22 app that runs a choreo.** `LeanScopeSessionService` creates a session on the
  LeanScope Agent Server, follows its event stream and answers its questions; the state is exposed
  as signals. The session page shows the conversation (`ls-transcript`) and a form for each
  question, built from the question's JSON Schema (`ls-pending-step-form`). The home page lists
  what's still missing in the setup.
- **The LeanScope Agent Kit is enabled for Claude Code.** `.claude/settings.json` enables
  `leanscope-agent-kit@leanscope`. Claude Code offers to install it when a session starts in the
  project, with its skills and the three LeanScope MCP servers.
- **A guided workflow for coding agents.** `AGENTS.md` (imported by `CLAUDE.md`) takes the agent
  from connecting to the first MVP screens: pick or model a choreo, test-run it, propose screens,
  build them under `src/app/features/`.
- **One place for your secrets: `.env`.** Copy `.env.example` to `.env` and fill it in; it uses
  the same names as the Agent Kit. `npm start` and `npm run build` hand the values to the app at
  build time. Saving `.env` while `npm start` runs restarts the dev server with the new values.
  `npm run connect:claude` stores the same values in the Agent Kit plugin's settings (OS keychain)
  for the MCP servers. No script ever prints a value.
  - **Development only:** the token and keys end up in the browser bundle. Don't deploy this setup.
- **Works with older Node too.** If the active Node.js is too old for Angular 22, the npm scripts
  use the newest suitable version installed with nvm.
- **CI** runs the tests and the build on every push and pull request, without secrets.
