import { useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { REPORT_REASONS, type ReportReason } from '@vouched/shared';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Button, ErrorText, Field, T, useC } from './ui';

export function ReportSheet({ target, onClose }: { target: { vouchId?: string; profileId?: string } | null; onClose: () => void }) {
  const c = useC();
  const { session } = useAuth();
  const [reason, setReason] = useState<ReportReason>('fake');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!session || !target) return;
    setState('sending'); setError(null);
    const { error } = await supabase.from('reports').insert({
      reporter_id: session.user.id, vouch_id: target.vouchId ?? null, profile_id: target.profileId ?? null, reason, details: details || null,
    });
    if (error) { setState('idle'); setError(error.message); } else setState('sent');
  }
  function close() { setState('idle'); setDetails(''); setError(null); onClose(); }

  return (
    <Modal visible={!!target} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(10,13,23,.5)' }} onPress={close} />
      <View style={{ backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, gap: 14, paddingBottom: 40 }}>
        {state === 'sent' ? (
          <>
            <T v="h2">Thanks for telling us</T>
            <T v="muted">We review every report. If it breaks the rules, we remove it.</T>
            <Button title="Done" onPress={close} />
          </>
        ) : (
          <>
            <T v="h2">Report {target?.vouchId ? 'this vouch' : 'this profile'}</T>
            {!session ? <T v="muted">Log in to report.</T> : (
              <>
                {(Object.keys(REPORT_REASONS) as ReportReason[]).map(r => (
                  <Pressable key={r} onPress={() => setReason(r)} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }} accessibilityRole="radio" accessibilityState={{ checked: reason === r }}>
                    <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: reason === r ? c.accent : c.line, alignItems: 'center', justifyContent: 'center' }}>
                      {reason === r && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.accent }} />}
                    </View>
                    <Text style={{ color: c.ink, fontSize: 15, flex: 1 }}>{REPORT_REASONS[r]}</Text>
                  </Pressable>
                ))}
                <Field label="Anything else? (optional)" value={details} onChangeText={setDetails} maxLength={500} multiline style={{ minHeight: 70 }} />
                <ErrorText>{error}</ErrorText>
                <Button title="Send report" onPress={send} busy={state === 'sending'} />
              </>
            )}
            <Button title="Cancel" kind="ghost" onPress={close} />
          </>
        )}
      </View>
    </Modal>
  );
}
