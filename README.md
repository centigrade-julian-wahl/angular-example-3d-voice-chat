# LeanScope Agent Kit – Quickstart for Angular Devs

Fork this repository to build a minimum viable Angular app on LeanScope. A coding agent with the
**LeanScope Agent Kit** helps you pick or model a choreo and build screens around it. The app runs
the choreo through the **LeanScope Agent Server**.

```
 While you build                              While the app runs
 ───────────────                              ──────────────────
 Coding agent (Claude Code, …)                This Angular app
   └─ LeanScope Agent Kit plugin                └─ LeanScopeSessionService
        └─ LeanScope MCP Server                      └─ LeanScope Agent Server (REST + SSE)
             (models, test-runs and reads             (runs the choreo: AI personas
              your choreos)                            talk with your user)
```

A **choreo** is a LeanScope Scenario that the agent server plays out as a conversation between AI
personas and the user. Out of the box the app starts a session of one choreo, shows the
conversation and renders a form for each question. Your MVP screens go on top of that.

## What you need

- Node.js 22.22.3+, 24.15+ or 26+ (`nvm use` reads `.nvmrc`)
- A LeanScope **personal team-repos access token**: https://app.leanscope.ai/ → your avatar
  (top-right)
- An OpenAI, Anthropic or Mistral API key. Sessions run on your own key.
- Optional: a TypeSafe API key, if your choreo has 🎯 Decision Model steps.
- A coding agent. Claude Code is set up already; other clients are covered below.

## Get started

1. **Create your copy:** click **Use this template** on GitHub (or fork), then clone it.
2. **Install:** `npm install`
3. **Put your secrets into `.env`.** Copy `.env.example` to `.env` and fill in the token and an
   LLM key yourself, not through the agent. `.env` is gitignored and is the one place for them:
   both the app and the coding agent's MCP servers use it. Leave `LEANSCOPE_CHOREO_SCENARIO_GUID`
   empty for now: your agent tells you its value in step 5.
4. **Connect your coding agent.** Open the folder in Claude Code (CLI or the VS Code extension).
   `.claude/settings.json` enables the Agent Kit plugin.
   - Accept the plugin install when the session starts. (If it asks for the token, you can leave
     the fields empty: the next step fills them.)
   - Run `npm run connect:claude`. It stores the values from `.env` in the plugin's settings (your
     OS keychain) without printing them. Run it again whenever you change `.env`.
   - Start a new session. `/mcp` should now list `leanscope-admin`, `leanscope-graphql` and
     `leanscope-agents`, all connected.
5. **Ask your agent:**
   > Set up LeanScope in this project and help me build an MVP for my choreo.

   It follows [AGENTS.md](AGENTS.md):
   1. connect
   2. pick or model a choreo, and tell you its guid for `LEANSCOPE_CHOREO_SCENARIO_GUID` in `.env`
   3. test-run it
   4. propose screens
   5. build them
6. **Run:** `npm start`, then open http://localhost:4200 and click **Start session**. Saving `.env`
   while it runs restarts the dev server with the new values.

## Project layout

```
.env.example                   names of your secrets and the choreo guid; copy to .env
                               (gitignored) and fill in
.claude/settings.json          enables the LeanScope Agent Kit plugin for Claude Code
AGENTS.md, CLAUDE.md           instructions and workflow for coding agents
src/environments/
  environment.ts               agent server URL, locale (committed); choreo guid and secrets
                               from .env are added at build time
src/app/leanscope/             the LeanScope client: keep it generic
  leanscope-session.service.ts   start a session, follow it, answer questions (signals)
  agent-server.types.ts          request/response and frame types of the Agent Server
  sse-parser.ts                  reads the SSE event stream
  answer-fields.ts               turns a question's JSON Schema into form fields
  ui/transcript.ts               <ls-transcript>: the conversation
  ui/pending-step-form.ts        <ls-pending-step-form>: the form for the open question
src/app/pages/                 home and session pages
src/app/features/              your MVP's screens
```

## Use the session in your own screens

```ts
@Component({ /* … */ })
export class OnboardingPage {
  protected readonly session = inject(LeanScopeSessionService);

  // session.state()            'idle' | 'connecting' | 'waiting' | 'working' | 'asking' | 'ended' | 'error'
  // session.steps()            the conversation so far
  // session.pendingQuestion()  what the session asks right now (question text + JSON Schema)
  // session.error(), session.endReason()

  start() { return this.session.start({ initialInput: { company: 'ACME' } }); }
  answer(value: Record<string, unknown>) { return this.session.submit(value); }
}
```

`session.onFrame(frame => …)` passes on every SSE frame, including the ones the service doesn't
handle (`inventory`, `tool_activity`, `tts_audio`, …). The full API is in the
[Agent Server docs](https://dev.api.agents.leanscope.ai/api/v1/docs).

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Dev server on http://localhost:4200 |
| `npm test -- --watch=false` | Unit tests (Vitest) |
| `npm run build` | Production build into `dist/` |
| `npm run connect:claude` | Stores the secrets from `.env` in the Agent Kit plugin in Claude Code |

## Security: development only

The token and LLM keys from `.env` are compiled into the JavaScript the browser loads,
so anyone who can open the app can read them. Keep it on your machine. Before you deploy, move the
secrets into a small backend that creates the session (`POST /api/v1/sessions`) and hands only the
`sessionToken` / `controllerUrl` to the browser. The session routes don't need the token.

## Other coding agents

The plugin setup above is for Claude Code. For other clients, run the Agent Kit's setup script:

```sh
npx -y github:leanscope/leanscope-agent-kit --clients vscode        # GitHub Copilot in VS Code
npx -y github:leanscope/leanscope-agent-kit --clients copilot-cli
npx -y github:leanscope/leanscope-agent-kit --clients codex
npx -y github:leanscope/leanscope-agent-kit --clients cursor
```

To diagnose a connection: `npx -y github:leanscope/leanscope-agent-kit --check --clients <client>`.
Details are in the [Agent Kit README](https://github.com/leanscope/leanscope-agent-kit).

## License

[MIT](LICENSE)
