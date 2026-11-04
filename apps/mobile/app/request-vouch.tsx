import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { SearchResult } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Banner, Button, Empty, Field, Panel, Screen, T } from '@/components/ui';
import { PersonRow, usePeopleSearch } from '@/components/social';

export default function RequestVouch() {
  const { session } = useAuth();
  const { q, setQ, results, loading } = usePeopleSearch();
  const [following, setFollowing] = useState<SearchResult[]>([]);
  const [asked, setAsked] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const me = session?.user.id;

  useFocusEffect(useCallback(() => {
    if (!me) return;
    supabase.from('follows').select('p:profiles!follows_followee_id_fkey(id, username, display_name, headline, avatar_url, city, show_city, theme, style, status, skills, phone_verified)')
      .eq('follower_id', me).limit(50).then(({ data }) => {
        setFollowing(((data ?? []) as unknown as { p: SearchResult & { show_city: boolean } | null }[]).map(r => r.p).filter(Boolean)
          .map(p => ({ ...p!, city: p!.show_city ? p!.city : null, vouches: 0, circles: 0, followers: 0 })));
      });
  }, [me]));

  const list = (q.trim() ? results : following).filter(p => p.id !== me);
  async function ask(p: SearchResult) {
    const { error } = await supabase.from('vouch_requests').insert({ requester_id: me, recipient_id: p.id });
    if (error) return setMsg(error.code === '23505' ? `You already asked ${p.display_name.split(' ')[0]}.` : error.message);
    setAsked([...asked, p.id]);
    setMsg(`Asked ${p.display_name.split(' ')[0]} to vouch for you.`);
  }

  return (
    <Screen edges={[]}>
      <T v="muted">Pick someone who knows you. They’ll get a notification asking them to vouch.</T>
      <Field label="Search" value={q} onChangeText={setQ} placeholder="Search people" autoCapitalize="none" />
      {msg && <Banner tone="good">{msg}</Banner>}
      {!q.trim() && <T v="label">{following.length ? 'People you follow' : 'Search for someone you know'}</T>}
      {loading ? <T v="hint">Searching…</T> : list.length ? (
        <Panel style={{ gap: 0, paddingVertical: 4 }}>
          {list.map((p, i) => <PersonRow key={p.id} p={p} following first={i === 0}
            action={asked.includes(p.id) ? <Button small kind="ghost" title="Asked" disabled onPress={() => {}} /> : <Button small title="Request" onPress={() => ask(p)} />} />)}
        </Panel>
      ) : q.trim() ? <Empty>No one matches “{q}”.</Empty> : null}
    </Screen>
  );
}
