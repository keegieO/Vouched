'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { inviteLink, inviteText } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { CopyButton } from '@/components/client';
import { Icon } from '@/components/Icon';

export function InviteForm({ inviterFirst, site }: { inviterFirst: string; site: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState<{ code: string; name: string } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr('Add their name.');
    setBusy(true); setErr(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from('invites')
      .insert({ inviter_id: user!.id, invitee_name: name.trim(), contact: contact.trim() || null }).select('code').single();
    setBusy(false);
    if (error) return setErr(error.message);
    setMade({ code: data.code as string, name: name.trim() });
    setName(''); setContact('');
    router.refresh();
  }

  if (made) {
    const text = inviteText(site, made.code, inviterFirst);
    const isPhone = /^[\d\s()+.-]{7,}$/.test(contact);
    return (
      <section className="card stack">
        <h3>Invite ready for {made.name.split(' ')[0]}</h3>
        <p className="muted small">Send this. The code works once and expires in 30 days.</p>
        <p style={{ background: 'var(--sunk)', borderRadius: 14, padding: 12, overflowWrap: 'anywhere' }}>{text}</p>
        <div className="row">
          <a className="btn primary" href={`sms:${isPhone ? contact : ''}?&body=${encodeURIComponent(text)}`}><Icon name="msg" size="sm" /> Text it</a>
          <CopyButton text={text} label="Copy message" className="btn soft" />
          <CopyButton text={inviteLink(site, made.code)} label="Copy link" className="btn ghost" />
        </div>
        <button className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setMade(null)}>Invite someone else</button>
      </section>
    );
  }
  return (
    <form className="card stack" onSubmit={submit}>
      <label className="field"><span>Their name</span><input className="input" maxLength={50} value={name} onChange={e => setName(e.target.value)} placeholder="Alex Kim" autoComplete="off" /></label>
      <label className="field"><span>Their phone or email (optional, only you see it)</span><input className="input" maxLength={80} value={contact} onChange={e => setContact(e.target.value)} placeholder="(317) 555-0123" autoComplete="off" /></label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn primary" disabled={busy}><Icon name="ticket" size="sm" /> {busy ? 'Creating…' : 'Create invite'}</button>
      <p className="hint">Only invite people you know in real life.</p>
    </form>
  );
}

export function CancelInvite({ id }: { id: string }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button className="iconbtn" aria-label="Cancel invite" disabled={busy}
      onClick={async () => { setBusy(true); await supabase.from('invites').delete().eq('id', id); router.refresh(); }}>
      <Icon name="x" size="sm" />
    </button>
  );
}
