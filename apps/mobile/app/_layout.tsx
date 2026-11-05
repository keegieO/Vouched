import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { Inter_800ExtraBold } from '@expo-google-fonts/inter/800ExtraBold';
import { Inter_900Black } from '@expo-google-fonts/inter/900Black';
import { NothingYouCouldDo_400Regular } from '@expo-google-fonts/nothing-you-could-do/400Regular';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { useColors } from '@/lib/theme';
import { CONFIGURED } from '@/lib/supabase';
import { registerForPush, routeForPush } from '@/lib/push';

SplashScreen.preventAutoHideAsync().catch(() => {});

// Routes anyone can open without an account (public profiles from shared links).
const PUBLIC_FIRST = new Set(['login', 'auth-callback', 'join']);
const PRIVATE_FIRST = ['onboarding', 'written', 'settings', 'requests', 'request-vouch', 'props', 'invite', 'feedback', 'score', 'week', 'vibe', 'rec'];

function Gate() {
  const { loading, session, profile } = useAuth();
  const segments = useSegments() as string[];
  const router = useRouter();
  const c = useColors(profile?.theme);
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, Inter_900Black, NothingYouCouldDo_400Regular });
  const ready = !loading && (fontsLoaded || !!fontError);

  useEffect(() => {
    if (!ready) return;
    SplashScreen.hideAsync().catch(() => {});
    const first = segments[0] as string | undefined;
    const inTabs = first === '(tabs)';
    const onPublicProfile = !!first && !inTabs && !PUBLIC_FIRST.has(first) && !PRIVATE_FIRST.includes(first) && segments[1] !== 'vouch';

    if (!session) {
      if (!PUBLIC_FIRST.has(first ?? '') && !onPublicProfile) router.replace('/login');
    } else if (!profile) {
      if (first !== 'onboarding') router.replace('/onboarding');
    } else if (first === 'login' || first === 'onboarding' || !first) {
      router.replace('/(tabs)');
    }
  }, [ready, session, profile, segments, router]);

  // Push notifications: register once signed in, and open the right screen when one is tapped.
  useEffect(() => {
    if (!profile) return;
    registerForPush();
    const open = (r: Notifications.NotificationResponse | null) => {
      const url = r?.notification.request.content.data?.url as string | undefined;
      if (r) router.push(routeForPush(url) as never);
    };
    Notifications.getLastNotificationResponseAsync().then(open).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}><ActivityIndicator color={c.accent} /></View>;
  }

  return (
    <>
      <StatusBar style={c.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="written" options={{ headerShown: true, title: 'Vouches you wrote', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="settings" options={{ headerShown: true, title: 'Settings', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="request-vouch" options={{ headerShown: true, title: 'Request a vouch', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="requests/[id]" options={{ headerShown: true, title: 'Ask', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="[username]/index" options={{ headerShown: true, title: '', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg } }} />
        <Stack.Screen name="[username]/vouch" options={{ presentation: 'modal' }} />
        <Stack.Screen name="props" options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#0F1419' } }} />
        <Stack.Screen name="rec" options={{ headerShown: true, title: 'Ask for a rec', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="week" options={{ presentation: 'fullScreenModal', contentStyle: { backgroundColor: '#0F1419' } }} />
        <Stack.Screen name="score" options={{ headerShown: true, title: 'Trust score', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="vibe/index" options={{ headerShown: true, title: 'What’s my vibe?', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="vibe/[username]" options={{ headerShown: true, title: '', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="invite" options={{ headerShown: true, title: 'Vouch someone in', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
        <Stack.Screen name="join/[code]" />
        <Stack.Screen name="feedback" options={{ headerShown: true, title: 'Send feedback', headerTintColor: c.ink, headerShadowVisible: false, headerStyle: { backgroundColor: c.bg }, headerTitleStyle: { color: c.ink, fontFamily: 'Inter_800ExtraBold' } }} />
      </Stack>
    </>
  );
}

/** Shown when the app was built without the Supabase settings, instead of a crash. */
function NotConfigured() {
  useEffect(() => { SplashScreen.hideAsync().catch(() => {}); }, []);
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 28, gap: 12, backgroundColor: '#F2F3F6' }}>
      <Text style={{ fontSize: 28, fontWeight: '800', color: '#0D1120' }}>Vouched isn’t connected yet</Text>
      <Text style={{ fontSize: 16, color: '#5F6680', lineHeight: 22 }}>
        This build was made without the database settings. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY
        (Expo → your project → Environment variables), then build again.
      </Text>
    </View>
  );
}

export default function RootLayout() {
  if (!CONFIGURED) return <NotConfigured />;
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
