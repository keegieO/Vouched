export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** Only allow same-site relative redirects after login. */
export function safeNext(next: string | null | undefined, fallback = '/feed') {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return fallback;
  return next;
}

/** Where privacy, deletion and support requests go. Set NEXT_PUBLIC_CONTACT_EMAIL before launch. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || 'support@YOUR-DOMAIN.com';
