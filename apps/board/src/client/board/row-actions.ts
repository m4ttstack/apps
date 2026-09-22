/** What the row menu offers, as data. One MR's actions come from
    rowActions; the bulk menu groups several MRs' lists (bulkActions), so the
    one-row and bulk menus can never disagree about what an MR can take.
    DOM-free, so both menus and their tests share it. */
import type { BoardMR } from '../../data.ts';
import type { MrAction } from '../../mr-action.ts';
import { hasStackDescendants, stackParents } from '../../view.ts';
import type { BoardMRWithReview } from '../types.ts';
import {
  doctorItemLabel,
  firstReviewTargets,
  getSlackMarks,
  gitlabMenuItems,
  laneInterrupted,
  nudgeTargets,
  respondAskTarget,
  respondItemLabel,
  reviewLogged,
  reviewMenuItems,
} from './format.ts';
import { laneDismissed } from './row-status.ts';

export type Lane = 'review' | 'respond' | 'doctor';
export type Section = 'agent' | 'gitlab' | 'slack';

export type ActionGlyph =
  | {
      kind: 'menu';
      name: 'file' | 'people' | 'copy' | 'branch' | 'dismiss' | 'note';
    }
  | { kind: 'flag'; name: 'conflicts' | 'auto-merge' | 'draft' }
  | { kind: 'out' }
  | { kind: 'slack' }
  | { kind: 'emoji'; glyph: string };

export type LaunchFlow =
  | 'review'
  | 're-review'
  | 'resume-review'
  | 'respond'
  | 'resume-respond'
  | 'doctor'
  | 'rebase-local';

export type ActionRequest =
  | { kind: 'launch'; flow: LaunchFlow; intent?: 'focus' }
  | { kind: 'mr'; action: MrAction }
  | { kind: 'draft'; draft: boolean }
  | { kind: 'react'; emoji: string; glyph: string; remove: boolean }
  | { kind: 'find-thread' }
  | { kind: 'ask'; ask: 'review' | 're-review' | 'respond'; reviewer?: string }
  | { kind: 'post-slack' }
  | { kind: 'copy' }
  | { kind: 'note' }
  | { kind: 'open'; url: string }
  | { kind: 'view-report'; lane: 'review' | 'respond' }
  | { kind: 'dismiss'; lane: Lane }
  | { kind: 'stand-down'; on: boolean };

export interface MenuEntry {
  key: string;
  section: Section;
  label: string;
  /** Null for an agent action, which leads with the bot mark in its lane's
      color instead. */
  glyph: ActionGlyph | null;
  lane?: Lane;
  hint?: string;
  /** The first click arms the item and swaps its label for this; the
      second click fires it. */
  confirm?: string;
  /** Shown with this reason under the label, and never clickable. */
  blocked?: string;
  /** Alt-click opens the note box before firing. */
  notable?: boolean;
  marked?: boolean;
  /** The menu stays open while it runs, so several can be set in a row. */
  keepOpen?: boolean;
  pick?: {
    title: string;
    aria: string;
    options: Array<{ value: string; hint?: string }>;
  };
}

export interface RowAction extends MenuEntry {
  request: ActionRequest;
  /** Present only when the action can join the bulk menu: its grouped
      wording ("call doctor" covers "call doctor again" too). */
  bulk?: string;
}

export interface ActionEnv {
  local: boolean;
  slackEnabled: boolean;
  /** The board's seat; null on an "all" board. */
  self: string | null;
  roster: string[];
  /** Enrolled peer usernames when the relay has said; undefined = unknown. */
  peers?: string[];
  /** Every MR on the board, for the stack checks. */
  allMrs: BoardMR[];
}

export interface RunOpts {
  note?: string;
  pick?: string;
}

const FILE: ActionGlyph = { kind: 'menu', name: 'file' };
const PEOPLE: ActionGlyph = { kind: 'menu', name: 'people' };
const DISMISS: ActionGlyph = { kind: 'menu', name: 'dismiss' };
const COPY: ActionGlyph = { kind: 'menu', name: 'copy' };
const NOTE: ActionGlyph = { kind: 'menu', name: 'note' };
const DRAFT: ActionGlyph = { kind: 'flag', name: 'draft' };
const SLACK: ActionGlyph = { kind: 'slack' };
const GITLAB_GLYPH: Record<MrAction, ActionGlyph> = {
  merge: { kind: 'flag', name: 'conflicts' },
  rebase: { kind: 'menu', name: 'branch' },
  setAutoMerge: { kind: 'flag', name: 'auto-merge' },
  cancelAutoMerge: { kind: 'flag', name: 'auto-merge' },
};

