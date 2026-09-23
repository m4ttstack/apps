import { renderWithProviders } from '@mattstack/app-kit/test-utils';
import type { SettingDefWire } from '@mattstack/settings-kit/react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SettingRow } from './SettingRow';

function def(key: string, over: Partial<SettingDefWire> = {}): SettingDefWire {
  return {
    key,
    type: 'string',
    scopes: ['user', 'machine'],
    merge: 'replace',
    secret: false,
    teamLocked: false,
    repoScoped: false,
    writable: true,
    description: 'What it does. A second sentence nobody needs here.',
    hasDefault: false,
    defaultValue: null,
    effective: { scope: null, file: null },
    ...over,
  };
}

function store() {
  return {
    set: vi.fn(async () => null as string | null),
    unset: vi.fn(async () => null as string | null),
    move: vi.fn(async () => null as string | null),
  };
}

describe('SettingRow', () => {
  it('shows the key, the first sentence, the source, and an explain link', () => {
    renderWithProviders(
      <SettingRow
        def={def('agent.claude.effort', {
          effective: { scope: 'default', file: null, value: 'high' },
        })}
        store={store()}
        subhead={null}
        query=""
      />
    );
    expect(screen.getByText('agent.claude.')).toBeInTheDocument();
    expect(screen.getByText('effort')).toBeInTheDocument();
    expect(screen.getByText('What it does.')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'explain agent.claude.effort' })
    ).toHaveAttribute('href', '/config/agent.claude.effort');
  });

  it('saves a string on blur to the winning layer', async () => {
    const s = store();
    renderWithProviders(
      <SettingRow
        def={def('agent.claude.effort', {
          effective: { scope: 'machine', file: '/m', value: 'high' },
        })}
        store={s}
        subhead={null}
        query=""
      />
    );
    const input = screen.getByLabelText('agent.claude.effort');
    await userEvent.clear(input);
    await userEvent.type(input, 'low');
    input.blur();
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith(
        'agent.claude.effort',
        'machine',
        'low'
      )
    );
    expect(await screen.findByText('saved')).toBeInTheDocument();
  });

  it('clearing a string unsets it instead of writing an empty string', async () => {
    const s = store();
    renderWithProviders(
      <SettingRow
        def={def('agent.claude.effort', {
          effective: { scope: 'user', file: '/u', value: 'high' },
        })}
        store={s}
        subhead={null}
        query=""
      />
    );
    const input = screen.getByLabelText('agent.claude.effort');
    await userEvent.clear(input);
    input.blur();
    await waitFor(() =>
      expect(s.unset).toHaveBeenCalledWith('agent.claude.effort', 'user')
    );
  });

  it('follows a refreshed effective value and writes nothing on a bare blur', async () => {
    const s = store();
    const { rerender } = renderWithProviders(
      <SettingRow
        def={def('agent.claude.effort', {
          effective: { scope: 'user', file: '/u', value: 'high' },
        })}
        store={s}
        subhead={null}
        query=""
      />
    );
    rerender(
      <SettingRow
        def={def('agent.claude.effort', {
          effective: { scope: 'default', file: null, value: 'medium' },
        })}
        store={s}
        subhead={null}
        query=""
      />
    );
    const input = screen.getByLabelText('agent.claude.effort');
    expect(input).toHaveValue('medium');
    await userEvent.click(input);
    input.blur();
    await new Promise(r => setTimeout(r, 0));
    expect(s.set).not.toHaveBeenCalled();
    expect(s.unset).not.toHaveBeenCalled();
  });

  it('Enter on a highlighted suggestion saves the suggestion, once', async () => {
    const s = store();
    renderWithProviders(
      <SettingRow
        def={def('board.agent.model')}
        store={s}
        subhead={null}
        query=""
        suggestions={['sonnet-long', 'opus']}
      />
    );
    const input = screen.getByRole('combobox', {
      name: 'board.agent.model',
    });
    await userEvent.type(input, 'son');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith(
        'board.agent.model',
        'user',
        'sonnet-long'
      )
    );
    expect(s.set).toHaveBeenCalledTimes(1);
  });

  it("shows rt's refusal verbatim under the row", async () => {
    const s = store();
    s.set.mockResolvedValue('rt: nope');
    renderWithProviders(
      <SettingRow
        def={def('agent.claude.effort')}
        store={s}
        subhead={null}
        query=""
      />
    );
    const input = screen.getByLabelText('agent.claude.effort');
    await userEvent.type(input, 'x');
    input.blur();
    expect(await screen.findByText('rt: nope')).toBeInTheDocument();
  });

  it('an invalid winning layer says so and the next save still targets it', async () => {
    const s = store();
    renderWithProviders(
      <SettingRow
        def={def('agent.claude.yolo', {
          type: 'boolean',
          effective: { scope: 'user', file: '/u', invalid: 'expected boolean' },
        })}
        store={s}
        subhead={null}
        query=""
      />
    );
    expect(
      screen.getByText('stored value rejected: expected boolean')
    ).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('agent.claude.yolo'));
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith('agent.claude.yolo', 'user', true)
    );
  });

  it('toggles a boolean immediately', async () => {
    const s = store();
    renderWithProviders(
      <SettingRow
        def={def('agent.claude.yolo', { type: 'boolean' })}
        store={s}
        subhead={null}
        query=""
      />
    );
    await userEvent.click(screen.getByLabelText('agent.claude.yolo'));
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith('agent.claude.yolo', 'user', true)
    );
  });

  it('offers the ENUMS options as a select', async () => {
    const s = store();
    renderWithProviders(
      <SettingRow
        def={def('rt.logLevel', {
          scopes: ['machine', 'user'],
          effective: { scope: 'default', file: null, value: 'info' },
        })}
        store={s}
        subhead={null}
        query=""
      />
    );
    await userEvent.click(
      screen.getByRole('combobox', { name: 'rt.logLevel' })
    );
    await userEvent.click(await screen.findByRole('option', { name: 'debug' }));
    await waitFor(() =>
      expect(s.set).toHaveBeenCalledWith('rt.logLevel', 'machine', 'debug')
    );
  });

  it('hides the badge under a matching subhead and moves a value from the badge menu', async () => {
    const s = store();
    const d = def('board.agent.model', {
      effective: { scope: 'machine', file: '/m', value: 'x' },
    });
    const { unmount } = renderWithProviders(
      <SettingRow def={d} store={s} subhead="machine" query="" />
    );
    expect(screen.queryByText('machine')).toBeNull();
    unmount();
    renderWithProviders(
      <SettingRow def={d} store={s} subhead="user" query="" />
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'machine: move to another scope' })
    );
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'user' })
    );
    await waitFor(() =>
      expect(s.move).toHaveBeenCalledWith(
        'board.agent.model',
        'machine',
        'user'
      )
    );
  });

  it('an external row summarises and names its owner', () => {
    renderWithProviders(
      <SettingRow
        def={def('board.members', {
          type: 'array',
          scopes: ['team'],
          writable: false,
          effective: { scope: 'team', file: '/t', value: [{}, {}, {}] },
        })}
        store={store()}
        subhead={null}
        query=""
      />
    );
    expect(screen.getByText('3 members · edited in board')).toBeInTheDocument();
  });
});
