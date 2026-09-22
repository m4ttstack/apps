# Board: act on the selection (bulk actions)

Design board: `docs/design/board/board.pen`, B11 (dark and light).

## Problem

The board's checkboxes only do one thing: copy or post the checked MRs to
Slack. Everything else (rebase, auto-merge, a review, a Slack mark, asking
a teammate) has to be done one row at a time from the right-click menu,
even when the same move applies to five MRs.

## What you can do

Right-click a checked row while two or more rows are checked, and the menu
acts on every checked row. Right-click an unchecked row (or the only
checked row) and you get today's one-row menu; the selection is untouched.
The selection bar gains an **actions** button that opens the same menu
(one checked row: the one-row menu for it).

The bulk menu keeps the row menu's grammar and three sections. An item
shows only when at least one checked MR can take it, and it carries a count
(`3 of 5`) of how many it will act on.

| Section | Items |
| --- | --- |
| agent actions | review, re-review, call doctor, request review from… |
| gitlab | rebase on target, set / cancel auto-merge, mark ready / mark as draft, merge |
| slack | mark / unmark each reaction, find slack threads |

- **Merge** always takes a second click (`really merge 3?`). If any checked
  MR is stacked on an MR that is still open on the board, merge is blocked
  for the whole selection: it stays in the menu, unclickable, with the
  reason (`!1270 sits on !1268, which is still open`). This is the one item
  that shows while it can't be clicked, so it never silently vanishes.
- **Launches** (review, re-review, call doctor) take a second click once
  they would open more than 3 panes (`really start 4 reviews?`).
- **Request review from…** opens a picker; each person's count is how many
  checked MRs they can still be asked on. Picking one sends an ask on each.
- A **slack mark** shows as "mark" for the MRs whose thread lacks it. It
  shows as "unmark" only when every checked MR with a thread already has it.
- **One summary toast** per action: `rebase started on 2 · couldn't rebase
  !1266`. One reload at the end, not one per MR.
- The selection stays after an action, so moves chain (rebase, then set
  auto-merge). Merged MRs leave the board on their own.

Stays where it is: copy and post (the selection bar), and the one-row-only
items (notes, alt-click launch notes, focus, resume, view report, open in
gitlab, dismiss a failed line, auto-doctor stand-down, nudges). Adding any
of them to the bulk menu later is one flag on its definition.

## One definition per action

Today an action's rules are spread across three places: eligibility in
`RowMenu.tsx` and in the `can*` props `Board.tsx` computes for it, and the
request, toasts and reload in a hand-written `handle*` callback per action.
A bulk menu written on top of that would copy every rule a second time.
Instead, each action is defined once and both menus read from it.

### `row-actions.ts` (new, pure, no React)

- `rowActions(mr, env)`: every action this one MR offers right now, in
  menu order. Each entry: `key`, `section`, the row's own `label`, glyph
  and lane, `bulk` (can it join a bulk menu), `bulkLabel` (the grouped
  wording, e.g. `call doctor` for both `call doctor` and `call doctor
  again`), and `confirm` (`always` for merge, `over3` for launches).
- All eligibility moves here: today's inline checks in `RowMenu` plus the
  `canRespond` / `canDoctor` / `canStandDown` / `canDraftState` /
  `canNudge` / `canAskRespond` props. The existing helpers in `format.ts`
  (`gitlabMenuItems`, `reviewMenuItems`, `firstReviewTargets`, ...) stay
  and are called from here.
- `bulkActions(mrs, env)`: runs `rowActions` for each checked MR, keeps the
  `bulk` entries, groups them by `key`, and returns each with its targets
  and count. It adds only what exists solely for a group: the merge stack
  block (via `view.ts`'s `stackParents` over the whole board, exported
  for this; today it is module-private) and the
  mark/unmark rule. It has no eligibility logic of its own, so the two
  menus can never disagree about what an MR can take.
- `env` is one object (`self`, `local`, `slackEnabled`, `roster`, `peers`,
  `allMrs`) built once in `Board.tsx`.

### `action-runner.ts` (new, pure, sibling of `launch-flow.ts`)

- Each non-launch action's request is described once: its endpoint, its
  payload for an MR, and its wording (`rebasing`, `rebase started`,
  `rebase`).
- `runOne(key, mr, deps)` reproduces today's toasts for a single row, word
  for word.
- `runMany(key, targets, deps)` runs the same requests four at a time,
  then raises one summary toast and reloads once.
- Launch actions keep `runLaunchFlow`. It changes only to return its result,
  so `runMany` can count successes and failures.
- The per-action boilerplate in `Board.tsx` (`handleMrAction`,
  `handleDraftState`, `handleResolveSlack`, `handleReactSlack`,
  `handleAsk`) collapses into these two calls. The status line's merge
  verb uses the same `runOne`.

### `ActionMenu.tsx` (new, React)

- Renders a list of entries into the kit `ContextMenu`: the section labels,
  the counts, and the stages every menu needs: the second-click confirm,
  the person picker and the alt-click note box.
- `RowMenu` becomes a thin caller: `rowActions(mr, env)` into
  `ActionMenu`, plus the one piece only a single row has (Slack marks that
  stay open with a spinner while you set several).
- The bulk menu is the same component fed `bulkActions(checked, env)`.
  There is no separate `BulkMenu` component.

## Order of work

1. Pin today's one-row menu with tests: which items show, in what order,
   for the MR states the fixture carries. These must pass unchanged
   through steps 2 and 3.
2. Extract `rowActions`; `RowMenu` renders from it. No visible change.
3. Extract `action-runner`; the handlers collapse into it. No visible
   change, toasts included.
4. `bulkActions` with its tests: grouping, counts, the stack block, the
   mark/unmark rule, and the launch confirm threshold.
5. `ActionMenu` stages, the bulk menu on right-click, and the selection
   bar's actions button.
6. Render the board in Fast Browser (dark and light), compare against B11,
   and run `capture:compare` to confirm the one-row menu and the rows are
   unchanged.

## Testing

- Unit: `rowActions` per MR state (step 1's pins), `bulkActions`, and
  `runMany`'s summary wording and concurrency limit.
- DOM: right-click on a checked row (two or more checked) opens the bulk
  menu, on an unchecked row opens the one-row menu, the actions button
  opens the bulk menu, merge needs two clicks, and a blocked merge can't
  fire.
- Gates: `board:typecheck`, `board:test`, `format:check`,
  `scripts/repo-purity.sh`.

## Risks

- Steps 2 and 3 rework the one-row menu that is used every day. Step 1's
  pins and the capture comparison are what show nothing moved; a pin that
  needs changing in steps 2 or 3 is a regression, not a test to update.
- Bulk launches open real panes on a real machine; the over-3 confirm is
  the only brake. The auto-doctor's own concurrency cap does not apply to
  launches you click.
