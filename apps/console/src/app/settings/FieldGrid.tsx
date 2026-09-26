import { useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Autocomplete,
  Button,
  Code,
  Group,
  Menu,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import { Icons } from '@mattstack/app-kit/icons';
import type { SchemaIssue } from '@mattstack/settings-kit/shapes';

import {
  enumWidth,
  INPUT_TYPE,
  numberWidth,
  SWITCH_SIZE,
} from './controlStyles';
import {
  addableFields,
  extraKeys,
  visibleFields,
  type FieldSpec,
  type FormShape,
} from './formShape';
import { BLOCK_STYLE } from './JsonBlock';

type Entry = Record<string, unknown>;

/** Controlled; the number input keeps its raw text so a half-typed "-"
    survives until it parses. */
function FieldInput({
  label,
  spec,
  value,
  disabled,
  onChange,
}: {
  label: string;
  spec: FieldSpec;
  value: unknown;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const [raw, setRaw] = useState<string | number>(
    typeof value === 'number' ? value : ''
  );
  if (spec.type === 'boolean')
    return (
      <Switch
        aria-label={label}
        size="sm"
        style={SWITCH_SIZE}
        disabled={disabled}
        checked={value === true}
        onChange={e => onChange(e.currentTarget.checked)}
      />
    );
  if (typeof spec.type === 'object')
    return (
      <Select
        aria-label={label}
        size="xs"
        w={enumWidth(spec.type.enum)}
        styles={INPUT_TYPE.label}
        disabled={disabled}
        data={[...spec.type.enum]}
        value={typeof value === 'string' ? value : null}
        allowDeselect={false}
        onChange={v => {
          if (v !== null) onChange(v);
        }}
      />
    );
  if (spec.type === 'number')
    return (
      <NumberInput
        aria-label={label}
        size="xs"
        w={numberWidth(value)}
        styles={INPUT_TYPE.number}
        placeholder={spec.placeholder}
        hideControls
        disabled={disabled}
        value={raw}
        onChange={v => {
          setRaw(v);
          if (typeof v === 'number') onChange(v);
          else if (v === '') onChange(undefined);
        }}
      />
    );
  const text = typeof value === 'string' ? value : '';
  const change = (v: string) => onChange(v === '' ? undefined : v);
  return spec.suggestions ? (
    <Autocomplete
      aria-label={label}
      size="xs"
      w={200}
      styles={INPUT_TYPE.code}
      placeholder={spec.placeholder}
      disabled={disabled}
      data={spec.suggestions}
      value={text}
      onChange={change}
    />
  ) : (
    <TextInput
      aria-label={label}
      size="xs"
      w={200}
      styles={INPUT_TYPE.code}
      placeholder={spec.placeholder}
      disabled={disabled}
      value={text}
      onTextChange={change}
    />
  );
}

function Line({
  name,
  hint,
  children,
  error,
}: {
  name: ReactNode;
  hint?: string;
  children: ReactNode;
  error?: string;
}) {
  const { text } = useSchemeColors();
  return (
    <Stack gap={2} py={4}>
      <Group gap={24} wrap="nowrap" mih={34}>
        <Stack gap={0} style={{ flex: 1, minWidth: 0 }}>
          {name}
          {hint && (
            <Text fz={12} c={text.muted} lineClamp={2}>
              {hint}
            </Text>
          )}
        </Stack>
        <Group w={260} gap={8} wrap="nowrap" style={{ flex: 'none' }}>
          {children}
        </Group>
      </Group>
      {error && (
        <Text fz={12} ff="monospace" c="var(--tk-text-bad-small)">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/** One object's fields: required first, then set or added optional ones,
    an Add property menu, and read-only rows for properties the form does
    not draw (kept as they are on save). */
export function FieldGrid({
  shape,
  entry,
  onChange,
  disabled,
  issues,
}: {
  shape: FormShape;
  entry: Entry;
  onChange: (next: Entry) => void;
  disabled: boolean;
  issues: SchemaIssue[];
}) {
  const { text } = useSchemeColors();
  const [shown, setShown] = useState<string[]>([]);
  const set = (name: string, v: unknown) => {
    const next = { ...entry };
    if (v === undefined) delete next[name];
    else next[name] = v;
    onChange(next);
  };
  const drop = (name: string) => {
    setShown(s => s.filter(n => n !== name));
    set(name, undefined);
  };
  const errorFor = (name: string) =>
    issues.find(i => i.path[0] === name)?.message;
  const addable = addableFields(shape, entry, shown);
  const extras = extraKeys(shape, entry);

  return (
    <Stack gap={0}>
      {visibleFields(shape, entry, shown).map(name => {
        const spec = shape.fields[name]!;
        const required = shape.required.includes(name);
        return (
          <Line
            key={name}
            name={
              <Text fz={12} ff="monospace">
                {spec.title ?? name}
              </Text>
            }
            hint={spec.description}
            error={errorFor(name)}
          >
            <FieldInput
              label={name}
              spec={spec}
              value={entry[name]}
              disabled={disabled}
              onChange={v => set(name, v)}
            />
            {!required && (
              <ActionIcon
                variant="subtle"
                color="gray"
                c={text.muted}
                size="sm"
                aria-label={`remove ${name}`}
                disabled={disabled}
                onClick={() => drop(name)}
              >
                <Icons.close size={14} />
              </ActionIcon>
            )}
          </Line>
        );
      })}
      {extras.map(name => (
        <Line
          key={name}
          name={
            <Text fz={12} ff="monospace" c={text.muted}>
              {name}
            </Text>
          }
        >
          <Code style={{ ...BLOCK_STYLE, maxWidth: 260 }}>
            {JSON.stringify(entry[name])}
          </Code>
        </Line>
      ))}
      {extras.length > 0 && (
        <Text fz={12} c={text.muted} py={4}>
          Read-only here and kept as they are; use Edit as JSON to change them.
        </Text>
      )}
      {addable.length > 0 && (
        <Group py={4}>
          <Menu position="bottom-start" withinPortal>
            <Menu.Target>
              <Button
                size="compact-xs"
                variant="subtle"
                disabled={disabled}
                leftSection={<Icons.plus size={12} />}
              >
                Add property
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {addable.map(name => (
                <Menu.Item
                  key={name}
                  onClick={() => setShown(s => [...s, name])}
                >
                  {shape.fields[name]!.title ?? name}
                </Menu.Item>
              ))}
            </Menu.Dropdown>
          </Menu>
        </Group>
      )}
    </Stack>
  );
}
