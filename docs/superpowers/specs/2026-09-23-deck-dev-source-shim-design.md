# Deck runs from source in the dev app (DECK-63)

## Goal

In the dev app (`mattstack-dev.app`), deck runs from the linked
`mattstack-apps` checkout, and the deploy button on the deck row makes the
latest source live. The workflow is: merge, pull the checkout on `main`,
click deploy. A deck change never needs a dev-app rebuild or a release.

The prod app (`mattstack.app`) is unchanged: it runs the `deps.lock` pinned
deck, and deploy stays refused there.

## Why this is needed

apps#122 made the app's SMAppService helper the only deck (two decks were
fighting over one port set), and #125 made `bun run deploy` refuse under
helper ownership, because deploy writes a new binary to the path launchd
execs and that path is now `Contents/Helpers/deck` inside a signed bundle.
Overwriting a file there breaks the bundle's signature and gives deck a new
TCC identity. Since then the dev app runs the pinned release, and the deploy
button can only fail (three failures in `deck.err.log` on 2026-09-23).

Board, console and the other served apps already run from the checkout in
dev. The rt daemon does too, through `rt-tray/Sources-daemon-shim` (the dev
bundle's `Contents/MacOS/rt`, a signed exec-proxy that runs
`bun lib/daemon.ts` from the repo-tools checkout). Deck gets the same shape.

## Design

### 1. Deck dev shim (repo-tools `rt-tray`, dev flavor only)

A new SwiftPM executable target, `deck-dev-shim` (`Sources-deck-shim/`),
modeled on `rt-daemon-shim`.

`rt-tray/build.sh dev` bundles it:

- `bundle_helpers` stages the pinned deck from `deps.lock` at
  `Contents/Helpers/deck` as today.
- In the dev flavor only, the pinned binary moves to
  `Contents/Helpers/deck-pinned`, and the shim is installed as
  `Contents/Helpers/deck`.
- Both are signed by the existing helper signing pass, which already signs
  every Mach-O under `Contents/Helpers` with `com.mattstack.helper.<basename>`.
  The shim keeps the identifier `com.mattstack.helper.deck` the deck plist's
  `BundleProgram` has always had.
- The prod flavor is untouched: `Contents/Helpers/deck` stays the pinned
  binary, and there is no `deck-pinned`.

On every launch (the launchd `serve` and every CLI call alike, since
`Contents/Helpers` is first on the PATH deck composes), the shim chooses:

1. **Source**, when all of these hold:
   - `~/.mattstack/deck/registry.json` is trusted (owned by this uid, not
     group- or other-writable; the same rule `rt-daemon-shim` applies to
     its config), parses, and has a record named `deck` with an absolute
     `dev.workingDirectory`;
   - `<dev.workingDirectory>/src/main.ts` exists;
   - bun resolves: the `bunPath` from rt's dev-mode config (read exactly as
     `rt-daemon-shim` reads it), else `~/.bun/bin/bun`, and it is executable.

   Then it execs `bun <dev.workingDirectory>/src/main.ts <args...>` with
   `DECK_BUNDLE_ROOT=<the .app path>` added to the environment and the
   working directory unchanged.
2. **Pinned** otherwise: it execs `Contents/Helpers/deck-pinned <args...>`,
   with the same environment plus `DECK_BUNDLE_ROOT`.

The shim writes one line to stderr naming the choice and, for pinned, why
(which condition failed). For `serve` it first redirects stderr to
`~/.mattstack/deck/logs/deck.err.log` (append), because the deck plist sets
no `StandardErrorPath`, so the line would otherwise vanish. CLI calls keep
the caller's stderr but print nothing on the source path, so CLI output is
unchanged.

If `execv` itself fails after the choice, the shim exits 1 so launchd
restarts it. A deck that crashes after booting from source is not caught by
the shim: launchd restarts the shim, which runs source again. A crash loop is
louder than silently serving stale code, and the deck row shows it.

### 2. Deck honors the shim (mattstack-apps `apps/deck`)

