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
  fallbackText: string | null;
}

/** `#N field: message` when the issue carries a card index, `issueText`'s
    plain `path: message` otherwise (a list- or map-level issue, path []). */
function fallbackIssueText(issue: SchemaIssue): string {
  const card = issue.path[0];
  if (typeof card !== 'number') return issueText(issue);
  const field = issue.path[1];
  const short = shortIssue(issue);
  return typeof field === 'string'
    ? `#${card + 1} ${field}: ${short}`
    : `#${card + 1}: ${short}`;
}

/** The item cards footer's three lines: the first issue on a touched field
    (numbered to match its card header), a count of empty required fields
    for every card whose issues are all untouched, and a fallback for the
    first remaining issue those two lines never speak for -- a card-level or
    list-level issue (no field in its path), or an issue on an untouched,
    non-required field. Without the fallback, an issue in one of those shapes
    leaves Save disabled with nothing on screen explaining why. `issues`
    carries the card index as `path[0]`, so a shape other than a list of
    objects never matches the touched or note line, only the fallback. */
export function footerSummary(
  issues: SchemaIssue[],
  touched: readonly ReadonlySet<string>[]
): FooterSummary {
  const byCard = new Map<number, SchemaIssue[]>();
  for (const issue of issues) {
    const card = issue.path[0];
    if (typeof card !== 'number') continue;
    const list = byCard.get(card);
    if (list) list.push(issue);
    else byCard.set(card, [issue]);
  }

  const isTouched = (issue: SchemaIssue): boolean => {
    const card = issue.path[0];
    const field = issue.path[1];
    return (
      typeof card === 'number' &&
      typeof field === 'string' &&
      (touched[card]?.has(field) ?? false)
    );
  };

  let touchedText: string | null = null;
  for (const issue of issues) {
    if (!isTouched(issue)) continue;
    const card = issue.path[0] as number;
    const field = issue.path[1] as string;
    touchedText = `#${card + 1} ${field}: ${shortIssue(issue)}`;
    break;
  }

  const untouchedCards: number[] = [];
  for (const card of [...byCard.keys()].sort((a, b) => a - b)) {
    const list = byCard.get(card)!;
    if (list.some(isTouched)) continue;
    if (list.some(i => REQUIRED_RE.test(i.message))) untouchedCards.push(card);
  }
  let noteText: string | null = null;
  if (untouchedCards.length > 0) {
    const count = untouchedCards.reduce(
      (sum, card) =>
        sum + byCard.get(card)!.filter(i => REQUIRED_RE.test(i.message)).length,
      0
    );
    const names = untouchedCards.map(c => `#${c + 1}`).join(', ');
    const verb = untouchedCards.length === 1 ? 'has' : 'have';
    noteText = `${names} ${verb} ${count} empty required field${count === 1 ? '' : 's'}`;
  }

  const isNoted = (issue: SchemaIssue): boolean => {
    const card = issue.path[0];
    return (
      typeof card === 'number' &&
      untouchedCards.includes(card) &&
      REQUIRED_RE.test(issue.message)
    );
  };
  let fallbackText: string | null = null;
  for (const issue of issues) {
    if (isTouched(issue) || isNoted(issue)) continue;
    fallbackText = fallbackIssueText(issue);
    break;
  }

  return { touchedText, noteText, fallbackText };
}
