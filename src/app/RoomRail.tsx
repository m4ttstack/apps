import { Group, Stack, Text, UnstyledButton } from '@mattstack/app-kit/core';
import { useHover } from '@mattstack/app-kit/hooks';
import { Icon } from '@mattstack/app-kit/icons';

import { FleetTree, type FleetRoom } from './FleetTree';
import { MUTED_XS } from './presence-bits';
import type { RosterBuddy } from './Roster';

export interface RoomRailProps {
  rooms: FleetRoom[];
  /** The whole fleet: the tree groups these by repo under each room. */
  buddies?: RosterBuddy[];
  /** A prop, not `Date.now()` internally, so sign-out ages are testable
      without fake timers. @default Date.now() */
  now?: number;
  /** The room open in the transcript, so its row carries the accent wash. */
  activeRoom?: string;
  onSelectRoom?: (room: string) => void;
  /** rt daemon reachability: the `+` is disabled while it is down, since a
      room cannot be created without it, and every presence claim in the tree
      is withheld. @default true */
  daemonReachable?: boolean;
  /** Opens the new-room modal. The `+` renders only when this is wired. */
  onNewRoom?: () => void;
  /** Closes a room (leaves it off the listing until a post revives it): the
      row's hover × and its right-click menu. Neither renders when this is
      absent. */
  onCloseRoom?: (room: string) => void;
  /** The right-click menu's Mark read, offered only on a row with unread. */
  onMarkRead?: (room: string) => void;
  /** Brings a workstream's herdr pane to the front. */
  onFocusPane?: (paneId: string) => void;
  /** Inside `PageShell.Sidebar`: the sidebar is the surface, so no card. */
  sidebar?: boolean;
}

/** The header's `+`: `.aicon` (24px, 6px radius, muted, `bg4` on hover). */
function NewRoomButton({
  disabled,
  onClick,
}: {
  disabled: boolean;
  onClick?: () => void;
}) {
  const { ref, hovered } = useHover<HTMLButtonElement>();
  return (
    <UnstyledButton
      ref={ref}
      data-testid="new-room-button"
      aria-label="New room"
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        flex: 'none',
        borderRadius: 'var(--mantine-radius-md)',
        color: 'var(--tk-muted-text)',
        background: hovered && !disabled ? 'var(--ui-bg-4)' : 'transparent',
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      <Icon name="plus" size={14} />
    </UnstyledButton>
  );
}

/**
 * The 244px sidebar: a `FLEET` header carrying the fleet count and the `+`,
 * then the tree itself. The rail owns the frame and the header; `FleetTree`
 * owns every row inside it.
 */
export function RoomRail({
  rooms,
  buddies = [],
  now = Date.now(),
  activeRoom,
  onSelectRoom,
  daemonReachable = true,
  onNewRoom,
  onCloseRoom,
  onMarkRead,
  onFocusPane,
  sidebar = false,
}: RoomRailProps) {
  // A `dm` row with no participants has no pair to be named by, so it heads
  // its own group like any other room rather than rendering an empty pair.
  const directRooms = rooms.filter(r => r.kind === 'dm' && r.participants);
  const channelRooms = rooms.filter(r => !directRooms.includes(r));
  const online = buddies.filter(b => b.status !== 'offline').length;

  return (
    <Stack
      gap={2}
      style={{
        width: sidebar ? '100%' : 232 + 12,
        flex: sidebar ? 1 : 'none',
        minWidth: 0,
        background: sidebar ? undefined : 'var(--tk-panel)',
        border: sidebar ? undefined : '1px solid var(--tk-border)',
        borderRadius: sidebar ? undefined : 'var(--mantine-radius-md)',
        padding: 'var(--mantine-spacing-lg) var(--mantine-spacing-sm)',
        alignSelf: 'stretch',
        overflowY: sidebar ? undefined : 'auto',
      }}
      data-testid="room-rail"
    >
      <Group
        justify="space-between"
        wrap="nowrap"
        style={{
          padding: '0 var(--mantine-spacing-md) var(--mantine-spacing-sm)',
        }}
      >
        <Text
          component="h3"
          size="xs"
          fw={600}
          style={{
            margin: 0,
            color: 'var(--tk-muted-text)',
            letterSpacing: '0.04em',
          }}
        >
          FLEET
        </Text>
        <Group gap={2} wrap="nowrap">
          <Text component="span" data-testid="fleet-count" style={MUTED_XS}>
            {daemonReachable
              ? `${online} on · ${buddies.length - online} off`
              : 'last known'}
          </Text>
          {onNewRoom && (
            <NewRoomButton disabled={!daemonReachable} onClick={onNewRoom} />
          )}
        </Group>
      </Group>

      <FleetTree
        rooms={channelRooms}
        dms={directRooms}
        buddies={buddies}
        now={now}
        activeRoom={activeRoom}
        daemonReachable={daemonReachable}
        onOpenRoom={onSelectRoom}
        onOpenDm={onSelectRoom}
        onFocusPane={onFocusPane}
        onClose={onCloseRoom}
        onMarkRead={onMarkRead}
      />
    </Stack>
  );
}
