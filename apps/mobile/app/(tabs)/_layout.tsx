import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { usePendingCount } from '@/lib/hooks';
import { useColors } from '@/lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (on: IconName, off: IconName) => ({ color, focused }: { color: string; focused: boolean }) => <Ionicons name={focused ? on : off} size={24} color={color} />;

export default function TabsLayout() {
  const { profile } = useAuth();
  const c = useColors(profile?.theme);
  const { count } = usePendingCount(profile?.id);

  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarActiveTintColor: c.ink,
      tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.line },
      tabBarLabelStyle: { fontWeight: '600' },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="discover" options={{ title: 'Discover', tabBarIcon: icon('search', 'search-outline') }} />
      <Tabs.Screen name="ask" options={{ title: 'Create', tabBarIcon: icon('add-circle', 'add-circle-outline') }} />
      <Tabs.Screen name="inbox" options={{ title: 'Activity', tabBarIcon: icon('notifications', 'notifications-outline'), tabBarBadge: count || undefined, tabBarBadgeStyle: { backgroundColor: c.accent, color: c.accentInk } }} />
      <Tabs.Screen name="me" options={{ title: 'Profile', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
