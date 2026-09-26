import { renderWithProviders } from '@mattstack/app-kit/test-utils';
import type { SettingDefWire } from '@mattstack/settings-kit/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

const { SettingRow } = await import('./SettingRow');
const { ExplainModal } = await import('./ExplainModal');
const { schemaFields } = await import('./testSchemas');

const USER_FILE = '/home/user/settings.user.jsonc';
const CURRENT = { dev: { fixedPort: 3000 } };
const OLDER = { dev: { fixedPort: 3100 } };

const ROLES: SettingDefWire = {
  key: 'rt.roles',
  type: 'object',
  scopes: ['user', 'team', 'machine'],
  merge: 'deep',
  secret: false,
  teamLocked: false,
  repoScoped: true,
  writable: true,
  description: 'Roles.',
  hasDefault: false,
  defaultValue: null,
  effective: { scope: 'user', file: USER_FILE, value: CURRENT },
  storeVersion: 2,
  issues: [
    {
      scope: 'user',
      file: USER_FILE,
      kind: 'diverged',
      path: [],
      message: 'rt.roles changed after rt.roles@2 was written',
      storeName: 'rt.roles',
      olderValue: OLDER,
      currentValue: CURRENT,
    },
  ],
  ...schemaFields('rt.roles'),
};

afterEach(() => vi.unstubAllGlobals());

const store = () => ({
  set: vi.fn(async () => null as string | null),
  unset: vi.fn(async () => null as string | null),
  move: vi.fn(async () => null as string | null),
  prune: vi.fn(async () => null as string | null),
});

describe('a diverged older name', () => {
  it('the row shows both values', () => {
    renderWithProviders(
      <SettingRow def={ROLES} store={store()} subhead={null} query="" />
    );
    const line = screen.getByTestId('diverged-user');
    expect(line).toHaveTextContent(
      'user · rt.roles differs from the current value'
    );
    expect(within(line).getByTestId('diverged-current')).toHaveTextContent(
      '"fixedPort": 3000'
    );
    expect(within(line).getByTestId('diverged-older')).toHaveTextContent(
      '"fixedPort": 3100'
    );
  });

  it('Fix edits the current value; Use the older value swaps the draft in; Remove the older name prunes it', async () => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        def: ROLES,
        rows: [
          { scope: 'default', file: null, present: false },
          { scope: 'user', file: USER_FILE, present: true, value: CURRENT },
        ],
      }),
    }));
    const s = store();
    renderWithProviders(
      <QueryClientProvider client={new QueryClient()}>
        <ExplainModal
          settingKey="rt.roles"
          fix="user"
          store={{ defs: [ROLES], loading: false, error: null, ...s }}
          onClose={vi.fn()}
        />
      </QueryClientProvider>
    );
    const layer = await screen.findByTestId('layer-user');
    // rt.roles recognizes as a named-sections form, so the layer editor
    // opens in the form; switch to JSON through the mode toggle (the "Edit
    // as JSON" button lives on stringMap/leaves bodies, not this toggle) to
    // compare the draft's text.
    await userEvent.click(within(layer).getByRole('radio', { name: 'JSON' }));
    expect(within(layer).getByRole('textbox', { name: 'JSON' })).toHaveValue(
      JSON.stringify(CURRENT, null, 2)
    );
    await userEvent.click(
      within(layer).getByRole('button', { name: 'Use the older value' })
    );
    expect(within(layer).getByRole('textbox', { name: 'JSON' })).toHaveValue(
      JSON.stringify(OLDER, null, 2)
    );
    await userEvent.click(within(layer).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith('rt.roles', 'user', OLDER)
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Remove the older name' })
    );
    const confirmTitle = await screen.findByText('Remove rt.roles');
    const confirm = confirmTitle.closest('[role="dialog"]') as HTMLElement;
    expect(confirm).toHaveTextContent('"fixedPort": 3100');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() =>
      expect(s.prune).toHaveBeenCalledWith('rt.roles', 'user', 'rt.roles')
    );
  });
});
