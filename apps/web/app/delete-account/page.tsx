import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getViewer } from '@/lib/supabase/server';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata = { title: 'Delete your account' };

/** Public page Google Play requires: how to delete a Vouched account and what gets deleted. */
export default async function DeleteAccount() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main className="container narrow" style={{ marginInline: 'auto', paddingBlock: 40 }}>
        <article className="prose stack-lg">
          <h1>Delete your Vouched account</h1>
          <p className="muted">You can delete your account yourself at any time. It takes effect right away and can’t be undone.</p>

          <section className="stack">
            <h2>In the app (iPhone or Android)</h2>
            <ol>
              <li>Open Vouched and tap <b>Profile</b>.</li>
              <li>Tap <b>Settings</b>, then <b>Delete account</b>.</li>
              <li>Type <b>DELETE</b> to confirm.</li>
            </ol>
          </section>

          <section className="stack">
            <h2>On the website</h2>
            <ol>
              <li>Log in, then go to <b>Settings → Account</b>.</li>
              <li>Choose <b>Delete account</b> and type <b>DELETE</b> to confirm.</li>
            </ol>
            <Link className="btn primary" style={{ alignSelf: 'flex-start' }} href={user ? '/settings/account#delete' : '/login?next=%2Fsettings%2Faccount%23delete'}>
              {user ? 'Go to account settings' : 'Log in to delete your account'}
            </Link>
          </section>

          <section className="stack">
            <h2>What gets deleted</h2>
            <ul>
              <li>Your profile, photo, links and settings</li>
              <li>Every vouch you received and every vouch you wrote</li>
              <li>Props you gave and received, follows, co-signs, replies, asks and recommendations</li>
              <li>Invites you sent that haven’t been used, and your login (email, phone, Google or Apple)</li>
            </ul>
            <p>Everything is deleted immediately, including reports you filed.</p>
          </section>

          <section className="stack">
            <h2>Can’t get in?</h2>
            <p>If you can’t log in, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address or phone number on your account and ask us to delete it. We’ll confirm within 7 days.</p>
          </section>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
