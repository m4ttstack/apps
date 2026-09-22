/** Render harness for the row menu's DOM tests. Every call the menu makes is
    recorded as an effect string ("mr:merge", "launch:review:focus"), so the
    pins describe what a click does without naming the props that carry it.
    When RowMenu's props change, only renderRowMenu changes; the pins must
    not. */
import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { afterAll, afterEach, beforeAll } from 'bun:test';

import type { BoardMR } from '../../../data.ts';
import { hasStackDescendants } from '../../../view.ts';
import type { BoardMRWithReview, RowContext } from '../../types.ts';
import type { MenuEnv } from './menu-fixtures.ts';

export interface Effect {
  effect: string;
  iid: number;
  note?: string;
}

export const harness: { effects: Effect[]; closed: boolean } = {
  effects: [],
  closed: false,
};

let React: typeof import('react');
let createRoot: typeof import('react-dom/client').createRoot;
let RowMenu: typeof import('../RowMenu.tsx').RowMenu;
let root: ReturnType<typeof import('react-dom/client').createRoot> | null =
  null;
let container: HTMLDivElement | null = null;

export function useMenuHarness(): void {
  GlobalRegistrator.register({ url: 'http://localhost/' });
  (
    globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  beforeAll(async () => {
    React = await import('react');
    ({ createRoot } = await import('react-dom/client'));
    ({ RowMenu } = await import('../RowMenu.tsx'));
  });
  afterEach(async () => {
    await closeMenu();
  });
  afterAll(async () => {
    await GlobalRegistrator.unregister();
  });
}

function record(effect: string, mr: { iid: number }, note?: string): void {
  harness.effects.push(
    note === undefined ? { effect, iid: mr.iid } : { effect, iid: mr.iid, note }
  );
}

function renderRowMenu(
  mr: BoardMRWithReview,
  env: MenuEnv,
  reactionsReply: string[] | null
) {
  const self = env.self;
  const own = self !== null && mr.author.username === self;
  const ctx = {
    local: env.local ?? true,
    self,
    slackTemplates: {},
    slackEnabled: env.slackEnabled ?? false,
    onOpenReview: (m: BoardMR) => record('view-report:review', m),
    onOpenRespond: (m: BoardMR) => record('view-report:respond', m),
    onResumeRespond: (m: BoardMR, note?: string) =>
      record('launch:resume-respond', m, note),
    onDismissLane: (m: BoardMR, lane: string) => record(`dismiss:${lane}`, m),
    onStandDown: (m: BoardMR, on: boolean) => record(`stand-down:${on}`, m),
    onEditNote: () => record('note', mr),
  } as unknown as RowContext;
  const launch =
    (flow: string) =>
    (m: BoardMR, note?: string, intent?: 'launch' | 'focus') =>
      record(
        intent === 'focus' ? `launch:${flow}:focus` : `launch:${flow}`,
        m,
        note
      );
  return (
    <RowMenu
      menu={{ x: 10, y: 10, mr }}
      ctx={ctx}
      onClose={() => {
        harness.closed = true;
      }}
      onLaunch={launch('review')}
      onReReview={launch('re-review')}
      onResumeReview={launch('resume-review')}
      onRespond={launch('respond')}
      canRespond={own}
      onDoctor={launch('doctor')}
      canDoctor={!!(mr.blockers?.pipelineFailing || mr.blockers?.hasConflicts)}
      onRebaseLocal={launch('rebase-local')}
      onCopy={m => record('copy', m)}
      onResolveSlack={m => record('find-thread', m)}
      onReactSlack={async (m, emoji, remove) => {
        record(`react:${emoji}:${remove}`, m);
        return reactionsReply;
      }}
      onPostSlack={m => record('post-slack', m)}
      canStandDown={own}
      mrHasStackDescendants={hasStackDescendants(mr, env.allMrs ?? [mr])}
      onDraftState={(m, draft) => record(`draft:${draft}`, m)}
      canDraftState={own}
      onMrAction={(m, action) => record(`mr:${action}`, m)}
      onNudge={(m, reviewer) => record(`ask:re-review:${reviewer}`, m)}
      canNudge={own}
      roster={env.roster ?? []}
      onRequestReview={(m, reviewer) => record(`ask:review:${reviewer}`, m)}
      canAskRespond={self !== null && !own}
      onAskRespond={(m, reviewer) => record(`ask:respond:${reviewer}`, m)}
      peers={env.peers}
    />
  );
}

export async function openMenu(
  mr: BoardMRWithReview,
  env: MenuEnv,
  opts: { reactionsReply?: string[] | null } = {}
): Promise<void> {
  await closeMenu();
  harness.effects = [];
  harness.closed = false;
  window.open = ((url?: string | URL) => {
    record(`open:${String(url)}`, mr);
    return null;
  }) as typeof window.open;
  const el = document.createElement('div');
  document.body.appendChild(el);
  const r = createRoot(el);
  container = el;
  root = r;
  await React.act(async () => {
    r.render(renderRowMenu(mr, env, opts.reactionsReply ?? null));
  });
}

export async function closeMenu(): Promise<void> {
  const r = root;
  if (r) await React.act(async () => r.unmount());
  container?.remove();
  root = null;
  container = null;
}

/** The open menu, top to bottom: `# label`, item text, `---` separator. */
export function menuLines(): string[] {
  const menu = document.querySelector('[data-part="contextmenu"]');
  if (!menu) return [];
  return [...menu.children].map(el => {
    const part = el.getAttribute('data-part');
    if (part === 'contextmenu-label') return `# ${el.textContent}`;
    if (part === 'contextmenu-separator') return '---';
    if (el.tagName === 'TEXTAREA') return '[note box]';
    return el.textContent ?? '';
  });
}

export function itemTexts(): string[] {
  return [...document.querySelectorAll('[role="menuitem"]')].map(
    el => el.textContent ?? ''
  );
}

export async function clickItem(
  text: string,
  init: MouseEventInit = {}
): Promise<void> {
  const items = [
    ...document.querySelectorAll<HTMLElement>('[role="menuitem"]'),
  ];
  const hit =
    items.find(el => el.textContent === text) ??
    items.find(el => el.textContent?.includes(text));
  if (!hit) {
    throw new Error(
      `no menu item "${text}" in: ${items.map(el => el.textContent).join(' | ')}`
    );
  }
  await React.act(async () => {
    hit.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init }));
  });
}

