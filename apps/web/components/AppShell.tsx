import Link from 'next/link';
import type { Profile, SearchResult } from '@vouched/shared';
import { createClient } from '@/lib/supabase/server';
import { themeStyle } from './ui';
import { AppNav } from './AppNav';
import { PersonRow } from './social';
import { Icon } from './Icon';

/** The signed-in app frame: sidebar on desktop, tab bar on phones, side panel on wide screens. */
export async function AppShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const supabase = createClient();
  const [{ count: pending }, { count: unread }, { data: f }, { data: sugg }, { data: drop }, { data: streak }] = await Promise.all([
    supabase.from('vouches').select('id', { count: 'exact', head: true }).eq('subject_id', profile.id).eq('status', 'pending'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('read', false).neq('type', 'new_vouch'),
    supabase.from('follows').select('followee_id').eq('follower_id', profile.id),
    supabase.rpc('search_profiles', { q: '', near: profile.show_city && profile.city ? profile.city : null, lim: 10 }),
    supabase.rpc('today_drop'),
    supabase.rpc('my_streak'),
  ]);
  const played = ((drop ?? []) as { answered: boolean }[]).some(d => d.answered);
  const following = new Set((f ?? []).map(x => x.followee_id as string));
  const people = ((sugg ?? []) as SearchResult[]).filter(p => p.id !== profile.id && !following.has(p.id)).slice(0, 4);

  return (
    <div className="themed" style={themeStyle(profile.theme)}>
      <div className="app">
        <AppNav userId={profile.id} username={profile.username} badge={(pending ?? 0) + (unread ?? 0)} />
        <main className="app-main">{children}</main>
        <aside className="side" aria-label="Suggestions">
          <Link href="/discover" className="searchbox" aria-label="Search Vouched"><Icon name="search" size="sm" /><span>Search</span></Link>
          {!played && (
            <section className="dropcard">
              <span className="streak">🔥 {(streak as number | null) ?? 0} day streak</span>
              <h2>Today’s polls are live</h2>
              <p className="muted small">5 quick questions about your friends. Anonymous.</p>
              <div><Link className="btn hi" href="/props">Play</Link></div>
            </section>
          )}
          {people.length > 0 && (
            <section className="box">
              <h3>Who to follow</h3>
              {people.map(p => <PersonRow key={p.id} p={p} viewerId={profile.id} following={false} />)}
            </section>
          )}
          <p className="hint" style={{ padding: '0 4px' }}>
            <Link href="/how">How it works</Link> · <Link href="/safety">Safety</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
