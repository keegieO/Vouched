import type { ProfileLink, VouchWithAuthor } from '@vouched/shared';
import { VOUCH_WITH_AUTHOR } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { EditProfileForm } from '@/components/EditProfileForm';

export const metadata = { title: 'Edit profile' };
export default async function EditProfile() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const [{ data: links }, { data: vs }] = await Promise.all([
    supabase.from('profile_links').select('*').eq('profile_id', profile.id).order('position'),
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false }).limit(20),
  ]);
  return (
    <Screen title="Edit profile" back={`/${profile.username}`}>
      <EditProfileForm profile={profile} links={(links ?? []) as ProfileLink[]} vouches={(vs ?? []) as unknown as VouchWithAuthor[]} />
    </Screen>
  );
}
