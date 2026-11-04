import Link from 'next/link';
import { notFound } from 'next/navigation';
import { REQUEST_SELECT, groupAnswers, timeAgo, type RecRequest } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Avatar } from '@/components/ui';
import { DeleteRequest, RecommendForm } from '@/components/social';

export const metadata = { title: 'Ask' };

export default async function RequestPage({ params, searchParams }: { params: { id: string }; searchParams: { posted?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const { data } = await supabase.from('requests').select(REQUEST_SELECT).eq('id', params.id).maybeSingle();
  const r = data as unknown as RecRequest | null;
  if (!r || !r.author) notFound();
  const mine = r.author_id === profile.id;
  const groups = groupAnswers(r.answers);

  return (
    <div className="stack-lg narrow">
      <Link className="small" href="/feed">← Feed</Link>
      {searchParams.posted && <p className="success">Posted. People who follow you can answer with someone they trust.</p>}
      <section className="item">
        <div className="item-head">
          <Avatar name={r.author.display_name} url={r.author.avatar_url} size={40} />
          <p><Link href={`/${r.author.username}`}>{r.author.display_name}</Link> <span className="muted">is asking · {timeAgo(r.created_at)}</span></p>
        </div>
        <p className="req-body">{r.body}</p>
        {r.city && <span className="hint">📍 {r.city}</span>}
        {mine && <DeleteRequest requestId={r.id} />}
      </section>

      <span className="label">{r.answers.length} {r.answers.length === 1 ? 'recommendation' : 'recommendations'}</span>
      {groups.length ? groups.map(g => (
        <section key={g.person.id} className="item">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Avatar name={g.person.display_name} url={g.person.avatar_url} size={52} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b><Link href={`/${g.person.username}`}>{g.person.display_name}</Link></b>
              {g.person.headline && <div className="hint">{g.person.headline}</div>}
              <div className="hint">Recommended by {g.answers.length}</div>
            </div>
            <Link className="btn sm primary" href={`/${g.person.username}`}>View</Link>
          </div>
          {g.answers.map(a => (
            <div key={a.id} className="answer">
              <Avatar name={a.author?.display_name ?? '?'} url={a.author?.avatar_url} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="small"><b>{a.author?.display_name ?? 'Someone'}</b> <span className="hint">{timeAgo(a.created_at)}</span></p>
                {a.note && <p className="small">{a.note}</p>}
              </div>
            </div>
          ))}
        </section>
      )) : <div className="empty">{mine ? 'No answers yet. Share it with friends so they can point you to someone.' : 'No recommendations yet. Be the first.'}</div>}

      {!mine && <RecommendForm requestId={r.id} askerId={r.author_id} viewerId={profile.id} />}
    </div>
  );
}
