import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Group,
  LazyLoader,
  PageShell,
  Paper,
  Select,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import { useSuspenseQuery } from '@tanstack/react-query';

import type { ExplainRowWire, SettingDefWire } from '../../server/settings';
import { client } from '../api';
import { PAGE_ROW_HEIGHT } from '../chrome';
import { analyzeChain } from '../config/chain';
import {
  useAgentModels,
  useSetSetting,
  useSettingsPrefix,
} from '../config/useSettings';

type Provider = 'claude' | 'codex';
type Scope = 'user' | 'machine';

type ExplainPayload = { def: SettingDefWire; rows: ExplainRowWire[] } | null;

/**
 * A key's current effective value, or `null` when the registry doesn't know
 * it yet -- the transitional state before rt-client republishes the
 * provider-scoped agent.* keys (see the page-level banner). Shares its query
 * key with `useExplainKey`/`useSetSetting` so a successful write here
 * refetches through the same invalidation, and it stays a suspense query
 * (like `useExplainKey`) so an uncontrolled field's `defaultValue` is never
 * set from a value that later arrives async.
 */
function useCurrentValue(key: string) {
  return useSuspenseQuery({
    queryKey: ['settings', 'explain', key],
    queryFn: async (): Promise<ExplainPayload> => {
      const res = await client.api.settings.explain[':key'].$get({
        param: { key },
      });
      // The route's only non-200 response is 404 (unknown key) -- treated
      // as "unset" here rather than thrown, so a key the registry doesn't
      // know yet degrades this field instead of blanking the whole page.
      if (!res.ok) return null;
      return res.json();
    },
  });
}

function winnerValue(explain: ExplainPayload): unknown {
  if (!explain) return undefined;
  const verdict = analyzeChain(explain.def, explain.rows);
  return verdict.kind === 'scalar' ? verdict.winner?.value : undefined;
}

function stringValue(explain: ExplainPayload): string {
  const value = winnerValue(explain);
  return typeof value === 'string' ? value : '';
}

function boolValue(explain: ExplainPayload): boolean {
  return winnerValue(explain) === true;
}

/** Which layer currently wins for this field -- 'user' or 'machine' when a
    real scope wins, null when nothing does (default/unset/pending). Used
    only to seed each field's own write-scope control on first render; the
    control itself is what a viewer reads to know where their next edit for
    THIS field goes, replacing a page-wide "Write to" that gave no per-field
    reminder of where it was pointed. */
function winningScope(explain: ExplainPayload): Scope | null {
  if (!explain) return null;
  const verdict = analyzeChain(explain.def, explain.rows);
  if (verdict.kind !== 'scalar' || !verdict.winner) return null;
  return verdict.winner.scope === 'machine' ? 'machine' : 'user';
}

/** Each field's write-scope control starts wherever its value currently
    resolves from (so opening the page shows where each setting already
    lives), and 'user' otherwise -- never a shared, page-wide default that
    can be left pointed at 'machine' from a previous visit and forgotten. */
function useFieldScope(explain: ExplainPayload) {
  return useState<Scope>(() => winningScope(explain) ?? 'user');
}

const SCOPE_OPTIONS = [
  { label: 'user', value: 'user' },
  { label: 'machine', value: 'machine' },
];

/** One label + per-field write-scope control over an input, capping the
    control's width so it reads as a settings row instead of a full-bleed
    input. The scope control both shows and sets where THIS field's next
    write goes -- there is no page-wide scope selector to lose track of. */
function SettingRow({
  label,
  scope,
  onScopeChange,
  children,
}: {
  label: string;
  scope: Scope;
  onScopeChange: (scope: Scope) => void;
  children: ReactNode;
}) {
  return (
    <Box maw={360}>
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <SegmentedControl
          aria-label={`${label} scope`}
          size="xs"
          data={SCOPE_OPTIONS}
          value={scope}
          onChange={v => onScopeChange(v as Scope)}
        />
      </Group>
      {children}
    </Box>
  );
}

function ProviderModelField({ provider }: { provider: Provider }) {
  const key = `agent.${provider}.model`;
  const { data } = useAgentModels(provider);
  const current = useCurrentValue(key);
  const [scope, setScope] = useFieldScope(current.data);
  const mutation = useSetSetting(key);
  const options = (data?.models ?? []).map(m => ({
    value: m.value,
    label: m.label,
  }));
  return (
    <SettingRow label="Model" scope={scope} onScopeChange={setScope}>
      <Select
        key={key}
        aria-label="Model"
        placeholder="provider default"
        data={options}
        defaultValue={stringValue(current.data) || null}
        searchable
        clearable
        onChange={next => mutation.mutate({ value: next ?? undefined, scope })}
      />
    </SettingRow>
  );
}

