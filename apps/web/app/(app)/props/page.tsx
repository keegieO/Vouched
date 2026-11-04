import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/supabase/server';
import type { Prompt } from '@vouched/shared';
import { PropsGame } from './PropsGame';

export const metadata = { title: 'Give props' };

export default async function PropsPage() {
  const { supabase, profile } = await getViewer();
  if (!profile) redirect('/onboarding?next=/props');
  const { data } = await supabase.from('prompts').select('id, question, label, icon').eq('active', true).order('id');
  return <PropsGame prompts={(data ?? []) as Prompt[]} />;
}
