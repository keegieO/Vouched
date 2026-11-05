import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Logo } from '@/components/ui';
import { CodeForm } from './CodeForm';

export const metadata = { title: 'Join with an invite' };
export const dynamic = 'force-dynamic';

export default async function Join() {
  const { data: cfg } = await createClient().from('app_config').select('value').eq('key', 'invite_only').maybeSingle();
  const open = cfg?.value === 'off';
  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1 style={{ fontSize: 38 }}>{open ? 'Join Vouched' : 'Got an invite code?'}</h1>
        {open ? (
          <>
            <p className="muted">Vouched is open to founding members right now, so no code is needed.</p>
            <Link className="btn primary lg block" href="/login?mode=signup&next=%2Fonboarding">Sign up</Link>
            <p className="hint">Have a code anyway? Enter it below.</p>
          </>
        ) : (
          <p className="muted">Every member is vouched in by someone who already belongs. Enter the code from your text.</p>
        )}
        <CodeForm />
        <Link className="link small" style={{ alignSelf: 'center' }} href="/login">Already a member? Log in</Link>
      </div>
    </main>
  );
}
