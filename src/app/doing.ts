import { formatElapsed } from './statusDetail';

export interface DoingInput {
  handle: string;
  status: 'live' | 'idle' | 'offline';
  branch?: string;
  cwd?: string;
  paneTitle?: string;
  statusText?: string;
  signedOutAt?: number;
}

export interface DoingLine {
  text: string;
  kind: 'away' | 'title' | 'branch' | 'path' | 'signed-out';
}

const TICKET_SLUG = /^[a-z]+-\d/;

/**
 * Strips only a leading `<segment>/` that turns out to be a scratch prefix
 * (author name, `feat/`, etc). A remainder that itself reads as a ticket
 * slug (`rt-96-...`) is the meaningful part of the name, so that prefix is
 * dropped; anything else keeps the branch intact.
 */
function stripBranchPrefix(branch: string): string {
  const slash = branch.indexOf('/');
  if (slash === -1) return branch;
  const rest = branch.slice(slash + 1);
  return TICKET_SLUG.test(rest) ? rest : branch;
}

function folderName(cwd?: string): string | undefined {
  if (!cwd) return undefined;
  const parts = cwd.split('/').filter(Boolean);
  return parts[parts.length - 1];
}

/**
 * Resolves a presence row to one line of "what is this agent doing" text.
 * Precedence is fixed: an away message beats the pane title, which beats a
 * non-main branch, which beats the worktree folder. Offline short-circuits
 * the whole chain since none of those fields describe an agent that has
 * signed out.
 */
export function doing(b: DoingInput): DoingLine | null {
  if (b.status === 'offline') {
    if (b.signedOutAt === undefined) return null;
    return { text: `signed out ${formatElapsed(Date.now() - b.signedOutAt)} ago`, kind: 'signed-out' };
  }

  if (b.statusText) {
    return { text: b.statusText, kind: 'away' };
  }

  if (b.paneTitle && b.paneTitle !== b.handle) {
    return { text: b.paneTitle, kind: 'title' };
  }

  if (b.branch && b.branch !== 'main') {
    return { text: stripBranchPrefix(b.branch), kind: 'branch' };
  }

  const folder = folderName(b.cwd);
  const branchText = b.branch ?? 'main';
  const text = folder ? `${folder} · ${branchText}` : branchText;
  return { text, kind: 'path' };
}
