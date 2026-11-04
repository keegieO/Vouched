import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/ProfileForm';
import { Logo } from '@/components/ui';
import { safeNext } from '@/lib/site';

export const metadata = { title: 'Set up your profile' };

export default async function Onboarding({ searchParams }: { searchParams: { next?: string } }) {
  const { user, profile } = await getViewer();
  if (!user) redirect('/login');
  const next = safeNext(searchParams.next, '/ask?welcome=1');
  if (profile) redirect(next);

  const meta = user.user_metadata ?? {};
  const suggested = (meta.full_name || meta.name || '') as string;
  // If they came here to vouch for someone, send them back there after setup.
  const after = next === '/home' || next === '/feed' ? '/ask?welcome=1' : next;

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <div className="stack" style={{ gap: 6 }}>
          <h1 style={{ fontSize: 34 }}>Set up your page</h1>
          <p className="muted">This is the only part you write. Everything else comes from people who know you.</p>
        </div>
        <ProfileForm userId={user.id} existing={null} suggestedName={suggested} afterSave={after} saveLabel="Create my profile" />
      </div>
    </main>
  );
}
