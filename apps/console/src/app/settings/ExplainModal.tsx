import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Group,
  Modal,
  Skeleton,
  Stack,
  Text,
  Tooltip,
} from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import { Icons } from '@mattstack/app-kit/icons';
import {
  useSettingKey,
  useSettingsScope,
  type ExplainRowWire,
  type SettingDefWire,
  type SettingsScopeState,
} from '@mattstack/settings-kit/react';

import { analyzeChain, shortValue } from '../config/chain';
import { useAgentModels } from '../config/useSettings';
import { useEditorHref } from '../editorHref';
import { ScopeBadge } from './ScopeBadge';
import { SettingRow } from './SettingRow';
import { useRowSave, type RowStore } from './useRowSave';
import { firstSentence, isStoreScope } from './view';

export type ExplainStore = Pick<
  SettingsScopeState,
  'defs' | 'loading' | 'error' | 'set' | 'unset' | 'move'
>;

const MODAL_WIDTH = 760;
const SCOPE_COL = 88;

type Role = 'winner' | 'overridden' | 'contributor' | 'inert';

function modelSuggestionsFor(key: string): 'claude' | 'codex' | null {
  const m = /^agent\.(claude|codex)\..*model$/.exec(key);
  return m ? (m[1] as 'claude' | 'codex') : null;
}

function Suggested({
  provider,
  children,
}: {
  provider: 'claude' | 'codex';
  children: (suggestions: string[]) => ReactNode;
}) {
  const models = useAgentModels(provider);
  return <>{children((models.data?.models ?? []).map(m => m.value))}</>;
}

function LayerLine({
  def,
  row,
  role,
  onRemove,
  busy,
}: {
  def: SettingDefWire;
  row: ExplainRowWire;
  role: Role;
  onRemove: (scope: string) => void;
  busy: boolean;
}) {
  const { text } = useSchemeColors();
  const editorHref = useEditorHref();
  const scope = row.scope;
  const store = isStoreScope(scope) ? scope : null;
  const allowed = store !== null && def.scopes.includes(store);
  const removable = row.present && def.writable && allowed && !def.secret;

  return (
    <Box
      py={10}
      data-testid={`layer-${scope}`}
      style={{ borderBottom: '1px solid var(--tk-border-soft)' }}
    >
      <Group gap={12} wrap="nowrap" mih={28}>
        <Box w={SCOPE_COL} style={{ flex: 'none' }}>
          {store ? (
            <ScopeBadge scope={store} />
          ) : (
            <Text fz={12} fw={500} c={text.muted}>
              {scope}
            </Text>
          )}
        </Box>
        <Box style={{ flex: 1, minWidth: 0 }}>
          {!row.present ? (
            <Text fz={12} c={text.muted}>
              not set
            </Text>
          ) : def.secret ? (
            <Text fz={12} c={text.muted}>
              present, never shown here
            </Text>
          ) : (
            <Text
              fz={13}
              ff="monospace"
              truncate
              c={role === 'overridden' ? text.muted : undefined}
              td={role === 'overridden' ? 'line-through' : undefined}
              data-testid={`layer-value-${scope}`}
            >
              {shortValue(row.value)}
            </Text>
          )}
        </Box>
        <Group gap={6} wrap="nowrap" style={{ flex: 'none' }}>
          {role === 'winner' && (
            <Badge size="sm" variant="light" tt="none" fw={500}>
              wins
            </Badge>
          )}
          {role === 'contributor' && (
            <Badge size="sm" variant="light" tt="none" fw={500}>
              contributes
            </Badge>
          )}
          {row.shadowed && (
            <Badge size="sm" variant="light" color="warn" tt="none" fw={500}>
              ignored, teamLocked
            </Badge>
          )}
          {row.invalid && (
            <Badge size="sm" variant="light" color="bad" tt="none" fw={500}>
              refused
            </Badge>
          )}
        </Group>
        <Box w={28} style={{ flex: 'none' }}>
          {removable && (
            <Tooltip label={`Remove from ${scope}`}>
              <ActionIcon
                variant="subtle"
                color="gray"
                c={text.muted}
                disabled={busy}
                aria-label={`remove ${def.key} from ${scope}`}
                onClick={() => onRemove(scope)}
              >
                <Icons.trash size={14} />
              </ActionIcon>
            </Tooltip>
          )}
        </Box>
      </Group>
      <Stack gap={2} pl={SCOPE_COL + 12} pt={2}>
        {row.invalid && (
          <Text fz={12} ff="monospace" c="var(--tk-text-bad-small)">
            {row.invalid}
          </Text>
        )}
        {store && !allowed && (
          <Text fz={12} c={text.muted}>
            {`not allowed at this layer (allowed: ${def.scopes.join(', ')})`}
          </Text>
        )}
        {row.file === null ? (
          <Text fz={12} ff="monospace" c={text.dimmed}>
            registry default
          </Text>
        ) : (
          <Anchor
            href={editorHref(row.file)}
            fz={12}
            ff="monospace"
            c={text.dimmed}
            truncate
            aria-label={`open ${row.file}`}
          >
            {row.file}
          </Anchor>
        )}
      </Stack>
    </Box>
  );
}

