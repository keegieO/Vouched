import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { REPLY_MAX, timeAgo, type RecRequest, type SearchResult, type VouchWithBoth } from '@vouched/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, Row, T, useC } from './ui';

const firstName = (n?: string | null) => (n ?? '').split(' ')[0] || 'them';

export function FollowButton({ targetId, following, onChange }: { targetId: string; following: boolean; onChange?: (on: boolean) => void }) {
  const { session } = useAuth();
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);
  useEffect(() => setOn(following), [following]);
  if (session?.user.id === targetId) return null;
  async function toggle() {
    if (!session) return router.push('/login');
    setBusy(true);
    const me = session.user.id;
    const { error } = on
      ? await supabase.from('follows').delete().eq('follower_id', me).eq('followee_id', targetId)
      : await supabase.from('follows').insert({ follower_id: me, followee_id: targetId });
    setBusy(false);
    if (!error) { setOn(!on); onChange?.(!on); }
  }
  return <Button small kind={on ? 'ghost' : 'primary'} title={on ? 'Following' : 'Follow'} onPress={toggle} busy={busy} />;
}

export function CosignButton({ vouchId, subjectId, authorId, cosigns }: { vouchId: string; subjectId: string; authorId: string; cosigns: { user_id: string }[] }) {
  const { session } = useAuth();
  const router = useRouter();
  const c = useC();
  const me = session?.user.id ?? null;
  const [on, setOn] = useState(!!me && cosigns.some(x => x.user_id === me));
  const [n, setN] = useState(cosigns.length);
  const [busy, setBusy] = useState(false);
  if (me && (me === subjectId || me === authorId)) return n ? <T v="hint">✓ {n} co-signed</T> : null;
  async function toggle() {
    if (!me) return router.push('/login');
    setBusy(true);
    const { error } = on
      ? await supabase.from('cosigns').delete().eq('vouch_id', vouchId).eq('user_id', me)
      : await supabase.from('cosigns').insert({ vouch_id: vouchId, user_id: me });
    setBusy(false);
    if (!error) { setOn(!on); setN(n + (on ? -1 : 1)); }
  }
  return (
    <Pressable onPress={toggle} disabled={busy} accessibilityRole="button" accessibilityState={{ selected: on }}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999,
        borderWidth: 1, borderColor: on ? c.good : c.line, backgroundColor: on ? c.goodSoft : c.card }}>
      <Text style={{ color: on ? c.good : c.ink, fontWeight: '700', fontSize: 13 }}>✓ {on ? 'Co-signed' : 'Co-sign'}{n ? ` · ${n}` : ''}</Text>
    </Pressable>
  );
}

export function ReplyControl({ vouchId, authorFirst, onDone }: { vouchId: string; authorFirst: string; onDone: () => void }) {
  const c = useC();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return <Pressable onPress={() => setOpen(true)}><Text style={{ color: c.accent, fontWeight: '600' }}>Say thanks to {authorFirst}</Text></Pressable>;
  return (
    <View style={{ gap: 8 }}>
      <TextInput value={text} onChangeText={setText} maxLength={REPLY_MAX} placeholder="Say thanks…" placeholderTextColor={c.muted} autoFocus
        style={{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 11, fontSize: 16, color: c.ink }} />
      <Row>
        <Button small title="Post reply" busy={busy} disabled={!text.trim()} onPress={async () => {
          setBusy(true);
          const { error } = await supabase.rpc('set_vouch_reply', { p_vouch_id: vouchId, p_reply: text.trim() });
          setBusy(false);
          if (!error) { setOpen(false); onDone(); }
        }} />
        <Button small kind="ghost" title="Cancel" onPress={() => setOpen(false)} />
      </Row>
    </View>
  );
}

export function ReplyBlock({ name, text }: { name: string; text: string }) {
  const c = useC();
  return (
    <View style={{ backgroundColor: c.accentSoft, borderRadius: 12, padding: 10, gap: 2 }}>
      <Text style={{ color: c.ink, fontWeight: '700', fontSize: 13 }}>{firstName(name)} replied</Text>
      <Text style={{ color: c.ink, fontSize: 14 }}>{text}</Text>
    </View>
  );
}

export function usePeopleSearch() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('search_profiles', { q: q.trim(), lim: 30 });
      setResults((data ?? []) as SearchResult[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);
  return { q, setQ, results, loading };
}

