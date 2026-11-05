import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { useAuth } from '@/lib/auth';
import { usePendingCount } from '@/lib/hooks';
import { useColors } from '@/lib/theme';
import { Avatar } from '@/components/ui';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
const icon = (on: IconName, off: IconName) => ({ color, focused }: { color: string; focused: boolean }) => <Ionicons name={focused ? on : off} size={26} color={color} />;

export default function TabsLayout() {
  const { profile } = useAuth();
  const c = useColors(profile?.theme);
  const { count } = usePendingCount(profile?.id);
  return (
    <Tabs screenOptions={{
      headerShown: false,
      tabBarShowLabel: false,
      tabBarActiveTintColor: c.ink,
      tabBarInactiveTintColor: c.ink,
      tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.line },
    }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarAccessibilityLabel: 'Home', tabBarIcon: icon('home', 'home-outline') }} />
      <Tabs.Screen name="discover" options={{ title: 'Explore', tabBarAccessibilityLabel: 'Explore', tabBarIcon: icon('search', 'search-outline') }} />
      <Tabs.Screen name="create" options={{ title: 'Create', tabBarAccessibilityLabel: 'Create', tabBarIcon: () => (
        <View style={{ width: 46, height: 34, borderRadius: 12, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={24} color={c.bg} /></View>
      ) }} />
      <Tabs.Screen name="inbox" options={{ title: 'Activity', tabBarAccessibilityLabel: 'Activity', tabBarIcon: icon('notifications', 'notifications-outline'), tabBarBadge: count || undefined, tabBarBadgeStyle: { backgroundColor: c.accent, color: '#fff' } }} />
      <Tabs.Screen name="me" options={{ title: 'Profile', tabBarAccessibilityLabel: 'Profile', tabBarIcon: ({ focused }) => (
        <View style={{ borderRadius: 999, borderWidth: focused ? 2 : 0, borderColor: c.ink, padding: focused ? 1 : 0 }}><Avatar name={profile?.display_name ?? '?'} url={profile?.avatar_url} size={focused ? 26 : 28} /></View>
      ) }} />
    </Tabs>
  );
}
