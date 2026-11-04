'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

function Msg({ ok, text }: { ok: boolean; text: string }) {
  return <p className={ok ? 'success' : 'error'} role={ok ? 'status' : 'alert'}>{text}</p>;
}

export function AccountSettings({ email, phone, providers }: { email: string | null; phone: string | null; providers: string[] }) {
  const supabase = createClient();
  const router = useRouter();

  const [newEmail, setNewEmail] = useState('');
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [del, setDel] = useState('');
  const [delBusy, setDelBusy] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const e164 = (raw: string) => {
    const d = raw.replace(/\D/g, '');
    if (raw.trim().startsWith('+')) return '+' + d;
    return d.length === 10 ? '+1' + d : '+' + d;
  };

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ email: newEmail }, { emailRedirectTo: `${location.origin}/auth/callback?next=/settings` });
    setEmailMsg(error ? { ok: false, text: error.message } : { ok: true, text: `Check ${newEmail} for a confirmation link.` });
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setPwMsg({ ok: false, text: 'Use at least 8 characters.' });
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Password updated.' });
    if (!error) setPw('');
  }
  async function verifyPhone(e: React.FormEvent) {
    e.preventDefault();
    setPhoneMsg(null);
    if (!codeSent) {
      const { error } = await supabase.auth.updateUser({ phone: e164(newPhone) });
      if (error) return setPhoneMsg({ ok: false, text: error.message });
      setCodeSent(true);
      setPhoneMsg({ ok: true, text: 'We texted you a 6-digit code.' });
    } else {
      const { error } = await supabase.auth.verifyOtp({ phone: e164(newPhone), token: code.trim(), type: 'phone_change' });
      if (error) return setPhoneMsg({ ok: false, text: error.message });
      setPhoneMsg({ ok: true, text: 'Phone verified. Your profile now shows the mark.' });
      setCodeSent(false); setCode('');
      router.refresh();
    }
  }
  async function deleteAccount() {
    setDelBusy(true); setDelErr(null);
    const { error } = await supabase.rpc('delete_my_account');
    if (error) { setDelBusy(false); return setDelErr(error.message); }
    await supabase.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 4 }}>
        <span className="label">Signed in with</span>
        <p>{providers.length ? providers.map(p => p[0].toUpperCase() + p.slice(1)).join(', ') : 'Email'}{email ? ` · ${email}` : ''}{phone ? ` · +${phone.replace(/^\+/, '')}` : ''}</p>
      </div>

      <form className="stack" onSubmit={changeEmail}>
        <label className="field"><span>{email ? 'Change email' : 'Add an email'}</span>
          <input id="new-email" className="input" type="email" required value={newEmail} onChange={e => setNewEmail(e.target.value)} autoComplete="email" />
        </label>
        {emailMsg && <Msg {...emailMsg} />}
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }}>Send confirmation</button>
      </form>

      <form className="stack" onSubmit={changePassword}>
        <label className="field"><span>{providers.includes('email') ? 'Change password' : 'Set a password'}</span>
          <input id="new-pw" className="input" type="password" autoComplete="new-password" value={pw} onChange={e => setPw(e.target.value)} />
        </label>
        {pwMsg && <Msg {...pwMsg} />}
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }}>Save password</button>
      </form>

      <form className="stack" onSubmit={verifyPhone}>
        <label className="field"><span>{phone ? 'Change verified phone' : 'Verify your phone'}</span>
          <input id="verify-phone" className="input" type="tel" required placeholder="(317) 555-0123" value={newPhone} disabled={codeSent} onChange={e => setNewPhone(e.target.value)} autoComplete="tel" />
          <span className="hint">Adds a “Phone verified” mark to your profile and your vouches. Your number is never shown.</span>
        </label>
        {codeSent && (
          <label className="field"><span>6-digit code</span>
            <input id="verify-code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} />
          </label>
        )}
        {phoneMsg && <Msg {...phoneMsg} />}
        <button className="btn sm ghost" style={{ alignSelf: 'flex-start' }}>{codeSent ? 'Verify code' : 'Text me a code'}</button>
      </form>

      <form action="/auth/signout" method="post">
        <button className="btn ghost">Log out</button>
      </form>

      <div id="delete" className="stack" style={{ borderTop: '1px solid var(--line)', paddingTop: 18 }}>
        <h3>Delete account</h3>
        <p className="hint">This removes your profile, every vouch you received, and every vouch you wrote. It can’t be undone.</p>
        <label className="field"><span>Type DELETE to confirm</span>
          <input id="delete-confirm" className="input" value={del} onChange={e => setDel(e.target.value)} />
        </label>
        {delErr && <Msg ok={false} text={delErr} />}
        <button className="btn danger" style={{ alignSelf: 'flex-start' }} disabled={del !== 'DELETE' || delBusy} onClick={deleteAccount}>
          {delBusy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </div>
  );
}

export function BlockedList({ blocked }: { blocked: { id: string; name: string; username: string }[] }) {
  const router = useRouter();
  if (!blocked.length) return <p className="hint">You haven’t blocked anyone.</p>;
  return (
    <div className="stack">
      {blocked.map(b => (
        <div key={b.id} className="row between">
          <span>{b.name}{b.username && <span className="hint"> @{b.username}</span>}</span>
          <button className="btn sm ghost" onClick={async () => {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', b.id);
            router.refresh();
          }}>Unblock</button>
        </div>
      ))}
    </div>
  );
}