function agentItem(
  lane: Lane,
  key: string,
  label: string,
  request: ActionRequest,
  extra: Partial<RowAction> = {}
): RowAction {
  return { key, section: 'agent', label, glyph: null, lane, request, ...extra };
}

function item(
  section: Section,
  key: string,
  label: string,
  glyph: ActionGlyph,
  request: ActionRequest,
  extra: Partial<RowAction> = {}
): RowAction {
  return { key, section, label, glyph, request, ...extra };
}

/** Every action this MR offers right now, in menu order. Only what is
    possible renders: a blocked GitLab action is absent, not greyed. */
export function rowActions(
  mrx: BoardMRWithReview,
  env: ActionEnv
): RowAction[] {
  const own = env.self !== null && mrx.author.username === env.self;
  const agent: RowAction[] = [];

  if (env.local) {
    const reviewRunning =
      mrx.review?.status === 'queued' || mrx.review?.status === 'reviewing';
    for (const it of reviewMenuItems(
      mrx.review?.status,
      laneInterrupted(mrx.orphan, mrx.review),
      reviewLogged(mrx)
    )) {
      if (reviewRunning)
        agent.push(
          agentItem('review', 'focus-review', it.label, {
            kind: 'launch',
            flow: 'review',
            intent: 'focus',
          })
        );
      else if (it.kind === 're-review')
        agent.push(
          agentItem(
            'review',
            're-review',
            it.label,
            { kind: 'launch', flow: 're-review' },
            { notable: true, bulk: 're-review' }
          )
        );
      else
        agent.push(
          agentItem(
            'review',
            'review',
            it.label,
            { kind: 'launch', flow: 'review' },
            { notable: true, bulk: 'review' }
          )
        );
    }
    if (mrx.review?.sessionId)
      agent.push(
        agentItem(
          'review',
          'resume-review',
          'resume review',
          { kind: 'launch', flow: 'resume-review' },
          { notable: true }
        )
      );
    if (own) {
      const label = respondItemLabel(
        mrx.respond?.status,
        laneInterrupted(mrx.orphan, mrx.respond)
      );
      // Both words ride the focus intent: the launch route already re-opens
      // a dead pane, the label only says which of the two it will do.
      const focuses =
        label === 'focus response' || label === 'relaunch response';
      agent.push(
        focuses
          ? agentItem('respond', 'focus-respond', label, {
              kind: 'launch',
              flow: 'respond',
              intent: 'focus',
            })
          : agentItem(
              'respond',
              'respond',
              label,
              { kind: 'launch', flow: 'respond' },
              { notable: true }
            )
      );
      if (mrx.respond?.sessionId)
        agent.push(
          agentItem(
            'respond',
            'resume-respond',
            'resume response',
            { kind: 'launch', flow: 'resume-respond' },
            { notable: true }
          )
        );
    }
    // Doctor is mechanical repair, offered on anyone's MR that is broken.
    if (mrx.blockers?.pipelineFailing || mrx.blockers?.hasConflicts) {
      const label = doctorItemLabel(mrx.doctor?.status);
      agent.push(
        label === 'focus doctor'
          ? agentItem('doctor', 'focus-doctor', label, {
              kind: 'launch',
              flow: 'doctor',
              intent: 'focus',
            })
          : agentItem(
              'doctor',
              'doctor',
              label,
              { kind: 'launch', flow: 'doctor' },
              { notable: true, bulk: 'call doctor' }
            )
      );
    }
    if (
      mrx.blockers?.hasConflicts ||
      mrx.rebaseButton.visible ||
      (mrx.behindTarget ?? 0) > 0
    )
      agent.push(
        agentItem(
          'doctor',
          'rebase-local',
          'rebase locally',
          { kind: 'launch', flow: 'rebase-local' },
          { notable: true }
        )
      );
  }
  if (mrx.review?.reportReady)
    agent.push(
      item('agent', 'view-review', 'view agent review', FILE, {
        kind: 'view-report',
        lane: 'review',
      })
    );
  if (mrx.respond?.reportReady)
    agent.push(
      item('agent', 'view-respond', 'view agent response', FILE, {
        kind: 'view-report',
        lane: 'respond',
      })
    );
  for (const lane of ['review', 'respond', 'doctor'] as const) {
    const state = mrx[lane];
    if (state?.status !== 'error' || laneDismissed(state)) continue;
    agent.push(
      item('agent', `dismiss-${lane}`, `dismiss ${lane} line`, DISMISS, {
        kind: 'dismiss',
        lane,
      })
    );
  }
  // Auto-doctor only ever acts on the seat's own MRs, so the toggle is theirs.
  // Matched by url: the MR handed in can be a copy (optimistic overlay, live
  // slack marks), and the stack walk compares objects.
  const onBoard = env.allMrs.find(m => m.webUrl === mrx.webUrl) ?? mrx;
  if (own)
    agent.push(
      item(
        'agent',
        'stand-down',
        mrx.standDown
          ? 're-enable auto-doctor'
          : `auto-doctor: ignore this ${hasStackDescendants(onBoard, env.allMrs) ? 'stack' : 'MR'}`,
        DISMISS,
        { kind: 'stand-down', on: !mrx.standDown }
      )
    );
  if (env.local && own)
    for (const peer of nudgeTargets(mrx))
      agent.push(
        item(
          'agent',
          `nudge-${peer.reviewer}`,
          `ask ${peer.reviewer}'s agent to re-review`,
          PEOPLE,
          { kind: 'ask', ask: 're-review', reviewer: peer.reviewer }
        )
      );
  const respondTarget =
    env.local && env.self !== null && !own
      ? respondAskTarget(mrx, env.peers)
      : null;
  if (respondTarget)
    agent.push(
      item(
        'agent',
        'ask-respond',
        `ask ${respondTarget}'s agent to respond`,
        PEOPLE,
        { kind: 'ask', ask: 'respond', reviewer: respondTarget }
      )
    );
  const askTargets =
    env.local && own ? firstReviewTargets(mrx, env.roster, env.peers) : [];
  if (askTargets.length)
    agent.push(
      item(
        'agent',
        'request-review',
        'request review from…',
        PEOPLE,
        { kind: 'ask', ask: 'review' },
        {
          pick: {
            title: 'request review from',
            aria: 'request review',
            options: askTargets.map(value => ({ value })),
          },
          bulk: 'request review from…',
        }
      )
    );

  const gitlab: RowAction[] = [];
  if (env.local) {
    for (const g of gitlabMenuItems(mrx)) {
      if (g.disabled) continue;
      gitlab.push(
        item(
          'gitlab',
          g.kind,
          g.label,
          GITLAB_GLYPH[g.kind],
          { kind: 'mr', action: g.kind },
          g.kind === 'merge'
            ? { bulk: g.label, confirm: 'really merge?' }
            : { bulk: g.label }
        )
      );
    }
    if (own)
      gitlab.push(
        mrx.isDraft
          ? item(
              'gitlab',
              'mark-ready',
              'mark ready',
              DRAFT,
              { kind: 'draft', draft: false },
              { bulk: 'mark ready' }
            )
          : item(
              'gitlab',
              'mark-draft',
              'mark as draft',
              DRAFT,
              { kind: 'draft', draft: true },
              { bulk: 'mark as draft' }
            )
      );
  }
  gitlab.push(
    item(
      'gitlab',
      'open-gitlab',
      'open in gitlab',
      { kind: 'out' },
      { kind: 'open', url: mrx.webUrl ?? '' }
    )
  );

  const slack: RowAction[] = [];
  const s = mrx.slack;
  if (env.local && env.slackEnabled) {
    if (s?.status === 'found') {
      const reactions = s.reactions ?? [];
      for (const m of getSlackMarks()) {
        const marked = reactions.includes(m.emoji);
        const label = marked ? `unmark ${m.word}` : `mark as ${m.word}`;
        slack.push(
          item(
            'slack',
            `${marked ? 'unreact' : 'react'}-${m.emoji}`,
            label,
            { kind: 'emoji', glyph: m.glyph },
            { kind: 'react', emoji: m.emoji, glyph: m.glyph, remove: marked },
            { marked, keepOpen: true, bulk: label }
          )
        );
      }
      if (s.permalink)
        slack.push(
          item('slack', 'open-slack-post', 'open MR post in slack', SLACK, {
            kind: 'open',
            url: s.permalink,
          })
        );
    } else {
      slack.push(
        item(
          'slack',
          'find-thread',
          s?.status === 'notfound'
            ? 'no thread, find it again'
            : 'find slack thread',
          SLACK,
          { kind: 'find-thread' },
          { bulk: 'find slack threads' }
        )
      );
      slack.push(
        item('slack', 'post-slack', 'post to slack', SLACK, {
          kind: 'post-slack',
        })
      );
    }
  }
  slack.push(item('slack', 'copy', 'copy for slack', COPY, { kind: 'copy' }));
  slack.push(
    item('slack', 'note', mrx.note ? 'edit note' : 'add a note', NOTE, {
      kind: 'note',
    })
  );

  return [...agent, ...gitlab, ...slack];
}

