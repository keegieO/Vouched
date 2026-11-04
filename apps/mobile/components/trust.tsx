import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { stepsLabel, type PropCount, type TrackRecord, type TrustStep } from '@vouched/shared';
import { supabase } from '@/lib/supabase';
import { Avatar, Button, FONT_DISPLAY, T, useC } from './ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
/** Prompt icon keys (from the prompts table) → Ionicons. */
export const PROMPT_ICON: Record<string, IconName> = {
  moon: 'moon', gift: 'gift', lock: 'key', tool: 'construct', msg: 'chatbubble', sparkle: 'sparkles',
  brief: 'briefcase', shield: 'shield-checkmark', clock: 'time', paw: 'paw',
};

type Inviter = { username: string; display_name: string; avatar_url: string | null };

/** Everything the "Put your name on it" parts of a profile need. */
export function useTrust(profileId: string | undefined, invitedBy: string | null | undefined, viewerId: string | null) {
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [record, setRecord] = useState<TrackRecord>({ backed: 0, removed: 0, weight: 1 });
  const [props, setProps] = useState<PropCount[]>([]);
  const [path, setPath] = useState<TrustStep[] | null>(null);
  useFocusEffect(useCallback(() => {
    if (!profileId) return;
    let alive = true;
    (async () => {
      const [inv, rec, pr, tp] = await Promise.all([
        invitedBy ? supabase.from('profiles').select('username, display_name, avatar_url').eq('id', invitedBy).maybeSingle() : Promise.resolve({ data: null }),
        supabase.rpc('track_record', { p_user: profileId }),
        supabase.rpc('props_summary', { p_user: profileId }),
        viewerId && viewerId !== profileId ? supabase.rpc('trust_path', { p_to: profileId }) : Promise.resolve({ data: null }),
      ]);
      if (!alive) return;
      setInviter((inv.data as Inviter | null) ?? null);
      setRecord(((rec.data ?? []) as TrackRecord[])[0] ?? { backed: 0, removed: 0, weight: 1 });
      setProps((pr.data ?? []) as PropCount[]);
      setPath(tp.data ? (tp.data as TrustStep[]) : null);
    })();
    return () => { alive = false; };
  }, [profileId, invitedBy, viewerId]));
  return { inviter, record, props, path, propsTotal: props.reduce((n, p) => n + Number(p.n), 0) };
}

