import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { REQUEST_SELECT, VOUCH_WITH_BOTH, type RecRequest, type SearchResult, type VouchWithBoth } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, Empty, Panel, Row, T, useC } from '@/components/ui';
import { FeedRequest, FeedVouch, PersonRow } from '@/components/social';

type Item = { t: string; key: string; v?: VouchWithBoth; r?: RecRequest };

export default function Feed() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const [tab, setTab] = useState<'following' | 'everyone' | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [vouchedFor, setVouchedFor] = useState<Set<string>>(new Set());
  const [sugg, setSugg] = useState<SearchResult[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: f } = await supabase.from('follows').select('followee_id').eq('follower_id', profile.id);
    const fol = (f ?? []).map(x => x.followee_id as string);
    setFollowing(fol);
    const t = tab ?? (fol.length ? 'following' : 'everyone');
    if (!tab) setTab(t);
    const scope = t === 'following' ? [...fol, profile.id] : null;
    const ids = scope ? `(${scope.join(',')})` : '';
    let vq = supabase.from('vouches').select(VOUCH_WITH_BOTH).eq('status', 'approved').order('approved_at', { ascending: false }).limit(40);
    if (scope) vq = vq.or(`author_id.in.${ids},subject_id.in.${ids}`);
    let rq = supabase.from('requests').select(REQUEST_SELECT).order('created_at', { ascending: false }).limit(20);
    if (scope) rq = rq.in('author_id', scope);
    const [{ data: vs }, { data: rs }, { data: mine }, { data: s }] = await Promise.all([
      vq, rq,
      supabase.from('vouches').select('subject_id').eq('author_id', profile.id),
      supabase.rpc('search_profiles', { q: '', near: profile.show_city && profile.city ? profile.city : null, lim: 12 }),
    ]);
    setVouchedFor(new Set((mine ?? []).map(x => x.subject_id as string)));
    setSugg(((s ?? []) as SearchResult[]).filter(p => p.id !== profile.id && !fol.includes(p.id)).slice(0, 4));
    const all: Item[] = [
      ...((vs ?? []) as unknown as VouchWithBoth[]).map(v => ({ t: v.approved_at ?? v.created_at, key: 'v' + v.id, v })),
      ...((rs ?? []) as unknown as RecRequest[]).map(r => ({ t: [r.created_at, ...r.answers.map(a => a.created_at)].sort().at(-1)!, key: 'r' + r.id, r })),
    ].sort((a, b) => (a.t < b.t ? 1 : -1));
    setItems(all);
  }, [profile, tab]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <T v="h1">Feed</T>
          <Button small title="Ask for a rec" onPress={() => router.push({ pathname: '/(tabs)/ask', params: { tab: 'rec' } })} />
        </Row>
        <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 }}>
          {(['following', 'everyone'] as const).map(k => (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityState={{ selected: tab === k }}
              style={{ flex: 1, padding: 9, borderRadius: 9, alignItems: 'center', backgroundColor: tab === k ? c.card : 'transparent' }}>
              <Text style={{ fontWeight: '600', color: tab === k ? c.ink : c.muted }}>{k === 'following' ? 'Following' : 'Everyone'}</Text>
            </Pressable>
          ))}
        </View>
        {sugg.length > 0 && following.length < 3 && (
          <Panel style={{ gap: 4 }}>
            <T v="h3">{following.length ? 'More people near you' : 'Follow people you know'}</T>
            <T v="hint">Their vouches and recommendation asks show up here.</T>
            {sugg.map((p, i) => <PersonRow key={p.id} p={p} following={false} first={i === 0} />)}
          </Panel>
        )}
        {items.length ? items.map(i => i.v ? <FeedVouch key={i.key} v={i.v} alreadyVouched={vouchedFor.has(i.v.subject_id)} /> : <FeedRequest key={i.key} r={i.r!} />)
          : <Empty>Nothing here yet. Follow a few people, or switch to Everyone.</Empty>}
      </ScrollView>
    </SafeAreaView>
  );
}
