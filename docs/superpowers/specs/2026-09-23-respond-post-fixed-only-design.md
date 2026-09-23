# The respond post step asks only about fixed threads

Date: 2026-09-23. Status: direction approved in chat, spec under review.

## Problem

Gate 1 (respond-plan) already shows a reply-only thread's exact reply
(`thread@1` `reply.kind: verbatim`). Gate 2 (respond-post) then asks
whether to post that same text. A review with two pushbacks and no fixes
produced two identical decisions in a row: reply, reply at gate 1, then
post, post at gate 2.

Gate 2 only adds something when a fix rewrote a reply after gate 1: a
fixed thread's reply is finalized in step 5 ("Fixed: file:line", with the
commit), text the developer has not seen yet.

## Decided in chat

- Gate 2 lists only threads whose reply was written after a fix.
- Reply-only threads post from gate 1's answer, unresolved, so the
  reviewer can answer them.
- No fixes, no gate 2.
- The edit button moves onto gate 1's reply text too, so every reply
  stays editable before it posts.

## Flow

- **Gate 1** keeps its shape: one `reply:` / `fix:` / `skip:` question per
  thread, plus `code-changes`. A `reply:` answer may carry `text`, the
  edited reply (`{"value": "reply:<id>", "text": "..."}`, the same answer
  field rt-client 0.30.0 already declares).
- **`code-changes: skip`, or no thread answered `fix:`:** post every
  `reply:` thread's reply (the answer's `text` when present, the drafted
  `reply.text` otherwise), never resolving; record; close. No gate 2.
- **`code-changes: approve`:** implement the `fix:` threads (step 5), then
  gate 2 offers only those fixed threads, post/resolve as today. After
  gate 2, the reply-only threads post from gate 1 together with gate 2's
  picks, so the reviewer gets every reply in one pass.
- **`code-changes: revise`:** unchanged.
- **`skip:`** still means no reply and no fix; it is how a reply is held
  at gate 1.

## Records

- `respond-plan` gains an optional sibling map for edited replies, so the
  existing `threads` map keeps its string values:
  `{"threads": {"T1": "reply", "T2": "fix"}, "texts": {"T1": "<edited reply>"}, "code-changes": "approve"}`.
- `respond-post` covers only the threads gate 2 offered, as today. With no
  fixed thread there is no `respond-post` gate and no `respond-post`
  record; the plan record covers the replies that posted.

## Skills

- **receive-review:** step 4 reads a `reply:` answer's `text` and records
  it; step 6 offers only fix threads finalized in step 5 and posts the
  reply-only threads from gate 1; the "no thread offered" rule becomes
  "post the reply-only threads, open no gate 2". The in-pane form never
  sends `text`, as today.
- **board:respond wrapper:** the same flow. `--posted` counts every
  thread that got a reply, reply-only threads included; `--held` counts
  `skip:` threads, fixes held out under `code-changes: skip`, and gate 2
  holds.

## Board

- **Plan sheet:** a thread card picked `reply:` with a verbatim reply gets
  the post card's editable reply (edit / done / reset to draft, the grey
  `edited` chip). `fix:` threads keep their direction text (the reply is
  written after the fix); `skip:` threads show nothing to edit.
- **Answer:** an edited `reply:` thread answers
  `{"value": "reply:<id>", "text": "<trimmed edit>"}`, only when the edit
  differs from the draft; an emptied reply blocks submit with the same
  dock reason.
- **Dock copy:** with no fix picked, "Next, the replies post."; with
  fixes, "Next, N fixes get implemented, then you approve the fixed
  replies before anything posts."
- **Recap outcome:** a plan gate with an edit reads like
  `2 replies (1 edited)`; the console chip is unchanged.

## Ship order

Readers first: receive-review in mattstack-skills (it reads gate 1's
`text` and stops offering reply-only threads at gate 2), then the apps PR
(the wrapper and the plan-sheet edit). Until the apps PR lands, the board
sends no gate 1 `text`, so the skills change is safe alone.

## Testing

- **Skills (writing-skills TDD):** a plan answer with two replies (one
  edited) and no fixes posts both, the edited text for one, and opens no
  gate 2; a plan with one fix and one reply offers only the fixed thread at
  gate 2 and posts the reply-only thread with it; post-build and the
  per-thread scenarios re-run with no regression; full reads after sync.
- **Board:** plan-sheet DOM tests for the edit on a `reply:` card, none on
  `fix:` / `skip:`, the answer shape, the dock copy; Fast Browser
  screenshots of the plan card at rest, editing and edited, both schemes.

## Out of scope

- Resolving reply-only threads (they stay open for the reviewer).
- Editing in the in-pane form.
