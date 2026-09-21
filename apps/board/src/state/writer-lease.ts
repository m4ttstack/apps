/**
 * Which board process owns this state root's autonomous side.
 *
 * Every board on a machine shares `~/.mattstack/board` unless it overrides
 * the state db, so a hand-run instance in a worktree consumes the same
 * agent-status journal as the supervised one and duplicates every effect it
 * has -- four latch threads on one MR, posted inside the same 70ms, because
 * each process's own dedupe read happened before any of them wrote.
 */
export interface WriterLeaseRow {
  pid: number;
  rank: number;
  bootedAt: number;
  beatAt: number;
}

export interface WriterLeaseIo {
  read(): WriterLeaseRow | null;
  write(row: WriterLeaseRow): void;
  /** Whether that pid is still a live process on this machine. */
  alive(pid: number): boolean;
  now(): number;
  pid: number;
  rank: number;
}

/** How long a holder may go without a heartbeat before the lease is free.
    Well above LEASE_BEAT_MS so a slow tick is never mistaken for a death. */
export const LEASE_STALE_MS = 60_000;

/**
 * Take the lease, or report that another live board already holds it.
 *
 * Rank, not arrival order, decides between two live processes: the
 * supervised instance boots whenever launchd says so, which on this machine
 * was hours after the hand-run strays, and it must still be the one that
 * writes. A lower-ranked holder is displaced and stands down on its next
 * renew.
 */
export function claimWriterLease(io: WriterLeaseIo): boolean {
  const now = io.now();
  const held = io.read();
  if (held && !free(held, io, now) && held.rank >= io.rank) return false;
  io.write({ pid: io.pid, rank: io.rank, bootedAt: now, beatAt: now });
  return true;
}

function free(row: WriterLeaseRow, io: WriterLeaseIo, now: number): boolean {
  return now - row.beatAt > LEASE_STALE_MS || !io.alive(row.pid);
}

/** How often the writer proves it is still here. */
export const LEASE_BEAT_MS = 15_000;

/**
 * Keep the lease, or discover it was taken. False is the writer's signal to
 * stop its autonomous side: a higher-ranked board has arrived and owns those
 * effects now.
 */
export function renewWriterLease(io: WriterLeaseIo): boolean {
  const held = io.read();
  if (held && held.pid !== io.pid) return false;
  const now = io.now();
  io.write({
    pid: io.pid,
    rank: io.rank,
    bootedAt: held?.bootedAt ?? now,
    beatAt: now,
  });
  return true;
}

/**
 * Deck injects MATTSTACK_CANONICAL_HOST into every app it supervises, so its
 * presence is what separates the managed board from one started by hand in a
 * worktree. A board that somehow has neither still claims an unheld lease,
 * which is the only case that matters when it is the sole instance.
 */
export function writerRank(env: Record<string, string | undefined>): number {
  return env.MATTSTACK_CANONICAL_HOST ? 1 : 0;
}
