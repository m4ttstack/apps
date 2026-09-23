import { Badge, Box, Menu, UnstyledButton } from '@mattstack/app-kit/core';

import type { StoreScope } from './view';

export const SCOPE_COLOR: Record<StoreScope, string> = {
  team: 'purple',
  user: 'cyan',
  machine: 'accent',
};

export function ScopeDot({ scope }: { scope: StoreScope }) {
  return (
    <Box
      component="span"
      w={6}
      h={6}
      style={{
        display: 'inline-block',
        borderRadius: '50%',
        flex: 'none',
        background: `var(--mantine-color-${SCOPE_COLOR[scope]}-filled)`,
      }}
    />
  );
}

export function ScopeBadge({
  scope,
  moveTo,
  onMove,
}: {
  scope: StoreScope;
  moveTo: StoreScope[];
  onMove: (to: StoreScope) => void;
}) {
  const badge = (
    <Badge
      size="sm"
      variant="light"
      color={SCOPE_COLOR[scope]}
      tt="none"
      leftSection={<ScopeDot scope={scope} />}
    >
      {scope}
    </Badge>
  );
  if (moveTo.length === 0) return badge;
  return (
    <Menu position="bottom-start" withinPortal>
      <Menu.Target>
        <UnstyledButton aria-label={`${scope}: move to another scope`}>
          {badge}
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>Move value to</Menu.Label>
        {moveTo.map(to => (
          <Menu.Item
            key={to}
            leftSection={<ScopeDot scope={to} />}
            onClick={() => onMove(to)}
          >
            {to}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
