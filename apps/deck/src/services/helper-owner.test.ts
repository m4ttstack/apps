import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, test } from 'bun:test';

import {
  bundleHelperOwnsDeck,
  prepareHelperBoot,
  retireHandAgent,
  type Probe,
} from './helper-owner.ts';

const SMAPP_DEV = `gui/501/com.mattstack.deck.dev = {
\tactive count = 1
\tpath = (submitted by smd.340)
\ttype = Submitted
\tmanaged_by = com.apple.xpc.ServiceManagement
\tstate = running
}`;

const handAgent = (agents: string) => `gui/501/com.mattstack.deck = {
\tactive count = 1
\tpath = ${agents}/com.mattstack.deck.plist
\ttype = LaunchAgent
\tstate = running
}`;

const NOT_LOADED = {
  code: 113,
  stdout: 'Could not find service "x" in domain for user gui: 501',
};

function probeOf(jobs: Record<string, string>): Probe & { asked: string[] } {
  const asked: string[] = [];
  const probe = async (argv: string[]) => {
    asked.push(argv.join(' '));
    const label = argv[2]!.split('/').pop()!;
    return label in jobs ? { code: 0, stdout: jobs[label]! } : NOT_LOADED;
  };
  return Object.assign(probe, { asked });
}

describe('bundleHelperOwnsDeck', () => {
  test('a deck running from a bundle is the helper, no launchd probe needed', async () => {
    const probe = probeOf({});

    expect(await bundleHelperOwnsDeck(probe, '/Applications/m.app')).toBe(true);
    expect(probe.asked).toEqual([]);
  });

  test('an SMAppService-submitted deck.dev job owns deck', async () => {
    const probe = probeOf({ 'com.mattstack.deck.dev': SMAPP_DEV });

    expect(await bundleHelperOwnsDeck(probe, null)).toBe(true);
  });

  test('the prod helper shares the bare label and still owns deck', async () => {
    const probe = probeOf({
      'com.mattstack.deck': SMAPP_DEV.replace('deck.dev', 'deck'),
    });

    expect(await bundleHelperOwnsDeck(probe, null)).toBe(true);
  });

  test('a hand-installed agent alone is not a bundle helper', async () => {
    const probe = probeOf({ 'com.mattstack.deck': handAgent('/u/Library') });

    expect(await bundleHelperOwnsDeck(probe, null)).toBe(false);
  });
});

function agentsFixture() {
  const root = mkdtempSync(join(tmpdir(), 'deck-helper-owner-'));
  const agentsDir = join(root, 'LaunchAgents');
  const archiveDir = join(root, 'state');
  mkdirSync(agentsDir);
  mkdirSync(archiveDir);
  writeFileSync(join(agentsDir, 'com.mattstack.deck.plist'), '<plist/>');
  return { agentsDir, archiveDir };
}

describe('retireHandAgent', () => {
  test('boots out and archives a hand agent launchd loaded from LaunchAgents', async () => {
    const { agentsDir, archiveDir } = agentsFixture();
    const ran: string[] = [];

    const retired = await retireHandAgent({
      probe: probeOf({ 'com.mattstack.deck': handAgent(agentsDir) }),
      run: async argv => (ran.push(argv.join(' ')), 0),
      agentsDir,
      archiveDir,
      uid: 501,
    });

    expect(retired).toBe(true);
    expect(ran).toEqual(['launchctl bootout gui/501/com.mattstack.deck']);
    expect(existsSync(join(agentsDir, 'com.mattstack.deck.plist'))).toBe(false);
    expect(
      existsSync(join(archiveDir, 'com.mattstack.deck.plist.retired'))
    ).toBe(true);
  });

  test('never touches an SMAppService job holding the bare label', async () => {
    const { agentsDir, archiveDir } = agentsFixture();
    const ran: string[] = [];

    const retired = await retireHandAgent({
      probe: probeOf({
        'com.mattstack.deck': SMAPP_DEV.replace('deck.dev', 'deck'),
      }),
      run: async argv => (ran.push(argv.join(' ')), 0),
      agentsDir,
      archiveDir,
      uid: 501,
    });

    expect(retired).toBe(false);
    expect(ran).toEqual([]);
    expect(existsSync(join(agentsDir, 'com.mattstack.deck.plist'))).toBe(true);
  });

  test('leaves things alone when launchd has no bare deck job', async () => {
    const { agentsDir, archiveDir } = agentsFixture();
    const ran: string[] = [];

    const retired = await retireHandAgent({
      probe: probeOf({}),
      run: async argv => (ran.push(argv.join(' ')), 0),
      agentsDir,
      archiveDir,
      uid: 501,
    });

    expect(retired).toBe(false);
    expect(ran).toEqual([]);
    expect(existsSync(join(agentsDir, 'com.mattstack.deck.plist'))).toBe(true);
  });
});

describe('prepareHelperBoot', () => {
  test('outside a bundle it neither touches PATH nor asks launchd', async () => {
    const probe = probeOf({});
    const env: Record<string, string | undefined> = { PATH: '/usr/bin' };

    await prepareHelperBoot({
      bundleRoot: null,
      env,
      retire: {
        probe,
        run: async () => 0,
        agentsDir: '/a',
        archiveDir: '/b',
        uid: 501,
      },
      log: () => {},
    });

    expect(env.PATH).toBe('/usr/bin');
    expect(probe.asked).toEqual([]);
  });

  test('as a helper it composes PATH and retires a stray hand agent', async () => {
    const { agentsDir, archiveDir } = agentsFixture();
    const ran: string[] = [];
    const env: Record<string, string | undefined> = { PATH: '/usr/bin' };

    await prepareHelperBoot({
      bundleRoot: '/Applications/m.app',
      env,
      compose: () => '/opt/homebrew/bin:/usr/bin',
      retire: {
        probe: probeOf({ 'com.mattstack.deck': handAgent(agentsDir) }),
        run: async argv => (ran.push(argv.join(' ')), 0),
        agentsDir,
        archiveDir,
        uid: 501,
      },
      log: () => {},
    });

    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin');
    expect(ran).toEqual(['launchctl bootout gui/501/com.mattstack.deck']);
  });

  test('a failed retirement is logged, never thrown', async () => {
    const logged: string[] = [];

    await prepareHelperBoot({
      bundleRoot: '/Applications/m.app',
      env: {},
      compose: () => '/usr/bin',
      retire: {
        probe: async () => {
          throw new Error('launchctl gone');
        },
        run: async () => 0,
        agentsDir: '/a',
        archiveDir: '/b',
        uid: 501,
      },
      log: (...args) => logged.push(args.join(' ')),
    });

    expect(logged.join('\n')).toContain('launchctl gone');
  });
});
