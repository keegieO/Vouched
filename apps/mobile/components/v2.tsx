import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, Text, TextInput, View, type ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Svg, { Line, Polygon, Text as SvgText } from 'react-native-svg';
import {
  AXES, COMMENT_MAX, PRIVATE_NOTE_MAX, REACTIONS, profileLink, timeAgo,
  type Comment, type GiftType, type GiftWithPeople, type PersonalityRow, type ReactionCount, type TargetType, type VouchWithBoth,
} from '@vouched/shared';
import { supabase, SITE_URL } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar, Button, FONT_BODY, FONT_BOLD, FONT_HEAVY, FONT_MED, FONT_SIG, T, useC } from './ui';
import { ReportSheet } from './ReportSheet';

const first = (n?: string | null) => (n ?? '').split(' ')[0] || 'them';
export const GUT = 16;

/* ─────────────── Sheet ─────────────── */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }) {
  const c = useC();
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable style={{ ...absFill, backgroundColor: 'rgba(0,0,0,.4)' }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: c.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '88%', paddingBottom: 34 }}>
          <View style={{ width: 36, height: 4, borderRadius: 4, backgroundColor: c.line2, alignSelf: 'center', marginTop: 8 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUT, paddingTop: 8, paddingBottom: 4 }}>
            <Text style={{ flex: 1, fontFamily: FONT_HEAVY, fontSize: 20, color: c.ink, letterSpacing: -0.4 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close"><Ionicons name="close" size={24} color={c.muted} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: GUT, paddingTop: 8, gap: 12 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const absFill: ViewStyle = { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 };

export function SheetOption({ icon, title, sub, onPress, right, danger }: { icon: string; title: string; sub?: string; onPress: () => void; right?: string; danger?: boolean }) {
  const c = useC();
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}>
      <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: danger ? c.badSoft : c.sunk, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22 }}>{icon}</Text></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT_BOLD, fontSize: 15, color: danger ? c.bad : c.ink }}>{title}</Text>
        {sub ? <Text style={{ fontFamily: FONT_BODY, fontSize: 14, color: c.muted }}>{sub}</Text> : null}
      </View>
      {right ? <Text style={{ fontFamily: FONT_MED, fontSize: 13, color: c.muted }}>{right}</Text> : null}
    </Pressable>
  );
}

/* ─────────────── Small pieces ─────────────── */
export function TierPill({ tier, onPress }: { tier: string | null | undefined; onPress?: () => void }) {
  const c = useC();
  if (!tier) return null;
  const strong = tier === 'Highly trusted', none = tier === 'New';
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999,
      backgroundColor: strong ? c.accent : none ? c.sunk : c.accentSoft }}>
      <Ionicons name="shield-checkmark-outline" size={12} color={strong ? c.accentInk : none ? c.muted : c.accent} />
      <Text style={{ fontFamily: FONT_BOLD, fontSize: 12, color: strong ? c.accentInk : none ? c.muted : c.accent }}>{tier}</Text>
    </Pressable>
  );
}

export function Divider() { const c = useC(); return <View style={{ height: 1, backgroundColor: c.line }} />; }

export function SecLabel({ children }: { children: React.ReactNode }) {
  const c = useC();
  return <Text style={{ fontFamily: FONT_BOLD, fontSize: 13, color: c.muted, paddingHorizontal: GUT, paddingTop: 16, paddingBottom: 6 }}>{children}</Text>;
}

export function ListRow({ icon, title, sub, onPress, right, unread }: { icon: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; onPress?: () => void; right?: React.ReactNode; unread?: boolean }) {
  const c = useC();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: GUT, paddingVertical: 12,
      borderBottomWidth: 1, borderColor: c.line, backgroundColor: pressed ? c.sunk : unread ? c.accentSoft : 'transparent' })}>
      {typeof icon === 'string'
        ? <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.sunk, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>{icon}</Text></View>
        : icon}
      <View style={{ flex: 1, gap: 1 }}>
        {typeof title === 'string' ? <Text style={{ fontFamily: FONT_BOLD, fontSize: 15, color: c.ink }}>{title}</Text> : title}
        {sub ? (typeof sub === 'string' ? <Text style={{ fontFamily: FONT_BODY, fontSize: 14, color: c.muted }}>{sub}</Text> : sub) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : null)}
    </Pressable>
  );
}

