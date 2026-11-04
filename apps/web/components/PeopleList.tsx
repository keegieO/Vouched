import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { normalizeUsername, type SearchResult } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { AppShell } from './AppShell';
import { Screen } from './Screen';
import { PersonRow } from './social';

type Row = { p: { id: string; username: string; display_name: string; headline: string | null; avatar_url: string | null; city: string | null; show_city: boolean } | null };

export async function PeopleList({ username, which }: { username: string; which: 'followers' | 'following' }) {
  const { supabase, profile: viewer } = await getViewer();
  if (!viewer) redirect(`/login?next=/${username}/${which}`);
  const { data: target } = await supabase.from('profiles').select('id, username, display_name, show_counts').eq('username', normalizeUsername(username)).maybeSingle();
  if (!target) notFound();
  const hidden = !target.show_counts && target.id !== viewer.id;

  const { data } = hidden ? { data: [] } : which === 'followers'
    ? await supabase.from('follows').select('p:profiles!follows_follower_id_fkey(id, username, display_name, headline, avatar_url, city, show_city)').eq('followee_id', target.id).order('created_at', { ascending: false })
    : await supabase.from('follows').select('p:profiles!follows_followee_id_fkey(id, username, display_name, headline, avatar_url, city, show_city)').eq('follower_id', target.id).order('created_at', { ascending: false });
  const { data: mine } = await supabase.from('follows').select('followee_id').eq('follower_id', viewer.id);
  const following = new Set((mine ?? []).map(x => x.followee_id as string));
  const people = ((data ?? []) as unknown as Row[]).map(r => r.p).filter(Boolean) as NonNullable<Row['p']>[];
  const first = target.display_name.split(' ')[0];

  return (
    <AppShell profile={viewer}>
      <Screen title={`${first}’s ${which}`} back={`/${target.username}`}>
        <nav className="segmented">
          <Link href={`/${target.username}/followers`} aria-current={which === 'followers' ? 'page' : undefined}>Followers</Link>
          <Link href={`/${target.username}/following`} aria-current={which === 'following' ? 'page' : undefined}>Following</Link>
        </nav>
        {hidden ? <div className="empty"><p>{first} keeps this list private.</p></div>
          : people.length ? (
            <section className="list">
              {people.map(p => (
                <PersonRow key={p.id} viewerId={viewer.id} following={following.has(p.id)}
                  p={{ ...p, city: p.show_city ? p.city : null, theme: 'cobalt', style: 'signed', status: null, skills: [], phone_verified: false, vouches: 0, circles: 0, followers: 0 } as SearchResult} />
              ))}
            </section>
          ) : <div className="empty"><p>No one yet.</p></div>}
      </Screen>
    </AppShell>
  );
}
