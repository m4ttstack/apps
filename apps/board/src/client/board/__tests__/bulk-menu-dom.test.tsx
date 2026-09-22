/** Board-level tests for the bulk menu: a real happy-dom document and a real
    Board render, with fetch faked. */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  test,
} from 'bun:test';

GlobalRegistrator.register({ url: 'http://localhost/' });

class FakeEventSource {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  close(): void {}
}
(globalThis as unknown as { EventSource: unknown }).EventSource =
  FakeEventSource;
(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function boardMr(iid: number, over: Record<string, unknown> = {}) {
  return {
    iid,
    title: `mr ${iid}`,
    webUrl: `https://gitlab.example.com/g/p/-/merge_requests/${iid}`,
    author: { username: 'matt', name: 'Matt' },
    sourceBranch: `b${iid}`,
    targetBranch: 'main',
    updatedAt: '2026-08-19T00:00:00Z',
    createdAt: '2026-08-19T00:00:00Z',
    reviews: { given: 0, required: 0, isApproved: false, reviewers: [] },
    blockers: { any: false },
    mergeButton: { visible: true, disabled: false, loading: false },
    rebaseButton: { visible: false, loading: false },
    autoMergeButton: { visible: false, isActive: false },
    behindTarget: 2,
    isStacked: false,
    reviewerComments: 0,
    unresolvedThreads: 0,
    isDraft: false,
    pipelineState: 'none',
    repositoryId: `gitlab:${iid}`,
    rtRepo: null,
    codeownerSections: [],
    gates: [],
    ...over,
  };
}

const member = (username: string) => ({ username, name: username, count: 0 });
const BOARD_DATA = {
  title: 'MRs ready for review',
  defaultMember: 'matt',
  members: [member('matt'), member('kim'), member('jo')],
  allMembers: ['matt', 'kim', 'jo'].map(u => ({ ...member(u), hidden: false })),
  mrs: [
    boardMr(101),
    boardMr(102),
    boardMr(103, { isStacked: true, targetBranch: 'b101' }),
  ],
  fetchedAt: 1755600000000,
  fetchError: null,
  local: true,
  slackEnabled: false,
  slackTemplates: {
    single: '{title}: {url}',
    multiHeader: '{count} ready',
    multiItem: '- {title}',
  },
  dataSyncedAt: 1755600000000,
  scopeUncovered: [],
  scopeUncoveredSections: [],
  scopeKnownSections: null,
  scopeWindowDays: null,
  staleAfterDays: 90,
  canInvite: false,
  peering: null,
  tabs: [{ id: 'team', label: 'Team', source: { kind: 'authors' } }],
};

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let Board: typeof import('../Board.tsx').Board;
const realFetch = globalThis.fetch;
let posts: Array<{ url: string; body: Record<string, unknown> }> = [];
let root: ReturnType<typeof import('react-dom/client').createRoot>;
let container: HTMLDivElement;

beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (init?.method === 'POST')
      posts.push({ url, body: JSON.parse(String(init.body)) });
    if (url.startsWith('/data.json'))
      return new Response(JSON.stringify(BOARD_DATA), { status: 200 });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  window.open = (() => null) as typeof window.open;
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ Board } = await import('../Board.tsx'));
});

beforeEach(async () => {
  posts = [];
  localStorage.clear();
  history.replaceState(null, '', '/');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(Board));
  });
  await settle();
});

afterEach(async () => {
  await React.act(async () => root.unmount());
  container.remove();
});

afterAll(async () => {
  globalThis.fetch = realFetch;
  delete (globalThis as unknown as { EventSource?: unknown }).EventSource;
  await GlobalRegistrator.unregister();
});

async function settle() {
  for (let i = 0; i < 3; i++)
    await React.act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
}

function row(iid: number): HTMLElement {
  const el = container.querySelector<HTMLElement>(`[data-mr-iid="${iid}"]`);
  if (!el) throw new Error(`no row !${iid}`);
  return el;
}

async function check(iid: number) {
  const box = row(iid).querySelector<HTMLElement>('[role="checkbox"]');
  if (!box) throw new Error(`no checkbox on !${iid}`);
  await React.act(async () => box.click());
}

async function rightClick(iid: number) {
  await React.act(async () => {
    row(iid).dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 40,
        clientY: 40,
      })
    );
  });
}

const menu = () => document.querySelector('[data-part="contextmenu"]');
const items = () => [
  ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
];
async function click(text: string) {
  const hit = items().find(el => el.textContent?.includes(text));
  if (!hit)
    throw new Error(
      `no item "${text}" in ${items()
        .map(i => i.textContent)
        .join(' | ')}`
    );
  await React.act(async () => hit.click());
  await settle();
}

test('right-click on a checked row, two checked, opens the menu for the selection', async () => {
  await check(101);
  await check(102);
  await rightClick(101);
  expect(menu()?.getAttribute('aria-label')).toBe('actions for 2 selected');
  expect(items().some(i => i.textContent === 'rebase on target2 of 2')).toBe(
    true
  );
});

test('right-click on an unchecked row opens its own menu', async () => {
  await check(101);
  await check(102);
  await rightClick(103);
  expect(menu()?.getAttribute('aria-label')).toBe('actions for !103');
});

test('right-click on the only checked row opens its own menu', async () => {
  await check(101);
  await rightClick(101);
  expect(menu()?.getAttribute('aria-label')).toBe('actions for !101');
});

test('the actions button opens the same menu', async () => {
  await check(101);
  await check(102);
  const button = [
    ...container.querySelectorAll<HTMLElement>('.tui-selbar button'),
  ].find(b => b.textContent?.includes('actions'));
  if (!button) throw new Error('no actions button');
  await React.act(async () => button.click());
  expect(menu()?.getAttribute('aria-label')).toBe('actions for 2 selected');
});

test('a bulk rebase posts once per MR and speaks once', async () => {
  await check(101);
  await check(102);
  await rightClick(101);
  await click('rebase on target');
  expect(
    posts
      .filter(p => p.url === '/mr/action')
      .map(p => [p.body.iid, p.body.action])
  ).toEqual([
    [101, 'rebase'],
    [102, 'rebase'],
  ]);
  expect(document.body.textContent).toContain('rebase started on 2');
});

test('bulk merge arms on the first click and merges on the second', async () => {
  await check(101);
  await check(102);
  await rightClick(101);
  await click('merge');
  expect(posts.filter(p => p.url === '/mr/action')).toEqual([]);
  await click('really merge 2?');
  expect(
    posts.filter(p => p.url === '/mr/action').map(p => p.body.action)
  ).toEqual(['merge', 'merge']);
});

test('a checked child of an open MR blocks bulk merge with the reason', async () => {
  await check(101);
  await check(103);
  await rightClick(101);
  const merge = items().find(i => i.textContent?.includes('blocked'));
  expect(merge?.textContent).toContain(
    '!103 sits on !101, which is still open'
  );
  expect(merge?.hasAttribute('disabled')).toBe(true);
});

test('request review from… asks the picked person on each MR', async () => {
  await check(101);
  await check(102);
  await rightClick(101);
  await click('request review from…');
  await click('kim');
  expect(
    posts
      .filter(p => p.url === '/nudge')
      .map(p => [p.body.iid, p.body.reviewer])
  ).toEqual([
    [101, 'kim'],
    [102, 'kim'],
  ]);
});
