import type { KeyboardEvent } from 'react';
import {
  Autocomplete,
  Group,
  NumberInput,
  Select,
  Switch,
  Text,
  TextInput,
} from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import type { SettingDefWire } from '@mattstack/settings-kit/react';
import { ENUMS } from '@mattstack/settings-kit/shapes';

import { unitOf } from './units';

function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur();
}

/** Uncontrolled on purpose: a refused save leaves the typed text in place
    so the user can fix it. Callers key the row on `def.key`. */
export function ScalarControl({
  def,
  onSave,
  suggestions,
}: {
  def: SettingDefWire;
  onSave: (value: unknown) => void;
  suggestions?: string[];
}) {
  const { text } = useSchemeColors();
  const value = def.effective.value;
  const label = def.key;

  if (def.type === 'boolean')
    return (
      <Switch
        aria-label={label}
        checked={value === true}
        onChange={e => onSave(e.currentTarget.checked)}
      />
    );

  const options = ENUMS[def.key];
  if (options)
    return (
      <Select
        aria-label={label}
        w={200}
        data={[...options]}
        value={typeof value === 'string' ? value : null}
        allowDeselect={false}
        onChange={v => {
          if (v !== null && v !== value) onSave(v);
        }}
      />
    );

  if (def.type === 'number') {
    const unit = unitOf(def.key);
    return (
      <Group gap={8} wrap="nowrap">
        <NumberInput
          aria-label={label}
          w={90}
          hideControls
          defaultValue={typeof value === 'number' ? value : undefined}
          onKeyDown={blurOnEnter}
          onBlur={e => {
            const raw = e.currentTarget.value.trim();
            if (raw === '') {
              if (value !== undefined) onSave(undefined);
              return;
            }
            const n = Number(raw);
            if (Number.isFinite(n) && n !== value) onSave(n);
          }}
        />
        {unit && (
          <Text size="xs" c={text.muted}>
            {unit}
          </Text>
        )}
      </Group>
    );
  }

  const current = typeof value === 'string' ? value : '';
  const commit = (next: string) => {
    if (next !== current) onSave(next === '' ? undefined : next);
  };
  if (suggestions)
    return (
      <Autocomplete
        aria-label={label}
        w={200}
        data={suggestions}
        defaultValue={current}
        onKeyDown={blurOnEnter}
        onBlur={e => commit(e.currentTarget.value)}
      />
    );
  return (
    <TextInput
      aria-label={label}
      w={200}
      defaultValue={current}
      onKeyDown={e => {
        if (e.key === 'Escape') e.currentTarget.value = current;
        if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
      }}
      onBlur={e => commit(e.currentTarget.value)}
    />
  );
}
