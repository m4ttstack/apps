# Review Gate Shapes (gate-ctx: review@1, findings@1)

Extends `docs/superpowers/specs/2026-09-21-respond-gate-context-design.md`
(the base spec, as amended): same transport, same parse rules, same shared
budget, two new shapes. The goal on record: no regex parsing of gate
content anywhere -- structured content, designed with intention. This
repo is public; every example below is invented.

## Problem

Review-post gates carry their findings as prose and their per-finding
text through option labels and descriptions, which the registry caps at
200 bytes and middle-truncates: the human picks findings whose text is
cut mid-word. The board compensates with `gate-context.ts`, a regex
module that guesses structure out of prose two ways:

- `parseLabelledLines`: `[Severity] title` grouping for the findings
  view (GroupedContext, ReviewGateSheet's severity groups);
- `parseGateContext`: `=== key -- verdict -> recommend ===` sectioning
  with quote/adjudication lifting (OverviewStrip, QuestionContext).

The sectioned format's emitter was retired by the respond-gate program;
a repo-wide search finds no live producer. The labelled format is live:
the review engine and `board:review` emit it on every review-post gate.
Guessed structure is the opposite of designed intention, and the parsers
mis-file anything that drifts from the format they imagine.

## Decision

Two new shapes under the existing `gate-ctx` discriminant. All base-spec
rules apply verbatim: JSON document inside the existing context string
fields, unknown keys ignored, missing or wrong-typed required fields fail
the whole parse to prose, no partial parses, shared 8192-byte budget.

### `review@1` (gate-level `--context` of a review-post gate)

```json
{"gate-ctx": "review@1",
 "reviewer": "renee",
 "ready": true,
 "summary": "mechanism verified against the pinned deps; tests substantiate AC1/AC2 and fail on master; evidence attached.",
 "findings": {"critical": 0, "important": 1, "minor": 4},
 "round": 2,
 "re_review": true,
 "prior": {"addressed": 3, "still_open": 1}}
```

- Required: `ready` (boolean), `summary` (one or two sentences),
  `findings` (counts by severity; a severity with no findings may omit
  its key, absent reads 0).
- Optional: `reviewer` (the reviewing agent or person, when known),
  `round`, `re_review` (absent reads false), `prior` (re-review only:
  how the previous round's findings fared; both keys required when
  present).

### `findings@1` (each `findings-*` question's `context`)

```json
{"gate-ctx": "findings@1", "findings": [
  {"id": "f1", "severity": "important",
   "title": "retry fix is parity wiring, not a live fix",
   "file": "queue/enqueue.ts:81",
   "body": "the guard only runs on the parity path; the live path still re-enqueues. The full finding text, never truncated.",
   "fix": "note it is parity wiring in the doc comment",
   "disposition": "new"},
  {"id": "f2", "severity": "minor",
   "title": "test over-specifies the ordering",
   "file": "queue/enqueue.test.ts:132",
   "body": "asserts exact call order where the contract only promises the set.",
   "fix": "assert set membership"}
]}
```

- Required per entry: `id` (== that finding's option value), `severity`
  (`critical | important | minor`), `title`, `body`. Optional: `file`
  (`path:line`; a repo-wide finding has none), `fix` (the suggested
  change, one line), `evidence` (verbatim output backing the finding),
  `disposition` (`new | still-open | addressed-check`, re-review only:
  `still-open` re-raises a prior finding, `addressed-check` asks the
  human to confirm a claimed fix the reviewer verified).
- Join rule, exactly as `replies@1`: entries join their checkbox options
  by `id` == option value, and each `findings-N` question's context
  lists exactly its own options' entries. An entry with no option is not
  rendered; an option with no entry renders as today's plain checkbox.
- Option labels and descriptions remain (`[Severity] title` and a
  first-line hint) for surfaces without a card renderer; they are a
  degraded view, and nothing requires them to carry the full text
  anymore.
- The `outcome` question is untouched: its options already carry their
  meaning in plain descriptions.

### Size rule

The base spec's shared budget applies. Trim order for a review-post
open, dropping whole fields, never mid-text: `evidence` from the largest
finding first, then `fix` the same way, then `claim`-equivalent trims do
not exist here -- if it still does not fit, the whole gate goes prose,
never half-structured. `title`, `file`, and `body` are never trimmed; a
`body` too large to ever fit is an emitter defect, not a trim case.

## Renderer (apps/board)

- `parseGateCtx` gains the two shapes as further union members; every
  rule from the base spec's parser section applies.
- ReviewGateSheet renders its severity groups, finding rows, and the
  readiness header from `review@1` + `findings@1` when they parse:
  severity pill + title, accent `file:line`, full `body` in ink, `fix`
  as the muted action line, `disposition` as a small state pill on
  re-review rounds. The sheet's approved look does not change; its data
  source does.
- **`gate-context.ts` is deleted**, with its tests. GroupedContext,
  OverviewStrip, QuestionContext, and every sectioned/grouped branch in
  GateForm and DecisionQueueModal go with it. A context that is not
  valid gate-ctx renders as plain markdown -- no enrichment guessing,
  anywhere, for any gate kind.
- Fallback reality: historical gates and stragglers render as plain
  markdown. That is the intended end state, not a regression; the
  capture baselines that pinned the grouped/sectioned rendering are
  re-rendered.

## Emitters

- The review engine (mattstack-skills) builds the review-post open the
  way receive-review builds respond opens: a source JSON, the shared
  `gate-ctx.sh fit` (extended to validate the two new shapes), hand back
  to a gate-owning caller or `rt gate ask` on the direct path.
- `board:review` (apps) adopts the handed-back open exactly as
  `board:respond` did, including the pane-form prose flatten and the
  fits:false largest-first context drop from the base spec's amendments.
- Re-review passes fill `round`, `re_review`, `prior`, and per-finding
  `disposition` from the prior report -- the data the re-review mode
  already reads.
- gate-protocol's Structured context section gains the two shapes' rows.

## Non-goals

- No transport, daemon, or rt-client change.
- No visual redesign of the review sheet; the pen-approved layout
  stands.
- Other gate kinds (clarify, doctor-escalation, milestones) stay prose;
  nothing regex-parses them today.

## Testing

- Parser: both shapes' valid forms, every required-field omission,
  unknown keys accepted, wrong-typed fields fail whole -- mirroring the
  base spec's suite.
- Renderer: sheet from structured data per severity and disposition;
  plain-markdown fallback for prose gates; the deleted parsers' test
  files go with them, replaced by fallback-rendering tests.
- Emitter: gate-ctx.sh validation cases for the new shapes; fit/trim
  cases for evidence and fix drops; whole-gate prose fallback.
- Capture: re-rendered baselines for the review sheet (structured) and
  one prose-fallback gate, both schemes, looked at.

## Rollout

Renderer first (renders old prose gates as plain markdown -- the one
visible change landing early, accepted); emitters second (skills engine,
then the wrapper adoption); parser deletion rides the renderer change,
not a later cleanup. Stale board tabs show structured gates as raw JSON
until reload, as before.
