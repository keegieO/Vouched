import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { AccountSettings } from '../AccountSettings';

export const metadata = { title: 'Account' };
export default async function Account() {
  const { user, profile } = await getViewer();
  if (!user || !profile) return null;
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  return (
    <Screen title="Account" back="/settings">
      <section className="card"><AccountSettings email={user.email ?? null} phone={user.phone || null} providers={providers} /></section>
    </Screen>
  );
}
