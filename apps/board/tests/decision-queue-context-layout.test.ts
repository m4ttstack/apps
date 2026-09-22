/** Real-layout check for the decision queue's context pane and question
    area, run in headless chromium against the fixture server: happy-dom
    does no layout, and the laws this guards only exist once CSS flex
    sizing runs. The nav (`.tui-gate-actions`, in the gate body, not the
    footer) must stay fully on screen and the modal must never scroll;
    whatever doesn't fit -- the context pane, or the active question's own
    area -- shrinks and scrolls internally instead. Boots on a free port so
    a concurrent `capture` run on 7941 is untouched. */
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterAll, beforeAll, expect, test } from 'bun:test';
import { chromium, type Browser, type Page } from 'playwright';

const ROOT = join(import.meta.dir, '..');
const ROOMY = { width: 1000, height: 1100 };
/** A laptop-height window: tight enough that the context pane and the
    active question's own area both have to shrink and scroll internally
    to keep the nav on screen. */
const SHORT = { width: 1000, height: 812 };
/** The ScrollPane cap DecisionQueueModal passes, as a share of the
    viewport height. */
const PANE_CAP = 0.46;
/** `.tui-triage-body > [data-part='scrollpane']`'s `min-height: 9rem` in
    `style.css`, in px at this repo's 17px root -- the floor the pane never
    shrinks below, whether or not it is also scrolling. */
const PANE_FLOOR_PX = 9 * 17;

/** The slice of the page's DOM the measurements touch; this tsconfig has no
    `dom` lib, so the evaluate callbacks reach it through a cast. */
type Measured = {
  clientHeight: number;
  scrollHeight: number;
  getBoundingClientRect(): { top: number; bottom: number; height: number };
};
type PageGlobals = {
  document: { querySelector(selector: string): Measured | null };
};

let server: ReturnType<typeof Bun.spawn>;
let browser: Browser;
let BASE = '';

function freePort(): number {
  const probe = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: () => new Response(),
  });
  const port = probe.port;
  probe.stop(true);
  if (!port) throw new Error('no free port');
  return port;
}

beforeAll(async () => {
  const port = freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = Bun.spawn(['bun', 'run', join(ROOT, 'src/server.ts')], {
    env: {
      ...process.env,
      BOARD_FIXTURE: join(ROOT, 'tests/fixture'),
      BOARD_STATE_DB: join(
        mkdtempSync(join(tmpdir(), 'dq-layout-')),
        'state.db'
      ),
      PORT: String(port),
    },
    stdout: 'ignore',
    stderr: 'inherit',
  });
  let up = false;
  for (let i = 0; i < 150 && !up; i++) {
    if (server.exitCode !== null)
      throw new Error(`fixture server exited with ${server.exitCode}`);
    try {
      up = (await fetch(`${BASE}/healthz`)).ok;
    } catch {}
    if (!up) await new Promise(r => setTimeout(r, 200));
  }
  if (!up) throw new Error('fixture server never answered /healthz');
  browser = await chromium.launch();
}, 60_000);

afterAll(async () => {
  await browser?.close();
  server?.kill();
});

/** Opens the queue and skips forward to the first gate whose context pane
    renders prose; the queue order is the fixture's row order, so this does
    not assume which position that gate holds. */
