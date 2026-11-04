import type { SupabaseClient } from '@supabase/supabase-js';
export type SocialCounts = { followers: number; following: number; given: number; mutual?: boolean };

/** Follower, following and vouches-given counts for a profile, plus whether the viewer and they vouched for each other. */
export async function socialCounts(supabase: SupabaseClient, profileId: string, viewerId: string | null): Promise<SocialCounts & { viewerFollows: boolean }> {
  const head = { count: 'exact' as const, head: true };
  const [a, b, c, d, e, f] = await Promise.all([
    supabase.from('follows').select('follower_id', head).eq('followee_id', profileId),
    supabase.from('follows').select('followee_id', head).eq('follower_id', profileId),
    supabase.from('vouches').select('id', head).eq('author_id', profileId).eq('status', 'approved'),
    viewerId ? supabase.from('follows').select('follower_id', head).eq('follower_id', viewerId).eq('followee_id', profileId) : Promise.resolve({ count: 0 }),
    viewerId ? supabase.from('vouches').select('id', head).eq('author_id', viewerId).eq('subject_id', profileId).eq('status', 'approved') : Promise.resolve({ count: 0 }),
    viewerId ? supabase.from('vouches').select('id', head).eq('author_id', profileId).eq('subject_id', viewerId).eq('status', 'approved') : Promise.resolve({ count: 0 }),
  ]);
  return {
    followers: a.count ?? 0, following: b.count ?? 0, given: c.count ?? 0,
    viewerFollows: (d.count ?? 0) > 0,
    mutual: !!viewerId && viewerId !== profileId && (e.count ?? 0) > 0 && (f.count ?? 0) > 0,
  };
}
