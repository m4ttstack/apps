import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import type {
  AnswerOutcome,
  GateAnswers,
  GateDomain,
  GateSelections,
  GateSummaryDetailRow,
  GateSummaryInput,
} from '@mattstack/gate-kit';
import { answeredGateSummary, resolveAnswerOutcome } from '@mattstack/gate-kit';
import {
  answersFromForm,
  gateItems,
  noteFieldName,
  Questionnaire,
  useGateDraft,
  type GateItemDisplay,
} from '@mattstack/gate-kit/react';
import { Button, Chip, Markdown } from '@mattstack/tui-kit';
import type { GateRow } from '../../gates/store.ts';
import type { BoardMRWithReview } from '../types.ts';
import { Disclosure, DisclosureHead } from './Disclosure.tsx';
import {
  parseGateCtx,
  type GateCtx,
  type RepliesCtx,
  type ThreadCtx,
} from './gate-ctx.ts';
import { ReplyChoiceBody, SeverityPill, ThreadCard } from './RespondCards.tsx';
import { paneContext } from './review-gate.ts';

function SummaryDetail({ detail }: { detail: GateSummaryDetailRow[] }) {
  return (
    <dl className="tui-gate-summary">
      {detail.map(row => (
        <div key={row.id} className="tui-gate-summary-row">
          <dt>{row.question}</dt>
          <dd>
            {row.answers.map((a, i) => (
              <span key={`${a.text}-${i}`} title={a.title}>
                {i > 0 && ', '}
                {a.text}
              </span>
            ))}
            {row.note && (
              <div className="tui-gate-summary-note">{row.note}</div>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The compact answered face: one chip line, detail on demand. The conflict
    path passes startOpen -- the winning answer someone else recorded is the
    whole message there. Exported for its own Storybook coverage and for
    DecisionQueueModal, which renders it directly for any non-actionable gate. */
function AnsweredChip({
  row,
  startOpen = false,
}: {
  row: GateSummaryInput;
  startOpen?: boolean;
}) {
  const [open, setOpen] = useState(startOpen);
  const summary = answeredGateSummary(row);
  return (
    <div className="tui-gate-answered" data-gate="chip">
      <DisclosureHead
        open={open}
        label="answered gate summary"
        onToggle={() => setOpen(o => !o)}
      >
        <span className="tui-gate-chip">{summary.chip}</span>
      </DisclosureHead>
      <Disclosure open={open}>
        <SummaryDetail detail={summary.detail} />
      </Disclosure>
    </div>
  );
}

/** All answer-form state for one actionable gate: selections/notes/step
    seeded from the localStorage draft, the submit + CAS-loss flow, and the
    origin-focus call. The triage modal is the only host that mounts a live
    form (a row's chip only opens the modal), and it also reads `lost` for
    its own chrome (the answered chip on a CAS loss). */
function useGateForm(gate: GateRow, onAnswered?: () => void) {
  const actionable = gate.status === 'open' || gate.status === 'parked';
  const {
    initial: draft,
    save: saveDraft,
    clear: clearDraft,
  } = useGateDraft(gate.gateId, actionable);
  const [selections, setSelections] = useState<GateSelections>(
    () => draft?.selections ?? {}
  );
  const [notes, setNotes] = useState<Record<string, string>>(
    () => draft?.notes ?? {}
  );
  const [step, setStep] = useState<string | null>(() => draft?.item ?? null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [lost, setLost] = useState<AnswerOutcome | null>(null);
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);

  const originFocusable = Boolean(gate.origin?.paneId || gate.origin?.worktree);

  const { items, display } = useMemo(
    () => gateItems({ kind: gate.kind, questions: gate.questions }, selections),
    [gate.kind, gate.questions, selections]
  );
  const stepped = display.length > 1;
  const activeStep = step ?? display[0]?.name;

  useEffect(() => {
    saveDraft({ selections, notes, item: step });
  }, [saveDraft, selections, notes, step]);

  const setSingle = (name: string, value: string) =>
    setSelections(prev => ({ ...prev, [name]: value }));
  const toggleMulti = (name: string, value: string, checked: boolean) =>
    setSelections(prev => {
      const current = prev[name];
      const next = new Set(Array.isArray(current) ? current : []);
      if (checked) next.add(value);
      else next.delete(value);
      return { ...prev, [name]: [...next] };
    });
  const setNote = (name: string, value: string) =>
    setNotes(prev => ({ ...prev, [name]: value }));
  const resetAll = () => {
    setSelections({});
    setNotes({});
    setStep(null);
    clearDraft();
  };

  const focusGate = async () => {
    setFocusBusy(true);
    setFocusError(null);
    try {
      const res = await fetch('/gate/focus', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gateId: gate.gateId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setFocusError(body?.error ?? `focus failed (${res.status})`);
      }
    } catch {
      setFocusError('focus failed');
    } finally {
      setFocusBusy(false);
    }
  };

  const submit = async (
    payload: { answers: GateAnswers } | null,
    transformAnswers?: (answers: GateAnswers) => GateAnswers
  ) => {
    if (!payload || busy) return;
    setBusy(true);
    setFailed(false);
    setLost(null);
    const answers = transformAnswers
      ? transformAnswers(payload.answers)
      : payload.answers;
    try {
      const res = await fetch('/gate/answer', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ gateId: gate.gateId, answers }),
      });
      const outcome = resolveAnswerOutcome(
        res.status,
        await res.json().catch(() => null)
      );
      if (outcome.kind === 'lost') {
        // An answer WAS recorded, just not this one -- the body carries the
        // winning row, not a validation failure to retry.
        setBusy(false);
        setLost(outcome);
        clearDraft();
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setBusy(false);
      setFailed(true);
      return;
    }
    setBusy(false);
    clearDraft();
    onAnswered?.();
  };

  return {
    selections,
    notes,
    busy,
    failed,
    lost,
    focusBusy,
    focusError,
    originFocusable,
    display,
    items,
    stepped,
    activeStep,
    setStep,
    setSingle,
    toggleMulti,
    setNote,
    resetAll,
    focusGate,
    submit,
  };
}

export type GateFormState = ReturnType<typeof useGateForm>;

/** One question's card. The primitive's own <fieldset> (Questionnaire.Item
    has no `render` prop to change that) does not pass a flex-shrunk height
    down to its own children when it sits beneath a `max-height`-sized
    ancestor -- confirmed by isolating a `<fieldset>` and a `<div>` in an
    otherwise identical standalone reproduction: the div cascades correctly,
    the fieldset renders its children at their full natural size regardless
    of its own (correctly shrunk) box. `.tui-triage-modal`'s `max-height:
    80vh` is that ancestor, and it stays (a prior ruling rejected shrinking
    it), so a ResizeObserver syncs an explicit height onto `.tui-gate-
    question-body` instead: once that height is a real CSS value rather
    than one inherited through the broken cascade, its own children (the
    context vs. the choices) shrink correctly. */
function GateQuestionCard({
  q,
  current,
  picked,
  qctx,
  threadOrd,
  threadCount,
  stepped,
  note,
  onSetNote,
  onToggleMulti,
  onSetSingle,
}: {
  q: GateItemDisplay;
  current: string | string[] | undefined;
  picked: Set<string>;
  qctx: GateCtx | null;
  /** -1 when this question is not a thread. */
  threadOrd: number;
  threadCount: number;
  stepped: boolean;
  note: string;
  onSetNote: (value: string) => void;
  onToggleMulti: (value: string, checked: boolean) => void;
  onSetSingle: (value: string) => void;
}) {
  const threadCtx: ThreadCtx | null = qctx?.shape === 'thread@1' ? qctx : null;
  const repliesCtx: RepliesCtx | null =
    qctx?.shape === 'replies@1' ? qctx : null;
  const fieldsetRef = useRef<HTMLFieldSetElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const fieldset = fieldsetRef.current;
    const body = bodyRef.current;
    if (!fieldset || !body) return;
    const sync = () => {
      // Clearing first, before reading, matters: a stale height left over
      // from a step React reused this fieldset for (same `q.name`, a
      // different gate's question) would otherwise get measured back into
      // itself, since the fieldset's own natural size is partly a function
      // of this div's current height.
      body.style.height = '';
      body.style.height = `${fieldset.clientHeight}px`;
    };
    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(fieldset);
    return () => observer.disconnect();
  }, [q.name]);

  return (
    <Questionnaire.Item
      ref={fieldsetRef}
      name={q.name}
      required={q.required}
      multiple={q.multiple}
      className="tui-gate-question"
      data-gate-ctx={threadCtx ? 'thread' : repliesCtx ? 'replies' : undefined}
    >
      <div ref={bodyRef} className="tui-gate-question-body">
        <div className="tui-gate-question-head">
          <Questionnaire.Title
            className="tui-gate-question-label"
            render={props => <span {...props} />}
          >
            {q.prompt}
          </Questionnaire.Title>
          {threadCtx && <SeverityPill severity={threadCtx.severity} />}
          {threadOrd >= 0 && (
            <span className="tui-gate-question-ord">
              thread {threadOrd + 1} of {threadCount}
            </span>
          )}
          {stepped && (
            <Questionnaire.Progress
              className="tui-gate-progress"
              render={(props, state) => (
                <span {...props}>
                  <span className="tui-gate-qdots">
                    {Array.from({ length: state.total }, (_, i) => (
                      <i
                        key={i}
                        className="tui-gate-qdot"
                        data-state={
                          i + 1 < state.current
                            ? 'done'
                            : i + 1 === state.current
                              ? 'active'
                              : 'todo'
                        }
                      />
                    ))}
                  </span>
                  {!threadCtx && `Question ${state.current} of ${state.total}`}
                </span>
              )}
            />
          )}
        </div>
        {threadCtx ? (
          <ThreadCard ctx={threadCtx} />
        ) : (
          q.context &&
          qctx === null && (
            <div className="tui-gate-question-context">
              <Markdown unstyled linkTargetBlank>
                {q.context}
              </Markdown>
            </div>
          )
        )}
        <Questionnaire.Choices className="tui-gate-choices">
          {q.choices.map(choice => {
            const recommended = choice.recommended === true;
            const entry = repliesCtx?.replies.find(
              r => r.thread === choice.value
            );
            const recommendedChip = recommended && (
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
            return (
              <Questionnaire.Choice
                key={choice.value}
                value={choice.value}
                data-recommended={recommended ? 'true' : undefined}
                checked={
                  q.multiple
                    ? picked.has(choice.value)
                    : current === choice.value
                }
                onChange={event =>
                  q.multiple
                    ? onToggleMulti(choice.value, event.currentTarget.checked)
                    : onSetSingle(choice.value)
                }
                className="tui-gate-choice"
              >
                <Questionnaire.ChoiceInput
                  render={props => (
                    <input {...props} className="tui-gate-choice-input" />
                  )}
                />
                <Questionnaire.ChoiceLabel className="tui-gate-choice-label">
                  {entry ? (
                    <ReplyChoiceBody entry={entry}>
                      {recommendedChip}
                    </ReplyChoiceBody>
                  ) : (
                    <>
                      <span className="tui-gate-choice-label-row">
                        <span title={choice.description}>{choice.label}</span>
                        {recommendedChip}
                      </span>
                      {choice.subtitle && (
                        <span className="tui-gate-choice-subtitle">
                          {choice.subtitle}
                        </span>
                      )}
                    </>
                  )}
                </Questionnaire.ChoiceLabel>
                <Questionnaire.ChoiceShortcut className="tui-gate-key" />
              </Questionnaire.Choice>
            );
          })}
        </Questionnaire.Choices>
        <Questionnaire.Error className="tui-gate-invalid" />
        <input
          type="text"
          className="tui-gate-note"
          name={noteFieldName(q.name)}
          aria-label={`Note for ${q.prompt}`}
          placeholder="Add a note"
          value={note}
          onChange={event => onSetNote(event.currentTarget.value)}
          onKeyDown={event => {
            // Plain Enter in a text input is implicit form submission;
            // Cmd/Ctrl+Enter stays the primitive's validate-and-advance.
            if (event.key === 'Enter' && !event.metaKey && !event.ctrlKey)
              event.preventDefault();
          }}
        />
      </div>
    </Questionnaire.Item>
  );
}

/** The questionnaire form the triage modal renders. One question renders
    flat; two or more step through the primitive's own step mode (one active
    item, Previous / Next, Submit on the last). The code-changes item of a
    respond-plan gate joins the sequence only once a `fix:` value is picked,
    which in step mode means a new last step appears and Submit moves to it.
    `showFocusAction` keeps the nav's own focus-pane button out of hosts
    that surface it elsewhere (the triage modal's head row). */
function GateForm({
  gate,
  mr,
  form,
  onFocusPane,
  showFocusAction = true,
  showContextFallback = true,
}: {
  gate: GateRow;
  /** Absent for a non-MR gate (queueExtras); the focus-pane-via-domain branch
      below only fires when both this and `gate.domain` are present. */
  mr?: BoardMRWithReview;
  form: GateFormState;
  onFocusPane: (mr: BoardMRWithReview, domain: GateDomain) => void;
  showFocusAction?: boolean;
  /** DecisionQueueModal renders the gate context in its own Decision context
      pane above the form; a bare host with no such pane wants this on so
      the context is not lost. */
  showContextFallback?: boolean;
}) {
  const {
    selections,
    notes,
    busy,
    failed,
    focusBusy,
    focusError,
    originFocusable,
    display,
    items,
    stepped,
    activeStep,
    setStep,
    setSingle,
    toggleMulti,
    setNote,
    resetAll,
    focusGate,
    submit,
  } = form;
  // The morph below swaps next/submit for the skip control while a
  // skippable question has nothing picked, so the primary button is always
  // live -- a disabled "next" beside a separate skip read as a dead end.
  const activeDisplay = display.find(q => q.name === activeStep);
  const activeSkippable =
    activeDisplay !== undefined && !activeDisplay.required;
  const lastStep =
    display.length > 0 && activeStep === display[display.length - 1]!.name;
  const questionCtx = useMemo(
    () =>
      new Map<string, GateCtx | null>(
        gate.questions.map(q => [q.id, parseGateCtx(q.context)])
      ),
    [gate.questions]
  );
  const fallbackContext = useMemo(
    () => paneContext(gate.context),
    [gate.context]
  );
  // A thread's "N of M" counts the gate's thread-* questions, which the
  // gate contract keeps positional.
  const threadIds = useMemo(
    () => gate.questions.filter(q => /^thread-/.test(q.id)).map(q => q.id),
    [gate.questions]
  );
  return (
    <Questionnaire.Root
      className="tui-gate-form"
      items={items}
      shortcuts="numbers"
      item={activeStep}
      onItemChange={setStep}
      onSubmit={event => {
        event.preventDefault();
        void submit(
          answersFromForm(
            { kind: gate.kind, questions: gate.questions },
            new FormData(event.currentTarget)
          )
        );
      }}
    >
      {showContextFallback && fallbackContext && (
        <div className="tui-gate-context-raw">
          <Markdown unstyled linkTargetBlank>
            {fallbackContext}
          </Markdown>
        </div>
      )}
      {/* Questionnaire.Root renders no wrapper of its own around its
          children (it spreads them straight onto the <form>), so this div
          is what the scroll region below targets -- the active question's
          own height is what can outgrow the form, not the fixed nav. */}
      <div className="tui-gate-items">
        {display.map(q => {
          const current = selections[q.name];
          const picked = new Set(Array.isArray(current) ? current : []);
          const qctx = questionCtx.get(q.name) ?? null;
          const threadOrd =
            qctx?.shape === 'thread@1' ? threadIds.indexOf(q.name) : -1;
          return (
            <GateQuestionCard
              key={q.name}
              q={q}
              current={current}
              picked={picked}
              qctx={qctx}
              threadOrd={threadOrd}
              threadCount={threadIds.length}
              stepped={stepped}
              note={notes[q.name] ?? ''}
              onSetNote={value => setNote(q.name, value)}
              onToggleMulti={(value, checked) =>
                toggleMulti(q.name, value, checked)
              }
              onSetSingle={value => setSingle(q.name, value)}
            />
          );
        })}
      </div>
      <div className="tui-gate-actions">
        <Questionnaire.Previous
          disabled={busy}
          render={props => (
            <Button {...props} variant="light" intent="muted" size="lg" />
          )}
        >
          previous
        </Questionnaire.Previous>
        {stepped && (
          <Button
            type="reset"
            variant="subtle"
            intent="muted"
            size="lg"
            disabled={busy}
            onClick={resetAll}
          >
            reset
          </Button>
        )}
        <div className="tui-gate-actions-end">
          {failed && (
            <span className="tui-gate-error">
              submit failed... nothing was sent, try again
            </span>
          )}
          {focusError && <span className="tui-gate-error">{focusError}</span>}
          {showFocusAction &&
            (gate.status === 'parked' ? (
              gate.domain &&
              mr && (
                <Button
                  type="button"
                  variant="subtle"
                  intent="muted"
                  size="lg"
                  title="resume this gate's flow in a fresh pane"
                  onClick={() => onFocusPane(mr, gate.domain!)}
                >
                  focus pane
                </Button>
              )
            ) : (
              <Button
                type="button"
                variant="subtle"
                intent="muted"
                size="lg"
                disabled={!originFocusable || focusBusy}
                title={
                  originFocusable
                    ? 'jump into the pane behind this gate'
                    : 'no origin on this gate'
                }
                onClick={() => void focusGate()}
              >
                focus pane
              </Button>
            ))}
          {/* While a skippable multi has nothing picked, the skip control IS
              the primary button ("next · none"), and next/submit render null
              -- skipping submits an explicit []. The primitive hides skip on
              required items, so required steps keep plain next/submit. */}
          <Questionnaire.Skip
            disabled={busy}
            render={(props, state) =>
              state.visible && state.status !== 'answered' ? (
                <Button {...props} variant="filled" intent="accent" size="lg" />
              ) : null
            }
          >
            {lastStep ? 'submit · none' : 'next · none'}
          </Questionnaire.Skip>
          <Questionnaire.Next
            render={(props, state) =>
              activeSkippable && state.status !== 'answered' ? null : (
                <Button
                  {...props}
                  variant="filled"
                  intent="accent"
                  size="lg"
                  disabled={busy || state.status !== 'answered'}
                />
              )
            }
          >
            next
          </Questionnaire.Next>
          <Questionnaire.Submit
            render={(props, state) =>
              activeSkippable && state.status !== 'answered' ? null : (
                <Button
                  {...props}
                  variant="filled"
                  intent="accent"
                  size="lg"
                  disabled={busy || state.status !== 'answered'}
                />
              )
            }
          >
            {busy ? 'submitting…' : 'submit'}
          </Questionnaire.Submit>
        </div>
      </div>
    </Questionnaire.Root>
  );
}

export { AnsweredChip, GateForm, useGateForm };