export async function typeNote(text: string): Promise<void> {
  const ta = document.querySelector<HTMLTextAreaElement>(
    'textarea.tui-menu-note'
  );
  if (!ta) throw new Error('no note box');
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    'value'
  )!.set!;
  await React.act(async () => {
    setValue.call(ta, text);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await React.act(async () => {
    ta.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
  });
}

export async function flush(): Promise<void> {
  await React.act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

/** Opens the menu fresh for every item, clicks it (and its confirm or first
    pick, when it has one), and reports `label → effects`. */
export async function clickEach(
  mr: BoardMRWithReview,
  env: MenuEnv
): Promise<string[]> {
  await openMenu(mr, env);
  const labels = itemTexts();
  const out: string[] = [];
  for (const label of labels) {
    await openMenu(mr, env);
    await clickItem(label);
    const armed = harness.closed
      ? undefined
      : itemTexts().find(t => t.startsWith('really'));
    if (armed) await clickItem(armed);
    if (!harness.closed && menuLines()[0] === '# request review from')
      await clickItem(itemTexts()[0]!);
    const fx = harness.effects.map(e => e.effect).join(', ') || '(nothing)';
    out.push(`${label} → ${fx}${harness.closed ? '' : ' (stays open)'}`);
  }
  await closeMenu();
  return out;
}
