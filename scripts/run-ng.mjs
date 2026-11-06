// Runs the Angular CLI (`node scripts/run-ng.mjs serve`, `… build`, `… test`) on a Node.js version
// it supports, so `npm start` works even when the active Node is too old. Uses the active Node when
// it fits, else the newest fitting version installed with nvm, else explains what to install.
//
// For `serve` and `build` it also passes your secrets and choreo guid from `.env` to Angular as the build-time
// constant LEANSCOPE_SECRETS (see src/environments/environment.ts). While `serve` runs, saving
// `.env` restarts the dev server with the new values.

import { spawn } from 'node:child_process';
import { existsSync, readdirSync, watchFile } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENV_FILE, appSecrets, describeEnv, readEnvFile } from './sync-env.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ng = join(root, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
const REQUIRED = '^22.22.3 || ^24.15.0 || >=26.0.0'; // as in package.json "engines"

/** Matches REQUIRED. */
function supported(version) {
  const [major, minor, patch] = version.replace(/^v/, '').split('.').map(Number);
  if (major === 22) return minor > 22 || (minor === 22 && patch >= 3);
  if (major === 24) return minor >= 15;
  return major >= 26;
}

function newer(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

/** The bin folder of the newest supported Node installed with nvm, or null. */
function nvmNodeBin() {
  const versions = join(process.env.NVM_DIR ?? join(homedir(), '.nvm'), 'versions', 'node');
  if (!existsSync(versions)) return null;
  const best = readdirSync(versions)
    .filter(supported)
    .reduce((a, b) => (a === null || newer(b, a) ? b : a), null);
  return best ? join(versions, best, 'bin') : null;
}

if (!existsSync(ng)) {
  console.error('The Angular CLI is not installed yet. Run `npm install` first.');
  process.exit(1);
}

let node = process.execPath;
let env = process.env;
if (!supported(process.version)) {
  const bin = nvmNodeBin();
  if (!bin) {
    console.error(
      `Angular needs Node.js ${REQUIRED}; this is ${process.version}.\n` +
        'Install a newer one, e.g. `nvm install 26`, or from https://nodejs.org/.',
    );
    process.exit(1);
  }
  node = join(bin, process.platform === 'win32' ? 'node.exe' : 'node');
  // Child processes the CLI starts should use the same Node.
  env = { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH ?? ''}` };
  console.log(`Using Node.js from ${bin} (the active ${process.version} is too old for Angular).`);
}

const [command, ...rest] = process.argv.slice(2);
const usesSecrets = command === 'serve' || command === 'build';

function ngArgs() {
  if (!usesSecrets) return [ng, command, ...rest];
  const env = readEnvFile();
  console.log(describeEnv(env));
  return [ng, command, ...rest, '--define', `LEANSCOPE_SECRETS=${JSON.stringify(appSecrets(env))}`];
}

let child;
let restarting = false;

function run() {
  child = spawn(node, ngArgs(), { stdio: 'inherit', env, cwd: root });
  child.on('exit', (code, signal) => {
    if (restarting) {
      restarting = false;
      run();
      return;
    }
    process.exit(code ?? (signal ? 1 : 0));
  });
}

run();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));

if (command === 'serve') {
  watchFile(ENV_FILE, { interval: 1000 }, () => {
    console.log('\n.env changed: restarting the dev server with the new values…');
    restarting = true;
    child.kill('SIGTERM');
  });
}