async function openDecisionQueue(viewport: {
  width: number;
  height: number;
}): Promise<Page> {
  const ctx = await browser.newContext({ viewport });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route =>
    route.abort()
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?member=all`);
  await page.waitForSelector('.tui-row');
  await page.click('.tui-dq-open');
  await page.waitForSelector('.tui-triage-body, .tui-review-sheet');
  const prose = page.locator(
    '.tui-triage-modal [data-part="scrollpane-body"] [data-part="markdown"] p'
  );
  for (let i = 0; i < 10 && !(await prose.count()); i++) {
    await page.getByRole('button', { name: 'skip gate' }).click();
    await page.waitForTimeout(120);
  }
  await prose.first().waitFor();
  return page;
}

type Layout = {
  modalScrolls: boolean;
  bodyScrolls: boolean;
  modalBottom: number;
  footerBottom: number;
  paneRootHeight: number;
  paneScrolls: boolean;
  navBottom: number;
  itemsScrolls: boolean;
  itemsHeight: number;
};

function measure(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const { document } = globalThis as unknown as PageGlobals;
    const modal = document.querySelector('.tui-triage-modal')!;
    // A header-card gate (structured plan@1/post@1 context) has no
    // ScrollPane at all -- only a prose-context gate does.
    const root = document.querySelector(
      '.tui-triage-modal [data-part="scrollpane"]'
    );
    const pane = document.querySelector(
      '.tui-triage-modal [data-part="scrollpane-body"]'
    );
    const footer = document.querySelector('.tui-triage-footer')!;
    const body = document.querySelector('.tui-triage-body')!;
    const nav = document.querySelector('.tui-gate-actions')!;
    const items = document.querySelector('.tui-gate-items')!;
    return {
      modalScrolls: modal.scrollHeight > modal.clientHeight,
      bodyScrolls: body.scrollHeight > body.clientHeight,
      modalBottom: modal.getBoundingClientRect().bottom,
      footerBottom: footer.getBoundingClientRect().bottom,
      paneRootHeight: root ? root.getBoundingClientRect().height : 0,
      paneScrolls: pane ? pane.scrollHeight > pane.clientHeight : false,
      navBottom: nav.getBoundingClientRect().bottom,
      itemsScrolls: items.scrollHeight > items.clientHeight,
      itemsHeight: items.getBoundingClientRect().height,
    };
  });
}

function expectPaneLaw(m: Layout, viewportHeight: number): void {
  const cap = viewportHeight * PANE_CAP;
  expect(m.paneRootHeight).toBeLessThanOrEqual(cap + 1);
  // The pane and the question area now share the squeeze, so a scrolling
  // pane no longer implies it sits at the cap -- only that it never goes
  // below its own floor, however much of the deficit the question area
  // ends up absorbing instead.
  expect(m.paneRootHeight).toBeGreaterThanOrEqual(PANE_FLOOR_PX - 1);
  expect(m.modalScrolls).toBe(false);
  expect(m.footerBottom).toBeLessThanOrEqual(m.modalBottom);
}

/** The nav is protected structurally (a fixed sibling after the one
    flexible child of `.tui-gate-form`), so this holds on every gate, not
    only the long-context one `openDecisionQueue` walks to. */
function expectNavOnScreen(m: Layout, viewportHeight: number): void {
  expect(m.navBottom).toBeLessThanOrEqual(viewportHeight);
  expect(m.modalScrolls).toBe(false);
  expect(m.bodyScrolls).toBe(false);
}

test('roomy: the pane is as tall as its text up to its cap, and the modal never scrolls', async () => {
  const page = await openDecisionQueue(ROOMY);
  const m = await measure(page);
  expectPaneLaw(m, ROOMY.height);
  expectNavOnScreen(m, ROOMY.height);
  await page.context().close();
}, 30_000);

test('short: the nav stays on screen without the body scrolling, even with long context', async () => {
  const page = await openDecisionQueue(SHORT);
  const m = await measure(page);
  expectPaneLaw(m, SHORT.height);
  expectNavOnScreen(m, SHORT.height);
  await page.context().close();
}, 30_000);

test('short: the context pane and the question area scroll internally instead of the body', async () => {
  const page = await openDecisionQueue(SHORT);
  const m = await measure(page);
  // This is the fixture's deliberately long gate: both the context pane
  // and the active question's own area outgrow the space the modal leaves
  // them at this height, so both scroll in place rather than the body.
  expect(m.paneScrolls).toBe(true);
  expect(m.itemsScrolls).toBe(true);
  expect(m.itemsHeight).toBeGreaterThan(0);
  await page.context().close();
}, 30_000);

test('short: the footer is one row, never wraps, and holds no step nav', async () => {
  const page = await openDecisionQueue(SHORT);
  const footer = page.locator('.tui-triage-footer');
  const wraps = await page.evaluate(() => {
    const { document } = globalThis as unknown as PageGlobals;
    const el = document.querySelector('.tui-triage-footer')!;
    return el.scrollHeight > el.clientHeight + 1;
  });
  expect(wraps).toBe(false);
  expect(await footer.locator('.tui-gate-actions').count()).toBe(0);
  await page.context().close();
}, 30_000);

test('short: a header-card gate with no context pane still keeps its nav on screen', async () => {
  const page = await openDecisionQueue(SHORT);
  // openDecisionQueue stops at the first prose-context gate; a header-card
  // gate (structured plan@1/post@1 context) has no ScrollPane at all, so
  // the question area is the only thing that can give. Skip forward until
  // one shows up, or the queue runs out.
  const head = page.locator('.tui-respond-head');
  for (let i = 0; i < 10 && !(await head.count()); i++) {
    await page.getByRole('button', { name: 'skip gate' }).click();
    await page.waitForTimeout(120);
  }
  expect(await head.count()).toBeGreaterThan(0);
  const m = await measure(page);
  expectNavOnScreen(m, SHORT.height);
  await page.context().close();
}, 30_000);

test('the head is one row: title, focus pane, skip gate, and close share a line', async () => {
  const page = await openDecisionQueue(ROOMY);
  const middle = async (selector: string) => {
    const box = (await page.locator(selector).first().boundingBox())!;
    return box.y + box.height / 2;
  };
  const title = await middle('.tui-triage-title');
  for (const selector of [
    '.tui-triage-head-actions button:has-text("focus pane")',
    '.tui-triage-head-actions button:has-text("skip gate")',
    '.tui-triage-modal [data-part="modal-close"]',
  ])
    expect(Math.abs((await middle(selector)) - title)).toBeLessThanOrEqual(4);
  expect(await page.locator('.tui-triage-queue-row').count()).toBe(0);
  await page.context().close();
}, 30_000);

test('short: the review sheet keeps its verdict and submit on screen', async () => {
  const ctx = await browser.newContext({ viewport: SHORT });
  await ctx.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, route =>
    route.abort()
  );
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?member=all`);
  await page.waitForSelector('.tui-row');
  await page.click('.tui-dq-open');
  await page.waitForSelector('.tui-triage-body, .tui-review-sheet');
  const sheet = page.locator('.tui-review-sheet');
  for (let i = 0; i < 10 && !(await sheet.count()); i++) {
    await page.getByRole('button', { name: 'skip gate' }).click();
    await page.waitForTimeout(120);
  }
  await sheet.waitFor();
  const submit = (await page.locator('.tui-review-submit').boundingBox())!;
  expect(submit.y + submit.height).toBeLessThanOrEqual(SHORT.height);
  await page.context().close();
}, 30_000);
