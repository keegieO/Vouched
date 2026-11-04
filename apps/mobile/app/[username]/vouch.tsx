import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { BODY_MAX, DURATIONS, MAX_TRAITS, MONTHLY_VOUCHES, RELATIONSHIPS, TRAITS, monthResetLabel, normalizeUsername, vouchError, type Profile, type Vouch } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Avatar, Banner, Button, Chip, ErrorText, Field, Row, Screen, T, useC } from '@/components/ui';
import { Quota } from '@/components/trust';

export default function WriteVouch() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { session, profile: me } = useAuth();
  const router = useRouter();
  const [subject, setSubject] = useState<Profile | null | undefined>(undefined);
  const [existing, setExisting] = useState<Vouch | null>(null);
  const [relationship, setRelationship] = useState('');
  const [duration, setDuration] = useState<string>(DURATIONS[3]);
  const [traits, setTraits] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const c = useC(subject?.theme);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('username', normalizeUsername(String(username))).maybeSingle();
      setSubject((data as Profile | null) ?? null);
      supabase.rpc('vouches_left').then(({ data: l }) => setLeft((l as number | null) ?? 0));
      if (data && session) {
        const { data: v } = await supabase.from('vouches').select('*').eq('subject_id', data.id).eq('author_id', session.user.id).maybeSingle();
        if (v) {
          setExisting(v as Vouch);
          setRelationship(v.relationship); setDuration(v.duration); setTraits(v.traits); setBody(v.body); setAgree(true);
        }
      }
    })();
  }, [username, session]);

  if (subject === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!subject || !session || !me) return <Screen><T v="h2">Can’t open this</T><Button title="Close" onPress={() => router.back()} /></Screen>;
  const first = subject.display_name.split(' ')[0];
  const problem = vouchError({ relationship, duration, traits, body });

  async function submit() {
    if (problem) return setError(problem);
    if (!agree) return setError('Confirm the vouch is true and positive.');
    setBusy(true); setError(null);
    const { error } = existing
      ? await supabase.rpc('edit_my_vouch', { p_vouch_id: existing.id, p_relationship: relationship, p_duration: duration, p_traits: traits, p_body: body.trim() })
      : await supabase.from('vouches').insert({ subject_id: subject!.id, author_id: session!.user.id, relationship, duration, traits, body: body.trim() });
    setBusy(false);
    if (error) return setError(error.code === '23505' ? 'You already vouched for this person.' : error.message);
    setSent(true);
  }

  if (sent) {
    return (
      <Screen theme={subject.theme}>
        <View style={{ alignItems: 'center', gap: 14, marginTop: 40 }}>
          <View style={{ width: 88, height: 88, borderRadius: 28, backgroundColor: c.goodSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: c.good, fontSize: 44, fontWeight: '800' }}>✓</Text>
          </View>
          <T v="h1" style={{ textAlign: 'center' }}>{existing ? 'Vouch updated' : `Vouch sent to ${first}`}</T>
          <T v="muted" style={{ textAlign: 'center' }}>{first} approves it before it shows on their profile.</T>
        </View>
        <Button title="Ask people to vouch for you" onPress={() => router.replace('/(tabs)/ask')} />
        <Button kind="ghost" title="Done" onPress={() => router.back()} />
      </Screen>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen theme={subject.theme}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Pressable onPress={() => router.back()} hitSlop={10}><Text style={{ color: c.accent, fontWeight: '600', fontSize: 16 }}>Cancel</Text></Pressable>
        </Row>
        <Row style={{ gap: 14, flexWrap: 'nowrap' }}>
          <Avatar name={subject.display_name} url={subject.avatar_url} size={60} theme={subject.theme} />
          <View style={{ flex: 1 }}>
            <T v="label" c={c}>{existing ? 'Editing your vouch for' : 'You’re vouching for'}</T>
            <T v="h2" c={c}>{subject.display_name}</T>
          </View>
        </Row>

        {subject.id === session.user.id ? (
          <Banner>You can’t vouch for yourself. That’s the whole idea.</Banner>
        ) : !subject.open_to_vouches && !existing ? (
          <Banner>{first} isn’t taking new vouches right now.</Banner>
        ) : !existing && left !== null && left <= 0 ? (
          <>
            <Banner>You’ve used your {MONTHLY_VOUCHES} vouches this month. They reset {monthResetLabel()}. Give props instead — those are unlimited and anonymous.</Banner>
            <Button kind="hi" title="Give props" onPress={() => router.replace('/props')} />
          </>
        ) : (
          <>
            {!existing && left !== null && (
              <Quota left={Math.max(0, left - 1)} total={MONTHLY_VOUCHES} title={`Uses 1 of your ${left} vouches left this month`}
                hint={`If ${first} is later removed for scams or a fake account, your vouches count for less.`} />
            )}
            <View style={{ gap: 8 }}>
              <T v="h3" c={c}>How do you know {first}?</T>
              <Row style={{ gap: 6 }}>{RELATIONSHIPS.map(r => <Chip key={r} label={r} selected={relationship === r} onPress={() => setRelationship(r)} />)}</Row>
            </View>
            <View style={{ gap: 8 }}>
              <T v="h3" c={c}>For how long?</T>
              <Row style={{ gap: 6 }}>{DURATIONS.map(d => <Chip key={d} label={d} selected={duration === d} onPress={() => setDuration(d)} />)}</Row>
            </View>
            <View style={{ gap: 8 }}>
              <T v="h3" c={c}>Pick up to {MAX_TRAITS} that fit</T>
              <Row style={{ gap: 6 }}>
                {TRAITS.map(t => (
                  <Chip key={t} label={t} selected={traits.includes(t)} disabled={!traits.includes(t) && traits.length >= MAX_TRAITS}
                    onPress={() => setTraits(cur => cur.includes(t) ? cur.filter(x => x !== t) : cur.length < MAX_TRAITS ? [...cur, t] : cur)} />
                ))}
              </Row>
            </View>
            <Field label="Say it in your words" value={body} onChangeText={setBody} multiline maxLength={BODY_MAX}
              placeholder={`A real moment beats a compliment. What did ${first} do?`} hint={`${body.length}/${BODY_MAX}`} />
            <Pressable onPress={() => setAgree(!agree)} style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="checkbox" accessibilityState={{ checked: agree }}>
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: agree ? c.accent : c.line, backgroundColor: agree ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {agree && <Text style={{ color: c.accentInk, fontWeight: '900' }}>✓</Text>}
              </View>
              <T c={c} style={{ flex: 1, fontSize: 15 }}>This is true, positive, and shares nothing private. It will be signed {me.display_name}.</T>
            </Pressable>
            <ErrorText>{error}</ErrorText>
            <Button title={existing ? 'Save and resend' : 'Post vouch'} onPress={submit} busy={busy} disabled={!!problem || !agree} />
            <T v="hint" c={c}>{first} approves it before it shows on their profile.</T>
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}
