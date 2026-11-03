import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { VOUCH_WITH_AUTHOR, type VouchStatus, type VouchWithAuthor } from '@vouched/shared';
import { supabase } from './supabase';

/** Vouches about one person with a given status, reloaded whenever the screen gains focus. */
export function useVouches(subjectId: string | undefined, status: VouchStatus) {
  const [vouches, setVouches] = useState<VouchWithAuthor[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!subjectId) return;
    const { data } = await supabase.from('vouches').select(VOUCH_WITH_AUTHOR)
      .eq('subject_id', subjectId).eq('status', status)
      .order(status === 'approved' ? 'approved_at' : 'created_at', { ascending: false });
    setVouches((data ?? []) as unknown as VouchWithAuthor[]);
    setLoading(false);
  }, [subjectId, status]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  return { vouches, loading, reload: load };
}

/** Number of vouches waiting for approval, kept live. */
export function usePendingCount(userId: string | undefined) {
  const [count, setCount] = useState(0);
  const load = useCallback(async () => {
    if (!userId) return;
    const { count } = await supabase.from('vouches').select('id', { count: 'exact', head: true }).eq('subject_id', userId).eq('status', 'pending');
    setCount(count ?? 0);
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    load();
    const ch = supabase.channel(`pending-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);
  return { count, reload: load };
}
