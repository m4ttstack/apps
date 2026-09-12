import { respondOutcome } from '../../respond-outcome.ts';
import type { BoardMRWithReview, DraftInfo } from '../types.ts';
import {
  activeReviewers,
  ago,
  DOCTOR_LABEL,
  draftKey,
  laneInterrupted,
  NUDGE_RETRYABLE,
} from './format.ts';

export type Tone = 'bad' | 'warn' | 'work' | 'go' | 'quiet' | 'clear';

export type VerbKind =
  | 'relaunch'
  | 'clear'
  | 'answer'
  | 'read-review'
  | 'read-respond'
  | 'resume-respond'
  | 'focus'
  | 'launch-review'
  | 'restart-respond'
  | 'call-doctor'
  | 're-review'
  | 'read-note'
  | 'view-peer'
  | 'open-mr';

export interface Verb {
  kind: VerbKind;
  label: string;
  gateId?: string;
  domain?: 'review' | 'respond' | 'doctor';
  agentId?: string;
  draft?: DraftInfo;
}

export interface StatusLine {
  tone: Tone;
  word: string;
  detail?: string;
  spin?: boolean;
  verbs: Verb[];
}

export interface RowStatus {
  line: StatusLine;
  more: StatusLine[];
  bar: 'bad' | 'warn' | null;
}

/** Shared with the decision queue's stuck/unassigned face so the row and
    the queue card never drift on wording. */
export const DELIVERY_STUCK_MESSAGE = "pane didn't pick up the answer";
export const EXECUTION_UNASSIGNED_MESSAGE = 'answered, no pane to execute';

const TONE_RANK: Record<Tone, number> = {
  bad: 0,
  warn: 1,
  work: 2,
  go: 3,
  quiet: 4,
  clear: 5,
};

const RESPOND_WORKING: Record<string, string> = {
  triaging: 'triaging…',
  implementing: 'implementing…',
  drafting: 'drafting replies…',
};

const DOCTOR_WORKING = new Set([
  'diagnosing',
  'rebasing',
  'fixing',
  'watching',
]);

type Resolved = ReadonlyMap<string, 'posted' | 'dismissed'>;

