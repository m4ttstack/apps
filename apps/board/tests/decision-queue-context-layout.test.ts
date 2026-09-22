/** Real-layout check for the decision queue's context pane and question
    area, run in headless chromium against the fixture server: happy-dom
    does no layout, and the laws this guards only exist once CSS flex
    sizing runs. The nav (`.tui-gate-actions`, in the gate body, not the
    footer) must stay fully on screen and the modal must never scroll. The
    pane and the question area are not equal: the pane (reference material)
    shrinks first and scrolls internally past its floor; the question area
    (what the reviewer acts on) keeps its natural height and only gives up
    any of it, scrolling in turn, once the pane is already at that floor and
    still isn't enough. Boots on a free port so a concurrent `capture` run
    on 7941 is untouched. */
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
/** Shorter than SHORT: with the modal's ceiling raised from 80vh to
    100vh minus a small fixed margin, SHORT alone no longer forces the
    items-scroll fallback on the fixture's deliberately long gate (764px of
    modal room fits its 279px item column without a scroll). This viewport
    still does, and exists solely to prove the fallback mechanism -- kept
    on purpose as the fallback for windows still too short even after the
    taller ceiling -- still fires when a window is short enough to need
    it. */
const VERY_SHORT = { width: 1000, height: 700 };
/** Below the question-context media query's breakpoint: the tight cap
    still applies here, one px shy of where it relaxes. */
const JUST_BELOW_BREAKPOINT = { width: 1000, height: 970 };
/** Above the breakpoint: the roomy cap applies and a thread card's reply
    box reaches its full, natural height. */
const JUST_ABOVE_BREAKPOINT = { width: 1000, height: 990 };
/** A common laptop window. Below the question-context media query's
    breakpoint (980px), so the tight cap still governs here. */
const LAPTOP = { width: 1440, height: 900 };
/** A 14-inch MacBook Pro window at its default scaled resolution. Past the
    breakpoint, so the roomy cap governs here. */
const TALL_LAPTOP = { width: 1512, height: 982 };
/** The ScrollPane cap DecisionQueueModal passes, as a share of the
    viewport height. */
const PANE_CAP = 0.46;

/** The slice of the page's DOM the measurements touch; this tsconfig has no
    `dom` lib, so the evaluate callbacks reach it through a cast. */
type Measured = {
  clientHeight: number;
  scrollHeight: number;
  getBoundingClientRect(): { top: number; bottom: number; height: number };
  querySelectorAll(selector: string): Measured[];
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
    await page.getByRole('button', { name: 'next gate' }).click();
    await page.waitForTimeout(120);
  }
  await prose.first().waitFor();
  return page;
}

/** Opens the queue and skips forward to the first gate with a thread card
    (a structured claim/points/verdict/reply, not plain prose), the only
    kind of gate a drafted reply box can appear on. */
