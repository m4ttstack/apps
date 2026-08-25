import type { BranchEnrichment } from '@mattstack/rt-client';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';

import { ActionIcon, Group, Menu, Stack, Text } from '@ui/core';
import { useClipboard, useSchemeColors } from '@ui/hooks';
import { Icons } from '@ui/icons';
import { notifications } from '@ui/notifications';
import { client } from '../api';
import { navigate } from '../router/navigation';
import { agingWarning } from './aging';
import type { BoardRun } from './bands';
import { LivenessChip } from './LivenessChip';
import { repoLabel } from './repoLabel';
import { StageProgress } from './StageProgress';

function formatElapsed(startedAt: number, endedAt: number | null): string {
  const ms = Math.max(0, (endedAt ?? Date.now()) - startedAt);
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** `RunSummary` denormalizes only `ticket`/`branch` for the list; `worktree`
    lives in `RunDetail.fields` and is fetched on demand here rather than
    guessed from `branch` -- a wrong guess would send someone to a path that
    doesn't exist. Routed through `queryClient.fetchQuery` under the same
    `['run', repo, runId]` key `useRun` uses, so a second copy shares the
    first fetch instead of hitting the daemon again. `staleTime` is what
    makes that sharing real: without it the default `staleTime: 0` would
    still refetch on the second click even though the query key matches. */
async function fetchWorktreePath(
  queryClient: QueryClient,
  repo: string,
  runId: string
): Promise<string | null> {
  const detail = await queryClient.fetchQuery({
    queryKey: ['run', repo, runId],
    staleTime: 30_000,
    queryFn: async () => {
      const res = await client.api.runs[':repo'][':runId'].$get({
        param: { repo, runId },
      });
      if (!res.ok) throw new Error(`run detail failed: ${res.status}`);
      return res.json();
    },
  });
  return detail.fields.find(f => f.key === 'worktree')?.value ?? null;
}

export interface RunRowProps {
  run: BoardRun;
  /** Retention window in days, when known -- only the board passes this, so
      only board rows carry the aging warning (search states the window
      itself, once, rather than repeating it per row). */
  pruneDays?: number;
  /** This row's entry from the batched `/api/runs/enrich` join, keyed by
      `run.branch` at the board level -- absent for a branch the daemon has
      no cached Linear/MR data for yet, not only for a fetch that hasn't
      landed. */
  enrichment?: BranchEnrichment;
}

export function RunRow({ run, pruneDays, enrichment }: RunRowProps) {
  const { bg, text, border } = useSchemeColors();
  const clipboard = useClipboard();
  const queryClient = useQueryClient();
  const detailHref = `/runs/${run.repo}/${run.id}`;
  const aging = agingWarning(run, pruneDays);

  const title = enrichment?.ticket?.title;
  const mr = enrichment?.mr;
  const mrUrl = mr?.webUrl ?? null;
  const ticketUrl = enrichment?.ticket?.url ?? null;

  const stageName = run.current_stage ?? 'not started';
  // RunSummary's `stages` (list view) carry only name/status -- no per-stage
  // timestamp, unlike the detail view's `RunStageRow` -- so `last_event_at`
  // is the closest available proxy for how long the run has sat here.
  const stageElapsed = formatElapsed(run.last_event_at, run.ended_at);

  async function handleCopyWorktree() {
    try {
      const value = await fetchWorktreePath(queryClient, run.repo, run.id);
      if (!value) {
        notifications.info('No worktree recorded for this run yet.');
        return;
      }
      clipboard.copy(value);
    } catch (err) {
      notifications.error(
        `Could not copy worktree path: ${(err as Error).message}`
      );
    }
  }

  function handleCopyBranch() {
    if (!run.branch) return;
    clipboard.copy(run.branch);
  }

  function handleOpenMr() {
    if (!mrUrl) return;
    window.open(mrUrl, '_blank', 'noopener');
  }

  function handleOpenTicket() {
    if (!ticketUrl) return;
    window.open(ticketUrl, '_blank', 'noopener');
  }

  return (
    <Group
      data-testid={`run-row-${run.id}`}
      wrap="nowrap"
      justify="space-between"
      align="center"
      bg={bg.level2}
      p="sm"
      onClick={() => navigate(detailHref)}
      style={{
        borderRadius: 6,
        border: `1px solid ${border.default}`,
        cursor: 'pointer',
        // Seen-but-unresolved rows sink to the bottom of their band; opacity
        // (not a different color) is what marks them de-emphasised so the
        // palette stays intact.
        opacity: run.seen ? 0.6 : 1,
      }}
    >
      <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
        <Group gap="xs" wrap="nowrap">
          <Text fw={700} fz={14} c={text.highContrast('accent')} truncate>
            {run.ticket ?? run.id}
          </Text>
          {title && (
            <Text c={text.normal} fz={13} truncate style={{ minWidth: 0 }}>
              {title}
            </Text>
          )}
        </Group>
        <Text c={text.muted} fz={11} truncate>
          {repoLabel(run.repo)} · {run.branch ?? 'no branch'}
          {mr && ` · MR !${mr.iid} ${mr.state}`}
        </Text>
        {aging && (
          <Text
            c={text.highContrast('warn')}
            fz={11}
            data-testid="aging-warning"
          >
            {aging}
          </Text>
        )}
      </Stack>

      <Stack gap={4} style={{ width: 300, flexShrink: 0 }}>
        <Group gap="xs" wrap="nowrap">
          <Text fw={700} fz={14}>
            {stageName}
          </Text>
          <Text c={text.muted} fz={12}>
            {stageElapsed}
          </Text>
        </Group>
        <StageProgress stages={run.stages} />
      </Stack>

      <Group gap="xs" wrap="nowrap">
        <LivenessChip run={run} />
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon
              variant="subtle"
              color="gray"
              aria-label="run actions"
              onClick={event => event.stopPropagation()}
            >
              <Icons.moreHorizontal size={16} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item disabled={!mrUrl} onClick={handleOpenMr}>
              Open MR
            </Menu.Item>
            <Menu.Item disabled={!ticketUrl} onClick={handleOpenTicket}>
              Open ticket
            </Menu.Item>
            <Menu.Item onClick={() => void handleCopyWorktree()}>
              Copy worktree path
            </Menu.Item>
            <Menu.Item disabled={!run.branch} onClick={handleCopyBranch}>
              Copy branch
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
