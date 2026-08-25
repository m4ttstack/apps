import type { MantineColor } from '@ui/core';
import { Group } from '@ui/core';
import { useSchemeColors } from '@ui/hooks';

const STAGE_STATUS_COLOR: Record<string, MantineColor> = {
  done: 'ok',
  failed: 'bad',
  running: 'accent',
};

export interface StageSummary {
  name: string;
  status: string;
}

export interface StageProgressProps {
  stages?: StageSummary[];
}

export function StageProgress({ stages }: StageProgressProps) {
  const { text, border } = useSchemeColors();
  if (!stages || stages.length === 0) return null;

  return (
    <Group gap={4} wrap="nowrap" data-testid="stage-progress">
      {stages.map((stage, i) => {
        const color = STAGE_STATUS_COLOR[stage.status];
        return (
          <div
            key={`${stage.name}-${i}`}
            data-status={stage.status}
            style={{
              width: 26,
              height: 4,
              borderRadius: 2,
              backgroundColor: color
                ? text.highContrast(color)
                : border.default,
            }}
          />
        );
      })}
    </Group>
  );
}
