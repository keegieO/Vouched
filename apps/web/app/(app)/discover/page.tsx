import { REQUEST_SELECT, type RecRequest, type SearchResult } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { DiscoverSearch, PersonRow } from '@/components/social';
import { FeedRequest } from '@/components/Feed';

export const metadata = { title: 'Discover' };

export default async function Discover() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const near = profile.show_city && profile.city ? profile.city : null;

  const [{ data: f }, { data: local }, { data: top }, { data: asks }] = await Promise.all([
    supabase.from('follows').select('followee_id').eq('follower_id', profile.id),
    near ? supabase.rpc('search_profiles', { q: '', near, lim: 8 }) : Promise.resolve({ data: [] }),
    supabase.rpc('search_profiles', { q: '', lim: 20 }),
    supabase.from('requests').select(REQUEST_SELECT).neq('author_id', profile.id).order('created_at', { ascending: false }).limit(3),
  ]);
  const following = (f ?? []).map(x => x.followee_id as string);
  const nearby = ((local ?? []) as SearchResult[]).filter(p => p.id !== profile.id);
  const everyone = ((top ?? []) as SearchResult[]).filter(p => p.id !== profile.id);
  const openAsks = (asks ?? []) as unknown as RecRequest[];

  return (
    <div className="stack-lg narrow">
      <h1 style={{ fontSize: 'clamp(30px,5vw,44px)' }}>Discover</h1>
      <DiscoverSearch initial={[]} viewerId={profile.id} followingIds={following} />

      {nearby.length > 0 && (
        <section className="stack">
          <span className="label">Most vouched in {near}</span>
          <div className="panel" style={{ gap: 0 }}>{nearby.map(p => <PersonRow key={p.id} p={p} viewerId={profile.id} following={following.includes(p.id)} />)}</div>
        </section>
      )}

      {openAsks.length > 0 && (
        <section className="stack">
          <span className="label">Open asks</span>
          {openAsks.map(r => <FeedRequest key={r.id} r={r} viewerId={profile.id} />)}
        </section>
      )}

      <section className="stack">
        <span className="label">Most vouched on Vouched</span>
        {everyone.length
          ? <div className="panel" style={{ gap: 0 }}>{everyone.map(p => <PersonRow key={p.id} p={p} viewerId={profile.id} following={following.includes(p.id)} />)}</div>
          : <div className="empty">You’re early. Invite people you know and they’ll show up here.</div>}
      </section>
    </div>
  );
}
