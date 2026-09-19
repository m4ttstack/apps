/** DOM-level test for the full-screen review gate sheet (task 6): the
    findings list collapses `findings-1`/`findings-2` chunks into one list,
    the tally and submit label track the checked set, tier groups show their
    counts, and the verdict renders as gate choices with the recommended
    badge. Mirrors gate-form-skip-dom.test.tsx's direct-mount harness rather
    than a full Board render, since the sheet is host-agnostic (Task 7 wires
    it into DecisionQueueModal). */

import React from 'react';
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeEach, expect, test } from 'bun:test';
import { createRoot, type Root } from 'react-dom/client';

import type { GateRow } from '../../../gates/store.ts';
import type { BoardMRWithReview } from '../../types.ts';
import { useGateForm } from '../GateForm.tsx';
import { isReviewSheetGate, ReviewGateSheet } from '../ReviewGateSheet.tsx';

GlobalRegistrator.register({ url: 'http://localhost/' });

afterAll(async () => {
  await GlobalRegistrator.unregister();
});

(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const GATE: GateRow = {
  gateId: 'g-review',
  subject: 'mr:gitlab.example.com/acme/widgets/-/merge_requests/31',
  kind: 'review-post',
  label: 'review',
  status: 'open',
  openedAt: 1,
  questions: [
    {
      id: 'findings-1',
      label: 'Post which findings to !31?',
      multi: true,
      options: [
        {
          value: 'f1',
          label: '[Critical] SQL built from unsanitized input',
          description: 'lib/db/query.ts:42 · parameterize the query',
        },
        {
          value: 'f2',
          label: '[Important] Missing null check on response',
          description:
            'lib/api/client.ts:88 · guard before dereferencing · kind:bug',
        },
        {
          value: 'f3',
          label: '[Important] Inconsistent error wording',
          description: 'lib/errors.ts:15 · align with the style guide',
        },
        {
          value: 'f4',
          label: '[Minor] Unused import',
          description: 'lib/utils.ts:3 · drop the dead import',
        },
      ],
    },
    {
      id: 'findings-2',
      label: 'Post which findings to !31?',
      multi: true,
      options: [
        {
          value: 'f5',
          label: '[Important] Retry loop lacks backoff',
          description: 'lib/retry.ts:41 · add exponential backoff',
        },
        {
          value: 'f6',
          label: '[Minor] Inconsistent spacing',
          description: 'lib/format.ts:9 · run prettier',
        },
      ],
    },
    {
      id: 'outcome',
      label: 'Verdict on !31',
      multi: false,
      options: [
        { value: 'approve', label: 'approve (recommended)' },
        { value: 'comment', label: 'comment' },
      ],
    },
  ],
};

const TIER_GATE: GateRow = {
  ...GATE,
  gateId: 'g-tier',
  questions: [
    {
      id: 'tiers',
      label: 'Post which findings?',
      multi: true,
      options: [{ value: 'Minor', label: 'Minor (4)' }],
    },
  ],
};

const MR = {
  iid: 31,
  title: 'themed gate controls',
  webUrl: 'https://gitlab.example.com/acme/widgets/-/merge_requests/31',
  author: { username: 'paul', name: 'Paul' },
  sourceBranch: 'board-28-themed-gate-controls',
  targetBranch: 'main',
  createdAt: '2026-09-17T00:00:00.000Z',
  diff: { additions: 40, deletions: 12, filesChanged: 3 },
} as unknown as BoardMRWithReview;

const QUEUE = {
  index: 1,
  total: 3,
  states: ['done', 'active', 'todo'] as const,
  onPrev: () => {},
  onNext: () => {},
};

function Host({ gate = GATE }: { gate?: GateRow }) {
  const form = useGateForm(gate);
  return (
    <ReviewGateSheet
      gate={gate}
      mr={MR}
      form={form}
      queue={{ ...QUEUE, states: [...QUEUE.states] }}
      onClose={() => {}}
      onSkip={() => {}}
      onFocusPane={() => {}}
    />
  );
}

let root: Root;
let container: HTMLElement;

beforeEach(() => {
  localStorage.clear();
  (globalThis as { fetch: unknown }).fetch = async () =>
    new Response('no structured review yet', { status: 404 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  container.remove();
});

async function render(gate?: GateRow) {
  await React.act(async () => {
    root.render(<Host gate={gate} />);
  });
}

async function click(el: Element) {
  await React.act(async () => {
    (el as HTMLElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

test('collapses findings-1/findings-2 into one six-row list with a full tally', async () => {
  await render();

  const rows = container.querySelectorAll('.tui-review-finding-row');
  expect(rows.length).toBe(6);

  const tally = container.querySelector('.tui-review-find-tally');
  expect(tally?.textContent).toContain('6 of 6 selected');
});

test('tier group headers show their counts', async () => {
  await render();

  const pills = [...container.querySelectorAll('.tui-review-tier-pill')].map(
    p => p.textContent?.trim()
  );
  expect(pills).toContain('Critical (1)');
  expect(pills).toContain('Important (3)');
  expect(pills).toContain('Minor (2)');
});

test('unchecking a finding updates the tally and the submit label', async () => {
  await render();

  const submitBefore = container.querySelector('.tui-review-submit');
  expect(submitBefore?.textContent).toBe('post 6 · approve');

  const first = container.querySelector(
    '.tui-review-finding-row input[type="checkbox"]'
  ) as HTMLInputElement;
  expect(first.checked).toBe(true);
  await click(first);

  const tally = container.querySelector('.tui-review-find-tally');
  expect(tally?.textContent).toContain('5 of 6 selected');

  const submitAfter = container.querySelector('.tui-review-submit');
  expect(submitAfter?.textContent).toBe('post 5 · approve');
});

test('the verdict renders as gate choices with the recommended badge', async () => {
  await render();

  const choices = container.querySelectorAll(
    '.tui-review-sheet-rail .tui-gate-choice'
  );
  expect(choices.length).toBe(2);

  const radios = [
    ...container.querySelectorAll('.tui-review-sheet-rail input[type=radio]'),
  ] as HTMLInputElement[];
  expect(radios.map(r => r.value).sort()).toEqual(['approve', 'comment']);
  expect(radios.find(r => r.value === 'approve')?.checked).toBe(true);

  const recommended = container.querySelector('[data-gate="recommended"]');
  expect(recommended).not.toBeNull();
  expect(recommended?.textContent?.trim()).toBe('recommended');
});

test('isReviewSheetGate is true for a finding-shaped gate and false for a tier-option gate', () => {
  expect(isReviewSheetGate(GATE)).toBe(true);
  expect(isReviewSheetGate(TIER_GATE)).toBe(false);
});
