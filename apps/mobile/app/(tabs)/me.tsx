import { Pressable, Share, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { profileLink } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL } from '@/lib/supabase';
import { ProfileView } from '@/components/ProfileView';
import { FONT_HEAVY, useC } from '@/components/ui';
import { GUT } from '@/components/v2';

export default function MyProfile() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  if (!profile) return null;
  const url = profileLink(SITE_URL, profile.username);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top']}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, paddingHorizontal: GUT, height: 50 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: FONT_HEAVY, fontSize: 19, color: c.ink, letterSpacing: -0.4 }}>{profile.display_name}</Text>
        <Pressable hitSlop={10} onPress={() => Share.share({ message: url, url })} accessibilityLabel="Share your profile"><Ionicons name="share-outline" size={23} color={c.ink} /></Pressable>
        <Pressable hitSlop={10} onPress={() => router.push('/settings')} accessibilityLabel="Settings"><Ionicons name="settings-outline" size={23} color={c.ink} /></Pressable>
      </View>
      <ProfileView profile={profile} />
    </SafeAreaView>
  );
}
