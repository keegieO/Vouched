import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { NOTE_MAX, REQUEST_SELECT, groupAnswers, timeAgo, type RecRequest, type SearchResult } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Avatar, Banner, Button, Empty, ErrorText, Field, Panel, Row, Screen, T, useC } from '@/components/ui';
import { PersonRow, usePeopleSearch } from '@/components/social';

export default function RequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const c = useC();
  const [r, setR] = useState<RecRequest | null | undefined>(undefined);
  const { q, setQ, results, loading } = usePeopleSearch();
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('requests').select(REQUEST_SELECT).eq('id', String(id)).maybeSingle();
    setR((data as unknown as RecRequest | null) ?? null);
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (r === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!r || !r.author || !session) return <Screen edges={[]}><Empty>That ask was deleted.</Empty></Screen>;
  const mine = r.author_id === session.user.id;
  const groups = groupAnswers(r.answers);

  async function recommend() {
    if (!picked) return setError('Pick a person to recommend.');
    setBusy(true); setError(null);
    const { error } = await supabase.from('request_answers').insert({ request_id: r!.id, author_id: session!.user.id, recommended_id: picked.id, note: note.trim() || null });
    setBusy(false);
    if (error) return setError(error.code === '23505' ? 'You already recommended them here.' : error.message);
    setDone(`Recommended ${picked.display_name.split(' ')[0]}`);
    setPicked(null); setNote(''); setQ('');
    load();
  }

  return (
    <Screen edges={[]}>
      <View style={{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 }}>
        <Row style={{ flexWrap: 'nowrap', gap: 10 }}>
          <Avatar name={r.author.display_name} url={r.author.avatar_url} size={40} />
          <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}><Text style={{ fontWeight: '700' }}>{r.author.display_name}</Text><Text style={{ color: c.muted }}> is asking · {timeAgo(r.created_at)}</Text></Text>
        </Row>
        <T style={{ fontSize: 20, fontWeight: '800', lineHeight: 25 }}>{r.body}</T>
        {r.city ? <T v="hint">📍 {r.city}</T> : null}
        {mine && (confirmDelete ? (
          <Row>
            <Button small kind="danger" title="Yes, delete it" onPress={async () => { await supabase.from('requests').delete().eq('id', r.id); router.back(); }} />
            <Button small kind="ghost" title="Cancel" onPress={() => setConfirmDelete(false)} />
          </Row>
        ) : <Button small kind="ghost" title="Delete my ask" onPress={() => setConfirmDelete(true)} style={{ alignSelf: 'flex-start' }} />)}
      </View>

      <T v="label">{r.answers.length} {r.answers.length === 1 ? 'recommendation' : 'recommendations'}</T>
      {groups.length ? groups.map(g => (
        <Panel key={g.person.id}>
          <Row style={{ flexWrap: 'nowrap', gap: 12 }}>
            <Avatar name={g.person.display_name} url={g.person.avatar_url} size={50} />
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/${g.person.username}`)}>
              <T v="h3">{g.person.display_name}</T>
              {g.person.headline ? <T v="hint">{g.person.headline}</T> : null}
              <T v="hint">Recommended by {g.answers.length}</T>
            </Pressable>
          </Row>
          {g.answers.map(a => (
            <View key={a.id} style={{ flexDirection: 'row', gap: 10, borderTopWidth: 1, borderColor: c.line, paddingTop: 10 }}>
              <Avatar name={a.author?.display_name ?? '?'} url={a.author?.avatar_url} size={30} />
              <View style={{ flex: 1 }}>
                <T style={{ fontSize: 14, fontWeight: '700' }}>{a.author?.display_name ?? 'Someone'} <Text style={{ color: c.muted, fontWeight: '400' }}>{timeAgo(a.created_at)}</Text></T>
                {a.note ? <T style={{ fontSize: 14 }}>{a.note}</T> : null}
              </View>
            </View>
          ))}
        </Panel>
      )) : <Empty>{mine ? 'No answers yet. Share it with friends so they can point you to someone.' : 'No recommendations yet. Be the first.'}</Empty>}

      {!mine && (
        <Panel>
          <T v="h3">Recommend someone</T>
          {done && <Banner tone="good">{done}</Banner>}
          {picked ? (
            <PersonRow p={picked} following={false} first action={<Button small kind="ghost" title="Change" onPress={() => setPicked(null)} />} />
          ) : (
            <>
              <Field label="Who do you trust for this?" value={q} onChangeText={setQ} placeholder="Search Vouched…" autoCapitalize="none" />
              {q.trim() ? (loading ? <T v="hint">Searching…</T> : results.filter(p => p.id !== r.author_id).slice(0, 6).map((p, i) => (
                <PersonRow key={p.id} p={p} following={false} first={i === 0} action={<Button small title="Pick" onPress={() => setPicked(p)} />} />
              ))) : null}
            </>
          )}
          <Field label="Why? (optional)" value={note} onChangeText={setNote} maxLength={NOTE_MAX} placeholder="Fixed my gate in an hour. Fair price." />
          <ErrorText>{error}</ErrorText>
          <Button title="Recommend" onPress={recommend} busy={busy} disabled={!picked} />
          <T v="hint">They get a notification that you put their name forward.</T>
        </Panel>
      )}
    </Screen>
  );
}
