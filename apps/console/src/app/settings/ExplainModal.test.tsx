import { renderWithProviders } from '@mattstack/app-kit/test-utils';
import type {
  ExplainRowWire,
  SettingDefWire,
} from '@mattstack/settings-kit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExplainModal, type ExplainStore } from './ExplainModal';

const KEY = 'board.agent.model';

const DEF: SettingDefWire = {
  key: KEY,
  type: 'string',
  scopes: ['user', 'machine'],
  merge: 'replace',
  secret: false,
  teamLocked: false,
  repoScoped: false,
  writable: true,
  description:
    "Default --model for the board's panes. Unset omits the flag entirely.",
  hasDefault: false,
  defaultValue: null,
  effective: { scope: 'machine', file: '/stores/local.jsonc', value: 'm-old' },
};

const ROWS: ExplainRowWire[] = [
  { scope: 'default', file: null, present: false },
  { scope: 'team', file: '/stores/team.jsonc', present: false },
  { scope: 'user', file: '/stores/user.jsonc', present: true, value: 'm-new' },
  {
    scope: 'machine',
    file: '/stores/local.jsonc',
    present: true,
    value: 'm-old',
  },
];

const explainGet = vi.fn();

vi.stubGlobal('fetch', (url: string) => {
  if (url.startsWith('/api/settings/explain/')) return explainGet(url);
  return Promise.resolve({
    ok: false,
    status: 404,
    json: async () => ({ error: 'not found' }),
  });
});

function ok(data: unknown) {
  return { ok: true, status: 200, json: async () => data };
}

function store(over: Partial<ExplainStore> = {}): ExplainStore {
  return {
    defs: [DEF],
    loading: false,
    error: null,
    set: vi.fn(async () => null as string | null),
    unset: vi.fn(async () => null as string | null),
    move: vi.fn(async () => null as string | null),
    ...over,
  };
}

function renderModal(s: ExplainStore, settingKey: string | null = KEY) {
  const onClose = vi.fn();
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  renderWithProviders(
    <QueryClientProvider client={queryClient}>
      <ExplainModal settingKey={settingKey} store={s} onClose={onClose} />
    </QueryClientProvider>
  );
  return { onClose };
}

afterEach(() => explainGet.mockReset());

describe('ExplainModal', () => {
  it('renders the settings row, the verdict and every layer', async () => {
    explainGet.mockResolvedValue(ok({ def: DEF, rows: ROWS }));
    renderModal(store());

    const dialog = await screen.findByRole('dialog');
    expect(
      within(dialog).getByText(`>_ rt settings explain ${KEY}`)
    ).toBeInTheDocument();
    expect(within(dialog).getByText('model')).toBeInTheDocument();
    expect(within(dialog).getByText(DEF.description)).toBeInTheDocument();
    expect(
      await within(dialog).findByTestId('explain-sentence')
    ).toHaveTextContent(
      `${KEY} is "m-old" because the machine layer sets it, overriding user.`
    );
    expect(within(dialog).getByTestId('layer-value-user')).toHaveStyle({
      textDecoration: 'line-through',
    });
    expect(
      within(within(dialog).getByTestId('layer-machine')).getByText('wins')
    ).toBeInTheDocument();
    expect(
      within(within(dialog).getByTestId('layer-team')).getByText(
        'not allowed at this layer (allowed: user, machine)'
      )
    ).toBeInTheDocument();
  });

  it('removes one layer and re-reads the stack', async () => {
    explainGet.mockResolvedValue(ok({ def: DEF, rows: ROWS }));
    const s = store();
    renderModal(s);

    const remove = await screen.findByRole('button', {
      name: `remove ${KEY} from machine`,
    });
    expect(explainGet).toHaveBeenCalledTimes(1);
    await userEvent.click(remove);

    expect(s.unset).toHaveBeenCalledWith(KEY, 'machine');
    await waitFor(() => expect(explainGet).toHaveBeenCalledTimes(2));
  });

  it('offers no remove on unset or disallowed layers', async () => {
    explainGet.mockResolvedValue(ok({ def: DEF, rows: ROWS }));
    renderModal(store());

    await screen.findByTestId('layer-machine');
    expect(
      screen.queryByRole('button', { name: `remove ${KEY} from team` })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: `remove ${KEY} from user` })
    ).toBeInTheDocument();
  });

  it('shows a refused remove', async () => {
    explainGet.mockResolvedValue(ok({ def: DEF, rows: ROWS }));
    const s = store({ unset: vi.fn(async () => 'store is read-only') });
    renderModal(s);

    await userEvent.click(
      await screen.findByRole('button', { name: `remove ${KEY} from user` })
    );
    expect(await screen.findByText('store is read-only')).toBeInTheDocument();
    expect(explainGet).toHaveBeenCalledTimes(1);
  });

  it('says so for an unknown key', async () => {
    renderModal(store(), 'no.such.key');
    expect(
      await screen.findByText('No setting named no.such.key is registered.')
    ).toBeInTheDocument();
  });

  it('is closed without a key', () => {
    renderModal(store(), null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
