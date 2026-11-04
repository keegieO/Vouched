import { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Pressable, Share, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { REQUEST_MAX, REQUEST_MIN, REQUEST_SELECT, askText, vouchLink, type RecRequest } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { Button, Empty, ErrorText, Field, Panel, Row, Screen, T, useC } from '@/components/ui';
import { FeedRequest } from '@/components/social';

export default function Ask() {
  const { profile } = useAuth();
  const params = useLocalSearchParams<{ tab?: string }>();
  const router = useRouter();
  const c = useC();
  const [tab, setTab] = useState<'vouch' | 'rec'>(params.tab === 'rec' ? 'rec' : 'vouch');
  const [copied, setCopied] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [city, setCity] = useState(profile?.city ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<RecRequest[]>([]);

  useEffect(() => { if (params.tab === 'rec') setTab('rec'); }, [params.tab]);
  const loadMine = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('requests').select(REQUEST_SELECT).eq('author_id', profile.id).order('created_at', { ascending: false });
    setMine((data ?? []) as unknown as RecRequest[]);
  }, [profile]);
  useFocusEffect(useCallback(() => { loadMine(); }, [loadMine]));

  if (!profile) return null;
  const link = vouchLink(SITE_URL, profile.username);
  const message = askText(SITE_URL, profile.display_name, profile.username);
  const smsUrl = `sms:${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(message)}`;
  async function copy(text: string, which: string) {
    await Clipboard.setStringAsync(text); setCopied(which); setTimeout(() => setCopied(null), 1800);
  }
  async function post() {
    if (body.trim().length < REQUEST_MIN) return setError(`Say a bit more about what you need (at least ${REQUEST_MIN} characters).`);
    setBusy(true); setError(null);
    const { data, error } = await supabase.from('requests').insert({ author_id: profile!.id, body: body.trim(), city: city.trim() || null }).select('id').single();
    setBusy(false);
    if (error) return setError(error.message);
    setBody('');
    router.push(`/requests/${data.id}`);
  }

  return (
    <Screen>
      <T v="h1">Create</T>
      <Row style={{ flexWrap: 'nowrap' }}>
        <Button kind="hi" title="Give props" onPress={() => router.push('/props')} style={{ flex: 1 }} />
        <Button kind="ink" title="Vouch someone in" onPress={() => router.push('/invite')} style={{ flex: 1 }} />
      </Row>
      <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 }}>
        {([['vouch', 'Get vouched'], ['rec', 'Ask for a rec']] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, padding: 9, borderRadius: 9, alignItems: 'center', backgroundColor: tab === k ? c.card : 'transparent' }}>
            <Text style={{ fontWeight: '600', color: tab === k ? c.ink : c.muted }}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'vouch' ? (
        <>
          <T v="muted">Ask people from different parts of your life. A client, a coworker and a roommate read stronger than ten friends.</T>
          <Panel>
            <T v="h3">Send this text</T>
            <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 12 }}><T>{message}</T></View>
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
          <Panel>
            <T v="h3">Vouch for someone first</T>
            <T v="hint">People tend to vouch back. Find someone who deserves it.</T>
            <Button small kind="ghost" title="Open Discover" onPress={() => router.push('/(tabs)/discover')} style={{ alignSelf: 'flex-start' }} />
          </Panel>
        </>
      ) : (
        <>
          <T v="muted">Need a mechanic, a sitter, a stylist? Ask. People who follow you answer with Vouched profiles of people they trust.</T>
          <Panel>
            <Field label="What do you need?" value={body} onChangeText={setBody} multiline maxLength={REQUEST_MAX} style={{ minHeight: 90 }}
              placeholder="Need someone to fix a sagging fence gate this weekend. Anyone you trust?" />
            <Field label="Where" value={city} onChangeText={setCity} maxLength={60} placeholder="Greenwood, IN" />
            <ErrorText>{error}</ErrorText>
            <Button title="Post to my people" onPress={post} busy={busy} />
          </Panel>
          <T v="label">Your asks</T>
          {mine.length ? mine.map(r => <FeedRequest key={r.id} r={r} />) : <Empty>You haven’t asked for anything yet.</Empty>}
        </>
      )}
    </Screen>
  );
}