**Bundle root.** `bundleRootFromExec` (`src/services/bundle-layout.ts`)
returns `process.env.DECK_BUNDLE_ROOT` when it is set, is absolute, ends in
`.app`, and has `Contents/Info.plist`; otherwise it keeps today's
`process.execPath` logic. Under bun, `process.execPath` is bun, so without
this every caller loses the bundle: `prepareHelperBoot` would skip PATH
composition (no `cloudflared`, no portless), `bundleHelpersDir` would return
null for serve-shape resolution, and helper ownership would fall back to the
`launchctl print` probe. All callers go through `bundleRootFromExec` or
`bundleHelpersDir`, so this one change covers them: `main.ts`,
`cli/client.ts`, `cli/setup.ts`, `cli/update.ts`, `registry/serve-shape.ts`,
`services/exec-env.ts`, `scripts/deploy.ts`.

**Deploy.** `scripts/deploy.ts` gains a third case. Today it refuses when the
helper owns deck, and otherwise builds, installs over the self record's
program, restarts and health-checks. New: when the helper owns deck and deck
runs from source, deploy restarts and health-checks only:

- "Runs from source" means `DECK_BUNDLE_ROOT` is set and
  `<bundle>/Contents/Helpers/deck-pinned` exists (the dev shim layout). The
  deploy button's command runs with deck's environment, so it inherits
  `DECK_BUNDLE_ROOT`.
- It runs `deck restart deck` (kickstart of the helper label, tolerating
  the socket drop as today), then the existing 20s `/healthz` wait.
- On timeout it prints the existing log tails and exits 1. There is no
  binary to restore, so the restore step is skipped.
- No `bun run build` and no `build:board`: `core/generated/board.{js,css}`
  is committed and byte-checked by `core/generated-fresh.test.ts`, so a
  checkout on `main` already carries the built UI.

`deployTarget` keeps refusing for the pinned helper (prod, or a dev bundle
without the shim).

### 3. Docs

- `apps/deck/AGENTS.md` "Run only from main": in the dev app, deck runs the
  linked checkout through the shim, so the flow is merge, pull, deploy.
- repo-tools `AGENTS.md`: the held "Getting a change into the running dev
  app" note (branch `agents-dev-app-deploy`) is rewritten to this flow and
  lands with the shim.
- The build-dev-app script and thin skill Matt asked for are written after
  this lands: a script that builds the dev app in a scratch tree and
  replaces `/Applications/mattstack-dev.app`, and a skill that calls it.
  They are only for shim or tray changes now.

## Failure behavior

| Situation | Result |
|---|---|
| Checkout moved or deleted, or `src/main.ts` missing | Pinned deck serves; one stderr line says why |
| bun missing | Pinned deck serves; one stderr line says why |
| `registry.json` missing, unreadable, untrusted, or has no `dev.workingDirectory` for deck | Pinned deck serves |
| Source deck throws at boot | launchd restarts it; crash loop visible on the deck row and in `deck.err.log` |
| Deploy clicked while deck runs pinned (dev) | Refuses as today, naming the reason |
| Deploy restart not healthy in 20s | Log tails printed, exit 1, the deploy row shows the failure |
| Prod app | Unchanged |

## Testing

- **Deck:** unit tests for `bundleRootFromExec` honoring and validating
  `DECK_BUNDLE_ROOT`; deploy's mode choice (refuse pinned-helper, restart
  source-helper, build-and-install standalone) extracted as a pure function
  and tested; the existing suite stays green (`bun test core src`).
- **Shim:** the choice logic (source vs pinned, with the reason) is a pure
  function tested in `MattstackCoreChecks` or a shim-local check, fed a fake
  file system and environment.
- **Bundle:** `rt-tray/check-bundle.sh` asserts, for the dev flavor, that
  `Contents/Helpers/deck` is the shim and `deck-pinned` exists, and for prod
  that `deck-pinned` does not.
- **Real check:** a scratch dev build installed at
  `/Applications/mattstack-dev.app`; the deck process runs
  `bun …/apps/deck/src/main.ts serve`; `deck restart deck` and a deploy
  click both come back healthy; `/api/apps` then carries `badge` for board
  and console after re-registering them (the badge rollout this unblocks).

## Out of scope

- `~/.local/bin/deck` is a stale compiled CLI (1.0.5) left from before
  helper ownership. It is not changed here.
- The rt:release machine-update verify reads `deck --version` from
  `Contents/Helpers/deck`; in the dev flavor that is now the source
  version, not the pin. The verify step should read `deck-pinned` in the
  dev flavor; noted for the release skill, not changed here.
