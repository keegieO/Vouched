import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { BlockedList } from '../AccountSettings';

export const metadata = { title: 'Blocked people' };
type Blocked = { blocked_id: string; blocked: { username: string; display_name: string } | null };
export default async function BlockedPage() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const { data } = await supabase.from('blocks').select('blocked_id, blocked:profiles!blocks_blocked_id_fkey(username, display_name)').eq('blocker_id', profile.id);
  const list = ((data ?? []) as unknown as Blocked[]).map(b => ({ id: b.blocked_id, name: b.blocked?.display_name ?? 'Deleted account', username: b.blocked?.username ?? '' }));
  return <Screen title="Blocked people" back="/settings"><section className="card"><BlockedList blocked={list} /></section></Screen>;
}
