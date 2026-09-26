import { useRef, useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Stack,
  Text,
} from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import { Icons } from '@mattstack/app-kit/icons';
import type { SchemaIssue } from '@mattstack/settings-kit/shapes';

import { FieldGrid } from './FieldGrid';
import { newEntry, type FormShape } from './formShape';
import { footerSummary, issuesUnder } from './issues';

type Entry = Record<string, unknown>;

// --tk-card reads almost flat against the page in dark scheme; --tk-raised
// is the step tuned to read as a distinct surface in both schemes.
export const CARD_STYLE = {
  border: '1px solid var(--tk-border-soft)',
  borderRadius: 4,
  background: 'var(--tk-raised)',
} as const;

const NO_TOUCHED: ReadonlySet<string> = new Set();

/** One card per item, in order. Cards carry stable ids so a card's local
    state (the optional fields it revealed, its touched fields) follows it
    through a reorder. */
export function ItemCards({
  shape,
  value,
  onChange,
  disabled,
  issues,
  footerEnd,
}: {
  shape: FormShape;
  value: Entry[];
  onChange: (next: Entry[]) => void;
  disabled: boolean;
  issues: SchemaIssue[];
  footerEnd: ReactNode;
}) {
  const { text } = useSchemeColors();
  const next = useRef(value.length);
  const [ids, setIds] = useState(() => value.map((_, i) => i));
  const [touched, setTouched] = useState<Record<number, Set<string>>>({});
  const swap = <T,>(list: T[], a: number, b: number) => {
    const out = [...list];
    [out[a], out[b]] = [out[b]!, out[a]!];
    return out;
  };
  const move = (from: number, to: number) => {
    setIds(swap(ids, from, to));
    onChange(swap(value, from, to));
  };
  const remove = (at: number) => {
    setIds(ids.filter((_, i) => i !== at));
    onChange(value.filter((_, i) => i !== at));
  };
  const add = () => {
    setIds([...ids, next.current++]);
    onChange([...value, newEntry(shape)]);
  };
  const markTouched = (id: number, name: string) =>
    setTouched(t => {
      if (t[id]?.has(name)) return t;
      const set = new Set(t[id]);
      set.add(name);
      return { ...t, [id]: set };
    });
  const first = shape.required[0];
  const summary = footerSummary(
    issues,
    ids.map(id => touched[id] ?? NO_TOUCHED)
  );

  return (
    <Stack gap={8}>
      {value.map((item, i) => (
        <Box key={ids[i]} p={12} style={CARD_STYLE} data-testid={`item-${i}`}>
          <Group justify="space-between" wrap="nowrap" pb={4}>
            <Text fz={12} ff="monospace" truncate>
              <Text span inherit c="var(--tk-text-3)">
                {`#${i + 1}`}
              </Text>
              {first && typeof item[first] === 'string' && (
                <Text span inherit fw={500} c="var(--tk-text-1)">
                  {`  ${item[first] as string}`}
                </Text>
              )}
            </Text>
            <Group gap={2} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                color="gray"
                c={text.muted}
                size="sm"
                aria-label={`move item ${i + 1} up`}
                disabled={disabled || i === 0}
                onClick={() => move(i, i - 1)}
              >
                <Icons.chevronUp size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                c={text.muted}
                size="sm"
                aria-label={`move item ${i + 1} down`}
                disabled={disabled || i === value.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <Icons.chevronDown size={14} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="gray"
                c={text.muted}
                size="sm"
                aria-label={`remove item ${i + 1}`}
                disabled={disabled}
                onClick={() => remove(i)}
              >
                <Icons.trash size={14} />
              </ActionIcon>
            </Group>
          </Group>
          <FieldGrid
            shape={shape}
            entry={item}
            disabled={disabled}
            issues={issuesUnder(issues, i)}
            touched={touched[ids[i]!] ?? NO_TOUCHED}
            onTouch={name => markTouched(ids[i]!, name)}
            onChange={e => onChange(value.map((x, j) => (j === i ? e : x)))}
          />
        </Box>
      ))}
      <Group justify="space-between" wrap="nowrap" gap={8}>
        <Button
          size="compact-sm"
          variant="default"
          disabled={disabled}
          leftSection={<Icons.plus size={14} />}
          onClick={add}
        >
          Add item
        </Button>
        <Group gap={8} wrap="nowrap">
          {summary.touchedText && (
            <Text fz={12} c="var(--tk-text-bad-small)">
              {summary.touchedText}
            </Text>
          )}
          {summary.touchedText && summary.noteText && (
            <Text fz={12} c="var(--tk-text-3)">
              ·
            </Text>
          )}
          {summary.noteText && (
            <Text fz={12} c="var(--tk-text-3)">
              {summary.noteText}
            </Text>
          )}
          {footerEnd}
        </Group>
      </Group>
    </Stack>
  );
}
