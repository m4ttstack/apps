import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';

interface DeckManifest {
  name: string;
  icon?: string;
  port?: number;
  includeInBundle?: boolean;
  bundle?: { build?: string; artifact?: string };
}

interface PackageJson {
  name: string;
  version: string;
  license?: string;
  scripts: Record<string, string | undefined>;
}

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(path, 'utf8')) as T;

const manifest = readJson<DeckManifest>('mattstack.deck.json');
const pkg = readJson<PackageJson>('package.json');

function compileOutfile(script: string): string | undefined {
  return /bun build --compile\b[^&]*--outfile\s+(\S+)/.exec(script)?.[1];
}

describe('bundle recipe', () => {
  it('opts boxscore into the bundle with a recipe bundle-apps can run', () => {
    expect(manifest.name).toBe('boxscore');
    expect(pkg.name).toBe('boxscore');
    expect(manifest.includeInBundle).toBe(true);
    expect(manifest.bundle?.build).toBe(
      'bun install --frozen-lockfile && bun run build:binary'
    );
    expect(manifest.bundle?.artifact).toBe('dist-bin/boxscore');
  });

  it('compiles to exactly the artifact the manifest names', () => {
    const script = pkg.scripts['build:binary'] ?? '';
    expect(script).toMatch(
      /^vite build && mattstack-embed-assets && bun build --compile /
    );
    expect(compileOutfile(script)).toBe(manifest.bundle?.artifact);
    expect(script).toMatch(/ src\/server\/index\.ts$/);
  });
});

describe('release identity', () => {
  it('ships under the MIT license like the other bundled apps', () => {
    expect(pkg.license).toBe('MIT');
    expect(existsSync('LICENSE')).toBe(true);
    expect(readFileSync('LICENSE', 'utf8')).toMatch(/^MIT License\n/);
  });

  it('names an icon that resolves inside the app dir', () => {
    const icon = normalize(manifest.icon ?? '');
    expect(icon).not.toBe('.');
    expect(isAbsolute(icon) || icon.split('/').includes('..')).toBe(false);
    expect(existsSync(icon)).toBe(true);
  });

  it('serves on the manifest port by default', () => {
    expect(manifest.port).toBe(11005);
    expect(readFileSync('src/server/index.ts', 'utf8')).toMatch(
      /\bport: 11005\b/
    );
  });
});
