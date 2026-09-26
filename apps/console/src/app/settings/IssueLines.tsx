import { Button, Group, Stack, Text } from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import { Icons } from '@mattstack/app-kit/icons';
import type { SettingDefWire } from '@mattstack/settings-kit/react';

import {
  isDiverged,
  issueLine,
  issueText,
  issueWhere,
  type WireIssue,
} from './issues';
import { JsonBlock } from './JsonBlock';

/** One warning line per stored value that fails its schema or type check,
    and per merged-value failure, each with Fix when the page can open it. */
export function IssueLines({
  def,
  onFix,
}: {
  def: SettingDefWire;
  onFix?: (issue: WireIssue | null) => void;
}) {
  const { text } = useSchemeColors();
  const issues = def.issues ?? [];
  const merged = def.mergedIssues ?? [];
  if (issues.length === 0 && merged.length === 0) return null;
  const line = (key: string, label: string, fix?: () => void) => (
    <Group key={key} gap={8} wrap="nowrap" data-testid="issue-line">
      <Icons.warning size={12} color="var(--tk-text-warn-vivid)" />
      <Text
        fz={12}
        ff="monospace"
        c="var(--tk-text-warn-small)"
        style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}
      >
        {label}
      </Text>
      {fix && (
        <Button size="compact-xs" variant="default" onClick={fix}>
          Fix
        </Button>
      )}
    </Group>
  );
  return (
    <Stack gap={4} pb={12}>
      {issues.map((issue, i) =>
        isDiverged(issue) ? (
          <Stack key={`d${i}`} gap={6} data-testid={`diverged-${issue.scope}`}>
            {line(
              `d${i}`,
              `${issueWhere(issue)} · ${issue.storeName} differs from the current value`,
              onFix ? () => onFix(issue) : undefined
            )}
            <Group gap={12} align="flex-start" wrap="nowrap" pl={20}>
              <Stack
                gap={2}
                style={{ flex: 1, minWidth: 0 }}
                data-testid="diverged-current"
              >
                <Text fz={12} c={text.muted}>
                  current
                </Text>
                <JsonBlock value={issue.currentValue} maxHeight={160} />
              </Stack>
              <Stack
                gap={2}
                style={{ flex: 1, minWidth: 0 }}
                data-testid="diverged-older"
              >
                <Text fz={12} c={text.muted}>
                  {`older (${issue.storeName})`}
                </Text>
                <JsonBlock value={issue.olderValue} maxHeight={160} />
              </Stack>
            </Group>
          </Stack>
        ) : (
          line(
            `i${i}`,
            issueLine(issue),
            onFix ? () => onFix(issue) : undefined
          )
        )
      )}
      {merged.map((issue, i) =>
        line(
          `m${i}`,
          `merged · ${issueText(issue)}`,
          onFix ? () => onFix(null) : undefined
        )
      )}
    </Stack>
  );
}
