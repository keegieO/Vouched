import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/supabase/server';
import { safeNext } from '@/lib/site';

// After any sign-in: new people set up a profile first, everyone else goes where they were headed.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get('next'));
  const { user, profile } = await getViewer();
  if (!user) return NextResponse.redirect(new URL('/login', url.origin));
  if (!profile) return NextResponse.redirect(new URL(`/onboarding?next=${encodeURIComponent(next)}`, url.origin));
  return NextResponse.redirect(new URL(next, url.origin));
}