/** Launches past this many ask for a second click. */
export const LAUNCH_CONFIRM_OVER = 3;

export interface BulkEntry extends MenuEntry {
  request: ActionRequest;
  targets: BoardMRWithReview[];
  /** request review from…: who can be asked on which of the targets. */
  pickTargets?: Map<string, BoardMRWithReview[]>;
}

const SECTION_RANK: Record<Section, number> = { agent: 0, gitlab: 1, slack: 2 };
const BULK_RANK = [
  'review',
  're-review',
  'doctor',
  'request-review',
  'rebase',
  'setAutoMerge',
  'cancelAutoMerge',
  'mark-ready',
  'mark-draft',
  'merge',
  'react',
  'find-thread',
];

function bulkRank(key: string): number {
  const base =
    key.startsWith('react-') || key.startsWith('unreact-') ? 'react' : key;
  const i = BULK_RANK.indexOf(base);
  return i === -1 ? BULK_RANK.length : i;
}

const BULK_CONFIRM: Record<string, (n: number) => string | undefined> = {
  merge: n => `really merge ${n}?`,
  review: n =>
    n > LAUNCH_CONFIRM_OVER ? `really start ${n} reviews?` : undefined,
  're-review': n =>
    n > LAUNCH_CONFIRM_OVER ? `really start ${n} re-reviews?` : undefined,
  doctor: n =>
    n > LAUNCH_CONFIRM_OVER ? `really call doctor on ${n}?` : undefined,
};

