import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';

import { useBodyScrollLock, useEscapeClose } from '@mattstack/tui-kit';
import type { TriageGateState } from './DecisionQueueModal.tsx';

export interface GateSheetQueue {
  /** 0-based position of the active gate in the queue. */
  index: number;
  total: number;
  states: TriageGateState[];
  onPrev: () => void;
  onNext: () => void;
  /** "!ref · title" of the gate after this one; omit on the last. */
  nextPeek?: string;
}

/** The one full-screen frame every decision-queue face renders in: the head
    (title, gate-level actions, queue nav, tag, close) and a body the caller
    fills. */
function GateSheet({
  variant,
  ariaLabel,
  actions,
  queue,
  tag,
  onClose,
  children,
}: {
  variant: 'review' | 'triage';
  ariaLabel: string;
  actions?: ReactNode;
  queue?: GateSheetQueue;
  tag?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEscapeClose(onClose);
  useBodyScrollLock();

  // aria-modal alone does not fence keyboard focus: take focus on mount,
  // keep Tab cycling inside, and hand focus back to the opener on unmount.
  const sheetRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    sheetRef.current?.focus();
    return () => opener?.focus();
  }, []);
  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const root = sheetRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      )
    ).filter(el => !el.hasAttribute('disabled'));
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={`tui-gate-sheet tui-${variant}-sheet`}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      tabIndex={-1}
      ref={sheetRef}
      onKeyDown={trapTab}
    >
      <header className="tui-gate-sheet-head">
        <span className="tui-gate-sheet-title">decision queue</span>
        {actions && <span className="tui-gate-sheet-actions">{actions}</span>}
        <span className="tui-gate-sheet-spacer" />
        {queue && (
          <nav className="tui-gate-queue-nav" aria-label="gate queue">
            <button
              type="button"
              className="tui-gate-queue-chevron"
              onClick={queue.onPrev}
              disabled={queue.index <= 0}
              title="previous gate"
              aria-label="previous gate"
            >
              ‹
            </button>
            <span className="tui-gate-queue-pips">
              {queue.states.map((s, i) => (
                <i key={i} className="tui-gate-queue-pip" data-state={s} />
              ))}
            </span>
            <span
              className="tui-gate-queue-pos"
              title={queue.nextPeek ? `next: ${queue.nextPeek}` : undefined}
            >
              gate {queue.index + 1} of {queue.total}
            </span>
            <button
              type="button"
              className="tui-gate-queue-chevron"
              onClick={queue.onNext}
              title="next gate"
              aria-label="next gate"
            >
              ›
            </button>
          </nav>
        )}
        {tag && (
          <>
            <span className="tui-gate-sheet-sep" aria-hidden="true" />
            <span className="tui-gate-sheet-tag">{tag}</span>
          </>
        )}
        <button
          type="button"
          className="tui-gate-sheet-close"
          onClick={onClose}
          aria-label="close"
        >
          ✕
        </button>
      </header>
      {children}
    </div>
  );
}

export { GateSheet };
