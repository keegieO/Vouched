import Link from 'next/link';
import type { Metadata } from 'next';
import { normalizeCode, type InvitePreview } from '@vouched/shared';
import { createClient } from '@/lib/supabase/server';
import { Avatar, Logo } from '@/components/ui';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = { title: 'You’re invited', robots: { index: false } };

export default async function JoinPage({ params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  const supabase = createClient();
  const { data } = await supabase.rpc('invite_preview', { p_code: code });
  const inv = ((data ?? []) as InvitePreview[])[0];

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Logo />
        {inv?.valid ? (
          <>
            <h1 style={{ fontSize: 40 }}>{inv.invitee_name.split(' ')[0]}, you’re in.</h1>
            <div className="invite-card">
              <Avatar name={inv.inviter_name} url={inv.inviter_avatar} size={52} />
              <div className="grow"><span className="sig">{inv.inviter_name}</span><p style={{ opacity: .8, fontSize: 14 }}>vouched you in to Vouched.</p></div>
              <Icon name="ticket" />
            </div>
            <p className="muted">Vouched is invite-only. Your page is written by people who know you, and every member is backed by someone real.</p>
            <Link className="btn primary lg block" href={`/join/${code}/accept`}>Accept invite</Link>
            <Link className="link small" style={{ alignSelf: 'center' }} href={`/${inv.inviter_username}`}>See {inv.inviter_name.split(' ')[0]}’s page first</Link>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 36 }}>{inv ? 'This invite was already used' : 'We couldn’t find that invite'}</h1>
            <p className="muted">Invites work once and expire after 30 days. Ask the person who invited you to send a new one.</p>
            <Link className="btn ghost" href="/join">Enter a different code</Link>
          </>
        )}
      </div>
    </main>
  );
}
