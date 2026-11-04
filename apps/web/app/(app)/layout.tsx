import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/supabase/server';
import { AppShell } from '@/components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getViewer();
  if (!user) redirect('/login');
  if (!profile) redirect('/onboarding');
  return <AppShell profile={profile}>{children}</AppShell>;
}