function agoMs(ms: number | undefined, now: number): string | undefined {
  if (!ms) return undefined;
  return `${ago(new Date(ms).toISOString(), now)} ago`;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function gateLines(mr: BoardMRWithReview): StatusLine[] {
  const out: StatusLine[] = [];
  for (const gate of mr.gates ?? []) {
    if (gate.status === 'open' || gate.status === 'parked') {
      out.push({
        tone: 'warn',
        word: lowerFirst(gate.questions[0]?.label ?? gate.label),
        detail: gate.status === 'parked' ? 'parked' : undefined,
        verbs: [{ kind: 'answer', label: 'answer', gateId: gate.gateId }],
      });
      continue;
    }
    if (gate.status !== 'answered') continue;
    if (gate.delivery?.outcome === 'stuck') {
      out.push({
        tone: 'bad',
        word: DELIVERY_STUCK_MESSAGE,
        verbs: [{ kind: 'answer', label: 'retry', gateId: gate.gateId }],
      });
      continue;
    }
    if (gate.execution === 'unassigned') {
      out.push({
        tone: 'bad',
        word: EXECUTION_UNASSIGNED_MESSAGE,
        verbs: [{ kind: 'answer', label: 'relaunch', gateId: gate.gateId }],
      });
      continue;
    }
    const summary = Object.values(gate.answers ?? {})
      .flatMap(v => (Array.isArray(v) ? v : [v]))
      .map(String)
      .join(', ');
    out.push({
      tone: 'quiet',
      word: 'answered',
      detail: summary || undefined,
      verbs: [],
    });
  }
  return out;
}

/** Which lane a gone orphan belongs to, resolved once and shared by the
    orphan line and both lane lines: a lane checking `laneInterrupted`
    against only its own info would also match on a lane that merely lacks
    a sessionId, suppressing a lane the orphan never touched. */
function orphanDomain(mr: BoardMRWithReview): 'review' | 'respond' {
  const orphan = mr.orphan!;
  if (laneInterrupted(orphan, mr.review)) return 'review';
  if (laneInterrupted(orphan, mr.respond)) return 'respond';
  if (mr.review?.status === 'queued' || mr.review?.status === 'reviewing')
    return 'review';
  if (
    mr.respond &&
    mr.respond.status !== 'done' &&
    mr.respond.status !== 'error'
  )
    return 'respond';
  return 'review';
}

function orphanLine(mr: BoardMRWithReview, now: number): StatusLine | null {
  const orphan = mr.orphan;
  if (!orphan) return null;
  const domain = orphanDomain(mr);
  if (orphan.state === 'hidden') {
    return {
      tone: 'quiet',
      word: 'off-screen',
      detail: 'pane hidden, still running',
      verbs: [{ kind: 'focus', label: 'focus', domain }],
    };
  }
  if (orphan.state !== 'gone') return null;
  const lane = domain === 'respond' ? 'response' : 'review';
  return {
    tone: 'warn',
    word: `${lane} interrupted`,
    detail: `pane closed ${agoMs(orphan.since, now) ?? 'just now'}`,
    verbs: [
      { kind: 'relaunch', label: 'relaunch', domain },
      { kind: 'clear', label: 'clear', agentId: orphan.agentId },
    ],
  };
}

function reviewLine(mr: BoardMRWithReview, now: number): StatusLine | null {
  const r = mr.review;
  if (!r) return null;
  if (mr.orphan?.state === 'gone' && orphanDomain(mr) === 'review') return null;
  switch (r.status) {
    case 'queued':
      return { tone: 'quiet', word: 'review queued', verbs: [] };
    case 'reviewing':
      return {
        tone: 'work',
        word: 'review running…',
        spin: true,
        detail:
          r.message ||
          (r.startedAt ? `started ${agoMs(r.startedAt, now)}` : undefined),
        verbs: [{ kind: 'focus', label: 'focus', domain: 'review' }],
      };
    case 'done': {
      const outcome = (r as { outcome?: string }).outcome;
      return {
        tone: 'go',
        word: 'review ready',
        detail:
          outcome === 'approve'
            ? 'approved'
            : outcome === 'comment'
              ? 'commented'
              : undefined,
        verbs: r.reportReady ? [{ kind: 'read-review', label: 'read ↗' }] : [],
      };
    }
    case 'error':
      return {
        tone: 'bad',
        word: 'review failed',
        detail: r.message || undefined,
        verbs: [{ kind: 'launch-review', label: 'launch again' }],
      };
  }
}

function respondLine(mr: BoardMRWithReview): StatusLine | null {
  const r = mr.respond;
  if (!r) return null;
  if (mr.orphan?.state === 'gone' && orphanDomain(mr) === 'respond')
    return null;
  if (r.status === 'queued')
    return { tone: 'quiet', word: 'response queued', verbs: [] };
  if (r.status in RESPOND_WORKING) {
    return {
      tone: 'work',
      word: RESPOND_WORKING[r.status]!,
      spin: true,
      detail: r.message || undefined,
      verbs: [{ kind: 'focus', label: 'focus', domain: 'respond' }],
    };
  }
  if (r.status === 'error') {
    return {
      tone: 'bad',
      word: 'response failed',
      detail: r.message || undefined,
      verbs: [{ kind: 'restart-respond', label: 'restart' }],
    };
  }
  const outcome = respondOutcome(r.posted, r.threads);
  const posted = Math.min(r.posted ?? 0, r.threads ?? 0);
  const threads = r.threads ?? 0;
  switch (outcome) {
    case 'posted':
      return {
        tone: 'go',
        word: 'replies posted',
        detail: `${threads} of ${threads}`,
        verbs: r.reportReady ? [{ kind: 'read-respond', label: 'read ↗' }] : [],
      };
    case 'partial':
      return {
        tone: 'warn',
        word: `${posted} of ${threads} posted`,
        detail:
          threads - posted === 1
            ? 'one thread waiting'
            : `${threads - posted} threads waiting`,
        verbs: [{ kind: 'resume-respond', label: 'resume ↗' }],
      };
    case 'drafted':
      return {
        tone: 'warn',
        word: 'drafted, not posted',
        verbs: [{ kind: 'resume-respond', label: 'resume ↗' }],
      };
    case 'none':
      return { tone: 'go', word: 'no replies needed', verbs: [] };
    default:
      return { tone: 'quiet', word: 'response done', verbs: [] };
  }
}

function doctorLine(mr: BoardMRWithReview): StatusLine | null {
  const d = mr.doctor;
  if (!d) return null;
  if (d.status === 'queued')
    return { tone: 'quiet', word: 'doctor queued', verbs: [] };
  if (DOCTOR_WORKING.has(d.status)) {
    return {
      tone: 'work',
      word: DOCTOR_LABEL[d.status],
      spin: true,
      detail: d.origin === 'auto' ? 'auto' : d.message || undefined,
      verbs: [{ kind: 'focus', label: 'focus', domain: 'doctor' }],
    };
  }
  if (d.status === 'done') {
    return {
      tone: 'go',
      word: 'diagnosed',
      detail: d.message || undefined,
      verbs: [],
    };
  }
  return {
    tone: 'bad',
    word: 'doctor stuck',
    detail: d.message || undefined,
    verbs: [{ kind: 'call-doctor', label: 'call again' }],
  };
}

function socialLines(
  mr: BoardMRWithReview,
  now: number,
  resolved: Resolved
): StatusLine[] {
  const out: StatusLine[] = [];
  for (const n of mr.nudges ?? []) {
    out.push({
      tone: 'warn',
      word: `${n.from} asked for a re-review`,
      detail: agoMs(n.receivedAt, now),
      verbs: [{ kind: 're-review', label: 're-review' }],
    });
  }
  for (const draft of mr.drafts ?? []) {
    if (resolved.get(draftKey(mr.webUrl ?? '', draft.kind))) continue;
    out.push({
      tone: 'warn',
      word: `held: ${draft.kind}`,
      detail: 'doctor draft',
      verbs: [{ kind: 'read-note', label: 'read', draft }],
    });
  }
  const sent = mr.sentNudge;
  if (sent) {
    if (NUDGE_RETRYABLE.has(sent.display)) {
      out.push({
        tone: 'warn',
        word: `nudge to ${sent.reviewer} went unanswered`,
        detail: (sent as { reason?: string }).reason,
        verbs: [],
      });
    } else if (sent.display === 'requested') {
      const at = (sent as { sentAt?: number }).sentAt;
      out.push({
        tone: 'quiet',
        word: `nudged ${sent.reviewer}`,
        detail: at
          ? `no answer yet, ${ago(new Date(at).toISOString(), now)}`
          : 'no answer yet',
        verbs: [],
      });
    } else {
      out.push({
        tone: 'work',
        word: `${sent.reviewer} re-reviewing…`,
        spin: true,
        verbs: [],
      });
    }
  }
  for (const p of mr.peerReviews ?? []) {
    if (p.status === 'queued' || p.status === 'reviewing') {
      out.push({
        tone: 'work',
        word: `${p.reviewer} is reviewing…`,
        spin: true,
        verbs: [{ kind: 'view-peer', label: 'view ↗' }],
      });
    } else if (p.status === 'done') {
      const verdict =
        p.outcome === 'approve'
          ? 'approved'
          : p.outcome === 'comment'
            ? 'commented'
            : 'reviewed';
      out.push({
        tone: 'go',
        word: `${p.reviewer} ${verdict}`,
        verbs: [{ kind: 'view-peer', label: 'view ↗' }],
      });
    }
  }
  const humans = activeReviewers(mr).map(h => h.toLowerCase());
  if (humans.length) {
    out.push({
      tone: 'quiet',
      word: `${humans.join(', ')} ${humans.length === 1 ? 'is' : 'are'} reviewing right now`,
      verbs: [],
    });
  }
  return out;
}

export function candidateLines(
  mr: BoardMRWithReview,
  now: number,
  draftResolved: Resolved
): StatusLine[] {
  const lines: StatusLine[] = [
    ...gateLines(mr),
    orphanLine(mr, now),
    reviewLine(mr, now),
    respondLine(mr),
    doctorLine(mr),
    ...socialLines(mr, now, draftResolved),
  ].filter((l): l is StatusLine => l !== null);
  if (lines.length === 0) {
    return [
      {
        tone: 'clear',
        word: 'all clear',
        detail: 'enjoy the sunshine',
        verbs: [{ kind: 'open-mr', label: 'open ↗' }],
      },
    ];
  }
  return lines;
}

/** The single status line a row shows: the hottest candidate, with ties
    settled by source order (gates before lanes before social), so a decision
    always outranks the lane it came from. */
export function rowStatus(
  mr: BoardMRWithReview,
  now: number,
  draftResolved: Resolved
): RowStatus {
  const lines = candidateLines(mr, now, draftResolved);
  const ranked = lines
    .map((line, index) => ({ line, index }))
    .sort(
      (a, b) =>
        TONE_RANK[a.line.tone] - TONE_RANK[b.line.tone] || a.index - b.index
    );
  const [first, ...rest] = ranked;
  const line = first!.line;
  return {
    line,
    more: rest.map(r => r.line),
    bar: line.tone === 'bad' || line.tone === 'warn' ? line.tone : null,
  };
}
