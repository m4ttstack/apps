import { join } from 'path';

export const ROOT = join(import.meta.dirname, '..', '..');
export const TURBO = join(ROOT, 'node_modules', '.bin', 'turbo');

export type DryRun = {
  packages: string[];
  globalCacheInputs: { files: Record<string, string> };
  tasks: Array<{
    taskId: string;
    package: string;
    task: string;
    command: string;
    dependencies: string[];
    inputs?: Record<string, string>;
    cache: { status: string };
    resolvedTaskDefinition?: { cache?: boolean };
  }>;
};

export function dryRun(
  args: string[],
  env: Record<string, string> = {}
): DryRun {
  const proc = Bun.spawnSync([TURBO, 'run', ...args, '--dry=json'], {
    cwd: ROOT,
    env: { ...process.env, ...env, TURBO_TELEMETRY_DISABLED: '1' },
  });
  const out = proc.stdout.toString();
  if (proc.exitCode !== 0)
    throw new Error(`turbo failed: ${proc.stderr.toString()}\n${out}`);
  return JSON.parse(out.slice(out.indexOf('{'))) as DryRun;
}

// A package with no script for a requested task is still listed, with the
// command `<NONEXISTENT>`; only the tasks that will actually execute count.
export function realIds(run: DryRun): string[] {
  return run.tasks
    .filter(t => t.command !== '<NONEXISTENT>')
    .map(t => t.taskId)
    .sort();
}
