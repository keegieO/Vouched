import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

let current: string | null = null;

/**
 * Ask for permission (once), get this phone's Expo push token, and save it for the signed-in member.
 * Fails quietly: simulators, a denied permission, or a build without Firebase set up just mean no pushes.
 */
export async function registerForPush(): Promise<string | null> {
  try {
    if (!Device.isDevice) return null;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Vouches and props', importance: Notifications.AndroidImportance.DEFAULT, lightColor: '#2340D8',
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') ({ status } = await Notifications.requestPermissionsAsync());
    if (status !== 'granted') return null;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    if (!projectId || projectId.startsWith('REPLACE')) return null;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase.rpc('register_push_token', { p_token: token, p_platform: Platform.OS === 'ios' ? 'ios' : 'android' });
    current = token;
    return token;
  } catch {
    return null;
  }
}

/** Call before signing out so this phone stops getting the old account's notifications. */
export async function unregisterPush() {
  if (!current) return;
  try { await supabase.rpc('unregister_push_token', { p_token: current }); } catch { /* offline */ }
  current = null;
}

/** Turn a push's `url` (a website path) into an app route. */
export function routeForPush(url: string | undefined): string {
  if (!url || url === '/inbox') return '/(tabs)/inbox';
  if (url.startsWith('/requests/')) return url;
  if (/^\/[a-z0-9_]{3,20}$/.test(url)) return url;
  return '/(tabs)/inbox';
}
