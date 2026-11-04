import { useCallback, useState } from 'react';
import { TextInput, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { REQUEST_SELECT, type RecRequest, type SearchResult } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Empty, Panel, Screen, T, useC } from '@/components/ui';
import { FeedRequest, PersonRow, useFollowing, usePeopleSearch } from '@/components/social';

export default function Discover() {
  const { profile } = useAuth();
  const c = useC();
  const { q, setQ, results, loading } = usePeopleSearch();
  const { ids: following, load: loadFollowing } = useFollowing();
  const [nearby, setNearby] = useState<SearchResult[]>([]);
  const [top, setTop] = useState<SearchResult[]>([]);
  const [asks, setAsks] = useState<RecRequest[]>([]);
  const near = profile?.show_city && profile.city ? profile.city : null;

  useFocusEffect(useCallback(() => {
    if (!profile) return;
    loadFollowing();
    (async () => {
      const [{ data: a }, { data: b }, { data: r }] = await Promise.all([
        near ? supabase.rpc('search_profiles', { q: '', near, lim: 8 }) : Promise.resolve({ data: [] }),
        supabase.rpc('search_profiles', { q: '', lim: 20 }),
        supabase.from('requests').select(REQUEST_SELECT).neq('author_id', profile.id).order('created_at', { ascending: false }).limit(3),
      ]);
      setNearby(((a ?? []) as SearchResult[]).filter(p => p.id !== profile.id));
      setTop(((b ?? []) as SearchResult[]).filter(p => p.id !== profile.id));
      setAsks((r ?? []) as unknown as RecRequest[]);
    })();
  }, [profile, near, loadFollowing]));

  const list = (arr: SearchResult[]) => (
    <Panel style={{ gap: 0, paddingVertical: 4 }}>
      {arr.map((p, i) => <PersonRow key={p.id} p={p} following={following.includes(p.id)} first={i === 0} />)}
    </Panel>
  );
  const hits = results.filter(r => r.id !== profile?.id);

  return (
    <Screen>
      <T v="h1">Discover</T>
      <TextInput value={q} onChangeText={setQ} placeholder="Search names, skills, cities…" placeholderTextColor={c.muted} autoCapitalize="none" autoCorrect={false}
        style={{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: c.ink }} />
      {q.trim() ? (
        loading ? <T v="hint">Searching…</T> : hits.length ? list(hits) : <Empty>No one matches “{q}”. Try a skill like “dog” or “handyman”.</Empty>
      ) : (
        <View style={{ gap: 18 }}>
          {nearby.length > 0 && <View style={{ gap: 8 }}><T v="label">Most vouched in {near}</T>{list(nearby)}</View>}
          {asks.length > 0 && <View style={{ gap: 8 }}><T v="label">Open asks</T>{asks.map(r => <FeedRequest key={r.id} r={r} />)}</View>}
          <View style={{ gap: 8 }}><T v="label">Most vouched on Vouched</T>{top.length ? list(top) : <Empty>You’re early. Invite people you know and they’ll show up here.</Empty>}</View>
        </View>
      )}
    </Screen>
  );
}
