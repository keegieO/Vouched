import { useState } from 'react';
import { Linking, Platform, Share, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { askText, vouchLink } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL } from '@/lib/supabase';
import { Button, Panel, Row, Screen, T, useC } from '@/components/ui';

export default function Ask() {
  const { profile } = useAuth();
  const c = useC();
  const [copied, setCopied] = useState<string | null>(null);
  if (!profile) return null;
  const link = vouchLink(SITE_URL, profile.username);
  const message = askText(SITE_URL, profile.display_name, profile.username);

  async function copy(text: string, which: string) {
    await Clipboard.setStringAsync(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 1800);
  }
  const smsUrl = `sms:${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;

  return (
    <Screen>
      <T v="h1">Get vouched</T>
      <T v="muted">Ask people from different parts of your life. A client, a coworker and a roommate read stronger than ten friends.</T>

      <Panel>
        <T v="h3">Send this text</T>
        <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }}>
          <T>{message}</T>
        </View>
        <Row>
          <Button title="Open Messages" onPress={() => Linking.openURL(smsUrl)} />
          <Button kind="ghost" title="Share" onPress={() => Share.share({ message })} />
          <Button kind="ghost" title={copied === 'text' ? 'Copied' : 'Copy'} onPress={() => copy(message, 'text')} />
        </Row>
      </Panel>

      <Panel>
        <T v="h3">Your vouch link</T>
        <T style={{ fontWeight: '600' }} numberOfLines={1}>{link.replace(/^https?:\/\//, '')}</T>
        <Button small title={copied === 'link' ? 'Copied' : 'Copy link'} onPress={() => copy(link, 'link')} style={{ alignSelf: 'flex-start' }} />
      </Panel>

      <View style={{ gap: 8 }}>
        <T v="label">Who to ask</T>
        {['Someone who has paid you for work', 'A current or past coworker or boss', 'A roommate or landlord', 'A friend who has known you 5+ years', 'A neighbor, teammate or classmate'].map(t => (
          <T key={t}>•  {t}</T>
        ))}
      </View>
    </Screen>
  );
}