export function Tabs<K extends string>({ tabs, value, onChange }: { tabs: [K, string][]; value: K; onChange: (k: K) => void }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.line }}>
      {tabs.map(([k, l]) => (
        <Pressable key={k} onPress={() => onChange(k)} accessibilityRole="tab" accessibilityState={{ selected: value === k }}
          style={{ flex: 1, height: 50, alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ fontFamily: value === k ? FONT_BOLD : FONT_MED, fontSize: 15, color: value === k ? c.ink : c.muted }}>{l}</Text>
          {value === k && <View style={{ position: 'absolute', bottom: 0, width: 52, height: 4, borderRadius: 4, backgroundColor: c.accent }} />}
        </Pressable>
      ))}
    </View>
  );
}

/* ─────────────── Reactions, comments, gifts ─────────────── */
export function ReactBar({ type, id, counts, giftTo, shareUsername }: {
  type: TargetType; id: string; counts?: ReactionCount; giftTo?: { id: string; name: string } | null; shareUsername?: string;
}) {
  const c = useC();
  const { profile } = useAuth();
  const router = useRouter();
  const [s, setS] = useState({ n: Number(counts?.n ?? 0), top: counts?.top ?? [], mine: counts?.mine ?? null });
  const [pop, setPop] = useState(false);
  const [cOpen, setCOpen] = useState(false);
  const [cCount, setCCount] = useState(Number(counts?.comments ?? 0));
  const [gift, setGift] = useState(false);
  useEffect(() => { setS({ n: Number(counts?.n ?? 0), top: counts?.top ?? [], mine: counts?.mine ?? null }); setCCount(Number(counts?.comments ?? 0)); }, [counts]);

  async function react(emoji: string | null) {
    if (!profile) return router.push('/login');
    setPop(false);
    const prev = s;
    if (emoji === null) {
      setS(x => ({ ...x, n: Math.max(0, x.n - 1), mine: null }));
      const { error } = await supabase.from('reactions').delete().eq('user_id', profile.id).eq('target_type', type).eq('target_id', id);
      if (error) setS(prev);
      return;
    }
    setS(x => ({ n: x.mine ? x.n : x.n + 1, mine: emoji, top: x.top.includes(emoji) ? x.top : [emoji, ...x.top].slice(0, 3) }));
    const { error } = await supabase.from('reactions').upsert({ user_id: profile.id, target_type: type, target_id: id, emoji }, { onConflict: 'user_id,target_type,target_id' });
    if (error) { setS(prev); Alert.alert('Couldn’t react', error.message); }
  }
  const act = { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingVertical: 6, paddingHorizontal: 8 };
  return (
    <View style={{ gap: 4 }}>
      {s.n > 0 && <Text style={{ fontFamily: FONT_BODY, fontSize: 13, color: c.muted }}>{s.top.join('')} {s.n}</Text>}
      {pop && (
        <View style={{ flexDirection: 'row', alignSelf: 'flex-start', gap: 2, padding: 6, borderRadius: 999, backgroundColor: c.bg, borderWidth: 1, borderColor: c.line,
          shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 }}>
          {REACTIONS.map(e => <Pressable key={e} onPress={() => react(e)} accessibilityLabel={`React ${e}`} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 24 }}>{e}</Text></Pressable>)}
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginLeft: -8, maxWidth: 420 }}>
        <Pressable style={act} onPress={() => (s.mine ? react(null) : setPop(p => !p))} accessibilityLabel={s.mine ? 'Remove reaction' : 'React'}>
          {s.mine ? <Text style={{ fontSize: 17 }}>{s.mine}</Text> : <Ionicons name="heart-outline" size={19} color={c.muted} />}
        </Pressable>
        <Pressable style={act} onPress={() => setCOpen(true)} accessibilityLabel="Comments">
          <Ionicons name="chatbubble-outline" size={18} color={c.muted} />{cCount ? <Text style={{ color: c.muted, fontFamily: FONT_BODY, fontSize: 13 }}>{cCount}</Text> : null}
        </Pressable>
        {giftTo && profile && giftTo.id !== profile.id
          ? <Pressable style={act} onPress={() => setGift(true)} accessibilityLabel={`Send ${giftTo.name} a gift`}><Ionicons name="gift-outline" size={19} color={c.muted} /></Pressable>
          : <View style={act} />}
        <Pressable style={act} accessibilityLabel="Share" onPress={() => { if (shareUsername) { const url = profileLink(SITE_URL, shareUsername); Share.share({ message: url, url }); } }}>
          <Ionicons name="share-outline" size={19} color={c.muted} />
        </Pressable>
      </View>
      <CommentsSheet open={cOpen} onClose={() => setCOpen(false)} type={type} id={id} onCount={setCCount} />
      {giftTo && <GiftSheet open={gift} onClose={() => setGift(false)} toId={giftTo.id} toName={giftTo.name} />}
    </View>
  );
}

