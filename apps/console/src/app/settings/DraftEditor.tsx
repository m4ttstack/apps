import { useState, type KeyboardEvent } from 'react';
import { Button, Group, Stack, Text } from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import type { SettingDefWire } from '@mattstack/settings-kit/react';
import { checkValue } from '@mattstack/settings-kit/shapes';

import type { FormShape } from './formShape';
import { ItemCards } from './ItemCards';

type Entry = Record<string, unknown>;

function emptyOf(form: FormShape): unknown {
  return form.kind === 'objectList' ? [] : {};
}

/** A local draft of one layer's value, checked against the def's layer
    schema as it changes and saved only when it passes. Escape and Cancel
    discard it; Escape is marked handled so an enclosing modal stays open. */
export function DraftEditor({
  def,
  form,
  initial,
  targetLabel,
  saving,
  onSave,
  onCancel,
}: {
  def: SettingDefWire;
  form: FormShape;
  initial: unknown;
  targetLabel: string;
  saving: boolean;
  onSave: (value: unknown) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { text } = useSchemeColors();
  const start = initial ?? emptyOf(form);
  const [draft, setDraft] = useState<unknown>(() => structuredClone(start));
  const schema = def.layerSchema ?? def.schema;
  const issues = schema ? checkValue(schema, draft) : [];
  const changed = JSON.stringify(draft) !== JSON.stringify(start);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const target = e.target as HTMLElement;
    if (target.closest('[role="menu"], [role="listbox"]')) return;
    // A Select/Autocomplete target closes its own dropdown on Escape without
    // stopping the event; its aria-expanded is still "true" here since that
    // close hasn't re-rendered yet. Let that Escape stop there instead of
    // also discarding the draft.
    if (target.getAttribute('aria-expanded') === 'true') return;
    e.preventDefault();
    onCancel();
  };

  const footerEnd = (
    <>
      <Button size="compact-sm" variant="default" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        size="compact-sm"
        disabled={!changed || issues.length > 0 || saving}
        onClick={() => void onSave(draft)}
      >
        Save
      </Button>
    </>
  );

  return (
    <Stack gap={10} onKeyDown={onKeyDown}>
      <Group justify="space-between" wrap="nowrap">
        <Text fz={12} c={text.muted}>
          {`Editing the ${targetLabel} layer`}
        </Text>
      </Group>
      {form.kind === 'objectList' ? (
        <ItemCards
          shape={form}
          value={draft as Entry[]}
          onChange={setDraft}
          disabled={saving}
          issues={issues}
          footerEnd={footerEnd}
        />
      ) : (
        <Group gap={8} justify="flex-end" wrap="nowrap">
          {footerEnd}
        </Group>
      )}
    </Stack>
  );
}
