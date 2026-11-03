import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Linking, Platform, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { toE164 } from '@/lib/oauth';
import { ProfileEditor } from '@/components/ProfileEditor';
import { Banner, Button, ErrorText, Field, Panel, Row, Screen, T } from '@/components/ui';

type Blocked = { blocked_id: string; blocked: { username: string; display_name: string } | null };

export default function Settings() {
  const { session, profile, refreshProfile } = useAuth();
  const [newEmail, setNewEmail] = useState('');
  const [pw, setPw] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; key: string } | null>(null);
  const [blocked, setBlocked] = useState<Blocked[]>([]);

  const loadBlocked = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('blocks').select('blocked_id, blocked:profiles!blocks_blocked_id_fkey(username, display_name)').eq('blocker_id', session.user.id);
    setBlocked((data ?? []) as unknown as Blocked[]);
  }, [session]);
  useFocusEffect(useCallback(() => { loadBlocked(); }, [loadBlocked]));

  if (!session || !profile) return null;
  const user = session.user;
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [];
  const say = (key: string, ok: boolean, text: string) => setMsg({ key, ok, text });
  const Note = ({ k }: { k: string }) => msg?.key === k ? (msg.ok ? <Banner tone="good">{msg.text}</Banner> : <ErrorText>{msg.text}</ErrorText>) : null;

  async function changeEmail() {
    const { error } = await supabase.auth.updateUser({ email: newEmail.trim() }, { emailRedirectTo: `${SITE_URL}/auth/callback` });
    say('email', !error, error ? error.message : `Check ${newEmail} for a confirmation link.`);
  }
  async function changePassword() {
    if (pw.length < 8) return say('pw', false, 'Use at least 8 characters.');
    const { error } = await supabase.auth.updateUser({ password: pw });
    say('pw', !error, error ? error.message : 'Password updated.');
    if (!error) setPw('');
  }
  async function verifyPhone() {
    if (!codeSent) {
      const { error } = await supabase.auth.updateUser({ phone: toE164(phone) });
      if (error) return say('phone', false, error.message);
      setCodeSent(true);
      return say('phone', true, 'We texted you a 6-digit code.');
    }
    const { error } = await supabase.auth.verifyOtp({ phone: toE164(phone), token: code.trim(), type: 'phone_change' });
    if (error) return say('phone', false, error.message);
    setCodeSent(false); setCode('');
    say('phone', true, 'Phone verified. Your profile now shows the mark.');
    refreshProfile();
  }
  function confirmDelete() {
    Alert.alert('Delete your account?', 'This removes your profile, every vouch you received, and every vouch you wrote. It can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('delete_my_account');
        if (error) return Alert.alert('Couldn’t delete', error.message);
        await supabase.auth.signOut();
      } },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <T v="h1">Settings</T>

        <Panel>
          <T v="h2">Profile</T>
          <ProfileEditor userId={user.id} existing={profile} saveLabel="Save profile" onSaved={refreshProfile} />
        </Panel>

        <Panel>
          <T v="h2">Account</T>
          <View style={{ gap: 4 }}>
            <T v="label">Signed in with</T>
            <T>{providers.length ? providers.map(p => p[0].toUpperCase() + p.slice(1)).join(', ') : 'Email'}{user.email ? ` · ${user.email}` : ''}</T>
          </View>

          <Field label={user.email ? 'Change email' : 'Add an email'} value={newEmail} onChangeText={setNewEmail} autoCapitalize="none" keyboardType="email-address" />
          <Note k="email" />
          <Button small kind="ghost" title="Send confirmation" onPress={changeEmail} style={{ alignSelf: 'flex-start' }} />

          <Field label={providers.includes('email') ? 'Change password' : 'Set a password'} value={pw} onChangeText={setPw} secureTextEntry autoComplete="new-password" />
          <Note k="pw" />
          <Button small kind="ghost" title="Save password" onPress={changePassword} style={{ alignSelf: 'flex-start' }} />

          <Field label={user.phone ? 'Change verified phone' : 'Verify your phone'} value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!codeSent}
            placeholder="(317) 555-0123" hint="Adds a “Phone verified” mark. Your number is never shown." />
          {codeSent && <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} textContentType="oneTimeCode" />}
          <Note k="phone" />
          <Button small kind="ghost" title={codeSent ? 'Verify code' : 'Text me a code'} onPress={verifyPhone} style={{ alignSelf: 'flex-start' }} />
        </Panel>

        <Panel>
          <T v="h2">Blocked people</T>
          {blocked.length ? blocked.map(b => (
            <Row key={b.blocked_id} style={{ justifyContent: 'space-between' }}>
              <T>{b.blocked?.display_name ?? 'Deleted account'}</T>
              <Button small kind="ghost" title="Unblock" onPress={async () => {
                await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', b.blocked_id);
                loadBlocked();
              }} />
            </Row>
          )) : <T v="hint">You haven’t blocked anyone.</T>}
        </Panel>

        <Panel>
          <Button kind="ghost" title="Safety & rules" onPress={() => Linking.openURL(`${SITE_URL}/safety`)} />
          <Button kind="ghost" title="Privacy policy" onPress={() => Linking.openURL(`${SITE_URL}/privacy`)} />
          <Button kind="ghost" title="Terms" onPress={() => Linking.openURL(`${SITE_URL}/terms`)} />
        </Panel>

        <Button kind="ghost" title="Log out" onPress={() => supabase.auth.signOut()} />
        <Button kind="danger" title="Delete my account" onPress={confirmDelete} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
