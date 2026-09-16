import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  Alert,
  Badge,
  Box,
  Group,
  LazyLoader,
  PageShell,
  Paper,
  Select,
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

/** Which layer currently wins for this field, for the badge beside its
    label -- "default" / "unset" when nothing overrides the registry,
    "pending" while the registry doesn't know the key yet (see the
    page-level schema-pending banner). */
function fieldScope(explain: ExplainPayload): string {
  if (!explain) return 'pending';
  const verdict = analyzeChain(explain.def, explain.rows);
  if (verdict.kind !== 'scalar') return '—';
  if (!verdict.winner) return explain.def.hasDefault ? 'default' : 'unset';
  return verdict.winner.scope;
}

function scopeBadgeColor(scope: string): string {
  return scope === 'user' || scope === 'machine' ? 'blue' : 'gray';
}

/** One label+scope-badge header over a control, capping the control's width
    so it reads as a settings row instead of a full-bleed input. */
function SettingRow({
  label,
  scope,
  children,
}: {
  label: string;
  scope: string;
  children: ReactNode;
}) {
  return (
    <Box maw={360}>
      <Group justify="space-between" mb={4} wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        <Badge size="sm" variant="light" color={scopeBadgeColor(scope)}>
          {scope}
        </Badge>
      </Group>
      {children}
    </Box>
  );
}

function ProviderModelField({
  provider,
  scope,
}: {
  provider: Provider;
  scope: Scope;
}) {
  const key = `agent.${provider}.model`;
  const { data } = useAgentModels(provider);
  const current = useCurrentValue(key);
  const mutation = useSetSetting(key);
  const options = (data?.models ?? []).map(m => ({
    value: m.value,
    label: m.label,
  }));
  return (
    <SettingRow label="Model" scope={fieldScope(current.data)}>
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
  const [scope, setScope] = useState<Scope>('user');
  const { data: defsData, error: defsError } = useSettingsPrefix('agent.');
  const defs = defsData?.defs;
  const schemaReady = defs?.some(d => d.key === 'agent.provider') ?? true;

  const providerExplain = useCurrentValue('agent.provider');
  const providerMutation = useSetSetting('agent.provider');
  const provider = (stringValue(providerExplain.data) || 'claude') as Provider;

  const effortKey = `agent.${provider}.effort`;
  const extraArgsKey = `agent.${provider}.extraArgs`;
  const yoloKey = `agent.${provider}.yolo`;

  const effortExplain = useCurrentValue(effortKey);
  const accountExplain = useCurrentValue('agent.claude.account');
  const extraArgsExplain = useCurrentValue(extraArgsKey);
  const yoloExplain = useCurrentValue(yoloKey);

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
          pass its own flag.
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
        <Select
          label="Write to"
          maw={200}
          data={[
            { value: 'user', label: 'this developer (user)' },
            { value: 'machine', label: 'this machine only' },
          ]}
          value={scope}
          allowDeselect={false}
          onChange={v => setScope((v as Scope) ?? 'user')}
        />
        <SimpleGrid cols={2} spacing="md">
          <SettingRow
            label="Default agent"
            scope={fieldScope(providerExplain.data)}
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
                providerMutation.mutate({ value: v ?? 'claude', scope })
              }
            />
          </SettingRow>
          <ProviderModelField provider={provider} scope={scope} />
          <SettingRow label="Effort" scope={fieldScope(effortExplain.data)}>
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
                  scope,
                })
              }
            />
          </SettingRow>
          {provider === 'claude' && (
            <SettingRow label="Account" scope={fieldScope(accountExplain.data)}>
              <TextInput
                aria-label="Account"
                placeholder="cswap account email; unset uses default"
                defaultValue={stringValue(accountExplain.data)}
                onBlur={e =>
                  accountMutation.mutate({
                    value: e.currentTarget.value || undefined,
                    scope,
                  })
                }
              />
            </SettingRow>
          )}
          <SettingRow
            label="Extra args"
            scope={fieldScope(extraArgsExplain.data)}
          >
            <TextInput
              key={extraArgsKey}
              aria-label="Extra args"
              placeholder="raw flags appended to every launch"
              defaultValue={stringValue(extraArgsExplain.data)}
              onBlur={e =>
                extraArgsMutation.mutate({
                  value: e.currentTarget.value || undefined,
                  scope,
                })
              }
            />
          </SettingRow>
        </SimpleGrid>
        <Group gap="sm">
          <Switch
            key={yoloKey}
            label="Bypass permission prompts (--yolo)"
            defaultChecked={boolValue(yoloExplain.data)}
            onChange={e =>
              yoloMutation.mutate({ value: e.currentTarget.checked, scope })
            }
          />
          <Badge
            size="sm"
            variant="light"
            color={scopeBadgeColor(fieldScope(yoloExplain.data))}
          >
            {fieldScope(yoloExplain.data)}
          </Badge>
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