function AgentDefaultsPageContent() {
  const { bg, border } = useSchemeColors();
  const { data: defsData, error: defsError } = useSettingsPrefix('agent.');
  const defs = defsData?.defs;
  const schemaReady = defs?.some(d => d.key === 'agent.provider') ?? true;

  const providerExplain = useCurrentValue('agent.provider');
  const [providerScope, setProviderScope] = useFieldScope(
    providerExplain.data
  );
  const providerMutation = useSetSetting('agent.provider');
  const provider = (stringValue(providerExplain.data) || 'claude') as Provider;

  const effortKey = `agent.${provider}.effort`;
  const extraArgsKey = `agent.${provider}.extraArgs`;
  const yoloKey = `agent.${provider}.yolo`;

  const effortExplain = useCurrentValue(effortKey);
  const accountExplain = useCurrentValue('agent.claude.account');
  const extraArgsExplain = useCurrentValue(extraArgsKey);
  const yoloExplain = useCurrentValue(yoloKey);

  const [effortScope, setEffortScope] = useFieldScope(effortExplain.data);
  const [accountScope, setAccountScope] = useFieldScope(accountExplain.data);
  const [extraArgsScope, setExtraArgsScope] = useFieldScope(
    extraArgsExplain.data
  );
  const [yoloScope, setYoloScope] = useFieldScope(yoloExplain.data);

  const effortMutation = useSetSetting(effortKey);
  const accountMutation = useSetSetting('agent.claude.account');
  const extraArgsMutation = useSetSetting(extraArgsKey);
  const yoloMutation = useSetSetting(yoloKey);

  return (
    <Paper
      bg={bg.level4}
      radius="md"
      p="xl"
      maw={620}
      mx="auto"
      mt="xl"
      style={{ border: `1px solid ${border.default}` }}
    >
      <Stack gap="md" data-testid="agent-defaults">
        <Title order={3}>Agent defaults</Title>
        <Text size="sm">
          These apply to every future <code>rt agent start</code> that does not
          pass its own flag. Each field&apos;s <code>user</code>/
          <code>machine</code> control picks where THAT field&apos;s next
          change is written.
        </Text>
        {defsError && <Alert color="red">{(defsError as Error).message}</Alert>}
        {!schemaReady && (
          <Alert color="yellow" data-testid="schema-pending-alert">
            This build&apos;s settings registry doesn&apos;t have the
            provider-scoped <code>agent.*</code> keys yet (pending an{' '}
            <code>@mattstack/rt-client</code> publish) -- changes below may not
            persist until it lands.
          </Alert>
        )}
        <SimpleGrid cols={2} spacing="md">
          <SettingRow
            label="Default agent"
            scope={providerScope}
            onScopeChange={setProviderScope}
          >
            <Select
              aria-label="Default agent"
              data={[
                { value: 'claude', label: 'Claude' },
                { value: 'codex', label: 'Codex' },
              ]}
              value={provider}
              allowDeselect={false}
              onChange={v =>
                providerMutation.mutate({
                  value: v ?? 'claude',
                  scope: providerScope,
                })
              }
            />
          </SettingRow>
          <ProviderModelField provider={provider} />
          <SettingRow
            label="Effort"
            scope={effortScope}
            onScopeChange={setEffortScope}
          >
            <TextInput
              key={effortKey}
              aria-label="Effort"
              placeholder={
                provider === 'codex'
                  ? 'e.g. medium, high'
                  : 'e.g. low, medium, high'
              }
              defaultValue={stringValue(effortExplain.data)}
              onBlur={e =>
                effortMutation.mutate({
                  value: e.currentTarget.value || undefined,
                  scope: effortScope,
                })
              }
            />
          </SettingRow>
          {provider === 'claude' && (
            <SettingRow
              label="Account"
              scope={accountScope}
              onScopeChange={setAccountScope}
            >
              <TextInput
                aria-label="Account"
                placeholder="cswap account email; unset uses default"
                defaultValue={stringValue(accountExplain.data)}
                onBlur={e =>
                  accountMutation.mutate({
                    value: e.currentTarget.value || undefined,
                    scope: accountScope,
                  })
                }
              />
            </SettingRow>
          )}
          <SettingRow
            label="Extra args"
            scope={extraArgsScope}
            onScopeChange={setExtraArgsScope}
          >
            <TextInput
              key={extraArgsKey}
              aria-label="Extra args"
              placeholder="raw flags appended to every launch"
              defaultValue={stringValue(extraArgsExplain.data)}
              onBlur={e =>
                extraArgsMutation.mutate({
                  value: e.currentTarget.value || undefined,
                  scope: extraArgsScope,
                })
              }
            />
          </SettingRow>
        </SimpleGrid>
        <Group justify="space-between" maw={360}>
          <Switch
            key={yoloKey}
            label="Bypass permission prompts (--yolo)"
            defaultChecked={boolValue(yoloExplain.data)}
            onChange={e =>
              yoloMutation.mutate({
                value: e.currentTarget.checked,
                scope: yoloScope,
              })
            }
          />
          <SegmentedControl
            aria-label="Bypass permission prompts scope"
            size="xs"
            data={SCOPE_OPTIONS}
            value={yoloScope}
            onChange={v => setYoloScope(v as Scope)}
          />
        </Group>
      </Stack>
    </Paper>
  );
}

export function AgentDefaultsPage() {
  return (
    <PageShell title="Settings" headerHeight={PAGE_ROW_HEIGHT} compactHeader>
      <LazyLoader>
        <AgentDefaultsPageContent />
      </LazyLoader>
    </PageShell>
  );
}
