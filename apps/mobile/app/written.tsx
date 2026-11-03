import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { VOUCH_WITH_SUBJECT, type VouchWithSubject } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Avatar, Button, Empty, Panel, Row, Screen, T } from '@/components/ui';

const STATUS = { pending: 'Waiting for approval', approved: 'On their profile', hidden: 'Not shown' } as const;

export default function Written() {
  const { profile } = useAuth();
  const router = useRouter();
  const [list, setList] = useState<VouchWithSubject[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('vouches').select(VOUCH_WITH_SUBJECT).eq('author_id', profile.id).order('created_at', { ascending: false });
    setList((data ?? []) as unknown as VouchWithSubject[]);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen edges={[]}>
      <T v="muted">Editing a vouch sends it back for approval.</T>
      {list.length ? list.map(v => (
        <Panel key={v.id}>
          <Row style={{ flexWrap: 'nowrap', gap: 12 }}>
            <Avatar name={v.subject?.display_name ?? '?'} url={v.subject?.avatar_url} size={40} />
            <View style={{ flex: 1 }}>
              <T v="h3">{v.subject?.display_name ?? 'Deleted account'}</T>
              <T v="hint">{v.relationship} · {STATUS[v.status]}</T>
            </View>
          </Row>
          <T>{v.body}</T>
          {v.subject && (
            <Row>
              <Button small kind="ghost" title="Edit" onPress={() => router.push(`/${v.subject!.username}/vouch`)} />
              {confirm === v.id ? (
                <>
                  <Button small kind="danger" title="Yes, delete it" onPress={async () => { await supabase.from('vouches').delete().eq('id', v.id); setConfirm(null); load(); }} />
                  <Button small kind="ghost" title="Cancel" onPress={() => setConfirm(null)} />
                </>
              ) : <Button small kind="ghost" title="Delete" onPress={() => setConfirm(v.id)} />}
            </Row>
          )}
        </Panel>
      )) : <Empty>You haven’t vouched for anyone yet. Think of someone who deserves it.</Empty>}
    </Screen>
  );
}
