import { useCallback, useState } from 'react';
import { ScrollView, Share, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { VIBE_PROMPTS, vibeLink } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { Button, FONT_BODY, FONT_BOLD, FONT_DISPLAY, useC } from '@/components/ui';
import { GUT, ListRow, SecLabel } from '@/components/v2';

export default function MyVibe() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const [shown, setShown] = useState<{ id: string; body: string }[]>([]);
  const [copied, setCopied] = useState(false);
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    supabase.from('vibe_answers').select('id, body').eq('subject_id', profile.id).eq('status', 'shown').order('created_at', { ascending: false })
      .then(({ data }) => setShown((data ?? []) as { id: string; body: string }[]));
  }, [profile]));
  if (!profile) return null;
  const url = vibeLink(SITE_URL, profile.username);
  return (
    <ScrollView style={{ backgroundColor: c.bg }}>
      <View style={{ margin: GUT, borderRadius: 24, padding: 22, backgroundColor: '#5B4BE8', gap: 10, overflow: 'hidden' }}>
        <View style={{ position: 'absolute', right: -60, bottom: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: '#FF5CA8', opacity: 0.6 }} />
        <Text style={{ color: 'rgba(255,255,255,.85)', fontFamily: FONT_BOLD, fontSize: 13 }}>ASK YOUR FRIENDS</Text>
        <Text style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontSize: 28, letterSpacing: -1 }}>What’s my vibe?</Text>
        <Text style={{ color: 'rgba(255,255,255,.9)', fontFamily: FONT_BODY, fontSize: 15 }}>Post your link on your story. Friends answer about you, and you pick what shows on your profile.</Text>
        <View style={{ backgroundColor: 'rgba(255,255,255,.18)', borderRadius: 999, flexDirection: 'row', alignItems: 'center', paddingLeft: 14, padding: 6, gap: 8 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontFamily: FONT_BOLD, fontSize: 13 }}>{url.replace(/^https?:\/\//, '')}</Text>
          <Button small kind="ghost" title={copied ? 'Copied' : 'Copy'} style={{ backgroundColor: '#fff', borderColor: '#fff' }}
            onPress={async () => { await Clipboard.setStringAsync(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }} />
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: GUT }}>
        <Button title="Share to story" onPress={() => Share.share({ message: `Describe my vibe 👀 ${url}`, url })} style={{ flex: 1 }} />
        <Button kind="ghost" title="Preview" onPress={() => router.push(`/vibe/${profile.username}`)} />
      </View>
      <SecLabel>Questions your friends get</SecLabel>
      {VIBE_PROMPTS.map(q => <ListRow key={q} icon="💬" title={q} />)}
      {shown.length > 0 && <>
        <SecLabel>On your profile</SecLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: GUT }}>{shown.map(v => (
          <View key={v.id} style={{ backgroundColor: c.accentSoft, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ fontFamily: FONT_BOLD, color: c.accent }}>{v.body}</Text></View>
        ))}</View>
      </>}
      <Text style={{ fontFamily: FONT_BODY, color: c.muted, fontSize: 13, padding: GUT }}>New answers land in Activity → Review. Nothing shows until you tap Show.</Text>
    </ScrollView>
  );
}
