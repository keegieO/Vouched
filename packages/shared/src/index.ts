// Shared rules, constants and types used by both the web and mobile apps.
// Keep these in sync with the checks in supabase/migrations/0001_init.sql.

export const RELATIONSHIPS = [
  'Client', 'Coworker', 'Friend', 'Roommate', 'Neighbor', 'Family', 'Classmate', 'Teammate',
] as const;
export type Relationship = (typeof RELATIONSHIPS)[number];

export const DURATIONS = [
  'Hired them once', 'Hired them 2+ times', 'Known under a year',
  'Known 1–3 years', 'Known 3–10 years', 'Known 10+ years',
] as const;

export const TRAITS = [
  'On time', 'Honest', 'Fair price', 'Good with kids', 'Pays back', 'Hard worker',
  'Clean', 'Calm in a crisis', 'Funny', 'Keeps their word', 'Great listener',
  'Skilled', 'Respectful', 'Generous', 'Reliable',
] as const;

export const MAX_TRAITS = 3;
export const BODY_MIN = 20;
export const BODY_MAX = 280;

export const THEMES = {
  cobalt: { name: 'Cobalt', light: '#2E4AD8', dark: '#8096FF', soft: '#E3E8FF', softDark: '#222B55' },
  forest: { name: 'Forest', light: '#1C7A52', dark: '#56C995', soft: '#DDF2E7', softDark: '#15362A' },
  plum:   { name: 'Plum',   light: '#7A3BB8', dark: '#C49AF2', soft: '#EFE4FA', softDark: '#33204A' },
  ember:  { name: 'Ember',  light: '#C2491D', dark: '#FF9B70', soft: '#FCE6DC', softDark: '#45231A' },
  slate:  { name: 'Slate',  light: '#3A4560', dark: '#A9B5D3', soft: '#E4E8F0', softDark: '#262D40' },
} as const;
export type ThemeKey = keyof typeof THEMES;

export const STYLES = {
  signed: { name: 'Signed', blurb: 'Clean, with handwritten signatures' },
  pop:    { name: 'Sticker Pop', blurb: 'Loud, bold, made to be shared' },
  night:  { name: 'Night Shift', blurb: 'Dark, with chat-bubble vouches' },
  badge:  { name: 'Work Badge', blurb: 'Built like a job-site ID' },
} as const;
export type StyleKey = keyof typeof STYLES;
export const isStyle = (s: unknown): s is StyleKey => typeof s === 'string' && s in STYLES;

export const REPORT_REASONS = {
  fake: 'Fake or written by the person themselves',
  harassment: 'Harassment or a hidden insult',
  private_info: 'Shares private info (address, health, etc.)',
  spam: 'Spam or advertising',
  other: 'Something else',
} as const;
export type ReportReason = keyof typeof REPORT_REASONS;

export const RESERVED_USERNAMES = new Set([
  'admin','api','app','ask','auth','help','home','inbox','login','logout','onboarding',
  'privacy','settings','signup','support','terms','vouch','vouched','www','about','blog','static','_next','feed','discover','requests','written','me',
]);

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  city: string | null;
  headline: string | null;
  avatar_url: string | null;
  theme: ThemeKey;
  style: StyleKey;
  show_city: boolean;
  open_to_vouches: boolean;
  phone_verified: boolean;
  created_at: string;
};

export type VouchStatus = 'pending' | 'approved' | 'hidden';

export type Vouch = {
  id: string;
  subject_id: string;
  author_id: string;
  relationship: Relationship;
  duration: string;
  traits: string[];
  body: string;
  status: VouchStatus;
  created_at: string;
  approved_at: string | null;
  reply?: string | null;
  reply_at?: string | null;
  cosigns?: { user_id: string }[];
};

export type VouchWithAuthor = Vouch & {
  author: Pick<Profile, 'username' | 'display_name' | 'avatar_url' | 'phone_verified'> | null;
};
export type VouchWithSubject = Vouch & {
  subject: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null;
};

export const VOUCH_WITH_AUTHOR =
  '*, author:profiles!vouches_author_id_fkey(username, display_name, avatar_url, phone_verified), cosigns(user_id)';
export const VOUCH_WITH_BOTH =
  '*, author:profiles!vouches_author_id_fkey(username, display_name, avatar_url, phone_verified), subject:profiles!vouches_subject_id_fkey(username, display_name, avatar_url), cosigns(user_id)';
export type VouchWithBoth = VouchWithAuthor & { subject: Pick<Profile, 'username' | 'display_name' | 'avatar_url'> | null };

// ── Social ───────────────────────────────────────────────────
export type MiniProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'headline'>;
export const REQUEST_SELECT =
  '*, author:profiles!requests_author_id_fkey(id, username, display_name, avatar_url, headline), answers:request_answers(id, note, created_at, author:profiles!request_answers_author_id_fkey(id, username, display_name, avatar_url, headline), recommended:profiles!request_answers_recommended_id_fkey(id, username, display_name, avatar_url, headline))';
