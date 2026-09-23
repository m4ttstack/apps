import { renderWithProviders } from '@mattstack/app-kit/test-utils';
import type { SettingDefWire } from '@mattstack/settings-kit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/useSettings', () => ({
  useAgentModels: () => ({
    data: { models: [{ value: 'opus', label: 'Opus' }] },
  }),
}));

const { SettingsPage } = await import('./SettingsPage');

function def(key: string, over: Partial<SettingDefWire> = {}): SettingDefWire {
  return {
    key,
    type: 'string',
    scopes: ['user'],
    merge: 'replace',
    secret: false,
    teamLocked: false,
    repoScoped: false,
    writable: true,
    description: `${key} setting.`,
    hasDefault: false,
    defaultValue: null,
    effective: { scope: null, file: null },
    ...over,
  };
}

const BOARD = [
  ...Array.from({ length: 7 }, (_, i) =>
    def(`board.t${i}`, {
      scopes: ['team'],
      effective: { scope: 'team', file: '/t', value: 'x' },
    })
  ),
  ...Array.from({ length: 5 }, (_, i) =>
    def(`board.u${i}`, { scopes: ['user', 'machine'] })
  ),
  def('board.agent.model', {
    scopes: ['user', 'machine'],
    effective: { scope: 'machine', file: '/m', value: 'opus' },
  }),
];
const DEFS = [
  def('agent.provider', {
    effective: { scope: 'default', file: null, value: 'claude' },
  }),
  def('agent.claude.account'),
  def('agent.codex.effort'),
  def('rt.runsPruneDays', {
    type: 'number',
    scopes: ['machine'],
    effective: { scope: 'default', file: null, value: 30 },
  }),
  def('rt.logRetentionDays', {
    type: 'number',
    scopes: ['machine', 'user'],
    effective: { scope: 'machine', file: '/m', value: 7 },
  }),
  ...BOARD,
];

let defsResponse: () => unknown = () => ({
  ok: true,
  status: 200,
  json: async () => ({ defs: DEFS }),
});

beforeEach(() => {
  window.history.replaceState(null, '', '/settings');
  vi.stubGlobal('fetch', async () => defsResponse());
});
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  return renderWithProviders(
    <QueryClientProvider client={new QueryClient()}>
      <SettingsPage />
    </QueryClientProvider>
  );
}

describe('SettingsPage', () => {
  it('lists groups in the index with their counts and renders sections', async () => {
    renderPage();
    const index = await screen.findByRole('navigation', {
      name: 'settings groups',
    });
    expect(within(index).getByText('Agents')).toBeInTheDocument();
    expect(within(index).getByText('Board')).toBeInTheDocument();
    expect(within(index).getByText('13')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Daemon' })).toBeInTheDocument();
  });

  it('filters by key and description, keeps the query in the URL, and Esc clears it', async () => {
    renderPage();
    const filter = await screen.findByLabelText('filter settings');
    await userEvent.type(filter, 'days');
    expect(screen.getByText('2 of 18')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Board' })).toBeNull();
    expect(window.location.search).toBe('?q=days');
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument();
  });

  it('shows an empty state when nothing matches', async () => {
    renderPage();
    await userEvent.type(
      await screen.findByLabelText('filter settings'),
      'kubernetes'
    );
    expect(
      screen.getByText('No settings match “kubernetes”')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument();
  });

  it('Changed keeps only keys a store sets', async () => {
    renderPage();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: /Changed/ })
    );
    expect(screen.queryByText('provider')).toBeNull();
    expect(screen.getByText('logRetentionDays')).toBeInTheDocument();
  });

  it('splits a large section into subheads and hides badges that repeat them', async () => {
    renderPage();
    const board = (
      await screen.findByRole('heading', { name: 'Board' })
    ).closest('section')!;
    expect(within(board).getByText('Team')).toBeInTheDocument();
    expect(within(board).getByText('You')).toBeInTheDocument();
    expect(
      within(board).queryAllByText('team', { selector: '.mantine-Badge-label' })
    ).toHaveLength(0);
    expect(
      within(board).getByRole('button', {
        name: 'machine: move to another scope',
      })
    ).toBeInTheDocument();
  });

  it('the Agents Codex tab swaps the provider keys and drops account', async () => {
    renderPage();
    expect(await screen.findByText('account')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: 'Codex' }));
    expect(screen.queryByText('account')).toBeNull();
    expect(screen.getByText('agent.codex.')).toBeInTheDocument();
  });

  it('a failed load shows an alert and keeps the toolbar', async () => {
    defsResponse = () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'rt: store unreadable' }),
    });
    renderPage();
    expect(await screen.findByText('rt: store unreadable')).toBeInTheDocument();
    expect(screen.getByLabelText('filter settings')).toBeInTheDocument();
    defsResponse = () => ({
      ok: true,
      status: 200,
      json: async () => ({ defs: DEFS }),
    });
  });
});
