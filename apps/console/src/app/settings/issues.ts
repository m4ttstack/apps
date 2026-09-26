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

const REQUIRED_RE = /^required property/;

/** A short word where one exists ("required" for a missing required
    property), the checker's own message otherwise. */
export function shortIssue(issue: SchemaIssue): string {
  return REQUIRED_RE.test(issue.message) ? 'required' : issue.message;
}

export interface FooterSummary {
  touchedText: string | null;
  noteText: string | null;
}

/** The item cards footer's two lines: the first issue on a touched field,
    numbered to match its card header, and a count of empty required fields
    for the first card whose issues are all untouched. `issues` carries the
    card index as `path[0]`, so a shape other than a list of objects never
    matches either line. */
export function footerSummary(
  issues: SchemaIssue[],
  touched: readonly ReadonlySet<string>[]
): FooterSummary {
  let touchedText: string | null = null;
  for (const issue of issues) {
    const card = issue.path[0];
    const field = issue.path[1];
    if (typeof card !== 'number' || typeof field !== 'string') continue;
    if (touched[card]?.has(field)) {
      touchedText = `#${card + 1} ${field}: ${shortIssue(issue)}`;
      break;
    }
  }

  const byCard = new Map<number, SchemaIssue[]>();
  for (const issue of issues) {
    const card = issue.path[0];
    if (typeof card !== 'number') continue;
    const list = byCard.get(card);
    if (list) list.push(issue);
    else byCard.set(card, [issue]);
  }
  let noteText: string | null = null;
  for (const card of [...byCard.keys()].sort((a, b) => a - b)) {
    const list = byCard.get(card)!;
    const anyTouched = list.some(i => {
      const field = i.path[1];
      return typeof field === 'string' && touched[card]?.has(field);
    });
    if (anyTouched) continue;
    const count = list.filter(i => REQUIRED_RE.test(i.message)).length;
    if (count > 0) {
      noteText = `#${card + 1} has ${count} empty required field${count === 1 ? '' : 's'}`;
      break;
    }
  }

  return { touchedText, noteText };
}
