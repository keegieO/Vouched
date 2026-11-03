import { useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase, SITE_URL } from '@/lib/supabase';
import { signInWithApple, signInWithBrowser, toE164 } from '@/lib/oauth';
import { Banner, Button, ErrorText, Field, Row, Screen, T, useC } from '@/components/ui';

type Method = 'email' | 'phone';
type Mode = 'signin' | 'signup' | 'reset';

export default function Login() {
  const c = useC();
  const [method, setMethod] = useState<Method>('email');
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function attempt(fn: () => Promise<unknown>) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  }

  const submitEmail = () => attempt(async () => {
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw error;
    } else if (mode === 'signup') {
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${SITE_URL}/auth/callback` } });
      if (error) throw error;
      if (!data.session) setNotice(`We sent a link to ${email}. Open it, then come back and log in.`);
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${SITE_URL}/auth/callback?next=/reset-password` });
      if (error) throw error;
      setNotice(`If ${email} has an account, a reset link is on its way.`);
    }
  });

  const submitPhone = () => attempt(async () => {
    const p = toE164(phone);
    if (!codeSent) {
      const { error } = await supabase.auth.signInWithOtp({ phone: p });
      if (error) throw error;
      setCodeSent(true);
      setNotice(`We texted a 6-digit code to ${p}.`);
    } else {
      const { error } = await supabase.auth.verifyOtp({ phone: p, token: code.trim(), type: 'sms' });
      if (error) throw error;
    }
  });

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Row style={{ gap: 8, marginTop: 12 }}>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.accentInk, fontWeight: '900', fontSize: 18 }}>✓</Text>
          </View>
          <T v="h2">Vouched</T>
        </Row>
        <T v="h1">{mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</T>

        {mode !== 'reset' && (
          <View style={{ gap: 10 }}>
            {Platform.OS === 'ios' ? (
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                buttonStyle={c.dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14} style={{ height: 50 }} onPress={() => attempt(signInWithApple)} />
            ) : (
              <Button kind="ghost" title="Continue with Apple" onPress={() => attempt(() => signInWithBrowser('apple'))} />
            )}
            <Button kind="ghost" title="Continue with Google" onPress={() => attempt(() => signInWithBrowser('google'))} />
            <T v="hint" style={{ textAlign: 'center' }}>or</T>
            <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 }}>
              {(['email', 'phone'] as Method[]).map(m => (
                <Pressable key={m} onPress={() => { setMethod(m); setError(null); setNotice(null); }} accessibilityState={{ selected: method === m }}
                  style={{ flex: 1, padding: 9, borderRadius: 9, alignItems: 'center', backgroundColor: method === m ? c.card : 'transparent' }}>
                  <Text style={{ fontWeight: '600', color: method === m ? c.ink : c.muted }}>{m === 'email' ? 'Email' : 'Phone'}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <ErrorText>{error}</ErrorText>
        {notice && <Banner tone="good">{notice}</Banner>}

        {method === 'email' || mode === 'reset' ? (
          <View style={{ gap: 14 }}>
            <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
            {mode !== 'reset' && (
              <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} hint={mode === 'signup' ? 'At least 8 characters.' : undefined} />
            )}
            <Button title={mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Log in'} onPress={submitEmail} busy={busy} />
            <Row style={{ justifyContent: 'space-between' }}>
              {mode === 'signin' && <Button small kind="ghost" title="Forgot password?" onPress={() => setMode('reset')} />}
              {mode === 'reset' && <Button small kind="ghost" title="Back to log in" onPress={() => setMode('signin')} />}
              {mode !== 'reset' && <Button small kind="ghost" title={mode === 'signin' ? 'Create an account' : 'Have an account? Log in'} onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')} />}
            </Row>
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" placeholder="(317) 555-0123" editable={!codeSent} />
            {codeSent && <Field label="6-digit code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} autoComplete="sms-otp" textContentType="oneTimeCode" />}
            <Button title={codeSent ? 'Verify and continue' : 'Text me a code'} onPress={submitPhone} busy={busy} />
            {codeSent && <Button small kind="ghost" title="Use a different number" onPress={() => { setCodeSent(false); setCode(''); setNotice(null); }} />}
            <T v="hint">Phone sign-ups get a “Phone verified” mark on their profile.</T>
          </View>
        )}

        <T v="hint">
          By continuing you agree to the{' '}
          <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${SITE_URL}/terms`)}>Terms</Text> and{' '}
          <Text style={{ textDecorationLine: 'underline' }} onPress={() => Linking.openURL(`${SITE_URL}/privacy`)}>Privacy policy</Text>, and confirm you are 18 or older.
        </T>
      </Screen>
    </KeyboardAvoidingView>
  );
}
