import { runModeFromEnv, type RunMode } from '../api/state.ts';

export type DeployMode =
  | { kind: 'install' }
  | { kind: 'restart' }
  | { kind: 'refuse'; message: string };

/** A helper-owned deck lives inside a signed bundle, so deploy can never
    write a binary there; only a source-run deck (the dev bundle's shim) has
    something to make live, by restarting. A deploy the serving deck spawned
    inherits its DECK_RUN_MODE; one run from a terminal reads api.json. */
export function deployMode(
  helperOwned: boolean,
  env: Record<string, string | undefined>,
  recorded: { runMode: RunMode; runReason?: string } | null
): DeployMode {
  if (!helperOwned) return { kind: 'install' };
  const { runMode, runReason } = env.DECK_RUN_MODE
    ? runModeFromEnv(env)
    : (recorded ?? { runMode: 'standalone' as const });
  if (runMode === 'source') return { kind: 'restart' };
  if (runMode === 'pinned') {
    return {
      kind: 'refuse',
      message: `deck is running the pinned release because ${runReason ?? 'the dev shim could not run source'}; fix the checkout or bun, then restart deck`,
    };
  }
  return {
    kind: 'refuse',
    message:
      "the mattstack app owns deck here and its helper runs the bundle's pinned release, so `bun run deploy` has nothing to replace (in the dev app, the last `deck-dev-shim:` line in ~/.mattstack/deck/logs/deck.err.log says why source is not running)",
  };
}
