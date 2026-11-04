import { NextResponse, type NextRequest } from 'next/server';
import { normalizeCode } from '@vouched/shared';
import { createClient } from '@/lib/supabase/server';

/** Remember the invite code, then sign up (or go straight to setup if already signed in). */
export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  const code = normalizeCode(params.code);
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const dest = user ? '/onboarding' : '/login?mode=signup&next=%2Fonboarding';
  const res = NextResponse.redirect(new URL(dest, request.url));
  res.cookies.set('vouched_invite', code, { path: '/', maxAge: 60 * 60 * 24 * 30, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  return res;
}
