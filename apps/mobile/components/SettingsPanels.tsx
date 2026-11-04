import { useCallback, useState } from 'react';
import { Pressable, Switch, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DEFAULT_SETTINGS, type Profile } from '@vouched/shared';
import { supabase } from '@/lib/supabase';
import { Panel, T, useC } from './ui';

function SwitchRow({ label, sub, value, onChange }: { label: string; sub?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><T>{label}</T>{sub ? <T v="hint">{sub}</T> : null}</View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.good }} accessibilityLabel={label} />
    </View>
  );
}

export function PrivacyPanel({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const c = useC();
  const [p, setP] = useState({ who: profile.who_can_vouch ?? 'everyone', discoverable: profile.discoverable ?? true, show_counts: profile.show_counts ?? true, allow_cosigns: profile.allow_cosigns ?? true });
  async function save(patch: Partial<typeof p>) {
    const next = { ...p, ...patch };
    setP(next);
    const { error } = await supabase.from('profiles').update({ who_can_vouch: next.who, discoverable: next.discoverable, show_counts: next.show_counts, allow_cosigns: next.allow_cosigns }).eq('id', profile.id);
    if (error) setP(p); else onSaved();
  }
  const opt = (k: 'everyone' | 'following' | 'nobody', label: string, sub: string) => (
    <Pressable key={k} onPress={() => save({ who: k })} accessibilityRole="radio" accessibilityState={{ checked: p.who === k }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      <View style={{ flex: 1 }}><T>{label}</T><T v="hint">{sub}</T></View>
      <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: p.who === k ? c.accent : c.line, alignItems: 'center', justifyContent: 'center' }}>
        {p.who === k && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />}
      </View>
    </Pressable>
  );
  return (
    <Panel>
      <T v="h2">Privacy</T>
      <T v="label">Who can vouch for me</T>
      {opt('everyone', 'Everyone', 'Anyone with an account can send you a vouch to review.')}
      {opt('following', 'People I follow', 'Only people you follow can vouch.')}
      {opt('nobody', 'Paused', 'No new vouches. Approved ones stay up.')}
      <T v="label">Profile</T>
      <SwitchRow label="Show me in Discover" sub="People can find you by name, skill and city." value={p.discoverable} onChange={v => save({ discoverable: v })} />
      <SwitchRow label="Show follower counts" value={p.show_counts} onChange={v => save({ show_counts: v })} />
      <SwitchRow label="Allow co-signs" sub="People who know you can back up your vouches." value={p.allow_cosigns} onChange={v => save({ allow_cosigns: v })} />
    </Panel>
  );
}

export function NotificationsPanel({ userId }: { userId: string }) {
  const [s, setS] = useState({ ...DEFAULT_SETTINGS });
  useFocusEffect(useCallback(() => {
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle().then(({ data }) => { if (data) setS({ ...DEFAULT_SETTINGS, ...data }); });
  }, [userId]));
  async function set(k: keyof typeof DEFAULT_SETTINGS, v: boolean) {
    const next = { ...s, [k]: v };
    setS(next);
    await supabase.from('user_settings').upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
  }
  return (
    <Panel>
      <T v="h2">Notifications</T>
      <SwitchRow label="New vouches" value={s.notify_vouches} onChange={v => set('notify_vouches', v)} />
      <SwitchRow label="Vouch requests" value={s.notify_requests} onChange={v => set('notify_requests', v)} />
      <SwitchRow label="New followers" value={s.notify_follows} onChange={v => set('notify_follows', v)} />
      <SwitchRow label="Co-signs and replies" value={s.notify_cosigns} onChange={v => set('notify_cosigns', v)} />
      <SwitchRow label="Recommendations" value={s.notify_recs} onChange={v => set('notify_recs', v)} />
      <SwitchRow label="Weekly email summary" value={s.email_weekly} onChange={v => set('email_weekly', v)} />
    </Panel>
  );
}
