import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { normalizeUsername, type Profile } from '@vouched/shared';
import { supabase } from '@/lib/supabase';
import { ProfileView } from '@/components/ProfileView';
import { Screen, T } from '@/components/ui';

export default function PublicProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  useFocusEffect(useCallback(() => {
    supabase.from('profiles').select('*').eq('username', normalizeUsername(String(username))).maybeSingle()
      .then(({ data }) => setProfile((data as Profile | null) ?? null));
  }, [username]));
  if (profile === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!profile) return <Screen edges={[]}><T v="h2">No one here</T><T v="muted">That profile doesn’t exist, or the username changed.</T></Screen>;
  if (profile.standing === 'removed') return <Screen edges={[]}><T v="h2">This account was removed</T><T v="muted">It broke Vouched’s rules on scams or fake accounts.</T></Screen>;
  return (
    <>
      <Stack.Screen options={{ title: profile.display_name }} />
      <ProfileView profile={profile} />
    </>
  );
}
