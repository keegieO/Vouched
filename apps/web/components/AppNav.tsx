'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from './ui';
import { Icon } from './Icon';
import { Sheet } from './Sheet';

const TABS = [
  { href: '/feed', label: 'Home', icon: 'home', also: ['/requests'] },
  { href: '/discover', label: 'Explore', icon: 'search', also: [] as string[] },
  { href: '/inbox', label: 'Activity', icon: 'bell', also: [] as string[] },
];

export function AppNav({ userId, username, badge }: { userId: string; username: string; badge: number }) {
  const path = usePathname();
  const router = useRouter();
  const [compose, setCompose] = useState(false);

  // Refresh counts when something new arrives.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`notif-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, router]);

  const me = `/${username}`;
  const on = (href: string, also: string[] = []) => [href, ...also].some(h => path === h || path.startsWith(h + '/') || path.startsWith(h + '?'));
  const meOn = path === me || path.startsWith('/settings') || path === '/written' || path === '/score' || path === '/vibe';

  const item = (t: (typeof TABS)[number]) => (
    <Link key={t.href} href={t.href} aria-current={on(t.href, t.also) ? 'page' : undefined}>
      <Icon name={t.icon} /><span className="lbl">{t.label}</span>
      {t.href === '/inbox' && badge > 0 && <span className="count-badge" aria-label={`${badge} new`}>{badge}</span>}
    </Link>
  );

  return (
    <>
      <nav className="rail" aria-label="Main">
        <Logo href="/feed" />
        <div style={{ height: 14 }} />
        {TABS.map(item)}
        <Link href={me} aria-current={meOn ? 'page' : undefined}><Icon name="user" /><span className="lbl">Profile</span></Link>
        <button type="button" className="btn primary" onClick={() => setCompose(true)} aria-label="Create"><Icon name="plus" /><span className="lbl">Create</span></button>
        <div className="spacer" />
        <Link href="/settings" aria-current={path.startsWith('/settings') ? 'page' : undefined}><Icon name="gear" /><span className="lbl">Settings</span></Link>
      </nav>

      <nav className="tabbar" aria-label="Main">
        <Link href="/feed" aria-label="Home" aria-current={on('/feed', ['/requests']) ? 'page' : undefined}><Icon name="home" /><span className="lbl">Home</span></Link>
        <Link href="/discover" aria-label="Explore" aria-current={on('/discover') ? 'page' : undefined}><Icon name="search" /><span className="lbl">Explore</span></Link>
        <button type="button" className="compose" onClick={() => setCompose(true)} aria-label="Create"><Icon name="plus" /></button>
        <Link href="/inbox" aria-label={badge ? `Activity, ${badge} new` : 'Activity'} aria-current={on('/inbox') ? 'page' : undefined}><Icon name="bell" /><span className="lbl">Activity</span>{badge > 0 && <span className="count-badge">{badge}</span>}</Link>
        <Link href={me} aria-label="Profile" aria-current={meOn ? 'page' : undefined}><Icon name="user" /><span className="lbl">Profile</span></Link>
      </nav>

      <Sheet open={compose} onClose={() => setCompose(false)} title="Create">
        <Link className="sheet-opt" href="/props" onClick={() => setCompose(false)}><span className="ico" style={{ background: 'var(--hi)' }}>🗳️</span><span><b>Today’s polls</b><span>5 quick questions about your friends</span></span></Link>
        <Link className="sheet-opt" href="/write" onClick={() => setCompose(false)}><span className="ico">✍️</span><span><b>Vouch for someone</b><span>Put your name on them. 3 a month.</span></span></Link>
        <Link className="sheet-opt" href="/vibe" onClick={() => setCompose(false)}><span className="ico">✨</span><span><b>What’s my vibe?</b><span>Let friends describe you</span></span></Link>
        <Link className="sheet-opt" href="/invite" onClick={() => setCompose(false)}><span className="ico">🎟️</span><span><b>Vouch someone in</b><span>Invite a person you know</span></span></Link>
        <Link className="sheet-opt" href="/request-vouch" onClick={() => setCompose(false)}><span className="ico">📨</span><span><b>Ask for a vouch</b><span>From someone who knows you</span></span></Link>
        <p className="hint">Send a gift from anyone’s profile or post. 1 free a day.</p>
      </Sheet>
    </>
  );
}
