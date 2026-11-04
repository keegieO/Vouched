'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function ReportActions({ id, hasVouch, canRemove }: { id: string; hasVouch: boolean; canRemove: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function act(action: string) {
    setBusy(action); setErr(null);
    const { error } = await createClient().rpc('admin_resolve_report', { p_report: id, p_action: action, p_note: note.trim() || null });
    setBusy(null);
    if (error) return setErr(error.message);
    router.refresh();
  }
  return (
    <div className="stack" style={{ gap: 8 }}>
      <input className="input" placeholder="Note (optional, only admins see it)" value={note} onChange={e => setNote(e.target.value)} maxLength={500} />
      {err && <p className="error">{err}</p>}
      {confirm ? (
        <div className="row">
          <span className="small"><b>Remove this member?</b> It counts against everyone who backed them.</span>
          <button className="btn sm danger" disabled={!!busy} onClick={() => act('remove_member')}>Yes, remove</button>
          <button className="btn sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
        </div>
      ) : (
        <div className="row">
          <button className="btn sm soft" disabled={!!busy} onClick={() => act('dismiss')}>Dismiss</button>
          {hasVouch && <button className="btn sm soft" disabled={!!busy} onClick={() => act('hide_vouch')}>Hide vouch</button>}
          {hasVouch && <button className="btn sm soft" disabled={!!busy} onClick={() => act('delete_vouch')}>Delete vouch</button>}
          {canRemove && <button className="btn sm danger" disabled={!!busy} onClick={() => setConfirm(true)}>Remove member</button>}
        </div>
      )}
    </div>
  );
}

export function StandingForm() {
  const router = useRouter();
  const [u, setU] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function go(standing: 'removed' | 'good') {
    const supabase = createClient();
    const name = u.trim().replace(/^@/, '').toLowerCase();
    const { data: p } = await supabase.from('profiles').select('id, display_name').eq('username', name).maybeSingle();
    if (!p) return setMsg({ ok: false, text: 'No member with that username.' });
    const { error } = await supabase.rpc('admin_set_standing', { p_user: p.id, p_standing: standing });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${p.display_name} is now ${standing === 'removed' ? 'removed' : 'back in good standing'}.` });
    router.refresh();
  }
  return (
    <section className="card stack">
      <input className="input" placeholder="username" value={u} onChange={e => setU(e.target.value)} autoCapitalize="none" spellCheck={false} />
      {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
      <div className="row">
        <button className="btn sm danger" disabled={!u.trim()} onClick={() => go('removed')}>Remove</button>
        <button className="btn sm soft" disabled={!u.trim()} onClick={() => go('good')}>Restore</button>
      </div>
    </section>
  );
}
