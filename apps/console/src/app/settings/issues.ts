import type { SchemaIssue } from '@mattstack/settings-kit/shapes';

export function issuePath(path: (string | number)[]): string {
  if (path.length === 0) return '(root)';
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? p : `.${p}`))
    .join('');
}

export function issueText(issue: SchemaIssue): string {
  return `${issuePath(issue.path)}: ${issue.message}`;
}

/** The issues inside one entry, with their paths made relative to it. */
export function issuesUnder(
  issues: SchemaIssue[],
  head: string | number
): SchemaIssue[] {
  return issues
    .filter(i => i.path[0] === head)
    .map(i => ({ ...i, path: i.path.slice(1) }));
}
