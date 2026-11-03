import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { safeNext } from '@/lib/site';

// OAuth, email confirmation and password-reset links land here.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));
  const errDesc = url.searchParams.get('error_description');

  if (errDesc) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(errDesc)}`, url.origin));

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  if (next === '/reset-password') return NextResponse.redirect(new URL(next, url.origin));
  return NextResponse.redirect(new URL(`/auth/continue?next=${encodeURIComponent(next)}`, url.origin));
}
