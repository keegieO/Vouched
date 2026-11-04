import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Public by design (row-level security protects the data). Environment variables win when set.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://agtkwvwaznlkecyjvhkr.supabase.co';
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_MHwfk1Ile0kr5fNW0ct7pA_TOTSJwuh';

const PRIVATE = ['/home', '/feed', '/discover', '/requests', '/inbox', '/ask', '/settings', '/written', '/onboarding', '/reset-password', '/props', '/invite', '/admin', '/feedback'];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const needsLogin = PRIVATE.some(p => path === p || path.startsWith(p + '/')) || /^\/[^/]+\/vouch\/?$/.test(path);
  let response = NextResponse.next({ request });

  // Refresh the sign-in cookie. If anything here fails, the page still loads (as signed out)
  // instead of the whole site showing a 500 error.
  let signedIn = false;
  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
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
    });
    const { data } = await supabase.auth.getUser();
    signedIn = !!data.user;
  } catch (e) {
    console.error('Vouched middleware: sign-in check failed', e);
    response = NextResponse.next({ request });
  }

  if (!signedIn && needsLogin) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest|api/card|.*\\.(?:png|jpg|svg|webp|ico|txt|xml)$).*)'],
};
