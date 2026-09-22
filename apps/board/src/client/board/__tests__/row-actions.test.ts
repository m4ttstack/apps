import { expect, test } from 'bun:test';

import { rowActions } from '../row-actions.ts';
import {
  actionEnvOf,
  busyEnv,
  failedEnv,
  failedLanes,
  ownBusy,
  ownEnv,
  ownIdle,
  teammateReviewed,
} from './menu-fixtures.ts';

const keys = (mr: typeof ownIdle, env: typeof ownEnv) =>
  rowActions(mr, actionEnvOf(env, mr)).map(a => a.key);

test('an idle own MR offers these actions, in menu order', () => {
  expect(keys(ownIdle, ownEnv)).toEqual([
    'review',
    'respond',
    'rebase-local',
    'stand-down',
    'request-review',
    'merge',
    'rebase',
    'setAutoMerge',
    'mark-draft',
    'open-gitlab',
    'find-thread',
    'post-slack',
    'copy',
    'note',
  ]);
});

test("a teammate's reviewed MR with a found thread", () => {
  expect(keys(teammateReviewed, ownEnv)).toEqual([
    're-review',
    'resume-review',
    'view-review',
    'ask-respond',
    'open-gitlab',
    'react-eyes',
    'react-speech_balloon',
    'unreact-white_check_mark',
    'open-slack-post',
    'copy',
    'note',
  ]);
});

test('a remote board keeps the stand-down toggle and the local-free items', () => {
  expect(keys(ownIdle, { ...ownEnv, local: false })).toEqual([
    'stand-down',
    'open-gitlab',
    'copy',
    'note',
  ]);
});

test('only the bulk-capable actions carry a bulk label', () => {
  const bulk = Object.fromEntries(
    rowActions(ownIdle, actionEnvOf(ownEnv, ownIdle))
      .filter(a => a.bulk)
      .map(a => [a.key, a.bulk])
  );
  expect(bulk).toEqual({
    review: 'review',
    'request-review': 'request review from…',
    merge: 'merge',
    rebase: 'rebase on target',
    setAutoMerge: 'set auto-merge',
    'mark-draft': 'mark as draft',
    'find-thread': 'find slack threads',
  });
});

test('running lanes focus their pane and carry no note or bulk', () => {
  const actions = rowActions(ownBusy, actionEnvOf(busyEnv, ownBusy));
  const focusReview = actions.find(a => a.key === 'focus-review');
  expect(focusReview?.request).toEqual({
    kind: 'launch',
    flow: 'review',
    intent: 'focus',
  });
  expect(focusReview?.notable).toBeUndefined();
  expect(focusReview?.bulk).toBeUndefined();
  expect(actions.find(a => a.key === 'focus-respond')?.label).toBe(
    'relaunch response'
  );
  expect(actions.find(a => a.key === 'doctor')).toMatchObject({
    label: 'call doctor',
    lane: 'doctor',
    notable: true,
    bulk: 'call doctor',
    request: { kind: 'launch', flow: 'doctor' },
  });
  expect(actions.find(a => a.key === 'stand-down')?.label).toBe(
    'auto-doctor: ignore this stack'
  );
});

test('merge arms before it fires; a slack mark stays open and knows its state', () => {
  const idle = rowActions(ownIdle, actionEnvOf(ownEnv, ownIdle));
  expect(idle.find(a => a.key === 'merge')?.confirm).toBe('really merge?');
  const mates = rowActions(
    teammateReviewed,
    actionEnvOf(ownEnv, teammateReviewed)
  );
  expect(mates.find(a => a.key === 'unreact-white_check_mark')).toMatchObject({
    label: 'unmark approved',
    marked: true,
    keepOpen: true,
    glyph: { kind: 'emoji', glyph: '✅' },
    request: {
      kind: 'react',
      emoji: 'white_check_mark',
      glyph: '✅',
      remove: true,
    },
  });
});

test('request review from… carries its picker; asks name their reviewer', () => {
  const actions = rowActions(failedLanes, actionEnvOf(failedEnv, failedLanes));
  expect(actions.find(a => a.key === 'request-review')).toMatchObject({
    request: { kind: 'ask', ask: 'review' },
    pick: {
      title: 'request review from',
      aria: 'request review',
      options: [{ value: 'jo' }],
    },
  });
  expect(actions.find(a => a.key === 'nudge-kim')?.request).toEqual({
    kind: 'ask',
    ask: 're-review',
    reviewer: 'kim',
  });
  expect(
    actions.filter(a => a.key.startsWith('dismiss-')).map(a => a.key)
  ).toEqual(['dismiss-review', 'dismiss-doctor']);
});
