import { useState } from 'react';
import { Platform } from 'react-native';
import { APP_VERSION, FEEDBACK_KINDS, type FeedbackKind } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { Banner, Button, Chip, ErrorText, Field, Panel, Row, Screen, T } from '@/components/ui';

export default function Feedback() {
  const { profile } = useAuth();
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send() {
    if (!profile) return;
    if (body.trim().length < 3) return setErr('Tell us a little more.');
    setBusy(true); setErr(null);
    const { error } = await supabase.from('feedback').insert({
      user_id: profile.id, kind, body: body.trim(), platform: Platform.OS === 'ios' ? 'ios' : 'android', app_version: APP_VERSION,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true); setBody('');
  }

  return (
    <Screen edges={[]}>
      <T v="muted">You’re one of the first people on Vouched. Tell us what broke, what confused you, or what you wish it did. We read every one.</T>
      {done && <Banner tone="good">Thank you. This goes straight to the team.</Banner>}
      <Panel>
        <Row style={{ gap: 6 }}>
          {(Object.keys(FEEDBACK_KINDS) as FeedbackKind[]).map(k => <Chip key={k} label={FEEDBACK_KINDS[k]} selected={kind === k} onPress={() => setKind(k)} />)}
        </Row>
        <Field label={kind === 'bug' ? 'What happened, and what did you expect?' : 'What’s on your mind?'} value={body} onChangeText={setBody}
          multiline maxLength={2000} style={{ minHeight: 140, textAlignVertical: 'top' }}
          placeholder={kind === 'bug' ? 'I tapped Give props and the screen froze on question 3…' : 'It would be great if…'} />
        <ErrorText>{err}</ErrorText>
        <Button title="Send feedback" busy={busy} onPress={send} />
        <T v="hint">Version {APP_VERSION}</T>
      </Panel>
    </Screen>
  );
}
