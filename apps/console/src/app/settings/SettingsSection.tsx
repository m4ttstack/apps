import { useState } from 'react';
import {
  Box,
  Group,
  SegmentedControl,
  Stack,
  Text,
  Title,
} from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';

import { useAgentModels } from '../config/useSettings';
import { ScopeDot } from './ScopeBadge';
import { SettingRow } from './SettingRow';
import type { RowStore } from './useRowSave';
import type { Section, StoreScope } from './view';

const SUBHEAD: Record<
  StoreScope,
  { label: string; note: string; color: string }
> = {
  team: {
    label: 'Team',
    note: 'shared with everyone through the team repo',
    color: 'var(--tk-text-purple-small)',
  },
  user: {
    label: 'You',
    note: 'your home repo, follows you to every machine',
    color: 'var(--tk-text-cyan-small)',
  },
  machine: {
    label: 'This machine',
    note: 'never leaves this Mac',
    color: 'var(--tk-text-accent-small)',
  },
};

type Provider = 'claude' | 'codex';

function Header({
  section,
  right,
}: {
  section: Section;
  right?: React.ReactNode;
}) {
  const { text } = useSchemeColors();
  return (
    <Stack gap={4} pt={28} pb={8}>
      <Group justify="space-between" wrap="nowrap">
        <Group gap={8}>
          <Title order={2} size={16} fw={700}>
            {section.group.label}
          </Title>
          <Text size="xs" ff="monospace" c={text.muted}>
            {section.total}
          </Text>
        </Group>
        {right}
      </Group>
      {section.group.blurb && (
        <Text size="xs" c={text.muted}>
          {section.group.blurb}
        </Text>
      )}
    </Stack>
  );
}

function AgentsSection({
  section,
  store,
  query,
}: {
  section: Section;
  store: RowStore;
  query: string;
}) {
  const all = section.subsections.flatMap(s => s.defs);
  const current = all.find(d => d.key === 'agent.provider')?.effective.value;
  const [provider, setProvider] = useState<Provider>(
    current === 'codex' ? 'codex' : 'claude'
  );
  const models = useAgentModels(provider);
  const suggestions = (models.data?.models ?? []).map(m => m.value);
  const defs = all.filter(
    d => d.key === 'agent.provider' || d.key.startsWith(`agent.${provider}.`)
  );
  return (
    <Box component="section" id="settings-agents">
      <Header
        section={section}
        right={
          <SegmentedControl
            size="xs"
            value={provider}
            onChange={v => setProvider(v as Provider)}
            data={[
              { value: 'claude', label: 'Claude' },
              { value: 'codex', label: 'Codex' },
            ]}
          />
        }
      />
      {defs.map(def => (
        <SettingRow
          key={def.key}
          def={def}
          store={store}
          subhead={null}
          query={query}
          suggestions={def.key.endsWith('.model') ? suggestions : undefined}
        />
      ))}
    </Box>
  );
}

export function SettingsSection({
  section,
  store,
  query,
}: {
  section: Section;
  store: RowStore;
  query: string;
}) {
  const { text } = useSchemeColors();
  if (section.group.id === 'agents')
    return <AgentsSection section={section} store={store} query={query} />;
  return (
    <Box component="section" id={`settings-${section.group.id}`}>
      <Header section={section} />
      {section.subsections.map(sub => (
        <Box key={sub.scope ?? 'all'}>
          {sub.scope && (
            <Group
              gap={8}
              pt={20}
              pb={6}
              style={{ borderBottom: '1px solid var(--tk-line-2)' }}
            >
              <ScopeDot scope={sub.scope} />
              <Text
                size="xs"
                fw={500}
                tt="uppercase"
                c={SUBHEAD[sub.scope].color}
              >
                {SUBHEAD[sub.scope].label}
              </Text>
              <Text size="xs" ff="monospace" c={text.muted}>
                {sub.defs.length}
              </Text>
              <Text size="xs" c={text.muted}>
                {SUBHEAD[sub.scope].note}
              </Text>
            </Group>
          )}
          {sub.defs.map(def => (
            <SettingRow
              key={def.key}
              def={def}
              store={store}
              subhead={sub.scope}
              query={query}
            />
          ))}
        </Box>
      ))}
    </Box>
  );
}