export function VouchedInBy({ inviter }: { inviter: Inviter | null }) {
  const c = useC();
  const router = useRouter();
  return (
    <Pressable disabled={!inviter} onPress={() => inviter && router.push(`/${inviter.username}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}>
      {inviter ? <Avatar name={inviter.display_name} url={inviter.avatar_url} size={22} /> : <Ionicons name="star" size={14} color={c.muted} />}
      <Text style={{ color: c.muted, fontWeight: '600' }}>{inviter ? <>Vouched in by <Text style={{ color: c.ink, fontWeight: '800' }}>{inviter.display_name}</Text></> : 'Founding member'}</Text>
    </Pressable>
  );
}

export function TrustPathCard({ path, viewerId }: { path: TrustStep[]; viewerId: string }) {
  const c = useC();
  const router = useRouter();
  if (path.length < 2) {
    return (
      <View style={{ backgroundColor: c.sunk, borderRadius: 22, padding: 14, gap: 6 }}>
        <T v="label">How you’re connected</T>
        <T v="hint">No chain of vouches links you within 3 steps. Be careful meeting someone with no connection to your circle.</T>
      </View>
    );
  }
  return (
    <View style={{ backgroundColor: c.accentSoft, borderRadius: 22, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <T v="label" style={{ color: c.accent }}>How you’re connected</T>
        <View style={{ backgroundColor: c.card, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
          <Text style={{ color: c.accent, fontWeight: '800', fontSize: 12 }}>{stepsLabel(path.length - 1)}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {path.map((s, i) => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'flex-start', flex: i ? 1 : undefined }}>
            {i > 0 && (
              <View style={{ flex: 1, alignItems: 'center', paddingTop: 14, gap: 4, minWidth: 40 }}>
                <View style={{ height: 2.5, alignSelf: 'stretch', backgroundColor: c.accent, borderRadius: 2 }} />
                <Text numberOfLines={1} style={{ color: c.accent, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.via}</Text>
              </View>
            )}
            <Pressable onPress={() => router.push(`/${s.username}`)} style={{ alignItems: 'center', gap: 6, width: 64 }}>
              <Avatar name={s.display_name} url={s.avatar_url} size={42} />
              <Text numberOfLines={1} style={{ color: c.ink, fontWeight: '800', fontSize: 12.5 }}>{s.id === viewerId ? 'You' : s.display_name.split(' ')[0]}</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </View>
  );
}

export function StatRow({ vouches, props, record, onPress }: { vouches: number; props: number; record: TrackRecord; onPress?: (k: 'vouches' | 'props' | 'backed') => void }) {
  const c = useC();
  const cell = (k: 'vouches' | 'props' | 'backed', n: number, label: string, flag = false) => (
    <Pressable key={k} onPress={() => onPress?.(k)} style={{ flex: 1, backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14 }}>
      <Text style={{ fontFamily: FONT_DISPLAY, fontSize: 26, color: flag ? c.bad : c.ink, letterSpacing: -0.8 }}>{n}</Text>
      <Text style={{ color: c.muted, fontWeight: '700', fontSize: 12.5 }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 10 }}>
      {cell('vouches', vouches, 'vouches')}
      {cell('props', props, 'props')}
      {cell('backed', record.backed, record.removed ? `${record.removed} removed` : 'backed', !!record.removed)}
    </View>
  );
}

export function PropsCloud({ props, max = 5 }: { props: PropCount[]; max?: number }) {
  const c = useC();
  if (!props.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {props.slice(0, max).map(p => (
        <View key={p.prompt_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.hiSoft, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 }}>
          <Ionicons name={PROMPT_ICON[p.icon] ?? 'sparkles'} size={14} color={c.ink} />
          <Text style={{ color: c.ink, fontWeight: '800', fontSize: 14 }}>{p.label}</Text>
          <View style={{ backgroundColor: c.hi, borderRadius: 999, paddingHorizontal: 7 }}><Text style={{ color: c.hiInk, fontWeight: '800', fontSize: 12 }}>×{p.n}</Text></View>
        </View>
      ))}
    </View>
  );
}

export function RecordBar({ record, name, isMe }: { record: TrackRecord; name: string; isMe: boolean }) {
  const c = useC();
  const fg = record.removed ? c.bad : c.good;
  return (
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', padding: 14, borderRadius: 18, backgroundColor: record.removed ? c.badSoft : c.goodSoft }}>
      <Ionicons name={record.removed ? 'flag' : 'shield-checkmark'} size={22} color={fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: fg, fontWeight: '800' }}>{record.removed
          ? `${record.removed} of ${record.backed} people ${isMe ? 'you' : name} backed ${record.removed === 1 ? 'was' : 'were'} removed for scam or fake-account reports`
          : `${isMe ? 'You’ve' : `${name} has`} backed ${record.backed} ${record.backed === 1 ? 'person' : 'people'}. All in good standing.`}</Text>
        <Text style={{ color: c.ink, fontSize: 13 }}>{record.removed ? 'Their vouches count for less until their record recovers.' : 'Backing people who turn out well makes your vouches count for more.'}</Text>
      </View>
    </View>
  );
}

/** Three dots that empty as you use your monthly vouches or invites. */
export function Quota({ left, total, title, hint }: { left: number; total: number; title: string; hint?: string }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: 22, backgroundColor: c.card, borderColor: c.line, borderWidth: 1 }}>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {Array.from({ length: total }).map((_, i) => (
          <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: i < left ? c.accent : c.sunk, borderWidth: i < left ? 0 : 1.5, borderColor: c.line }} />
        ))}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.ink, fontWeight: '800' }}>{title}</Text>
        {hint ? <T v="hint">{hint}</T> : null}
      </View>
    </View>
  );
}

export function PropsCard({ given, total }: { given: number; total: number }) {
  const c = useC();
  const router = useRouter();
  const done = given >= total;
  return (
    <View style={{ backgroundColor: c.dark ? c.card : c.ink, borderRadius: 26, padding: 20, gap: 12, overflow: 'hidden' }}>
      <View style={{ position: 'absolute', right: -34, top: -34, width: 104, height: 104, borderRadius: 52, backgroundColor: c.hi }} />
      <Text style={{ color: 'rgba(255,255,255,.7)', fontWeight: '700', fontSize: 12, letterSpacing: 1, textTransform: 'uppercase' }}>Today’s props · {Math.min(given, total)}/{total}</Text>
      <Text style={{ color: '#fff', fontFamily: FONT_DISPLAY, fontSize: 24, letterSpacing: -0.6, maxWidth: '85%' }}>{done ? 'You made some people’s day.' : 'Who would you call at 2am if your car broke down?'}</Text>
      <Text style={{ color: 'rgba(255,255,255,.72)', fontSize: 14 }}>{done ? 'New questions tomorrow. Props you get show up in Activity.' : 'Tap a friend. It’s anonymous and shows up on their page.'}</Text>
      <Button kind="hi" title={done ? 'Play another round' : given ? 'Keep going' : 'Give props'} onPress={() => router.push('/props')} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}
