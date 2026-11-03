import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/supabase/server';
import { AppNav } from './AppNav';
import { themeStyle } from '@/components/ui';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user, profile } = await getViewer();
  if (!user) redirect('/login');
  if (!profile) redirect('/onboarding');

  const { count } = await supabase
    .from('vouches').select('id', { count: 'exact', head: true })
    .eq('subject_id', user.id).eq('status', 'pending');

  return (
    <div className="themed" style={themeStyle(profile.theme)}>
      <AppNav userId={user.id} pending={count ?? 0} username={profile.username} />
      <main className="container app-main">{children}</main>
    </div>
  );
}
