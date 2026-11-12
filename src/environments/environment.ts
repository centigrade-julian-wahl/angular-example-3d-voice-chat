// Public browser configuration only. All secrets and LeanScope session creation stay on the backend.

import type { LeanScopeConfig, LeanScopeEnv } from '../app/leanscope/leanscope.config';

const fromEnv: LeanScopeEnv = { choreoScenarioGuid: '', accessToken: '', apiKeys: {} };

export const environment: { leanscope: LeanScopeConfig } = {
  leanscope: {
    /** The LeanScope Agent Server (REST + SSE). API docs: <agentServerUrl>/api/v1/docs */
    agentServerUrl: 'https://dev.api.agents.leanscope.ai',

    /** Language the session speaks, e.g. 'en' or 'de'. */
    locale: 'en',

    ...fromEnv,
  },
};
