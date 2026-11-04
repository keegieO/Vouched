import { useEffect, useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { STYLES, THEMES, isStyle, normalizeUsername, usernameError, type Profile, type StyleKey, type ThemeKey } from '@vouched/shared';
import { supabase } from '@/lib/supabase';
import { useColors } from '@/lib/theme';
import { Avatar, Banner, Button, ErrorText, Field, Row, T } from './ui';

export function ProfileEditor({ userId, existing, suggestedName = '', saveLabel, onSaved }: {
  userId: string; existing: Profile | null; suggestedName?: string; saveLabel: string; onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(existing?.display_name ?? suggestedName);
  const [username, setUsername] = useState(existing?.username ?? '');
  const [headline, setHeadline] = useState(existing?.headline ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [showCity, setShowCity] = useState(existing?.show_city ?? true);
  const [theme, setTheme] = useState<ThemeKey>(existing?.theme ?? 'cobalt');
  const [style, setStyle] = useState<StyleKey>(isStyle(existing?.style) ? existing!.style : 'signed');
  const [open, setOpen] = useState(existing?.open_to_vouches ?? true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(existing?.avatar_url ?? null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const c = useColors(theme);

  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u || usernameError(u) || u === existing?.username) { setAvailable(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', u).maybeSingle();
      setAvailable(!data);
    }, 350);
    return () => clearTimeout(t);
  }, [username, existing?.username]);

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 });
    if (res.canceled) return;
    const asset = res.assets[0];
    setUploading(true); setError(null);
    try {
      const type = asset.mimeType ?? 'image/jpeg';
      if (!/^image\/(jpeg|png|webp)$/.test(type)) throw new Error('Use a JPG, PNG or WebP photo.');
      const body = await (await fetch(asset.uri)).arrayBuffer();
      if (body.byteLength > 3 * 1024 * 1024) throw new Error('That photo is over 3 MB. Try a smaller one.');
      const path = `${userId}/avatar-${Date.now()}.${type.split('/')[1]}`;
      const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: type, upsert: true });
      if (error) throw error;
      setAvatarUrl(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    setError(null); setSaved(false);
    const u = normalizeUsername(username);
    const err = usernameError(u);
    if (err) return setError(err);
    if (!displayName.trim()) return setError('Add your name.');
    if (available === false) return setError('That username is taken.');
    setBusy(true);
    const row = { id: userId, username: u, display_name: displayName.trim(), headline: headline.trim() || null, city: city.trim() || null,
      show_city: showCity, theme, style, open_to_vouches: open, avatar_url: avatarUrl };
    const { error } = existing ? await supabase.from('profiles').update(row).eq('id', userId) : await supabase.from('profiles').insert(row);
    setBusy(false);
    if (error) return setError(error.code === '23505' ? 'That username is taken.' : error.message);
    setSaved(true);
    onSaved();
  }

  const uErr = username ? usernameError(username) : null;

  return (
    <View style={{ gap: 18 }}>
      <Row style={{ gap: 14 }}>
        <Avatar name={displayName || '?'} url={avatarUrl} size={80} theme={theme} />
        <View style={{ gap: 8 }}>
          <Button small kind="ghost" title={uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add a photo'} onPress={pickPhoto} disabled={uploading} />
          {avatarUrl && <Button small kind="ghost" title="Remove photo" onPress={() => setAvatarUrl(null)} />}
        </View>
      </Row>
      <Field label="Your name" value={displayName} onChangeText={setDisplayName} maxLength={50} autoComplete="name" />
      <Field label="Username" value={username} onChangeText={t => setUsername(t.toLowerCase())} autoCapitalize="none" autoCorrect={false} maxLength={21}
        hint={uErr ?? (available === false ? 'Taken. Try another.' : available ? 'Available.' : 'Your link uses this.')} />
      <Field label="Headline" value={headline} onChangeText={setHeadline} maxLength={80} placeholder="Handyman in Greenwood. TV mounting, doors, small repairs."
        hint={`The only line about you that you write. ${headline.length}/80`} />
      <Field label="City (optional)" value={city} onChangeText={setCity} maxLength={60} placeholder="Greenwood, IN" />
      <Row style={{ justifyContent: 'space-between' }}>
        <T>Show my city on my profile</T>
        <Switch value={showCity} onValueChange={setShowCity} trackColor={{ true: c.accent }} />
      </Row>
      <View style={{ gap: 8 }}>
        <T v="h3" style={{ fontSize: 15, fontWeight: '600' }}>Profile color</T>
        <Row style={{ gap: 10 }}>
          {(Object.keys(THEMES) as ThemeKey[]).map(k => (
            <Pressable key={k} accessibilityLabel={THEMES[k].name} accessibilityState={{ selected: theme === k }} onPress={() => setTheme(k)}
              style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: c.dark ? THEMES[k].dark : THEMES[k].light, borderWidth: 3, borderColor: theme === k ? c.ink : 'transparent' }} />
          ))}
        </Row>
      </View>
      <View style={{ gap: 8 }}>
        <T v="h3" style={{ fontSize: 15, fontWeight: '600' }}>Page style</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(Object.keys(STYLES) as StyleKey[]).map(k => <StyleTile key={k} k={k} theme={theme} selected={style === k} onPress={() => setStyle(k)} />)}
        </View>
        <T v="hint">How your public page looks to people who open your link.</T>
      </View>

      {existing && (
        <Row style={{ justifyContent: 'space-between', flexWrap: 'nowrap' }}>
          <View style={{ flex: 1 }}>
            <T>Accept new vouches</T>
            <T v="hint">Turn off to pause new vouches. Approved ones stay up.</T>
          </View>
          <Switch value={open} onValueChange={setOpen} trackColor={{ true: c.accent }} />
        </Row>
      )}
      <ErrorText>{error}</ErrorText>
      {saved && !error && <Banner tone="good">Saved.</Banner>}
      <Button title={saveLabel} onPress={save} busy={busy} disabled={uploading} />
    </View>
  );
}

function StyleTile({ k, theme, selected, onPress }: { k: StyleKey; theme: ThemeKey; selected: boolean; onPress: () => void }) {
  const c = useColors(theme, k);
  const ui = useColors(theme);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={{ width: '47%', backgroundColor: c.bg, borderRadius: 16, padding: 12, gap: 8, borderWidth: 3, borderColor: selected ? ui.ink : 'transparent' }}>
      <Text style={{ color: c.ink, fontWeight: '800', fontSize: 16, textTransform: c.upper && k !== 'signed' ? 'uppercase' : 'none' }}>{STYLES[k].name}</Text>
      <View style={{ backgroundColor: k === 'night' ? c.surface : c.card, borderRadius: c.radius / 2, padding: 8, borderWidth: k === 'pop' ? 2 : k === 'night' ? 0 : 1,
        borderColor: k === 'badge' ? '#B3BAC5' : c.line, borderStyle: c.dashed ? 'dashed' : 'solid' }}>
        <Text style={{ color: c.ink, fontSize: 12 }}>“Always shows up.”</Text>
        <Text style={{ color: c.sig, fontSize: 13, fontWeight: '700', fontStyle: k === 'signed' ? 'italic' : 'normal' }}>Dana W.</Text>
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>{STYLES[k].blurb}</Text>
    </Pressable>
  );
}
