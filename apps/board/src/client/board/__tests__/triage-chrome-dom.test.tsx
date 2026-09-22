/** The queue modal's chrome: the step nav portals into the footer slot and
    never renders inside the scrolling body, the footer nav still drives the
    form and its native reset/submit through the form="" attribute, and the
    head is one row -- title, compact (size="sm") focus pane / skip gate,
    then close. */

import React from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';

import type { GateRow } from '../../../gates/store.ts';
import { DecisionQueueModal } from '../DecisionQueueModal.tsx';

GlobalRegistrator.register({ url: 'http://localhost/' });

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function stepped(): GateRow {
  return {
    gateId: 'g-steps',
    subject: 'mr:https://gitlab.example.com/demo/app/-/merge_requests/51',
    kind: 'clarify',
    label: 'clarify !51',
    status: 'open',
    openedAt: Date.now() - 60_000,
    context: 'Two questions for the author.',
    origin: { paneId: 'pane-51', worktree: '/work/demo' },
    questions: [
      {
        id: 'first',
        label: 'Keep the flag?',
        multi: false,
        options: ['keep', 'drop'],
      },
      {
        id: 'second',
        label: 'Ship behind it?',
        multi: false,
        options: ['yes', 'no'],
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

async function renderModal(row: GateRow, nextPeek?: string) {
  await React.act(async () => {
    root.render(
      <DecisionQueueModal
        gate={row}
        position={1}
        states={['active']}
        nextPeek={nextPeek}
        onClose={() => {}}
        onSkip={() => {}}
        onFocusPane={() => {}}
        onAnswered={() => {}}
        onContinue={() => {}}
      />
    );
  });
}

const $ = (selector: string) => document.body.querySelector(selector);

async function click(el: Element | null) {
  if (!el) throw new Error('nothing to click');
  await React.act(async () => {
    (el as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

const footerButton = (text: string) =>
  [...document.body.querySelectorAll('.tui-triage-footer button')].find(
    b => b.textContent?.trim() === text && !b.hasAttribute('hidden')
  ) ?? null;

test('the step nav renders in the footer, never in the scrolling body', async () => {
  await renderModal(stepped());
  expect($('.tui-triage-footer .tui-gate-actions')).not.toBeNull();
  expect($('.tui-triage-body .tui-gate-actions')).toBeNull();
});

test('the footer nav still drives the form: pick, next, pick, submit posts both answers', async () => {
  await renderModal(stepped());
  await click($('input[value="keep"]'));
  await click(footerButton('next'));
  await click($('input[value="yes"]'));
  await click(footerButton('submit'));
  const answer = posts.find(p => p.url === '/gate/answer');
  expect(answer?.body).toMatchObject({
    gateId: 'g-steps',
    answers: { first: 'keep', second: 'yes' },
  });
});

test('reset in the footer clears the picks', async () => {
  await renderModal(stepped());
  await click($('input[value="keep"]'));
  await click(footerButton('reset'));
  expect(($('input[value="keep"]') as HTMLInputElement).checked).toBe(false);
});

test('the head is one row: title, compact focus pane and skip gate, then close', async () => {
  await renderModal(stepped());
  const head = $('[data-part="modal-head"]')!;
  expect(head.querySelector('.tui-triage-title')?.textContent).toBe(
    'decision queue'
  );
  const actions = [...head.querySelectorAll('.tui-triage-head-actions button')];
  expect(actions.map(b => b.textContent?.trim())).toEqual([
    'focus pane',
    'skip gate',
  ]);
  for (const b of actions) expect(b.getAttribute('data-size')).toBe('sm');
  expect($('.tui-triage-queue-row')).toBeNull();
});

test('the footer never renders a peek row; the next-gate title rides the count tooltip', async () => {
  await renderModal(stepped(), '!52 · add retry to the fetch queue');
  expect($('.tui-triage-peek')).toBeNull();
  expect($('.tui-triage-pos')?.getAttribute('title')).toBe(
    'next: !52 · add retry to the fetch queue'
  );
});
