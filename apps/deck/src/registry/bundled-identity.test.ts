import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { expect, test } from 'bun:test';

import { readBundledIdentity } from './bundled-identity.ts';

// Parity anchor: repo-tools scripts/lib/__tests__/fixtures/bundle-resources/
// holds byte-identical files, and its staging test proves bundle-apps writes
// exactly these bytes into every app tarball.
const FIXTURE_RESOURCES = join(
  import.meta.dir,
  '__fixtures__',
  'bundle-resources'
);
const BOARD_ICON = join(
  FIXTURE_RESOURCES,
  'apps',
  'board',
  'src',
  'favicon.svg'
);

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>';

function resources(
  name: string,
  manifest: object,
  files: Record<string, string>
): string {
  const root = mkdtempSync(join(tmpdir(), 'bundle-resources-'));
  const dir = join(root, 'apps', name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mattstack.deck.json'), JSON.stringify(manifest));
  for (const [rel, body] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
  }
  return root;
}

test('reads the staged identity bundle-apps ships', () => {
  expect(readBundledIdentity(FIXTURE_RESOURCES, 'board')).toEqual({
    displayName: 'Board',
    description: 'Open MRs ready for review.',
    badge: '/api/badge',
    iconFile: BOARD_ICON,
  });
});

test('an app with no identity dir has none', () => {
  expect(readBundledIdentity(FIXTURE_RESOURCES, 'chat')).toBeNull();
});

test('a manifest naming a different app is ignored', () => {
  const root = resources(
    'board',
    { name: 'chat', displayName: 'Chat', icon: './i.svg' },
    { 'i.svg': SVG }
  );
  expect(readBundledIdentity(root, 'board')).toBeNull();
});

test('a manifest without displayName or icon is no identity', () => {
  const root = resources(
    'board',
    { name: 'board', icon: './i.svg' },
    { 'i.svg': SVG }
  );
  expect(readBundledIdentity(root, 'board')).toBeNull();
});

test('an icon path that escapes the identity dir is refused', () => {
  const up = resources(
    'board',
    { name: 'board', displayName: 'Board', icon: '../../escape.svg' },
    { '../../escape.svg': SVG }
  );
  expect(readBundledIdentity(up, 'board')).toBeNull();
  const abs = resources(
    'board',
    { name: 'board', displayName: 'Board', icon: join(up, 'escape.svg') },
    {}
  );
  expect(readBundledIdentity(abs, 'board')).toBeNull();
});

test('an oversize or non-svg bundled icon yields no identity', () => {
  const big = resources(
    'board',
    { name: 'board', displayName: 'Board', icon: './i.svg' },
    { 'i.svg': `<svg>${' '.repeat(64 * 1024)}</svg>` }
  );
  expect(readBundledIdentity(big, 'board')).toBeNull();
  const png = resources(
    'board',
    { name: 'board', displayName: 'Board', icon: './i.svg' },
    { 'i.svg': 'PNG' }
  );
  expect(readBundledIdentity(png, 'board')).toBeNull();
});
