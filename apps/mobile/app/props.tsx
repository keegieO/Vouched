import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { DropPrompt, PropOption } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Avatar, Button, FONT_BODY, FONT_BOLD, FONT_DISPLAY, FONT_HEAVY } from '@/components/ui';

const BG = '#0F1419', HI = '#FFD400', HI_INK = '#2A2300', DIM = 'rgba(255,255,255,.72)';

/** Today's polls: 5 questions, the same for everyone, new every day at noon. */
export default function Polls() {
  const { profile } = useAuth();
  const router = useRouter();
  const [prompts, setPrompts] = useState<DropPrompt[] | null>(null);
  const [streak, setStreak] = useState(0);
  const [i, setI] = useState(0);
  const [opts, setOpts] = useState<PropOption[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [given, setGiven] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const seen = useRef<string[]>([]);
  const pop = useRef(new Animated.Value(1)).current;

  const loadOptions = useCallback(async () => {
    const { data } = await supabase.rpc('prop_options', { n: 4, exclude: seen.current.slice(-12) });
    const list = (data ?? []) as PropOption[];
    seen.current.push(...list.map(x => x.id));
    setOpts(list);
  }, []);
  useEffect(() => {
    Promise.all([supabase.rpc('today_drop'), supabase.rpc('my_streak')]).then(([{ data }, { data: s }]) => {
      setPrompts((data ?? []) as DropPrompt[]); setStreak((s as number | null) ?? 0);
    });
    loadOptions();
  }, [loadOptions]);

  const todo = prompts?.filter(p => !p.answered) ?? [];
  const alreadyPlayed = !!prompts?.some(p => p.answered);
  async function pick(p: PropOption) {
    if (picked || !profile || !todo[i]) return;
    setPicked(p.id); setNote(null);
    const { error } = await supabase.from('props').insert({ giver_id: profile.id, receiver_id: p.id, prompt_id: todo[i].id });
    if (error) { setPicked(null); setNote(error.message); return; }
    setGiven(g => g + 1);
    Animated.sequence([Animated.timing(pop, { toValue: 1.08, duration: 140, useNativeDriver: true }), Animated.timing(pop, { toValue: 1, duration: 160, useNativeDriver: true })]).start();
    setTimeout(() => { setPicked(null); setI(x => x + 1); loadOptions(); }, 600);
  }
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  if (!prompts) return <SafeAreaView style={{ flex: 1, backgroundColor: BG }} />;
  const done = i >= todo.length, q = todo[i], total = prompts.length, pos = total - todo.length + i;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: BG }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16, gap: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={26} color="#fff" /></Pressable>
          <View style={{ flex: 1, flexDirection: 'row', gap: 4 }}>
            {prompts.map((_, k) => <View key={k} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: k <= pos ? HI : 'rgba(255,255,255,.2)' }} />)}
          </View>
          {!done && <Text style={{ color: DIM, fontFamily: FONT_BOLD }}>{pos + 1}/{total}</Text>}
        </View>

        {done ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <Text style={{ fontSize: 56 }}>🎉</Text>
            <Text style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontSize: 32, textAlign: 'center', letterSpacing: -1.2 }}>{todo.length ? 'Done for today' : 'You already played today'}</Text>
            <View style={{ backgroundColor: HI, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
              <Text style={{ color: HI_INK, fontFamily: FONT_HEAVY, fontSize: 15 }}>🔥 {streak + (given > 0 && !alreadyPlayed ? 1 : 0)} day streak</Text>
            </View>
            <Text style={{ color: DIM, textAlign: 'center', fontFamily: FONT_BODY }}>Your picks are anonymous. New polls every day at noon.</Text>
            <Button kind="hi" title="Done" onPress={close} style={{ alignSelf: 'stretch' }} />
            <Pressable onPress={() => router.replace('/week')}><Text style={{ color: DIM, fontFamily: FONT_BOLD }}>See your week</Text></Pressable>
          </View>
        ) : (
          <>
            <Text style={{ fontSize: 56 }}>{q.emoji ?? '✨'}</Text>
            <Text style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontSize: 32, lineHeight: 35, letterSpacing: -1.2 }}>{q.question}</Text>
            {note && <Text style={{ color: HI, fontFamily: FONT_BODY }}>{note}</Text>}
            <View style={{ flex: 1 }} />
            {opts.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {opts.map(p => {
                  const on = picked === p.id;
                  return (
                    <Animated.View key={p.id} style={{ width: '48%', flexGrow: 1, transform: [{ scale: on ? pop : 1 }] }}>
                      <Pressable onPress={() => pick(p)} disabled={!!picked && !on}
                        style={({ pressed }) => ({ alignItems: 'center', gap: 8, paddingVertical: 16, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1.5,
                          backgroundColor: on ? HI : pressed ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.08)', borderColor: on ? HI : 'rgba(255,255,255,.12)' })}>
                        <Avatar name={p.display_name} url={p.avatar_url} size={56} />
                        <Text style={{ color: on ? HI_INK : '#fff', fontFamily: FONT_BOLD, fontSize: 15, textAlign: 'center' }} numberOfLines={1}>{p.display_name}</Text>
                        <Text style={{ color: on ? HI_INK : 'rgba(255,255,255,.65)', fontFamily: FONT_BODY, fontSize: 12 }} numberOfLines={1}>@{p.username}</Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            ) : <Text style={{ color: DIM, fontFamily: FONT_BODY }}>Follow a few people first so there are friends to pick from.</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28 }}>
              <Pressable onPress={loadOptions} hitSlop={10} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="shuffle" size={18} color={DIM} /><Text style={{ color: DIM, fontFamily: FONT_BOLD }}>Shuffle</Text></Pressable>
              <Pressable onPress={() => { setNote(null); setI(x => x + 1); loadOptions(); }} hitSlop={10}><Text style={{ color: DIM, fontFamily: FONT_BOLD }}>Skip</Text></Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
