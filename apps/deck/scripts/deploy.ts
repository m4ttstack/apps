import { existsSync, realpathSync } from 'fs';
import { homedir } from 'os';
import { dirname, join } from 'path';
import { $ } from 'bun';

import { logsDir, readApiInfo, readApiRunMode } from '../src/api/state.ts';
import { resolveApiInfo } from '../src/cli/api-info.ts';
import { deployMode, linkedCheckoutMismatch } from '../src/cli/deploy-mode.ts';
import { deployTarget } from '../src/cli/deploy-target.ts';
import { getRecord } from '../src/registry/records.ts';
import { bundleRootFromExec } from '../src/services/bundle-layout.ts';
import {
  bundleHelperOwnsDeck,
  liveProbe,
} from '../src/services/helper-owner.ts';

async function printLogTails(): Promise<void> {
  for (const f of ['deck.err.log', 'deck.out.log', 'agent.log']) {
    const p = join(logsDir(), f);
    const tail = await $`tail -5 ${p}`.nothrow().text();
    if (tail.trim()) console.error(`--- ${f} tail:\n${tail.trimEnd()}`);
  }
}

const helperOwned = await bundleHelperOwnsDeck(liveProbe, bundleRootFromExec());
const mode = deployMode(helperOwned, process.env, readApiRunMode());
if (mode.kind === 'refuse') {
  console.error(mode.message);
  process.exit(1);
}

const pidBefore = readApiInfo()?.pid ?? null;

let target: string | null = null;
let backup: string | null = null;
if (mode.kind === 'install') {
  // The plist's ProgramArguments[0], read from deck's own registry record rather
  // than hardcoded: kickstart re-execs that exact path, so the new binary must
  // land there or the restart below keeps running the stale build.
  target = deployTarget(false);
  await $`bun run build`;
  await $`bun run build:board`;
  await $`mkdir -p ${dirname(target)}`;
  // Keep the outgoing binary so a failed health check can restore it: a fresh
  // bun-compiled binary is a new TCC identity, and macOS blocks its first read
  // of a protected folder (Documents) behind a user prompt. Unattended, that
  // leaves the new build hung with zero output and the old binary already gone.
  backup = `${target}.prev`;
  if (existsSync(target)) {
    await $`install -m 0755 ${target} ${backup}`;
  }
  // install truncates-in-place, which can ETXTBSY on macOS against the currently-running
  // binary; installing to a temp path in the same dir and renaming over it is atomic and
  // leaves the running process holding its old inode.
  await $`install -m 0755 dist/deck ${target}.new`;
  await $`mv -f ${target}.new ${target}`;
} else {
  // A deploy from any checkout other than the one deck's registry links
  // installs into that OTHER tree, then restarts the linked deck unchanged;
  // the health check below still passes, reporting a false success.
  const thisDeckDir = realpathSync(join(import.meta.dir, '..'));
  const mismatch = linkedCheckoutMismatch(
    thisDeckDir,
    getRecord('deck')?.dev?.workingDirectory
  );
  if (mismatch) {
    console.error(mismatch);
    process.exit(1);
  }
  // The served process imports the checkout's node_modules directly, so a
  // dependency bump must land before the restart or deck crash-loops.
  const workspaceRoot = join(import.meta.dir, '..', '..', '..');
  await $`${join(homedir(), '.bun', 'bin', 'bun')} install --frozen-lockfile`.cwd(
    workspaceRoot
  );
}
// The self-restart drops the API mid-response, so the CLI's own restart call
// sees a closed socket even when it worked; tolerate that and prove the new
// build is up by health rather than by that call's exit code.
await $`deck restart deck`.nothrow();
const info = resolveApiInfo();
if (!info)
  throw new Error('no running deck and no self record; run `deck setup`');

async function healthy(deadlineMs: number): Promise<boolean> {
  const deadline = Date.now() + deadlineMs;
  for (;;) {
    try {
      if ((await fetch(`http://127.0.0.1:${info!.port}/healthz`)).ok)
        return true;
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) return false;
    await new Promise(r => setTimeout(r, 500));
  }
}

if (mode.kind === 'restart') {
  // `deck restart deck` can fail silently (e.g. the shim rejects the
  // restart), which leaves the OLD process still answering /healthz; a new
  // pid is the only proof the restart actually replaced the process.
  const deadline = Date.now() + 20_000;
  let newPid = false;
  while (Date.now() <= deadline) {
    const pid = readApiInfo()?.pid;
    if (pid !== undefined && pid !== pidBefore) {
      newPid = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!newPid) {
    console.error(
      'deck restart did not bring up a new process; the new source is NOT live'
    );
    process.exit(1);
  }

  if (!(await healthy(Math.max(0, deadline - Date.now())))) {
    await printLogTails();
    console.error(
      'deck did not come back healthy after the restart; see the logs above'
    );
    process.exit(1);
  }

  const recorded = readApiRunMode();
  const runMode = recorded?.runMode ?? 'standalone';
  if (runMode === 'standalone') {
    // A pinned fallback older than runMode records no runMode at all, so it
    // reads here as standalone; this wording covers both readings.
    console.error(
      'deck came back healthy but running the pinned release (a release older than runMode, so no reason recorded); the new source is NOT live (the last deck-dev-shim: line in ~/.mattstack/deck/logs/deck.err.log says why)'
    );
    process.exit(1);
  }
  if (runMode !== 'source') {
    console.error(
      `deck came back healthy but running ${runMode}${recorded?.runReason ? `: ${recorded.runReason}` : ''}; the new source is NOT live (the last deck-dev-shim: line in ~/.mattstack/deck/logs/deck.err.log says why)`
    );
    process.exit(1);
  }

  console.log(`deployed: deck healthy on port ${info.port}, running source`);
  process.exit(0);
}

if (await healthy(20_000)) {
  console.log(`deployed: deck healthy on port ${info.port}`);
  process.exit(0);
}

console.error(
  `deck did not come back healthy on port ${info.port} within 20s.`
);
console.error(
  `If a macOS prompt is asking to allow deck to access Documents, click Allow and re-run the deploy.`
);
await printLogTails();

if (mode.kind === 'install' && backup !== null && existsSync(backup)) {
  console.error(`restoring the previous binary and restarting...`);
  await $`install -m 0755 ${backup} ${target}.new`;
  await $`mv -f ${target}.new ${target}`;
  await $`deck restart deck`.nothrow();
  if (await healthy(20_000)) {
    console.error(
      `previous build restored: deck healthy on port ${info.port}. The new build was NOT deployed.`
    );
  } else {
    console.error(
      `previous build restored but deck is still not healthy; check the logs above and launchctl.`
    );
  }
} else {
  console.error(
    `no previous binary to restore (${backup} missing); deck may be down.`
  );
}
process.exit(1);
