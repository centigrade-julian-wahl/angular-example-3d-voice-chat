import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const children = [];
let stopping = false;
const serveArgs = process.argv.slice(2);
const openArgs = serveArgs.includes('--no-open') ? [] : ['--open'];
const forwardedArgs = serveArgs.filter((argument) => argument !== '--no-open');

function start(command, args, label) {
  const child = spawn(command, args, { stdio: 'inherit', cwd: root, env: process.env });
  children.push(child);
  child.on('exit', (code, signal) => {
    if (stopping) return;
    if (code !== 0) {
      console.error(`${label} exited (${code ?? signal ?? 'unknown'}); stopping the other process.`);
      void stop(code || 1);
    }
  });
  return child;
}

async function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
  }
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          child.once('exit', resolve);
        }),
    ),
  );
  process.exit(exitCode);
}

start(process.execPath, ['server/voice-api.mjs'], 'Voice backend');
start(
  process.execPath,
  ['scripts/run-ng.mjs', 'serve', ...openArgs, '--proxy-config', 'proxy.conf.json', ...forwardedArgs],
  'Angular dev server',
);

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => void stop(0));
