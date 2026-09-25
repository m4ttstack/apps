import { expect, test } from 'bun:test';

import type { FlowResult } from './api/register.ts';
import { reresolveOnBoot } from './boot-reresolve.ts';

const swept = (body: Record<string, unknown>): FlowResult => ({
  status: 200,
  body: { ok: true, restarted: [], unchanged: [], failed: [], ...body },
});

test('a source run outside any bundle never touches installed plists', async () => {
  let calls = 0;
  const lines: string[] = [];
  await reresolveOnBoot({
    bundleRoot: null,
    reresolve: async () => {
      calls++;
      return swept({});
    },
    log: line => lines.push(line),
  });
  expect(calls).toBe(0);
  expect(lines).toEqual([]);
});

test('a bundled deck sweeps and names what moved', async () => {
  const lines: string[] = [];
  await reresolveOnBoot({
    bundleRoot: '/Applications/mattstack-dev.app',
    reresolve: async () =>
      swept({
        ok: false,
        restarted: ['board', 'console'],
        unchanged: ['chat'],
        failed: [{ name: 'gitq', error: 'no runnable shape' }],
      }),
    log: line => lines.push(line),
  });
  expect(lines).toEqual([
    '[reresolve] boot: restarted board, console; failed gitq (no runnable shape)',
  ]);
});

test('a bundled deck whose apps already match its flavor logs nothing', async () => {
  const lines: string[] = [];
  await reresolveOnBoot({
    bundleRoot: '/Applications/mattstack.app',
    reresolve: async () => swept({ unchanged: ['board', 'chat'] }),
    log: line => lines.push(line),
  });
  expect(lines).toEqual([]);
});

test('a throwing sweep is logged, never thrown into boot', async () => {
  const lines: string[] = [];
  await reresolveOnBoot({
    bundleRoot: '/Applications/mattstack.app',
    reresolve: async () => {
      throw new Error('launchctl gone');
    },
    log: line => lines.push(line),
  });
  expect(lines).toEqual([
    '[reresolve] boot sweep failed: Error: launchctl gone',
  ]);
});

test('a bundled deck names the rows it does not serve', async () => {
  const lines: string[] = [];
  await reresolveOnBoot({
    bundleRoot: '/Applications/mattstack.app',
    reresolve: async () => swept({ notServed: ['gitq'] }),
    log: line => lines.push(line),
  });
  expect(lines).toEqual(['[reresolve] boot: not-served gitq']);
});

test('a prod deck names the catalog rows it created and adopted ahead of what it restarted', async () => {
  const lines: string[] = [];
  await reresolveOnBoot({
    bundleRoot: '/Applications/mattstack.app',
    reresolve: async () =>
      swept({
        created: ['board'],
        adopted: ['boxscore'],
        restarted: ['board', 'boxscore'],
        notServed: ['gitq'],
      }),
    log: line => lines.push(line),
  });
  expect(lines).toEqual([
    '[reresolve] boot: created board; adopted boxscore; restarted board, boxscore; not-served gitq',
  ]);
});
