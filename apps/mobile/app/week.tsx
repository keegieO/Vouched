import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { profileLink, type WeekResult } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { Button, FONT_BODY, FONT_BOLD, FONT_DISPLAY } from '@/components/ui';

function Card({ r, i }: { r: WeekResult; i: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 450, delay: i * 250, useNativeDriver: true }).start(); }, [a, i]);
  return (
    <Animated.View style={{ opacity: a, transform: [{ rotateX: a.interpolate({ inputRange: [0, 1], outputRange: ['80deg', '0deg'] }) }],
      borderRadius: 18, padding: 16, backgroundColor: 'rgba(255,255,255,.08)', flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Text style={{ fontSize: 30 }}>{r.emoji ?? '✨'}</Text>
      <View style={{ flex: 1 }}><Text style={{ color: '#fff', fontFamily: FONT_BOLD, fontSize: 17 }}>{r.label}</Text><Text style={{ color: 'rgba(255,255,255,.7)', fontFamily: FONT_BODY, fontSize: 13 }}>{r.question}</Text></View>
      <Text style={{ color: '#fff', fontFamily: FONT_BOLD }}>×{r.n}</Text>
    </Animated.View>
  );
}

export default function Week() {
  const { profile } = useAuth();
  const router = useRouter();
  const [results, setResults] = useState<WeekResult[] | null>(null);
  useEffect(() => { supabase.rpc('my_week').then(({ data }) => setResults((data ?? []) as WeekResult[])); }, []);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  async function share() {
    if (!profile || !results) return;
    const url = profileLink(SITE_URL, profile.username);
    await Share.share({ message: `My friends voted me ${results.slice(0, 3).map(r => `${r.emoji ?? ''} ${r.label}`).join(', ')} on Vouched ${url}` });
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0F1419' }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 18 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontFamily: FONT_BOLD }}>Your week</Text>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={26} color="#fff" /></Pressable>
        </View>
        <Text style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontSize: 32, letterSpacing: -1.2, lineHeight: 35 }}>Your friends voted you…</Text>
        {results && (results.length ? results.slice(0, 6).map((r, i) => <Card key={r.prompt_id} r={r} i={i} />)
          : <Text style={{ color: 'rgba(255,255,255,.72)', fontFamily: FONT_BODY }}>No votes yet this week. Play today’s polls. Friends usually pick you back.</Text>)}
        <View style={{ flex: 1 }} />
        {results?.length ? <Button kind="hi" title="Share my results" onPress={share} /> : <Button kind="hi" title="Play today’s polls" onPress={() => router.replace('/props')} />}
      </ScrollView>
    </SafeAreaView>
  );
}
