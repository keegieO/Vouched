import Link from 'next/link';
import type { VouchWithAuthor } from '@vouched/shared';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { VouchCard } from '@/components/VouchCard';
import { getViewer } from '@/lib/supabase/server';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/Icon';
import { RULES } from '@/lib/copy';

const now = new Date().toISOString();
const EXAMPLE: VouchWithAuthor = {
  id: 'ex', subject_id: 'x', author_id: 'y', relationship: 'Client', duration: 'Hired them 2+ times', traits: ['On time', 'Fair price'],
  body: 'Mounted two TVs and fixed a door that stuck for years. Showed up ten minutes early and cleaned up after himself.',
  status: 'approved', created_at: now, approved_at: now, reply: null, reply_at: null,
  author: { username: '', display_name: 'Dana Whitfield', avatar_url: null, phone_verified: true },
} as VouchWithAuthor;

const FAQ = [
  ['Why can’t I just sign up?', 'Every member is vouched in by someone who already belongs. That keeps fake accounts and scammers out, and it’s why a Vouched page means something.'],
  ['Why only three vouches a month?', 'If vouches were unlimited they’d be worthless. Three a month means people save them for someone they’d really stand behind.'],
  ['What happens if I vouch for someone bad?', 'Only if they’re removed for verified scams or a fake account do your vouches count for less for a while. Someone being average never costs you.'],
  ['What are props?', 'Quick daily questions like “Who would you call at 2am?” You pick a friend. It’s anonymous and adds to their page.'],
  ['Can someone write something mean?', 'Vouches are positive only and nothing shows until you add it. You can hide, block or report anything.'],
  ['What does it cost?', 'Vouched is free.'],
];

const PATH = [['Priya Nair', 'You'], ['Ben Carter', 'Ben'], ['Marcus Reed', 'Marcus']];

export default async function Landing() {
  const { user } = await getViewer();
  return (
    <>
      <SiteHeader signedIn={!!user} />
      <main>
        <section className="container hero">
          <div className="stack-lg">
            <span className="kicker">Invite-only · Three vouches a month</span>
            <h1>Put your <span className="sigword">name</span> on&nbsp;it.</h1>
            <p className="lede">The social network where every connection is backed by someone real. Get vouched in, vouch for the people you’d stand behind, and see exactly how you’re connected to anyone before you meet them.</p>
            <div className="row">
              {user
                ? <Link className="btn primary lg" href="/feed">Open the app</Link>
                : <Link className="btn primary lg" href="/join"><Icon name="ticket" size="sm" /> Join with an invite</Link>}
              <Link className="btn ghost lg" href="/how">How it works</Link>
            </div>
          </div>
          <div className="stack" aria-label="Example">
            <section className="pathcard">
              <span className="label" style={{ color: 'var(--accent)' }}>How you’re connected</span>
              <div className="path">
                {PATH.map(([n, l], i) => (
                  <span key={n} style={{ display: 'contents' }}>
                    {i > 0 && <div className="edge"><i /><span>{i === 1 ? 'Friend' : 'Vouched in'}</span></div>}
                    <span className="node"><Avatar name={n} size={44} /><b>{l}</b></span>
                  </span>
                ))}
              </div>
            </section>
            <div className="props-cloud">
              <span className="prop"><Icon name="brief" size="xs" /> Hire on sight <span className="n">×3</span></span>
              <span className="prop"><Icon name="moon" size="xs" /> 2am call <span className="n">×2</span></span>
            </div>
            <VouchCard v={EXAMPLE} />
          </div>
        </section>

        <section className="section" id="how">
          <div className="container stack-lg">
            <span className="kicker">How it works</span>
            <h2 className="big-h">Trust you can’t fake.</h2>
            <div className="rules">
              {RULES.map(([t, d, dark], i) => (
                <div key={t} className={`rule ${dark ? 'dark' : ''}`}><span className="no">{i + 1}</span><h3 style={{ fontSize: 20 }}>{t}</h3><p className="muted">{d}</p></div>
              ))}
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container hero" style={{ paddingBlock: 0 }}>
            <div className="stack-lg">
              <span className="kicker">Props</span>
              <h2 className="big-h">Ten seconds a day. Someone’s whole day.</h2>
              <p className="lede">Every day you get a few questions like “Who would you call at 2am if your car broke down?” Tap a friend. It’s anonymous, and it adds to their page.</p>
            </div>
            <div className="propcard" style={{ maxWidth: 420, justifySelf: 'center', width: '100%' }}>
              <span className="label">Today’s props · 2/5</span>
              <h2>Who would you trust with your house keys?</h2>
              <div className="picks" style={{ marginTop: 0 }}>
                {['Dana', 'Marcus', 'Jordan', 'Tasha'].map((n, i) => <div key={n} className={`pick ${i === 2 ? 'chosen' : ''}`}><Avatar name={n} size={44} />{n}</div>)}
              </div>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="container stack-lg narrow" style={{ marginInline: 'auto' }}>
            <h2 className="big-h">Questions</h2>
            <div className="faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
          </div>
        </section>

        <section className="container">
          <div className="cta-band">
            <h2 className="big-h" style={{ color: 'inherit' }}>Your reputation already exists. Give it a name.</h2>
            <Link className="btn lg" href={user ? '/feed' : '/join'}>{user ? 'Open the app' : 'Join with an invite'}</Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