export function CommentsSheet({ open, onClose, type, id, onCount }: { open: boolean; onClose: () => void; type: TargetType; id: string; onCount?: (n: number) => void }) {
  const c = useC();
  const { profile } = useAuth();
  const [list, setList] = useState<Comment[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from('comments')
      .select('id, author_id, body, created_at, author:profiles!comments_author_id_fkey(username, display_name, avatar_url)')
      .eq('target_type', type).eq('target_id', id).order('created_at');
    const l = (data ?? []) as unknown as Comment[];
    setList(l); onCount?.(l.length);
  }, [type, id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) load(); }, [open, load]);
  async function post() {
    if (!profile || !body.trim()) return;
    setBusy(true);
    const { error } = await supabase.from('comments').insert({ author_id: profile.id, target_type: type, target_id: id, body: body.trim() });
    setBusy(false);
    if (error) return Alert.alert('Couldn’t post', error.message);
    setBody(''); load();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Comments">
      {list === null ? <T v="hint">Loading…</T> : list.length ? list.map(cm => (
        <View key={cm.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: c.line }}>
          <Avatar name={cm.author?.display_name ?? '?'} url={cm.author?.avatar_url} size={32} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: FONT_BOLD, color: c.ink }}>{cm.author?.display_name ?? 'Deleted account'} <Text style={{ fontFamily: FONT_BODY, color: c.muted, fontSize: 13 }}>{timeAgo(cm.created_at)}</Text></Text>
            <Text style={{ fontFamily: FONT_BODY, color: c.ink, fontSize: 15 }}>{cm.body}</Text>
          </View>
          {profile?.id === cm.author_id && <Pressable hitSlop={8} onPress={async () => { await supabase.from('comments').delete().eq('id', cm.id); load(); }} accessibilityLabel="Delete comment"><Ionicons name="trash-outline" size={16} color={c.muted} /></Pressable>}
        </View>
      )) : <T v="muted">No comments yet. Say something nice.</T>}
      {profile && (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TextInput value={body} onChangeText={setBody} maxLength={COMMENT_MAX} placeholder="Add a comment" placeholderTextColor={c.muted}
            style={{ flex: 1, borderWidth: 1, borderColor: c.line2, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, color: c.ink, fontFamily: FONT_BODY, fontSize: 15 }} />
          <Button small kind="accent" title="Post" onPress={post} busy={busy} disabled={!body.trim()} />
        </View>
      )}
    </Sheet>
  );
}

export function GiftSheet({ open, onClose, toId, toName }: { open: boolean; onClose: () => void; toId: string; toName: string }) {
  const c = useC();
  const { profile } = useAuth();
  const [types, setTypes] = useState<GiftType[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    supabase.from('gift_types').select('key, emoji, label, premium, sort').eq('active', true).order('sort').then(({ data }) => setTypes((data ?? []) as GiftType[]));
    supabase.rpc('gifts_left_today').then(({ data }) => setLeft((data as number | null) ?? 0));
    setSent(null); setPick(null); setNote('');
  }, [open]);
  async function send() {
    if (!profile || !pick) return;
    setBusy(true);
    const { error } = await supabase.from('gifts').insert({ sender_id: profile.id, receiver_id: toId, gift: pick, note: note.trim() || null });
    setBusy(false);
    if (error) return Alert.alert('Couldn’t send', error.message);
    setSent(pick);
  }
  const free = (left ?? 0) > 0, f = first(toName);
  return (
    <Sheet open={open} onClose={onClose} title={sent ? 'Sent!' : `Gift for ${f}`}>
      {sent ? (
        <>
          <Text style={{ fontSize: 64, textAlign: 'center' }}>{types.find(t => t.key === sent)?.emoji}</Text>
          <T v="muted" style={{ textAlign: 'center' }}>{f} will see it on their gift shelf.</T>
          <Button title="Done" onPress={onClose} />
        </>
      ) : (
        <>
          <T v="hint">{left === null ? '…' : free ? 'You get 1 free gift a day.' : 'You’ve used today’s free gift. More tomorrow.'} Gifts never change anyone’s trust score.</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {types.map(t => {
              const on = pick === t.key, locked = t.premium || !free;
              return (
                <Pressable key={t.key} disabled={locked} onPress={() => setPick(t.key)} accessibilityState={{ selected: on, disabled: locked }}
                  style={{ width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: 16, borderWidth: 1.5,
                    borderColor: on ? c.accent : c.line, backgroundColor: on ? c.accentSoft : 'transparent', opacity: locked ? 0.45 : 1 }}>
                  <Text style={{ fontSize: 34 }}>{t.emoji}</Text>
                  <Text style={{ fontFamily: FONT_MED, fontSize: 13, color: c.ink }}>{t.label}</Text>
                  {t.premium && <Text style={{ fontFamily: FONT_BODY, fontSize: 12, color: c.muted }}>Soon</Text>}
                </Pressable>
              );
            })}
          </View>
          <TextInput value={note} onChangeText={setNote} maxLength={80} placeholder="Add a note (optional)" placeholderTextColor={c.muted}
            style={{ borderWidth: 1, borderColor: c.line2, borderRadius: 10, padding: 12, color: c.ink, fontFamily: FONT_BODY, fontSize: 16 }} />
          <Button kind="accent" title="Send" onPress={send} busy={busy} disabled={!free || !pick} />
        </>
      )}
    </Sheet>
  );
}

