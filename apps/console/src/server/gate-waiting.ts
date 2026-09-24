import type { GateRow } from '@mattstack/rt-client';

export type RunGateMarker = 'blocked' | 'shepherd';

export function isWaiting(g: GateRow): boolean {
  return g.status === 'open' || g.status === 'parked';
}

/** Legacy rows carry a null owner; they are Matt's. A `herd:*` owner can
    only be answered by that herd's shepherd. */
export function isMine(g: GateRow): boolean {
  return g.owner == null || g.owner === 'human';
}

export function runGateMarker(
  gates: GateRow[] | undefined,
  runId: string
): RunGateMarker | null {
  const subject = `run:${runId}`;
  const waiting = (gates ?? []).filter(g => g.subject === subject && isWaiting(g));
  if (waiting.some(isMine)) return 'blocked';
  return waiting.length > 0 ? 'shepherd' : null;
}

/** The board owns pane-attention gates; counting them here too would
    double-count a wedged run on the dock. */
export function countsForConsoleBadge(g: GateRow): boolean {
  return (
    g.subject.startsWith('run:') &&
    g.kind !== 'pane-attention' &&
    isWaiting(g) &&
    isMine(g)
  );
}
