import { useEffect, useMemo, useRef, useState } from 'react';
import { Invadr } from 'invadrs/react';

import {
  collapseChunks,
  displayForValue,
  optionDisplayFor,
  optionValue,
  type GateAnswers,
  type GateDomain,
  type GateOption,
  type GateQuestion,
} from '@mattstack/gate-kit';
import {
  Button,
  Chip,
  ICONS,
  Markdown,
  useBodyScrollLock,
  useEscapeClose,
} from '@mattstack/tui-kit';
import type { GateRow } from '../../gates/store.ts';
import type { BoardMRWithReview } from '../types.ts';
import type { TriageGateState } from './DecisionQueueModal.tsx';
import { Disclosure, DisclosureHead } from './Disclosure.tsx';
import { parseFindingOption, type ParsedFinding } from './finding-option.ts';
import { ago, cleanTitle } from './format.ts';
import { parseGateContext, sectionFor } from './gate-context.ts';
import { AnsweredChip, type GateFormState } from './GateForm.tsx';
import { CameraIcon, PencilLineIcon, SearchCheckIcon } from './icons.tsx';

/** The engine's optional record fields (`docs/superpowers/specs/
    2026-09-18-review-gate-redesign-design.md` §1): all absent on a report
    that only carries `summary`/`findings`, in which case the sheet falls
    back to the raw markdown instead of an empty cluster. */
interface ReviewReportJson {
  summary?: { readiness?: string; reasoning?: string };
  depth?: string;
  strengths?: Array<{ lead: string; detail?: string }>;
  checks?: Array<{ tag: string; text: string }>;
  notes?: string[];
}

export interface ReviewGateSheetQueue {
  /** 0-based position of the active gate in the queue. */
  index: number;
  total: number;
  states: TriageGateState[];
  onPrev: () => void;
  onNext: () => void;
}

/** True when a gate is the review-post shape this sheet renders: at least
    one question option parses as a finding (`[Tier] title`). A gate whose
    only multi question is the legacy per-tier checkbox ("Minor (4)") falls
    through to the generic decision-queue modal instead. */
export function isReviewSheetGate(gate: GateRow): boolean {
  if (gate.kind !== 'review-post') return false;
  return gate.questions.some(q =>
    q.options.some(o => parseFindingOption(o) !== null)
  );
}

function hasRecord(report: ReviewReportJson | null): boolean {
  if (!report) return false;
  return Boolean(
    report.depth ||
    (report.strengths && report.strengths.length > 0) ||
    (report.checks && report.checks.length > 0) ||
    (report.notes && report.notes.length > 0)
  );
}

/** Fallback for a report with no optional record fields (or none reachable
    at all): the review's prose is never unreachable, it just costs an extra
    click. Same fetch/render shape as ReviewModal's report fetch. */
function FullReportDisclosure({ mrUrl }: { mrUrl?: string | null }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || body !== null || failed || !mrUrl) return;
    let live = true;
    fetch(`/review/report?mr=${encodeURIComponent(mrUrl)}`)
      .then(r =>
        r.ok ? r.text() : Promise.reject(new Error(String(r.status)))
      )
      .then(t => live && setBody(t))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [open, mrUrl, body, failed]);
  return (
    <div className="tui-review-full-report">
      <DisclosureHead
        open={open}
        label="full report"
        onToggle={() => setOpen(o => !o)}
      >
        <span className="tui-review-full-report-label">full report</span>
      </DisclosureHead>
      <Disclosure open={open}>
        {failed ? (
          <p className="tui-comments-empty">couldn't load the full report</p>
        ) : body === null ? (
          <p className="tui-comments-empty">loading…</p>
        ) : (
          <Markdown unstyled linkTargetBlank>
            {body}
          </Markdown>
        )}
      </Disclosure>
    </div>
  );
}

function tierGroupsOf(
  findings: ParsedFinding[]
): Array<[string, ParsedFinding[]]> {
  const map = new Map<string, ParsedFinding[]>();
  for (const f of findings) {
    const list = map.get(f.tier);
    if (list) list.push(f);
    else map.set(f.tier, [f]);
  }
  return [...map.entries()];
}

/** The full-screen sheet a `review-post` gate opens (design doc §4). Header
    carries queue chrome; the main column is the MR card, findings, and the
    optional record cluster; the rail is decision context, checks, and the
    verdict form. Selection state keys by the COLLAPSED question ids
    (`collapseChunks`), so a fresh gate defaults to every finding checked and
    the recommended verdict picked -- the reviewer opts OUT rather than in. */
