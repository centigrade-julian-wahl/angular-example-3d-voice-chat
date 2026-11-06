# Agent instructions

This repository is a starter for an Angular MVP on LeanScope. The user forked it to build their own
app. Help them get from "connected" to "first working MVP screens".

## How the pieces fit

- **While you build (you):** the **LeanScope Agent Kit** plugin gives you skills and three MCP
  servers (`leanscope-admin`, `leanscope-graphql`, `leanscope-agents`, all on the LeanScope MCP
  Server). Use them to find or model a choreo, test-run it, and read the personas and user stories
  behind it.
- **While the app runs:** the Angular app talks to the **LeanScope Agent Server** REST + SSE API
  through `LeanScopeSessionService` (`src/app/leanscope/`). The app never calls the MCP servers.

A **choreo** is a LeanScope Scenario that the agent server runs as a conversation between AI
personas and the user. The app starts a session of one choreo and shows it.

## Workflow

Go through these steps in order. Skip the ones that are already done, and tell the user which step
you're on.

1. **Connect.** Run the `leanscope-quickstart` skill. It checks the MCP servers and finds the
   repository from the user's token. Never ask the user for a repository id.
   - If the `leanscope-*` servers are missing: the plugin isn't installed yet. In Claude Code the
     user accepts the plugin prompt when a session starts in this folder (`.claude/settings.json`
     enables it), then starts a new session.
2. **Pick the choreo.** List the choreos in the repository and let the user pick one, or create one
   with the `model-a-choreo` skill when the user describes a new use case.
3. **Configure the app.** Ask the user to copy `.env.example` to `.env` and fill in the choreo's
   `_guid` (`LEANSCOPE_CHOREO_SCENARIO_GUID`; give them the value), their token and an LLM key
   themselves (see "Secrets"). Don't hardcode the guid in `src/environments/environment.ts`: it
   depends on the user's repository.
4. **Test-run it.** Run the choreo once with the `run-a-choreo` skill, so you and the user know
   what it asks and in which order before building screens.
5. **Plan the MVP.** Read the Scenario, its ScenarioSteps, Personas and UserStories through
   `leanscope-graphql` (`search_schema`, then `query_graphql`; never assume a field exists). From
   them, propose a short list of screens: what the user sees, what each one asks, which step of the
   choreo feeds it. Get the user's OK before building.
6. **Build.** Put each feature under `src/app/features/<feature>/` and add its route in
   `src/app/app.routes.ts`. Drive the session through `LeanScopeSessionService`. Then run
   `npm start` and ask the user to try it at http://localhost:4200.
7. **Optional: a worker.** If a choreo step needs the user's own code to run on the server side
   (call an API, compute something), use the `write-a-worker` skill and put the worker in
   `leanscope-worker/`.

## Secrets

- The user's secrets and the choreo guid live in `.env` only (names in `.env.example`). Never open, read, print or edit
  `.env`, not even to check a value. If you need to know which names are set, run
  `node scripts/sync-env.mjs`: it lists names, never values. The home page of the running app also
  lists what's missing.
- `npm start` and `npm run build` pass the secrets to Angular at build time
  (`LEANSCOPE_SECRETS` in `src/environments/environment.ts`). Don't add another way to load them.
- Your own MCP servers get the same secrets when the user runs `npm run connect:claude`. If the
  `leanscope-*` servers reject the token, ask the user to fix `.env`, run that command and start a
  new session. Never ask them to paste a token into the chat.
- Never commit `.env`. `.gitignore` already excludes it.
- Never put a token or key into `environment.ts`, a component, a test or a commit message.
- The token and keys end up in the browser bundle. This is fine for local development only. If the
  user wants to deploy, tell them a small backend has to hold the secrets and create the sessions
  first. Don't deploy this setup as-is.
- Don't add a `.mcp.json` at the repository root: the plugin brings the servers, and a root file
  would register them twice in VS Code and Copilot.

## Angular conventions

- Angular 22, standalone components, zoneless, signals.
- Use `ChangeDetectionStrategy.OnPush`, `input()` / `output()`, `inject()` and the built-in control
  flow (`@if`, `@for`, `@switch`).
- Use reactive forms for forms. The `ls-pending-step-form` component renders any pending question
  and is a good start.
- No UI library is installed. Add one only if the user asks for it.
- Keep `src/app/leanscope/` generic, so it can be updated from the template later. Put
  app-specific code in `src/app/features/`.
- Before you say you're done, run `npm test -- --watch=false` and `npm run build`. Both must pass.

## Agent Server API, in brief

`LeanScopeSessionService` already covers these routes. Read `src/app/leanscope/agent-server.types.ts`
for the shapes. Full docs: https://dev.api.agents.leanscope.ai/api/v1/docs

| Call | What it does |
|---|---|
| `POST /api/v1/sessions` (Bearer token) | Creates a session → `sessionToken`, `controllerUrl`, `uiUrl` |
| `GET {controllerUrl}/history` | The steps recorded before the app connected |
| `GET {controllerUrl}/events` | SSE stream: `step`, `gate`, `session_ending`, `error`, … |
| `GET {controllerUrl}/steps/pending` | What the session asks right now, with a JSON Schema |
| `POST {controllerUrl}/submit` | Answers the pending question with JSON matching that schema |

Only `POST /api/v1/sessions` needs the token. The session routes are authorized by the
`sessionToken` in the URL.
