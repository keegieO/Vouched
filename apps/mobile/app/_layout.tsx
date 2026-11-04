import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Routes anyone can open without an account (public profiles from shared links).
const PUBLIC_FIRST = new Set(['login', 'auth-callback']);

function Gate() {
  const { loading, session, profile } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();
  const c = useColors(profile?.theme);

  useEffect(() => {
    if (loading) return;
    SplashScreen.hideAsync().catch(() => {});
    const first = segments[0] as string | undefined;
    const inTabs = first === '(tabs)';
    const onPublicProfile = !!first && !inTabs && !PUBLIC_FIRST.has(first) && !['onboarding', 'written', 'settings', 'requests', 'request-vouch'].includes(first) && segments[1] !== 'vouch';

    if (!session) {
      if (!PUBLIC_FIRST.has(first ?? '') && !onPublicProfile) router.replace('/login');
    } else if (!profile) {
      if (first !== 'onboarding') router.replace('/onboarding');
    } else if (first === 'login' || first === 'onboarding' || !first) {
      router.replace('/(tabs)');
    }
  }, [loading, session, profile, segments, router]);

  if (loading) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.accent} /></View>;
  }

  return (
    <>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="written" options={{ headerShown: true, title: 'Vouches you wrote', headerTintColor: c.accent, headerStyle: { backgroundColor: c.surface }, headerTitleStyle: { color: c.ink } }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings', headerTintColor: c.accent, headerStyle: { backgroundColor: c.surface }, headerTitleStyle: { color: c.ink } }} />
        <Stack.Screen name="request-vouch" options={{ headerShown: true, title: 'Request a vouch', headerTintColor: c.accent, headerStyle: { backgroundColor: c.surface }, headerTitleStyle: { color: c.ink } }} />
        <Stack.Screen name="requests/[id]" options={{ headerShown: true, title: 'Ask', headerTintColor: c.accent, headerStyle: { backgroundColor: c.surface }, headerTitleStyle: { color: c.ink } }} />
        <Stack.Screen name="[username]/index" options={{ headerShown: true, title: '', headerTintColor: c.accent, headerStyle: { backgroundColor: c.surface } }} />
        <Stack.Screen name="[username]/vouch" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
