import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'bun:test';

import { dryRun, realIds, ROOT, type DryRun } from './helpers.ts';

const byId = (run: DryRun) => new Map(run.tasks.map(t => [t.taskId, t]));

describe('turbo task graph', () => {
  test('board and deck tests build tui-kit first', () => {
    const tasks = byId(dryRun(['test', '--filter=board', '--filter=deck']));
    expect(tasks.get('board#test')?.dependencies).toContain(
      '@mattstack/tui-kit#build'
    );
    expect(tasks.get('deck#test')?.dependencies).toContain(
      '@mattstack/tui-kit#build'
    );
  });

  test('typecheck depends on dependency builds', () => {
    const tasks = byId(dryRun(['typecheck', '--filter=board']));
    expect(tasks.get('board#typecheck')?.dependencies).toContain(
      '@mattstack/tui-kit#build'
    );
  });

  test('build:binary runs after the package build', () => {
    const tasks = byId(dryRun(['build:binary', '--filter=mattstack-console']));
    expect(tasks.get('mattstack-console#build:binary')?.dependencies).toContain(
      'mattstack-console#build'
    );
  });

  test('serve-check waits for the artifact it serves, and only where the script exists', () => {
    const run = dryRun(['serve-check']);
    const tasks = byId(run);
    expect(realIds(run)).toEqual([
      'boxscore#build',
      'boxscore#build:binary',
      'boxscore#serve-check',
      'chat#build',
      'chat#serve-check',
      'mattstack-console#build',
      'mattstack-console#build:binary',
      'mattstack-console#serve-check',
    ]);
    expect(tasks.get('chat#serve-check')?.dependencies).toContain('chat#build');
    expect(tasks.get('mattstack-console#serve-check')?.dependencies).toContain(
      'mattstack-console#build:binary'
    );
    expect(tasks.get('boxscore#serve-check')?.dependencies).toContain(
      'boxscore#build:binary'
    );
  });

  test('tui-kit tests install browsers first, and the install is never cached', () => {
    const tasks = byId(dryRun(['test', '--filter=@mattstack/tui-kit']));
    expect(tasks.get('@mattstack/tui-kit#test')?.dependencies).toContain(
      '@mattstack/tui-kit#browsers'
    );
    expect(
      tasks.get('@mattstack/tui-kit#browsers')?.resolvedTaskDefinition?.cache
    ).toBe(false);
  });

  test('every vitest test script runs once and exits', () => {
    const glob = new Bun.Glob('{apps,packages}/*/package.json');
    for (const file of glob.scanSync(ROOT)) {
      const pkg = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
      const script: string | undefined = pkg.scripts?.test;
      if (!script || !script.includes('vitest')) continue;
      expect(script, `${file} test script`).toMatch(/vitest run\b/);
    }
  });
});
