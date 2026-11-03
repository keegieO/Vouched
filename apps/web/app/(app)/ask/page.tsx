import { askText, vouchLink } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { CopyButton } from '@/components/client';
import { SITE_URL } from '@/lib/site';
import { AskActions } from './AskActions';

export const metadata = { title: 'Ask for vouches' };

export default async function Ask({ searchParams }: { searchParams: { welcome?: string } }) {
  const { profile } = await getViewer();
  if (!profile) return null;
  const link = vouchLink(SITE_URL, profile.username);
  const message = askText(SITE_URL, profile.display_name, profile.username);

  return (
    <div className="stack-lg narrow">
      {searchParams.welcome && (
        <div className="banner"><b>Your page is live.</b> Now get your first vouches. Three is a great start.</div>
      )}
      <div className="stack">
        <h1 style={{ fontSize: 'clamp(30px,5vw,44px)' }}>Get vouched</h1>
        <p className="muted">Ask people from different parts of your life. A client, a coworker and a roommate read stronger than ten friends.</p>
      </div>

      <section className="panel">
        <h3>Your vouch link</h3>
        <div className="linkbox"><code>{link.replace(/^https?:\/\//, '')}</code><CopyButton text={link} /></div>
      </section>

      <section className="panel">
        <h3>Send this text</h3>
        <p style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, padding: 12, overflowWrap: 'anywhere' }}>{message}</p>
        <AskActions message={message} link={link} />
      </section>

      <section className="stack">
        <span className="label">Who to ask</span>
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          <li>Someone who has paid you for work</li>
          <li>A current or past coworker or boss</li>
          <li>A roommate or landlord</li>
          <li>A friend who has known you 5+ years</li>
          <li>A neighbor, teammate or classmate</li>
        </ul>
      </section>
    </div>
  );
}
