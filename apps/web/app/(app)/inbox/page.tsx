import Link from 'next/link';
import { NOTIFICATION_TEXT, VOUCH_WITH_AUTHOR, timeAgo, type NotificationType, type VouchWithAuthor } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { VouchCard } from '@/components/VouchCard';
import { Avatar } from '@/components/ui';
import { ReportMenu } from '@/components/client';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { VouchActions, MarkRead, DismissRequest } from './InboxActions';

export const metadata = { title: 'Activity' };

type Notif = {
  id: string; type: NotificationType; read: boolean; created_at: string; request_id: string | null;
  actor: { username: string; display_name: string; avatar_url: string | null } | null;
};
type VReq = { id: string; created_at: string; requester: { id: string; username: string; display_name: string; avatar_url: string | null } | null };

export default async function Activity({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const tab = searchParams.tab === 'hidden' ? 'hidden' : searchParams.tab === 'review' ? 'review' : 'activity';

  const [{ data: pending }, { data: hidden }, { data: notifs }, { data: reqs }] = await Promise.all([
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'hidden').order('created_at', { ascending: false }),
    supabase.from('notifications').select('id, type, read, created_at, request_id, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(60),
    supabase.from('vouch_requests').select('id, created_at, requester:profiles!vouch_requests_requester_id_fkey(id, username, display_name, avatar_url)')
      .eq('recipient_id', profile.id).eq('done', false).order('created_at', { ascending: false }),
  ]);
  const P = (pending ?? []) as unknown as VouchWithAuthor[];
  const H = (hidden ?? []) as unknown as VouchWithAuthor[];
  const N = (notifs ?? []) as unknown as Notif[];
  const R = ((reqs ?? []) as unknown as VReq[]).filter(r => r.requester);
  const unread = N.filter(n => !n.read).length;
  const today = N.filter(n => Date.now() - new Date(n.created_at).getTime() < 86400000);
  const earlier = N.filter(n => !today.includes(n));
  const href = (n: Notif) => n.request_id ? `/requests/${n.request_id}` : n.type === 'new_vouch' ? '/inbox?tab=review' : n.actor ? `/${n.actor.username}` : '/inbox';

  const group = (title: string, list: Notif[]) => list.length > 0 && (
    <>
      <span className="label list-head">{title}</span>
      <section className="list">
        {list.map(n => (
          <Link key={n.id} href={href(n)} className="person" style={{ textDecoration: 'none', color: 'inherit', background: n.read ? undefined : 'var(--accent-soft)' }}>
            <Avatar name={n.actor?.display_name ?? '?'} url={n.actor?.avatar_url} size={42} />
            <span className="grow"><b>{n.actor?.display_name ?? 'Someone'}</b> {NOTIFICATION_TEXT[n.type]}<br /><span className="hint">{timeAgo(n.created_at)}</span></span>
          </Link>
        ))}
      </section>
    </>
  );

  return (
    <Screen title="Activity">
      <nav className="segmented" aria-label="Activity sections">
        <Link href="/inbox" aria-current={tab === 'activity' ? 'page' : undefined}>Activity{unread ? ` (${unread})` : ''}</Link>
        <Link href="/inbox?tab=review" aria-current={tab === 'review' ? 'page' : undefined}>Review ({P.length})</Link>
        <Link href="/inbox?tab=hidden" aria-current={tab === 'hidden' ? 'page' : undefined}>Hidden ({H.length})</Link>
      </nav>

      {tab === 'activity' && (
        <>
          <MarkRead userId={profile.id} hasUnread={unread > 0} />
          {P.length > 0 && (
            <Link className="banner row nowrap" href="/inbox?tab=review" style={{ textDecoration: 'none' }}>
              <Icon name="inbox" size="sm" /><span className="grow"><b>{P.length} {P.length === 1 ? 'vouch' : 'vouches'} to review.</b> Nothing shows until you add it.</span><Icon name="chev" size="sm" />
            </Link>
          )}
          {R.length > 0 && (
            <>
              <span className="label list-head">Asked you for a vouch</span>
              <section className="list">
                {R.map(r => (
                  <div key={r.id} className="person">
                    <Avatar name={r.requester!.display_name} url={r.requester!.avatar_url} size={42} />
                    <Link className="grow" href={`/${r.requester!.username}`} style={{ textDecoration: 'none' }}><b>{r.requester!.display_name}</b><br /><span className="hint">{timeAgo(r.created_at)}</span></Link>
                    <Link className="btn sm primary" href={`/${r.requester!.username}/vouch`}>Vouch</Link>
                    <DismissRequest id={r.id} />
                  </div>
                ))}
              </section>
            </>
          )}
          {group('Today', today)}
          {group('Earlier', earlier)}
          {!N.length && !R.length && !P.length && <div className="empty"><Icon name="bell" /><p>No activity yet. When people follow you, vouch for you or ask you for a rec, it shows up here.</p></div>}
        </>
      )}

      {tab === 'review' && (
        <>
          <p className="muted">Nothing shows on your profile until you add it. Hidden vouches stay private.</p>
          {P.length ? P.map(v => (
            <VouchCard key={v.id} v={v} menu={<ReportMenu vouchId={v.id} signedIn />} footer={<VouchActions vouchId={v.id} authorId={v.author_id} mode="pending" />} />
          )) : <div className="empty"><Icon name="check" /><p>You’re all caught up.</p><Link className="btn sm primary" href="/ask">Ask for more vouches</Link></div>}
        </>
      )}

      {tab === 'hidden' && (H.length ? H.map(v => (
        <VouchCard key={v.id} v={v} footer={<VouchActions vouchId={v.id} authorId={v.author_id} mode="hidden" />} />
      )) : <div className="empty"><p>No hidden vouches.</p></div>)}
    </Screen>
  );
}
