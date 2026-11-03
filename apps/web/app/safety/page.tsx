import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getViewer } from '@/lib/supabase/server';

export const metadata = { title: 'Safety & rules' };

export default async function Safety() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main className="container" style={{ paddingBlock: 48 }}>
        <article className="prose">
          <h1>Safety & rules</h1>
          <p className="muted">Vouched only works if people can trust what they read. These rules apply to every vouch and every profile.</p>

          <h2>Vouches are positive only</h2>
          <p>A vouch says something good and true about someone you actually know. Warnings, complaints and backhanded compliments are not allowed. If you have a problem with someone, Vouched is the wrong place for it.</p>

          <h2>You control your profile</h2>
          <ul>
            <li>Nothing shows on your profile until you approve it.</li>
            <li>You can hide or delete any vouch at any time.</li>
            <li>You can block someone so they can’t vouch for you again.</li>
            <li>You can stop taking new vouches in Settings.</li>
          </ul>

          <h2>Not allowed</h2>
          <ul>
            <li>Writing vouches for yourself from a second account.</li>
            <li>Trading or selling vouches, or paying for them.</li>
            <li>Sharing private details: home addresses, phone numbers, health, finances, or anything about someone’s private life.</li>
            <li>Vouching for anyone under 18. Vouched is for adults only.</li>
            <li>Harassment, hate, threats, or sexual content.</li>
          </ul>

          <h2>Reporting</h2>
          <p>Tap the ⋯ on any vouch or profile and choose Report. We review every report and remove content and accounts that break these rules.</p>

          <h2>If you’re in danger</h2>
          <p>Vouched can’t help in an emergency. Call 911 in the US, or your local emergency number.</p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
