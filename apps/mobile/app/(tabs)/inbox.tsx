import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { NOTIFICATION_TEXT, timeAgo, type NotificationType } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useVouches } from '@/lib/hooks';
import { ReportSheet } from '@/components/ReportSheet';
import { Avatar, Banner, Button, Empty, Panel, Row, Screen, T, VouchCard, useC } from '@/components/ui';

type Tab = 'pending' | 'hidden' | 'activity';
type Notif = { id: string; type: NotificationType; read: boolean; created_at: string; request_id: string | null;
  actor: { username: string; display_name: string; avatar_url: string | null } | null };

export default function Inbox() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const [tab, setTab] = useState<Tab>('pending');
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
      .select('id, type, read, created_at, request_id, actor:profiles!notifications_actor_id_fkey(username, display_name, avatar_url)')
      .eq('user_id', profile.id).order('created_at', { ascending: false }).limit(50);
    setNotifs((data ?? []) as unknown as Notif[]);
    const { data: r } = await supabase.from('vouch_requests').select('id, created_at, requester:profiles!vouch_requests_requester_id_fkey(username, display_name, avatar_url)')
      .eq('recipient_id', profile.id).eq('done', false).order('created_at', { ascending: false });
    setReqs(((r ?? []) as unknown as typeof reqs).filter(x => x.requester));
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
  const tabs: [Tab, string][] = [['activity', `Activity${unread + reqs.length ? ` (${unread + reqs.length})` : ''}`], ['pending', `Review (${pending.vouches.length})`], ['hidden', `Hidden (${hidden.vouches.length})`]];

  return (
    <Screen>
      <T v="h1">Activity</T>
      <T v="muted">Nothing shows on your profile until you approve it. Hidden vouches stay private.</T>
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
            <Pressable key={n.id} onPress={() => n.request_id ? router.push(`/requests/${n.request_id}`) : n.actor && router.push(`/${n.actor.username}`)}
              style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 12, borderTopWidth: i ? 1 : 0, borderColor: c.line }}>
              <Avatar name={n.actor?.display_name ?? '?'} url={n.actor?.avatar_url} size={40} />
              <View style={{ flex: 1 }}>
                <T style={{ fontWeight: n.read ? '500' : '700' }}>
                  {n.actor?.display_name ?? 'Someone'} {NOTIFICATION_TEXT[n.type]}
                </T>
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
