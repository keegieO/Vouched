import { getViewer } from '@/lib/supabase/server';
import { ProfileForm } from '@/components/ProfileForm';
import { AccountSettings, BlockedList } from './AccountSettings';

export const metadata = { title: 'Settings' };

type Blocked = { blocked_id: string; blocked: { username: string; display_name: string } | null };

export default async function Settings() {
  const { supabase, user, profile } = await getViewer();
  if (!user || !profile) return null;
  const { data } = await supabase.from('blocks')
    .select('blocked_id, blocked:profiles!blocks_blocked_id_fkey(username, display_name)')
    .eq('blocker_id', user.id);
  const blocked = (data ?? []) as unknown as Blocked[];
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];

  return (
    <div className="stack-lg narrow">
      <h1 style={{ fontSize: 'clamp(30px,5vw,44px)' }}>Settings</h1>

      <section className="panel">
        <h2>Profile</h2>
        <ProfileForm userId={user.id} existing={profile} afterSave="/settings" saveLabel="Save profile" />
      </section>

      <section className="panel">
        <h2>Account</h2>
        <AccountSettings email={user.email ?? null} phone={user.phone || null} providers={providers} />
      </section>

      <section className="panel">
        <h2>Blocked people</h2>
        <BlockedList blocked={blocked.map(b => ({ id: b.blocked_id, name: b.blocked?.display_name ?? 'Deleted account', username: b.blocked?.username ?? '' }))} />
      </section>
    </div>
  );
}
