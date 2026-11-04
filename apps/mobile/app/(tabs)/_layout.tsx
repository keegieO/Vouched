import { Text } from 'react-native';
import { Tabs } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { usePendingCount } from '@/lib/hooks';
import { useColors } from '@/lib/theme';

const glyph = (g: string) => ({ color }: { color: string }) => <Text style={{ color, fontSize: 20, fontWeight: '700' }}>{g}</Text>;

export default function TabsLayout() {
  const { profile } = useAuth();
  const c = useColors(profile?.theme);
  const { count } = usePendingCount(profile?.id);

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.accent,
      tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      tabBarLabelStyle: { fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Feed', tabBarIcon: glyph('⌂') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: glyph('⌕') }} />
      <Tabs.Screen name="ask" options={{ title: 'Ask', tabBarIcon: glyph('➤') }} />
      <Tabs.Screen name="inbox" options={{ title: 'Inbox', tabBarIcon: glyph('▤'), tabBarBadge: count || undefined, tabBarBadgeStyle: { backgroundColor: c.accent, color: c.accentInk } }} />
      <Tabs.Screen name="me" options={{ title: 'Me', tabBarIcon: glyph('◉') }} />
    </Tabs>
  );
}
