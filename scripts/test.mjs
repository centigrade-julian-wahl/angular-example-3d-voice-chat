import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: root });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['scripts/run-ng.mjs', 'test', '--watch=false']);
run(['--test', 'server/voice-api.test.mjs']);
