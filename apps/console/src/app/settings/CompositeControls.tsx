import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import {
  Box,
  Button,
  Code,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Text,
  TextInput,
  UnstyledButton,
} from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import { Icons } from '@mattstack/app-kit/icons';
import {
  useSettingKey,
  type ExplainRowWire,
  type SettingDefWire,
} from '@mattstack/settings-kit/react';
import {
  addToList,
  getLeaf,
  matchesShape,
  SHAPES,
  summarize,
  targetScope,
  type LeafType,
  type RowKind,
} from '@mattstack/settings-kit/shapes';

import { ExpandToggle } from './ExpandToggle';
import { ScopeBadge } from './ScopeBadge';
import { unitOf } from './units';
import type { useRowSave } from './useRowSave';
import { fieldSource, isStoreScope, leafWrite } from './view';

type Row = ReturnType<typeof useRowSave>;
const INLINE_MAX_ITEMS = 3;
const INLINE_MAX_CHARS = 16;
const LEAVES_FIRST = 5;

const PREVIEW_STYLE = {
  background: 'var(--tk-inset)',
  fontSize: 'var(--mantine-font-size-xs)',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
} as const;

function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
  if (e.key === 'Enter') e.currentTarget.blur();
}

function Body({ children }: { children: ReactNode }) {
  return (
    <Box pl={16} pr={52} pb={14}>
      <Stack
        gap={0}
        pl={16}
        style={{ borderLeft: '1px solid var(--tk-line-2)' }}
      >
        {children}
      </Stack>
    </Box>
  );
}

function FieldRow({
  label,
  source,
  children,
}: {
  label: ReactNode;
  source?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Group gap={24} wrap="nowrap" mih={38}>
      <Group gap={8} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
        {label}
        {source}
      </Group>
      <Group w={260} gap={8} wrap="nowrap" style={{ flex: 'none' }}>
        {children}
      </Group>
    </Group>
  );
}

function strings(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string')
    : [];
}

function StringListBody({ def, row }: { def: SettingDefWire; row: Row }) {
  const list = strings(def.effective.value);
  const [draft, setDraft] = useState('');
  return (
    <Body>
      {list.map((item, i) => (
        <FieldRow
          key={`${i}:${item}`}
          label={
            <Text size="xs" ff="monospace">
              {item}
            </Text>
          }
        >
          <UnstyledButton
            aria-label={`remove ${item}`}
            onClick={() => void row.save(list.filter(x => x !== item))}
          >
            <Icons.close size={14} />
          </UnstyledButton>
        </FieldRow>
      ))}
      <Box py={6}>
        <TextInput
          aria-label={`add to ${def.key}`}
          size="xs"
          maw={360}
          ff="monospace"
          placeholder="add an item"
          value={draft}
          onTextChange={setDraft}
          onKeyDown={e => {
            if (e.key !== 'Enter') return;
            const next = addToList(list, draft);
            if (next) void row.save(next).then(ok => ok && setDraft(''));
          }}
        />
      </Box>
    </Body>
  );
}

function StringMapBody({
  def,
  row,
  labels,
}: {
  def: SettingDefWire;
  row: Row;
  labels: readonly [string, string];
}) {
  const map = (def.effective.value ?? {}) as Record<string, string>;
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  return (
    <Body>
      {Object.entries(map).map(([key, value]) => (
        <FieldRow
          key={key}
          label={
            <Text size="xs" ff="monospace" truncate>
              {key}
            </Text>
          }
        >
          {/* Uncontrolled so a refused save keeps the typed text; keyed on
              the seeded value so a refresh remounts it instead of leaving
              stale text that the next blur would write back. */}
          <TextInput
            key={value}
            aria-label={`${labels[1]} for ${key}`}
            size="xs"
            w={200}
            defaultValue={value}
            onKeyDown={blurOnEnter}
            onBlur={e => {
              const next = e.currentTarget.value.trim();
              if (next && next !== value)
                void row.save({ ...map, [key]: next });
            }}
          />
          <UnstyledButton
            aria-label={`remove ${key}`}
            onClick={() =>
              void row.save(
                Object.fromEntries(
                  Object.entries(map).filter(([other]) => other !== key)
                )
              )
            }
          >
            <Icons.close size={14} />
          </UnstyledButton>
        </FieldRow>
      ))}
      <Group gap={8} py={6} wrap="nowrap">
        <TextInput
          aria-label={`new ${labels[0]}`}
          size="xs"
          style={{ flex: 1 }}
          placeholder={labels[0]}
          value={k}
          onTextChange={setK}
        />
        <TextInput
          aria-label={`new ${labels[1]}`}
          size="xs"
          w={200}
          placeholder={labels[1]}
          value={v}
          onTextChange={setV}
        />
        <UnstyledButton
          aria-label={`add ${labels[0]}`}
          onClick={() => {
            if (!k.trim() || !v.trim()) return;
            void row
              .save({ ...map, [k.trim()]: v.trim() })
              .then(ok => ok && (setK(''), setV('')));
          }}
        >
          <Icons.plus size={14} />
        </UnstyledButton>
      </Group>
    </Body>
  );
}

