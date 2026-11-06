# Features

Your MVP's screens go here, one folder per feature (e.g. `features/onboarding/`). Register their
routes in `src/app/app.routes.ts`.

Run sessions through `LeanScopeSessionService` (`src/app/leanscope/`). Don't call the agent server
directly from a feature. Reuse `ls-transcript` and `ls-pending-step-form`, or build your own views
on the service's signals (`state`, `steps`, `pendingQuestion`, `error`, `endReason`).
