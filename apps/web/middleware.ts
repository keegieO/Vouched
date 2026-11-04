import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { SUPABASE_KEY, SUPABASE_URL } from './lib/supabase/env';

const PRIVATE = ['/home', '/feed', '/discover', '/requests', '/inbox', '/ask', '/settings', '/written', '/onboarding', '/reset-password', '/props', '/invite', '/admin', '/feedback'];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const path = request.nextUrl.pathname;
  // Never take the whole site down over a sign-in check: if it fails, treat the visitor as signed out.
  let user = null;
  try {
    ({ data: { user } } = await supabase.auth.getUser());
  } catch (e) {
    console.error('middleware auth check failed', e);
  }

  const needsLogin = PRIVATE.some(p => path === p || path.startsWith(p + '/')) || /^\/[^/]+\/vouch\/?$/.test(path);
  if (!user && needsLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|.*\\.(?:png|jpg|svg|webp)$).*)'],
};
