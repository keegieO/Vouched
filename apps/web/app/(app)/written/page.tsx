import Link from 'next/link';
import { VOUCH_WITH_SUBJECT, type VouchWithSubject } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { Avatar } from '@/components/ui';
import { DeleteMine } from './DeleteMine';

export const metadata = { title: 'Vouches you wrote' };

const STATUS = { pending: 'Waiting for approval', approved: 'On their profile', hidden: 'Not shown' } as const;

export default async function Written() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const { data } = await supabase.from('vouches').select(VOUCH_WITH_SUBJECT).eq('author_id', profile.id).order('created_at', { ascending: false });
  const list = (data ?? []) as unknown as VouchWithSubject[];

  return (
    <Screen title="Vouches you wrote" back>
      <div className="stack">
        <p className="muted">Editing a vouch sends it back for approval.</p>
      </div>
      {list.length ? list.map(v => (
        <article key={v.id} className="vouch">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <Avatar name={v.subject?.display_name ?? '?'} url={v.subject?.avatar_url} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <b>{v.subject ? <Link href={`/${v.subject.username}`}>{v.subject.display_name}</Link> : 'Deleted account'}</b>
              <div className="hint">{v.relationship} · {STATUS[v.status]}</div>
            </div>
          </div>
          <blockquote>{v.body}</blockquote>
          {v.reply && <div className="reply"><b>{v.subject?.display_name.split(' ')[0] ?? 'They'} replied</b><span>{v.reply}</span></div>}
          {v.subject && (
            <div className="row">
              <Link className="btn sm ghost" href={`/${v.subject.username}/vouch`}>Edit</Link>
              <DeleteMine id={v.id} />
            </div>
          )}
        </article>
      )) : <div className="empty">You haven’t vouched for anyone yet. Think of someone who deserves it.</div>}
    </Screen>
  );
}
