import { Box, Group, Text, UnstyledButton } from '@mattstack/app-kit/core';

import type { InboxCard as InboxCardData } from '../server/inbox';
import { AgentName } from './AgentName';
import { useBuddies } from './buddies-context';
import { localTime } from './day-label';
import { doing } from './doing';
import classes from './inbox.module.css';
import { speakerHue } from './speaker-hue';
import { formatElapsed } from './statusDetail';

const MUTED = 'var(--tk-muted-text)';
const MUTED_DIM = 'var(--tk-muted)';
const BORDER = 'var(--tk-border)';
const BORDER_SOFT = 'var(--tk-border-soft)';
const PURPLE = 'var(--tk-purple)';
const ACCENT_TEXT = 'var(--mantine-color-accent-text)';

/** `.ctx`: the small outlined token naming where a message lives. A DM's is
    `.ctx.dm`, in purple, and carries the pair -- the hashed room name is
    never rendered anywhere in this app. */
export function CtxChip({
  children,
  dm = false,
  testId,
}: {
  children: React.ReactNode;
  dm?: boolean;
  testId?: string;
}) {
  return (
    <Box
      component="span"
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        height: 16,
        padding: '0 6px',
        borderRadius: 'var(--mantine-radius-sm)',
        fontSize: 'var(--tk-fs-4xs)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        border: `1px solid ${dm ? `color-mix(in srgb, ${PURPLE} 45%, transparent)` : BORDER_SOFT}`,
        color: dm ? PURPLE : MUTED,
      }}
    >
      {children}
    </Box>
  );
}

/** A DM is named by its pair, a room by its hash. Shared by the card, the
    reader strip and every label that has to say what a mark-read clears. */
export function whereLabel(card: InboxCardData): string {
  return card.kind === 'dm' && card.participants
    ? `${card.participants.a} ↔ ${card.participants.b}`
    : `#${card.room}`;
}

/** An unanswered `@here` is measured by how long nobody has picked it up;
    everything else by how long it has been waiting for Matt. */
function ageLabel(card: InboxCardData, now: number): string {
  const elapsed = formatElapsed(now - card.postedAt);
  return card.reason === 'open-ask' ? `unclaimed ${elapsed}` : `${elapsed} ago`;
}

export interface InboxCardProps {
  card: InboxCardData;
  /** The card the reader is holding: accent border and wash. */
  open?: boolean;
  /** False withholds every presence claim (the task line) and every age,
      exactly as the rail and the page bar already do. @default true */
  reachable?: boolean;
  /** A prop, not `Date.now()` internally, so ages are testable without fake
      timers. @default Date.now() */
  now?: number;
  /** Opens this card in the reader beside the list. */
  onOpen: () => void;
  /**
   * Clears the card's ROOM, not the card. `chat:mark` takes `{handle, room}`
   * and has no per-message cursor, so this also clears that room's other
   * unread -- which is why the control names the room rather than saying a
   * bare "mark read".
   */
  onMarkRead: () => void;
  /** Leaves the inbox for the room, parked on this message. */
  onOpenRoom: () => void;
}

/**
 * One `.card2`: who posted, the first lines of what they said, and where it
 * lives. The whole card opens the reader; the two links in the meta row are
 * their own actions and never do that as a side effect.
 */
export function InboxCard({
  card,
  open = false,
  reachable = true,
  now = Date.now(),
  onOpen,
  onMarkRead,
  onOpenRoom,
}: InboxCardProps) {
  const ctx = useBuddies();
  const author = ctx?.byHandle.get(card.handle);
  const task = reachable && author ? doing(author, now) : null;
  const where = whereLabel(card);
  const isDm = card.kind === 'dm';

  return (
    <Box
      data-testid={`inbox-card-${card.messageId}`}
      data-open={open ? 'true' : undefined}
      className={classes.card}
      onClick={onOpen}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 0,
        padding: '9.6px 11.2px',
        borderRadius: 'var(--mantine-radius-md)',
        border: `1px solid ${open ? ACCENT_TEXT : BORDER}`,
        background: open
          ? `color-mix(in srgb, ${ACCENT_TEXT} var(--tk-wash), var(--tk-panel))`
          : 'var(--tk-panel)',
        cursor: 'pointer',
      }}
    >
      <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <Box
          component="span"
          style={{
            display: 'inline-flex',
            flex: 'none',
            alignItems: 'center',
            borderRadius: 'var(--mantine-radius-sm)',
            padding: '0 6px',
            marginLeft: -6,
            fontSize: 'var(--tk-fs-2xs)',
            fontWeight: 600,
            color: speakerHue(card.handle),
            background: `color-mix(in srgb, ${speakerHue(card.handle)} var(--tk-wash), transparent)`,
          }}
        >
          <AgentName handle={card.handle} />
        </Box>
        {author?.repo && (
          <Text
            component="span"
            truncate
            style={{
              flex: 'none',
              minWidth: 0,
              fontSize: 'var(--tk-fs-3xs)',
              color: MUTED,
            }}
          >
            <span style={{ fontSize: 'var(--tk-fs-2xs)', margin: '0 3px' }}>
              •
            </span>
            {author.repo}
          </Text>
        )}
        <Text
          component="span"
          truncate
          data-testid={`card-task-${card.messageId}`}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 'var(--tk-fs-3xs)',
            color: !reachable || task?.kind === 'path' ? MUTED_DIM : MUTED,
          }}
        >
          {reachable ? (task?.text ?? '') : 'last known'}
        </Text>
        <Text
          component="span"
          style={{
            flex: 'none',
            fontSize: 'var(--tk-fs-3xs)',
            color: MUTED,
          }}
        >
          {localTime(card.postedAt)}
        </Text>
      </Group>

      <Box
        data-testid={`card-lead-${card.messageId}`}
        className={classes.lead}
        // Two lines of the message, no more: the card is a pointer at the
        // thing, and the reader beside it is where the thing is read.
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {card.excerpt}
      </Box>

      <Group gap="sm" wrap="nowrap" align="center" style={{ minWidth: 0 }}>
        <CtxChip dm={isDm} testId={`card-ctx-${card.messageId}`}>
          {where}
        </CtxChip>
        <Text
          component="span"
          truncate
          data-testid={`card-age-${card.messageId}`}
          style={{
            minWidth: 0,
            fontSize: 'var(--tk-fs-3xs)',
            color: MUTED,
          }}
        >
          {reachable ? ageLabel(card, now) : 'last known'}
        </Text>
        <Box style={{ flex: 1 }} />
        <UnstyledButton
          data-testid={`card-open-${card.messageId}`}
          className={classes.link}
          aria-label={`Open ${where} at this message`}
          onClick={event => {
            event.stopPropagation();
            onOpenRoom();
          }}
          style={{
            flex: 'none',
            fontSize: 'var(--tk-fs-3xs)',
            fontWeight: 600,
            color: ACCENT_TEXT,
          }}
        >
          open {where}
        </UnstyledButton>
        <Text
          component="span"
          style={{ fontSize: 'var(--tk-fs-3xs)', color: MUTED }}
        >
          ·
        </Text>
        <UnstyledButton
          data-testid={`card-mark-read-${card.messageId}`}
          className={classes.link}
          aria-label={`Mark ${where} read`}
          onClick={event => {
            event.stopPropagation();
            onMarkRead();
          }}
          style={{
            flex: 'none',
            fontSize: 'var(--tk-fs-3xs)',
            fontWeight: 600,
            color: ACCENT_TEXT,
          }}
        >
          mark {where} read
        </UnstyledButton>
      </Group>
    </Box>
  );
}
