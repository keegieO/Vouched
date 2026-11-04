import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { AppearanceForm } from '../SettingsForms';

export const metadata = { title: 'Appearance' };
export default async function Appearance() {
  const { profile } = await getViewer();
  if (!profile) return null;
  return <Screen title="Appearance" back="/settings"><AppearanceForm profile={profile} /></Screen>;
}
