import { describe, expect, test } from 'bun:test';

import {
  claimWriterLease,
  LEASE_STALE_MS,
  renewWriterLease,
  writerRank,
  type WriterLeaseIo,
  type WriterLeaseRow,
} from '../state/writer-lease.ts';

const NOW = 1_000_000;

function held(over: Partial<WriterLeaseRow> = {}): WriterLeaseRow {
  return { pid: 7, rank: 0, bootedAt: NOW - 5_000, beatAt: NOW, ...over };
}

function io(
  over: Partial<WriterLeaseIo> & { row?: WriterLeaseRow | null } = {}
): WriterLeaseIo & { written: WriterLeaseRow | null } {
  let stored = over.row ?? null;
  const merged = {
    read: () => stored,
    write: (row: WriterLeaseRow) => {
      stored = row;
    },
    alive: () => true,
    now: () => 1_000_000,
    pid: 42,
    rank: 0,
    ...over,
  } as WriterLeaseIo & { written: WriterLeaseRow | null };
  Object.defineProperty(merged, 'written', { get: () => stored });
  return merged;
}

describe('claimWriterLease', () => {
  test('claims an unheld lease and records this process', () => {
    const deps = io({ row: null });

    expect(claimWriterLease(deps)).toBe(true);
    expect(deps.written).toEqual({
      pid: 42,
      rank: 0,
      bootedAt: 1_000_000,
      beatAt: 1_000_000,
    });
  });

  test('refuses while an equal-rank holder is alive and beating', () => {
    const deps = io({ row: held() });

    expect(claimWriterLease(deps)).toBe(false);
    expect(deps.written).toEqual(held());
  });

  test('takes over from a holder whose process is gone', () => {
    const deps = io({ row: held(), alive: () => false });

    expect(claimWriterLease(deps)).toBe(true);
    expect(deps.written?.pid).toBe(42);
  });

  test('takes over from a holder whose heartbeat went stale', () => {
    const deps = io({ row: held({ beatAt: NOW - LEASE_STALE_MS - 1 }) });

    expect(claimWriterLease(deps)).toBe(true);
    expect(deps.written?.pid).toBe(42);
  });

  test('outranks a live holder of lower rank', () => {
    const deps = io({ row: held({ rank: 0 }), rank: 1 });

    expect(claimWriterLease(deps)).toBe(true);
    expect(deps.written).toEqual({
      pid: 42,
      rank: 1,
      bootedAt: NOW,
      beatAt: NOW,
    });
  });

  test('stays read-only under a live holder of higher rank', () => {
    const deps = io({ row: held({ rank: 1 }), rank: 0 });

    expect(claimWriterLease(deps)).toBe(false);
    expect(deps.written).toEqual(held({ rank: 1 }));
  });
});

describe('renewWriterLease', () => {
  test('refreshes the heartbeat while we still hold the lease', () => {
    const deps = io({
      row: held({ pid: 42, beatAt: NOW - 20_000 }),
      now: () => NOW,
    });

    expect(renewWriterLease(deps)).toBe(true);
    expect(deps.written?.beatAt).toBe(NOW);
    expect(deps.written?.bootedAt).toBe(NOW - 5_000);
  });

  test('stands down once another process holds the lease', () => {
    const deps = io({ row: held({ pid: 9, rank: 1 }) });

    expect(renewWriterLease(deps)).toBe(false);
    expect(deps.written).toEqual(held({ pid: 9, rank: 1 }));
  });

  test('retakes a lease row that vanished under it', () => {
    const deps = io({ row: null });

    expect(renewWriterLease(deps)).toBe(true);
    expect(deps.written?.pid).toBe(42);
  });
});

describe('writerRank', () => {
  test('ranks a deck-supervised board above a hand-run one', () => {
    expect(writerRank({ MATTSTACK_CANONICAL_HOST: 'board.mattstack' })).toBe(1);
    expect(writerRank({})).toBe(0);
    expect(writerRank({ MATTSTACK_CANONICAL_HOST: '' })).toBe(0);
  });
});