function ReviewGateSheet({
  gate,
  mr,
  form,
  queue,
  onClose,
  onSkip,
  onFocusPane,
}: {
  gate: GateRow;
  mr?: BoardMRWithReview;
  form: GateFormState;
  queue: ReviewGateSheetQueue;
  onClose: () => void;
  onSkip: () => void;
  onFocusPane: (mr: BoardMRWithReview, domain: GateDomain) => void;
}) {
  useEscapeClose(onClose);
  useBodyScrollLock();

  const { questions } = useMemo(
    () => collapseChunks(gate.questions),
    [gate.questions]
  );
  const findingsQuestion = useMemo<GateQuestion | undefined>(
    () =>
      questions.find(
        q =>
          q.multi &&
          q.options.length > 0 &&
          q.options.every(o => parseFindingOption(o) !== null)
      ),
    [questions]
  );
  const outcomeQuestion = useMemo<GateQuestion | undefined>(
    () => questions.find(q => !q.multi),
    [questions]
  );
  const findingsName = findingsQuestion?.id;
  const outcomeName = outcomeQuestion?.id;

  const findings = useMemo<ParsedFinding[]>(
    () =>
      (findingsQuestion?.options ?? [])
        .map(o => parseFindingOption(o))
        .filter((f): f is ParsedFinding => f !== null),
    [findingsQuestion]
  );
  const tierGroups = useMemo(() => tierGroupsOf(findings), [findings]);

  // The gate's own context (design doc §3: "gate-level --context carries the
  // readiness line and tier counts"), sectioned per question the same way
  // GateForm.tsx does -- the outcome question's section carries the verdict
  // recommendation a bare option label may not spell out.
  const parsedContext = useMemo(
    () => parseGateContext(gate.context),
    [gate.context]
  );
  const outcomeSection = useMemo(
    () =>
      outcomeQuestion
        ? sectionFor(parsedContext, {
            id: outcomeQuestion.id,
            label: outcomeQuestion.label,
          })
        : undefined,
    [parsedContext, outcomeQuestion]
  );
  const isRecommended = (o: GateOption) => {
    if (optionDisplayFor(o).recommended) return true;
    return (
      outcomeSection?.recommendation !== undefined &&
      optionDisplayFor(o).text.toLowerCase() === outcomeSection.recommendation
    );
  };

  // A fresh gate (or an explicit reset) proposes posting everything with the
  // recommended verdict; the reviewer unchecks rather than builds the set
  // from nothing. `force` skips the per-key "already touched" guard, since
  // a reset just cleared every key and wants them rewritten unconditionally.
  const seedDefaults = (force: boolean) => {
    if (
      findingsName &&
      (force || form.selections[findingsName] === undefined)
    ) {
      for (const f of findings) form.toggleMulti(findingsName, f.id, true);
    }
    if (
      outcomeName &&
      outcomeQuestion &&
      (force || form.selections[outcomeName] === undefined)
    ) {
      const recommended = outcomeQuestion.options.find(isRecommended);
      const fallback = recommended ?? outcomeQuestion.options[0];
      if (fallback) form.setSingle(outcomeName, optionValue(fallback));
    }
  };
  // Only seeds a key that has never been touched (no draft, no prior
  // toggle), so a resumed selection is never overwritten.
  useEffect(() => {
    seedDefaults(false);
    // Seeds once per gate; toggleMulti/setSingle are stable-enough setState
    // wrappers and re-running on their identity would fight the seed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.gateId]);

  const handleReset = () => {
    form.resetAll();
    seedDefaults(true);
  };

  const selectedFindings = useMemo(() => {
    const current = findingsName ? form.selections[findingsName] : undefined;
    return new Set(Array.isArray(current) ? current : []);
  }, [form.selections, findingsName]);
  const selectedOutcome = outcomeName
    ? form.selections[outcomeName]
    : undefined;
  const outcomeText =
    outcomeQuestion && typeof selectedOutcome === 'string'
      ? displayForValue(selectedOutcome, outcomeQuestion.options).text
      : '';
  const outcomeNote = outcomeName ? (form.notes[outcomeName] ?? '') : '';

  const [report, setReport] = useState<ReviewReportJson | null>(null);
  useEffect(() => {
    let live = true;
    setReport(null);
    if (!mr?.webUrl) return;
    fetch(`/review/report.json?mr=${encodeURIComponent(mr.webUrl)}`)
      .then(r =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status)))
      )
      .then(j => live && setReport(j as ReviewReportJson))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [mr?.webUrl]);
  const record = hasRecord(report);

  const mainRef = useRef<HTMLElement | null>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [moreBelow, setMoreBelow] = useState(0);
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    // Rect-to-rect, not offsetTop-to-scrollTop: offsetTop is relative to the
    // nearest positioned ancestor, which is not necessarily this scroll
    // container, so mixing it with scrollTop/clientHeight silently drifts
    // once any row's offsetParent differs from `el`.
    const measure = () => {
      const box = el.getBoundingClientRect();
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      setAtEnd(remaining <= 1);
      const rows = el.querySelectorAll<HTMLElement>('.tui-review-finding-row');
      let below = 0;
      rows.forEach(row => {
        if (row.getBoundingClientRect().top >= box.bottom) below++;
      });
      setMoreBelow(below);
    };
    measure();
    el.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [findings.length, report]);

  const toggleTier = (items: ParsedFinding[], on: boolean) => {
    if (!findingsName) return;
    for (const f of items) form.toggleMulti(findingsName, f.id, on);
  };

  const submit = () => {
    if (!outcomeName || typeof selectedOutcome !== 'string') return;
    const trimmedNote = outcomeNote.trim();
    const answers: GateAnswers = {
      ...(findingsName ? { [findingsName]: [...selectedFindings] } : {}),
      [outcomeName]:
        trimmedNote.length > 0
          ? { value: selectedOutcome, note: trimmedNote }
          : selectedOutcome,
    };
    void form.submit({ answers });
  };

  const parked = gate.status === 'parked';

  return (
    <div className="tui-review-sheet" role="dialog" aria-modal="true">
      <header className="tui-review-sheet-head">
        <span className="tui-review-sheet-title">review</span>
        <span className="tui-review-sheet-head-actions">
          <Button
            type="button"
            variant="subtle"
            intent="muted"
            size="lg"
            disabled={
              parked
                ? !(gate.domain && mr)
                : !form.originFocusable || form.focusBusy
            }
            onClick={() =>
              parked
                ? gate.domain && mr && onFocusPane(mr, gate.domain)
                : void form.focusGate()
            }
          >
            focus pane
          </Button>
          <Button
            type="button"
            variant="subtle"
            intent="muted"
            size="lg"
            onClick={onSkip}
          >
            skip gate
          </Button>
        </span>
        <span className="tui-review-sheet-spacer" />
        <nav className="tui-review-queue-nav" aria-label="gate queue">
          <button
            type="button"
            className="tui-review-queue-chevron"
            onClick={queue.onPrev}
            disabled={queue.index <= 0}
            aria-label="previous gate"
          >
            ‹
          </button>
          <span className="tui-review-queue-pips">
            {queue.states.map((s, i) => (
              <i key={i} className="tui-review-queue-pip" data-state={s} />
            ))}
          </span>
          <span className="tui-review-queue-pos">
            gate {queue.index + 1} of {queue.total}
          </span>
          <button
            type="button"
            className="tui-review-queue-chevron"
            onClick={queue.onNext}
            disabled={queue.index >= queue.total - 1}
            aria-label="next gate"
          >
            ›
          </button>
        </nav>
        <span className="tui-review-gate-tag">{gate.label}</span>
        <button
          type="button"
          className="tui-review-close"
          onClick={onClose}
          aria-label="close"
        >
          ✕
        </button>
      </header>
      <div className="tui-review-sheet-body">
        <section className="tui-review-sheet-main" ref={mainRef}>
          {mr && (
            <div className="tui-review-mr-card">
              <div className="tui-review-mr-head">
                <Invadr
                  id={mr.author.username}
                  palette="css-vars"
                  className="tui-avatar"
                />
                <span className="tui-review-author">
                  {mr.author.name || mr.author.username}
                </span>
                <span className="tui-review-mr-open">
                  opened !{mr.iid} into {mr.targetBranch} ·{' '}
                  {ago(mr.createdAt, Date.now())}
                </span>
              </div>
              <h2 className="tui-review-mr-title">{cleanTitle(mr.title)}</h2>
              <div className="tui-review-mr-meta">
                <span className="tui-branch">{mr.sourceBranch}</span>
                {mr.diff && (
                  <span className="tui-review-diff">
                    <span className="tui-review-diff-add">
                      +{mr.diff.additions}
                    </span>
                    <span className="tui-review-diff-del">
                      -{mr.diff.deletions}
                    </span>
                  </span>
                )}
              </div>
            </div>
          )}

          {findingsQuestion && (
            <>
              <div className="tui-review-find-head">
                <span className="tui-review-find-title">
                  {findingsQuestion.label}
                </span>
                <span className="tui-review-find-tally">
                  {selectedFindings.size} of {findings.length} selected
                  {!atEnd && moreBelow > 0 ? ` · ${moreBelow} more below` : ''}
                </span>
              </div>
              <div
                className="tui-review-find-list"
                data-at-end={atEnd || undefined}
              >
                {tierGroups.map(([tier, items]) => {
                  const allOn = items.every(f => selectedFindings.has(f.id));
                  const allOff = items.every(f => !selectedFindings.has(f.id));
                  return (
                    <div className="tui-review-tier-group" key={tier}>
                      <div className="tui-review-tier-head">
                        <span className="tui-review-tier-pill" data-tier={tier}>
                          {tier} ({items.length})
                        </span>
                        <span className="tui-review-allnone-group">
                          <button
                            type="button"
                            className="tui-review-allnone"
                            data-noop={allOn || undefined}
                            onClick={() => toggleTier(items, true)}
                          >
                            all
                          </button>
                          <button
                            type="button"
                            className="tui-review-allnone"
                            data-noop={allOff || undefined}
                            onClick={() => toggleTier(items, false)}
                          >
                            none
                          </button>
                        </span>
                      </div>
                      {items.map(f => {
                        const checked = selectedFindings.has(f.id);
                        return (
                          <label className="tui-review-finding-row" key={f.id}>
                            <input
                              type="checkbox"
                              className="tui-gate-choice-input"
                              data-type="checkbox"
                              data-checked={checked ? '' : undefined}
                              checked={checked}
                              onChange={e =>
                                findingsName &&
                                form.toggleMulti(
                                  findingsName,
                                  f.id,
                                  e.currentTarget.checked
                                )
                              }
                            />
                            <span className="tui-review-finding-title">
                              {f.title}
                            </span>
                            {f.kind && (
                              <span className="tui-review-finding-kind">
                                {f.kind}
                              </span>
                            )}
                            {f.anchor && (
                              <span className="tui-review-finding-anchor">
                                {f.anchor}
                              </span>
                            )}
                            {f.fix && (
                              <span className="tui-review-finding-fix">
                                {f.fix}
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {record ? (
            <dl className="tui-review-record">
              {report?.strengths && report.strengths.length > 0 && (
                <div className="tui-review-record-row">
                  <dt className="tui-review-record-label">strengths</dt>
                  <dd className="tui-review-record-content">
                    {report.strengths.map((s, i) => (
                      <div className="tui-review-record-item" key={i}>
                        <span className="tui-review-record-icon tui-review-record-icon-ok">
                          {ICONS['circle-check']}
                        </span>
                        <span>
                          <strong>{s.lead}</strong>
                          {s.detail ? ` · ${s.detail}` : ''}
                        </span>
                      </div>
                    ))}
                  </dd>
                </div>
              )}
              {report?.depth && (
                <div className="tui-review-record-row">
                  <dt className="tui-review-record-label">depth</dt>
                  <dd className="tui-review-record-content">
                    <div className="tui-review-record-item">
                      <span className="tui-review-record-icon">
                        <SearchCheckIcon />
                      </span>
                      <span>{report.depth}</span>
                    </div>
                  </dd>
                </div>
              )}
              {report?.checks && report.checks.length > 0 && (
                <div className="tui-review-record-row">
                  <dt className="tui-review-record-label">evidence</dt>
                  <dd className="tui-review-record-content">
                    {report.checks.map((c, i) => (
                      <div className="tui-review-record-item" key={i}>
                        <span className="tui-review-record-icon">
                          <CameraIcon />
                        </span>
                        <span>{c.text}</span>
                      </div>
                    ))}
                  </dd>
                </div>
              )}
              {report?.notes && report.notes.length > 0 && (
                <div className="tui-review-record-row">
                  <dt className="tui-review-record-label">notes</dt>
                  <dd className="tui-review-record-content">
                    {report.notes.map((n, i) => (
                      <div className="tui-review-record-item" key={i}>
                        <span className="tui-review-record-icon">
                          <PencilLineIcon />
                        </span>
                        <span>{n}</span>
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <FullReportDisclosure mrUrl={mr?.webUrl} />
          )}
        </section>
        <aside className="tui-review-sheet-rail">
          {form.lost ? (
            <div className="tui-review-lost">
              <span className="tui-gate-error">answered elsewhere</span>
              <AnsweredChip
                startOpen
                row={{
                  subject: gate.subject,
                  kind: gate.kind,
                  status: 'answered',
                  questions: gate.questions,
                  answer: { answers: form.lost.answers, by: form.lost.by },
                }}
              />
            </div>
          ) : (
            <>
              <div className="tui-review-decision-card">
                <span className="tui-review-decision-label">
                  decision context
                </span>
                {report?.summary?.readiness ? (
                  <p className="tui-review-decision-lead">
                    {report.summary.readiness}
                  </p>
                ) : (
                  outcomeSection?.verdict && (
                    <p className="tui-review-decision-lead">
                      {outcomeSection.verdict}
                    </p>
                  )
                )}
                {report?.summary?.reasoning ? (
                  <p className="tui-review-decision-reasoning">
                    {report.summary.reasoning}
                  </p>
                ) : (
                  (outcomeSection?.remainder ??
                    outcomeSection?.body ??
                    parsedContext?.preamble) && (
                    <div className="tui-review-decision-reasoning">
                      <Markdown unstyled linkTargetBlank>
                        {outcomeSection?.remainder ??
                          outcomeSection?.body ??
                          parsedContext?.preamble ??
                          ''}
                      </Markdown>
                    </div>
                  )
                )}
                {tierGroups.length > 0 && (
                  <div className="tui-review-tier-pills">
                    {tierGroups.map(([tier, items]) => (
                      <span
                        className="tui-review-tier-pill"
                        data-tier={tier}
                        key={tier}
                      >
                        {tier} ({items.length})
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {report?.checks && report.checks.length > 0 && (
                <div className="tui-review-checks-card">
                  {report.checks.map((c, i) => (
                    <Chip
                      key={i}
                      intent={
                        c.tag === 'FAIL'
                          ? 'bad'
                          : c.tag === 'PASS'
                            ? 'ok'
                            : 'muted'
                      }
                      variant="outline"
                      uppercase
                      className="tui-review-check-chip"
                      title={c.text}
                    >
                      {c.tag}
                    </Chip>
                  ))}
                </div>
              )}

              {outcomeQuestion && (
                <div className="tui-review-verdict">
                  <h3 className="tui-review-verdict-heading">
                    Verdict on !{mr?.iid ?? ''}
                  </h3>
                  <div className="tui-gate-choices">
                    {outcomeQuestion.options.map((o: GateOption) => {
                      const display = optionDisplayFor(o);
                      const value = optionValue(o);
                      const checked = selectedOutcome === value;
                      const recommended = isRecommended(o);
                      return (
                        <label
                          className="tui-gate-choice"
                          data-checked={checked || undefined}
                          data-recommended={
                            recommended && !checked ? 'true' : undefined
                          }
                          key={value}
                        >
                          <input
                            type="radio"
                            className="tui-gate-choice-input"
                            data-type="radio"
                            data-checked={checked ? '' : undefined}
                            name={outcomeName}
                            value={value}
                            checked={checked}
                            onChange={() =>
                              outcomeName && form.setSingle(outcomeName, value)
                            }
                          />
                          <span className="tui-gate-choice-label">
                            <span className="tui-gate-choice-label-row">
                              <span title={display.title}>{display.text}</span>
                              {recommended && (
                                <Chip
                                  intent="ok"
                                  variant="outline"
                                  uppercase
                                  data-gate="recommended"
                                  className="tui-gate-recommended"
                                >
                                  recommended
                                </Chip>
                              )}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    className="tui-gate-note"
                    aria-label={`Note for ${outcomeQuestion.label}`}
                    placeholder="Add a note"
                    value={outcomeNote}
                    onChange={e =>
                      outcomeName &&
                      form.setNote(outcomeName, e.currentTarget.value)
                    }
                  />
                  <Button
                    type="button"
                    variant="filled"
                    intent="warn"
                    size="lg"
                    className="tui-review-submit"
                    disabled={form.busy || typeof selectedOutcome !== 'string'}
                    onClick={submit}
                  >
                    {form.busy
                      ? 'submitting…'
                      : outcomeText
                        ? `post ${selectedFindings.size} · ${outcomeText}`
                        : `post ${selectedFindings.size}`}
                  </Button>
                  <Button
                    type="button"
                    variant="subtle"
                    intent="muted"
                    size="lg"
                    onClick={handleReset}
                  >
                    reset
                  </Button>
                  {form.failed && (
                    <span className="tui-gate-error">
                      submit failed... nothing was sent, try again
                    </span>
                  )}
                  {form.focusError && (
                    <span className="tui-gate-error">{form.focusError}</span>
                  )}
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

export { ReviewGateSheet };
