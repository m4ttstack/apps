# CLAUDE.md

## Reading order

1. `README.md` -- what the four platform packages are, the subpath tables,
   the consumer snippets, the repository layout, and local development.
2. `docs/superpowers/specs/2026-08-26-app-kit-design.md` -- historical: why
   these packages exist and the decisions taken during brainstorming.
3. `docs/superpowers/specs/2026-09-06-apps-fold-in-design.md` -- historical:
   why the five apps (chat, console, boxscore, board, deck) moved into this
   repo as `apps/<name>` and the rename to `m4ttstack/apps`. The fold-in
   this spec describes is complete; all five apps already live here.
4. `AGENTS.md` -- the contract for editing `packages/ui/src`,
   `packages/server/src`, or consuming either package: import walls, theme
   and icon extension points, the boot family, and the consumer
   requirements a new app must not skip.
5. `docs/bundle-cutover-brief.md` -- anything release- or bundle-shaped:
   how the mac-app bundle pipeline reads each app's
   `apps/<name>/mattstack.deck.json` recipe, app-prefixed release tags,
   and why old app repos stay unarchived until a shipped bundle release
   repoints to them.

## Repository layout

`packages/{ui,server,tokyo,tui-kit,tokens}` and
`apps/{chat,console,boxscore,board,deck}` are the two workspace roots; see
README.md's "Repository layout" section for what each package/app is. The
five old standalone app repos (chat, console, board, deck, boxscore,
plus tui-kit) are deleted from GitHub -- their branch history lives here
as `archive/<app>/*` refs, and their pre-fold-in releases are re-tagged
byte-identical under app-prefixed tags (`chat-v0.1.0` style).

## Workspace and catalog rules

The root `package.json`'s `workspaces.catalog` is the single home for
shared dependency versions; every member declares `"catalog:"` rather than
pinning its own version. `packages/tui-kit`'s `"typescript": "^7"` is the
one deliberate exception -- the catalog's `~6` line would downgrade its
compiler, so it opts out on purpose. Do not add a second exception without
the same kind of reason. Member-level lockfiles are forbidden: the root
`bun.lock` is the only lockfile that owns resolution, so a workspace
member never runs `bun install` scoped to itself in a way that would
produce its own lock.

## CI shape

Two GitHub Actions jobs (`.github/workflows/ci.yml`): the `checks` job
(ubuntu) runs kit/gate checks plus the chat, console, boxscore, and board
suites (typecheck/lint/test/build), the served-client and served-binary
gates, and the repo-purity gates; `deck-macos` (macos-latest, its own bun
install) runs deck's suite because deck shells to `plutil`/`launchd`,
both macOS-only.

`setup-bun` is pinned to `1.3.13` in both jobs. The pin exists because
CI byte-compares generated/committed artifacts (deck's
`core/generated-fresh.test.ts`, tui-kit's codegen gate) against a live
rebuild, and bun's bundler/minifier output is not stable across bun
versions. Bump the pin only together with the local bun upgrade that
regenerates those committed files -- never on its own.

`packages/tui-kit` exports `dist/`, not source, so `bun run tui-kit:build`
must run before any board or deck typecheck/test/build, locally and in
CI. Both CI jobs run it first for exactly this reason.

## Per-app root scripts

Each app gets `<app>:typecheck`, `<app>:test`, `<app>:lint`, and
`<app>:build` root scripts in `package.json` where that gate applies to
the app (e.g. board has no `:lint` script, deck has none of the four --
see its own test scripts instead). Run an app's own gates with these
rather than `cd`-ing into `apps/<name>` by hand; they match what CI runs.

## Deck serving note

`deck` (the local supervisor, `apps/deck`) dev-links each app via
`deck register --dir` pointed at `apps/<name>`. In serve mode, deck's
health check only proves `/api` is up -- it does not build the app's UI.
If a Mantine app's `dist/` is stale or missing, `bun run <app>:build`
inside that app, or the UI 404s while `/api` stays healthy (DECK-61).
Rebuild after any change you want to see served, not just after changes
that fail typecheck.

## rt identity note

rt currently shows this repo under the identity label `app-kit`, via a
machine-settings `rt.repoIdentityOverrides` bridge, until RT-112 re-keys
it to the repo's actual name. The row and its data are correct; only the
label is stale.

## Mantine: look it up, don't recall it

`@mattstack/app-kit` pins Mantine on the 9.5 line (`^9.5.2` across every
`@mantine/*` peer in `packages/ui/package.json`). Before using a Mantine
component you have not already used in this session, or any prop you are
not certain of, look it up rather than guessing: a guessed prop compiles
and renders and is still wrong (the variant that does not exist, the prop
that moved, a size off the scale). If your session has the `mantine` MCP
server available (mantine-kit's own `.mcp.json` configures it,
`npx -y @mantine/mcp-server@9.5.2`), use `get_item_props` /
`get_item_doc` / `search_docs` / `list_items` the same way mantine-kit's
`AGENTS.md` describes. This repo does not vendor its own `.mcp.json` or a
`docs/mantine-llms.txt` index; absent MCP, check the installed
`@mantine/core` / `@mantine/dates` type declarations directly (they match
the pinned `^9.5.2` range) rather than recalling a prop from memory or
from a different Mantine version.

## Publishing

Nothing in this repo publishes to npm. `@mattstack/app-kit`,
`@mattstack/app-server`, `@mattstack/mantine-tokyo`, and
`@mattstack/tui-kit` each carry a version (bumped together via
`scripts/set-platform-version.ts`), but that version is a tree-internal
identity only: it has never been published and, per the fold-in decision,
never will be. `packages/tokens` stays private and unpublished. Every app
under `apps/` consumes the four platform packages workspace-only
(`workspace:*`); external npm deps such as `@mattstack/rt-client` (pinned
exact, `0.16.0`), `@mattstack/glance`, `@mattstack/settings-kit`, and
`invadrs` come from the registry via `catalog:`. The packed-tarball
mechanism in README.md's "Bundle-transition tarballs" section stays
documented as the sanctioned path for a future app that has not yet
folded in as a workspace member; do not propose or wire up a publish
workflow.
