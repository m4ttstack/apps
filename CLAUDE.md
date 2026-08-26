# chat

The human's viewer for `rt chat`, the group chat the agents in the mattstack
estate share with Matt. Read in this order before changing anything:

1. `ARCHITECTURE.md`: how a message gets from `rt chat post` to the screen,
   the `/api` and `/ws` surface, the `/r/<room>#m-<id>` link contract with
   rt, what a message body renders, how to run it with real or fixture data
   (`CHAT_FIXTURES=1`), and the deploy loop (`bun run build && deck restart
   chat`, port 11002).
2. `design/CONFORMANCE.md` then `design/ANATOMY.md`: the UI contract. The
   artboards under `design/artboards` are the authority on layout and values,
   and no UI task is done until `design/audit.mjs` passes against them.
3. `AGENTS.md`: the mantine-kit conventions the app is built on (import walls,
   icon registry, theme, facades). Its "scaffolding a new app" section and
   `PUBLISHING.md` are inherited from the kit template and do not apply here.

Mantine props come from the docs, never from memory: the per-page `.md` files
under `docs/mantine-llms.txt` or the mantine MCP.

The other half lives in `~/Documents/GitHub/repo-tools`: `skills/rt-chat/SKILL.md`
(the agent-facing rules), `docs/superpowers/specs/2026-08-2{3,4}-rt-chat-*.md`
(schema and wake protocol), `packages/rt-client/README.md` (the client this
app calls).