function ExplainBody({ def, store }: { def: SettingDefWire; store: RowStore }) {
  const { text } = useSchemeColors();
  const explained = useSettingKey(def.key);
  const { refresh } = explained;
  // Every write re-reads the layer stack, so the rows below never disagree
  // with the control above.
  const tracked: RowStore = {
    set: async (...a) => after(await store.set(...a)),
    unset: async (...a) => after(await store.unset(...a)),
    move: async (...a) => after(await store.move(...a)),
  };
  function after(err: string | null) {
    if (err === null) refresh();
    return err;
  }
  const layers = useRowSave(tracked, def);
  const provider = modelSuggestionsFor(def.key);
  const rows = explained.rows;
  const verdict = rows.length > 0 ? analyzeChain(def, rows) : null;
  const roleOf = (row: ExplainRowWire): Role => {
    if (!verdict) return 'inert';
    if (verdict.kind === 'composite')
      return verdict.contributors.includes(row) ? 'contributor' : 'inert';
    if (verdict.winner === row) return 'winner';
    return verdict.overridden.includes(row) ? 'overridden' : 'inert';
  };
  const rest = def.description.slice(firstSentence(def.description).length);

  const row = (suggestions?: string[]) => (
    <SettingRow
      def={def}
      store={tracked}
      subhead={null}
      query=""
      suggestions={suggestions}
    />
  );

  return (
    <Stack gap={0}>
      {provider ? <Suggested provider={provider}>{row}</Suggested> : row()}
      <Stack gap={8} pt={20}>
        {rest.trim() !== '' && (
          <Text fz={12} c={text.muted}>
            {def.description}
          </Text>
        )}
        {verdict && (
          <Text fz={14} data-testid="explain-sentence">
            {verdict.sentence}
          </Text>
        )}
        {verdict?.kind === 'composite' && (
          <Text fz={12} c={text.muted}>
            Deep merge, key by key. Lists replace whole: an array is a leaf,
            never merged.
          </Text>
        )}
        {def.secret && (
          <Alert variant="light" icon={<Icons.warning size={14} />}>
            <Text fz={12}>
              Secret key: the console shows presence and store only. Rotate with{' '}
              <Text span ff="monospace" fz={12}>
                {`rt secrets rotate ${def.key.split('.')[0]} ${def.key.split('.').slice(1).join('.')}`}
              </Text>
              ; the value is prompted, never a CLI argument.
            </Text>
          </Alert>
        )}
      </Stack>
      <Group
        gap={8}
        pt={22}
        pb={6}
        wrap="nowrap"
        style={{ borderBottom: '1px solid var(--tk-line-2)' }}
      >
        <Text fz={12} fw={500} tt="uppercase" lts={0.6} c={text.muted}>
          Layers
        </Text>
        <Text fz={12} c={text.muted}>
          · weakest first, the last set layer wins
        </Text>
      </Group>
      {explained.error ? (
        <Alert color="bad" variant="light" mt="md">
          <Text fz={12}>{explained.error}</Text>
        </Alert>
      ) : rows.length === 0 ? (
        <Stack gap={10} pt={12}>
          {[0, 1, 2].map(i => (
            <Skeleton key={i} h={36} />
          ))}
        </Stack>
      ) : (
        rows.map(r => (
          <LayerLine
            key={`${r.scope}:${r.file ?? 'default'}`}
            def={def}
            row={r}
            role={roleOf(r)}
            busy={layers.status === 'saving'}
            onRemove={scope => void layers.clear(scope)}
          />
        ))
      )}
      {layers.error && (
        <Text fz={12} ff="monospace" c="var(--tk-text-bad-small)" pt={8}>
          {layers.error}
        </Text>
      )}
    </Stack>
  );
}