export function GiftButton({ toId, toName, label }: { toId: string; toName: string; label?: string }) {
  const c = useC();
  const { profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      {label ? <Button kind="hi" title={label} onPress={() => (profile ? setOpen(true) : router.push('/login'))} style={{ alignSelf: 'flex-start' }} /> : (
        <Pressable onPress={() => (profile ? setOpen(true) : router.push('/login'))} accessibilityLabel={`Send ${toName} a gift`}
          style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="gift-outline" size={18} color={c.ink} />
        </Pressable>
      )}
      <GiftSheet open={open} onClose={() => setOpen(false)} toId={toId} toName={toName} />
    </>
  );
}

/* ─────────────── Posts ─────────────── */
function PostShell({ avatar, children, onAvatar }: { avatar: React.ReactNode; children: React.ReactNode; onAvatar?: () => void }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: GUT, paddingTop: 12, paddingBottom: 6, borderBottomWidth: 1, borderColor: c.line }}>
      <Pressable onPress={onAvatar} disabled={!onAvatar}>{avatar}</Pressable>
      <View style={{ flex: 1, gap: 6, minWidth: 0 }}>{children}</View>
    </View>
  );
}
function Head({ name, extra, onPress, right }: { name: string; extra?: string; onPress?: () => void; right?: React.ReactNode }) {
  const c = useC();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <Text numberOfLines={1} onPress={onPress} style={{ fontFamily: FONT_BOLD, fontSize: 15, color: c.ink, flexShrink: 1 }}>{name}</Text>
      {extra ? <Text numberOfLines={1} style={{ fontFamily: FONT_BODY, fontSize: 15, color: c.muted, flexShrink: 1 }}>{extra}</Text> : null}
      <View style={{ flex: 1 }} />{right}
    </View>
  );
}

export function PostVouch({ v, counts, menu = true, onChanged }: { v: VouchWithBoth; counts?: ReactionCount; menu?: boolean; onChanged?: () => void }) {
  const c = useC();
  const router = useRouter();
  const { profile } = useAuth();
  if (!v.author || !v.subject) return null;
  const a = v.author, s = v.subject;
  return (
    <PostShell avatar={<Avatar name={a.display_name} url={a.avatar_url} size={40} />} onAvatar={() => router.push(`/${a.username}`)}>
      <Head name={a.display_name} extra={`@${a.username} · ${timeAgo(v.approved_at ?? v.created_at)}`} onPress={() => router.push(`/${a.username}`)}
        right={menu ? <VouchMenu vouchId={v.id} isAuthor={profile?.id === v.author_id} isSubject={profile?.id === v.subject_id} subjectFirst={first(s.display_name)} onChanged={onChanged} /> : null} />
      <Text style={{ fontFamily: FONT_BODY, fontSize: 15, color: c.ink }}>vouched for <Text style={{ fontFamily: FONT_BOLD }} onPress={() => router.push(`/${s.username}`)}>{s.display_name}</Text></Text>
      <View style={{ borderWidth: 1, borderColor: c.line, borderRadius: 16, padding: 12, gap: 8 }}>
        <Text style={{ fontFamily: FONT_MED, fontSize: 12.5, color: c.muted }}>{v.relationship} · {v.duration}</Text>
        <Text style={{ fontFamily: FONT_BODY, fontSize: 15, lineHeight: 21, color: c.ink }}>{v.body}</Text>
        {v.traits.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{v.traits.map(t => (
          <View key={t} style={{ backgroundColor: c.sunk, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontFamily: FONT_MED, fontSize: 12.5, color: c.ink }}>{t}</Text></View>
        ))}</View>}
        <Text style={{ fontFamily: FONT_SIG, fontSize: 20, color: c.sig }}>{a.display_name}</Text>
      </View>
      {v.reply ? <View style={{ backgroundColor: c.sunk, borderRadius: 14, padding: 10 }}><Text style={{ fontFamily: FONT_BOLD, fontSize: 13, color: c.ink }}>{first(s.display_name)} replied</Text><Text style={{ fontFamily: FONT_BODY, color: c.ink }}>{v.reply}</Text></View> : null}
      <ReactBar type="vouch" id={v.id} counts={counts} giftTo={{ id: v.subject_id, name: s.display_name }} shareUsername={s.username} />
    </PostShell>
  );
}

