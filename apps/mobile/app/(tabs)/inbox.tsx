import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { NOTIFICATION_TEXT, VIBE_PROMPTS, timeAgo, type NotificationType } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useVouches } from '@/lib/hooks';
import { ReportSheet } from '@/components/ReportSheet';
import { Avatar, Banner, Button, Empty, FONT_BODY, FONT_BOLD, Panel, Row, Screen, T, VouchCard, useC } from '@/components/ui';
import { ListRow } from '@/components/v2';

type Tab = 'pending' | 'hidden' | 'activity' | 'notes';
type Mini = { username: string; display_name: string; avatar_url: string | null } | null;
type Notif = { id: string; type: NotificationType; read: boolean; created_at: string; request_id: string | null;
  meta: { emoji?: string; label?: string; text?: string } | null;
  prompt: { question: string; label: string; emoji: string | null } | null;
  actor: { username: string; display_name: string; avatar_url: string | null } | null };

export default function Inbox() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const [tab, setTab] = useState<Tab>('activity');
  const [weekN, setWeekN] = useState(0);
  const [views, setViews] = useState(0);
  const [due, setDue] = useState<{ subject_id: string; display_name: string } | null>(null);
  const [dueDone, setDueDone] = useState<string | null>(null);
  const [vibes, setVibes] = useState<{ id: string; prompt: number; body: string; author: Mini }[]>([]);
  const [notes, setNotes] = useState<{ id: string; body: string; created_at: string; sender: Mini }[]>([]);
  const pending = useVouches(profile?.id, 'pending');
  const hidden = useVouches(profile?.id, 'hidden');
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [reqs, setReqs] = useState<{ id: string; created_at: string; requester: { username: string; display_name: string; avatar_url: string | null } | null }[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [blockId, setBlockId] = useState<string | null>(null);
  const [report, setReport] = useState<{ vouchId: string } | null>(null);

  const loadNotifs = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('notifications')
      .select('id, type, read, created_at, request_id, meta, prompt:prompts(question, label, emoji), actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50);
    setNotifs((data ?? []) as unknown as Notif[]);
    const { data: r } = await supabase.from('vouch_requests').select('id, created_at, requester:profiles!vouch_requests_requester_id_fkey(username, display_name, avatar_url)')
      .eq('recipient_id', profile.id).eq('done', false).order('created_at', { ascending: false });
    setReqs(((r ?? []) as unknown as typeof reqs).filter(x => x.requester));
    const [w, v, d, vb, pn] = await Promise.all([
      supabase.rpc('my_week'), supabase.rpc('my_profile_views', { days: 7 }), supabase.rpc('vouch_again_due'),
      supabase.from('vibe_answers').select('id, prompt, body, author:profiles!vibe_answers_author_id_fkey(username, display_name, avatar_url)').eq('subject_id', profile.id).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('private_notes').select('id, body, created_at, sender:profiles!private_notes_sender_id_fkey(username, display_name, avatar_url)').eq('recipient_id', profile.id).order('created_at', { ascending: false }).limit(20),
    ]);
    setWeekN(((w.data ?? []) as { n: number }[]).reduce((n, x) => n + Number(x.n), 0));
    setViews((v.data as number | null) ?? 0);
    setDue(((d.data ?? []) as { subject_id: string; display_name: string }[])[0] ?? null);
    setVibes((vb.data ?? []) as unknown as typeof vibes);
    setNotes((pn.data ?? []) as unknown as typeof notes);
  }, [profile]);
  useFocusEffect(useCallback(() => { loadNotifs(); }, [loadNotifs]));

  async function act(id: string, fn: () => PromiseLike<{ error: { message: string } | null }>, done: string) {
    setBusyId(id); setMsg(null);
    const { error } = await fn();
    setBusyId(null);
    setMsg(error ? error.message : done);
    pending.reload(); hidden.reload();
  }
  const setStatus = (id: string, s: 'approved' | 'hidden') => () => supabase.rpc('set_vouch_status', { p_vouch_id: id, p_status: s });

  async function openActivity() {
    setTab('activity');
    if (profile && notifs.some(n => !n.read)) {
      await supabase.from('notifications').update({ read: true }).eq('user_id', profile.id).eq('read', false);
      setTimeout(loadNotifs, 1200);
    }
  }

  const unread = notifs.filter(n => !n.read).length;
  const tabs: [Tab, string][] = [['activity', `Activity${unread + reqs.length ? ` (${unread + reqs.length})` : ''}`], ['pending', `Review (${pending.vouches.length + vibes.length})`], ['notes', 'Private'], ['hidden', 'Hidden']];

  return (
    <Screen>
      <T v="h1">Activity</T>
      <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 }}>
        {tabs.map(([t, label]) => (
          <Pressable key={t} onPress={() => (t === 'activity' ? openActivity() : setTab(t))} accessibilityState={{ selected: tab === t }}
            style={{ flex: 1, padding: 9, borderRadius: 9, alignItems: 'center', backgroundColor: tab === t ? c.card : 'transparent' }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: tab === t ? c.ink : c.muted }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      {msg && <Banner tone="good">{msg}</Banner>}

      {tab === 'pending' && (pending.vouches.length ? pending.vouches.map(v => (
        <VouchCard key={v.id} v={v} onReport={() => setReport({ vouchId: v.id })}
          onAuthorPress={v.author ? () => router.push(`/${v.author!.username}`) : undefined}
          footer={blockId === v.id ? (
            <View style={{ gap: 8 }}>
              <T v="hint">Block this person? They won’t be able to vouch for you, and this vouch will be hidden.</T>
              <Row>
                <Button small kind="danger" title="Block" busy={busyId === v.id} onPress={() => act(v.id, async () => {
                  const b = await supabase.from('blocks').insert({ blocker_id: profile!.id, blocked_id: v.author_id });
                  if (b.error && b.error.code !== '23505') return b;
                  setBlockId(null);
                  return supabase.rpc('set_vouch_status', { p_vouch_id: v.id, p_status: 'hidden' });
                }, 'Blocked. They can’t vouch for you again.')} />
                <Button small kind="ghost" title="Cancel" onPress={() => setBlockId(null)} />
              </Row>
            </View>
          ) : (
            <Row style={{ flexWrap: 'nowrap' }}>
              <Button small title="Add to profile" style={{ flex: 1 }} busy={busyId === v.id} onPress={() => act(v.id, setStatus(v.id, 'approved'), 'Added to your profile')} />
              <Button small kind="ghost" title="Hide" style={{ flex: 1 }} disabled={busyId === v.id} onPress={() => act(v.id, setStatus(v.id, 'hidden'), 'Kept hidden. Only you can see it.')} />
              <Button small kind="ghost" title="Block" onPress={() => setBlockId(v.id)} />
            </Row>
          )} />
      )) : <Empty>You’re all caught up. New vouches land here first.</Empty>)}

      {tab === 'hidden' && (hidden.vouches.length ? hidden.vouches.map(v => (
        <VouchCard key={v.id} v={v} footer={
          <Row style={{ flexWrap: 'nowrap' }}>
            <Button small title="Add to profile" style={{ flex: 1 }} busy={busyId === v.id} onPress={() => act(v.id, setStatus(v.id, 'approved'), 'Added to your profile')} />
            <Button small kind="danger" title="Delete" style={{ flex: 1 }} disabled={busyId === v.id} onPress={() => act(v.id, () => supabase.from('vouches').delete().eq('id', v.id), 'Deleted')} />
          </Row>
        } />
      )) : <Empty>No hidden vouches.</Empty>)}

      {tab === 'activity' && (
        <View style={{ marginHorizontal: -16 }}>
          {weekN > 0 && <ListRow icon="🎁" title="Your weekly results are ready" sub={`Friends voted you ${weekN} ${weekN === 1 ? 'time' : 'times'} this week`} onPress={() => router.push('/week')} unread />}
          <ListRow icon="👀" title={`${views} people viewed your profile this week`} sub="Names stay private" />
          {due && <ListRow icon="🤝" title={`Would you still vouch for ${due.display_name}?`} sub={dueDone ?? 'Private. Only counts in their score.'}
            right={dueDone ? undefined : <Row style={{ gap: 6 }}>
              <Button small kind="ghost" title="Yes" onPress={async () => { await supabase.rpc('answer_vouch_again', { p_subject: due.subject_id, p_yes: true }); setDueDone('Thanks. Kept private.'); }} />
              <Button small kind="ghost" title="No" onPress={async () => { await supabase.rpc('answer_vouch_again', { p_subject: due.subject_id, p_yes: false }); setDueDone('Got it. Kept private.'); }} />
            </Row>} />}
        </View>
      )}

      {tab === 'pending' && vibes.length > 0 && (
        <Panel style={{ gap: 0 }}>
          <T v="label">Vibe answers</T>
          {vibes.map((v, i) => (
            <View key={v.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              <Avatar name={v.author?.display_name ?? '?'} url={v.author?.avatar_url} size={40} />
              <View style={{ flex: 1 }}><T style={{ fontFamily: FONT_BOLD }}>{v.author?.display_name ?? 'Someone'}</T><T v="hint">{VIBE_PROMPTS[v.prompt]}: “{v.body}”</T></View>
              <Button small title="Show" onPress={async () => { await supabase.rpc('set_vibe_status', { p_id: v.id, p_status: 'shown' }); loadNotifs(); }} />
              <Button small kind="ghost" title="✕" onPress={async () => { await supabase.rpc('set_vibe_status', { p_id: v.id, p_status: 'hidden' }); loadNotifs(); }} />
            </View>
          ))}
        </Panel>
      )}

      {tab === 'notes' && (notes.length ? (
        <Panel style={{ gap: 0 }}>
          <T v="hint">Private feedback from people you know. Only you can see it.</T>
          {notes.map(n => (
            <View key={n.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: c.line }}>
              <Avatar name={n.sender?.display_name ?? '?'} url={n.sender?.avatar_url} size={40} />
              <View style={{ flex: 1 }}>
                <T style={{ fontFamily: FONT_BOLD }}>{n.sender?.display_name ?? 'Someone'} <T v="hint">· {timeAgo(n.created_at)}</T></T>
                <T>{n.body}</T>
              </View>
            </View>
          ))}
        </Panel>
      ) : <Empty>No private feedback. When someone sends you some, only you will see it here.</Empty>)}

      {tab === 'activity' && reqs.length > 0 && (
        <Panel style={{ gap: 0 }}>
          <T v="label">Asked you for a vouch</T>
          {reqs.map((r, i) => (
            <View key={r.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              <Avatar name={r.requester!.display_name} url={r.requester!.avatar_url} size={40} />
              <View style={{ flex: 1 }}><T style={{ fontWeight: '700' }}>{r.requester!.display_name}</T><T v="hint">{timeAgo(r.created_at)}</T></View>
              <Button small title="Vouch" onPress={() => router.push(`/${r.requester!.username}/vouch`)} />
              <Button small kind="ghost" title="✕" onPress={async () => { await supabase.from('vouch_requests').delete().eq('id', r.id); loadNotifs(); }} />
            </View>
          ))}
        </Panel>
      )}

      {tab === 'activity' && (notifs.length ? (
        <Panel style={{ gap: 0 }}>
          {notifs.map((n, i) => (
            <Pressable key={n.id} onPress={() => n.request_id ? router.push(`/requests/${n.request_id}`) : n.type === 'vibe' || n.type === 'new_vouch' ? setTab('pending') : n.type === 'private_note' ? setTab('notes') : n.actor ? router.push(`/${n.actor.username}`) : undefined}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              {n.type === 'props'
                ? <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.hi, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 18 }}>{n.prompt?.emoji ?? '✨'}</Text></View>
                : <Avatar name={n.actor?.display_name ?? '?'} url={n.actor?.avatar_url} size={40} />}
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: n.read ? '500' : '700' }}>
                  {n.type === 'props' ? `Someone picked you for “${n.prompt?.label ?? 'a poll'}”` : `${n.actor?.display_name ?? 'Someone'} ${NOTIFICATION_TEXT[n.type] ?? ''}${n.type === 'gift' && n.meta ? ` ${n.meta.emoji ?? ''} ${n.meta.label ?? ''}` : ''}${n.type === 'reaction' && n.meta?.emoji ? ` ${n.meta.emoji}` : ''}`}
                </T>
                {n.type === 'props' && n.prompt ? <T v="hint">{n.prompt.question}</T> : null}
                {n.type === 'comment' && n.meta?.text ? <T v="hint">“{n.meta.text}”</T> : null}
                <T v="hint">{timeAgo(n.created_at)}</T>
              </View>
            </Pressable>
          ))}
        </Panel>
      ) : <Empty>No activity yet.</Empty>)}
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </Screen>
  );
}
