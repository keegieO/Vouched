'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Logo } from '@/components/ui';
import { safeNext } from '@/lib/site';

type Method = 'email' | 'phone';
type EmailMode = 'signin' | 'signup' | 'reset';

function toE164(raw: string) {
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  const d = digits.replace(/\D/g, '');
  if (d.length === 10) return '+1' + d;           // US default
  if (d.length === 11 && d.startsWith('1')) return '+' + d;
  return '+' + d;
}

export function LoginForm() {
  const params = useSearchParams();
  const router = useRouter();
  const next = safeNext(params.get('next'));
  const supabase = createClient();

  const [method, setMethod] = useState<Method>('email');
  const [mode, setMode] = useState<EmailMode>(params.get('mode') === 'signup' ? 'signup' : 'signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get('error'));
  const [notice, setNotice] = useState<string | null>(null);

  const callback = (n: string) => `${window.location.origin}/auth/callback?next=${encodeURIComponent(n)}`;
  const go = () => router.replace(`/auth/continue?next=${encodeURIComponent(next)}`);

  async function oauth(provider: 'google' | 'apple') {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callback(next) } });
    if (error) setError(error.message);
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        go();
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callback(next) } });
        if (error) throw error;
        if (data.session) go();
        else setNotice(`We sent a link to ${email}. Open it to finish signing up.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callback('/reset-password') });
        if (error) throw error;
        setNotice(`If ${email} has an account, a reset link is on its way.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const p = toE164(phone);
      if (!codeSent) {
        const { error } = await supabase.auth.signInWithOtp({ phone: p });
        if (error) throw error;
        setCodeSent(true);
        setNotice(`We texted a 6-digit code to ${p}.`);
      } else {
        const { error } = await supabase.auth.verifyOtp({ phone: p, token: code.trim(), type: 'sms' });
        if (error) throw error;
        go();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const title = mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back';

  return (
    <main className="auth-wrap">
      <div className="auth-card">
        <Logo />
        <h1 style={{ fontSize: 34 }}>{title}</h1>

        {mode !== 'reset' && (
          <div className="stack" style={{ gap: 10 }}>
            <button className="btn oauth" type="button" onClick={() => oauth('google')}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Continue with Google
            </button>
            <button className="btn oauth" type="button" onClick={() => oauth('apple')}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.4 2-3.6 2.1-3.7-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9s-1.9-.9-3.2-.8c-1.6 0-3.1 1-4 2.4-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8s1.9.8 3.2.8 2.1-1.2 2.9-2.4c.9-1.4 1.3-2.7 1.3-2.8 0 0-2.4-1-2.4-3.9zM14 5.4c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1.1.1 2.1-.6 2.8-1.4z"/></svg>
              Continue with Apple
            </button>
            <div className="divider">or</div>
            <div className="segmented" role="group" aria-label="Sign-in method">
              <button type="button" aria-pressed={method === 'email'} onClick={() => { setMethod('email'); setError(null); setNotice(null); }}>Email</button>
              <button type="button" aria-pressed={method === 'phone'} onClick={() => { setMethod('phone'); setError(null); setNotice(null); }}>Phone</button>
            </div>
          </div>
        )}

        {error && <p className="error" role="alert">{error}</p>}
        {notice && <p className="success" role="status">{notice}</p>}

        {method === 'email' || mode === 'reset' ? (
          <form className="stack" onSubmit={submitEmail}>
            <label className="field"><span>Email</span>
              <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} />
            </label>
            {mode !== 'reset' && (
              <label className="field"><span>Password</span>
                <input id="password" className="input" type="password" required minLength={mode === 'signup' ? 8 : undefined}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} />
                {mode === 'signup' && <span className="hint">At least 8 characters.</span>}
              </label>
            )}
            <button className="btn primary block" disabled={busy}>
              {busy ? 'One sec…' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Log in'}
            </button>
            <div className="row between small">
              {mode === 'signin' && <button type="button" className="btn sm ghost" onClick={() => setMode('reset')}>Forgot password?</button>}
              {mode === 'reset' && <button type="button" className="btn sm ghost" onClick={() => setMode('signin')}>Back to log in</button>}
              {mode !== 'reset' && (
                <button type="button" className="btn sm ghost" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}>
                  {mode === 'signin' ? 'New here? Create an account' : 'Have an account? Log in'}
                </button>
              )}
            </div>
          </form>
        ) : (
          <form className="stack" onSubmit={submitPhone}>
            <label className="field"><span>Mobile number</span>
              <input id="phone" className="input" type="tel" autoComplete="tel" required placeholder="(317) 555-0123" value={phone}
                disabled={codeSent} onChange={e => setPhone(e.target.value)} />
            </label>
            {codeSent && (
              <label className="field"><span>6-digit code</span>
                <input id="code" className="input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={e => setCode(e.target.value)} />
              </label>
            )}
            <button className="btn primary block" disabled={busy}>{busy ? 'One sec…' : codeSent ? 'Verify and continue' : 'Text me a code'}</button>
            {codeSent && <button type="button" className="btn sm ghost" onClick={() => { setCodeSent(false); setCode(''); setNotice(null); }}>Use a different number</button>}
            <span className="hint">Phone sign-ups get a “Phone verified” mark on their profile.</span>
          </form>
        )}

        <p className="hint">By continuing you agree to the <Link href="/terms">Terms</Link> and <Link href="/privacy">Privacy policy</Link>, and confirm you are 18 or older.</p>
      </div>
    </main>
  );
}
