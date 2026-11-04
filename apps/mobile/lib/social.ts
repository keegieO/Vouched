import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';

export type SocialCounts = { followers: number; following: number; given: number; mutual: boolean; viewerFollows: boolean };

/** Follower/following/given counts for a profile and the viewer's relationship to it, reloaded on focus. */
export function useSocialCounts(profileId: string | undefined, viewerId: string | null) {
  const [counts, setCounts] = useState<SocialCounts>({ followers: 0, following: 0, given: 0, mutual: false, viewerFollows: false });
  const load = useCallback(async () => {
    if (!profileId) return;
    const head = { count: 'exact' as const, head: true };
    const none = Promise.resolve({ count: 0 });
    const [a, b, c, d, e, f] = await Promise.all([
      supabase.from('follows').select('follower_id', head).eq('followee_id', profileId),
      supabase.from('follows').select('followee_id', head).eq('follower_id', profileId),
      supabase.from('vouches').select('id', head).eq('author_id', profileId).eq('status', 'approved'),
      viewerId ? supabase.from('follows').select('follower_id', head).eq('follower_id', viewerId).eq('followee_id', profileId) : none,
      viewerId ? supabase.from('vouches').select('id', head).eq('author_id', viewerId).eq('subject_id', profileId).eq('status', 'approved') : none,
      viewerId ? supabase.from('vouches').select('id', head).eq('author_id', profileId).eq('subject_id', viewerId).eq('status', 'approved') : none,
    ]);
    setCounts({
      followers: a.count ?? 0, following: b.count ?? 0, given: c.count ?? 0,
      viewerFollows: (d.count ?? 0) > 0,
      mutual: !!viewerId && viewerId !== profileId && (e.count ?? 0) > 0 && (f.count ?? 0) > 0,
    });
  }, [profileId, viewerId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { counts, reload: load };
}

import type { ProfileLink } from '@vouched/shared';

/** A profile's linked accounts, reloaded on focus. */
export function useProfileLinks(profileId: string | undefined) {
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const load = useCallback(async () => {
    if (!profileId) return;
    const { data } = await supabase.from('profile_links').select('*').eq('profile_id', profileId).order('position');
    setLinks((data ?? []) as ProfileLink[]);
  }, [profileId]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { links, setLinks, reload: load };
}
