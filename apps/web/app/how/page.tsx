import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getViewer } from '@/lib/supabase/server';
import { RULES } from '@/lib/copy';

export const metadata = { title: 'How Vouched works' };

export default async function How() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main className="container narrow stack-lg" style={{ marginInline: 'auto', paddingBlock: 40 }}>
        <span className="kicker">How it works</span>
        <h1>Put your name on it.</h1>
        <div className="stack">
          {RULES.map(([t, d, dark], i) => (
            <div key={t} className={`rule ${dark ? 'dark' : ''}`}><span className="no">{i + 1}</span><h3 style={{ fontSize: 20 }}>{t}</h3><p className="muted">{d}</p></div>
          ))}
          <div className="rule"><span className="no">5</span><h3 style={{ fontSize: 20 }}>Props are free</h3><p className="muted">Daily questions like “Who would you call at 2am?” Tap a friend. It’s anonymous and shows up on their page.</p></div>
        </div>
        <p className="hint">Only verified scam or fake-account removals affect anyone’s record. Someone just being average never costs you.</p>
        <Link className="btn primary" href={user ? '/feed' : '/join'}>{user ? 'Back to the app' : 'Join with an invite'}</Link>
      </main>
      <SiteFooter />
    </>
  );
}
