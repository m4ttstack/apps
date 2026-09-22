import { optionValue } from '@mattstack/gate-kit';
import type { GateRow } from '../../gates/store.ts';
import {
  parseGateCtx,
  type FindingEntry,
  type FindingSeverity,
  type Readiness,
  type ReviewCtx,
} from './gate-ctx.ts';

export const SEVERITY_ORDER: readonly FindingSeverity[] = [
  'critical',
  'important',
  'minor',
];

export const SEVERITY_LABEL: Record<FindingSeverity, string> = {
  critical: 'Critical',
  important: 'Important',
  minor: 'Minor',
};

export interface ReviewGate {
  review: ReviewCtx;
  /** Every findings chunk's entries, keyed by the option value each joins. */
  findings: Map<string, FindingEntry>;
}

type ReviewGateInput = Pick<GateRow, 'kind' | 'context' | 'questions'>;

export function isFindingsQuestion(q: { id: string }): boolean {
  return q.id.startsWith('findings-');
}

/** The review sheet's whole input, or null when the gate is not a
    review-post whose gate context is review@1 and whose every findings
    chunk is findings@1 joined one-to-one to its own options. There is no
    half-joined sheet: any mismatch routes the whole gate elsewhere. */
export function readReviewGate(gate: ReviewGateInput): ReviewGate | null {
  if (gate.kind !== 'review-post') return null;
  const review = parseGateCtx(gate.context);
  if (review?.shape !== 'review@1') return null;
  const findings = new Map<string, FindingEntry>();
  for (const q of gate.questions) {
    if (!isFindingsQuestion(q)) continue;
    const ctx = parseGateCtx(q.context);
    if (ctx?.shape !== 'findings@1') return null;
    const values = new Set(q.options.map(optionValue));
    if (values.size !== q.options.length) return null;
    if (ctx.findings.length !== values.size) return null;
    for (const entry of ctx.findings) {
      if (!values.has(entry.id) || findings.has(entry.id)) return null;
      findings.set(entry.id, entry);
    }
  }
  return { review, findings };
}

export function isReviewSheetGate(gate: ReviewGateInput): boolean {
  return readReviewGate(gate) !== null;
}

export function readinessProse(readiness: Readiness): string {
  return `Ready to merge: ${readiness.replace(/-/g, ' ')}`;
}

export function severityTally(counts: Record<FindingSeverity, number>): string {
  const parts = SEVERITY_ORDER.filter(s => counts[s] > 0).map(
    s => `${counts[s]} ${s}`
  );
  return parts.length > 0 ? parts.join(', ') : 'no findings';
}

export function reviewMeta(review: ReviewCtx): string {
  const { reviewer, round, re_review, prior } = review;
  return [
    reviewer,
    round !== undefined ? `round ${round}` : undefined,
    prior
      ? `${prior.addressed} addressed, ${prior.still_open} still open`
      : re_review
        ? 're-review'
        : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function reviewProse(review: ReviewCtx): string {
  const meta = reviewMeta(review);
  return [
    `**${readinessProse(review.readiness)}** · ${severityTally(review.findings)}`,
    ...(meta ? [meta] : []),
    review.summary,
  ].join('\n\n');
}

/** A gate-level context as a pane without a structured card shows it:
    prose exactly as written, a review@1 flattened, and nothing for any
    other shape, whose card lives elsewhere. Structured JSON never reaches
    a reader raw. */
export function paneContext(context: string | undefined): string | undefined {
  const ctx = parseGateCtx(context);
  if (ctx === null) return context;
  return ctx.shape === 'review@1' ? reviewProse(ctx) : undefined;
}
