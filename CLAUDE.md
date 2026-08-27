# CLAUDE.md

## Reading order

1. `README.md` -- what the three packages are, the subpath tables, the
   consumer snippets, local development and consumption.
2. `docs/superpowers/specs/2026-08-26-app-kit-design.md` -- the design:
   why these packages exist, the decisions taken during brainstorming, the
   full repo layout, and the migration plan for each consumer.
3. `AGENTS.md` -- the contract for editing `packages/ui/src`,
   `packages/server/src`, or consuming either package: import walls, theme
   and icon extension points, the boot family, and the consumer
   requirements a migrating app must not skip.

## Consumer repos

- **chat**: pending. Not yet migrated onto `@mattstack/app-kit` /
  `@mattstack/app-server`; still carries its own `src/ui` copy of the kit.
  The migration plan is in the spec's "Migration" section.
- **console**: pending, and later than chat. Console migrates from its
  own post-wouter `main`, in a separate plan, once chat's migration has
  proven the packages against a real app.

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

Publishing any of the three packages to npm is Matt's step, done by hand,
one version bumped at a time. Nothing in this repo automates a publish.
Until a package is published, consumers depend on a packed tarball (see
`README.md`'s "Consumption" section and `AGENTS.md`'s "Consumer
requirements" §4) -- do not propose or wire up a publish workflow without
Matt asking for one.
