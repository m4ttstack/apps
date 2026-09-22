import { useMemo, type ReactNode } from 'react';

import {
  effectiveSelections,
  gateAnswerPayload,
  type GateAnswers,
  type GateSelections,
} from '@mattstack/gate-kit';
import type { GateItemDisplay } from '@mattstack/gate-kit/react';
import { Button, Chip, Markdown } from '@mattstack/tui-kit';
import type { GateRow } from '../../gates/store.ts';
import type { BoardMRWithReview } from '../types.ts';
import { parseGateCtx, type PlanCtx, type PostCtx } from './gate-ctx.ts';
import { AnsweredChip, type GateFormState } from './GateForm.tsx';
import { MrCard } from './MrCard.tsx';
import { ReplyChoiceBody, SeverityPill, ThreadCard } from './RespondCards.tsx';
import { headerChips, subjectRef } from './RespondGateHeader.tsx';

/** The wire answer from the sheet's own selections, built the way
    `answersFromForm` builds it from a form: only a displayed single-select
    counts (a hidden code-changes pick is stale and yields to the
    sentinel), every multi submits an array, and a trimmed note wraps its
    question's value. Null while any required question is unanswered. */
function sheetAnswers(
  gate: GateRow,
  shown: Set<string>,
  selections: GateSelections,
  notes: Record<string, string>
): { answers: GateAnswers } | null {
  const sel: GateSelections = {};
  for (const q of gate.questions) {
    const v = selections[q.id];
    if (q.multi) sel[q.id] = shown.has(q.id) && Array.isArray(v) ? v : [];
    else if (shown.has(q.id) && typeof v === 'string' && v) sel[q.id] = v;
  }
  const payload = gateAnswerPayload(
    gate.questions,
    effectiveSelections(gate.kind, gate.questions, sel)
  );
  if (!payload) return null;
  const answers: GateAnswers = {};
  for (const [id, value] of Object.entries(payload.answers)) {
    const note = id in sel ? (notes[id] ?? '').trim() : '';
    answers[id] = note ? { value, note } : value;
  }
  return { answers };
}

function RecommendedChip() {
  return (
    <Chip
      intent="ok"
      variant="outline"
      uppercase
      data-gate="recommended"
      className="tui-gate-recommended"
    >
      recommended
    </Chip>
  );
}

