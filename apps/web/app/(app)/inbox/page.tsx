import Link from 'next/link';
import { VOUCH_WITH_AUTHOR, timeAgo, type VouchWithAuthor } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { VouchCard } from '@/components/VouchCard';
import { Avatar } from '@/components/ui';
import { ReportMenu } from '@/components/client';
import { VouchActions, MarkRead } from './InboxActions';

export const metadata = { title: 'Inbox' };

type Notif = {
  id: string; type: 'new_vouch' | 'vouch_approved'; read: boolean; created_at: string;
  actor: { username: string; display_name: string; avatar_url: string | null } | null;
};

export default async function Inbox({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const tab = searchParams.tab === 'hidden' ? 'hidden' : searchParams.tab === 'activity' ? 'activity' : 'pending';

  const [{ data: pending }, { data: hidden }, { data: notifs }] = await Promise.all([
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'hidden').order('created_at', { ascending: false }),
    supabase.from('notifications').select('id, type, read, created_at, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50),
  ]);
  const P = (pending ?? []) as unknown as VouchWithAuthor[];
  const H = (hidden ?? []) as unknown as VouchWithAuthor[];
  const N = (notifs ?? []) as unknown as Notif[];
  const unread = N.filter(n => !n.read).length;

  return (
    <div className="stack-lg narrow">
      <div className="stack">
        <h1 style={{ fontSize: 'clamp(30px,5vw,44px)' }}>Inbox</h1>
        <p className="muted">Nothing shows on your profile until you approve it. Hidden vouches stay private.</p>
      </div>
      <nav className="segmented" aria-label="Inbox sections">
        <Link href="/inbox" aria-current={tab === 'pending' ? 'page' : undefined}>Waiting ({P.length})</Link>
        <Link href="/inbox?tab=hidden" aria-current={tab === 'hidden' ? 'page' : undefined}>Hidden ({H.length})</Link>
        <Link href="/inbox?tab=activity" aria-current={tab === 'activity' ? 'page' : undefined}>Activity{unread ? ` (${unread})` : ''}</Link>
      </nav>

      {tab === 'pending' && (P.length ? P.map(v => (
        <VouchCard key={v.id} v={v} menu={<ReportMenu vouchId={v.id} signedIn />} footer={<VouchActions vouchId={v.id} authorId={v.author_id} mode="pending" />} />
      )) : <div className="empty">You’re all caught up. New vouches land here first.<br /><Link href="/ask">Ask for more</Link></div>)}

      {tab === 'hidden' && (H.length ? H.map(v => (
        <VouchCard key={v.id} v={v} footer={<VouchActions vouchId={v.id} authorId={v.author_id} mode="hidden" />} />
      )) : <div className="empty">No hidden vouches.</div>)}

      {tab === 'activity' && (
        <>
          <MarkRead userId={profile.id} hasUnread={unread > 0} />
          {N.length ? (
            <div className="panel" style={{ gap: 0 }}>
              {N.map((n, i) => (
                <div key={n.id} className="row" style={{ padding: '12px 0', borderTop: i ? '1px solid var(--line)' : 0, flexWrap: 'nowrap' }}>
                  <Avatar name={n.actor?.display_name ?? '?'} url={n.actor?.avatar_url} size={40} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: n.read ? 500 : 700 }}>
                      {n.actor ? <Link href={`/${n.actor.username}`}>{n.actor.display_name}</Link> : 'Someone'}
                      {n.type === 'new_vouch' ? ' wrote you a vouch.' : ' approved your vouch.'}
                    </p>
                    <span className="hint">{timeAgo(n.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="empty">No activity yet.</div>}
        </>
      )}
    </div>
  );
}
