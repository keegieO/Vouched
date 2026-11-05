import Link from 'next/link';
import { NOTIFICATION_TEXT, VOUCH_WITH_AUTHOR, timeAgo, type NotificationType, type VouchWithAuthor } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { VouchCard } from '@/components/VouchCard';
import { Avatar } from '@/components/ui';
import { ReportMenu } from '@/components/client';
import { Screen } from '@/components/Screen';
import { Icon } from '@/components/Icon';
import { VouchActions, MarkRead, DismissRequest } from './InboxActions';
import { VibeReview, VouchAgain } from '@/components/v2';
import { VIBE_PROMPTS } from '@vouched/shared';

export const metadata = { title: 'Activity' };

type Notif = {
  id: string; type: NotificationType; read: boolean; created_at: string; request_id: string | null; meta: { emoji?: string; label?: string; text?: string } | null; ref_id: string | null;
  prompt: { question: string; label: string; icon: string; emoji: string | null } | null;
  actor: { username: string; display_name: string; avatar_url: string | null } | null;
};
type VReq = { id: string; created_at: string; requester: { id: string; username: string; display_name: string; avatar_url: string | null } | null };

export default async function Activity({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const tab = searchParams.tab === 'hidden' ? 'hidden' : searchParams.tab === 'review' ? 'review' : searchParams.tab === 'notes' ? 'notes' : 'activity';

  const [{ data: pending }, { data: hidden }, { data: notifs }, { data: reqs }, { data: week }, { data: views }, { data: due }, { data: vibes }, { data: notes }] = await Promise.all([
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'hidden').order('created_at', { ascending: false }),
    supabase.from('notifications').select('id, type, read, created_at, request_id, meta, ref_id, prompt:prompts(question, label, icon, emoji), actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(60),
    supabase.from('vouch_requests').select('id, created_at, requester:profiles!vouch_requests_requester_id_fkey(id, username, display_name, avatar_url)')
      .eq('recipient_id', profile.id).eq('done', false).order('created_at', { ascending: false }),
    supabase.rpc('my_week'),
    supabase.rpc('my_profile_views', { days: 7 }),
    supabase.rpc('vouch_again_due'),
    supabase.from('vibe_answers').select('id, prompt, body, created_at, author:profiles!vibe_answers_author_id_fkey(username, display_name, avatar_url)').eq('subject_id', profile.id).eq('status', 'pending').order('created_at', { ascending: false }),
    supabase.from('private_notes').select('id, body, created_at, sender:profiles!private_notes_sender_id_fkey(username, display_name, avatar_url)').eq('recipient_id', profile.id).order('created_at', { ascending: false }).limit(20),
  ]);
  type Mini = { username: string; display_name: string; avatar_url: string | null } | null;
  const weekN = ((week ?? []) as { n: number }[]).reduce((n, r) => n + Number(r.n), 0);
  const dueRow = ((due ?? []) as { subject_id: string; display_name: string }[])[0];
  const V = (vibes ?? []) as unknown as { id: string; prompt: number; body: string; created_at: string; author: Mini }[];
  const NOTES = (notes ?? []) as unknown as { id: string; body: string; created_at: string; sender: Mini }[];
  const P = (pending ?? []) as unknown as VouchWithAuthor[];
  const H = (hidden ?? []) as unknown as VouchWithAuthor[];
  const N = (notifs ?? []) as unknown as Notif[];
  const R = ((reqs ?? []) as unknown as VReq[]).filter(r => r.requester);
  const unread = N.filter(n => !n.read).length;
  const today = N.filter(n => Date.now() - new Date(n.created_at).getTime() < 86400000);
  const earlier = N.filter(n => !today.includes(n));
  const href = (n: Notif) => n.request_id ? `/requests/${n.request_id}` : n.type === 'new_vouch' || n.type === 'vibe' ? '/inbox?tab=review' : n.type === 'private_note' ? '/inbox?tab=notes' : n.actor ? `/${n.actor.username}` : '/inbox';

  const group = (title: string, list: Notif[]) => list.length > 0 && (
    <>
      <span className="label list-head">{title}</span>
      <section className="list">
        {list.map(n => n.type === 'props' ? (
          <div key={n.id} className="person" style={{ background: n.read ? undefined : 'var(--hi-soft)' }}>
            <span className="avatar" style={{ width: 42, height: 42, background: 'var(--hi)', color: 'var(--hi-ink)', fontSize: 20 }}>{n.prompt?.emoji ?? <Icon name={n.prompt?.icon ?? 'sparkle'} size="sm" />}</span>
            <span className="grow">Someone picked you for <b>{n.prompt?.label ?? 'props'}</b><br /><span className="hint">“{n.prompt?.question}” · {timeAgo(n.created_at)}</span></span>
          </div>
        ) : (
          <Link key={n.id} href={href(n)} className="person" style={{ textDecoration: 'none', color: 'inherit', background: n.read ? undefined : 'var(--accent-soft)' }}>
            <Avatar name={n.actor?.display_name ?? '?'} url={n.actor?.avatar_url} size={42} />
            <span className="grow"><b>{n.actor?.display_name ?? 'Someone'}</b> {NOTIFICATION_TEXT[n.type] ?? ''}{n.type === 'gift' && n.meta ? ` ${n.meta.emoji ?? ''} ${n.meta.label ?? ''}` : ''}{n.type === 'reaction' && n.meta?.emoji ? ` ${n.meta.emoji}` : ''}<br />
              <span className="hint">{n.type === 'comment' && n.meta?.text ? `“${n.meta.text}” · ` : ''}{timeAgo(n.created_at)}</span></span>
          </Link>
        ))}
      </section>
    </>
  );

  return (
    <Screen title="Activity">
      <nav className="segmented" aria-label="Activity sections">
        <Link href="/inbox" aria-current={tab === 'activity' ? 'page' : undefined}>Activity{unread ? ` (${unread})` : ''}</Link>
        <Link href="/inbox?tab=review" aria-current={tab === 'review' ? 'page' : undefined}>Review ({P.length + V.length})</Link>
        <Link href="/inbox?tab=notes" aria-current={tab === 'notes' ? 'page' : undefined}>Private</Link>
        <Link href="/inbox?tab=hidden" aria-current={tab === 'hidden' ? 'page' : undefined}>Hidden</Link>
      </nav>

      {tab === 'activity' && (
        <>
          <MarkRead userId={profile.id} hasUnread={unread > 0} />
          <section className="list">
            {weekN > 0 && <Link className="li" href="/props/week" style={{ background: 'var(--hi-soft)' }}><span className="ico" style={{ background: 'var(--hi)', fontSize: 18 }}>🎁</span><span className="grow"><b>Your weekly results are ready</b><br /><span className="hint">Friends voted you {weekN} {weekN === 1 ? 'time' : 'times'} this week</span></span><Icon name="chev" size="sm" /></Link>}
            <div className="li static"><span className="ico"><Icon name="eye" size="sm" /></span><span className="grow"><b>{(views as number | null) ?? 0} people viewed your profile this week</b><br /><span className="hint">Names stay private</span></span></div>
            {dueRow && <VouchAgain subjectId={dueRow.subject_id} name={dueRow.display_name} />}
          </section>
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
          {V.length > 0 && (
            <section className="list">
              {V.map(v => (
                <div key={v.id} className="person">
                  <Avatar name={v.author?.display_name ?? '?'} url={v.author?.avatar_url} size={42} />
                  <span className="grow"><b>{v.author?.display_name ?? 'Someone'}</b> answered your vibe<br /><span className="hint">{VIBE_PROMPTS[v.prompt]}: “{v.body}”</span></span>
                  <VibeReview id={v.id} />
                </div>
              ))}
            </section>
          )}
          <p className="muted">Nothing shows on your profile until you add it. Hidden vouches stay private.</p>
          {P.length ? P.map(v => (
            <VouchCard key={v.id} v={v} menu={<ReportMenu vouchId={v.id} signedIn />} footer={<VouchActions vouchId={v.id} authorId={v.author_id} mode="pending" />} />
          )) : <div className="empty"><Icon name="check" /><p>You’re all caught up.</p><Link className="btn sm primary" href="/ask">Ask for more vouches</Link></div>}
        </>
      )}

      {tab === 'notes' && (NOTES.length ? (
        <>
          <p className="muted">Private feedback from people you know. Only you can see it.</p>
          <section className="list">
            {NOTES.map(n => (
              <div key={n.id} className="person" style={{ alignItems: 'flex-start' }}>
                <Avatar name={n.sender?.display_name ?? '?'} url={n.sender?.avatar_url} size={42} />
                <span className="grow">{n.sender ? <Link href={`/${n.sender.username}`} style={{ textDecoration: 'none' }}><b>{n.sender.display_name}</b></Link> : <b>Someone</b>} <span className="hint">· {timeAgo(n.created_at)}</span><br /><span style={{ overflowWrap: 'anywhere' }}>{n.body}</span></span>
              </div>
            ))}
          </section>
        </>
      ) : <div className="empty"><Icon name="lock" /><p>No private feedback. When someone sends you some, only you will see it here.</p></div>)}

      {tab === 'hidden' && (H.length ? H.map(v => (
        <VouchCard key={v.id} v={v} footer={<VouchActions vouchId={v.id} authorId={v.author_id} mode="hidden" />} />
      )) : <div className="empty"><p>No hidden vouches.</p></div>)}
    </Screen>
  );
}
