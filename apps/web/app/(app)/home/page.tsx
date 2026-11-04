import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/supabase/server';

// Your profile lives at /your-username; /home keeps old links working.
export default async function Home() {
  const { profile } = await getViewer();
  redirect(profile ? `/${profile.username}` : '/onboarding');
}
