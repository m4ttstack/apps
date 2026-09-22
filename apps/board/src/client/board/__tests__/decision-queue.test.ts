import { describe, expect, test } from 'bun:test';

import type { GateRow } from '../../../gates/store.ts';
import type { BoardMRWithReview } from '../../types.ts';
import {
  advance,
  advanceOrWrap,
  backTo,
  queueView,
  reconcile,
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

test('nextPeek wraps with navigation, and never peeks the active gate itself', () => {
  const wrapping = session({ answered: ['g2'], activeId: 'g3' });
  expect(queueView(wrapping, entries).nextPeek).toBe('!1 · fix the thing');
  const lastRemaining = session({ answered: ['g1', 'g2'], activeId: 'g3' });
  expect(queueView(lastRemaining, entries).nextPeek).toBeUndefined();
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

test('forward after back behaves as before: skip still marks and advances past the gate', () => {
  const afterSkip = session({ skipped: ['g1'], activeId: 'g2' });
  const backId = backTo(afterSkip, afterSkip.activeId);
  expect(backId).toBe('g1');
  // Reproduces `skip()`'s own transition from g1: append to skipped, then
  // advanceOrWrap -- unchanged by having arrived at g1 via back rather than
  // as the queue's original start.
  const reSkipped = {
    ...afterSkip,
    skipped: [...afterSkip.skipped, backId!],
    activeId: backId,
  };
  expect(advanceOrWrap(reSkipped, entries, backId!)).toBe('g2');
});

test('position and pips track back to a gate already marked skipped', () => {
  const afterSkip = session({ skipped: ['g1'], activeId: 'g2' });
  expect(queueView(afterSkip, entries).position).toBe(2);

  const backId = backTo(afterSkip, afterSkip.activeId)!;
  const afterBack = { ...afterSkip, activeId: backId };
  const v = queueView(afterBack, entries);
  expect(v.position).toBe(1);
  // stateFor ranks a recorded skip over "is this the active gate", so the
  // pip for a revisited skipped gate stays skipped-colored even while it's
  // the one currently open.
  expect(v.states).toEqual(['skipped', 'todo', 'todo']);
});
