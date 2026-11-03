import * as AppleAuthentication from 'expo-apple-authentication';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

const redirectTo = makeRedirectUri({ scheme: 'vouched', path: 'auth-callback' });

/** Google (and Apple on Android) through the browser, using PKCE. */
export async function signInWithBrowser(provider: 'google' | 'apple') {
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error) throw error;
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return false;
  const url = new URL(res.url);
  const code = url.searchParams.get('code');
  const err = url.searchParams.get('error_description');
  if (err) throw new Error(err);
  if (!code) throw new Error('Sign-in was cancelled.');
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  if (exErr) throw exErr;
  return true;
}

/** Native Sign in with Apple on iPhone. */
export async function signInWithApple() {
  if (Platform.OS !== 'ios') return signInWithBrowser('apple');
  try {
    const cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (!cred.identityToken) throw new Error('Apple didn’t return a sign-in token.');
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: cred.identityToken });
    if (error) throw error;
    // Apple only shares the name the first time; keep it for onboarding.
    const full = [cred.fullName?.givenName, cred.fullName?.familyName].filter(Boolean).join(' ');
    if (full) await supabase.auth.updateUser({ data: { full_name: full } });
    return true;
  } catch (e: unknown) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return false;
    throw e;
  }
}

export function toE164(raw: string) {
  const d = raw.replace(/\D/g, '');
  if (raw.trim().startsWith('+')) return '+' + d;
  if (d.length === 10) return '+1' + d;
  return '+' + d;
}
