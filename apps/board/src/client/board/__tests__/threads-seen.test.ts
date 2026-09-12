import { expect, test } from 'bun:test';

import { threadNewness } from '../threads-seen.ts';

test('a first sighting is never new; it records the baseline', () => {
  expect(threadNewness(null, 5)).toEqual({ fresh: false, record: 5 });
});

test('growth past the baseline is new and records nothing', () => {
  expect(threadNewness(3, 5)).toEqual({ fresh: true, record: null });
});

test('no growth is not new', () => {
  expect(threadNewness(5, 5)).toEqual({ fresh: false, record: null });
  expect(threadNewness(7, 5)).toEqual({ fresh: false, record: null });
});

test('zero threads on a first sighting records zero', () => {
  expect(threadNewness(null, 0)).toEqual({ fresh: false, record: 0 });
});
