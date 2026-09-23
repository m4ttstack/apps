import { describe, expect, test } from 'bun:test';

import type { GateRow } from '../../../gates/store.ts';
import type { BoardMRWithReview } from '../../types.ts';
import {
  advance,
  advanceOrWrap,
  backTo,
  forwardTo,
  markAnswered,
  markSkipped,
  queueView,
  reconcile,
  stepForward,
  type QueueEntry,
  type QueueSession,
} from '../decision-queue.ts';

function entry(
  gateId: string,
  iid: number,
  title = 'fix the thing'
): QueueEntry {
  return {
    gate: { gateId, status: 'open' } as GateRow,
    mr: { iid, title } as BoardMRWithReview,
  };
}
const session = (over: Partial<QueueSession> = {}): QueueSession => ({
  order: ['g1', 'g2', 'g3'],
  answered: [],
  skipped: [],
  activeId: 'g1',
  ...over,
});
const entries = [entry('g1', 1), entry('g2', 2), entry('g3', 3)];

test('view maps order to states and 1-based position', () => {
  const v = queueView(session({ answered: ['g1'], activeId: 'g2' }), entries);
  expect(v.states).toEqual(['done', 'active', 'todo']);
  expect(v.position).toBe(2);
  expect(v.nextPeek).toBe('!3 · fix the thing');
});

test('advance skips answered and skipped, never wraps backwards', () => {
  expect(advance(session({ skipped: ['g2'] }), entries, 'g1')).toBe('g3');
  expect(advance(session({ skipped: ['g2'] }), entries, 'g3')).toBeNull();
});

test('reconcile appends new gates without reshuffling', () => {
  const next = reconcile(session(), [...entries, entry('g4', 4)]);
  expect(next.order).toEqual(['g1', 'g2', 'g3', 'g4']);
});

test('reconcile retires a vanished active gate the data shows answered', () => {
  const next = reconcile(
    session(),
    [entry('g2', 2), entry('g3', 3)],
    null,
    new Set(['g1'])
  );
  expect(next.answered).toContain('g1');
  expect(next.activeId).toBe('g2');
});

test('reconcile keeps a vanished active gate absent without answer evidence', () => {
  // A transient snapshot (server restart warming its gate cache, a failed
  // poll) must never silently retire a real gate.
  const next = reconcile(session(), [entry('g2', 2), entry('g3', 3)]);
  expect(next.activeId).toBe('g1');
  expect(next.answered).not.toContain('g1');
});

test('reconcile keeps the whole queue through an empty snapshot', () => {
  const next = reconcile(session(), []);
  expect(next.activeId).toBe('g1');
  expect(next.answered).toEqual([]);
});

test('complete when nothing is left', () => {
  const v = queueView(
    session({ answered: ['g1', 'g2'], skipped: ['g3'], activeId: null }),
    entries
  );
  expect(v.complete).toBe(true);
});

test('a held vanished active stays active even with answer evidence', () => {
  // Hold outranks evidence: the CAS-loss face is showing the winning answer
  // and must survive the refresh that reports the gate answered.
  const next = reconcile(
    session(),
    [entry('g2', 2), entry('g3', 3)],
    'g1',
    new Set(['g1'])
  );
  expect(next.activeId).toBe('g1');
  expect(next.answered).not.toContain('g1');
});

test('hold cleared then reconcile retires the answered vanished active gate', () => {
  const next = reconcile(
    session(),
    [entry('g2', 2), entry('g3', 3)],
    null,
    new Set(['g1'])
  );
  expect(next.answered).toContain('g1');
  expect(next.activeId).toBe('g2');
});

test('advanceOrWrap wraps to the first remaining gate rather than completing', () => {
  // openAt a middle gate, then answer/skip forward off the end of order.
  const s = session({ answered: ['g2', 'g3'], activeId: 'g3' });
  expect(advanceOrWrap(s, entries, 'g3')).toBe('g1');
});

test('advanceOrWrap completes only once every gate is retired', () => {
  const s = session({ answered: ['g1', 'g2', 'g3'], activeId: 'g3' });
  expect(advanceOrWrap(s, entries, 'g3')).toBeNull();
});

test('nextPeek names the successor in order, and nothing on the last gate', () => {
  const middle = session({ answered: ['g3'], activeId: 'g2' });
  expect(queueView(middle, entries).nextPeek).toBe('!3 · fix the thing');
  const last = session({ answered: ['g1', 'g2'], activeId: 'g3' });
  expect(queueView(last, entries).nextPeek).toBeUndefined();
});

test('forward is positional: it steps onto skipped and answered gates alike', () => {
  const s = session({ skipped: ['g2'], answered: ['g3'], activeId: 'g1' });
  expect(forwardTo(s, entries, 'g1')).toBe('g2');
  expect(forwardTo(s, entries, 'g2')).toBe('g3');
  expect(forwardTo(s, entries, 'g3')).toBeNull();
  expect(forwardTo(s, entries, null)).toBeNull();
});

