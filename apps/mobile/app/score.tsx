import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import type { MyTrust } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { FONT_BODY, FONT_BOLD, FONT_HEAVY, useC } from '@/components/ui';
import { GUT, ListRow, SecLabel, TierPill } from '@/components/v2';

const ICON: Record<string, string> = { vouches: '✍️', circles: '🧭', verified: '🪪', tenure: '📅', record: '🛡️', withdrawn: '↩️', vouch_again: '🤐', reports: '🚫', quiet: '💤' };

export default function Score() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const [t, setT] = useState<MyTrust | null>(null);
  useFocusEffect(useCallback(() => { supabase.rpc('my_trust').then(({ data }) => setT(((data ?? []) as MyTrust[])[0] ?? null)); }, []));
  const score = t?.score ?? 0, r = 60, circ = 2 * Math.PI * r;
  return (
    <ScrollView style={{ backgroundColor: c.bg }}>
      <View style={{ alignItems: 'center', gap: 10, paddingVertical: 24, paddingHorizontal: GUT, borderBottomWidth: 1, borderColor: c.line }}>
        <Svg width={180} height={180} viewBox="0 0 180 180" accessibilityLabel={`Trust score ${score} out of 100`}>
          <Circle cx={90} cy={90} r={r} stroke={c.line} strokeWidth={12} fill="none" />
          <Circle cx={90} cy={90} r={r} stroke={c.accent} strokeWidth={12} fill="none" strokeLinecap="round" strokeDasharray={`${circ}`} strokeDashoffset={circ * (1 - score / 100)} transform="rotate(-90 90 90)" />
          <SvgText x={90} y={100} fontSize={46} fontWeight="900" fill={c.ink} textAnchor="middle">{score}</SvgText>
          <SvgText x={90} y={122} fontSize={13} fontWeight="600" fill={c.muted} textAnchor="middle">out of 100</SvgText>
        </Svg>
        <TierPill tier={t?.tier ?? 'New'} />
        <Text style={{ fontFamily: FONT_BODY, fontSize: 14, color: c.muted, textAlign: 'center' }}>
          Everyone sees your tier. Only you see the number.{t?.next_tier ? <> <Text style={{ fontFamily: FONT_BOLD, color: c.ink }}>{t.points_to_next} more points</Text> to reach {t.next_tier}.</> : null}
        </Text>
      </View>
      <SecLabel>What’s in your score</SecLabel>
      {t?.factors.length ? t.factors.map(f => (
        <View key={f.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUT, paddingVertical: 12, borderBottomWidth: 1, borderColor: c.line }}>
          <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.sunk, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>{ICON[f.key] ?? '•'}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT_BOLD, color: c.ink, fontSize: 15 }}>{f.label}</Text>
            {f.detail ? <Text style={{ fontFamily: FONT_BODY, color: c.muted, fontSize: 13 }}>{f.detail}</Text> : null}
          </View>
          <Text style={{ fontFamily: FONT_HEAVY, color: f.points > 0 ? c.good : c.bad, minWidth: 44, textAlign: 'right' }}>{f.points > 0 ? '+' : ''}{f.points}</Text>
        </View>
      )) : <Text style={{ fontFamily: FONT_BODY, color: c.muted, paddingHorizontal: GUT }}>Nothing yet. Your first vouch is the biggest jump.</Text>}
      <SecLabel>How to raise it</SecLabel>
      <ListRow icon="✍️" title="Ask someone who knows you to vouch" sub="Vouches from trusted people count most" onPress={() => router.push('/request-vouch')} />
      {!profile?.phone_verified && <ListRow icon="📱" title="Verify your phone" sub="+6 points" onPress={() => router.push('/settings')} />}
      <ListRow icon="🔥" title="Stay active" sub="Going quiet for a month costs points. Polls, vouches and gifts all count." onPress={() => router.push('/props')} />
      <ListRow icon="⏳" title="Vouches fade after a year" sub="Get re-vouched to keep your score fresh. Gifts and likes never change it." />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}
