import { redirect } from 'next/navigation';
import type { DropPrompt } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { DropGame } from '@/components/v2';

export const metadata = { title: 'Today’s polls' };

export default async function PollsPage() {
  const { supabase, profile } = await getViewer();
  if (!profile) redirect('/onboarding?next=/props');
  const [{ data }, { data: streak }] = await Promise.all([supabase.rpc('today_drop'), supabase.rpc('my_streak')]);
  return <DropGame prompts={(data ?? []) as DropPrompt[]} streak={(streak as number | null) ?? 0} />;
}
