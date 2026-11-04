import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://YOUR-DOMAIN.com').replace(/\/$/, '');

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
/** False when the build was made without the Supabase settings. The app shows a setup screen instead of crashing. */
export const CONFIGURED = !!URL && !!KEY && /^https?:\/\//.test(URL) && !URL.includes('REPLACE');

export const supabase = createClient(
  CONFIGURED ? URL! : 'https://not-configured.supabase.co',
  CONFIGURED ? KEY! : 'not-configured',
  {
    auth: {
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  },
);

// Refresh tokens only while the app is open.
AppState.addEventListener('change', state => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