test('back to the first gate, then forward, lands on the second, not the first undecided one', () => {
  // The reported path: skip 1, 2, 3 (now on 4), back three times to 1,
  // then forward. Forward must go to 2, not jump to 4.
  const four = ['g1', 'g2', 'g3', 'g4'];
  const fourEntries = four.map((id, i) => entry(id, i + 1));
  let s: QueueSession = {
    order: four,
    answered: [],
    skipped: ['g1', 'g2', 'g3'],
    activeId: 'g4',
  };
  for (let i = 0; i < 3; i++) s = { ...s, activeId: backTo(s, s.activeId) };
  expect(s.activeId).toBe('g1');
  expect(forwardTo(s, fourEntries, s.activeId)).toBe('g2');
});

test('back from the second gate returns to the first', () => {
  expect(backTo(session({ activeId: 'g2' }), 'g2')).toBe('g1');
});

test('back is unavailable at the first', () => {
  expect(backTo(session({ activeId: 'g1' }), 'g1')).toBeNull();
  expect(backTo(session(), null)).toBeNull();
});

test('back does not clear a skip', () => {
  const s = session({ skipped: ['g1'], activeId: 'g2' });
  expect(backTo(s, s.activeId)).toBe('g1');
  // backTo is read-only over the session it's handed; the caller applies
  // the new activeId, so `skipped` on the input never changes shape here.
  expect(s.skipped).toEqual(['g1']);
});

test('next after back steps to the successor and keeps the skip mark', () => {
  const afterSkip = session({ skipped: ['g1'], activeId: 'g2' });
  const backed = { ...afterSkip, activeId: backTo(afterSkip, 'g2') };
  expect(backed.activeId).toBe('g1');
  const s = stepForward(backed, entries);
  expect(s.activeId).toBe('g2');
  // g1 was already skipped; stepping off it again must not add a copy.
  expect(queueView(s, entries).skippedCount).toBe(1);
  expect(queueView(s, entries).answeredCount).toBe(0);
});

test('stepping off an answered gate leaves it answered, not skipped', () => {
  const s = stepForward(session({ answered: ['g1'], activeId: 'g1' }), entries);
  expect(s.activeId).toBe('g2');
  expect(s.skipped).toEqual([]);
});

test('next on the last gate changes nothing', () => {
  const last = session({ activeId: 'g3' });
  expect(stepForward(last, entries)).toBe(last);
});

test('skipping through a 5-gate queue with a back-and-reskip never double-counts', () => {
  const five = ['g1', 'g2', 'g3', 'g4', 'g5'];
  const fiveEntries = five.map((id, i) => entry(id, i + 1));
  let s: QueueSession = {
    order: five,
    answered: [],
    skipped: [],
    activeId: 'g1',
  };
  s = stepForward(s, fiveEntries); // g1 -> g2
  s = stepForward(s, fiveEntries); // g2 -> g3
  s = { ...s, activeId: backTo(s, s.activeId) }; // back -> g2
  s = stepForward(s, fiveEntries); // g2 -> g3, no second copy of g2
  s = stepForward(s, fiveEntries); // g3 -> g4
  s = stepForward(s, fiveEntries); // g4 -> g5
  s = stepForward(s, fiveEntries); // last gate: stays on g5
  expect(s.activeId).toBe('g5');
  expect(s.skipped).toEqual(['g1', 'g2', 'g3', 'g4']);
  expect(queueView(s, fiveEntries).complete).toBe(false);
});

test('answering a gate reached by backing into a previous skip drops it from skipped', () => {
  const s = session({ skipped: ['g1'], activeId: 'g1' });
  const patch = markAnswered(s, 'g1');
  expect(patch.answered).toEqual(['g1']);
  expect(patch.skipped).toEqual([]);
  const v = queueView({ ...s, ...patch }, entries);
  expect(v.answeredCount).toBe(1);
  expect(v.skippedCount).toBe(0);
});

test('position and pips track back to a gate already marked skipped: active outranks skipped', () => {
  const afterSkip = session({ skipped: ['g1'], activeId: 'g2' });
  expect(queueView(afterSkip, entries).position).toBe(2);

  const backId = backTo(afterSkip, afterSkip.activeId)!;
  const afterBack = { ...afterSkip, activeId: backId };
  const v = queueView(afterBack, entries);
  expect(v.position).toBe(1);
  // g1 is the active gate now, even though it's still recorded as skipped
  // (back never clears that record): stateFor ranks "is this the active
  // gate" above "is this recorded as skipped", so the strip never loses
  // its "you are here" pip.
  expect(v.states).toEqual(['active', 'todo', 'todo']);
});
