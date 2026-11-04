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
  const [{ count: pending }, { count: unread }, { data: f }, { data: sugg }] = await Promise.all([
    supabase.from('vouches').select('id', { count: 'exact', head: true }).eq('subject_id', profile.id).eq('status', 'pending'),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('read', false).neq('type', 'new_vouch'),
    supabase.from('follows').select('followee_id').eq('follower_id', profile.id),
    supabase.rpc('search_profiles', { q: '', near: profile.show_city && profile.city ? profile.city : null, lim: 10 }),
  ]);
  const following = new Set((f ?? []).map(x => x.followee_id as string));
  const people = ((sugg ?? []) as SearchResult[]).filter(p => p.id !== profile.id && !following.has(p.id)).slice(0, 4);

  return (
    <div className="themed" style={themeStyle(profile.theme)}>
      <div className="app">
        <AppNav userId={profile.id} username={profile.username} badge={(pending ?? 0) + (unread ?? 0)} />
        <main className="app-main">{children}</main>
        <aside className="side" aria-label="Suggestions">
          <Link href="/discover" className="search" aria-label="Search Vouched">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
            <span className="input" style={{ display: 'block', color: 'var(--muted)' }}>Search Vouched</span>
          </Link>
          {people.length > 0 && (
            <section className="list">
              <div style={{ padding: '14px 16px 4px' }}><h3>People you may know</h3></div>
              {people.map(p => <PersonRow key={p.id} p={p} viewerId={profile.id} following={false} />)}
            </section>
          )}
          <section className="card">
            <div className="row nowrap"><Icon name="send" size="sm" /><h3>Get vouched faster</h3></div>
            <p className="hint">Ask three people from different parts of your life. A client, a coworker and a roommate read stronger than ten friends.</p>
            <Link className="btn sm primary" href="/ask">Ask for vouches</Link>
          </section>
          <p className="hint" style={{ padding: '0 4px' }}>
            <Link href="/safety">Safety</Link> · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
