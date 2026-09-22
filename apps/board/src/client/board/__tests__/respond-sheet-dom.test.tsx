/** The respond sheet decides every thread at once and builds the wire
    answer itself, so what it posts must match what the step form posted:
    every thread's pick, code-changes only once a fix is picked (else the
    gate's own sentinel), a trimmed note as `{ value, note }`, and a replies
    gate's checklist plus its disposition. */

import React from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';

import type { GateRow } from '../../../gates/store.ts';
import type { BoardMRWithReview } from '../../types.ts';
import { DecisionQueueModal } from '../DecisionQueueModal.tsx';

GlobalRegistrator.register({ url: 'http://localhost/' });

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const MR = {
  iid: 87,
  title: 'add retry to the fetch queue',
  sourceBranch: 'retry-queue',
  targetBranch: 'main',
  createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  author: { username: 'alex', name: 'Alex Doe' },
} as unknown as BoardMRWithReview;

const thread = (summary: string) =>
  JSON.stringify({
    'gate-ctx': 'thread@1',
    author: 'renee',
    severity: 'blocking',
    claim: { summary },
    verdict: { call: 'valid' },
    reply: { kind: 'verbatim', text: 'fixed, with a test.' },
  });

const threadQuestion = (n: number) => ({
  id: `thread-${n}`,
  label: `queue/enqueue.ts:${n * 10}`,
  multi: false,
  context: thread(`claim ${n}`),
  options: [
    { value: `reply:t${n}`, label: 'reply' },
    { value: `fix:t${n}`, label: 'fix' },
    { value: `skip:t${n}`, label: 'skip' },
  ],
});

function planGate(): GateRow {
  return {
    gateId: 'g-plan',
    subject: 'mr:https://gitlab.example.com/demo/app/-/merge_requests/87',
    kind: 'respond-plan',
    label: 'respond gate !87',
    status: 'open',
    openedAt: Date.now() - 60_000,
    context: JSON.stringify({
      'gate-ctx': 'plan@1',
      reviewer: 'renee',
      threads: { total: 2, blocking: 2 },
    }),
    questions: [
      threadQuestion(1),
      threadQuestion(2),
      {
        id: 'code-changes',
        label: 'Approve the proposed code changes?',
        multi: false,
        options: ['approve', 'revise', 'skip'],
      },
    ],
  };
}

function postGate(): GateRow {
  return {
    gateId: 'g-post',
    subject: 'mr:https://gitlab.example.com/demo/app/-/merge_requests/87',
    kind: 'respond-post',
    label: 'respond-post !87',
    status: 'open',
    openedAt: Date.now() - 60_000,
    context: JSON.stringify({
      'gate-ctx': 'post@1',
      reviewer: 'renee',
      replies: 2,
      fixes: [],
    }),
    questions: [
      {
        id: 'replies',
        label: 'Post which replies?',
        multi: true,
        context: JSON.stringify({
          'gate-ctx': 'replies@1',
          replies: [
            { thread: 'r1', file: 'a.ts:1', verb: 'reply', text: 'one' },
            { thread: 'r2', file: 'b.ts:2', verb: 'reply', text: 'two' },
          ],
        }),
        options: ['r1', 'r2'],
      },
      {
        id: 'disposition',
        label: 'After posting?',
        multi: false,
        options: ['resolve-addressed', 'leave-open'],
      },
    ],
  };
}

let root: Root;
let container: HTMLElement;
let posts: Array<{ url: string; body: unknown }>;

