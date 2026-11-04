import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { PeoplePicker } from '@/components/PeoplePicker';
import { followingAsResults } from '@/lib/people';

export const metadata = { title: 'Request a vouch' };
export default async function RequestVouch() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const [initial, { data: got }] = await Promise.all([
    followingAsResults(supabase, profile.id),
    supabase.from('vouches').select('author_id').eq('subject_id', profile.id),
  ]);
  return (
    <Screen title="Request a vouch" back>
      <p className="muted">Pick someone who knows you. They’ll get a notification asking them to vouch.</p>
      <PeoplePicker mode="request" viewerId={profile.id} initial={initial} done={(got ?? []).map(x => x.author_id as string)} />
    </Screen>
  );
}
