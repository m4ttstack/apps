import { renderWithProviders } from '@mattstack/app-kit/test-utils';
import type { SettingDefWire } from '@mattstack/settings-kit/react';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingRow } from './SettingRow';
import { schemaFields } from './testSchemas';

const RULE = {
  pattern: 'gate/opened/*',
  subjectPrefix: 'run:',
  category: 'gate',
  title: '{label}',
  message: '{question}',
  url: 'http://localhost:11001/gates/{id}',
};

function bridges(value: unknown[]): SettingDefWire {
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
    effective: { scope: 'user', file: '/home/user/settings.user.jsonc', value },
    storeVersion: 1,
    ...schemaFields('rt.notify.eventBridges'),
  };
}

const store = () => ({
  set: vi.fn(async () => null as string | null),
  unset: vi.fn(async () => null as string | null),
  move: vi.fn(async () => null as string | null),
});

beforeEach(() =>
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => ({ def: null, rows: [] }),
  }))
);
afterEach(() => vi.unstubAllGlobals());

async function open(value: unknown[], s = store()) {
  renderWithProviders(
    <SettingRow def={bridges(value)} store={s} subhead={null} query="" />
  );
  // The row's summary toggle ("1 bridge", "2 bridges"); the row menu's
  // button also carries aria-expanded, so match by name.
  await userEvent.click(screen.getByRole('button', { name: /^\d+ bridges?$/ }));
  return s;
}

describe('item cards', () => {
  it('draws one card per item with required fields and set optional ones', async () => {
    await open([RULE]);
    const card = screen.getByTestId('item-0');
    expect(within(card).getByLabelText('pattern')).toHaveValue('gate/opened/*');
    expect(within(card).getByLabelText('url')).toHaveValue(RULE.url);
    expect(within(card).queryByLabelText('surface')).toBeNull();
    expect(
      within(card).queryByRole('button', { name: 'remove pattern' })
    ).toBeNull();
    expect(
      within(card).getByRole('button', { name: 'remove url' })
    ).toBeInTheDocument();
  });

  it('Add item appends a card whose empty required fields keep Save disabled', async () => {
    const s = await open([RULE]);
    await userEvent.click(screen.getByRole('button', { name: 'Add item' }));
    const card = screen.getByTestId('item-1');
    const save = screen.getByRole('button', { name: 'Save' });
    expect(save).toBeDisabled();
    expect(screen.getByTestId('draft-issue')).toHaveTextContent(
      '[1].pattern: required property "pattern" is missing'
    );
    await userEvent.type(within(card).getByLabelText('pattern'), 'run/*');
    await userEvent.type(within(card).getByLabelText('category'), 'run');
    await userEvent.type(within(card).getByLabelText('title'), 't');
    await userEvent.type(within(card).getByLabelText('message'), 'm');
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith('rt.notify.eventBridges', 'user', [
        RULE,
        { pattern: 'run/*', category: 'run', title: 't', message: 'm' },
      ])
    );
  });

  it('reorders and removes items', async () => {
    const other = { ...RULE, pattern: 'run/*', subjectPrefix: 'mr:' };
    const s = await open([RULE, other]);
    await userEvent.click(
      screen.getByRole('button', { name: 'move item 2 up' })
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'remove item 2' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith('rt.notify.eventBridges', 'user', [
        other,
      ])
    );
  });

  it('Add property reveals an optional field; its remove drops it again', async () => {
    await open([RULE]);
    const card = screen.getByTestId('item-0');
    await userEvent.click(
      within(card).getByRole('button', { name: 'Add property' })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'surface' })
    );
    expect(within(card).getByLabelText('surface')).toHaveValue('');
    await userEvent.click(
      within(card).getByRole('button', { name: 'remove surface' })
    );
    expect(within(card).queryByLabelText('surface')).toBeNull();
  });

  it('an unknown extra property is shown read-only and kept on save', async () => {
    const s = await open([{ ...RULE, legacy: 1 }]);
    const card = screen.getByTestId('item-0');
    expect(within(card).getByText('legacy')).toBeInTheDocument();
    expect(within(card).getByText('1')).toBeInTheDocument();
    const title = within(card).getByLabelText('title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Gate');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith('rt.notify.eventBridges', 'user', [
        { ...RULE, title: 'Gate', legacy: 1 },
      ])
    );
  });

  it('Save is disabled until something changes; Cancel and Escape discard the draft', async () => {
    const s = await open([RULE]);
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    const title = within(screen.getByTestId('item-0')).getByLabelText('title');
    await userEvent.clear(title);
    await userEvent.type(title, 'Changed{Escape}');
    expect(
      within(screen.getByTestId('item-0')).getByLabelText('title')
    ).toHaveValue('{label}');
    await userEvent.type(
      within(screen.getByTestId('item-0')).getByLabelText('title'),
      'x'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(
      within(screen.getByTestId('item-0')).getByLabelText('title')
    ).toHaveValue('{label}');
    expect(s.set).not.toHaveBeenCalled();
  });

  it("shows rt's refusal under the row and keeps the draft", async () => {
    const s = store();
    s.set.mockResolvedValueOnce(
      'merged value would fail: [0].url: expected string'
    );
    await open([RULE], s);
    const title = within(screen.getByTestId('item-0')).getByLabelText('title');
    await userEvent.type(title, '!');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(
      await screen.findByText(
        'merged value would fail: [0].url: expected string'
      )
    ).toBeInTheDocument();
    expect(title).toHaveValue('{label}!');
  });
});
