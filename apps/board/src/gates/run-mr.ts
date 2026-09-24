import type {
  GateRow as FacilityGateRow,
  RtResponse,
  RunDetail,
} from '@mattstack/rt-client';
import { memoizeAsync } from '../memoize-async.ts';

const RUN_SUBJECT_PREFIX = 'run:';

/** A run that has not recorded its MR yet usually records it later (the
    ship stage writes `mr`), so a miss is retried after this long. */
export const RUN_MR_MISS_TTL_MS = 30_000;

/** Run ids keyed by the MR url each run recorded. */
export type RunMrLinks = ReadonlyMap<string, readonly string[]>;

export function runIdOf(subject: string): string | null {
  if (!subject.startsWith(RUN_SUBJECT_PREFIX)) return null;
  return subject.slice(RUN_SUBJECT_PREFIX.length) || null;
}

export function normalizeMrUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

/** Human-owned, or herd-owned once the daemon escalated it: a herd's own
    shepherd answers the rest, and the daemon rejects anyone else. */
export function isHumanOwned(row: FacilityGateRow): boolean {
  if (row.owner === 'human') return true;
  return (
    typeof row.owner === 'string' &&
    row.owner.startsWith('herd:') &&
    row.escalatedAt != null
  );
}

/** A pipeline gate the board shows on its MR: still waiting, and a
    human's to answer. An answered one leaves the row, since the pipeline
    run, not the board, carries it forward. */
export function isLiveRunGate(row: FacilityGateRow): boolean {
  if (runIdOf(row.subject) === null) return false;
  if (row.status !== 'open' && row.status !== 'parked') return false;
  return isHumanOwned(row);
}

/** The run's latest `mr` field when it holds a url; pipelines write `-` to
    clear a field. */
export function mrUrlFromRun(detail: RunDetail): string | null {
  let latest: { value: string; at: number } | null = null;
  for (const field of detail.fields) {
    if (field.key !== 'mr') continue;
    if (!latest || field.at >= latest.at) latest = field;
  }
  if (!latest || !/^https?:\/\//.test(latest.value)) return null;
  return normalizeMrUrl(latest.value);
}

export interface RunMrResolverIo {
  getRun(runId: string): Promise<RtResponse<RunDetail>>;
  now?: () => number;
}

/** Resolves pipeline runs to the MR each one recorded, through the
    daemon's `runs:get`. A found MR is cached for the life of the process; a
    miss (no MR yet, unknown run, daemon down) expires after `missTtlMs`. */
export class RunMrResolver {
  private readonly loaders = new Map<string, () => Promise<string | null>>();

  constructor(
    private readonly io: RunMrResolverIo,
    private readonly missTtlMs = RUN_MR_MISS_TTL_MS
  ) {}

  private resolve(runId: string): Promise<string | null> {
    let load = this.loaders.get(runId);
    if (!load) {
      load = memoizeAsync(
        async () => {
          try {
            const res = await this.io.getRun(runId);
            return res.ok && res.data ? mrUrlFromRun(res.data) : null;
          } catch {
            return null;
          }
        },
        mrUrl => mrUrl === null,
        { ttlMs: this.missTtlMs, now: this.io.now }
      );
      this.loaders.set(runId, load);
    }
    return load();
  }

  /** Links for every run with a live gate among `rows`. */
  async links(rows: FacilityGateRow[]): Promise<RunMrLinks> {
    const runIds = new Set<string>();
    for (const row of rows) {
      if (!isLiveRunGate(row)) continue;
      runIds.add(runIdOf(row.subject)!);
    }
    const resolved = await Promise.all(
      [...runIds].map(
        async runId => [runId, await this.resolve(runId)] as const
      )
    );
    const out = new Map<string, string[]>();
    for (const [runId, mrUrl] of resolved) {
      if (mrUrl === null) continue;
      const ids = out.get(mrUrl);
      if (ids) ids.push(runId);
      else out.set(mrUrl, [runId]);
    }
    return out;
  }
}