function Choices({
  q,
  form,
  renderLabel,
}: {
  q: GateItemDisplay;
  form: GateFormState;
  renderLabel?: (value: string, chip: ReactNode) => ReactNode;
}) {
  const current = form.selections[q.name];
  const picked = new Set(Array.isArray(current) ? current : []);
  return (
    <div className="tui-gate-choices">
      {q.choices.map(choice => {
        const checked = q.multiple
          ? picked.has(choice.value)
          : current === choice.value;
        const chip = choice.recommended ? <RecommendedChip /> : null;
        return (
          <label
            className="tui-gate-choice"
            data-checked={checked || undefined}
            data-recommended={choice.recommended ? 'true' : undefined}
            key={choice.value}
          >
            <input
              type={q.multiple ? 'checkbox' : 'radio'}
              className="tui-gate-choice-input"
              data-type={q.multiple ? 'checkbox' : 'radio'}
              data-checked={checked ? '' : undefined}
              name={q.name}
              value={choice.value}
              checked={checked}
              onChange={e =>
                q.multiple
                  ? form.toggleMulti(
                      q.name,
                      choice.value,
                      e.currentTarget.checked
                    )
                  : form.setSingle(q.name, choice.value)
              }
            />
            <span className="tui-gate-choice-label">
              {renderLabel ? (
                renderLabel(choice.value, chip)
              ) : (
                <>
                  <span className="tui-gate-choice-label-row">
                    <span title={choice.description}>{choice.label}</span>
                    {chip}
                  </span>
                  {choice.subtitle && (
                    <span className="tui-gate-choice-subtitle">
                      {choice.subtitle}
                    </span>
                  )}
                </>
              )}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function Note({ q, form }: { q: GateItemDisplay; form: GateFormState }) {
  return (
    <input
      type="text"
      className="tui-gate-note"
      aria-label={`Note for ${q.prompt}`}
      placeholder="Add a note"
      value={form.notes[q.name] ?? ''}
      onChange={e => form.setNote(q.name, e.currentTarget.value)}
    />
  );
}

/** A question's own context when it is prose; a structured context that
    has no card here renders nothing rather than raw JSON. */
function ProseContext({
  q,
  structured,
}: {
  q: GateItemDisplay;
  structured: boolean;
}) {
  if (!q.context || structured) return null;
  return (
    <div className="tui-gate-question-context">
      <Markdown unstyled linkTargetBlank>
        {q.context}
      </Markdown>
    </div>
  );
}

const VERB_ORDER = ['fix', 'reply', 'skip'] as const;

/** A respond gate in the full-screen sheet: the MR and every thread (or
    reply) in the main column, each decided on its own card; the decision
    context and the gate-level question dock in the rail with the submit. */
function RespondSheetBody({
  gate,
  mr,
  ctx,
  form,
}: {
  gate: GateRow;
  mr?: BoardMRWithReview;
  ctx: PlanCtx | PostCtx;
  form: GateFormState;
}) {
  const questionCtx = useMemo(
    () => new Map(gate.questions.map(q => [q.id, parseGateCtx(q.context)])),
    [gate.questions]
  );
  // A thread keeps its place in the list even when its structured
  // context was dropped to prose; the gate contract keeps thread-* ids
  // positional. A multi is the replies checklist, structured or not.
  const perItem = (q: GateItemDisplay) => {
    const shape = questionCtx.get(q.name)?.shape;
    return (
      shape === 'thread@1' ||
      shape === 'replies@1' ||
      /^thread-/.test(q.name) ||
      q.multiple
    );
  };
  const mainQs = form.display.filter(perItem);
  const dockQs = form.display.filter(q => !perItem(q));
  const shown = new Set(form.display.map(q => q.name));
  const payload = sheetAnswers(gate, shown, form.selections, form.notes);

  const plan = ctx.shape === 'plan@1';
  const threadsDecided = mainQs.filter(
    q => !q.multiple && typeof form.selections[q.name] === 'string'
  ).length;
  const tally = VERB_ORDER.map(verb => {
    const n = mainQs.filter(q => {
      const v = form.selections[q.name];
      return typeof v === 'string' && v.startsWith(`${verb}:`);
    }).length;
    return n > 0 ? `${n} ${verb}` : null;
  }).filter(Boolean);
  const repliesQ = mainQs.find(q => q.multiple);
  const repliesPicked = repliesQ
    ? ((form.selections[repliesQ.name] as string[] | undefined)?.length ?? 0)
    : 0;
  const dockPick = dockQs
    .map(q => {
      const v = form.selections[q.name];
      return q.choices.find(c => c.value === v)?.label;
    })
    .find(Boolean);
  const submitLabel = form.busy
    ? 'submitting…'
    : plan
      ? ['submit', ...tally].join(' · ')
      : [`post ${repliesPicked}`, dockPick].filter(Boolean).join(' · ');

  return (
    <div className="tui-sheet-body">
      <section className="tui-sheet-main">
        {mr && <MrCard mr={mr} />}
        <div className="tui-sheet-list-head">
          <span className="tui-sheet-list-title">
            {repliesQ
              ? repliesQ.prompt
              : `Respond to ${mainQs.length} ${mainQs.length === 1 ? 'thread' : 'threads'} from ${ctx.reviewer}`}
          </span>
          <span className="tui-sheet-list-tally">
            {repliesQ
              ? `${repliesPicked} of ${repliesQ.choices.length} selected`
              : `${threadsDecided} of ${mainQs.length} decided`}
          </span>
        </div>
        <div className="tui-respond-list">
          {mainQs.map(q => {
            const qctx = questionCtx.get(q.name);
            if (!q.multiple)
              return (
                <section
                  key={q.name}
                  className="tui-gate-question"
                  data-gate-ctx={
                    qctx?.shape === 'thread@1' ? 'thread' : undefined
                  }
                  role="radiogroup"
                  aria-label={q.prompt}
                >
                  <div className="tui-gate-question-head">
                    <span className="tui-gate-question-label">{q.prompt}</span>
                    {qctx?.shape === 'thread@1' && (
                      <SeverityPill severity={qctx.severity} />
                    )}
                  </div>
                  {qctx?.shape === 'thread@1' ? (
                    <ThreadCard ctx={qctx} />
                  ) : (
                    <ProseContext q={q} structured={qctx != null} />
                  )}
                  <Choices q={q} form={form} />
                  <Note q={q} form={form} />
                </section>
              );
            const replies = qctx?.shape === 'replies@1' ? qctx.replies : [];
            return (
              <section
                key={q.name}
                className="tui-respond-replies"
                data-gate-ctx="replies"
                aria-label={q.prompt}
              >
                <Choices
                  q={q}
                  form={form}
                  renderLabel={(value, chip) => {
                    const entry = replies.find(r => r.thread === value);
                    return entry ? (
                      <ReplyChoiceBody entry={entry}>{chip}</ReplyChoiceBody>
                    ) : (
                      value
                    );
                  }}
                />
                <Note q={q} form={form} />
              </section>
            );
          })}
        </div>
      </section>
      <aside className="tui-sheet-rail">
        {form.lost ? (
          <div className="tui-sheet-lost">
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
            <div className="tui-sheet-rail-scroll">
              <div className="tui-sheet-context-card">
                <span className="tui-sheet-context-label">
                  decision context
                </span>
                <p className="tui-sheet-context-lead">
                  {plan ? 'Responding to ' : 'Posting replies to '}
                  <strong>{ctx.reviewer}</strong>
                  {"'s review"}
                </p>
                <div className="tui-respond-chips">
                  {headerChips(ctx).map(chip => (
                    <span
                      key={chip.key}
                      className="tui-respond-chip"
                      data-hue={chip.hue}
                      data-chip={chip.key}
                    >
                      {chip.text}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <div className="tui-sheet-dock">
              <div className="tui-sheet-dock-head">
                <h3 className="tui-sheet-dock-heading">
                  {plan ? 'Responses' : 'Replies'}
                  {` on ${mr ? `!${mr.iid}` : subjectRef(gate.subject)}`}
                </h3>
                <button
                  type="button"
                  className="tui-sheet-reset"
                  onClick={form.resetAll}
                >
                  reset
                </button>
              </div>
              {dockQs.map(q => (
                <div key={q.name} className="tui-sheet-dock-question">
                  <span className="tui-sheet-dock-prompt">{q.prompt}</span>
                  <ProseContext
                    q={q}
                    structured={questionCtx.get(q.name) != null}
                  />
                  <Choices q={q} form={form} />
                  <Note q={q} form={form} />
                </div>
              ))}
              <Button
                type="button"
                variant="filled"
                intent="accent"
                size="lg"
                className="tui-sheet-submit"
                disabled={form.busy || payload === null}
                onClick={() => void form.submit(payload)}
              >
                {submitLabel}
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
          </>
        )}
      </aside>
    </div>
  );
}

export { RespondSheetBody, sheetAnswers };
