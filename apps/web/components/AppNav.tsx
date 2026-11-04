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
  { href: '/discover', label: 'Discover', icon: 'search', also: [] as string[] },
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
  const meOn = path === me || path.startsWith('/settings') || path === '/written' || path === '/ask';

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
        <Link href="/feed" aria-current={on('/feed', ['/requests']) ? 'page' : undefined}><Icon name="home" /><span>Home</span></Link>
        <Link href="/discover" aria-current={on('/discover') ? 'page' : undefined}><Icon name="search" /><span>Discover</span></Link>
        <button type="button" className="compose" onClick={() => setCompose(true)} aria-label="Create"><Icon name="plus" /></button>
        <Link href="/inbox" aria-current={on('/inbox') ? 'page' : undefined}><Icon name="bell" /><span>Activity</span>{badge > 0 && <span className="count-badge">{badge}</span>}</Link>
        <Link href={me} aria-current={meOn ? 'page' : undefined}><Icon name="user" /><span>Profile</span></Link>
      </nav>

      <Sheet open={compose} onClose={() => setCompose(false)} title="Create">
        <Link className="sheet-opt" href="/write" onClick={() => setCompose(false)}><span className="ico"><Icon name="edit" /></span><span><b>Write a vouch</b><span>Say something true about someone you know</span></span></Link>
        <Link className="sheet-opt" href="/ask?tab=rec" onClick={() => setCompose(false)}><span className="ico"><Icon name="msg" /></span><span><b>Ask for a rec</b><span>Find a mechanic, sitter or stylist through your people</span></span></Link>
        <Link className="sheet-opt" href="/request-vouch" onClick={() => setCompose(false)}><span className="ico"><Icon name="send" /></span><span><b>Request a vouch</b><span>Ask someone who knows you to vouch</span></span></Link>
        <Link className="sheet-opt" href="/ask" onClick={() => setCompose(false)}><span className="ico"><Icon name="share" /></span><span><b>Share my vouch link</b><span>Text it to people outside Vouched</span></span></Link>
      </Sheet>
    </>
  );
}
