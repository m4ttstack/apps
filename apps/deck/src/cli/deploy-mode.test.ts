import { expect, test } from 'bun:test';

import { deployMode } from './deploy-mode.ts';

test('a standalone deck installs a new build', () => {
  expect(deployMode(false, {}, null)).toEqual({ kind: 'install' });
  expect(deployMode(false, { DECK_RUN_MODE: 'source' }, null)).toEqual({
    kind: 'install',
  });
});

test('a helper-owned deck running from source restarts', () => {
  expect(deployMode(true, { DECK_RUN_MODE: 'source' }, null)).toEqual({
    kind: 'restart',
  });
});

test('from a terminal, the serving deck recorded in api.json decides', () => {
  expect(deployMode(true, {}, { runMode: 'source' })).toEqual({
    kind: 'restart',
  });
  const pinned = deployMode(
    true,
    {},
    {
      runMode: 'pinned',
      runReason: 'bun missing',
    }
  );
  expect(pinned.kind === 'refuse' && pinned.message).toContain('bun missing');
});

test('the spawning environment wins over api.json', () => {
  expect(
    deployMode(true, { DECK_RUN_MODE: 'source' }, { runMode: 'pinned' })
  ).toEqual({ kind: 'restart' });
});

test('a helper-owned deck on the pinned fallback refuses and names why', () => {
  const mode = deployMode(
    true,
    {
      DECK_RUN_MODE: 'pinned',
      DECK_RUN_REASON: 'bun not found at /Users/x/.bun/bin/bun',
    },
    null
  );
  expect(mode.kind).toBe('refuse');
  expect(mode.kind === 'refuse' && mode.message).toContain(
    'bun not found at /Users/x/.bun/bin/bun'
  );
  expect(mode.kind === 'refuse' && mode.message).toContain('pinned release');
});

test('a helper-owned deck with no shim refuses and points at the shim log', () => {
  const mode = deployMode(true, {}, null);
  expect(mode.kind).toBe('refuse');
  expect(mode.kind === 'refuse' && mode.message).toContain(
    'mattstack app owns deck'
  );
  expect(mode.kind === 'refuse' && mode.message).toContain('deck.err.log');
});
