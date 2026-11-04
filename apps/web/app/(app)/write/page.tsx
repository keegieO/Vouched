import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { PeoplePicker } from '@/components/PeoplePicker';
import { followingAsResults } from '@/lib/people';

export const metadata = { title: 'Write a vouch' };
export default async function Write() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const [initial, { data: mine }] = await Promise.all([
    followingAsResults(supabase, profile.id),
    supabase.from('vouches').select('subject_id').eq('author_id', profile.id),
  ]);
  return (
    <Screen title="Write a vouch" back>
      <p className="muted">Who do you want to vouch for?</p>
      <PeoplePicker mode="write" viewerId={profile.id} initial={initial} done={(mine ?? []).map(x => x.subject_id as string)} />
    </Screen>
  );
}