/** Merging a child before its parent lands it in the parent's branch, not
    the target, so a checked child of an open MR stops the whole merge. */
function mergeBlock(checked: BoardMR[], allMrs: BoardMR[]): string | undefined {
  const parentByUrl = new Map(
    [...stackParents(allMrs)].map(([child, parent]) => [child.webUrl, parent])
  );
  for (const mr of checked) {
    const parent = parentByUrl.get(mr.webUrl);
    if (parent) return `!${mr.iid} sits on !${parent.iid}, which is still open`;
  }
  return undefined;
}

/** The bulk menu: each checked MR's rowActions, keeping the bulk-capable
    ones, grouped by key. Eligibility comes only from rowActions; what is
    added here exists only for a group (counts, confirms, the stack block,
    mark over unmark, the merged picker). */
export function bulkActions(
  mrs: BoardMRWithReview[],
  env: ActionEnv
): BulkEntry[] {
  const groups = new Map<
    string,
    {
      first: RowAction;
      targets: BoardMRWithReview[];
      picks: Map<string, BoardMRWithReview[]>;
    }
  >();
  for (const mr of mrs) {
    for (const action of rowActions(mr, env)) {
      if (!action.bulk) continue;
      let g = groups.get(action.key);
      if (!g) {
        g = { first: action, targets: [], picks: new Map() };
        groups.set(action.key, g);
      }
      g.targets.push(mr);
      for (const o of action.pick?.options ?? [])
        g.picks.set(o.value, [...(g.picks.get(o.value) ?? []), mr]);
    }
  }
  for (const key of [...groups.keys()])
    if (
      key.startsWith('unreact-') &&
      groups.has(`react-${key.slice('unreact-'.length)}`)
    )
      groups.delete(key);

  const of = (n: number) => `${n} of ${mrs.length}`;
  const entries = [...groups].map(([key, g]): BulkEntry => {
    const n = g.targets.length;
    const entry: BulkEntry = {
      key,
      section: g.first.section,
      label: g.first.bulk ?? g.first.label,
      glyph: g.first.glyph,
      lane: g.first.lane,
      request: g.first.request,
      targets: g.targets,
      hint: of(n),
      confirm: BULK_CONFIRM[key]?.(n),
      blocked: key === 'merge' ? mergeBlock(mrs, env.allMrs) : undefined,
    };
    if (g.first.pick) {
      entry.pick = {
        ...g.first.pick,
        options: [...g.picks].map(([value, t]) => ({
          value,
          hint: of(t.length),
        })),
      };
      entry.pickTargets = g.picks;
    }
    return entry;
  });
  return entries.sort(
    (x, y) =>
      SECTION_RANK[x.section] - SECTION_RANK[y.section] ||
      bulkRank(x.key) - bulkRank(y.key)
  );
}