/** Keeps the last open key through the close transition, so the modal
    fades out with its content instead of emptying first. */
function useLastKey(key: string | null): string | null {
  const last = useRef(key);
  if (key !== null) last.current = key;
  return last.current;
}

/**
 * Why is this value this? The settings row itself, so the value is edited
 * with the same control as on /settings, then the resolver's sentence and
 * every layer, weakest first. Mounted by each page that links here, with
 * that page's store, so a write shows on the page behind it at once.
 */
export function ExplainModal({
  settingKey,
  store,
  onClose,
}: {
  settingKey: string | null;
  store: ExplainStore;
  onClose: () => void;
}) {
  const { text, bg } = useSchemeColors();
  const key = useLastKey(settingKey);
  const def = key === null ? undefined : store.defs.find(d => d.key === key);
  const [openedAt, setOpenedAt] = useState(() => new Date());
  useEffect(() => {
    if (settingKey !== null) setOpenedAt(new Date());
  }, [settingKey]);
  const surface = { background: bg.level3 };

  return (
    <Modal
      opened={settingKey !== null}
      onClose={onClose}
      size={MODAL_WIDTH}
      padding="lg"
      styles={{
        content: surface,
        header: { ...surface, borderBottom: '1px solid var(--tk-border-soft)' },
      }}
      title={
        <Group gap={6} wrap="nowrap">
          <Text fz={12} ff="monospace" c={text.muted}>
            {`>_ rt settings explain ${key ?? ''}`}
          </Text>
          <Text fz={12} c={text.muted}>
            {`· as of ${openedAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          </Text>
        </Group>
      }
    >
      {def ? (
        <ExplainBody key={def.key} def={def} store={store} />
      ) : store.error ? (
        <Alert color="bad" variant="light">
          <Text fz={12}>{store.error}</Text>
        </Alert>
      ) : store.loading ? (
        <Stack gap={10}>
          <Skeleton h={48} />
          <Skeleton h={36} />
          <Skeleton h={36} />
        </Stack>
      ) : (
        <Text fz={14} c={text.muted}>
          {`No setting named ${key ?? ''} is registered.`}
        </Text>
      )}
    </Modal>
  );
}

function OwnStoreModal({
  settingKey,
  onClose,
}: {
  settingKey: string;
  onClose: () => void;
}) {
  const scope = useSettingsScope(settingKey);
  return (
    <ExplainModal settingKey={settingKey} store={scope} onClose={onClose} />
  );
}

/** For pages with no settings store of their own: loads just this key. */
export function StandaloneExplainModal({
  settingKey,
  onClose,
}: {
  settingKey: string | null;
  onClose: () => void;
}) {
  return settingKey === null ? null : (
    <OwnStoreModal settingKey={settingKey} onClose={onClose} />
  );
}
