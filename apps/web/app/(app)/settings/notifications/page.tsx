import type { UserSettings } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { NotificationsForm } from '../SettingsForms';

export const metadata = { title: 'Notifications' };
export default async function Notifications() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const { data } = await supabase.from('user_settings').select('*').eq('user_id', profile.id).maybeSingle();
  return <Screen title="Notifications" back="/settings"><NotificationsForm userId={profile.id} initial={data as UserSettings | null} /></Screen>;
}
