import { InjectionToken, makeEnvironmentProviders, type EnvironmentProviders } from '@angular/core';
import type { ApiKeyVendor } from './agent-server.types';

/** The secrets part of the configuration (from `.env`, see `.env.example`). */
export interface LeanScopeSecrets {
  /** LeanScope personal team-repos access token. Sent as `Authorization: Bearer …`. */
  accessToken: string;
  /** Your own keys. At least one of openai / anthropic / mistral; typesafe for 🎯 Decision Model steps. */
  apiKeys: Partial<Record<ApiKeyVendor, string>>;
}

/** Everything the app reads from `.env`: the secrets plus the choreo to run. */
export interface LeanScopeEnv extends LeanScopeSecrets {
  /** The `_guid` of the choreo to run (LEANSCOPE_CHOREO_SCENARIO_GUID). */
  choreoScenarioGuid: string;
}

export interface LeanScopeConfig extends LeanScopeEnv {
  /** Base URL of the LeanScope Agent Server, without `/api/v1`. */
  agentServerUrl: string;
  locale?: string;
}

export const LEANSCOPE_CONFIG = new InjectionToken<LeanScopeConfig>('LEANSCOPE_CONFIG');

/** `fetch`, injectable so tests can replace it. */
export const LEANSCOPE_FETCH = new InjectionToken<typeof fetch>('LEANSCOPE_FETCH', {
  providedIn: 'root',
  factory: () => (input, init) => fetch(input, init),
});

export function provideLeanScope(config: LeanScopeConfig): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: LEANSCOPE_CONFIG, useValue: config }]);
}

const LLM_VENDORS: ApiKeyVendor[] = ['openai', 'anthropic', 'mistral'];

/** What is missing before a session can start, as hints for the user. Empty when ready. */
export function missingConfig(config: LeanScopeConfig): string[] {
  const missing: string[] = [];
  if (!config.agentServerUrl.trim()) {
    missing.push('agentServerUrl in src/environments/environment.ts');
  }
  if (!config.choreoScenarioGuid.trim()) {
    missing.push('LEANSCOPE_CHOREO_SCENARIO_GUID in .env');
  }
  if (!config.accessToken.trim()) {
    missing.push('LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN in .env');
  }
  if (!LLM_VENDORS.some((vendor) => config.apiKeys[vendor]?.trim())) {
    missing.push(
      'LEANSCOPE_OPENAI_API_KEY, LEANSCOPE_ANTHROPIC_API_KEY or LEANSCOPE_MISTRAL_API_KEY in .env',
    );
  }
  return missing;
}

/** The API keys with empty values left out (the server rejects empty strings). */
export function nonEmptyApiKeys(
  apiKeys: LeanScopeSecrets['apiKeys'],
): Partial<Record<ApiKeyVendor, string>> {
  return Object.fromEntries(
    Object.entries(apiKeys)
      .map(([vendor, key]) => [vendor, key?.trim()])
      .filter(([, key]) => key),
  );
}
