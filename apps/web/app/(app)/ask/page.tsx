import Link from 'next/link';
import { REQUEST_SELECT, askText, vouchLink, type RecRequest } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { CopyButton } from '@/components/client';
import { RequestForm } from '@/components/social';
import { FeedRequest } from '@/components/Feed';
import { SITE_URL } from '@/lib/site';
import { AskActions } from './AskActions';

export const metadata = { title: 'Ask' };

export default async function Ask({ searchParams }: { searchParams: { welcome?: string; tab?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const tab = searchParams.tab === 'rec' ? 'rec' : 'vouch';
  const link = vouchLink(SITE_URL, profile.username);
  const message = askText(SITE_URL, profile.display_name, profile.username);
  const { data } = tab === 'rec'
    ? await supabase.from('requests').select(REQUEST_SELECT).eq('author_id', profile.id).order('created_at', { ascending: false })
    : { data: [] };
  const mine = (data ?? []) as unknown as RecRequest[];

  return (
    <div className="stack-lg narrow">
      {searchParams.welcome && (
        <div className="banner"><b>Your page is live.</b> Get your first three vouches, then follow people you know.</div>
      )}
      <h1 style={{ fontSize: 'clamp(30px,5vw,44px)' }}>Ask</h1>
      <nav className="segmented" aria-label="Ask">
        <Link href="/ask" aria-current={tab === 'vouch' ? 'page' : undefined}>Get vouched</Link>
        <Link href="/ask?tab=rec" aria-current={tab === 'rec' ? 'page' : undefined}>Ask for a rec</Link>
      </nav>

      {tab === 'vouch' ? (
        <>
          <p className="muted">Ask people from different parts of your life. A client, a coworker and a roommate read stronger than ten friends.</p>
          <section className="panel">
            <h3>Your vouch link</h3>
            <div className="linkbox"><code>{link.replace(/^https?:\/\//, '')}</code><CopyButton text={link} /></div>
          </section>
          <section className="panel">
            <h3>Send this text</h3>
            <p style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, overflowWrap: 'anywhere' }}>{message}</p>
            <AskActions message={message} link={link} />
          </section>
          <section className="panel">
            <h3>Vouch for someone first</h3>
            <p className="muted small">People tend to vouch back. Find someone who deserves it in <Link href="/discover">Discover</Link>.</p>
          </section>
        </>
      ) : (
        <>
          <p className="muted">Need a mechanic, a sitter, a stylist? Ask. People who follow you answer with Vouched profiles of people they trust.</p>
          <RequestForm authorId={profile.id} defaultCity={profile.city ?? ''} />
          <span className="label">Your asks</span>
          {mine.length ? mine.map(r => <FeedRequest key={r.id} r={r} viewerId={profile.id} />) : <div className="empty">You haven’t asked for anything yet.</div>}
        </>
      )}
    </div>
  );
}
