import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { CodeForm } from '../join/CodeForm';
import { Avatar } from '@/components/ui';
import { getViewer } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/ProfileForm';
import { Logo } from '@/components/ui';

type Inviter = { username: string; display_name: string; avatar_url: string | null };
import { safeNext } from '@/lib/site';

export const metadata = { title: 'Set up your profile' };

export default async function Onboarding({ searchParams }: { searchParams: { next?: string } }) {
  const { supabase, user, profile } = await getViewer();
  if (!user) redirect('/login');
  const next = safeNext(searchParams.next, '/props');
  if (profile) redirect(next);

  // Invite-only: claim the code they arrived with, or ask for one.
  const findClaim = () => supabase.from('invites').select('inviter:profiles!invites_inviter_id_fkey(username, display_name, avatar_url)').eq('claimed_by', user.id).maybeSingle();
  let { data: claimed } = await findClaim();
  let claimError: string | null = null;
  const cookieCode = cookies().get('vouched_invite')?.value;
  if (!claimed && cookieCode) {
    const { error } = await supabase.rpc('claim_invite', { p_code: cookieCode });
    if (error) claimError = error.message; else ({ data: claimed } = await findClaim());
  }
  const inviter = (claimed as unknown as { inviter: Inviter | null } | null)?.inviter ?? null;
  const { data: cfg } = await supabase.from('app_config').select('value').eq('key', 'invite_only').maybeSingle();
  if (!inviter && cfg?.value !== 'off') {
    return (
      <main className="auth-wrap">
        <div className="auth-card">
          <Logo />
          <h1 style={{ fontSize: 36 }}>Vouched is invite-only</h1>
          <p className="muted">Every member is vouched in by someone who already belongs. Enter the code someone sent you.</p>
          <CodeForm claim initialError={claimError} />
          <p className="hint">No code? Ask a friend who’s on Vouched to vouch you in.</p>
        </div>
      </main>
    );
  }

  const meta = user.user_metadata ?? {};
  const suggested = (meta.full_name || meta.name || '') as string;
  // If they came here to vouch for someone, send them back there after setup.
  const after = next === '/home' || next === '/feed' ? '/props' : next;

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Logo />
        {inviter && (
          <div className="invite-card">
            <Avatar name={inviter.display_name} url={inviter.avatar_url} size={48} />
            <div className="grow"><span className="sig">{inviter.display_name}</span><p style={{ opacity: .8, fontSize: 14 }}>vouched you in. Your page will show it.</p></div>
          </div>
        )}
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 34 }}>Set up your page</h1>
          <p className="muted">This is the only part you write. Everything else comes from people who know you.</p>
        </div>
        <ProfileForm userId={user.id} existing={null} suggestedName={suggested} afterSave={after} saveLabel="Create my profile" />
      </div>
    </main>
  );
}
