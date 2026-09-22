import { extractTicketId, ticketUrl } from '../../ticket.ts';
import type { BoardMRWithReview } from '../types.ts';
import { GitHubLogo, GitLabLogo, LinearLogo } from './icons.tsx';

/** The MR's two external homes as logo links: its forge page, and the
    Linear ticket its branch or title names (absent when it names none). */
export function MrLinks({ mr }: { mr: BoardMRWithReview }) {
  const ticket = mr.sourceBranch
    ? extractTicketId(mr.sourceBranch, mr.title)
    : null;
  const github = mr.webUrl?.includes('github.com') ?? false;
  const forge = github ? 'GitHub' : 'GitLab';
  return (
    <span className="tui-mr-links">
      {mr.webUrl && (
        <a
          className="tui-mr-link"
          href={mr.webUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`open !${mr.iid} in ${forge}`}
          aria-label={`open !${mr.iid} in ${forge}`}
        >
          {github ? <GitHubLogo /> : <GitLabLogo />}
        </a>
      )}
      {ticket && (
        <a
          className="tui-mr-link"
          href={ticketUrl(ticket)}
          target="_blank"
          rel="noopener noreferrer"
          title={`open ${ticket} in Linear`}
          aria-label={`open ${ticket} in Linear`}
        >
          <LinearLogo />
        </a>
      )}
    </span>
  );
}
