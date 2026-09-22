/** Board-level tests for the comments drawer: a real happy-dom document and a
    real Board render, with fetch faked. */
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

const MR_URL = 'https://gitlab.example.com/g/p/-/merge_requests/101';

const BOARD_DATA = {
  title: 'MRs ready for review',
  defaultMember: 'matt',
  members: [{ username: 'matt', name: 'matt', count: 0 }],
  allMembers: [{ username: 'matt', name: 'matt', count: 0, hidden: false }],
  mrs: [
    {
      iid: 101,
      title: 'mr 101',
      webUrl: MR_URL,
      author: { username: 'matt', name: 'Matt' },
      sourceBranch: 'b101',
      targetBranch: 'main',
      updatedAt: '2026-08-19T00:00:00Z',
      createdAt: '2026-08-19T00:00:00Z',
      reviews: { given: 0, required: 0, isApproved: false, reviewers: [] },
      blockers: { any: false },
      mergeButton: { visible: false, disabled: false, loading: false },
      rebaseButton: { visible: false, loading: false },
      autoMergeButton: { visible: false, isActive: false },
      behindTarget: null,
      isStacked: false,
      reviewerComments: 1,
      threadSummary: { awaiting: 1, replied: 0, resolved: 0 },
      generalComments: 0,
      isDraft: false,
      pipelineState: 'none',
      repositoryId: 'gitlab:101',
      rtRepo: 'gitlab.example.com/g/p',
      codeownerSections: [],
      gates: [],
    },
  ],
  fetchedAt: 1755600000000,
  fetchError: null,
  local: true,
  slackEnabled: false,
  slackTemplates: { single: '{title}', multiHeader: '', multiItem: '' },
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

const DISCUSSIONS = {
  threads: [
    {
      status: 'awaiting',
      notes: [
        {
          id: 9001,
          name: 'Kim',
          username: 'kim',
          at: '2026-08-19T00:00:00Z',
          body: 'rename this',
        },
      ],
    },
  ],
  comments: [],
};

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let Board: typeof import('../Board.tsx').Board;
const realFetch = globalThis.fetch;
let root: ReturnType<typeof import('react-dom/client').createRoot>;
let container: HTMLDivElement;

beforeAll(async () => {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.startsWith('/data.json'))
      return new Response(JSON.stringify(BOARD_DATA), { status: 200 });
    if (url.startsWith('/discussions'))
      return new Response(JSON.stringify(DISCUSSIONS), { status: 200 });
    return new Response('{}', { status: 200 });
  }) as typeof fetch;
  window.open = (() => null) as typeof window.open;
  React = await import('react');
  ({ createRoot } = await import('react-dom/client'));
  ({ Board } = await import('../Board.tsx'));
});

beforeEach(() => {
  localStorage.clear();
  history.replaceState(null, '', '/');
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

async function renderBoardWithDrawerOpen(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await React.act(async () => {
    root.render(React.createElement(Board));
  });
  await settle();
  const link = container.querySelector<HTMLButtonElement>(
    '[data-mr-iid="101"] .tui-threads'
  );
  if (!link) throw new Error('no threads link on !101');
  await React.act(async () => link.click());
  await settle();
  const drawer = document.querySelector<HTMLElement>(
    '[data-part="sidedrawer"][aria-label="comment threads"]'
  );
  if (!drawer) throw new Error('comments drawer did not open');
  return drawer;
}

async function rightClick(el: Element): Promise<MouseEvent> {
  const ev = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: 40,
    clientY: 40,
  });
  await React.act(async () => {
    el.dispatchEvent(ev);
  });
  return ev;
}

const rowMenu = () => document.querySelector('[data-part="contextmenu"]');

test('a right-click inside the comments drawer keeps the native menu and opens no row menu', async () => {
  const drawer = await renderBoardWithDrawerOpen();
  const note = drawer.querySelector('.tui-cd-note-body');
  if (!note) throw new Error('drawer rendered no note body');
  const ev = await rightClick(note);
  expect(rowMenu()).toBeNull();
  expect(ev.defaultPrevented).toBe(false);
});

test('a right-click on the drawer scrim opens no row menu', async () => {
  await renderBoardWithDrawerOpen();
  const scrim = document.querySelector('[data-part="sidedrawer-overlay"]');
  if (!scrim) throw new Error('no drawer overlay');
  await rightClick(scrim);
  expect(rowMenu()).toBeNull();
});

test('a click on the drawer scrim closes the drawer without opening the MR', async () => {
  let opened = 0;
  window.open = (() => {
    opened++;
    return null;
  }) as typeof window.open;
  await renderBoardWithDrawerOpen();
  const scrim = document.querySelector<HTMLElement>(
    '[data-part="sidedrawer-overlay"]'
  );
  if (!scrim) throw new Error('no drawer overlay');
  await React.act(async () => scrim.click());
  expect(document.querySelector('[data-part="sidedrawer"]')).toBeNull();
  expect(opened).toBe(0);
});

test('a right-click on the row itself still opens the row menu', async () => {
  await renderBoardWithDrawerOpen();
  const closeBtn = document.querySelector<HTMLElement>(
    '[data-part="sidedrawer"] .tui-modal-x'
  );
  await React.act(async () => closeBtn!.click());
  await rightClick(container.querySelector('[data-mr-iid="101"]')!);
  expect(rowMenu()).not.toBeNull();
});
