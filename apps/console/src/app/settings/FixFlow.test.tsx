import { renderWithProviders } from '@mattstack/app-kit/test-utils';
import type {
  ExplainRowWire,
  SettingDefWire,
} from '@mattstack/settings-kit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@mattstack/app-kit/lazy', () => ({
  CodeMirror: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange?: (v: string) => void;
  }) => (
    <textarea
      aria-label="JSON"
      value={value}
      onChange={e => onChange?.(e.currentTarget.value)}
    />
  ),
}));
vi.mock('../config/useSettings', () => ({
  useAgentModels: () => ({ data: { models: [] } }),
}));

const { SettingsPage } = await import('./SettingsPage');
const { ExplainModal } = await import('./ExplainModal');
const { schemaFields } = await import('./testSchemas');

const REPO = 'gitlab.example.com/acme/app';
const USER_FILE = '/home/user/settings.user.jsonc';
const RULE = {
  pattern: 'gate/opened/*',
  category: 'gate',
  title: 't',
  message: 'm',
};

function bridges(over: Partial<SettingDefWire> = {}): SettingDefWire {
  return {
    key: 'rt.notify.eventBridges',
    type: 'array',
    scopes: ['user'],
    merge: 'replace',
    secret: false,
    teamLocked: false,
    repoScoped: false,
    writable: true,
    description: 'Event bridge rules.',
    hasDefault: false,
    defaultValue: null,
    effective: {
      scope: 'user',
      file: USER_FILE,
      value: [RULE, RULE, { ...RULE, url: 3 }],
    },
    storeVersion: 1,
    issues: [
      {
        scope: 'user',
        file: USER_FILE,
        kind: 'nonconforming',
        path: [2, 'url'],
        message: 'expected string, got number',
      },
    ],
    ...schemaFields('rt.notify.eventBridges'),
    ...over,
  };
}

function roles(): SettingDefWire {
  return {
    ...bridges(),
    key: 'rt.roles',
    type: 'object',
    scopes: ['user', 'team', 'machine'],
    merge: 'deep',
    repoScoped: true,
    effective: { scope: null, file: null },
    issues: [
      {
        scope: 'team.repo',
        file: '/home/team/settings.team.jsonc',
        repo: REPO,
        kind: 'nonconforming',
        path: ['dev', 'fixedPort'],
        message: 'expected number, got string',
      },
    ],
    ...schemaFields('rt.roles'),
  };
}

describe('Needs fixing on the page', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/settings');
    vi.stubGlobal('fetch', async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.startsWith('/api/settings/repos')
          ? { repos: [{ identity: REPO, label: 'acme/app' }] }
          : url.startsWith('/api/settings/explain/')
            ? { def: null, rows: [] }
            : { defs: [bridges(), roles()] },
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  const renderPage = () =>
    renderWithProviders(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsPage />
      </QueryClientProvider>
    );

  it('counts, lists and filters the keys that need fixing', async () => {
    renderPage();
    const chip = await screen.findByRole('checkbox', { name: /^Needs fixing/ });
    expect(chip.closest('label') ?? chip.parentElement!).toHaveTextContent(
      'Needs fixing 2'
    );
    expect(
      screen.getByText('user · [2].url: expected string, got number')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'team · acme/app · dev.fixedPort: expected number, got string'
      )
    ).toBeInTheDocument();
  });

  it('Fix opens the explain modal on that layer, switching to the issue’s repo', async () => {
    renderPage();
    const line = await screen.findByText(
      'team · acme/app · dev.fixedPort: expected number, got string'
    );
    await userEvent.click(
      within(line.closest('[data-testid="issue-line"]')!).getByRole('button', {
        name: 'Fix',
      })
    );
    await waitFor(() => {
      const p = new URLSearchParams(window.location.search);
      expect([p.get('explain'), p.get('fix'), p.get('repo')]).toEqual([
        'rt.roles',
        'team.repo',
        REPO,
      ]);
    });
  });
});

describe('Fix in the explain modal', () => {
  afterEach(() => vi.unstubAllGlobals());

  function openFix(d: SettingDefWire, rows: ExplainRowWire[]) {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({ def: d, rows }),
    }));
    renderWithProviders(
      <QueryClientProvider client={new QueryClient()}>
        <ExplainModal
          settingKey={d.key}
          fix="user"
          store={{
            defs: [d],
            loading: false,
            error: null,
            set: vi.fn(async () => null),
            unset: vi.fn(async () => null),
            move: vi.fn(async () => null),
          }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );
  }

  it('opens the layer in the form when the form can draw it, issues shown, Save off', async () => {
    const value = [RULE, RULE, { ...RULE, url: 3 }];
    openFix(bridges(), [
      { scope: 'default', file: null, present: false },
      {
        scope: 'user',
        file: USER_FILE,
        present: true,
        value,
        nonconforming: [
          { path: [2, 'url'], message: 'expected string, got number' },
        ],
      },
    ]);
    const layer = await screen.findByTestId('layer-user');
    expect(await within(layer).findByTestId('item-2')).toBeInTheDocument();
    expect(within(layer).getByTestId('draft-issue')).toHaveTextContent(
      '[2].url: expected string, got number'
    );
    expect(within(layer).getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(
      within(layer).getByRole('button', {
        name: 'remove rt.notify.eventBridges from user',
      })
    ).toBeInTheDocument();
  });

  it('a value the form cannot draw opens in JSON, never in cards', async () => {
    openFix(
      bridges({
        effective: { scope: 'user', file: USER_FILE, value: { pattern: 'x' } },
      }),
      [
        { scope: 'default', file: null, present: false },
        {
          scope: 'user',
          file: USER_FILE,
          present: true,
          value: { pattern: 'x' },
          nonconforming: [{ path: [], message: 'expected array, got object' }],
        },
      ]
    );
    const layer = await screen.findByTestId('layer-user');
    expect(
      await within(layer).findByRole('textbox', { name: 'JSON' })
    ).toHaveValue(JSON.stringify({ pattern: 'x' }, null, 2));
    expect(within(layer).queryByTestId('item-0')).toBeNull();
    expect(within(layer).getByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
