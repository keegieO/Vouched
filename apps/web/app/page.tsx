import Link from 'next/link';
import type { VouchWithAuthor } from '@vouched/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { VouchCard } from '@/components/VouchCard';
import { getViewer } from '@/lib/supabase/server';

const now = new Date().toISOString();
const example = (id: string, rel: VouchWithAuthor['relationship'], duration: string, traits: string[], body: string, name: string): VouchWithAuthor => ({
  id, subject_id: 'x', author_id: 'y', relationship: rel, duration, traits, body, status: 'approved', created_at: now, approved_at: now,
  author: { username: '', display_name: name, avatar_url: null, phone_verified: true },
});
const EXAMPLES = [
  example('1', 'Coworker', 'Known 3–10 years', ['Hard worker', 'Keeps their word'], 'Worked warehouse shifts with him. Never once called off, and he covered for me when my kid was sick.', 'Luis O.'),
  example('2', 'Client', 'Hired them 2+ times', ['On time', 'Fair price'], 'Mounted two TVs and fixed a door that stuck for years. Showed up early and cleaned up after himself.', 'Dana W.'),
  example('3', 'Roommate', 'Known 1–3 years', ['Pays back', 'Clean'], 'Rent was never late, not one month. Kept the kitchen cleaner than I did.', 'Tasha G.'),
];

const FAQ = [
  ['Can I write my own vouches?', 'No. Nothing on your profile is written by you except your name, city and one-line headline. That is the whole point.'],
  ['What if someone writes something mean?', 'Vouches are positive only, and nothing appears on your profile until you approve it. You can hide, delete, block or report anything.'],
  ['How do you stop fake vouches?', 'Every vouch comes from a real account, shows the writer’s name, and links to their own profile. Phone-verified writers are marked, and accounts that farm vouches get removed.'],
  ['Who can see my profile?', 'Anyone with your link. Hidden and pending vouches are only visible to you and the person who wrote them.'],
  ['What does it cost?', 'Vouched is free. Your profile, your vouches and your link stay free.'],
  ['Is there an app?', 'Yes. Vouched works in any phone browser and can be added to your home screen. iPhone and Android apps use the same account.'],
];

export default async function Landing() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main>
        <section className="container hero">
          <div className="stack-lg">
            <span className="label">Trust, written by other people</span>
            <h1>You can’t write your own profile. <em>The people who know you do.</em></h1>
            <p className="lede">Friends, coworkers, clients and roommates vouch for you. You approve what shows. Then you share one link anywhere a stranger needs to trust you.</p>
            <div className="row">
              <Link className="btn primary" href={user ? '/feed' : '/login?mode=signup'}>{user ? 'Open my feed' : 'Get vouched, free'}</Link>
              <Link className="btn ghost" href="#how">See how it works</Link>
            </div>
          </div>
          <div className="fan" aria-label="Example vouches">
            {EXAMPLES.map(v => <VouchCard key={v.id} v={v} />)}
          </div>
        </section>

        <section className="section" id="how">
          <div className="container stack-lg">
            <h2>Three steps. About five minutes.</h2>
            <div className="steps">
              <div className="step"><h3>Make your page</h3><p className="muted">Pick a username, add a photo and a one-line headline. That’s all you get to write.</p></div>
              <div className="step"><h3>Ask people who know you</h3><p className="muted">Text your vouch link to a boss, a client, a roommate, an old friend. Each one takes a minute.</p></div>
              <div className="step"><h3>Approve and share</h3><p className="muted">Vouches land in your inbox. Approve the ones you like, then drop your link in a bio or application.</p></div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container stack-lg">
            <h2>Put your link anywhere trust matters</h2>
            <div className="uses">
              <div className="use"><h3>Dating profiles</h3><p className="muted small">Prove you’re a real, decent person before the first date.</p></div>
              <div className="use"><h3>Rentals and roommates</h3><p className="muted small">Landlords and roommates see past tenants and roommates vouching for you.</p></div>
              <div className="use"><h3>Side work and trades</h3><p className="muted small">Clients pick the handyman with twenty vouches over the one with none.</p></div>
              <div className="use"><h3>Job applications</h3><p className="muted small">References that are already written, public, and tied to real people.</p></div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container stack-lg narrow" style={{ marginInline: 'auto' }}>
            <h2>Questions</h2>
            <div className="faq">
              {FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
            </div>
          </div>
        </section>

        <section className="container">
          <div className="cta-band">
            <h2>Your reputation already exists. Put it somewhere people can see it.</h2>
            <Link className="btn" href={user ? '/ask' : '/login?mode=signup'}>{user ? 'Ask for vouches' : 'Start my profile'}</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
