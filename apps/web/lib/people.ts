import type { SupabaseClient } from '@supabase/supabase-js';
import type { SearchResult } from '@vouched/shared';

/** The people someone follows, shaped like search results. */
export async function followingAsResults(supabase: SupabaseClient, userId: string): Promise<SearchResult[]> {
  const { data } = await supabase.from('follows')
    .select('p:profiles!follows_followee_id_fkey(id, username, display_name, headline, avatar_url, city, show_city, theme, style, status, skills, phone_verified)')
    .eq('follower_id', userId).order('created_at', { ascending: false }).limit(50);
  type P = { id: string; username: string; display_name: string; headline: string | null; avatar_url: string | null; city: string | null; show_city: boolean } & Pick<SearchResult, 'theme' | 'style' | 'status' | 'skills' | 'phone_verified'>;
  return ((data ?? []) as unknown as { p: P | null }[]).map(r => r.p).filter(Boolean).map(p => ({
    ...p!, city: p!.show_city ? p!.city : null, vouches: 0, circles: 0, followers: 0,
  }));
}
