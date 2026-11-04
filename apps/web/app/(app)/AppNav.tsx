'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui';

const ICONS: Record<string, React.ReactNode> = {
  feed: <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  discover: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></>,
  home: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  inbox: <><path d="M3 13l3-8h12l3 8v6H3z" /><path d="M3 13h5l1 3h6l1-3h5" /></>,
  ask: <path d="M4 12l16-8-6 17-3-7z" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
};
const TABS = [
  { href: '/feed', label: 'Feed', icon: 'feed', also: ['/requests'] },
  { href: '/discover', label: 'Discover', icon: 'discover', also: [] },
  { href: '/ask', label: 'Ask', icon: 'ask', also: [] },
  { href: '/inbox', label: 'Inbox', icon: 'inbox', also: [] },
  { href: '/home', label: 'Me', icon: 'home', also: ['/settings', '/written'] },
];

export function AppNav({ userId, pending, username }: { userId: string; pending: number; username: string }) {
  const path = usePathname();
  const router = useRouter();

  // Refresh badge counts when a new vouch arrives.
  useEffect(() => {
    const supabase = createClient();
    const ch = supabase
      .channel(`notif-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => router.refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, router]);

  const link = (t: (typeof TABS)[number], withIcon: boolean) => (
    <Link key={t.href} href={t.href} aria-current={[t.href, ...t.also].some(h => path.startsWith(h)) ? 'page' : undefined}>
      {withIcon && <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{ICONS[t.icon]}</svg>}
      {t.label}
      {t.href === '/inbox' && pending > 0 && <span className="count-badge" aria-label={`${pending} waiting`}>{pending}</span>}
    </Link>
  );

  return (
    <>
      <header className="appbar">
        <div className="container">
          <Logo href="/feed" />
          <nav className="topnav" aria-label="Main">{TABS.map(t => link(t, false))}</nav>
          <Link className="btn sm ghost" href={`/${username}`}>My page</Link>
        </div>
      </header>
      <nav className="tabbar" aria-label="Main">{TABS.map(t => link(t, true))}</nav>
    </>
  );
}
