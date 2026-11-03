import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getViewer } from '@/lib/supabase/server';

export const metadata = { title: 'Privacy' };

export default async function Privacy() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main className="container" style={{ paddingBlock: 48 }}>
        <article className="prose">
          <h1>Privacy policy</h1>
          <p className="hint">Template — have a lawyer review this before launch. Last updated: [DATE].</p>

          <h2>What we collect</h2>
          <ul>
            <li><b>Account details:</b> your email address, phone number, or the basic profile from Google or Apple, depending on how you sign up.</li>
            <li><b>Profile details you add:</b> name, username, city, headline and photo.</li>
            <li><b>Vouches:</b> what you write about others and what others write about you.</li>
            <li><b>Reports and blocks</b> you make.</li>
            <li><b>Basic technical data</b> such as device type and log records, used to keep the service secure.</li>
          </ul>

          <h2>What is public</h2>
          <p>Your name, username, photo, headline, city (if you choose to show it), and approved vouches are visible to anyone with your link. Your email and phone number are never shown on your profile.</p>

          <h2>How we use it</h2>
          <ul>
            <li>To run your account and show your profile.</li>
            <li>To send sign-in codes and notifications you ask for.</li>
            <li>To prevent fake accounts, spam and abuse.</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2>Who we share it with</h2>
          <p>Service providers that help us run Vouched (hosting, database, and text-message delivery), only as needed to provide the service, and authorities when the law requires it.</p>

          <h2>Your choices</h2>
          <ul>
            <li>Edit your profile or stop taking vouches in Settings.</li>
            <li>Delete any vouch you wrote or received.</li>
            <li>Delete your account in Settings. This removes your profile and every vouch you wrote or received.</li>
          </ul>

          <h2>Age</h2>
          <p>Vouched is only for people 18 and older.</p>

          <h2>Contact</h2>
          <p>Questions about privacy: [CONTACT EMAIL]</p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
