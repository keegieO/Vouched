import Link from 'next/link';
import { timeAgo, type RecRequest, type VouchWithBoth } from '@vouched/shared';
import { Avatar } from './ui';
import { CosignButton } from './social';

const firstName = (n?: string | null) => (n ?? '').split(' ')[0] || 'them';

export function FeedVouch({ v, viewerId, alreadyVouched }: { v: VouchWithBoth; viewerId: string; alreadyVouched: boolean }) {
  if (!v.author || !v.subject) return null;
  const cos = v.cosigns ?? [];
  return (
    <section className="item">
      <div className="item-head">
        <span className="stack-av"><Avatar name={v.author.display_name} url={v.author.avatar_url} size={36} /><Avatar name={v.subject.display_name} url={v.subject.avatar_url} size={36} /></span>
        <p><Link href={`/${v.author.username}`}>{v.author.display_name}</Link> vouched for <Link href={`/${v.subject.username}`}>{v.subject.display_name}</Link> <span className="hint">· {timeAgo(v.approved_at ?? v.created_at)}</span></p>
      </div>
      <div className="quote">
        <span className="rel">{v.relationship} · {v.duration}</span>
        <blockquote>{v.body}</blockquote>
        {v.traits.length > 0 && <div className="row" style={{ gap: 6 }}>{v.traits.map(t => <span key={t} className="tag">{t}</span>)}</div>}
      </div>
      {v.reply && <div className="reply"><b>{firstName(v.subject.display_name)} replied</b><span>{v.reply}</span></div>}
      <div className="actions">
        <CosignButton vouchId={v.id} count={cos.length} mine={cos.some(c => c.user_id === viewerId)}
          canCosign={viewerId !== v.subject_id && viewerId !== v.author_id} viewerId={viewerId} />
        {viewerId !== v.subject_id && !alreadyVouched && (
          <Link className="btn sm ghost" href={`/${v.subject.username}/vouch`}>Vouch for {firstName(v.subject.display_name)} too</Link>
        )}
      </div>
    </section>
  );
}

export function FeedRequest({ r, viewerId }: { r: RecRequest; viewerId: string }) {
  if (!r.author) return null;
  const mine = r.author_id === viewerId;
  const people = Array.from(new Map(r.answers.filter(a => a.recommended).map(a => [a.recommended!.id, a.recommended!])).values());
  return (
    <section className="item">
      <div className="item-head">
        <Avatar name={r.author.display_name} url={r.author.avatar_url} size={36} />
        <p><Link href={`/${r.author.username}`}>{r.author.display_name}</Link> <span className="muted">is asking</span> <span className="hint">· {timeAgo(r.created_at)}</span></p>
      </div>
      <p className="req-body">{r.body}</p>
      {r.city && <span className="hint">📍 {r.city}</span>}
      {people.length ? (
        <div className="row" style={{ gap: 8 }}>
          <span className="stack-av">{people.slice(0, 3).map(p => <Avatar key={p.id} name={p.display_name} url={p.avatar_url} size={28} />)}</span>
          <span className="small muted">
            {r.answers.length} {r.answers.length === 1 ? 'recommendation' : 'recommendations'}: {people.slice(0, 2).map(p => firstName(p.display_name)).join(', ')}{people.length > 2 ? '…' : ''}
          </span>
        </div>
      ) : <span className="small muted">No recommendations yet. Know someone?</span>}
      <div className="actions">
        <Link className={`btn sm ${mine ? 'ghost' : 'primary'}`} href={`/requests/${r.id}`}>{mine ? 'See answers' : 'Recommend someone'}</Link>
      </div>
    </section>
  );
}