export function PostGift({ g, counts }: { g: GiftWithPeople; counts?: ReactionCount }) {
  const c = useC();
  const router = useRouter();
  if (!g.sender || !g.receiver) return null;
  return (
    <PostShell avatar={<Avatar name={g.sender.display_name} url={g.sender.avatar_url} size={40} />} onAvatar={() => router.push(`/${g.sender!.username}`)}>
      <Head name={g.sender.display_name} extra={`· ${timeAgo(g.created_at)}`} />
      <View style={{ backgroundColor: c.sunk, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Text style={{ fontSize: 40 }}>{g.type?.emoji ?? '🎁'}</Text>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: FONT_BODY, color: c.ink, fontSize: 15 }}><Text style={{ fontFamily: FONT_BOLD }}>{g.type?.label ?? 'Gift'}</Text> for <Text style={{ fontFamily: FONT_BOLD }} onPress={() => router.push(`/${g.receiver!.username}`)}>{g.receiver.display_name}</Text></Text>
          {g.note ? <Text style={{ fontFamily: FONT_BODY, color: c.muted, fontSize: 14 }}>“{g.note}”</Text> : null}
        </View>
      </View>
      <ReactBar type="gift" id={g.id} counts={counts} shareUsername={g.receiver.username} />
    </PostShell>
  );
}

export function PostResult({ r }: { r: { username: string; display_name: string; avatar_url: string | null; question: string; label: string; emoji: string | null; n: number } }) {
  const c = useC();
  const router = useRouter();
  return (
    <PostShell avatar={<Avatar name={r.display_name} url={r.avatar_url} size={40} />} onAvatar={() => router.push(`/${r.username}`)}>
      <Text style={{ fontFamily: FONT_BODY, fontSize: 13, color: c.muted }}>✨ This week’s polls</Text>
      <Head name={r.display_name} extra="was voted" onPress={() => router.push(`/${r.username}`)} />
      <View style={{ backgroundColor: c.hiSoft, borderRadius: 16, padding: 14, gap: 4 }}>
        <Text style={{ fontFamily: FONT_BODY, fontSize: 13, color: c.muted }}>{r.question}</Text>
        <Text style={{ fontFamily: FONT_HEAVY, fontSize: 19, color: c.ink, letterSpacing: -0.4 }}>{r.emoji} {r.label} <Text style={{ fontFamily: FONT_MED, fontSize: 14, color: c.muted }}>· {r.n} votes</Text></Text>
      </View>
      <Button small kind="ghost" title="Vote in today’s polls" onPress={() => router.push('/props')} style={{ alignSelf: 'flex-start', marginBottom: 6 }} />
    </PostShell>
  );
}

export function PostJoin({ j }: { j: { username: string; display_name: string; created_at: string; inviter: { username: string; display_name: string; avatar_url: string | null } } }) {
  const c = useC();
  const router = useRouter();
  return (
    <PostShell avatar={<Avatar name={j.inviter.display_name} url={j.inviter.avatar_url} size={40} />} onAvatar={() => router.push(`/${j.inviter.username}`)}>
      <Head name={j.inviter.display_name} extra={`· ${timeAgo(j.created_at)}`} />
      <Text style={{ fontFamily: FONT_BODY, fontSize: 15, color: c.ink, paddingBottom: 8 }}>vouched <Text style={{ fontFamily: FONT_BOLD }} onPress={() => router.push(`/${j.username}`)}>{j.display_name}</Text> in. Welcome to Vouched 👋</Text>
    </PostShell>
  );
}

