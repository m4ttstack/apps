# CLAUDE.md

## Reading order

1. `README.md` -- what the four packages are, the subpath tables, the
   consumer snippets, local development and consumption.
2. `docs/superpowers/specs/2026-08-26-app-kit-design.md` -- the design:
   why these packages exist, the decisions taken during brainstorming, the
   full repo layout, and the migration plan for each consumer.
3. `docs/superpowers/specs/2026-09-06-apps-fold-in-design.md` -- the
   fold-in: why publishing ends, why the five apps (chat, console,
   boxscore, board, deck) move into this repo as `apps/<name>`, the
   per-app migration shape, and the rename to `m4ttstack/apps`.
4. `AGENTS.md` -- the contract for editing `packages/ui/src`,
   `packages/server/src`, or consuming either package: import walls, theme
   and icon extension points, the boot family, and the consumer
   requirements a migrating app must not skip.

## Consumer repos

The five mattstack apps are folding into this repo as `apps/<name>`
workspace members, one PR per app, per
`docs/superpowers/plans/2026-09-06-apps-fold-in.md`:

- **chat**: first to fold in.
- **console**, **boxscore**, **board**, **deck**: arriving after chat, in
  that order, per the fold-in plan.

Until an app's fold-in PR lands, it stays in its own repo and consumes
the platform packages as described in README.md's "Bundle-transition
tarballs" section.

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
`@mattstack/tui-kit` each carry a version (currently 0.4.0, bumped
together via `scripts/set-platform-version.ts`), but that version is a
tree-internal identity only: it has never been published and, per the
fold-in decision, never will be. `packages/tokens` stays private and
unpublished as before. Apps consume the packages via the workspace (see
README.md's "Installation" section) once they fold in; a consumer that
has not yet folded in depends on a packed tarball in the meantime (see
README.md's "Bundle-transition tarballs" section and `AGENTS.md`'s
"Consumer requirements" §4) -- do not propose or wire up a publish
workflow.
