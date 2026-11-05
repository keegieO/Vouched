import Link from 'next/link';
import {
  GIFT_WITH_PEOPLE, VOUCH_WITH_BOTH,
  type FeedResult, type GiftWithPeople, type MyTrust, type ReactionCount, type VouchWithBoth,
} from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { PageHeader } from '@/components/Sheet';
import { Logo } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { CaughtUp, PostGift, PostJoin, PostResult, PostVouch } from '@/components/posts';
import { Stories, type StoryPerson } from '@/components/v2';

export const metadata = { title: 'Home' };
const DAYS = 21;

export default async function Feed({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;

  const { data: f } = await supabase.from('follows').select('followee_id').eq('follower_id', profile.id);
  const following = (f ?? []).map(x => x.followee_id as string);
  const tab = searchParams.tab === 'friends' ? 'friends' : 'for';
  const scope = tab === 'friends' ? [...following, profile.id] : null;
  const ids = scope ? `(${scope.join(',')})` : '';
  const since = new Date(Date.now() - DAYS * 86400000).toISOString();

  let vq = supabase.from('vouches').select(VOUCH_WITH_BOTH).eq('status', 'approved').gte('approved_at', since).order('approved_at', { ascending: false }).limit(40);
  if (scope) vq = vq.or(`author_id.in.${ids},subject_id.in.${ids}`);
  let gq = supabase.from('gifts').select(GIFT_WITH_PEOPLE).gte('created_at', since).order('created_at', { ascending: false }).limit(30);
  if (scope) gq = gq.or(`sender_id.in.${ids},receiver_id.in.${ids}`);
  let jq = supabase.from('profiles').select('id, username, display_name, avatar_url, created_at, inviter:profiles!profiles_invited_by_fkey(username, display_name, avatar_url)')
    .not('invited_by', 'is', null).eq('standing', 'good').gte('created_at', since).order('created_at', { ascending: false }).limit(12);
  if (scope) jq = jq.or(`id.in.${ids},invited_by.in.${ids}`);

  const [{ data: vs }, { data: gs }, { data: js }, { data: results }, { data: drop }, { data: trust }, { data: streak }] = await Promise.all([
    vq, gq, jq,
    supabase.rpc('feed_results', { lim: 10 }),
    supabase.rpc('today_drop'),
    supabase.rpc('my_trust'),
    supabase.rpc('my_streak'),
  ]);
  const vouches = (vs ?? []) as unknown as VouchWithBoth[];
  const gifts = (gs ?? []) as unknown as GiftWithPeople[];
  type Join = { id: string; username: string; display_name: string; avatar_url: string | null; created_at: string; inviter: { username: string; display_name: string; avatar_url: string | null } | null };
  const joins = ((js ?? []) as unknown as Join[]).filter(j => j.inviter && j.id !== profile.id);
  const res = (results ?? []) as FeedResult[];
  const played = ((drop ?? []) as { answered: boolean }[]).some(d => d.answered);
  const t = ((trust ?? []) as MyTrust[])[0];

  const [{ data: vc }, { data: gc }] = await Promise.all([
    vouches.length ? supabase.rpc('reaction_counts', { p_type: 'vouch', p_ids: vouches.map(v => v.id) }) : Promise.resolve({ data: [] }),
    gifts.length ? supabase.rpc('reaction_counts', { p_type: 'gift', p_ids: gifts.map(g => g.id) }) : Promise.resolve({ data: [] }),
  ]);
  const counts = new Map(([...(vc ?? []), ...(gc ?? [])] as ReactionCount[]).map(c => [c.target_id, c]));

  // Stories: people you follow with something new in the last 4 days.
  const fresh = Date.now() - 4 * 86400000;
  const story = new Map<string, StoryPerson>();
  const person = (id: string, p: { username: string; display_name: string; avatar_url: string | null }) =>
    story.get(id) ?? story.set(id, { id, username: p.username, name: p.display_name, avatar: p.avatar_url, slides: [] }).get(id)!;
  vouches.filter(v => following.includes(v.subject_id) && v.subject && v.author && new Date(v.approved_at ?? v.created_at).getTime() > fresh).forEach(v => {
    const sp = person(v.subject_id, v.subject!);
    if (sp.slides.filter(s => s.kind === 'vouch').length < 2) sp.slides.push({ kind: 'vouch', at: v.approved_at ?? v.created_at, from: v.author!.display_name, rel: `${v.relationship} · ${v.duration}`, body: v.body });
  });
  gifts.filter(g => following.includes(g.receiver_id) && g.receiver && g.sender && new Date(g.created_at).getTime() > fresh).forEach(g => {
    const sp = person(g.receiver_id, g.receiver!);
    if (!sp.slides.some(s => s.kind === 'gift')) sp.slides.push({ kind: 'gift', at: g.created_at, from: g.sender!.display_name, emoji: g.type?.emoji ?? '🎁', label: g.type?.label ?? 'Gift', note: g.note });
  });
  res.forEach(r => { const sp = person(r.user_id, r); sp.slides.push({ kind: 'poll', at: new Date().toISOString(), emoji: r.emoji, label: r.label, question: r.question, n: Number(r.n) }); });
  const stories = [...story.values()].filter(s => s.slides.length);

  const items = [
    ...vouches.map(v => ({ t: v.approved_at ?? v.created_at, node: <PostVouch key={v.id} v={v} viewerId={profile.id} counts={counts.get(v.id)} /> })),
    ...gifts.map(g => ({ t: g.created_at, node: <PostGift key={g.id} g={g} viewerId={profile.id} counts={counts.get(g.id)} /> })),
    ...joins.map(j => ({ t: j.created_at, node: <PostJoin key={`j${j.id}`} j={{ ...j, inviter: j.inviter! }} /> })),
    ...res.filter(r => r.user_id !== profile.id).map((r, i) => ({ t: new Date(Date.now() - (i + 1) * 3 * 3600000).toISOString(), node: <PostResult key={`r${r.user_id}`} r={r} /> })),
  ].sort((a, b) => (a.t < b.t ? 1 : -1));

  return (
    <>
      <PageHeader title={<Logo href="/feed" />} actions={<Link className="iconbtn" href="/score" aria-label="Your trust score"><Icon name="shield" /></Link>} />
      <div className="screen flush">
        <nav className="tabs" aria-label="Feed">
          <Link href="/feed" aria-current={tab === 'for' ? 'page' : undefined}>For you</Link>
          <Link href="/feed?tab=friends" aria-current={tab === 'friends' ? 'page' : undefined}>Friends</Link>
        </nav>
        <Stories me={{ name: profile.display_name, avatar: profile.avatar_url }} people={stories} playedToday={played} />
        {!played && (
          <section className="dropcard">
            <span className="streak">🔥 {(streak as number | null) ?? 0} day streak</span>
            <h2>Today’s polls are live</h2>
            <p className="muted small">5 quick questions about your friends. Anonymous, and it shows on their profile. New every day at noon.</p>
            <div><Link className="btn hi" href="/props">Play now</Link></div>
          </section>
        )}
        {t && t.next_tier && (
          <Link className="nudge" href="/score">
            <Icon name="shield" />
            <span className="grow stack" style={{ gap: 6 }}>
              <span className="small"><b>{t.points_to_next} points</b> to <b>{t.next_tier}</b></span>
              <span className="pbar"><b style={{ width: `${Math.round((t.score / (t.score + (t.points_to_next ?? 0) || 1)) * 100)}%` }} /></span>
            </span>
            <Icon name="chev" size="sm" />
          </Link>
        )}
        {items.length ? items.map(i => i.node) : (
          <div className="empty">
            <p>{tab === 'friends' ? 'Nothing new from your friends yet.' : 'Nothing here yet.'} Play today’s polls or vouch someone in to get things going.</p>
            <Link className="btn primary" href="/discover">Find people</Link>
          </div>
        )}
        {items.length > 0 && <CaughtUp />}
      </div>
    </>
  );
}
