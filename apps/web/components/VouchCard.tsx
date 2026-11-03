import Link from 'next/link';
import { timeAgo, type VouchWithAuthor } from '@vouched/shared';
import { VerifiedPerson } from './ui';

export function VouchCard({ v, footer, menu }: { v: VouchWithAuthor; footer?: React.ReactNode; menu?: React.ReactNode }) {
  const name = v.author?.display_name ?? 'Deleted account';
  return (
    <article className="vouch">
      <div className="meta">
        <span className="rel">{v.relationship}</span>
        <span className="row" style={{ gap: 6 }}>
          <span>{v.duration}</span>
          {menu}
        </span>
      </div>
      <blockquote>{v.body}</blockquote>
      {v.traits.length > 0 && (
        <div className="row" style={{ gap: 6 }}>
          {v.traits.map(t => <span key={t} className="tag">{t}</span>)}
        </div>
      )}
      <div className="sig">
        {v.author ? <Link href={`/${v.author.username}`}><b>{name}</b></Link> : <b>{name}</b>}
        <span className="row" style={{ gap: 8 }}>
          {v.author && <VerifiedPerson />}
          <span className="hint">{timeAgo(v.approved_at ?? v.created_at)}</span>
        </span>
      </div>
      {footer}
    </article>
  );
}