export type RequestAnswer = { id: string; note: string | null; created_at: string; author: MiniProfile | null; recommended: MiniProfile | null };
export type RecRequest = { id: string; author_id: string; body: string; city: string | null; created_at: string; author: MiniProfile | null; answers: RequestAnswer[] };
export type SearchResult = {
  id: string; username: string; display_name: string; headline: string | null; city: string | null; avatar_url: string | null;
  theme: ThemeKey; style: StyleKey; phone_verified: boolean; vouches: number; circles: number; followers: number;
};
export type NotificationType = 'new_vouch' | 'vouch_approved' | 'new_follower' | 'cosign' | 'vouch_reply' | 'rec_answer' | 'rec_for_you';
export const NOTIFICATION_TEXT: Record<NotificationType, string> = {
  new_vouch: 'wrote you a vouch.',
  vouch_approved: 'approved your vouch.',
  new_follower: 'started following you.',
  cosign: 'co-signed a vouch you’re part of.',
  vouch_reply: 'replied to your vouch.',
  rec_answer: 'answered your ask.',
  rec_for_you: 'recommended you to someone.',
};
export const REQUEST_MIN = 10;
export const REQUEST_MAX = 200;
export const REPLY_MAX = 200;
export const NOTE_MAX = 160;

/** Group answers by the person recommended, most-recommended first. */
export function groupAnswers(answers: RequestAnswer[]) {
  const map = new Map<string, { person: MiniProfile; answers: RequestAnswer[] }>();
  for (const a of answers) {
    if (!a.recommended) continue;
    const g = map.get(a.recommended.id) ?? { person: a.recommended, answers: [] };
    g.answers.push(a);
    map.set(a.recommended.id, g);
  }
  return [...map.values()].sort((x, y) => y.answers.length - x.answers.length);
}
export const VOUCH_WITH_SUBJECT =
  '*, subject:profiles!vouches_subject_id_fkey(username, display_name, avatar_url)';

// ── Validation ────────────────────────────────────────────────
export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase().replace(/^@/, '');
}

export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 3) return 'Use at least 3 characters.';
  if (u.length > 20) return 'Use 20 characters or fewer.';
  if (!/^[a-z0-9_]+$/.test(u)) return 'Use only letters, numbers, and underscores.';
  if (RESERVED_USERNAMES.has(u)) return 'That username is reserved. Try another.';
  return null;
}

export function vouchError(v: { relationship?: string; duration?: string; traits: string[]; body: string }): string | null {
  if (!v.relationship) return 'Pick how you know them.';
  if (!v.duration) return 'Pick how long you have known them.';
  if (v.traits.length > MAX_TRAITS) return `Pick up to ${MAX_TRAITS} traits.`;
  const len = v.body.trim().length;
  if (len < BODY_MIN) return `Write at least ${BODY_MIN} characters. A real moment works best.`;
  if (len > BODY_MAX) return `Keep it under ${BODY_MAX} characters.`;
  return null;
}

// ── Trust summary ────────────────────────────────────────────
export const TRUSTED_MIN_VOUCHES = 10;
export const TRUSTED_MIN_CIRCLES = 3;

export function trustSummary(vouches: Pick<Vouch, 'relationship' | 'traits'>[]) {
  const circles = new Set(vouches.map(v => v.relationship));
  const nonFamilyCircles = new Set(vouches.filter(v => v.relationship !== 'Family').map(v => v.relationship));
  const counted = vouches.filter(v => v.relationship !== 'Family').length
    + Math.floor(vouches.filter(v => v.relationship === 'Family').length / 2);
  const traitCounts: Record<string, number> = {};
  for (const v of vouches) for (const t of v.traits) traitCounts[t] = (traitCounts[t] ?? 0) + 1;
  const topTraits = Object.entries(traitCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const trusted = counted >= TRUSTED_MIN_VOUCHES && nonFamilyCircles.size >= TRUSTED_MIN_CIRCLES;
  return {
    total: vouches.length,
    circles: [...circles],
    countedTowardBadge: counted,
    nonFamilyCircles: nonFamilyCircles.size,
    topTraits,
    trusted,
  };
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function timeAgo(iso: string, now = Date.now()) {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = s / 60; if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60; if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24; if (d < 7) return `${Math.floor(d)}d ago`;
  const w = d / 7; if (w < 5) return `${Math.floor(w)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function vouchLink(siteUrl: string, username: string) {
  return `${siteUrl.replace(/\/$/, '')}/${username}/vouch`;
}
export function profileLink(siteUrl: string, username: string) {
  return `${siteUrl.replace(/\/$/, '')}/${username}`;
}
export function askText(siteUrl: string, displayName: string, username: string) {
  const first = displayName.split(' ')[0];
  return `Hey! I'm setting up a Vouched profile. Would you write a quick line about me? Takes a minute: ${vouchLink(siteUrl, username)} — ${first}`;
}
