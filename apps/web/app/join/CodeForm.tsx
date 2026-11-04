'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizeCode } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';

/** Code entry. With `claim`, the signed-in user claims it right here (used on the setup screen). */
export function CodeForm({ claim = false, initialError }: { claim?: boolean; initialError?: string | null }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(initialError ?? null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const c = normalizeCode(code);
    if (c.length < 6) return setErr('Invite codes are 8 letters and numbers.');
    if (!claim) return router.push(`/join/${c}`);
    setBusy(true); setErr(null);
    const { error } = await createClient().rpc('claim_invite', { p_code: c });
    setBusy(false);
    if (error) return setErr(error.message);
    router.refresh();
  }
  return (
    <form className="stack" onSubmit={submit}>
      <label className="field"><span>Invite code</span>
        <input className="input" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="AB12CD34" autoCapitalize="characters" autoComplete="one-time-code" spellCheck={false}
          style={{ fontFamily: 'var(--f-logo)', letterSpacing: '.12em', fontSize: 20 }} />
      </label>
      {err && <p className="error" role="alert">{err}</p>}
      <button className="btn primary lg" disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
    </form>
  );
}
