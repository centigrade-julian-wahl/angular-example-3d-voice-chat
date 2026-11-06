// App configuration that is safe to commit. Secrets live in `.env` (gitignored, see `.env.example`).
//
// The choreo guid is in `.env` too (LEANSCOPE_CHOREO_SCENARIO_GUID): it depends on your repository.
//
// Coding agents: you may edit this file. Never open, print or edit `.env`.

import type { LeanScopeConfig, LeanScopeEnv } from '../app/leanscope/leanscope.config';

/**
 * Your values from `.env` (secrets and choreo guid). `npm start` and `npm run build` put them in at build time (see
 * scripts/run-ng.mjs); in tests and plain `ng` commands they are undefined, so the app starts
 * with empty values and the home page lists what's missing.
 */
declare const LEANSCOPE_SECRETS: LeanScopeEnv | undefined;

const fromEnv: LeanScopeEnv =
  typeof LEANSCOPE_SECRETS === 'undefined'
    ? { choreoScenarioGuid: '', accessToken: '', apiKeys: {} }
    : LEANSCOPE_SECRETS;

export const environment: { leanscope: LeanScopeConfig } = {
  leanscope: {
    /** The LeanScope Agent Server (REST + SSE). API docs: <agentServerUrl>/api/v1/docs */
    agentServerUrl: 'https://dev.api.agents.leanscope.ai',

    /** Language the session speaks, e.g. 'en' or 'de'. */
    locale: 'en',

    ...fromEnv,
  },
};
