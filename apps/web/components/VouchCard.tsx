import Link from 'next/link';
import { timeAgo, type VouchWithAuthor } from '@vouched/shared';
import { Avatar, CheckMark } from './ui';
import { CosignButton, ReplyControl } from './social';

type Social = { viewerId: string | null; subjectFirstName: string };

export function VouchCard({ v, footer, menu, social }: { v: VouchWithAuthor; footer?: React.ReactNode; menu?: React.ReactNode; social?: Social }) {
  const name = v.author?.display_name ?? 'Deleted account';
  const cos = v.cosigns ?? [];
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
      <div className="sigline">
        <Avatar name={name} url={v.author?.avatar_url} size={34} />
        {v.author ? (
          <Link className="who-link" href={`/${v.author.username}`} style={{ textDecoration: 'none' }}>
            <span className="sig">{name}</span><span className="rec">{timeAgo(v.approved_at ?? v.created_at)}</span>
          </Link>
        ) : <span className="sig">{name}</span>}
        {v.author?.phone_verified && <span className="stamp"><CheckMark size={11} color="currentColor" /> Real person</span>}
      </div>
      {social && v.status === 'approved' && (
        <>
          <div className="actions">
            <CosignButton vouchId={v.id} count={cos.length} mine={!!social.viewerId && cos.some(c => c.user_id === social.viewerId)}
              canCosign={social.viewerId !== v.subject_id && social.viewerId !== v.author_id} viewerId={social.viewerId} />
          </div>
          {v.reply ? (
            <div className="reply"><b>{social.subjectFirstName} replied</b><span>{v.reply}</span></div>
          ) : social.viewerId === v.subject_id ? (
            <ReplyControl vouchId={v.id} firstName={(v.author?.display_name ?? '').split(' ')[0] || 'them'} />
          ) : null}
        </>
      )}
      {footer}
    </article>
  );
}