export function PersonRow({ p, following, action, first }: { p: SearchResult; following: boolean; action?: React.ReactNode; first?: boolean }) {
  const c = useC();
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: first ? 0 : 1, borderColor: c.line }}>
      <Avatar name={p.display_name} url={p.avatar_url} size={46} />
      <Pressable style={{ flex: 1 }} onPress={() => router.push(`/${p.username}`)}>
        <T style={{ fontWeight: '700' }} numberOfLines={1}>{p.display_name}</T>
        <T v="hint" numberOfLines={1}>{p.headline || `@${p.username}`}</T>
        <T v="hint">{p.vouches} {p.vouches === 1 ? 'vouch' : 'vouches'}{p.city ? ` · ${p.city}` : ''}</T>
      </Pressable>
      {action ?? <FollowButton targetId={p.id} following={following} />}
    </View>
  );
}

export function FeedVouch({ v, alreadyVouched }: { v: VouchWithBoth; alreadyVouched: boolean }) {
  const c = useC();
  const router = useRouter();
  const { session } = useAuth();
  if (!v.author || !v.subject) return null;
  return (
    <View style={{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 }}>
      <Row style={{ flexWrap: 'nowrap', gap: 10 }}>
        <View style={{ flexDirection: 'row' }}>
          <Avatar name={v.author.display_name} url={v.author.avatar_url} size={34} />
          <View style={{ marginLeft: -10 }}><Avatar name={v.subject.display_name} url={v.subject.avatar_url} size={34} /></View>
        </View>
        <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>
          <Text style={{ fontWeight: '700' }} onPress={() => router.push(`/${v.author!.username}`)}>{v.author.display_name}</Text> vouched for{' '}
          <Text style={{ fontWeight: '700' }} onPress={() => router.push(`/${v.subject!.username}`)}>{v.subject.display_name}</Text>
          <Text style={{ color: c.muted }}> · {timeAgo(v.approved_at ?? v.created_at)}</Text>
        </Text>
      </Row>
      <View style={{ backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 }}>
        <Text style={{ color: c.accent, fontWeight: '700', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' }}>{v.relationship} · {v.duration}</Text>
        <T>{v.body}</T>
      </View>
      {v.reply ? <ReplyBlock name={v.subject.display_name} text={v.reply} /> : null}
      <Row>
        <CosignButton vouchId={v.id} subjectId={v.subject_id} authorId={v.author_id} cosigns={v.cosigns ?? []} />
        {session && session.user.id !== v.subject_id && !alreadyVouched && (
          <Button small kind="ghost" title={`Vouch for ${firstName(v.subject.display_name)} too`} onPress={() => router.push(`/${v.subject!.username}/vouch`)} />
        )}
      </Row>
    </View>
  );
}

export function FeedRequest({ r }: { r: RecRequest }) {
  const c = useC();
  const router = useRouter();
  const { session } = useAuth();
  if (!r.author) return null;
  const mine = session?.user.id === r.author_id;
  const people = Array.from(new Map(r.answers.filter(a => a.recommended).map(a => [a.recommended!.id, a.recommended!])).values());
  return (
    <View style={{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 10 }}>
      <Row style={{ flexWrap: 'nowrap', gap: 10 }}>
        <Avatar name={r.author.display_name} url={r.author.avatar_url} size={34} />
        <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>
          <Text style={{ fontWeight: '700' }}>{r.author.display_name}</Text><Text style={{ color: c.muted }}> is asking · {timeAgo(r.created_at)}</Text>
        </Text>
      </Row>
      <T style={{ fontSize: 19, fontWeight: '800', lineHeight: 24 }}>{r.body}</T>
      {r.city ? <T v="hint">📍 {r.city}</T> : null}
      <T v="hint">{people.length ? `${r.answers.length} ${r.answers.length === 1 ? 'recommendation' : 'recommendations'}: ${people.slice(0, 2).map(p => firstName(p.display_name)).join(', ')}${people.length > 2 ? '…' : ''}` : 'No recommendations yet. Know someone?'}</T>
      <Button small kind={mine ? 'ghost' : 'primary'} title={mine ? 'See answers' : 'Recommend someone'} onPress={() => router.push(`/requests/${r.id}`)} style={{ alignSelf: 'flex-start' }} />
    </View>
  );
}

/** Ids of people the signed-in user follows, reloadable. */
export function useFollowing() {
  const { session } = useAuth();
  const [ids, setIds] = useState<string[]>([]);
  const load = useCallback(async () => {
    if (!session) return;
    const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', session.user.id);
    setIds((data ?? []).map(x => x.followee_id as string));
  }, [session]);
  return { ids, load };
}
