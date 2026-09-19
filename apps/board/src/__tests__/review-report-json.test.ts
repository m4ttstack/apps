import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Database } from 'bun:sqlite';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import { readReviewReportJson, reviewReportPath } from '../review-state.ts';
import {
  insertAgentState,
  mintHandle,
  pruneStates,
  readStates,
  reportPathForHandle,
} from '../state/agent-states.ts';
import { openStateDb } from '../state/db.ts';

const URL_A = 'https://gitlab.com/acme/webapp/-/merge_requests/4821';
const JSON_FIXTURE = JSON.stringify({
  summary: { readiness: 'yes', reasoning: 'solid' },
  findings: [],
});

let handleRoot: string;
beforeEach(() => {
  handleRoot = mkdtempSync(join(tmpdir(), 'rrj-'));
  mkdirSync(join(handleRoot, 'state', 'reviews'), { recursive: true });
});
afterEach(() => {
  rmSync(handleRoot, { recursive: true, force: true });
});

describe('readReviewReportJson', () => {
  test('returns null when no sibling .json report exists yet', () => {
    expect(readReviewReportJson(URL_A, handleRoot)).toBeNull();
  });

  test('returns the saved json text once the sibling .json file exists', () => {
    const handle = mintHandle('review', URL_A, handleRoot);
    const jsonPath = reviewReportPath(handle).replace(/\.md$/, '.json');
    writeFileSync(jsonPath, JSON_FIXTURE);

    expect(readReviewReportJson(URL_A, handleRoot)).toBe(JSON_FIXTURE);
  });
});

describe('pruneStates report cleanup', () => {
  test('unlinks both the .md report and its .json sibling for a tombstoned row', () => {
    const d: Database = openStateDb(join(handleRoot, 'state.db'));
    const handle = mintHandle('review', URL_A, handleRoot);
    insertAgentState(
      'review',
      URL_A,
      4821,
      { mrUrl: URL_A, iid: 4821, status: 'done', startedAt: 1, updatedAt: 1 },
      handle,
      d
    );
    const mdPath = reportPathForHandle(handle);
    const jsonPath = mdPath.replace(/\.md$/, '.json');
    writeFileSync(mdPath, '# review');
    writeFileSync(jsonPath, JSON_FIXTURE);

    pruneStates('review', new Set<string>(), d);

    expect(readStates('review', d).size).toBe(0);
    expect(existsSync(mdPath)).toBe(false);
    expect(existsSync(jsonPath)).toBe(false);
  });
});
