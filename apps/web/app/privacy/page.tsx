import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getViewer } from '@/lib/supabase/server';
import Link from 'next/link';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata = { title: 'Privacy' };

export default async function Privacy() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main className="container" style={{ paddingBlock: 48 }}>
        <article className="prose">
          <h1>Privacy policy</h1>
          <p className="hint">Template — have a lawyer review this before launch. Last updated: November 4, 2026.</p>

          <h2>What we collect</h2>
          <ul>
            <li><b>Account details:</b> your email address, phone number, or the basic profile from Google or Apple, depending on how you sign up.</li>
            <li><b>Profile details you add:</b> name, username, pronouns, city, headline, bio, skills, status, linked accounts and photo.</li>
            <li><b>Vouches:</b> what you write about others and what others write about you, plus co-signs and replies.</li>
            <li><b>Invites:</b> who invited you, and the name and phone number or email you enter when you invite someone. Only you can see the contact you entered.</li>
            <li><b>Props:</b> who you pick in the daily questions. The people you pick never see that it was you; they only see totals.</li>
            <li><b>Follows, asks and recommendations</b> you make.</li>
            <li><b>Reports and blocks</b> you make.</li>
            <li><b>Basic technical data</b> such as device type and log records, used to keep the service secure.</li>
          </ul>

          <h2>What is public</h2>
          <p>Your name, username, photo, headline, bio, skills, links, city (if you choose to show it), approved vouches, who vouched you in, the people you’ve backed, your props totals and your follows are visible to anyone with your link. Signed-in members can also see the chain of vouches that connects them to you. Your email, phone number and who gave you props are never shown.</p>

          <h2>How we use it</h2>
          <ul>
            <li>To run your account and show your profile.</li>
            <li>To send sign-in codes and notifications you ask for.</li>
            <li>To prevent fake accounts, scams, spam and abuse. If an account is removed for verified scams or a fake account, that is reflected on the record of the people who vouched for it.</li>
          </ul>
          <p>We do not sell your personal information.</p>

          <h2>Who we share it with</h2>
          <p>Service providers that help us run Vouched (hosting, database, and text-message delivery), only as needed to provide the service, and authorities when the law requires it.</p>

          <h2>Your choices</h2>
          <ul>
            <li>Edit your profile or stop taking vouches in Settings.</li>
            <li>Delete any vouch you wrote or received.</li>
            <li>Delete your account in Settings. This removes your profile and every vouch you wrote or received. <Link href="/delete-account">How to delete your account</Link>.</li>
          </ul>

          <h2>Age</h2>
          <p>Vouched is only for people 18 and older.</p>

          <h2>Contact</h2>
          <p>Questions about privacy, or to ask us to delete your data: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
