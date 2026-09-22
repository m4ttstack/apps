import type { ReactNode } from 'react';
import { Invadr } from 'invadrs/react';

/** A card's lead line about a person: their invader and name, then what
    they did ("opened !12 into main", "reviewed your merge request"), with
    anything `trailing` (the MR's links) held to the right edge. */
export function PersonLead({
  id,
  name,
  children,
  trailing,
}: {
  /** The username the invader is generated from. */
  id: string;
  name: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="tui-id-card-top">
      <Invadr id={id} palette="css-vars" className="tui-id-card-avatar" />
      <p className="tui-id-card-lead">
        <strong className="tui-person-name">{name}</strong> {children}
      </p>
      {trailing}
    </div>
  );
}
