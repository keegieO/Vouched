import { useState } from 'react';
import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import { cacheDirectory, downloadAsync } from 'expo-file-system/legacy';
import { cardUrl } from '@vouched/shared';
import { SITE_URL } from '@/lib/supabase';
import { Button } from './ui';

/** Downloads the 1080×1920 story image of a vouch and opens the share sheet (Instagram, Snapchat, Messages…). */
export function ShareCardButton({ vouchId }: { vouchId: string }) {
  const [busy, setBusy] = useState(false);
  async function share() {
    setBusy(true);
    const url = cardUrl(SITE_URL, vouchId);
    try {
      const { uri, status } = await downloadAsync(url, `${cacheDirectory}vouch-${vouchId}.png`);
      if (status === 200 && (await Sharing.isAvailableAsync())) await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your vouch' });
      else await Share.share({ url, message: url });
    } catch {
      await Share.share({ url, message: url }).catch(() => {});
    }
    setBusy(false);
  }
  return <Button small kind="soft" title="Share as story" busy={busy} onPress={share} style={{ alignSelf: 'flex-start' }} />;
}