async function openDecisionQueueAtThreadGate(viewport: {
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
  const threadCard = page.locator('.tui-thread-card');
  for (let i = 0; i < 10 && !(await threadCard.count()); i++) {
    await page.getByRole('button', { name: 'next gate' }).click();
    await page.waitForTimeout(120);
  }
  await threadCard.first().waitFor();
  return page;
}

type Layout = {
  modalScrolls: boolean;
  bodyScrolls: boolean;
  modalBottom: number;
  footerBottom: number;
  paneRootHeight: number;
  paneFloorPx: number;
  paneScrolls: boolean;
  navBottom: number;
  itemsScrolls: boolean;
  itemsHeight: number;
  /** One entry per choice of the ACTIVE question, in order: whether its
      whole box lies inside `.tui-gate-items`'s visible (unscrolled)
      viewport, not merely present in the DOM. */
  choicesVisible: boolean[];
  /** Whether the active question has a thread card, and if so, whether its
      reply box lies fully inside the card's own visible (unscrolled) area.
      `null` when the active question has no thread card at all. */
  replyBoxVisibleInCard: boolean | null;
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
    const activeQuestion = document.querySelector(
      '.tui-gate-question[data-active]'
    );
    const itemsRect = items.getBoundingClientRect();
    const itemsVisibleBottom = itemsRect.top + items.clientHeight;
    const choices = activeQuestion
      ? [...activeQuestion.querySelectorAll('.tui-gate-choice')]
      : [];
    const choicesVisible = choices.map(c => {
      const r = c.getBoundingClientRect();
      return (
        r.top >= itemsRect.top - 0.5 && r.bottom <= itemsVisibleBottom + 0.5
      );
    });
    const threadCard = activeQuestion
      ? activeQuestion.querySelectorAll('.tui-thread-card')[0]
      : null;
    const replyBox = activeQuestion
      ? activeQuestion.querySelectorAll('.tui-thread-reply')[0]
      : null;
    let replyBoxVisibleInCard: boolean | null = null;
    if (threadCard && replyBox) {
      const cardRect = threadCard.getBoundingClientRect();
      const cardVisibleBottom = cardRect.top + threadCard.clientHeight;
      const r = replyBox.getBoundingClientRect();
      replyBoxVisibleInCard =
        r.top >= cardRect.top - 0.5 && r.bottom <= cardVisibleBottom + 0.5;
    }
    // Read live rather than duplicating the CSS literal here, so the test
    // and the stylesheet cannot silently diverge.
    const win = globalThis as unknown as {
      getComputedStyle(el: unknown): { minHeight: string };
    };
    const paneFloorPx = root
      ? parseFloat(win.getComputedStyle(root).minHeight)
      : 0;
    return {
      modalScrolls: modal.scrollHeight > modal.clientHeight,
      bodyScrolls: body.scrollHeight > body.clientHeight,
      modalBottom: modal.getBoundingClientRect().bottom,
      footerBottom: footer.getBoundingClientRect().bottom,
      paneRootHeight: root ? root.getBoundingClientRect().height : 0,
      paneFloorPx,
      paneScrolls: pane ? pane.scrollHeight > pane.clientHeight : false,
      navBottom: nav.getBoundingClientRect().bottom,
      // +1: Blink's internal layout units are 1/64px, so two elements that
      // are visually identical in height can differ by a fractional pixel
      // once rounded to the integer `clientHeight`/`scrollHeight` pair.
      itemsScrolls: items.scrollHeight > items.clientHeight + 1,
      itemsHeight: items.getBoundingClientRect().height,
      choicesVisible,
      replyBoxVisibleInCard,
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
  expect(m.paneRootHeight).toBeGreaterThanOrEqual(m.paneFloorPx - 1);
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

test('very short: if the question area scrolls, the pane is already at its floor', async () => {
  const page = await openDecisionQueue(VERY_SHORT);
  const m = await measure(page);
  // This is the fixture's deliberately long gate, long enough to name the
  // yield order rather than report two coincidental facts: the pane gives
  // up its own room first, and only once it is already at its floor does
  // the question area give up any of its own height in turn.
  expect(m.paneScrolls).toBe(true);
  if (m.itemsScrolls) {
    expect(m.paneRootHeight).toBeLessThanOrEqual(m.paneFloorPx + 1);
  }
  expect(m.itemsScrolls).toBe(true);
  expect(m.itemsHeight).toBeGreaterThan(0);
  await page.context().close();
}, 30_000);

test('short: every choice of the active question is fully visible, not merely present', async () => {
  const page = await openDecisionQueue(SHORT);
  const m = await measure(page);
  expect(m.choicesVisible.length).toBeGreaterThan(0);
  expect(m.choicesVisible.every(visible => visible)).toBe(true);
  await page.context().close();
}, 30_000);

test('short: the pane yields before the question area -- a shorter-context gate needs no items scroll', async () => {
  const page = await openDecisionQueue(SHORT);
  // openDecisionQueue lands on the queue's first prose-context gate, whose
  // own text is long enough that even a fully-yielded pane isn't room
  // enough (the previous test). The next prose gate is shorter: with the
  // pane taking priority to shrink first, the question area should need
  // none of its own scroll -- the regression this guards is the pane and
  // the question area shrinking together instead of in that order, which
  // would scroll this gate's question area too.
  await page.getByRole('button', { name: 'next gate' }).click();
  await page.waitForTimeout(150);
  await page.waitForSelector(
    '.tui-triage-modal [data-part="scrollpane-body"] [data-part="markdown"] p'
  );
  const m = await measure(page);
  expect(m.itemsScrolls).toBe(false);
  expect(m.choicesVisible.every(visible => visible)).toBe(true);
  expectNavOnScreen(m, SHORT.height);
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
    await page.getByRole('button', { name: 'next gate' }).click();
    await page.waitForTimeout(120);
  }
  expect(await head.count()).toBeGreaterThan(0);
  const m = await measure(page);
  expectNavOnScreen(m, SHORT.height);
  // The fixture's own header-card gate has no floor left to give at this
  // height even with its thread card fully shrunk: the first two choices
  // (reply, fix) still show in full, the third (skip) needs the items
  // backstop scroll to see the rest of its description. That is the named,
  // reported extreme case, not a regression to chase away here.
  expect(m.choicesVisible.length).toBeGreaterThanOrEqual(2);
  expect(m.choicesVisible.slice(0, 2).every(visible => visible)).toBe(true);
  await page.context().close();
}, 30_000);

test('the head is one row: title, focus pane, and close share a line -- no skip chip', async () => {
  const page = await openDecisionQueue(ROOMY);
  const middle = async (selector: string) => {
    const box = (await page.locator(selector).first().boundingBox())!;
    return box.y + box.height / 2;
  };
  const title = await middle('.tui-triage-title');
  for (const selector of [
    '.tui-triage-head-actions button:has-text("focus pane")',
    '.tui-triage-modal [data-part="modal-close"]',
  ])
    expect(Math.abs((await middle(selector)) - title)).toBeLessThanOrEqual(4);
  expect(await page.locator('.tui-triage-queue-row').count()).toBe(0);
  expect(
    await page
      .locator('.tui-triage-head-actions button:has-text("skip gate")')
      .count()
  ).toBe(0);
  await page.context().close();
}, 30_000);

test('the footer centers the pips+count group between the previous- and next-gate controls', async () => {
  const page = await openDecisionQueue(ROOMY);
  const footer = (await page.locator('.tui-triage-footer').boundingBox())!;
  const where = (await page.locator('.tui-triage-where').boundingBox())!;
  const footerCenter = footer.x + footer.width / 2;
  const whereCenter = where.x + where.width / 2;
  // Genuinely centered in the footer, not merely flanked by two controls of
  // unequal width (the previous control is disabled on this, the queue's
  // first gate, so a merely-flanked layout would drift off-center here).
  expect(Math.abs(whereCenter - footerCenter)).toBeLessThanOrEqual(2);
  const prev = page.locator('[aria-label="previous gate"]');
  const next = page.locator('[aria-label="next gate"]');
  expect(await prev.count()).toBe(1);
  expect(await next.count()).toBe(1);
  expect(await prev.first().getAttribute('title')).toBe('previous gate');
  expect(await next.first().getAttribute('title')).toBe('next gate');
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
    await page.getByRole('button', { name: 'next gate' }).click();
    await page.waitForTimeout(120);
  }
  await sheet.waitFor();
  const submit = (await page.locator('.tui-review-submit').boundingBox())!;
  expect(submit.y + submit.height).toBeLessThanOrEqual(SHORT.height);
  await page.context().close();
}, 30_000);

test('below the breakpoint: the thread card keeps every choice visible over showing its full reply box', async () => {
  const page = await openDecisionQueueAtThreadGate(LAPTOP);
  const m = await measure(page);
  expect(m.choicesVisible.length).toBeGreaterThan(0);
  expect(m.choicesVisible.every(visible => visible)).toBe(true);
  expect(m.replyBoxVisibleInCard).toBe(false);
  expectNavOnScreen(m, LAPTOP.height);
  await page.context().close();
}, 30_000);

test('above the breakpoint: the thread card shows its full reply box and every choice stays visible', async () => {
  const page = await openDecisionQueueAtThreadGate(TALL_LAPTOP);
  const m = await measure(page);
  expect(m.choicesVisible.length).toBeGreaterThan(0);
  expect(m.choicesVisible.every(visible => visible)).toBe(true);
  expect(m.replyBoxVisibleInCard).toBe(true);
  expectNavOnScreen(m, TALL_LAPTOP.height);
  await page.context().close();
}, 30_000);

test('the breakpoint transition is not itself a cut-choice zone', async () => {
  const below = await openDecisionQueueAtThreadGate(JUST_BELOW_BREAKPOINT);
  const mBelow = await measure(below);
  expect(mBelow.choicesVisible.every(visible => visible)).toBe(true);
  expect(mBelow.replyBoxVisibleInCard).toBe(false);
  await below.context().close();

  const above = await openDecisionQueueAtThreadGate(JUST_ABOVE_BREAKPOINT);
  const mAbove = await measure(above);
  expect(mAbove.choicesVisible.every(visible => visible)).toBe(true);
  expect(mAbove.replyBoxVisibleInCard).toBe(true);
  await above.context().close();
}, 30_000);
