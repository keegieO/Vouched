'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { THEMES, normalizeUsername, usernameError, type Profile, type ThemeKey } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { Avatar, themeStyle } from './ui';

type Props = {
  userId: string;
  existing: Profile | null;
  suggestedName?: string;
  afterSave: string;
  saveLabel: string;
};

export function ProfileForm({ userId, existing, suggestedName = '', afterSave, saveLabel }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(existing?.display_name ?? suggestedName);
  const [username, setUsername] = useState(existing?.username ?? '');
  const [city, setCity] = useState(existing?.city ?? '');
  const [showCity, setShowCity] = useState(existing?.show_city ?? true);
  const [headline, setHeadline] = useState(existing?.headline ?? '');
  const [theme, setTheme] = useState<ThemeKey>(existing?.theme ?? 'cobalt');
  const [open, setOpen] = useState(existing?.open_to_vouches ?? true);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(existing?.avatar_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const uErr = username ? usernameError(username) : null;

  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u || usernameError(u) || u === existing?.username) { setAvailable(null); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select('id').eq('username', u).maybeSingle();
      setAvailable(!data);
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  async function upload(file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError('Use a JPG, PNG or WebP photo.');
    if (file.size > 3 * 1024 * 1024) return setError('That photo is over 3 MB. Try a smaller one.');
    setUploading(true); setError(null);
    const ext = file.type.split('/')[1];
    const path = `${userId}/avatar-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) return setError(error.message);
    setAvatarUrl(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSaved(false);
    const u = normalizeUsername(username);
    const err = usernameError(u);
    if (err) return setError(err);
    if (!displayName.trim()) return setError('Add your name.');
    if (available === false) return setError('That username is taken.');
    setBusy(true);
    const row = {
      id: userId, username: u, display_name: displayName.trim(), city: city.trim() || null, show_city: showCity,
      headline: headline.trim() || null, theme, open_to_vouches: open, avatar_url: avatarUrl,
    };
    const { error } = existing
      ? await supabase.from('profiles').update(row).eq('id', userId)
      : await supabase.from('profiles').insert(row);
    setBusy(false);
    if (error) {
      setError(error.code === '23505' ? 'That username is taken.' : error.message);
      return;
    }
    setSaved(true);
    router.push(afterSave);
    router.refresh();
  }

  return (
    <form className="stack-lg themed" style={themeStyle(theme)} onSubmit={save}>
      <div className="row" style={{ gap: 16 }}>
        <Avatar name={displayName || '?'} url={avatarUrl} size={84} />
        <div className="stack" style={{ gap: 6 }}>
          <input ref={fileRef} id="avatar" type="file" accept="image/jpeg,image/png,image/webp" hidden
            onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" className="btn sm ghost" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading…' : avatarUrl ? 'Change photo' : 'Add a photo'}
          </button>
          {avatarUrl && <button type="button" className="btn sm ghost" onClick={() => setAvatarUrl(null)}>Remove photo</button>}
        </div>
      </div>

      <label className="field"><span>Your name</span>
        <input id="display-name" className="input" maxLength={50} required value={displayName} onChange={e => setDisplayName(e.target.value)} autoComplete="name" />
      </label>

      <label className="field"><span>Username</span>
        <input id="username" className="input" maxLength={21} required value={username} autoCapitalize="none" autoCorrect="off" spellCheck={false}
          onChange={e => setUsername(e.target.value.toLowerCase())} />
        <span className="hint">
          {uErr ? uErr : available === false ? 'Taken. Try another.' : available ? 'Available.' : `Your link: vouched…/${normalizeUsername(username) || 'yourname'}`}
        </span>
      </label>

      <label className="field"><span>Headline</span>
        <input id="headline" className="input" maxLength={80} placeholder="Handyman in Greenwood. TV mounting, doors, small repairs." value={headline} onChange={e => setHeadline(e.target.value)} />
        <span className="hint">The only line about you that you write. {headline.length}/80</span>
      </label>

      <label className="field"><span>City (optional)</span>
        <input id="city" className="input" maxLength={60} placeholder="Greenwood, IN" value={city} onChange={e => setCity(e.target.value)} />
      </label>
      <label className="check"><input id="show-city" type="checkbox" checked={showCity} onChange={e => setShowCity(e.target.checked)} /> Show my city on my profile</label>

      <div className="field"><span>Profile color</span>
        <div className="theme-swatches" role="group" aria-label="Profile color">
          {(Object.keys(THEMES) as ThemeKey[]).map(k => (
            <button key={k} type="button" className="swatch" aria-pressed={theme === k} aria-label={THEMES[k].name}
              style={{ background: THEMES[k].light }} onClick={() => setTheme(k)} />
          ))}
        </div>
      </div>

      {existing && (
        <label className="check"><input id="open" type="checkbox" checked={open} onChange={e => setOpen(e.target.checked)} />
          <span>Accept new vouches<br /><span className="hint">Turn off to pause new vouches. Approved ones stay up.</span></span>
        </label>
      )}

      {error && <p className="error" role="alert">{error}</p>}
      {saved && !error && <p className="success" role="status">Saved.</p>}
      <button className="btn primary block" disabled={busy || uploading}>{busy ? 'Saving…' : saveLabel}</button>
    </form>
  );
}
