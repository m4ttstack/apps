/** The decision queue's finished face recaps the session: a heading, a
    count, one row per decided gate in answer order with its outcome, and a
    done button that holds focus so Enter closes. Rendered in StrictMode, as
    the board is, since the sheet's own mount focus runs twice there. */

import React, { StrictMode } from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';

import type { GateRow } from '../../../gates/store.ts';
import type { BoardMRWithReview } from '../../types.ts';
import { DecisionQueueComplete } from '../DecisionQueueModal.tsx';
import { signOff } from '../format.ts';

GlobalRegistrator.register({ url: 'http://localhost/' });

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mr = (iid: number, title: string) =>
  ({ iid, title }) as unknown as BoardMRWithReview;

const postThread = (n: number, t: string) => ({
  id: `thread-${n}`,
  label: `queue/${t}.ts:${n}`,
  multi: true,
  options: [
    { value: `post:${t}`, label: 'Post' },
    { value: `resolve:${t}`, label: 'Resolve' },
  ],
});

const postGate: GateRow = {
  gateId: 'g-post',
  subject: 'mr:https://gitlab.example.com/demo/app/-/merge_requests/87',
  kind: 'respond-post',
  label: 'respond gate !87',
  status: 'answered',
  openedAt: 1,
  questions: [postThread(1, 't1'), postThread(2, 't2')],
  answers: {
    'thread-1': { value: ['post:t1', 'resolve:t1'], text: 'reworded reply' },
    'thread-2': ['post:t2'],
  },
  answeredBy: 'board',
  answeredAt: 2,
};

const planGate: GateRow = {
  gateId: 'g-plan',
  subject: 'mr:https://gitlab.example.com/demo/app/-/merge_requests/91',
  kind: 'respond-plan',
  label: 'respond gate !91',
  status: 'answered',
  openedAt: 1,
  questions: [
    {
      id: 'thread-1',
      label: 'queue/drain.ts:4',
      multi: false,
      options: [
        { value: 'reply:t9', label: 'reply' },
        { value: 'fix:t9', label: 'fix' },
        { value: 'skip:t9', label: 'skip' },
      ],
    },
    {
      id: 'code-changes',
      label: 'Approve the proposed code changes?',
      multi: false,
      options: ['approve', 'revise', 'skip'],
    },
  ],
  answers: { 'thread-1': 'fix:t9', 'code-changes': 'approve' },
  answeredBy: 'board',
  answeredAt: 3,
};

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  container.remove();
});

async function show(
  decided: Array<{ gate: GateRow; mr?: BoardMRWithReview }>
): Promise<void> {
  await React.act(async () =>
    root.render(
      <StrictMode>
        <DecisionQueueComplete decided={decided} onClose={() => {}} />
      </StrictMode>
    )
  );
}

const text = (sel: string) =>
  container.querySelector(sel)?.textContent?.trim() ?? '';

test('the finished queue recaps each decision in answer order and focuses done', async () => {
  await show([
    { gate: postGate, mr: mr(87, 'retry the fetch queue with backoff') },
    { gate: planGate, mr: mr(91, 'drain the queue on shutdown') },
  ]);
  expect(text('.tui-triage-done-heading')).toBe('Queue cleared');
  expect(text('.tui-triage-done-counts')).toStartWith(
    '2 decisions this session.'
  );
  expect(text('.tui-triage-done-recap .tui-sheet-context-label')).toBe(
    'decided this session'
  );
  const rows = [...container.querySelectorAll('.tui-triage-done-row')];
  expect(
    rows.map(r => r.querySelector('.tui-triage-done-ref')?.textContent)
  ).toEqual(['!87', '!91']);
  expect(rows[0]!.textContent).toContain('respond');
  expect(rows[0]!.textContent).toContain('retry the fetch queue with backoff');
  expect(rows[0]!.querySelector('.tui-triage-done-outcome')?.textContent).toBe(
    '2 posted (1 edited), 1 resolved'
  );
  expect(rows[1]!.querySelector('.tui-triage-done-outcome')?.textContent).toBe(
    'fix, approve'
  );
  const done = [...container.querySelectorAll('button')].find(
    b => b.textContent === 'done'
  );
  expect(document.activeElement).toBe(done!);
});

test('a gate the poll has not caught up with reads answered, and a gate with no MR shows its subject', async () => {
  const lagging: GateRow = {
    ...postGate,
    status: 'open',
    answers: undefined,
    answeredBy: undefined,
    answeredAt: undefined,
  };
  const attention: GateRow = {
    gateId: 'g-attn',
    subject: 'agent:pane-4',
    kind: 'pane-attention',
    label: 'pane needs attention',
    status: 'answered',
    openedAt: 1,
    questions: [
      { id: 'next', label: 'Next?', multi: false, options: ['resume', 'stop'] },
    ],
    answers: { next: 'resume' },
    answeredBy: 'board',
    answeredAt: 2,
  };
  await show([
    { gate: lagging, mr: mr(87, 'retry the fetch queue with backoff') },
    { gate: attention },
  ]);
  const rows = [...container.querySelectorAll('.tui-triage-done-row')];
  const lagOutcome = rows[0]!.querySelector('.tui-triage-done-outcome');
  expect(lagOutcome?.textContent).toBe('answered');
  expect(lagOutcome?.getAttribute('data-pending')).toBe('true');
  expect(rows[1]!.querySelector('.tui-triage-done-ref')?.textContent).toBe(
    'agent:pane-4'
  );
  expect(rows[1]!.querySelector('.tui-triage-done-title')).toBeNull();
  expect(rows[1]!.querySelector('.tui-triage-done-outcome')?.textContent).toBe(
    'resume'
  );
});

test('one decision reads singular, and an empty session has no recap card', async () => {
  await show([{ gate: planGate, mr: mr(91, 'drain the queue on shutdown') }]);
  expect(text('.tui-triage-done-counts')).toStartWith(
    '1 decision this session.'
  );
  await show([]);
  expect(container.querySelector('.tui-triage-done-recap')).toBeNull();
});

test('the sign-off follows the local hour', () => {
  expect(signOff(0)).toBe('Enjoy the rest of your morning.');
  expect(signOff(11)).toBe('Enjoy the rest of your morning.');
  expect(signOff(12)).toBe('Enjoy the rest of your afternoon.');
  expect(signOff(16)).toBe('Enjoy the rest of your afternoon.');
  expect(signOff(17)).toBe('Enjoy your evening.');
  expect(signOff(23)).toBe('Enjoy your evening.');
});
