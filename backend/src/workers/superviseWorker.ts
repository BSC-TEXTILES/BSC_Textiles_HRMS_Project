/**
 * Supervisor for the biometric worker.
 *
 * Spawns `biometricWorker.ts` as a child process and restarts it whenever it
 * exits, with exponential backoff so a startup failure that is immediate (bad
 * database credentials, port already taken) does not turn into a fork bomb.
 * After the process has stayed up for a while the backoff resets, so a genuine
 * crash hours later restarts within a second rather than a minute.
 *
 *   npm run worker:supervised
 *
 * Tunables: WORKER_RESTART_CEILING_MS (default 60000), WORKER_HEALTHY_UPTIME_MS
 * (default 30000), WORKER_AUTORESTART=0 to disable restarts for debugging.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const CEILING_MS = Number(process.env.WORKER_RESTART_CEILING_MS) || 60_000;
const HEALTHY_UPTIME_MS = Number(process.env.WORKER_HEALTHY_UPTIME_MS) || 30_000;
const AUTO_RESTART = process.env.WORKER_AUTORESTART !== '0';

function ts(): string {
  return new Date().toISOString();
}

function log(message: string): void {
  console.log(`[${ts()}] [supervisor] ${message}`);
}

function resolveWorkerEntry(): string {
  const tsEntry = path.resolve(process.cwd(), 'src/workers/biometricWorker.ts');
  const jsEntry = path.resolve(process.cwd(), 'dist/workers/biometricWorker.js');
  if (fs.existsSync(tsEntry)) return tsEntry;
  if (fs.existsSync(jsEntry)) return jsEntry;
  throw new Error(`Cannot find the biometric worker entry point looked for at ${tsEntry} or ${jsEntry}`);
}

/**
 * Locate the tsx CLI by walking up from the working directory.
 *
 * A fixed relative path breaks the moment this is run from a workspace folder:
 * `../../node_modules` from `backend/` resolves outside the repository and the
 * worker dies instantly, which the supervisor then restarts forever.
 */
function resolveTscCli(): string | null {
  let directory = process.cwd();
  for (let depth = 0; depth < 6; depth++) {
    const candidate = path.join(directory, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return null;
}

export async function supervise(): Promise<void> {
  const entry = resolveWorkerEntry();
  const tsxCli = resolveTscCli();
  const useTs = entry.endsWith('.ts');
  // Prefer spawning tsx's CLI directly through the current node binary: it
  // avoids a shell and works when the process is not on PATH.
  const command = useTs && !tsxCli ? (process.platform === 'win32' ? 'npx.cmd' : 'npx') : process.execPath;
  const baseArgs = useTs
    ? tsxCli
      ? [tsxCli, entry]
      : ['tsx', entry]
    : [entry];

  let attempt = 0;
  let stopping = false;
  let child: ReturnType<typeof spawn> | null = null;

  process.on('SIGINT', () => {
    stopping = true;
    log('SIGINT received, stopping worker');
    child?.kill('SIGINT');
    setTimeout(() => process.exit(0), 1500).unref();
  });
  process.on('SIGTERM', () => {
    stopping = true;
    child?.kill('SIGTERM');
    setTimeout(() => process.exit(0), 1500).unref();
  });

  while (!stopping) {
    const startedAt = Date.now();
    log(`starting worker (${entry})`);

    child = spawn(command, baseArgs, {
      cwd: process.cwd(),
      env: { ...process.env, WORKER_SUPERVISED: '1' },
      stdio: 'inherit',
    });

    const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child!.once('exit', (code, signal) => resolve({ code, signal }));
      child!.once('error', (err) => {
        log(`spawn failed: ${err.message}`);
        resolve({ code: -1, signal: null });
      });
    });

    if (stopping) break;

    const uptimeMs = Date.now() - startedAt;
    if (uptimeMs >= HEALTHY_UPTIME_MS) attempt = 0;

    if (!AUTO_RESTART) {
      log(`worker exited (code=${exit.code} signal=${exit.signal}) and WORKER_AUTORESTART=0, not restarting`);
      process.exit(exit.code ?? 1);
    }

    const delay = Math.min(CEILING_MS, 1000 * 2 ** Math.min(attempt, 6));
    attempt++;
    log(`worker exited (code=${exit.code} signal=${exit.signal}) after ${uptimeMs}ms — restart #${attempt} in ${delay}ms`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

supervise().catch((err) => {
  console.error('Supervisor failed:', err.message);
  process.exit(1);
});
