import { Invadr } from 'invadrs/react';

import type { BoardMRWithReview } from '../types.ts';
import { ago, cleanTitle } from './format.ts';
import { MrLinks } from './MrLinks.tsx';

/** The MR a sheet decides on: author, where it merges, title, branch, diff
    size, and its forge and Linear links. */
export function MrCard({ mr }: { mr: BoardMRWithReview }) {
  return (
    <div className="tui-mr-card">
      <Invadr
        id={mr.author.username}
        palette="css-vars"
        className="tui-mr-card-avatar"
      />
      <div className="tui-mr-card-body">
        <div className="tui-mr-card-head">
          <span className="tui-mr-card-author">
            {mr.author.name || mr.author.username}
          </span>
          <span className="tui-mr-card-open">
            opened !{mr.iid} into {mr.targetBranch} ·{' '}
            {ago(mr.createdAt, Date.now())}
          </span>
        </div>
        <h2 className="tui-mr-card-title">{cleanTitle(mr.title)}</h2>
        <div className="tui-mr-card-meta">
          <span className="tui-branch">{mr.sourceBranch}</span>
          {mr.diff && (
            <span className="tui-mr-card-diff">
              <span className="tui-mr-card-diff-add">+{mr.diff.additions}</span>
              <span className="tui-mr-card-diff-del">-{mr.diff.deletions}</span>
            </span>
          )}
        </div>
      </div>
      <MrLinks mr={mr} />
    </div>
  );
}
