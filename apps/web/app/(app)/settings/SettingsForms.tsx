'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEFAULT_SETTINGS, THEMES, type Profile, type ThemeKey, type UserSettings } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { Icon } from '@/components/Icon';
import { useToast } from '@/components/client';

export function LogoutRow() {
  return (
    <form action="/auth/signout" method="post" style={{ margin: 0 }}>
      <button className="li" type="submit"><span className="ico"><Icon name="logout" size="sm" /></span><span className="grow">Log out</span></button>
    </form>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" className="toggle" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
}

export function PrivacyForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [toast, show] = useToast();
  const [p, setP] = useState({ who: profile.who_can_vouch ?? 'everyone', discoverable: profile.discoverable ?? true, show_counts: profile.show_counts ?? true, allow_cosigns: profile.allow_cosigns ?? true });

  async function save(patch: Partial<typeof p>) {
    const next = { ...p, ...patch };
    setP(next);
    const { error } = await createClient().from('profiles').update({
      who_can_vouch: next.who, discoverable: next.discoverable, show_counts: next.show_counts, allow_cosigns: next.allow_cosigns,
    }).eq('id', profile.id);
    if (error) { show(error.message); setP(p); } else { show('Saved'); router.refresh(); }
  }
  const opt = (k: 'everyone' | 'following' | 'nobody', label: string, sub: string) => (
    <button type="button" className="li radio-li" role="radio" aria-checked={p.who === k} onClick={() => save({ who: k })}>
      <span className="grow">{label}<br /><span className="hint">{sub}</span></span><span className="radio" />
    </button>
  );
  const tg = (k: 'discoverable' | 'show_counts' | 'allow_cosigns', label: string, sub: string) => (
    <div className="li static"><span className="grow">{label}<br /><span className="hint">{sub}</span></span><Toggle on={p[k]} label={label} onChange={v => save({ [k]: v })} /></div>
  );
  return (
    <>
      {toast}
      <span className="label list-head">Who can vouch for me</span>
      <section className="list" role="radiogroup" aria-label="Who can vouch for me">
        {opt('everyone', 'Everyone', 'Anyone with an account can send you a vouch to review.')}
        {opt('following', 'People I follow', 'Only people you follow can vouch.')}
        {opt('nobody', 'Paused', 'No new vouches. Your approved ones stay up.')}
      </section>
      <span className="label list-head">Profile</span>
      <section className="list">
        {tg('discoverable', 'Show me in Discover', 'People can find you by name, skill and city.')}
        {tg('show_counts', 'Show follower counts', 'Others see your followers and following.')}
        {tg('allow_cosigns', 'Allow co-signs', 'People who know you can back up your vouches.')}
      </section>
      <p className="hint" style={{ padding: '0 4px' }}>Your email and phone number are never shown on your profile.</p>
    </>
  );
}

export function NotificationsForm({ userId, initial }: { userId: string; initial: UserSettings | null }) {
  const [toast, show] = useToast();
  const [s, setS] = useState({ ...DEFAULT_SETTINGS, ...(initial ?? {}) });
  async function set(k: keyof typeof DEFAULT_SETTINGS, v: boolean) {
    const next = { ...s, [k]: v };
    setS(next);
    const { error } = await createClient().from('user_settings').upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() });
    show(error ? error.message : 'Saved');
  }
  const tg = (k: keyof typeof DEFAULT_SETTINGS, label: string, sub?: string) => (
    <div className="li static"><span className="grow">{label}{sub && <><br /><span className="hint">{sub}</span></>}</span><Toggle on={s[k]} label={label} onChange={v => set(k, v)} /></div>
  );
  return (
    <>
      {toast}
      <span className="label list-head">Notifications</span>
      <section className="list">
        {tg('notify_vouches', 'New vouches', 'When someone writes you a vouch')}
        {tg('notify_requests', 'Vouch requests', 'When someone asks you for a vouch')}
        {tg('notify_follows', 'New followers')}
        {tg('notify_cosigns', 'Co-signs and replies')}
        {tg('notify_recs', 'Recommendations', 'Answers to your asks, and when you’re recommended')}
        {tg('notify_props', 'Props', 'When someone picks you (always anonymous)')}
      </section>
      <span className="label list-head">Email</span>
      <section className="list">{tg('email_weekly', 'Weekly summary', 'Your new vouches and activity, once a week')}</section>
    </>
  );
}

export const THEME_KEY = 'vouched-theme';

export function AppearanceForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [mode, setMode] = useState<'system' | 'light' | 'dark'>('system');
  const [accent, setAccent] = useState<ThemeKey>(profile.theme);
  useEffect(() => {
    try { const m = localStorage.getItem(THEME_KEY); if (m === 'light' || m === 'dark') setMode(m); } catch {}
  }, []);
  function pick(m: 'system' | 'light' | 'dark') {
    setMode(m);
    try { if (m === 'system') localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, m); } catch {}
    if (m === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', m);
  }
  async function pickAccent(k: ThemeKey) {
    setAccent(k);
    await createClient().from('profiles').update({ theme: k }).eq('id', profile.id);
    router.refresh();
  }
  const opt = (k: 'system' | 'light' | 'dark', label: string) => (
    <button type="button" className="li radio-li" role="radio" aria-checked={mode === k} onClick={() => pick(k)}><span className="grow">{label}</span><span className="radio" /></button>
  );
  return (
    <>
      <span className="label list-head">Theme</span>
      <section className="list" role="radiogroup" aria-label="Theme">{opt('system', 'Match my device')}{opt('light', 'Light')}{opt('dark', 'Dark')}</section>
      <span className="label list-head">Accent color</span>
      <section className="card">
        <div className="swatches">
          {(Object.keys(THEMES) as ThemeKey[]).map(k => (
            <button key={k} type="button" className="swatch" aria-pressed={accent === k} aria-label={THEMES[k].name} style={{ background: THEMES[k].light }} onClick={() => pickAccent(k)} />
          ))}
        </div>
        <p className="hint">Used across the app and on your page.</p>
      </section>
    </>
  );
}