beforeEach(() => {
  localStorage.clear();
  posts = [];
  (globalThis as { fetch: unknown }).fetch = async (
    input: RequestInfo | URL,
    init?: { body?: string }
  ) => {
    const url = typeof input === 'string' ? input : input.toString();
    posts.push({ url, body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  container.remove();
});

async function render(row: GateRow) {
  await React.act(async () => {
    root.render(
      <DecisionQueueModal
        gate={row}
        mr={MR}
        position={1}
        states={['active']}
        onClose={() => {}}
        onSkip={() => {}}
        onBack={() => {}}
        onFocusPane={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
      />
    );
  });
}

const $ = (selector: string) => document.body.querySelector(selector);

async function pick(value: string) {
  const input = $(`input[value="${value}"]`) as HTMLInputElement | null;
  if (!input) throw new Error(`no choice ${value}`);
  await React.act(async () => {
    input.click();
  });
}

async function type(label: string, text: string) {
  const input = $(`input[aria-label="${label}"]`) as HTMLInputElement;
  await React.act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value'
    )!.set!;
    setter.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const submit = () => $('.tui-sheet-submit') as HTMLButtonElement;

async function clickSubmit() {
  await React.act(async () => {
    submit().click();
    await new Promise(r => setTimeout(r, 0));
  });
}

const answer = () => posts.find(p => p.url === '/gate/answer')?.body;

test('every thread renders at once in the main column', async () => {
  await render(planGate());
  expect(
    document.body.querySelectorAll('.tui-respond-list > .tui-gate-question')
  ).toHaveLength(2);
  expect($('.tui-sheet-list-tally')!.textContent).toBe('0 of 2 decided');
});

test('submit stays disabled until every thread is decided', async () => {
  await render(planGate());
  expect(submit().disabled).toBe(true);
  await pick('reply:t1');
  expect(submit().disabled).toBe(true);
  await pick('reply:t2');
  expect(submit().disabled).toBe(false);
  expect(submit().textContent).toBe('submit · 2 reply');
});

test('with no fix picked, code-changes stays out of the rail and posts its sentinel', async () => {
  await render(planGate());
  await pick('reply:t1');
  await pick('skip:t2');
  expect($('.tui-sheet-dock-question')).toBeNull();
  await clickSubmit();
  expect(answer()).toEqual({
    gateId: 'g-plan',
    answers: {
      'thread-1': 'reply:t1',
      'thread-2': 'skip:t2',
      'code-changes': 'skip',
    },
  });
});

test('a fix brings code-changes into the rail and holds submit until it is answered', async () => {
  await render(planGate());
  await pick('fix:t1');
  await pick('reply:t2');
  expect($('.tui-sheet-dock-prompt')!.textContent).toBe(
    'Approve the proposed code changes?'
  );
  expect(submit().disabled).toBe(true);
  await pick('approve');
  expect(submit().textContent).toBe('submit · 1 fix · 1 reply');
  await clickSubmit();
  expect(answer()).toEqual({
    gateId: 'g-plan',
    answers: {
      'thread-1': 'fix:t1',
      'thread-2': 'reply:t2',
      'code-changes': 'approve',
    },
  });
});

test('a code-changes pick left over after the fix is withdrawn yields to the sentinel', async () => {
  await render(planGate());
  await pick('fix:t1');
  await pick('approve');
  await pick('reply:t1');
  await pick('reply:t2');
  await clickSubmit();
  expect(answer()).toEqual({
    gateId: 'g-plan',
    answers: {
      'thread-1': 'reply:t1',
      'thread-2': 'reply:t2',
      'code-changes': 'skip',
    },
  });
});

test("a thread's note travels trimmed with its pick", async () => {
  await render(planGate());
  await pick('reply:t1');
  await pick('reply:t2');
  await type('Note for queue/enqueue.ts:10', '  say which test  ');
  await clickSubmit();
  expect(answer()).toMatchObject({
    answers: {
      'thread-1': { value: 'reply:t1', note: 'say which test' },
      'thread-2': 'reply:t2',
    },
  });
});

test('a replies gate posts its checklist and disposition', async () => {
  await render(postGate());
  expect($('.tui-sheet-list-title')!.textContent).toBe('Post which replies?');
  await pick('r2');
  await pick('resolve-addressed');
  expect($('.tui-sheet-list-tally')!.textContent).toBe('1 of 2 selected');
  expect(submit().textContent).toBe('post 1 · resolve-addressed');
  await clickSubmit();
  expect(answer()).toEqual({
    gateId: 'g-post',
    answers: { replies: ['r2'], disposition: 'resolve-addressed' },
  });
});
