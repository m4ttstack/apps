# Deck

Deck is a local-app supervisor for macOS: it runs your web apps as launchd
services, routes them at `<name>.localhost` / `<name>.mattstack` via portless,
and (optionally) serves them publicly through a Cloudflare tunnel it owns. A
per-host gateway on `:7950` does access control (publish flag, password, Google
sign-in). State is plain JSON under `~/.mattstack/deck`.

## Run only from main

Deck runs from `~/.local/bin/deck`, compiled from **main**. Never deploy from a
feature branch: merge to `main` first, then `bun run deploy` from the `main`
checkout. `deploy` compiles `dist/deck`, installs it over `~/.local/bin/deck`,
and self-restarts (`deck restart deck`; the socket drop mid-restart is
expected).

## Manifest-first

Each app declares a `mattstack.deck.json`: `commands.start` (the supervised
service), optional `commands.build`/`commands.deploy` (LOCAL action buttons on
the board, dev-mode gated... they build/restart locally, they are NOT the
remote push), `env`, `port`, `displayName`/`icon`. `deck register --dir <path>`
syncs an app from its manifest (attaches source + commands, never the serve
shape). Deck adopts its own minimal manifest this way too (just a `deploy`
button); its serve shape stays the bare `com.mattstack.deck` serve unit, never
manifest-declared.

## Settings and secrets go through rt, never raw files

- Settings: `getSetting`/`setSetting` from `@mattstack/rt-client` (bundled into
  the compiled binary), or `rt settings` from a shell. Deck's config lives in
  the `deck.platform` key (machine scope): `publicDomain`, `tunnel {name,uuid}`,
  `railway {projectId,environmentId}`, `legacyPrefixes`. It is store-migrated
  with a `platform.json` fallback (see `src/api/platform-settings.ts`); add a
  new migrated field to EVERY seam `railway` uses (interface, DEFAULTS,
  MigratedFields Pick, withPlatformStoreFallback, both `setSetting` calls
  including the error-revert, and the file-strip). Never hand-edit a settings
  jsonc or read `~/.mattstack/deck/*.json` for config that belongs in settings.
- Secrets: `rt secrets set deck <key>`; read env-first then the rt daemon's
  token-gated `secrets:read` (deck scope allowlist in repo-tools
  `lib/daemon/handlers/secrets.ts`: `cfApiToken`, `cfZoneId`, `cfDnsToken`,
  `railwayToken`, `railwayApiToken`). A secret is never a setting.

## Public edge: deck owns its Cloudflare tunnel

`deck domain <domain>` creates and owns ONE wildcard cloudflared tunnel
(`*.<domain>` to the gateway on `:7950`): it mints + creates the tunnel, records
its identity in `deck.platform`, writes the config, upserts the wildcard DNS via
the Cloudflare API, installs+supervises the launchd unit
(`com.mattstack.deck.tunnel`), and confirms the connector. `deck domain` shows
the bound domain + live `/ready` health; `deck domain unbind` tears it all down.
It self-heals on the reconcile tick (`src/edge/edge-reconcile.ts`). Health is
read locally from the connector's metrics `/ready`, never a CF API call per poll.
Edge code is behind seams with fakes: `TunnelDriver` (`src/edge/tunnel.ts`),
`CfDns` (`src/edge/cf-dns.ts`), `ServiceManager` (`src/services/`).

Requires the `cloudflared` binary at runtime (invoked via `Bun.spawn`;
`LOCAL_CLOUDFLARED_BIN` overrides the path... launchd needs an ABSOLUTE path, so
deck resolves it via `resolveProgram`/`composeServicePath`), a one-time
`cloudflared tunnel login` (writes `~/.cloudflared/cert.pem`), and the
`cfZoneId`/`cfDnsToken` (Zone.DNS:Edit) secrets. No new npm/bundle deps.

Serving an app while the machine is OFF is a separate feature (Railway
push-to-remote: `deck remote on|off`, `deck push`), fully independent of the
tunnel.

## Board bundle + tests

- The board UI compiles to `core/generated/board.{js,css}` via
  `bun run build:board`. After ANY `core/board/` edit you MUST regenerate it...
  `core/generated-fresh.test.ts` byte-compares and fails otherwise. The
  minifier churn in `board.js` is expected; commit source + regenerated bundle
  together.
- `bun run test` (`bun test core src`) is the scoped suite. `bun run test:dom`
  is separate and has 8 pre-existing failures on main (structural/text
  assertions, unrelated to most changes... verify before/after, do not chase).

## House rules

No em dashes or en dashes anywhere. Comments only for a constraint the code
cannot show. Commit incrementally.
