import Link from 'next/link';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { getViewer } from '@/lib/supabase/server';
import { CONTACT_EMAIL } from '@/lib/site';

export const metadata = { title: 'Terms' };

export default async function Terms() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main className="container" style={{ paddingBlock: 48 }}>
        <article className="prose">
          <h1>Terms of use</h1>
          <p className="hint">Template — have a lawyer review this before launch. Last updated: November 4, 2026.</p>

          <h2>Who can use Vouched</h2>
          <p>You must be at least 18 and use your real name. One account per person.</p>

          <h2>What you write</h2>
          <p>You are responsible for the vouches you write. They must be true, about someone you actually know, and follow the <Link href="/safety">Safety & rules</Link>. You give Vouched permission to display your vouches on the profile of the person you vouched for.</p>

          <h2>What others write about you</h2>
          <p>Vouches reflect the opinion of the person who wrote them, not Vouched. You decide which vouches appear on your profile.</p>

          <h2>What we can do</h2>
          <p>We can remove content or suspend accounts that break these terms or the rules, and we can change or stop features. We will tell you about major changes to these terms.</p>

          <h2>No guarantees</h2>
          <p>Vouched shows what real people say, but we can’t guarantee anyone’s character. Use your own judgment when meeting, hiring or renting to anyone. The service is provided as is.</p>

          <h2>Ending your account</h2>
          <p>You can delete your account at any time in Settings.</p>

          <h2>Contact</h2>
          <p><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></p>
        </article>
      </main>
      <SiteFooter />
    </>
  );
}