/** Callers key this on `value`: the number and text inputs are
    uncontrolled, the same contract as ScalarControl. */
function LeafInput({
  label,
  type,
  value,
  placeholder,
  disabled,
  onSave,
}: {
  label: string;
  type: LeafType;
  value: unknown;
  placeholder?: string;
  disabled: boolean;
  onSave: (v: unknown) => void;
}) {
  const { text } = useSchemeColors();
  if (type === 'boolean')
    return (
      <Switch
        aria-label={label}
        disabled={disabled}
        checked={value === true}
        onChange={e => onSave(e.currentTarget.checked)}
      />
    );
  if (typeof type === 'object')
    return (
      <Select
        aria-label={label}
        disabled={disabled}
        size="xs"
        w={160}
        data={[...type.enum]}
        value={typeof value === 'string' ? value : null}
        allowDeselect={false}
        onChange={v => {
          if (v !== null && v !== value) onSave(v);
        }}
      />
    );
  if (type === 'number') {
    const unit = unitOf(label);
    return (
      <Group gap={8} wrap="nowrap">
        <NumberInput
          aria-label={label}
          disabled={disabled}
          size="xs"
          w={80}
          hideControls
          defaultValue={typeof value === 'number' ? value : undefined}
          onKeyDown={blurOnEnter}
          onBlur={e => {
            const raw = e.currentTarget.value.trim();
            const n = Number(raw);
            if (raw !== '' && Number.isFinite(n) && n !== value) onSave(n);
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
  return (
    <TextInput
      aria-label={label}
      disabled={disabled}
      size="xs"
      w={200}
      placeholder={placeholder}
      defaultValue={typeof value === 'string' ? value : ''}
      onKeyDown={blurOnEnter}
      onBlur={e => {
        const next = e.currentTarget.value;
        if (next !== (value ?? '')) onSave(next === '' ? undefined : next);
      }}
    />
  );
}

function LeavesBody({
  def,
  row,
  shape,
}: {
  def: SettingDefWire;
  row: Row;
  shape: {
    fields: Record<string, LeafType>;
    fallbacks?: Record<string, string>;
  };
}) {
  const { text } = useSchemeColors();
  const explained = useSettingKey(def.key);
  const [all, setAll] = useState(false);
  const paths = Object.keys(shape.fields);
  const shown = all ? paths : paths.slice(0, LEAVES_FIRST);
  const target = targetScope(def);

  // leafWrite rebuilds the target layer's own object from these rows, so they
  // must postdate the def's current scope and value and our last write, or a
  // leaf edit drops the fields a move or a previous edit just put there. The
  // kit raises `loading` only a render after refresh(), so staleness is
  // tracked against the rows array that was current when the def changed.
  const fingerprint = JSON.stringify([
    def.effective.scope,
    def.effective.value,
  ]);
  const [seen, setSeen] = useState(fingerprint);
  const [staleRows, setStaleRows] = useState<ExplainRowWire[] | null>(null);
  if (fingerprint !== seen) {
    setSeen(fingerprint);
    setStaleRows(explained.rows);
  }
  const { refresh } = explained;
  const mounted = useRef(false);
  useEffect(() => {
    if (mounted.current) refresh();
    mounted.current = true;
  }, [fingerprint, refresh]);
  const disabled =
    explained.loading ||
    explained.error !== null ||
    explained.rows === staleRows ||
    row.status === 'saving';
  return (
    <Body>
      {shown.map(path => {
        const source = fieldSource(explained.rows, path);
        const value = getLeaf(def.effective.value, path);
        return (
          <FieldRow
            key={path}
            label={
              <Text size="xs" ff="monospace">
                {path}
              </Text>
            }
            source={
              isStoreScope(source) ? (
                <ScopeBadge scope={source} moveTo={[]} onMove={() => {}} />
              ) : source ? (
                <Text size="xs" c={text.muted}>
                  {source}
                </Text>
              ) : null
            }
          >
            <LeafInput
              key={JSON.stringify(value) ?? ''}
              label={`${def.key}.${path}`}
              type={shape.fields[path]!}
              value={value}
              placeholder={shape.fallbacks?.[path]}
              disabled={disabled}
              onSave={v =>
                void row
                  .save(leafWrite(explained.rows, target, path, v))
                  .then(ok => {
                    if (!ok) return;
                    setStaleRows(explained.rows);
                    refresh();
                  })
              }
            />
          </FieldRow>
        );
      })}
      {paths.length > LEAVES_FIRST && !all && (
        <UnstyledButton onClick={() => setAll(true)} py={8}>
          <Text size="xs" fw={500} c="var(--tk-text-accent-small)">
            {paths.length - LEAVES_FIRST} more fields
          </Text>
        </UnstyledButton>
      )}
      {explained.error && (
        <Text size="xs" ff="monospace" c="var(--tk-text-bad-small)" py={6}>
          {explained.error}
        </Text>
      )}
    </Body>
  );
}

function UnsetText() {
  const { text } = useSchemeColors();
  return (
    <Text size="xs" c={text.muted} ff="monospace">
      unset
    </Text>
  );
}

function ReadonlyBody({ def }: { def: SettingDefWire }) {
  const { text } = useSchemeColors();
  const value = def.effective.value;
  return (
    <Body>
      {def.secret || value === undefined ? (
        <Text size="xs" ff="monospace" c={text.muted}>
          {def.secret ? '•••' : 'unset'}
        </Text>
      ) : (
        <Code block style={PREVIEW_STYLE}>
          {JSON.stringify(value, null, 2)}
        </Code>
      )}
      {def.effective.file && (
        <Text size="xs" ff="monospace" c={text.muted} pt={8}>
          {def.effective.file}
        </Text>
      )}
    </Body>
  );
}

/** Composite rows: the control column holds an inline editor or a summary
    toggle, and the body expands under the row. */
export function compositeParts(
  def: SettingDefWire,
  kind: RowKind,
  row: Row,
  open: boolean,
  onToggle: () => void
): { control: ReactNode; body: ReactNode } {
  const shape = SHAPES[def.key];
  const value = def.effective.value;
  const toggle = (
    <ExpandToggle label={summarize(def)} open={open} onToggle={onToggle} />
  );
  const readonly =
    value === undefined && !def.secret
      ? { control: <UnsetText />, body: null }
      : { control: toggle, body: open ? <ReadonlyBody def={def} /> : null };

  // Secret and unwritable keys can still carry a SHAPES entry; they must
  // reach neither an editor nor the Clear escape hatch.
  if (kind === 'readonly' || !shape) return readonly;

  if (
    shape.kind !== 'external' &&
    value !== undefined &&
    !matchesShape(shape, value)
  ) {
    const at = def.effective.scope;
    return {
      control: (
        <Group gap={8} wrap="nowrap">
          <Text size="xs" fw={500} c="var(--tk-text-bad-small)">
            unexpected shape
          </Text>
          {isStoreScope(at) && (
            <Button
              size="compact-xs"
              variant="default"
              onClick={() => void row.clear(at)}
            >
              Clear
            </Button>
          )}
        </Group>
      ),
      body: null,
    };
  }

  if (kind === 'stringList') {
    const list = strings(value);
    if (
      list.length <= INLINE_MAX_ITEMS &&
      list.every(x => x.length <= INLINE_MAX_CHARS)
    )
      return {
        control: (
          <TagsInput
            aria-label={def.key}
            size="xs"
            w={200}
            styles={{ inputField: { minWidth: 48 } }}
            value={list}
            onChange={next => void row.save(next)}
          />
        ),
        body: null,
      };
    return {
      control: toggle,
      body: open ? <StringListBody def={def} row={row} /> : null,
    };
  }
  if (kind === 'stringMap' && shape.kind === 'stringMap')
    return {
      control: toggle,
      body: open ? (
        <StringMapBody def={def} row={row} labels={shape.labels} />
      ) : null,
    };
  if (kind === 'leaves' && shape.kind === 'leaves')
    return {
      control: toggle,
      body: open ? <LeavesBody def={def} row={row} shape={shape} /> : null,
    };
  return readonly;
}
