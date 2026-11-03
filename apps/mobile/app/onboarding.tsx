import { KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { ProfileEditor } from '@/components/ProfileEditor';
import { Screen, T } from '@/components/ui';

export default function Onboarding() {
  const { session, refreshProfile } = useAuth();
  const router = useRouter();
  if (!session) return null;
  const meta = session.user.user_metadata ?? {};

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <T v="h1" style={{ marginTop: 12 }}>Set up your page</T>
        <T v="muted">This is the only part you write. Everything else comes from people who know you.</T>
        <ProfileEditor userId={session.user.id} existing={null} suggestedName={(meta.full_name || meta.name || '') as string}
          saveLabel="Create my profile" onSaved={async () => { await refreshProfile(); router.replace('/(tabs)/ask'); }} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
