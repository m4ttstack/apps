import { useState } from 'react';
import {
  Alert,
  LazyLoader,
  PageShell,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mattstack/app-kit/core';
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
    <Select
      key={key}
      label="Model"
      placeholder="provider default"
      data={options}
      defaultValue={stringValue(current.data) || null}
      searchable
      clearable
      onChange={next => mutation.mutate({ value: next ?? undefined, scope })}
    />
  );
}

function AgentDefaultsPageContent() {
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
    <Stack gap="lg" p="lg" data-testid="agent-defaults">
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
        data={[
          { value: 'user', label: 'this developer (user)' },
          { value: 'machine', label: 'this machine only' },
        ]}
        value={scope}
        allowDeselect={false}
        onChange={v => setScope((v as Scope) ?? 'user')}
      />
      <Select
        label="Default agent"
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
      <ProviderModelField provider={provider} scope={scope} />
      <TextInput
        key={effortKey}
        label="Effort"
        placeholder={
          provider === 'codex' ? 'e.g. medium, high' : 'e.g. low, medium, high'
        }
        defaultValue={stringValue(effortExplain.data)}
        onBlur={e =>
          effortMutation.mutate({
            value: e.currentTarget.value || undefined,
            scope,
          })
        }
      />
      {provider === 'claude' && (
        <TextInput
          label="Account"
          placeholder="cswap account email; unset uses the default profile"
          defaultValue={stringValue(accountExplain.data)}
          onBlur={e =>
            accountMutation.mutate({
              value: e.currentTarget.value || undefined,
              scope,
            })
          }
        />
      )}
      <TextInput
        key={extraArgsKey}
        label="Extra args"
        placeholder="raw flags appended to every launch"
        defaultValue={stringValue(extraArgsExplain.data)}
        onBlur={e =>
          extraArgsMutation.mutate({
            value: e.currentTarget.value || undefined,
            scope,
          })
        }
      />
      <Switch
        key={yoloKey}
        label="Bypass permission prompts (--yolo)"
        defaultChecked={boolValue(yoloExplain.data)}
        onChange={e =>
          yoloMutation.mutate({ value: e.currentTarget.checked, scope })
        }
      />
    </Stack>
  );
}

export function AgentDefaultsPage() {
  return (
    <PageShell
      title="Agent defaults"
      headerHeight={PAGE_ROW_HEIGHT}
      compactHeader
    >
      <LazyLoader>
        <AgentDefaultsPageContent />
      </LazyLoader>
    </PageShell>
  );
}
