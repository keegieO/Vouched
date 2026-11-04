import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { pickPrompts, PROPS_PER_ROUND, type Prompt, type PropOption } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Avatar, Button, FONT_DISPLAY } from '@/components/ui';
import { PROMPT_ICON } from '@/components/trust';

const INK = '#0D1120', HI = '#FFE14D', HI_INK = '#3B3100';

export default function PropsGame() {
  const { profile } = useAuth();
  const router = useRouter();
  const [round, setRound] = useState<Prompt[] | null>(null);
  const [i, setI] = useState(0);
  const [opts, setOpts] = useState<PropOption[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [given, setGiven] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const pop = useRef(new Animated.Value(1)).current;

  const loadOptions = useCallback(async () => {
    const { data } = await supabase.rpc('prop_options', { n: 4 });
    setOpts((data ?? []) as PropOption[]);
  }, []);
  useEffect(() => {
    supabase.from('prompts').select('id, question, label, icon').eq('active', true).order('id')
      .then(({ data }) => setRound(pickPrompts((data ?? []) as Prompt[], PROPS_PER_ROUND)));
    loadOptions();
  }, [loadOptions]);

  async function pick(p: PropOption) {
    if (picked || !round || !profile) return;
    setPicked(p.id); setNote(null);
    const { error } = await supabase.from('props').insert({ giver_id: profile.id, receiver_id: p.id, prompt_id: round[i].id });
    if (error) { setPicked(null); setNote(error.message); return; }
    setGiven(g => g + 1);
    Animated.sequence([Animated.timing(pop, { toValue: 1.08, duration: 140, useNativeDriver: true }), Animated.timing(pop, { toValue: 1, duration: 160, useNativeDriver: true })]).start();
    setTimeout(() => { setPicked(null); setI(x => x + 1); loadOptions(); }, 650);
  }
  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)'));

  const done = round && i >= round.length;
  const q = round && !done ? round[i] : null;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: INK }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, gap: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close"><Ionicons name="close" size={26} color="#fff" /></Pressable>
          <View style={{ flex: 1, flexDirection: 'row', gap: 5 }}>
            {(round ?? []).map((_, k) => <View key={k} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: k <= i ? HI : 'rgba(255,255,255,.22)' }} />)}
          </View>
          {round && !done && <Text style={{ color: 'rgba(255,255,255,.7)', fontWeight: '700' }}>{i + 1}/{round.length}</Text>}
        </View>

        {done ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <View style={{ width: 70, height: 70, borderRadius: 24, backgroundColor: HI, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="sparkles" size={30} color={HI_INK} /></View>
            <Text style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontSize: 32, textAlign: 'center', letterSpacing: -1 }}>{given ? `You made ${given} ${given === 1 ? 'person’s' : 'people’s'} day.` : 'Round over.'}</Text>
            <Text style={{ color: 'rgba(255,255,255,.75)', textAlign: 'center' }}>They’ll see someone picked them, not who.</Text>
            <Button kind="hi" title="Done" onPress={close} />
            <Button kind="ghost" title="See your props" onPress={() => router.replace('/(tabs)/inbox')} style={{ borderColor: 'rgba(255,255,255,.3)' }} />
          </View>
        ) : q ? (
          <>
            <View style={{ width: 70, height: 70, borderRadius: 24, backgroundColor: HI, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={PROMPT_ICON[q.icon] ?? 'sparkles'} size={30} color={HI_INK} />
            </View>
            <Text style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontSize: 34, lineHeight: 37, letterSpacing: -1.2 }}>{q.question}</Text>
            {note && <Text style={{ color: HI }}>{note}</Text>}
            <View style={{ flex: 1 }} />
            {opts.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                {opts.map(p => {
                  const on = picked === p.id;
                  return (
                    <Animated.View key={p.id} style={{ width: '48%', flexGrow: 1, transform: [{ scale: on ? pop : 1 }] }}>
                      <Pressable onPress={() => pick(p)} disabled={!!picked && !on}
                        style={({ pressed }) => ({ alignItems: 'center', gap: 8, padding: 14, borderRadius: 20, borderWidth: 1.5,
                          backgroundColor: on ? HI : pressed ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.08)', borderColor: on ? HI : 'rgba(255,255,255,.16)' })}>
                        <Avatar name={p.display_name} url={p.avatar_url} size={56} />
                        <Text style={{ color: on ? HI_INK : '#fff', fontWeight: '800', fontSize: 15, textAlign: 'center' }} numberOfLines={1}>{p.display_name}</Text>
                        <Text style={{ color: on ? HI_INK : 'rgba(255,255,255,.65)', fontSize: 12, textAlign: 'center' }} numberOfLines={2}>{p.headline ? p.headline.split('.')[0] : `@${p.username}`}</Text>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            ) : <Text style={{ color: 'rgba(255,255,255,.75)' }}>Follow a few people first so we have friends to show you.</Text>}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 28 }}>
              <Pressable onPress={loadOptions} hitSlop={10} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><Ionicons name="shuffle" size={18} color="rgba(255,255,255,.75)" /><Text style={{ color: 'rgba(255,255,255,.75)', fontWeight: '800' }}>Shuffle</Text></Pressable>
              <Pressable onPress={() => { setNote(null); setI(x => x + 1); loadOptions(); }} hitSlop={10}><Text style={{ color: 'rgba(255,255,255,.75)', fontWeight: '800' }}>Skip</Text></Pressable>
            </View>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
