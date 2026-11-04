import { REQUEST_SELECT, type RecRequest, type SearchResult } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { DiscoverSearch, PersonRow } from '@/components/social';
import { FeedRequest } from '@/components/Feed';

export const metadata = { title: 'Discover' };

export default async function Discover() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const near = profile.show_city && profile.city ? profile.city : null;

  const [{ data: f }, { data: local }, { data: top }, { data: asks }, { data: circ }] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', profile.id),
    near ? supabase.rpc('search_profiles', { q: '', near, lim: 8 }) : Promise.resolve({ data: [] }),
    supabase.rpc('search_profiles', { q: '', lim: 20 }),
    supabase.from('requests').select(REQUEST_SELECT).neq('author_id', profile.id).order('created_at', { ascending: false }).limit(3),
    supabase.rpc('my_circle', { max_steps: 3 }),
  ]);
  const circle: Record<string, number> = Object.fromEntries(((circ ?? []) as { id: string; steps: number }[]).map(c => [c.id, c.steps]));
  const byCloseness = (a: SearchResult, b: SearchResult) => (circle[a.id] ?? 9) - (circle[b.id] ?? 9) || b.vouches - a.vouches;
  const following = (f ?? []).map(x => x.followee_id as string);
  const nearby = ((local ?? []) as SearchResult[]).filter(p => p.id !== profile.id);
  const everyone = ((top ?? []) as SearchResult[]).filter(p => p.id !== profile.id).sort(byCloseness);
  const openAsks = (asks ?? []) as unknown as RecRequest[];

  return (
    <Screen title="Discover">
      <DiscoverSearch initial={[]} viewerId={profile.id} followingIds={following} circle={circle} />

      {nearby.length > 0 && (
        <section className="stack">
          <span className="label">Most vouched in {near}</span>
          <div className="panel" style={{ gap: 0 }}>{nearby.map(p => <PersonRow key={p.id} p={p} viewerId={profile.id} following={following.includes(p.id)} steps={circle[p.id]} />)}</div>
        </section>
      )}

      {openAsks.length > 0 && (
        <section className="stack">
          <span className="label">Open asks</span>
          {openAsks.map(r => <FeedRequest key={r.id} r={r} viewerId={profile.id} />)}
        </section>
      )}

      <section className="stack">
        <span className="label">Closest to you</span>
        {everyone.length
          ? <div className="panel" style={{ gap: 0 }}>{everyone.map(p => <PersonRow key={p.id} p={p} viewerId={profile.id} following={following.includes(p.id)} steps={circle[p.id]} />)}</div>
          : <div className="empty">You’re early. Invite people you know and they’ll show up here.</div>}
      </section>
    </Screen>
  );
}
