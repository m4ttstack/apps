import { useCallback, useEffect, useRef, useState } from 'react';

import type { GateRow } from '../../gates/store.ts';
import type { BoardMRWithReview } from '../types.ts';
import type { TriageGateState } from './DecisionQueueModal.tsx';
import { cleanTitle } from './format.ts';

export interface QueueEntry {
  gate: GateRow;
  /** Absent for a `queueExtras` entry (a human-owned gate with no MR row --
      a pane-attention gate is the first kind of these) -- the modal renders
      its strip and face off `gate` alone when this is undefined. */
  mr?: BoardMRWithReview;
}

export interface QueueView {
  open: boolean;
  active: QueueEntry | null;
  position: number;
  states: TriageGateState[];
  nextPeek: string | undefined;
  complete: boolean;
  answeredCount: number;
  skippedCount: number;
}

export interface DecisionQueue extends QueueView {
  openAtStart: () => void;
  openAt: (gateId: string) => void;
  close: () => void;
  skip: () => void;
  back: () => void;
  noteAnswered: (gateId: string) => void;
  hold: (gateId: string | null) => void;
}

/** The queue's own state: `order` is append-only for the life of a session
    (closing resets it) so polling entries never reshuffles the pips a user
    is already looking at. */
export interface QueueSession {
  order: string[];
  answered: string[];
  skipped: string[];
  activeId: string | null;
}

const CLOSED_SESSION: QueueSession = {
  order: [],
  answered: [],
  skipped: [],
  activeId: null,
};

function entryFor(
  entries: QueueEntry[],
  gateId: string | null
): QueueEntry | null {
  if (gateId === null) return null;
  return entries.find(e => e.gate.gateId === gateId) ?? null;
}

function stateFor(session: QueueSession, gateId: string): TriageGateState {
  if (session.answered.includes(gateId)) return 'done';
  // `back` can return to a gate already marked skipped -- rank active
  // above skipped so the strip never loses its "you are here" pip.
  if (session.activeId === gateId) return 'active';
  if (session.skipped.includes(gateId)) return 'skipped';
  return 'todo';
}

/** Adds `gateId` to `skipped` if it is not there already. `back` can return
    to a gate that was already skipped, and forward from there re-skips it
    -- without this guard that would push a second copy and inflate
    `skippedCount` past the queue's own length. */
export function markSkipped(session: QueueSession, gateId: string): string[] {
  return session.skipped.includes(gateId)
    ? session.skipped
    : [...session.skipped, gateId];
}

/** Adds `gateId` to `answered` if it is not there already, and drops it
    from `skipped`. A gate is answered or skipped, never both: answering
    one reached by backing into a previously-skipped gate must not leave a
    stale copy in `skipped` double-counting it. */
export function markAnswered(
  session: QueueSession,
  gateId: string
): Pick<QueueSession, 'answered' | 'skipped'> {
  const answered = session.answered.includes(gateId)
    ? session.answered
    : [...session.answered, gateId];
  const skipped = session.skipped.includes(gateId)
    ? session.skipped.filter(id => id !== gateId)
    : session.skipped;
  return { answered, skipped };
}

export function queueView(
  session: QueueSession,
  entries: QueueEntry[]
): QueueView {
  const states = session.order.map(id => stateFor(session, id));
  const active = entryFor(entries, session.activeId);
  const position = session.activeId
    ? session.order.indexOf(session.activeId) + 1
    : 0;
  // The peek names where the next-gate control lands: the successor in
  // order, none on the last gate.
  const nextEntry = entryFor(
    entries,
    forwardTo(session, entries, session.activeId)
  );
  return {
    open: false,
    active,
    position,
    states,
    nextPeek: nextEntry
      ? nextEntry.mr
        ? `!${nextEntry.mr.iid} · ${cleanTitle(nextEntry.mr.title)}`
        : nextEntry.gate.label
      : undefined,
    complete: session.activeId === null && session.order.length > 0,
    answeredCount: session.answered.length,
    skippedCount: session.skipped.length,
  };
}

/** Walks `order` forward from `from`'s successor only, so a skipped gate
    never comes back around this session (no wraparound to earlier ids). */
export function advance(
  session: QueueSession,
  entries: QueueEntry[],
  from: string | null
): string | null {
  const startIndex = from === null ? -1 : session.order.indexOf(from);
  for (let i = startIndex + 1; i < session.order.length; i++) {
    const id = session.order[i]!;
    if (session.answered.includes(id) || session.skipped.includes(id)) continue;
    if (entryFor(entries, id)) return id;
  }
  return null;
}

/** `advance` only ever walks forward from `from`, so a gate retired mid-order
    (entered via a row chip, or the sole vanished active gate) would otherwise
    hit `complete` while earlier gates are still todo. Falling back to a
    from-null walk wraps to the first remaining gate instead. */
export function advanceOrWrap(
  session: QueueSession,
  entries: QueueEntry[],
  from: string
): string | null {
  return advance(session, entries, from) ?? advance(session, entries, null);
}

/** Walks `order` back to `from`'s predecessor. Never consults `answered` or
    `skipped` -- looking back is a view change, not a decision, so it costs
    nothing to revisit a gate already marked either way. Unavailable at (or
    before) the first entry, where there is no predecessor to return to. */
