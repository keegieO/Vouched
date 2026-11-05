import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GIFT_WITH_PEOPLE, VOUCH_WITH_BOTH,
  type FeedResult, type GiftWithPeople, type MyTrust, type ReactionCount, type VouchWithBoth,
} from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Button, FONT_BODY, FONT_BOLD, FONT_DISPLAY, FONT_HEAVY, useC } from '@/components/ui';
import { CaughtUp, GUT, PostGift, PostJoin, PostResult, PostVouch, Stories, Tabs, type StoryPerson } from '@/components/v2';

type Join = { id: string; username: string; display_name: string; avatar_url: string | null; created_at: string; inviter: { username: string; display_name: string; avatar_url: string | null } | null };
const DAYS = 21, SEEN_KEY = 'vouched-seen-stories';

export default function Feed() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const [tab, setTab] = useState<'for' | 'friends'>('for');
  const [data, setData] = useState<{ vouches: VouchWithBoth[]; gifts: GiftWithPeople[]; joins: Join[]; results: FeedResult[]; following: string[] } | null>(null);
  const [counts, setCounts] = useState<Map<string, ReactionCount>>(new Map());
  const [played, setPlayed] = useState(true);
  const [streak, setStreak] = useState(0);
  const [trust, setTrust] = useState<MyTrust | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => { AsyncStorage.getItem(SEEN_KEY).then(v => v && setSeen(new Set(JSON.parse(v)))).catch(() => {}); }, []);
  const markSeen = useCallback((id: string) => setSeen(s => {
    const n = new Set(s); n.add(id); AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...n].slice(-200))).catch(() => {}); return n;
  }), []);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: f } = await supabase.from('follows').select('followee_id').eq('follower_id', profile.id);
    const following = (f ?? []).map(x => x.followee_id as string);
    const scope = tab === 'friends' ? [...following, profile.id] : null;
    const ids = scope ? `(${scope.join(',')})` : '';
    const since = new Date(Date.now() - DAYS * 86400000).toISOString();
    let vq = supabase.from('vouches').select(VOUCH_WITH_BOTH).eq('status', 'approved').gte('approved_at', since).order('approved_at', { ascending: false }).limit(40);
    if (scope) vq = vq.or(`author_id.in.${ids},subject_id.in.${ids}`);
    let gq = supabase.from('gifts').select(GIFT_WITH_PEOPLE).gte('created_at', since).order('created_at', { ascending: false }).limit(30);
    if (scope) gq = gq.or(`sender_id.in.${ids},receiver_id.in.${ids}`);
    let jq = supabase.from('profiles').select('id, username, display_name, avatar_url, created_at, inviter:profiles!profiles_invited_by_fkey(username, display_name, avatar_url)')
      .not('invited_by', 'is', null).eq('standing', 'good').gte('created_at', since).order('created_at', { ascending: false }).limit(12);
    if (scope) jq = jq.or(`id.in.${ids},invited_by.in.${ids}`);
    const [{ data: vs }, { data: gs }, { data: js }, { data: rs }, { data: drop }, { data: st }, { data: tr }] = await Promise.all([
      vq, gq, jq, supabase.rpc('feed_results', { lim: 10 }), supabase.rpc('today_drop'), supabase.rpc('my_streak'), supabase.rpc('my_trust'),
    ]);
    const vouches = (vs ?? []) as unknown as VouchWithBoth[], gifts = (gs ?? []) as unknown as GiftWithPeople[];
    setData({ vouches, gifts, joins: ((js ?? []) as unknown as Join[]).filter(j => j.inviter && j.id !== profile.id), results: (rs ?? []) as FeedResult[], following });
    setPlayed(((drop ?? []) as { answered: boolean }[]).some(d => d.answered));
    setStreak((st as number | null) ?? 0);
    setTrust(((tr ?? []) as MyTrust[])[0] ?? null);
    const [{ data: vc }, { data: gc }] = await Promise.all([
      vouches.length ? supabase.rpc('reaction_counts', { p_type: 'vouch', p_ids: vouches.map(v => v.id) }) : Promise.resolve({ data: [] }),
      gifts.length ? supabase.rpc('reaction_counts', { p_type: 'gift', p_ids: gifts.map(g => g.id) }) : Promise.resolve({ data: [] }),
    ]);
    setCounts(new Map(([...(vc ?? []), ...(gc ?? [])] as ReactionCount[]).map(x => [x.target_id, x])));
  }, [profile, tab]);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  if (!profile) return null;

  const fresh = Date.now() - 4 * 86400000;
  const story = new Map<string, StoryPerson>();
  const person = (id: string, p: { username: string; display_name: string; avatar_url: string | null }) =>
    story.get(id) ?? story.set(id, { id, username: p.username, name: p.display_name, avatar: p.avatar_url, slides: [] }).get(id)!;
  if (data) {
    data.vouches.filter(v => data.following.includes(v.subject_id) && v.subject && v.author && new Date(v.approved_at ?? v.created_at).getTime() > fresh).forEach(v => {
      const sp = person(v.subject_id, v.subject!);
      if (sp.slides.filter(x => x.kind === 'vouch').length < 2) sp.slides.push({ kind: 'vouch', at: v.approved_at ?? v.created_at, from: v.author!.display_name, rel: `${v.relationship} · ${v.duration}`, body: v.body });
    });
    data.gifts.filter(g => data.following.includes(g.receiver_id) && g.receiver && g.sender && new Date(g.created_at).getTime() > fresh).forEach(g => {
      const sp = person(g.receiver_id, g.receiver!);
      if (!sp.slides.some(x => x.kind === 'gift')) sp.slides.push({ kind: 'gift', at: g.created_at, from: g.sender!.display_name, emoji: g.type?.emoji ?? '🎁', label: g.type?.label ?? 'Gift', note: g.note });
    });
    data.results.forEach(r => person(r.user_id, r).slides.push({ kind: 'poll', at: new Date().toISOString(), emoji: r.emoji, label: r.label, question: r.question, n: Number(r.n) }));
  }
  const items = data ? [
    ...data.vouches.map(v => ({ t: v.approved_at ?? v.created_at, k: v.id, node: <PostVouch v={v} counts={counts.get(v.id)} onChanged={load} /> })),
    ...data.gifts.map(g => ({ t: g.created_at, k: g.id, node: <PostGift g={g} counts={counts.get(g.id)} /> })),
    ...data.joins.map(j => ({ t: j.created_at, k: `j${j.id}`, node: <PostJoin j={{ ...j, inviter: j.inviter! }} /> })),
    ...data.results.filter(r => r.user_id !== profile.id).map((r, i) => ({ t: new Date(Date.now() - (i + 1) * 3 * 3600000).toISOString(), k: `r${r.user_id}`, node: <PostResult r={{ ...r, n: Number(r.n) }} /> })),
  ].sort((a, b) => (a.t < b.t ? 1 : -1)) : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUT, height: 50 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}><Ionicons name="checkmark" size={20} color="#fff" /></View>
        <Text style={{ fontFamily: FONT_DISPLAY, fontSize: 22, letterSpacing: -1, color: c.ink, flex: 1 }}>vouched</Text>
        <Pressable onPress={() => router.push('/score')} hitSlop={10} accessibilityLabel="Your trust score"><Ionicons name="shield-checkmark-outline" size={24} color={c.ink} /></Pressable>
      </View>
      <Tabs tabs={[['for', 'For you'], ['friends', 'Friends']]} value={tab} onChange={k => { setTab(k); setData(null); }} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
        <Stories me={{ name: profile.display_name, avatar: profile.avatar_url }} people={[...story.values()].filter(s => s.slides.length)} playedToday={played} seen={seen} onSeen={markSeen} />
        {!played && (
          <View style={{ margin: GUT, borderRadius: 20, padding: 18, backgroundColor: '#0F1419', gap: 10, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
            <View style={{ position: 'absolute', right: -30, top: -30, width: 100, height: 100, borderRadius: 50, backgroundColor: c.hi }} />
            <View style={{ alignSelf: 'flex-start', backgroundColor: c.hi, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontFamily: FONT_HEAVY, fontSize: 13, color: c.hiInk }}>🔥 {streak} day streak</Text></View>
            <Text style={{ fontFamily: FONT_HEAVY, fontSize: 21, color: '#fff', letterSpacing: -0.4, maxWidth: '80%' }}>Today’s polls are live</Text>
            <Text style={{ fontFamily: FONT_BODY, fontSize: 14, color: 'rgba(255,255,255,.68)' }}>5 quick questions about your friends. Anonymous, and it shows on their profile. New every day at noon.</Text>
            <Button kind="hi" title="Play now" onPress={() => router.push('/props')} style={{ alignSelf: 'flex-start' }} />
          </View>
        )}
        {trust?.next_tier ? (
          <Pressable onPress={() => router.push('/score')} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: GUT, borderBottomWidth: 1, borderColor: c.line }}>
            <Ionicons name="shield-checkmark-outline" size={22} color={c.ink} />
            <View style={{ flex: 1, gap: 6 }}>
              <Text style={{ fontFamily: FONT_BODY, fontSize: 14, color: c.ink }}><Text style={{ fontFamily: FONT_BOLD }}>{trust.points_to_next} points</Text> to <Text style={{ fontFamily: FONT_BOLD }}>{trust.next_tier}</Text></Text>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.line, overflow: 'hidden' }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: c.accent, width: `${Math.round((trust.score / (trust.score + (trust.points_to_next ?? 0) || 1)) * 100)}%` }} />
              </View>
            </View>
            <Ionicons name="chevron-forward" size={18} color={c.muted} />
          </Pressable>
        ) : null}
        {items.map(i => <View key={i.k}>{i.node}</View>)}
        {data && (items.length ? <CaughtUp /> : (
          <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
            <Text style={{ fontFamily: FONT_BODY, color: c.muted, textAlign: 'center' }}>{tab === 'friends' ? 'Nothing new from your friends yet.' : 'Nothing here yet.'} Play today’s polls or vouch someone in to get things going.</Text>
            <Button title="Find people" onPress={() => router.push('/(tabs)/discover')} />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
