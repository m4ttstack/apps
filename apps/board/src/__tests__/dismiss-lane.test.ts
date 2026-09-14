import { expect, test } from 'bun:test';

import { laneDismissed } from '../client/board/row-status.ts';

const failed = { status: 'error', updatedAt: 100 } as never;

test('a lane is dismissed only while the stamp is at least as new as the write it dismissed', () => {
  expect(laneDismissed(undefined)).toBe(false);
  expect(laneDismissed(failed)).toBe(false);
  expect(
    laneDismissed({
      status: 'error',
      updatedAt: 100,
      dismissedAt: 100,
    } as never)
  ).toBe(true);
  expect(
    laneDismissed({
      status: 'error',
      updatedAt: 100,
      dismissedAt: 140,
    } as never)
  ).toBe(true);
  // A later write (a relaunch, the pane's own status CLI) outranks the stamp
  // and the lane speaks again on its own.
  expect(
    laneDismissed({
      status: 'queued',
      updatedAt: 200,
      dismissedAt: 140,
    } as never)
  ).toBe(false);
});
