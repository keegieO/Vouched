import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { VIBE_MAX, VIBE_PROMPTS, normalizeUsername } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Avatar, Button, FONT_BODY, FONT_DISPLAY, FONT_MED, T, useC } from '@/components/ui';

type P = { id: string; username: string; display_name: string; avatar_url: string | null };

export default function VibeAnswer() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { profile: me } = useAuth();
  const router = useRouter();
  const c = useC();
  const [p, setP] = useState<P | null | undefined>(undefined);
  const [prompt, setPrompt] = useState(0);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    supabase.from('profiles').select('id, username, display_name, avatar_url').eq('username', normalizeUsername(String(username))).eq('standing', 'good').maybeSingle()
      .then(({ data }) => setP((data as P | null) ?? null));
  }, [username]);
  if (p === undefined) return null;
  if (!p) return <View style={{ padding: 24 }}><T v="h2">No one here</T></View>;
  const first = p.display_name.split(' ')[0];
  async function send() {
    if (!me) return router.push('/login');
    setState('busy'); setErr(null);
    const { error } = await supabase.from('vibe_answers').insert({ subject_id: p!.id, author_id: me.id, prompt, body: text.trim() });
    if (error) { setState('idle'); return setErr(error.code === '23505' ? 'You already answered that one. Pick another question.' : error.message); }
    setState('sent');
  }
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ padding: 20, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar name={p.display_name} url={p.avatar_url} size={84} />
        <Text style={{ fontFamily: FONT_DISPLAY, fontSize: 28, color: c.ink, letterSpacing: -1, textAlign: 'center' }}>What’s {first}’s vibe?</Text>
        <T v="muted" style={{ textAlign: 'center' }}>{me?.id === p.id ? 'This is your vibe link. Share it, and friends’ answers show up in Activity.' : `Your answer goes to ${first}. They choose what shows on their profile.`}</T>
      </View>
      {me?.id !== p.id && (state === 'sent' ? (
        <View style={{ alignItems: 'center', gap: 8, paddingTop: 20 }}><Text style={{ fontSize: 48 }}>💌</Text><T v="h2">Sent!</T><T v="muted">{first} chooses whether it shows on their profile.</T><Button title="Done" onPress={() => router.back()} /></View>
      ) : <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{VIBE_PROMPTS.map((q, k) => (
          <Pressable key={q} onPress={() => setPrompt(k)} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: prompt === k ? c.ink : c.line2, backgroundColor: prompt === k ? c.ink : 'transparent' }}>
            <Text style={{ fontFamily: FONT_MED, fontSize: 14, color: prompt === k ? c.bg : c.ink }}>{q}</Text>
          </Pressable>
        ))}</View>
        <TextInput value={text} onChangeText={setText} maxLength={VIBE_MAX} placeholder="steady, goofy, generous" placeholderTextColor={c.muted}
          style={{ borderWidth: 1, borderColor: c.line2, borderRadius: 10, padding: 12, color: c.ink, fontFamily: FONT_BODY, fontSize: 16 }} />
        {err ? <Text style={{ color: c.bad, fontFamily: FONT_BODY }}>{err}</Text> : null}
        <Button kind="accent" title={me ? 'Send' : 'Join to answer'} onPress={send} busy={state === 'busy'} disabled={!!me && !text.trim()} />
        <T v="hint" style={{ textAlign: 'center' }}>Positive and honest. {first} sees who sent it.</T>
      </>)}
    </ScrollView>
  );
}
