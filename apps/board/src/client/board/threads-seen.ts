const KEY_PREFIX = 'board.threads.seen:';

/** Whether a thread count has grown since the board last recorded it. A
    missing record is a first sighting: not new, and the count becomes the
    baseline (otherwise every threaded row lights up on a fresh browser). */
export function threadNewness(
  seen: number | null,
  count: number
): { fresh: boolean; record: number | null } {
  if (seen === null) return { fresh: false, record: count };
  return { fresh: count > seen, record: null };
}

export function seenCount(webUrl: string): number | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + webUrl);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function markSeen(webUrl: string, count: number): void {
  try {
    localStorage.setItem(KEY_PREFIX + webUrl, String(count));
  } catch {
    // Storage can be unavailable (private mode, quota); the row simply
    // never lights up, which is the safe direction.
  }
}
