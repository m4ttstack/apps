import { Group, Text, UnstyledButton } from '@mattstack/app-kit/core';
import { useSchemeColors } from '@mattstack/app-kit/hooks';
import { Icons } from '@mattstack/app-kit/icons';

export function ExpandToggle({
  label,
  open,
  onToggle,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
}) {
  const { text } = useSchemeColors();
  return (
    <UnstyledButton onClick={onToggle} aria-expanded={open}>
      <Group gap={4} wrap="nowrap">
        <Text size="xs" c={text.muted}>
          {label}
        </Text>
        {open ? <Icons.chevronUp size={14} /> : <Icons.chevronDown size={14} />}
      </Group>
    </UnstyledButton>
  );
}
