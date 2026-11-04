import Link from 'next/link';
import { REQUEST_SELECT, VOUCH_WITH_BOTH, type RecRequest, type SearchResult, type VouchWithBoth } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { FeedRequest, FeedVouch } from '@/components/Feed';
import { FollowButton } from '@/components/social';
import { Avatar } from '@/components/ui';
import { PropsCard } from '@/components/trust';
import { PROPS_PER_ROUND } from '@vouched/shared';

export const metadata = { title: 'Feed' };

export default async function Feed({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;

  const { data: f } = await supabase.from('follows').select('followee_id').eq('follower_id', profile.id);
  const following = (f ?? []).map(x => x.followee_id as string);
  const tab = searchParams.tab === 'everyone' || (!searchParams.tab && following.length === 0) ? 'everyone' : 'following';
  const scope = tab === 'following' ? [...following, profile.id] : null;
  const ids = scope ? `(${scope.join(',')})` : '';

  let vq = supabase.from('vouches').select(VOUCH_WITH_BOTH).eq('status', 'approved').order('approved_at', { ascending: false }).limit(40);
  if (scope) vq = vq.or(`author_id.in.${ids},subject_id.in.${ids}`);
  let rq = supabase.from('requests').select(REQUEST_SELECT).order('created_at', { ascending: false }).limit(20);
  if (scope) rq = rq.in('author_id', scope);

  let jq = supabase.from('profiles').select('id, username, display_name, avatar_url, created_at, inviter:profiles!profiles_invited_by_fkey(username, display_name, avatar_url)')
    .not('invited_by', 'is', null).eq('standing', 'good').order('created_at', { ascending: false }).limit(12);
  if (scope) jq = jq.or(`id.in.${ids},invited_by.in.${ids}`);

  const [{ data: vs }, { data: rs }, { data: mine }, { data: sugg }, { data: js }, { data: propsToday }] = await Promise.all([
    vq, rq,
    supabase.from('vouches').select('subject_id').eq('author_id', profile.id),
    supabase.rpc('search_profiles', { q: '', near: profile.show_city && profile.city ? profile.city : null, lim: 12 }),
    jq,
    supabase.rpc('props_given_today'),
  ]);
  type Join = { id: string; username: string; display_name: string; avatar_url: string | null; created_at: string;
    inviter: { username: string; display_name: string; avatar_url: string | null } | null };
  const joins = ((js ?? []) as unknown as Join[]).filter(j => j.inviter && j.id !== profile.id);
  const vouches = (vs ?? []) as unknown as VouchWithBoth[];
  const requests = (rs ?? []) as unknown as RecRequest[];
  const vouchedFor = new Set((mine ?? []).map(x => x.subject_id as string));
  const suggestions = ((sugg ?? []) as SearchResult[]).filter(p => p.id !== profile.id && !following.includes(p.id)).slice(0, 8);

  const items = [
    ...vouches.map(v => ({ t: v.approved_at ?? v.created_at, node: <FeedVouch key={v.id} v={v} viewerId={profile.id} alreadyVouched={vouchedFor.has(v.subject_id)} /> })),
    ...joins.map(j => ({ t: j.created_at, node: (
      <section key={`j${j.id}`} className="item">
        <div className="item-head">
          <span className="av-stack"><Avatar name={j.inviter!.display_name} url={j.inviter!.avatar_url} size={38} /><Avatar name={j.display_name} url={j.avatar_url} size={38} /></span>
          <p><Link href={`/${j.inviter!.username}`}><b>{j.inviter!.display_name}</b></Link> vouched <Link href={`/${j.username}`}><b>{j.display_name}</b></Link> in</p>
        </div>
        <div className="actions"><FollowButton targetId={j.id} following={following.includes(j.id)} viewerId={profile.id} /></div>
      </section>
    ) })),
    ...requests.map(r => ({ t: [r.created_at, ...r.answers.map(a => a.created_at)].sort().at(-1)!, node: <FeedRequest key={r.id} r={r} viewerId={profile.id} /> })),
  ].sort((a, b) => (a.t < b.t ? 1 : -1));

  return (
    <Screen title="Home" actions={<Link className="btn sm primary" href="/ask?tab=rec">Ask for a rec</Link>}>
      <PropsCard given={(propsToday as number | null) ?? 0} total={PROPS_PER_ROUND} />
      <nav className="segmented" aria-label="Feed">
        <Link href="/feed?tab=following" aria-current={tab === 'following' ? 'page' : undefined}>Following</Link>
        <Link href="/feed?tab=everyone" aria-current={tab === 'everyone' ? 'page' : undefined}>Everyone</Link>
      </nav>

      {suggestions.length > 0 && following.length < 5 && (
        <section className="stack">
          <div className="row between"><h3>{following.length ? 'More people near you' : 'People you may know'}</h3><Link className="link small" href="/discover">See all</Link></div>
          <div className="carousel">
            {suggestions.map(p => (
              <div key={p.id} className="pcard">
                <Avatar name={p.display_name} url={p.avatar_url} size={64} />
                <Link href={`/${p.username}`}>{p.display_name}</Link>
                <span>{p.headline || `@${p.username}`}</span>
                <FollowButton targetId={p.id} following={false} viewerId={profile.id} />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="feed">
        {items.length ? items.map(i => i.node) : (
          <div className="empty">Nothing here yet. Follow a few people, or switch to Everyone.</div>
        )}
      </div>
    </Screen>
  );
}
