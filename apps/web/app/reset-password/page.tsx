'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui';

export default function ResetPassword() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) return setError('Use a password with at least 8 characters.');
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    router.replace('/feed');
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Logo />
        <h1 style={{ fontSize: 34 }}>Choose a new password</h1>
        {error && <p className="error" role="alert">{error}</p>}
        <label className="field"><span>New password</span>
          <input id="new-password" className="input" type="password" autoComplete="new-password" required value={pw} onChange={e => setPw(e.target.value)} />
        </label>
        <button className="btn primary block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </main>
  );
}
