import type { RunSummary } from '@mattstack/rt-client';

import { Box } from '@ui/core';
import type { MantineColor } from '@ui/core';
import { useSchemeColors } from '@ui/hooks';

export type LivenessState =
  | 'blocked'
  | 'failed'
  | 'stale'
  | 'stranded'
  | 'driven'
  | 'idle'
  | 'running'
  | 'done';

export interface LivenessSpec {
  state: LivenessState;
  color: MantineColor;
  label: string;
}

/**
 * Precedence is a ladder, not independent conditions: `attention.reason`
 * (rt's own predicate) outranks agent status, which outranks the run's own
 * status. Each rung fires on the first match, so a blocked run never falls
 * through to its agent's status even when they'd disagree.
 */
export function livenessSpec(run: RunSummary): LivenessSpec {
  const { attention, agent } = run;

  if (attention.reason === 'blocked') {
    return {
      state: 'blocked',
      color: 'bad',
      label: agent?.pane ? `waiting on you · ${agent.pane}` : 'waiting on you',
    };
  }
  if (attention.reason === 'failed') {
    return { state: 'failed', color: 'bad', label: 'failed' };
  }
  if (attention.reason === 'stale') {
    // Evidence enumerates every rung the liveness ladder checked; a chip
    // only has room for the first.
    const [firstClause] = attention.evidence.split(',');
    return { state: 'stale', color: 'bad', label: `stale · ${firstClause}` };
  }
  if (attention.reason === 'stranded') {
    return { state: 'stranded', color: 'warn', label: 'stranded' };
  }
  if (agent?.status === 'working') {
    return {
      state: 'driven',
      color: 'ok',
      label: '● driven · agent working',
    };
  }
  if (agent?.status === 'idle') {
    return { state: 'idle', color: 'warn', label: '◌ idle' };
  }
  if (run.ended_at == null) {
    return { state: 'running', color: 'accent', label: 'running' };
  }
  return { state: 'done', color: 'ok', label: 'done' };
}

export interface LivenessChipProps {
  run: RunSummary;
}

export function LivenessChip({ run }: LivenessChipProps) {
  const { bg, text } = useSchemeColors();
  const { state, color, label } = livenessSpec(run);

  return (
    <Box
      data-testid="liveness-chip"
      data-state={state}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        borderRadius: 999,
        padding: '2px 8px',
        fontSize: 11,
        fontWeight: 600,
        backgroundColor: bg.color(color),
        color: text.highContrast(color),
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </Box>
  );
}
