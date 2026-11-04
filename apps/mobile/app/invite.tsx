import { useCallback, useState } from 'react';
import { Linking, Pressable, Share, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { INVITES_PER_MEMBER, inviteText, timeAgo, type Invite } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { Avatar, Banner, Button, ErrorText, Field, Panel, Row, Screen, T, useC } from '@/components/ui';
import { Quota } from '@/components/trust';

type Joined = { id: string; username: string; display_name: string; avatar_url: string | null; headline: string | null };

export default function InviteScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const [invites, setInvites] = useState<Invite[]>([]);
  const [joined, setJoined] = useState<Joined[]>([]);
  const [left, setLeft] = useState(0);
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ code: string; name: string; contact: string } | null>(null);
  const first = profile?.display_name.split(' ')[0] ?? '';

  const load = useCallback(async () => {
    if (!profile) return;
    const [i, l, j] = await Promise.all([
      supabase.from('invites').select('*').eq('inviter_id', profile.id).order('created_at', { ascending: false }),
      supabase.rpc('invites_left'),
      supabase.from('profiles').select('id, username, display_name, avatar_url, headline').eq('invited_by', profile.id),
    ]);
    setInvites((i.data ?? []) as Invite[]); setLeft((l.data as number | null) ?? 0); setJoined((j.data ?? []) as Joined[]);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function create() {
    if (!profile) return;
    if (!name.trim()) return setErr('Add their name.');
    setBusy(true); setErr(null);
    const { data, error } = await supabase.from('invites').insert({ inviter_id: profile.id, invitee_name: name.trim(), contact: contact.trim() || null }).select('code').single();
    setBusy(false);
    if (error) return setErr(error.message);
    setMade({ code: data.code as string, name: name.trim(), contact: contact.trim() });
    setName(''); setContact(''); load();
  }

  const open = invites.filter(i => !i.claimed_by && new Date(i.expires_at) > new Date());
  return (
    <Screen edges={[]}>
      <Quota left={left} total={Math.max(INVITES_PER_MEMBER, left)} title={`${left} ${left === 1 ? 'invite' : 'invites'} left`}
        hint="Vouching someone in puts your name on them, just like a vouch." />
      {made ? (
        <Panel>
          <T v="h3">Invite ready for {made.name.split(' ')[0]}</T>
          <T v="muted">{inviteText(SITE_URL, made.code, first)}</T>
          <Row>
            <Button title="Text it" onPress={() => Linking.openURL(`sms:${/^[\d\s()+.-]{7,}$/.test(made.contact) ? made.contact : ''}${'?'}body=${encodeURIComponent(inviteText(SITE_URL, made.code, first))}`)} />
            <Button kind="ghost" title="Share" onPress={() => Share.share({ message: inviteText(SITE_URL, made.code, first) })} />
            <Button kind="ghost" title="Copy" onPress={() => Clipboard.setStringAsync(inviteText(SITE_URL, made.code, first))} />
          </Row>
          <Button small kind="ghost" title="Invite someone else" onPress={() => setMade(null)} style={{ alignSelf: 'flex-start' }} />
        </Panel>
      ) : left > 0 ? (
        <Panel>
          <Field label="Their name" value={name} onChangeText={setName} placeholder="Alex Kim" maxLength={50} />
          <Field label="Their phone or email (optional)" value={contact} onChangeText={setContact} placeholder="(317) 555-0123" maxLength={80} autoCapitalize="none" hint="Only you see this." />
          {err && <ErrorText>{err}</ErrorText>}
          <Button title="Create invite" onPress={create} busy={busy} />
          <T v="hint">Only invite people you know in real life.</T>
        </Panel>
      ) : <Banner>You’re out of invites. You earn more as the people you vouched in stay in good standing.</Banner>}

      {open.length > 0 && (
        <Panel style={{ gap: 0 }}>
          <T v="label">Waiting to join</T>
          {open.map((i, k) => (
            <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: k ? 1 : 0, borderColor: c.line }}>
              <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{i.invitee_name}</T><T v="hint">Code {i.code} · {timeAgo(i.created_at)}</T></View>
              <Button small kind="ghost" title="Share" onPress={() => Share.share({ message: inviteText(SITE_URL, i.code, first) })} />
              <Button small kind="ghost" title="✕" onPress={async () => { await supabase.from('invites').delete().eq('id', i.id); load(); }} />
            </View>
          ))}
        </Panel>
      )}
      {joined.length > 0 && (
        <Panel style={{ gap: 0 }}>
          <T v="label">You vouched in</T>
          {joined.map((p, k) => (
            <Pressable key={p.id} onPress={() => router.push(`/${p.username}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: k ? 1 : 0, borderColor: c.line }}>
              <Avatar name={p.display_name} url={p.avatar_url} size={40} />
              <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{p.display_name}</T><T v="hint">{p.headline || `@${p.username}`}</T></View>
            </Pressable>
          ))}
        </Panel>
      )}
    </Screen>
  );
}
