import { randomBytes } from 'crypto';
import {
  closeSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';

import { isAlive, logsDir } from '../api/state.ts';

export type SpawnFn = (
  argv: string[],
  opts: { cwd: string; stdout: number; stderr: number; detached: boolean }
) => { exited: Promise<number>; pid?: number };

// A detached run outlives the deck that started it, and with it the in-memory
// `runs` entry, so its pid is also kept on disk for the next deck to see.
function detachedRunAlive(dir: string, name: string): boolean {
  try {
    const pid = Number(readFileSync(join(dir, `${name}.run.pid`), 'utf8'));
    return Number.isInteger(pid) && pid > 0 && isAlive(pid);
  } catch {
    return false;
  }
}

interface Run {
  runId: string;
  cmd: string;
  status: 'running' | 'exited';
  exitCode?: number;
}

const runs = new Map<string, Run>(); // keyed by app name: one in-flight run per app

export function resetRuns(): void {
  runs.clear();
}

// Explicit env: Bun otherwise spawns with the PATH the process started on,
// never the one adoptHelperPath composes.
const defaultSpawn: SpawnFn = (argv, opts) =>
  Bun.spawn(argv, { ...opts, env: process.env }) as unknown as {
    exited: Promise<number>;
    pid: number;
  };

export function startCommandRun(
  input: {
    name: string;
    cmd: string;
    shell: string;
    workingDirectory: string;
    detached?: boolean;
  },
  deps: { spawn?: SpawnFn; logDir?: string } = {}
): { started: true; runId: string } | { started: false; reason: 'busy' } {
  const active = runs.get(input.name);
  if (active && active.status === 'running')
    return { started: false, reason: 'busy' };

  const dir = deps.logDir ?? logsDir();
  if (detachedRunAlive(dir, input.name))
    return { started: false, reason: 'busy' };
  mkdirSync(dir, { recursive: true });
  // Append into the app's existing deck log, so `deck logs` shows command output.
  const out = openSync(join(dir, `${input.name}.out.log`), 'a');
  const errFd = openSync(join(dir, `${input.name}.err.log`), 'a');

  const runId = randomBytes(8).toString('hex');
  const run: Run = { runId, cmd: input.cmd, status: 'running' };
  runs.set(input.name, run);

  let proc: ReturnType<SpawnFn>;
  try {
    proc = (deps.spawn ?? defaultSpawn)(['sh', '-c', input.shell], {
      cwd: input.workingDirectory,
      stdout: out,
      stderr: errFd,
      detached: input.detached ?? false,
    });
  } catch (err) {
    // A synchronous spawn failure must not leave the app permanently busy or
    // leak the two fds opened above -- nothing else will ever close them.
    runs.delete(input.name);
    try {
      closeSync(out);
    } catch {
      /* already closed */
    }
    try {
      closeSync(errFd);
    } catch {
      /* already closed */
    }
    throw err;
  }
  if (input.detached && proc.pid)
    writeFileSync(join(dir, `${input.name}.run.pid`), String(proc.pid));
  proc.exited.then(code => {
    run.status = 'exited';
    run.exitCode = code;
    // Bun.spawn's ownership of numeric stdio fds is ambiguous; a bare closeSync
    // could double-close and throw EBADF, so each close is independently guarded.
    try {
      closeSync(out);
    } catch {
      /* already closed */
    }
    try {
      closeSync(errFd);
    } catch {
      /* already closed */
    }
  });

  return { started: true, runId };
}

export function commandRunStatus(
  name: string,
  runId: string
): { status: 'running' | 'exited'; exitCode?: number } | null {
  const run = runs.get(name);
  if (!run || run.runId !== runId) return null;
  return run.exitCode === undefined
    ? { status: run.status }
    : { status: run.status, exitCode: run.exitCode };
}
