import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { normalizeCode } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { INVITE_KEY } from '@/lib/invite';

/** Opened from an invite link: remember the code, then sign up or finish setup. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { session, profile } = useAuth();
  const router = useRouter();
  useEffect(() => {
    (async () => {
      await AsyncStorage.setItem(INVITE_KEY, normalizeCode(String(code ?? '')));
      router.replace(profile ? '/(tabs)' : session ? '/onboarding' : '/login');
    })();
  }, [code, session, profile, router]);
  return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
}
