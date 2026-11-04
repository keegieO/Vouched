import Link from 'next/link';
import { INVITES_PER_MEMBER, inviteLink, inviteText, timeAgo, type Invite } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { Avatar } from '@/components/ui';
import { Quota } from '@/components/trust';
import { CopyButton } from '@/components/client';
import { SITE_URL } from '@/lib/site';
import { InviteForm, CancelInvite } from './InviteForm';

export const metadata = { title: 'Vouch someone in' };

export default async function InvitePage() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const [{ data: inv }, { data: left }, { data: joined }] = await Promise.all([
    supabase.from('invites').select('*').eq('inviter_id', profile.id).order('created_at', { ascending: false }),
    supabase.rpc('invites_left'),
    supabase.from('profiles').select('id, username, display_name, avatar_url, headline, created_at').eq('invited_by', profile.id).order('created_at', { ascending: false }),
  ]);
  const invites = (inv ?? []) as Invite[];
  const people = (joined ?? []) as { id: string; username: string; display_name: string; avatar_url: string | null; headline: string | null; created_at: string }[];
  const open = invites.filter(i => !i.claimed_by && new Date(i.expires_at) > new Date());
  const n = (left as number | null) ?? 0;
  const first = profile.display_name.split(' ')[0];

  return (
    <Screen title="Vouch someone in" back="/feed">
      <Quota left={n} total={Math.max(INVITES_PER_MEMBER, n)}
        title={`${n} ${n === 1 ? 'invite' : 'invites'} left`}
        hint="Vouching someone in puts your name on them. If they’re removed for scams or a fake account, your vouches count for less." />
      {n > 0 ? <InviteForm inviterFirst={first} site={SITE_URL} /> : (
        <section className="card"><h3>You’re out of invites</h3><p className="muted small">You earn more as the people you vouched in stay in good standing.</p></section>
      )}

      {open.length > 0 && (
        <>
          <span className="label list-head">Waiting to join</span>
          <section className="list">
            {open.map(i => (
              <div key={i.id} className="person">
                <span className="avatar" style={{ width: 46, height: 46, background: 'var(--sunk)', color: 'var(--muted)' }}><span aria-hidden>?</span></span>
                <span className="grow"><b>{i.invitee_name}</b><br /><span className="hint">Code {i.code} · sent {timeAgo(i.created_at)}</span></span>
                <CopyButton text={inviteText(SITE_URL, i.code, first)} label="Copy" className="btn sm soft" />
                <CancelInvite id={i.id} />
              </div>
            ))}
          </section>
        </>
      )}

      {people.length > 0 && (
        <>
          <span className="label list-head">You vouched in</span>
          <section className="list">
            {people.map(p => (
              <Link key={p.id} href={`/${p.username}`} className="person" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Avatar name={p.display_name} url={p.avatar_url} size={46} />
                <span className="grow"><b>{p.display_name}</b><br /><span className="hint">{p.headline || `Joined ${timeAgo(p.created_at)} ago`}</span></span>
              </Link>
            ))}
          </section>
        </>
      )}
      <p className="hint">Invites expire after 30 days. Links look like {inviteLink(SITE_URL, 'ABCD1234').replace(/^https?:\/\//, '')}</p>
    </Screen>
  );
}
