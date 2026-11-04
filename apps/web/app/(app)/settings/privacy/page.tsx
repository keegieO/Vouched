import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { PrivacyForm } from '../SettingsForms';

export const metadata = { title: 'Privacy' };
export default async function Privacy() {
  const { profile } = await getViewer();
  if (!profile) return null;
  return <Screen title="Privacy" back="/settings"><PrivacyForm profile={profile} /></Screen>;
}
