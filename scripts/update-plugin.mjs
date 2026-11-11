// Pulls the newest LeanScope Agent Kit plugin into every coding agent on this machine that has it
// (npm run update:plugin). It looks for each client and skips the ones it doesn't find:
//
//   - Claude Code: refreshes the `leanscope` marketplace and updates the plugin for this project.
//     Claude Code also does this on startup (`autoUpdate` in .claude/settings.json).
//   - GitHub Copilot in VS Code and Cursor: they keep the plugin as a git clone
//     (~/.vscode/agent-plugins/…, ~/.cursor/plugins/local/…) and never update it. This pulls it.
//   - Copilot CLI and Codex: no update command to call, so it prints what to run.
//
//   node scripts/update-plugin.mjs [--clients claude-code,vscode,cursor,copilot-cli,codex]
//
// Then reload the window or start a new session in each client.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findClaude } from './sync-env.mjs';

const PLUGIN = 'leanscope-agent-kit@leanscope';
const REPO = 'leanscope/leanscope-agent-kit';
/** Git remotes of the kit, old and new name. */
const KIT_REMOTE = /github\.com[/:]leanscope\/(leanscope-)?agent-kit(\.git)?$/i;

const home = homedir();

/** True if `command` runs from the PATH. */
function onPath(command) {
  try {
    execFileSync(command, ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Git clones of the kit directly inside `dirs` or one level below (`<owner>/<repo>`). */
function kitClones(dirs) {
  const candidates = [];
  for (const dir of dirs.filter((d) => existsSync(d))) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const path = join(dir, entry.name);
      candidates.push(path);
      for (const sub of readdirSync(path, { withFileTypes: true })) {
        if (sub.isDirectory()) candidates.push(join(path, sub.name));
      }
    }
  }
  return candidates.filter((path) => {
    if (!existsSync(join(path, '.git'))) return false;
    const remote = spawnSync('git', ['-C', path, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
    });
    return remote.status === 0 && KIT_REMOTE.test(remote.stdout.trim());
  });
}

/** Runs `git pull --ff-only` in each clone. Returns false if one fails. */
function pullClones(clones) {
  let ok = true;
  for (const clone of clones) {
    console.log(`  git pull in ${clone}`);
    const result = spawnSync('git', ['-C', clone, 'pull', '--ff-only'], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error(`  Could not update ${clone}. Uninstall the plugin and install it again.`);
      ok = false;
    }
  }
  return ok;
}

/** Each client: how to find it, and how to update it (true = done, false = failed). */
const CLIENTS = {
  'claude-code': {
    label: 'Claude Code',
    detect: () => findClaude(),
    update: (claude) => {
      const marketplace = PLUGIN.split('@')[1];
      for (const args of [
        ['plugin', 'marketplace', 'update', marketplace],
        ['plugin', 'update', PLUGIN, '--scope', 'project'],
      ]) {
        if (spawnSync(claude, args, { stdio: 'inherit' }).status !== 0) return false;
      }
      return true;
    },
    next: 'start a new Claude Code session (or reload the window)',
  },
  vscode: {
    label: 'GitHub Copilot in VS Code',
    detect: () => {
      const clones = kitClones(
        ['.vscode', '.vscode-insiders'].map((d) => join(home, d, 'agent-plugins', 'github.com')),
      );
      return clones.length ? clones : null;
    },
    update: pullClones,
    next: 'reload the VS Code window',
  },
  cursor: {
    label: 'Cursor',
    detect: () => {
      const clones = kitClones([join(home, '.cursor', 'plugins', 'local')]);
      return clones.length ? clones : null;
    },
    update: pullClones,
    next: 'reload the Cursor window (a plugin from the Cursor marketplace updates there)',
  },
  'copilot-cli': {
    label: 'GitHub Copilot CLI',
    detect: () => onPath('copilot') || null,
    hint: `copilot plugin install ${REPO}`,
  },
  codex: {
    label: 'OpenAI Codex',
    detect: () => onPath('codex') || null,
    hint: `codex plugin marketplace add ${REPO}, then reinstall leanscope-agent-kit from /plugins`,
  },
};

export function updatePlugin(argv = process.argv.slice(2)) {
  const i = argv.indexOf('--clients');
  const ids =
    i >= 0 && argv[i + 1] ? argv[i + 1].split(',').map((s) => s.trim()) : Object.keys(CLIENTS);
  const unknown = ids.filter((id) => !CLIENTS[id]);
  if (unknown.length) {
    console.error(`Unknown client ${unknown.join(', ')}. Use ${Object.keys(CLIENTS).join(', ')}.`);
    return 1;
  }

  let found = 0;
  let failed = false;
  const next = [];
  for (const id of ids) {
    const client = CLIENTS[id];
    const target = client.detect();
    if (!target) continue;
    found++;
    if (client.hint) {
      console.log(`${client.label}: to update the plugin, run ${client.hint}`);
      continue;
    }
    console.log(`${client.label}: updating the Agent Kit plugin…`);
    if (client.update(target)) next.push(client.next);
    else failed = true;
  }

  if (!found) {
    console.error(
      `No coding agent with the Agent Kit plugin found (looked for ${ids.join(', ')}). ` +
        'Install the plugin first: see "Other coding agents" in README.md.',
    );
    return 1;
  }
  if (next.length) console.log(`Done. To use the new version: ${next.join('; ')}.`);
  return failed ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(updatePlugin());
