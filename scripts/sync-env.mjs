// Your LeanScope secrets (and the choreo guid) live in ONE place: the gitignored `.env` in the project root (names as in
// `.env.example`, the same the LeanScope Agent Kit uses). They reach:
//
//   - the Angular app: `scripts/run-ng.mjs` passes them to `ng serve` / `ng build` as the
//     build-time constant LEANSCOPE_SECRETS (see src/environments/environment.ts). No file is
//     written.
//   - the coding agent's MCP servers: `node scripts/sync-env.mjs --claude` (npm run
//     connect:claude) stores them in the Agent Kit plugin's settings in Claude Code (OS keychain).
//
// Run without options, it lists which names are set. It never prints a secret.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_FILE = join(root, '.env');
const PLUGIN = 'leanscope-agent-kit@leanscope';

/** `.env` name → the plugin's option id. */
const SECRETS = [
  { env: 'LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN', plugin: 'token' },
  { env: 'LEANSCOPE_OPENAI_API_KEY', plugin: 'openai' },
  { env: 'LEANSCOPE_ANTHROPIC_API_KEY', plugin: 'anthropic' },
  { env: 'LEANSCOPE_MISTRAL_API_KEY', plugin: 'mistral' },
  { env: 'LEANSCOPE_ELEVENLABS_API_KEY', plugin: 'elevenlabs' },
  { env: 'LEANSCOPE_TYPESAFE_API_KEY', plugin: 'typesafe' },
];

/** Reads `KEY=value` lines (optional `export `, quotes and `#` comments). Missing file → {}. */
export function readEnvFile(file = ENV_FILE) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2];
    const quoted = value.match(/^(['"])(.*)\1$/);
    if (quoted) value = quoted[2];
    else value = value.replace(/\s+#.*$/, '').trim();
    values[match[1]] = value;
  }
  return values;
}

/** `.env` names the app uses besides the secrets. Not stored in the plugin. */
const APP_SETTINGS = ['LEANSCOPE_CHOREO_SCENARIO_GUID'];

/**
 * The `.env` values for the app, in the shape of `LeanScopeEnv`
 * (src/app/leanscope/leanscope.config.ts).
 */
export function appSecrets(env = readEnvFile()) {
  return {
    choreoScenarioGuid: env['LEANSCOPE_CHOREO_SCENARIO_GUID'] ?? '',
    accessToken: env['LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN'] ?? '',
    apiKeys: {
      openai: env['LEANSCOPE_OPENAI_API_KEY'] ?? '',
      anthropic: env['LEANSCOPE_ANTHROPIC_API_KEY'] ?? '',
      mistral: env['LEANSCOPE_MISTRAL_API_KEY'] ?? '',
      elevenlabs: env['LEANSCOPE_ELEVENLABS_API_KEY'] ?? '',
      typesafe: env['LEANSCOPE_TYPESAFE_API_KEY'] ?? '',
    },
  };
}

/** One line saying which names are set, for the console. Never a value. */
export function describeEnv(env = readEnvFile()) {
  if (!existsSync(ENV_FILE)) {
    return 'No .env yet: copy .env.example to .env and fill in your choreo guid, LeanScope token and an LLM key.';
  }
  const set = [...APP_SETTINGS, ...SECRETS.map((s) => s.env)].filter((name) => env[name]);
  return `Values from .env: ${set.length ? set.join(', ') : 'none set'}.`;
}

/** The Claude Code CLI: `claude` on the PATH, else the one bundled with the VS Code extension. */
function findClaude() {
  try {
    execFileSync('claude', ['--version'], { stdio: 'ignore' });
    return 'claude';
  } catch {
    // not on the PATH
  }
  const binary = process.platform === 'win32' ? 'claude.exe' : 'claude';
  for (const editor of ['.vscode', '.vscode-insiders', '.cursor']) {
    const dir = join(homedir(), editor, 'extensions');
    if (!existsSync(dir)) continue;
    const newest = readdirSync(dir)
      .filter((name) => name.startsWith('anthropic.claude-code-'))
      .map((name) => join(dir, name, 'resources', 'native-binary', binary))
      .filter((path) => existsSync(path))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .pop();
    if (newest) return newest;
  }
  return null;
}

/** Stores the `.env` values in the plugin's settings. Empty names keep their stored value. */
function configureClaude(env) {
  const values = Object.fromEntries(
    SECRETS.filter((s) => env[s.env]).map((s) => [s.plugin, env[s.env]]),
  );
  if (!values['token']) {
    console.error('LEANSCOPE_PERSONAL_TEAM_REPOS_ACCESS_TOKEN is not set in .env.');
    return 1;
  }
  const claude = findClaude();
  if (!claude) {
    console.error(
      `Claude Code CLI not found. Install it (https://code.claude.com) or run /plugin configure ${PLUGIN} in a Claude Code session.`,
    );
    return 1;
  }
  const result = spawnSync(claude, ['plugin', 'configure', PLUGIN, '--values-stdin'], {
    input: JSON.stringify(values),
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    console.error(`Could not configure ${PLUGIN}: ${(result.stderr || result.stdout).trim()}`);
    console.error(
      `Is the plugin installed? Start a Claude Code session in this folder and accept the install, or run:\n  "${claude}" plugin install ${PLUGIN} --scope project`,
    );
    return 1;
  }
  console.log(`Stored in Claude Code (${PLUGIN}): ${Object.keys(values).join(', ')}.`);
  console.log(
    'Start a new Claude Code session (or reload the window) so the LeanScope MCP servers use them.',
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = readEnvFile();
  console.log(describeEnv(env));
  if (process.argv.includes('--claude')) process.exit(configureClaude(env));
}
