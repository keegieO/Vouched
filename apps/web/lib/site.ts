export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null | undefined, fallback = '/feed') {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}
