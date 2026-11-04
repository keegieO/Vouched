import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeCode } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { INVITE_KEY } from '@/lib/invite';
import { ProfileEditor } from '@/components/ProfileEditor';
import { Avatar, Button, ErrorText, Field, FONT_SIG, Screen, T } from '@/components/ui';

type Inviter = { username: string; display_name: string; avatar_url: string | null };

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'need-code' | 'ready'>('loading');
  const [inviter, setInviter] = useState<Inviter | null>(null);
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function findClaim() {
    const { data } = await supabase.from('invites').select('inviter:profiles!invites_inviter_id_fkey(username, display_name, avatar_url)').eq('claimed_by', session!.user.id).maybeSingle();
    return (data as unknown as { inviter: Inviter | null } | null)?.inviter ?? null;
  }
  async function claim(raw: string) {
    const { error } = await supabase.rpc('claim_invite', { p_code: normalizeCode(raw) });
    if (error) { setErr(error.message); return false; }
    await AsyncStorage.removeItem(INVITE_KEY);
    return true;
  }

  useEffect(() => {
    if (!session) return;
    (async () => {
      let inv = await findClaim();
      const saved = await AsyncStorage.getItem(INVITE_KEY);
      if (!inv && saved && (await claim(saved))) inv = await findClaim();
      if (inv) { setInviter(inv); return setState('ready'); }
      const { data: cfg } = await supabase.from('app_config').select('value').eq('key', 'invite_only').maybeSingle();
      setState(cfg?.value === 'off' ? 'ready' : 'need-code');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  if (!session) return null;
  if (state === 'loading') return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  const meta = session.user.user_metadata ?? {};

  if (state === 'need-code') {
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Screen>
          <T v="h1" style={{ marginTop: 12 }}>Vouched is invite-only</T>
          <T v="muted">Every member is vouched in by someone who already belongs. Enter the code someone sent you.</T>
          <Field label="Invite code" value={code} onChangeText={t => setCode(t.toUpperCase())} placeholder="AB12CD34" autoCapitalize="characters" autoCorrect={false}
            style={{ fontSize: 22, letterSpacing: 3, fontWeight: '800' }} />
          {err && <ErrorText>{err}</ErrorText>}
          <Button title="Continue" busy={busy} onPress={async () => {
            if (normalizeCode(code).length < 6) return setErr('Invite codes are 8 letters and numbers.');
            setBusy(true); setErr(null);
            if (await claim(code)) { setInviter(await findClaim()); setState('ready'); }
            setBusy(false);
          }} />
          <T v="hint">No code? Ask a friend who’s on Vouched to vouch you in.</T>
          <Button kind="ghost" title="Log out" onPress={() => supabase.auth.signOut()} />
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        {inviter && (
          <View style={{ backgroundColor: '#0D1120', borderRadius: 24, padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center', marginTop: 12 }}>
            <Avatar name={inviter.display_name} url={inviter.avatar_url} size={48} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: FONT_SIG, fontSize: 24, color: '#FFE14D' }}>{inviter.display_name}</Text>
              <Text style={{ color: 'rgba(255,255,255,.8)', fontSize: 14 }}>vouched you in. Your page will show it.</Text>
            </View>
          </View>
        )}
        <T v="h1" style={{ marginTop: 12 }}>Set up your page</T>
        <T v="muted">This is the only part you write. Everything else comes from people who know you.</T>
        <ProfileEditor userId={session.user.id} existing={null} suggestedName={(meta.full_name || meta.name || '') as string}
          saveLabel="Create my profile" onSaved={async () => { await refreshProfile(); router.replace('/props'); }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
