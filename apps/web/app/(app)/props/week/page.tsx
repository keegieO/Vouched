import type { WeekResult } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { WeekReveal } from '@/components/v2';
import { SITE_URL } from '@/lib/site';

export const metadata = { title: 'Your week' };

export default async function WeekPage() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const { data } = await supabase.rpc('my_week');
  return <WeekReveal results={(data ?? []) as WeekResult[]} shareUrl={`${SITE_URL.replace(/\/$/, '')}/${profile.username}`} />;
}
