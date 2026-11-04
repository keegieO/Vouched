'use client';
import { useState } from 'react';
import { APP_VERSION, FEEDBACK_KINDS, type FeedbackKind } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';

export function FeedbackForm({ from }: { from: string | null }) {
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < 3) return setErr('Tell us a little more.');
    setBusy(true); setErr(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('feedback').insert({
      user_id: user!.id, kind, body: body.trim(), platform: 'web', app_version: APP_VERSION,
      page: from ? from.slice(0, 200) : null,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setDone(true); setBody('');
  }

  if (done) return (
    <section className="card stack">
      <h3>Thank you</h3>
      <p className="muted">Got it. This goes straight to the team.</p>
      <button className="btn soft" style={{ alignSelf: 'flex-start' }} onClick={() => setDone(false)}>Send another</button>
    </section>
  );
  return (
    <form className="card stack" onSubmit={send}>
      <div className="chips" role="radiogroup" aria-label="Type">
        {(Object.keys(FEEDBACK_KINDS) as FeedbackKind[]).map(k => (
          <button key={k} type="button" className="chip" role="radio" aria-checked={kind === k} aria-pressed={kind === k} onClick={() => setKind(k)}>{FEEDBACK_KINDS[k]}</button>
        ))}
      </div>
      <label className="field"><span>{kind === 'bug' ? 'What happened, and what did you expect?' : 'What’s on your mind?'}</span>
        <textarea value={body} onChange={e => setBody(e.target.value)} maxLength={2000} style={{ minHeight: 140 }}
          placeholder={kind === 'bug' ? 'I tapped Give props and the screen froze on question 3…' : 'It would be great if…'} />
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Sending…' : 'Send feedback'}</button>
      <p className="hint">Version {APP_VERSION}</p>
    </form>
  );
}
