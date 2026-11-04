import Link from 'next/link';
import { REQUEST_SELECT, VOUCH_WITH_BOTH, type RecRequest, type SearchResult, type VouchWithBoth } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { FeedRequest, FeedVouch } from '@/components/Feed';
import { PersonRow } from '@/components/social';

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

  const [{ data: vs }, { data: rs }, { data: mine }, { data: sugg }] = await Promise.all([
    vq, rq,
    supabase.from('vouches').select('subject_id').eq('author_id', profile.id),
    supabase.rpc('search_profiles', { q: '', near: profile.show_city && profile.city ? profile.city : null, lim: 12 }),
  ]);
  const vouches = (vs ?? []) as unknown as VouchWithBoth[];
  const requests = (rs ?? []) as unknown as RecRequest[];
  const vouchedFor = new Set((mine ?? []).map(x => x.subject_id as string));
  const suggestions = ((sugg ?? []) as SearchResult[]).filter(p => p.id !== profile.id && !following.includes(p.id)).slice(0, 4);

  const items = [
    ...vouches.map(v => ({ t: v.approved_at ?? v.created_at, node: <FeedVouch key={v.id} v={v} viewerId={profile.id} alreadyVouched={vouchedFor.has(v.subject_id)} /> })),
    ...requests.map(r => ({ t: [r.created_at, ...r.answers.map(a => a.created_at)].sort().at(-1)!, node: <FeedRequest key={r.id} r={r} viewerId={profile.id} /> })),
  ].sort((a, b) => (a.t < b.t ? 1 : -1));

  return (
    <div className="stack-lg narrow">
      <div className="row between">
        <h1 style={{ fontSize: 'clamp(30px,5vw,44px)' }}>Feed</h1>
        <Link className="btn sm primary" href="/ask?tab=rec">Ask for a rec</Link>
      </div>
      <nav className="segmented" aria-label="Feed">
        <Link href="/feed?tab=following" aria-current={tab === 'following' ? 'page' : undefined}>Following</Link>
        <Link href="/feed?tab=everyone" aria-current={tab === 'everyone' ? 'page' : undefined}>Everyone</Link>
      </nav>

      {suggestions.length > 0 && following.length < 3 && (
        <section className="panel">
          <h3>{following.length ? 'More people near you' : 'Follow people you know'}</h3>
          <p className="muted small">Their vouches and recommendation asks show up in your feed.</p>
          <div>{suggestions.map(p => <PersonRow key={p.id} p={p} viewerId={profile.id} following={false} />)}</div>
        </section>
      )}

      <div className="feed">
        {items.length ? items.map(i => i.node) : (
          <div className="empty">Nothing here yet. Follow a few people, or switch to Everyone.</div>
        )}
      </div>
    </div>
  );
}