export function backTo(
  session: QueueSession,
  from: string | null
): string | null {
  if (from === null) return null;
  const idx = session.order.indexOf(from);
  if (idx <= 0) return null;
  return session.order[idx - 1] ?? null;
}

/** `backTo`'s mirror: `from`'s successor in `order` that still has an
    entry. Also a view change, so it never consults `answered` or `skipped`
    and never wraps; null on the last gate. */
export function forwardTo(
  session: QueueSession,
  entries: QueueEntry[],
  from: string | null
): string | null {
  if (from === null) return null;
  const idx = session.order.indexOf(from);
  if (idx < 0) return null;
  for (let i = idx + 1; i < session.order.length; i++) {
    const id = session.order[i]!;
    if (entryFor(entries, id)) return id;
  }
  return null;
}

/** The next-gate control's transition: onto the successor in order,
    marking the gate it leaves skipped unless that gate was answered; the
    session unchanged on the last gate. */
export function stepForward(
  session: QueueSession,
  entries: QueueEntry[]
): QueueSession {
  if (session.activeId === null) return session;
  const target = forwardTo(session, entries, session.activeId);
  if (target === null) return session;
  const left = session.answered.includes(session.activeId)
    ? session
    : { ...session, skipped: markSkipped(session, session.activeId) };
  return { ...left, activeId: target };
}

/** Appends unseen actionable gates to `order` without touching existing
    positions, then retires an activeId that has vanished from entries ONLY
    when `answeredIds` positively shows it answered elsewhere -- absence
    alone is not evidence (a restarted board server briefly serves gate-less
    MRs while its cache re-ingests, and a failed poll looks the same), so a
    merely-missing active gate stays active until the data says otherwise.
    `heldId` outranks even answer evidence: the lost-answer face is showing
    the winning answer and must survive the refresh that reports it. */
export function reconcile(
  session: QueueSession,
  entries: QueueEntry[],
  heldId: string | null = null,
  answeredIds?: ReadonlySet<string>
): QueueSession {
  const seen = new Set(session.order);
  const appended = entries.map(e => e.gate.gateId).filter(id => !seen.has(id));
  const order = appended.length
    ? [...session.order, ...appended]
    : session.order;

  if (
    session.activeId !== null &&
    !entryFor(entries, session.activeId) &&
    (heldId === null || heldId !== session.activeId) &&
    answeredIds?.has(session.activeId)
  ) {
    const next = {
      ...session,
      order,
      ...markAnswered(session, session.activeId),
    };
    return {
      ...next,
      activeId: advanceOrWrap(next, entries, session.activeId),
    };
  }

  return order === session.order ? session : { ...session, order };
}

export function useDecisionQueue(
  entries: QueueEntry[],
  answeredIds?: ReadonlySet<string>
): DecisionQueue {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<QueueSession>(CLOSED_SESSION);
  const [heldId, setHeldId] = useState<string | null>(null);
  // The last snapshot's entry for the current active gate, so the modal can
  // keep rendering it through a transient snapshot that dropped the gate
  // without answering it.
  const lastActiveEntry = useRef<QueueEntry | null>(null);

  useEffect(() => {
    if (!open) return;
    setSession(s => reconcile(s, entries, heldId, answeredIds));
  }, [open, entries, heldId, answeredIds]);

  const openAtStart = useCallback(() => {
    const order = entries.map(e => e.gate.gateId);
    setSession({
      order,
      answered: [],
      skipped: [],
      activeId: order[0] ?? null,
    });
    setOpen(true);
  }, [entries]);

  const openAt = useCallback(
    (gateId: string) => {
      if (!entryFor(entries, gateId)) {
        openAtStart();
        return;
      }
      const order = entries.map(e => e.gate.gateId);
      setSession({ order, answered: [], skipped: [], activeId: gateId });
      setOpen(true);
    },
    [entries, openAtStart]
  );

  const close = useCallback(() => {
    setOpen(false);
    setSession(CLOSED_SESSION);
    setHeldId(null);
    lastActiveEntry.current = null;
  }, []);

  const skip = useCallback(() => {
    setSession(s => stepForward(s, entries));
  }, [entries]);

  const noteAnswered = useCallback(
    (gateId: string) => {
      setHeldId(h => (h === gateId ? null : h));
      setSession(s => {
        const next = { ...s, ...markAnswered(s, gateId) };
        return { ...next, activeId: advanceOrWrap(next, entries, gateId) };
      });
    },
    [entries]
  );

  const back = useCallback(() => {
    setSession(s => {
      const prev = backTo(s, s.activeId);
      return prev === null ? s : { ...s, activeId: prev };
    });
  }, []);

  const hold = useCallback((gateId: string | null) => {
    setHeldId(gateId);
  }, []);

  const view = queueView(session, entries);

  // Bridge a transient snapshot: an active gate reconcile kept (absent but
  // not evidenced answered) has no entry this render, so serve the last
  // snapshot's copy rather than blanking the open modal.
  if (view.active) {
    lastActiveEntry.current = view.active;
  } else if (
    session.activeId !== null &&
    lastActiveEntry.current?.gate.gateId === session.activeId
  ) {
    view.active = lastActiveEntry.current;
  }

  return {
    ...view,
    open,
    openAtStart,
    openAt,
    close,
    skip,
    back,
    noteAnswered,
    hold,
  };
}
