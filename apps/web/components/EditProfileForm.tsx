'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COVERS, MAX_LINKS, MAX_SKILLS, PLATFORMS, STATUSES, STYLES, THEMES, cleanHandle, isStyle, linkLabel, normalizeUsername, usernameError,
  type CoverKey, type PlatformKey, type Profile, type ProfileLink, type StatusKey, type StyleKey, type ThemeKey, type VouchWithAuthor,
} from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { Avatar, themeStyle } from './ui';
import { Icon, platformIcon } from './Icon';
import { Sheet } from './Sheet';
import { useToast } from './client';

export function EditProfileForm({ profile, links: initialLinks, vouches }: { profile: Profile; links: ProfileLink[]; vouches: VouchWithAuthor[] }) {
  const router = useRouter();
  const supabase = createClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [toast, show] = useToast();

  const [name, setName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [pronouns, setPronouns] = useState(profile.pronouns ?? '');
  const [headline, setHeadline] = useState(profile.headline ?? '');
  const [bio, setBio] = useState(profile.bio ?? '');
  const [city, setCity] = useState(profile.city ?? '');
  const [showCity, setShowCity] = useState(profile.show_city);
  const [status, setStatus] = useState<StatusKey | null>(profile.status ?? null);
  const [skills, setSkills] = useState<string[]>(profile.skills ?? []);
  const [skill, setSkill] = useState('');
  const [pinned, setPinned] = useState<string | null>(profile.pinned_vouch_id ?? null);
  const [theme, setTheme] = useState<ThemeKey>(profile.theme);
  const [cover, setCover] = useState<CoverKey>(profile.cover ?? 'dots');
  const [style, setStyle] = useState<StyleKey>(isStyle(profile.style) ? profile.style : 'signed');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [links, setLinks] = useState<ProfileLink[]>(initialLinks);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkType, setLinkType] = useState<PlatformKey>('instagram');
  const [linkVal, setLinkVal] = useState('');
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const u = normalizeUsername(username);
    if (!u || usernameError(u) || u === profile.username) { setAvailable(null); return; }
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
    const path = `${profile.id}/avatar-${Date.now()}.${file.type.split('/')[1]}`;
    const { error } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: file.type });
    setUploading(false);
    if (error) return setError(error.message);
    setAvatarUrl(supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl);
  }

  function addSkill(e: React.FormEvent) {
    e.preventDefault();
    const v = skill.trim();
    if (!v || v.length > 24 || skills.length >= MAX_SKILLS || skills.includes(v)) return;
    setSkills([...skills, v]); setSkill('');
  }

  async function addLink(e: React.FormEvent) {
    e.preventDefault();
    const handle = cleanHandle(linkType, linkVal);
    if (!handle) return setLinkErr('Add your username or link.');
    const { data, error } = await supabase.from('profile_links')
      .insert({ profile_id: profile.id, platform: linkType, handle, position: links.length }).select('*').single();
    if (error) return setLinkErr(error.message);
    setLinks([...links, data as ProfileLink]); setLinkOpen(false); setLinkVal(''); setLinkErr(null);
    show(`${PLATFORMS[linkType].name} linked`);
  }
  async function removeLink(id: string) {
    const { error } = await supabase.from('profile_links').delete().eq('id', id);
    if (error) return show(error.message);
    setLinks(links.filter(l => l.id !== id));
  }

  async function save() {
    setError(null);
    const u = normalizeUsername(username);
    const err = usernameError(u);
    if (err) return setError(err);
    if (!name.trim()) return setError('Add your name.');
    if (available === false) return setError('That username is taken.');
    setBusy(true);
    const { error } = await supabase.from('profiles').update({
      display_name: name.trim(), username: u, pronouns: pronouns.trim() || null, headline: headline.trim() || null, bio: bio.trim() || null,
      city: city.trim() || null, show_city: showCity, status, skills, pinned_vouch_id: pinned, theme, cover, style, avatar_url: avatarUrl,
    }).eq('id', profile.id);
    setBusy(false);
    if (error) { setError(error.code === '23505' ? 'That username is taken.' : error.message); window.scrollTo(0, 0); return; }
    router.push(`/${u}`);
    router.refresh();
  }

  const uErr = username ? usernameError(username) : null;

  return (
    <div className="stack-lg themed" style={themeStyle(theme)}>
      {toast}
      <div className={`cover flat ${cover}`} />
      <div className="p-head">
        <Avatar name={name || '?'} url={avatarUrl} size={96} />
        <div className="row" style={{ paddingBottom: 6 }}>
          <input ref={fileRef} id="avatar-file" type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" className="btn sm soft" onClick={() => fileRef.current?.click()} disabled={uploading}><Icon name="camera" size="sm" /> {uploading ? 'Uploading…' : avatarUrl ? 'Change' : 'Add photo'}</button>
          {avatarUrl && <button type="button" className="btn sm ghost" onClick={() => setAvatarUrl(null)}>Remove</button>}
        </div>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      <section className="card">
        <label className="field"><span>Name</span><input id="ep-name" className="input" maxLength={50} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></label>
        <label className="field"><span>Username</span>
          <input id="ep-username" className="input" maxLength={21} value={username} autoCapitalize="none" spellCheck={false} onChange={e => setUsername(e.target.value.toLowerCase())} />
          <span className="hint">{uErr ?? (available === false ? 'Taken. Try another.' : available ? 'Available.' : 'Changing it changes your link.')}</span>
        </label>
        <label className="field"><span>Pronouns (optional)</span><input id="ep-pronouns" className="input" maxLength={20} value={pronouns} onChange={e => setPronouns(e.target.value)} placeholder="she/her" /></label>
        <label className="field"><span>Headline</span><input id="ep-headline" className="input" maxLength={80} value={headline} onChange={e => setHeadline(e.target.value)} placeholder="Handyman in Greenwood. TV mounting, doors." /><span className="hint">Shows under your name and in search. {headline.length}/80</span></label>
        <label className="field"><span>Bio</span><textarea id="ep-bio" maxLength={200} style={{ minHeight: 90 }} value={bio} onChange={e => setBio(e.target.value)} placeholder="A little more about you." /><span className="hint">{bio.length}/200</span></label>
        <label className="field"><span>City</span><input id="ep-city" className="input" maxLength={60} value={city} onChange={e => setCity(e.target.value)} placeholder="Greenwood, IN" /></label>
        <label className="check"><input id="ep-showcity" type="checkbox" checked={showCity} onChange={e => setShowCity(e.target.checked)} /> Show my city</label>
      </section>

      <span className="label">Status</span>
      <div className="row" style={{ gap: 8 }}>
        <button type="button" className="chip" aria-pressed={!status} onClick={() => setStatus(null)}>None</button>
        {(Object.keys(STATUSES) as StatusKey[]).map(k => <button key={k} type="button" className="chip" aria-pressed={status === k} onClick={() => setStatus(k)}>{STATUSES[k]}</button>)}
      </div>

      <span className="label">Skills &amp; services</span>
      <section className="card">
        <div className="row" style={{ gap: 6 }}>
          {skills.length ? skills.map(k => (
            <button key={k} type="button" className="chip" aria-label={`Remove ${k}`} onClick={() => setSkills(skills.filter(x => x !== k))}>{k} <Icon name="x" size="xs" /></button>
          )) : <span className="hint">Add what people hire or know you for. These help people find you in Discover.</span>}
        </div>
        {skills.length < MAX_SKILLS && (
          <form className="row nowrap" onSubmit={addSkill}>
            <input id="ep-skill" className="input" maxLength={24} value={skill} onChange={e => setSkill(e.target.value)} placeholder="e.g. Dog walking" />
            <button className="btn sm soft">Add</button>
          </form>
        )}
      </section>

      <span className="label" id="links">Linked accounts</span>
      <section className="list">
        {links.map(l => (
          <div key={l.id} className="li static">
            <span className="ico"><Icon name={platformIcon(l.platform)} size="sm" /></span>
            <span className="grow"><b>{PLATFORMS[l.platform].name}</b><br /><span className="hint">{linkLabel(l)}</span></span>
            <button type="button" className="iconbtn" aria-label={`Remove ${PLATFORMS[l.platform].name}`} onClick={() => removeLink(l.id)}><Icon name="trash" size="sm" /></button>
          </div>
        ))}
        {links.length < MAX_LINKS && (
          <button type="button" className="li" onClick={() => setLinkOpen(true)}><span className="ico"><Icon name="plus" size="sm" /></span><span className="grow">Add a link</span></button>
        )}
      </section>

      <span className="label">Pinned vouch</span>
      <section className="list" role="radiogroup" aria-label="Pinned vouch">
        {vouches.length ? (
          <>
            <button type="button" className="li radio-li" role="radio" aria-checked={!pinned} onClick={() => setPinned(null)}><span className="grow">None</span><span className="radio" /></button>
            {vouches.map(v => (
              <button key={v.id} type="button" className="li radio-li" role="radio" aria-checked={pinned === v.id} onClick={() => setPinned(v.id)}>
                <span className="grow small">“{v.body.slice(0, 70)}{v.body.length > 70 ? '…' : ''}” — {v.author?.display_name.split(' ')[0] ?? 'Someone'}</span><span className="radio" />
              </button>
            ))}
          </>
        ) : <div className="li static"><span className="hint">Approve a vouch first, then pin your favorite to the top of your page.</span></div>}
      </section>

      <span className="label" id="look">Look</span>
      <section className="card">
        <div className="field"><span>Color</span>
          <div className="swatches">
            {(Object.keys(THEMES) as ThemeKey[]).map(k => (
              <button key={k} type="button" className="swatch" aria-pressed={theme === k} aria-label={THEMES[k].name} style={{ background: THEMES[k].light }} onClick={() => setTheme(k)} />
            ))}
          </div>
        </div>
        <div className="field"><span>Cover</span>
          <div className="covers">
            {COVERS.map(c => <button key={c} type="button" className={`cover flat ${c}`} style={{ height: 46, borderRadius: 12 }} aria-pressed={cover === c} aria-label={`${c} cover`} onClick={() => setCover(c)} />)}
          </div>
        </div>
        <div className="field"><span>Page style</span>
          <div className="style-grid">
            {(Object.keys(STYLES) as StyleKey[]).map(k => (
              <button key={k} type="button" aria-pressed={style === k} onClick={() => setStyle(k)} className={`style-tile themed pstyle pstyle-${k}`} style={themeStyle(theme)}>
                <span className="t-name">{STYLES[k].name}</span>
                <span className="t-card">“Always shows up.”<br /><span className="t-sig">Dana W.</span></span>
                <span className="hint">{STYLES[k].blurb}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <button type="button" className="btn primary block" disabled={busy || uploading} onClick={save}>{busy ? 'Saving…' : 'Save profile'}</button>

      <Sheet open={linkOpen} onClose={() => setLinkOpen(false)} title="Add a link">
        <form className="stack" onSubmit={addLink}>
          <label className="field" htmlFor="link-type"><span>Where</span>
            <select id="link-type" value={linkType} onChange={e => setLinkType(e.target.value as PlatformKey)}>
              {(Object.keys(PLATFORMS) as PlatformKey[]).map(k => <option key={k} value={k}>{PLATFORMS[k].name}</option>)}
            </select>
          </label>
          <label className="field"><span>{linkType === 'website' ? 'Website address' : 'Username'}</span>
            <input id="link-value" className="input" maxLength={80} autoCapitalize="none" value={linkVal} onChange={e => setLinkVal(e.target.value)} placeholder={linkType === 'website' ? 'yourbusiness.com' : 'yourname'} />
          </label>
          {linkErr && <p className="error">{linkErr}</p>}
          <p className="hint">Only link accounts that are yours.</p>
          <button className="btn primary">Add link</button>
        </form>
      </Sheet>
    </div>
  );
}
