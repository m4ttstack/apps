import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'bun:test';

import { dryRun, ROOT, type DryRun } from './helpers.ts';

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
});
