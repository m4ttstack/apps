# RED/GREEN: board:respond opens Gate 2 only for replies not yet seen

Scope: `apps/board/skills/respond/SKILL.md`, the `respond-plan` and
`respond-post` resume bullets, step 4's form branch (the pane answer
never carries `text`), step 5 (a `reply:` answer's `text`, recording
Gate 1's verb in each report row, the reply override, the
`code-changes: skip` branch), step 6 (the reply-only, nothing-to-offer
and offered cases, the self-built gate over offered threads only, the act
paragraph), step 7's `--posted` / `--held` definitions, the "Gate
protocol (both gates)" `text` line and the "Both gates are
non-negotiable" rule.

Method: the same as
`docs/superpowers/tests/2026-09-22-respond-post-per-thread/board-respond.md`.
Single-shot, tool-less reps, `claude --model sonnet --tools ""
--strict-mcp-config --append-system-prompt-file <system-file> -p
<scenario>`, a fresh empty directory per rep, 5 reps per scenario. System
file: the wrapper's SKILL.md itself. Every rep was read in full; Gate 2
`--questions` json was also parsed by a script.

Three wrapper versions appear below: **before** (the wrapper before this
change), **v1** (Gate 2 for fixed threads only) and **v2** (the final
wording: the spec's reply override and report-row rulings added to v1).

## Scenarios

All on one invented MR (!87), committed under `scenarios/`.

- `wrap-replies-only.md`: generic path, Gate 1 answered with two `reply:`
  threads (T1 carrying `text`) and `code-changes: skip`. Pass: no Gate 2
  opens; T1 posts the `text`, T2 its draft, neither resolved;
  `done ... --posted 2 --threads 2`.
- `wrap-fix-and-reply.md`: generic path, `fix:T1`, `reply:T2` with
  `text`, `code-changes: approve`, then a Gate 2 answer for T1 only.
  Pass: Gate 2's questions are exactly `thread-1` over `post:T1` /
  `resolve:T1`, both recommended; after it, T1 posts and resolves, T2
  posts its Gate 1 `text` unresolved; `--posted 2 --threads 2`.
- `wrap-resume-post.md`: a `respond-post` resume whose report rows carry
  Gate 1's verb, an edited reply's text in place of its draft. T1 fixed,
  T2 `reply` (edited), T3 `skip`, and T4 recommended `reply` but
  answered `skip` with its draft still in the row. Pass: `drafting`
  first; T1 posts and resolves; T2 posts the edited text unresolved; T4
  does not post; `--posted 2 --threads 4 --held 2`.
- `wrap-plan-pane-note.md` (a probe for a loophole the edit could open):
  the in-pane Gate 1 form, where the human picks reply on both and types
  a replacement for T1 in the free-text field. Pass: the `gate answer`
  json carries no `text` and the typed string rides as `note`; no Gate 2
  opens; both drafts post unresolved; `--posted 2 --threads 2`.
- `wrap-reply-override.md`: T1 recommended `fix` (its card showed only
  the fix direction) answered `reply:T1` with no `text`; T2 recommended
  `reply` answered `reply:T2`; `code-changes: skip`. Pass: Gate 2's
  questions are exactly `thread-1` with `post:T1` (recommended) then
  `resolve:T1` (not recommended); T2 posts only after Gate 2's answer;
  T1 posts its reply drafted after Gate 1; neither resolved;
  `--posted 2 --threads 2`.

## RED

- wrap-replies-only, before: 0/5. Every rep opened a `respond-post` gate
  over both reply threads and posted nothing before it. All five did take
  T1's `text` as its reply, so reading `text` needed no teaching; the
  failure is structural.
- wrap-fix-and-reply, before: 0/5. Every rep offered T2 at Gate 2 beside
  T1, then posted only T1 (the answer had no `thread-2` key) and wrote
  `--posted 1 --threads 2 --held 1`.
- wrap-resume-post, before: 0/5. Every rep posted and resolved T1 and
  never posted T2 (`--posted 1`). The first run used a three-thread
  report without T4 (0/5, the same failure); the four-thread report
  scored 0/5 again, `--held 2` or `--held 3`. On v1 the four-thread
  report scored 5/5: T4 stayed down in every rep, so its case guards
  against regression.
- wrap-plan-pane-note, before: 0/5. The answer json was already
  `note`-only in 5/5, but every rep opened a Gate 2 over both threads,
  and every rep folded the typed note into T1's report reply.
- wrap-reply-override, before: 0/5. Every rep offered both T1 and T2 at
  Gate 2 and posted only T1 (`--posted 1`).
- wrap-reply-override, v1: 0/5. Every rep improvised a Gate 2 for T1, but
  four dropped the `resolve:T1` option, and three posted T2 before
  Gate 2 opened.

## GREEN

v1, first wording: wrap-replies-only 5/5, wrap-fix-and-reply 5/5 (parsed:
exactly `thread-1`, `post:T1` then `resolve:T1`, both recommended),
wrap-resume-post (three-thread report) 5/5, wrap-plan-pane-note 5/5. The
full read then found step 4's option-value paragraph still unwrapping
`{value, note}`; it now says `{value, note, text}` like the rest, and the
four re-ran on that file at 5/5 each.

v2, the final wording, first pass, 5/5 in every scenario:

- wrap-replies-only 5/5.
- wrap-fix-and-reply 5/5, parsed.
- wrap-resume-post 5/5: `drafting` first, T4 never posted.
- wrap-plan-pane-note 5/5.
- wrap-reply-override 5/5, parsed: `resolve:T1` present and not
  recommended; T2 posted after the answer in all five.

## Regressions, and the scenarios this retires

The per-thread record's premise that Gate 2 offers every thread with a
finalized reply is retired: a reply-only thread no longer appears in
Gate 2. Its scenario files stay as they were, as a record; the
updated versions live here. All on v2:

- `wrap-build` (the per-thread file, unchanged; pass criteria updated):
  the questions are now exactly `thread-1` (T1) with `post:T1` then
  `resolve:T1`, both recommended, `--kind respond-post`; T2 (reply-only)
  and T3 (skipped) absent; nothing posts before the wait. 5/5, parsed
  (also 5/5 on v1).
- `wrap-counts` (updated here): the fitted open file now offers only the
  fixed threads T1 and T4; T4 is answered resolve-only and the domain
  skill reports T2's reply posted from Gate 1. Pass:
  `--posted 2 --threads 4 --held 2`. 5/5 (also 5/5 on v1). The wrapper
  before this change also wrote the right counts in 5/5, but every rep
  called T2's post a gate bypass and flagged it to the human.
- `wrap-none` (the per-thread file, unchanged): 5/5, no Gate 2,
  `--posted 0 --threads 2 --held 2` (also 5/5 on v1).
- `wrap-edited` (updated here): Gate 2 now offers T1 only, answered
  `{"value": ["post:T1"], "text": "..."}`. Pass: T1 posts the `text`, T2
  posts its report reply unresolved, `--posted 2 --threads 2`. 5/5 (also
  5/5 on v1). The wrapper before this change scored 0/5: every rep
  posted only T1 and called leaving T2 out of Gate 2 its own mistake.

`wrap-text-no-post`, `wrap-pane-note` and `wrap-resume-edited` in the
per-thread record also put the reply-only T2 into Gate 2; they were not
re-run. `wrap-resume-post` here covers a resume with edited text.

## Verdict

Gate 2 now offers exactly the replies the developer has not yet seen word
for word (fixed threads and reply overrides). Reply-only threads post
from Gate 1's answer (its `text` when present), and the counts include
them.
