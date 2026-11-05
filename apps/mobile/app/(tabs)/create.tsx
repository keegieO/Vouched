import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { FONT_BODY, FONT_HEAVY, useC } from '@/components/ui';
import { GUT, SheetOption } from '@/components/v2';

export default function Create() {
  const router = useRouter();
  const c = useC();
  const [left, setLeft] = useState<{ vouches: number; invites: number; gifts: number } | null>(null);
  useFocusEffect(useCallback(() => {
    Promise.all([supabase.rpc('vouches_left'), supabase.rpc('invites_left'), supabase.rpc('gifts_left_today')])
      .then(([v, i, g]) => setLeft({ vouches: (v.data as number) ?? 0, invites: (i.data as number) ?? 0, gifts: (g.data as number) ?? 0 }));
  }, []));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ paddingHorizontal: GUT, height: 50, justifyContent: 'center' }}>
        <Text style={{ fontFamily: FONT_HEAVY, fontSize: 21, color: c.ink, letterSpacing: -0.4 }}>Create</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: GUT, gap: 4 }}>
        <SheetOption icon="🗳️" title="Today’s polls" sub="5 quick questions about your friends" onPress={() => router.push('/props')} />
        <SheetOption icon="✍️" title="Vouch for someone" sub="Find them, then tap Vouch on their profile" right={left ? `${left.vouches} left` : undefined} onPress={() => router.push('/(tabs)/discover')} />
        <SheetOption icon="🎁" title="Send a gift" sub={left && !left.gifts ? 'Free gift used · back tomorrow' : '1 free gift a day, from any profile'} onPress={() => router.push('/(tabs)/discover')} />
        <SheetOption icon="✨" title="What’s my vibe?" sub="Let friends describe you" onPress={() => router.push('/vibe')} />
        <SheetOption icon="🎟️" title="Vouch someone in" sub="Invite a person you know" right={left ? `${left.invites} left` : undefined} onPress={() => router.push('/invite')} />
        <SheetOption icon="📨" title="Ask for a vouch" sub="From someone who knows you" onPress={() => router.push('/request-vouch')} />
        <SheetOption icon="🔎" title="Ask for a rec" sub="Find someone your people trust" onPress={() => router.push('/rec')} />
        <Text style={{ fontFamily: FONT_BODY, color: c.muted, fontSize: 13, paddingTop: 12 }}>Vouches are limited to 3 a month so every one means something.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}