export function CaughtUp() {
  const c = useC();
  return (
    <View style={{ alignItems: 'center', gap: 6, paddingVertical: 32, paddingHorizontal: GUT }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: c.good, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="checkmark" size={24} color={c.good} /></View>
      <Text style={{ fontFamily: FONT_BOLD, color: c.ink, fontSize: 15 }}>You’re all caught up</Text>
      <Text style={{ fontFamily: FONT_BODY, color: c.muted, fontSize: 14, textAlign: 'center' }}>You’ve seen everything new from the last few days.</Text>
    </View>
  );
}

/* ─────────────── Personality radar ─────────────── */
export function Radar({ rows }: { rows: PersonalityRow[] }) {
  const c = useC();
  const data = AXES.map(a => [a, Number(rows.find(r => r.trait === a)?.score ?? 0)] as const);
  const cx = 150, cy = 135, R = 95, n = data.length;
  const pt = (i: number, r: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const ring = (k: number) => data.map((_, i) => pt(i, R * k).join(',')).join(' ');
  return (
    <Svg width="100%" height={260} viewBox="0 0 300 270" accessibilityLabel={`Personality: ${data.map(([a, v]) => `${a} ${Math.round(v * 100)}%`).join(', ')}`}>
      {[0.33, 0.66, 1].map(k => <Polygon key={k} points={ring(k)} fill="none" stroke={c.line2} strokeWidth={1} />)}
      {data.map((_, i) => { const [x, y] = pt(i, R); return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke={c.line2} strokeWidth={1} />; })}
      <Polygon points={data.map(([, v], i) => pt(i, R * Math.max(0.12, v)).join(',')).join(' ')} fill={c.accent} fillOpacity={0.22} stroke={c.accent} strokeWidth={2} />
      {data.map(([a], i) => { const [x, y] = pt(i, R + 18); return <SvgText key={a} x={x} y={y + 4} fontSize={11} fontWeight="600" fill={c.muted} textAnchor="middle">{a}</SvgText>; })}
    </Svg>
  );
}

export function GiftShelf({ gifts }: { gifts: GiftWithPeople[] }) {
  const c = useC();
  const router = useRouter();
  if (!gifts.length) return <T v="muted">No gifts yet.</T>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {gifts.map(g => (
        <Pressable key={g.id} onPress={() => g.sender && router.push(`/${g.sender.username}`)} accessibilityLabel={`${g.type?.label ?? 'Gift'} from ${g.sender?.display_name ?? 'someone'}`}
          style={{ width: '23%', flexGrow: 1, maxWidth: '25%', aspectRatio: 1, borderRadius: 16, backgroundColor: c.sunk, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
          <Text style={{ fontSize: 30 }}>{g.type?.emoji ?? '🎁'}</Text>
          <Text numberOfLines={1} style={{ fontFamily: FONT_MED, fontSize: 11, color: c.muted }}>{first(g.sender?.display_name)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/* ─────────────── Menus ─────────────── */
export function VouchMenu({ vouchId, isAuthor, isSubject, subjectFirst, onChanged }: { vouchId: string; isAuthor: boolean; isSubject: boolean; subjectFirst: string; onChanged?: () => void }) {
  const c = useC();
  const { profile } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [report, setReport] = useState<{ vouchId: string } | null>(null);
  function withdraw() {
    Alert.alert(`Take your name off ${subjectFirst}?`, 'It lowers their trust score, and you don’t get the vouch back this month.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Withdraw', style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('withdraw_vouch', { p_vouch_id: vouchId });
        setOpen(false);
        if (error) Alert.alert('Couldn’t withdraw', error.message); else onChanged?.();
      } },
    ]);
  }
  async function hide() {
    const { error } = await supabase.rpc('set_vouch_status', { p_vouch_id: vouchId, p_status: 'hidden' });
    setOpen(false);
    if (error) Alert.alert('Couldn’t hide', error.message); else onChanged?.();
  }
  return (
    <>
      <Pressable hitSlop={10} onPress={() => (profile ? setOpen(true) : router.push('/login'))} accessibilityLabel="More"><Ionicons name="ellipsis-horizontal" size={18} color={c.muted} /></Pressable>
      <Sheet open={open} onClose={() => setOpen(false)} title="Vouch">
        {isAuthor && <SheetOption icon="↩️" title="Withdraw this vouch" sub={`Takes your name off ${subjectFirst}`} onPress={withdraw} />}
        {isSubject && <SheetOption icon="🙈" title="Hide from my profile" sub="Only you will see it" onPress={hide} />}
        <SheetOption icon="🚩" title="Report" sub="Fake, harassment or private info" onPress={() => { setOpen(false); setReport({ vouchId }); }} />
      </Sheet>
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </>
  );
}

export function PrivateNoteSheet({ open, onClose, toId, toName }: { open: boolean; onClose: () => void; toId: string; toName: string }) {
  const c = useC();
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const f = first(toName);
  async function send() {
    if (!profile) return;
    setState('busy');
    const { error } = await supabase.from('private_notes').insert({ sender_id: profile.id, recipient_id: toId, body: text.trim() });
    if (error) { setState('idle'); return Alert.alert('Couldn’t send', error.message); }
    setState('sent');
  }
  const close = () => { setState('idle'); setText(''); onClose(); };
  return (
    <Sheet open={open} onClose={close} title={state === 'sent' ? 'Sent privately' : `Private feedback for ${f}`}>
      {state === 'sent' ? <><T v="muted">Only {f} can see it. It never shows on their profile.</T><Button title="Done" onPress={close} /></> : <>
        <T v="hint">Honest and kind. {f} will see it’s from you, and it never shows publicly.</T>
        <TextInput value={text} onChangeText={setText} maxLength={PRIVATE_NOTE_MAX} multiline placeholder="You’re great, but you flake on plans a lot. I’d love to hang more." placeholderTextColor={c.muted}
          style={{ minHeight: 110, textAlignVertical: 'top', borderWidth: 1, borderColor: c.line2, borderRadius: 10, padding: 12, color: c.ink, fontFamily: FONT_BODY, fontSize: 16 }} />
        <Button kind="accent" title="Send privately" onPress={send} busy={state === 'busy'} disabled={text.trim().length < 3} />
      </>}
    </Sheet>
  );
}

/* ─────────────── Stories ─────────────── */
export type StorySlide =
  | { kind: 'vouch'; at: string; from: string; rel: string; body: string }
  | { kind: 'gift'; at: string; from: string; emoji: string; label: string; note: string | null }
  | { kind: 'poll'; at: string; emoji: string | null; label: string; question: string; n: number };
export type StoryPerson = { id: string; username: string; name: string; avatar: string | null; slides: StorySlide[] };

export function Ring({ children, kind }: { children: React.ReactNode; kind: 'on' | 'seen' | 'hi' }) {
  const c = useC();
  // RN has no conic gradient; a two-tone ring keeps the Instagram feel without extra native modules.
  const color = kind === 'hi' ? c.hi : kind === 'seen' ? c.line2 : c.accent;
  return (
    <View style={{ padding: 2.5, borderRadius: 999, borderWidth: kind === 'on' ? 2.5 : 2, borderColor: kind === 'on' ? '#FF5CA8' : color, backgroundColor: kind === 'on' ? c.accent : color }}>
      <View style={{ borderRadius: 999, borderWidth: 2.5, borderColor: c.bg }}>{children}</View>
    </View>
  );
}

export function Stories({ me, people, playedToday, seen, onSeen }: { me: { name: string; avatar: string | null }; people: StoryPerson[]; playedToday: boolean; seen: Set<string>; onSeen: (id: string) => void }) {
  const c = useC();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const order = [...people].sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
  const lbl = { fontFamily: FONT_BODY, fontSize: 12, color: c.ink, maxWidth: 68 };
  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: GUT, paddingVertical: 12 }} style={{ borderBottomWidth: 1, borderColor: c.line, flexGrow: 0 }}>
        <Pressable onPress={() => router.push(playedToday ? '/week' : '/props')} style={{ alignItems: 'center', gap: 5, width: 68 }}>
          <View>
            <Ring kind={playedToday ? 'seen' : 'hi'}><Avatar name={me.name} url={me.avatar} size={58} /></Ring>
            <View style={{ position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: c.hi, borderWidth: 2.5, borderColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: FONT_HEAVY, fontSize: 11, color: c.hiInk }}>{playedToday ? '✓' : '5'}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={lbl}>{playedToday ? 'Your week' : 'Today’s polls'}</Text>
        </Pressable>
        {order.map((p, i) => (
          <Pressable key={p.id} onPress={() => setOpen(i)} style={{ alignItems: 'center', gap: 5, width: 68 }} accessibilityLabel={`${p.name}’s story`}>
            <Ring kind={seen.has(p.id) ? 'seen' : 'on'}><Avatar name={p.name} url={p.avatar} size={58} /></Ring>
            <Text numberOfLines={1} style={lbl}>{first(p.name)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {open !== null && <StoryViewer people={order} start={open} onSeen={onSeen} onClose={() => setOpen(null)} />}
    </>
  );
}

function StoryViewer({ people, start, onSeen, onClose }: { people: StoryPerson[]; start: number; onSeen: (id: string) => void; onClose: () => void }) {
  const router = useRouter();
  const [pos, setPos] = useState({ pi: start, si: 0 });
  const p = people[pos.pi], s = p?.slides[pos.si];
  const closing = useRef(false);
  const step = useCallback((dir: 1 | -1) => {
    setPos(({ pi, si }) => {
      if (dir === -1) return si > 0 ? { pi, si: si - 1 } : pi > 0 ? { pi: pi - 1, si: 0 } : { pi, si };
      if (si + 1 < people[pi].slides.length) return { pi, si: si + 1 };
      onSeen(people[pi].id);
      if (pi + 1 < people.length) return { pi: pi + 1, si: 0 };
      if (!closing.current) { closing.current = true; setTimeout(onClose, 0); }
      return { pi, si };
    });
  }, [people, onSeen, onClose]);
  useEffect(() => { const t = setTimeout(() => step(1), 5000); return () => clearTimeout(t); }, [pos, step]);
  if (!p || !s) return null;
  const W = '#fff', card = { backgroundColor: '#fff', borderRadius: 24, padding: 22, gap: 12 };
  return (
    <Modal visible animationType="fade" onRequestClose={() => { onSeen(p.id); onClose(); }} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: 54, paddingHorizontal: GUT, paddingBottom: 34 }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {p.slides.map((_, i) => <View key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: i <= pos.si ? W : 'rgba(255,255,255,.3)' }} />)}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <Avatar name={p.name} url={p.avatar} size={34} />
          <Text style={{ color: W, fontFamily: FONT_BOLD }}>{p.name}</Text>
          <Text style={{ color: 'rgba(255,255,255,.6)', fontFamily: FONT_BODY, fontSize: 13 }}>{timeAgo(s.at)}</Text>
          <View style={{ flex: 1 }} />
          <Pressable hitSlop={12} onPress={() => { onSeen(p.id); onClose(); }} accessibilityLabel="Close"><Ionicons name="close" size={26} color={W} /></Pressable>
        </View>
        <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
          {s.kind === 'vouch' && <>
            <Text style={{ color: 'rgba(255,255,255,.8)', fontFamily: FONT_BODY }}>New vouch from {s.from}</Text>
            <View style={card}>
              <Text style={{ fontFamily: FONT_BOLD, fontSize: 12, color: '#536471' }}>{s.rel}</Text>
              <Text style={{ fontFamily: FONT_BODY, fontSize: 19, lineHeight: 26, color: '#0F1419' }}>“{s.body}”</Text>
              <Text style={{ fontFamily: FONT_SIG, fontSize: 22, color: '#1D35B8' }}>{s.from}</Text>
            </View>
          </>}
          {s.kind === 'gift' && <>
            <Text style={{ color: 'rgba(255,255,255,.8)', fontFamily: FONT_BODY }}>{s.from} sent a gift</Text>
            <View style={[card, { alignItems: 'center' }]}>
              <Text style={{ fontSize: 80 }}>{s.emoji}</Text>
              <Text style={{ fontFamily: FONT_HEAVY, fontSize: 28, color: '#0F1419' }}>{s.label}</Text>
              {s.note ? <Text style={{ fontFamily: FONT_BODY, color: '#0F1419' }}>“{s.note}”</Text> : null}
            </View>
          </>}
          {s.kind === 'poll' && <>
            <Text style={{ color: 'rgba(255,255,255,.8)', fontFamily: FONT_BODY }}>This week’s polls</Text>
            <Text style={{ color: W, fontFamily: FONT_HEAVY, fontSize: 30, letterSpacing: -0.8 }}>Friends voted {first(p.name)}</Text>
            <View style={card}>
              <Text style={{ fontSize: 48 }}>{s.emoji ?? '✨'}</Text>
              <Text style={{ fontFamily: FONT_HEAVY, fontSize: 28, color: '#0F1419' }}>{s.label}</Text>
              <Text style={{ fontFamily: FONT_BODY, color: '#536471' }}>{s.question} · {s.n} votes</Text>
            </View>
          </>}
        </View>
        <Pressable style={{ position: 'absolute', left: 0, top: 120, bottom: 110, width: '35%' }} onPress={() => step(-1)} accessibilityLabel="Previous" />
        <Pressable style={{ position: 'absolute', right: 0, top: 120, bottom: 110, width: '35%' }} onPress={() => step(1)} accessibilityLabel="Next" />
        <Pressable onPress={() => { onSeen(p.id); onClose(); router.push(`/${p.username}`); }}
          style={{ alignSelf: 'flex-start', borderWidth: 1, borderColor: 'rgba(255,255,255,.4)', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 }}>
          <Text style={{ color: W, fontFamily: FONT_BOLD }}>View profile</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/* ─────────────── Toggles ─────────────── */
export function ToggleRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useC();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT_BOLD, fontSize: 15, color: c.ink }}>{label}</Text>
        {hint ? <Text style={{ fontFamily: FONT_BODY, fontSize: 13, color: c.muted }}>{hint}</Text> : null}
      </View>
      <View style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: value ? c.accent : c.line2, padding: 3, alignItems: value ? 'flex-end' : 'flex-start' }}>
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff' }} />
      </View>
    </Pressable>
  );
}
