'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, NOTE_MAX, REPLY_MAX, REQUEST_MAX, REQUEST_MIN, STATUSES, type SearchResult } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { Avatar, CheckMark } from './ui';
import { useToast } from './client';

/** Follow / Following toggle. Sends signed-out people to log in. */
export function FollowButton({ targetId, following, viewerId, small = true }: { targetId: string; following: boolean; viewerId: string | null; small?: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(following);
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();
  if (viewerId === targetId) return null;
  async function toggle() {
    if (!viewerId) return router.push('/login?mode=signup');
    setBusy(true);
    const supabase = createClient();
    const { error } = on
      ? await supabase.from('follows').delete().eq('follower_id', viewerId).eq('followee_id', targetId)
      : await supabase.from('follows').insert({ follower_id: viewerId, followee_id: targetId });
    setBusy(false);
    if (error) return show(error.message);
    setOn(!on);
    router.refresh();
  }
  return (
    <>
      {toast}
      <button type="button" className={`btn ${small ? 'sm' : ''} ${on ? 'ghost' : 'primary'}`} aria-pressed={on} disabled={busy} onClick={toggle}>
        {on ? 'Following' : 'Follow'}
      </button>
    </>
  );
}

/** "I know them too" button under an approved vouch. */
export function CosignButton({ vouchId, count, mine, canCosign, viewerId }: { vouchId: string; count: number; mine: boolean; canCosign: boolean; viewerId: string | null }) {
  const router = useRouter();
  const [on, setOn] = useState(mine);
  const [n, setN] = useState(count);
  const [busy, setBusy] = useState(false);
  const [toast, show] = useToast();
  if (viewerId && !canCosign) return n ? <span className="hint">✓ {n} co-signed</span> : null;
  async function toggle() {
    if (!viewerId) return router.push('/login?mode=signup');
    setBusy(true);
    const supabase = createClient();
    const { error } = on
      ? await supabase.from('cosigns').delete().eq('vouch_id', vouchId).eq('user_id', viewerId)
      : await supabase.from('cosigns').insert({ vouch_id: vouchId, user_id: viewerId });
    setBusy(false);
    if (error) return show(error.message);
    setOn(!on); setN(n + (on ? -1 : 1));
    if (!on) show('Co-signed. You backed this vouch up.');
  }
  return (
    <>
      {toast}
      <button type="button" className="cosign" aria-pressed={on} disabled={busy} onClick={toggle}>
        <CheckMark size={13} color="currentColor" /> {on ? 'Co-signed' : 'Co-sign'}{n ? ` · ${n}` : ''}
      </button>
    </>
  );
}

/** The person a vouch is about can post one short thank-you. */
export function ReplyControl({ vouchId, firstName }: { vouchId: string; firstName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) return <button type="button" className="link small" style={{ alignSelf: 'flex-start' }} onClick={() => setOpen(true)}>Say thanks to {firstName}</button>;
  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const { error } = await createClient().rpc('set_vouch_reply', { p_vouch_id: vouchId, p_reply: text.trim() });
    setBusy(false);
    if (error) return setError(error.message);
    router.refresh();
  }
  return (
    <form className="stack" style={{ gap: 8 }} onSubmit={post}>
      <input id={`reply-${vouchId}`} className="input" maxLength={REPLY_MAX} placeholder="Say thanks…" autoFocus value={text} onChange={e => setText(e.target.value)} />
      {error && <p className="error">{error}</p>}
      <div className="row">
        <button className="btn sm primary" disabled={busy || !text.trim()}>Post reply</button>
        <button type="button" className="btn sm ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

/** Live people search used on Discover and when recommending someone. */
export function usePeopleSearch(initial: SearchResult[] = []) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>(initial);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!q.trim()) { setResults(initial); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const { data } = await createClient().rpc('search_profiles', { q: q.trim(), lim: 30 });
      setResults((data ?? []) as SearchResult[]);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return { q, setQ, results, loading };
}

export function PersonRow({ p, viewerId, following, action, steps }: { p: SearchResult; viewerId: string | null; following: boolean; action?: React.ReactNode; steps?: number }) {
  return (
    <div className="result">
      <Avatar name={p.display_name} url={p.avatar_url} size={46} />
      <Link className="info" href={`/${p.username}`}>
        <b>{p.display_name}{steps ? <> <span className="steps-chip">{steps === 1 ? '1 step' : `${steps} steps`}</span></> : null}</b>
        <span>{p.headline || `@${p.username}`}</span>
        {(p.vouches > 0 || p.city || p.status) && (
          <span>{[p.vouches > 0 ? `${p.vouches} ${p.vouches === 1 ? 'vouch' : 'vouches'}` : null, p.status ? STATUSES[p.status] : null, p.city].filter(Boolean).join(' · ')}</span>
        )}
      </Link>
      {action ?? <FollowButton targetId={p.id} following={following} viewerId={viewerId} />}
    </div>
  );
}

const FILTERS: [string, string][] = [['all', 'All'], ['close', 'In my circles'], ['work', 'Available for work'], ['hiring', 'Hiring'], ['clients', 'Taking clients'], ['roommate', 'Roommates'], ['newtown', 'New in town']];

export function DiscoverSearch({ initial, viewerId, followingIds, circle = {} }: { initial: SearchResult[]; viewerId: string | null; followingIds: string[]; circle?: Record<string, number> }) {
  const { q, setQ, results, loading } = usePeopleSearch(initial);
  const [filter, setFilter] = useState('all');
  const [cat, setCat] = useState<string | null>(null);
  const [fResults, setFResults] = useState<SearchResult[]>([]);
  useEffect(() => {
    if (filter === 'all' && !cat) return;
    let alive = true;
    (async () => {
      const kws = cat ? CATEGORIES.find(c => c[0] === cat)![1] : [''];
      const all = await Promise.all(kws.map(k => createClient().rpc('search_profiles', { q: k, lim: 30, status_filter: filter === 'all' || filter === 'close' ? null : filter })));
      const seen = new Map<string, SearchResult>();
      all.forEach(r => ((r.data ?? []) as SearchResult[]).forEach(p => seen.set(p.id, p)));
      if (alive) setFResults([...seen.values()].sort((a, b) => b.vouches - a.vouches));
    })();
    return () => { alive = false; };
  }, [filter, cat]);
  const browsing = !q.trim() && (filter !== 'all' || cat);
  const list = (browsing ? fResults : results)
    .filter(r => r.id !== viewerId && (filter !== 'close' || r.id in circle))
    .sort((a, b) => (circle[a.id] ?? 9) - (circle[b.id] ?? 9));
  return (
    <div className="stack-lg">
      <label className="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Search people</span>
        <input id="discover-q" className="input" type="search" placeholder="Search names, skills, cities…" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
      </label>
      <div className="chips" role="group" aria-label="Filter">
        {FILTERS.map(([k, l]) => <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
      {!q.trim() && (
        <div className="cats">
          {CATEGORIES.map(([name]) => (
            <button key={name} type="button" className="cat" aria-pressed={cat === name} onClick={() => setCat(cat === name ? null : name)}>{name}</button>
          ))}
        </div>
      )}
      {browsing && (list.length
        ? <section className="list">{list.map(p => <PersonRow key={p.id} p={p} viewerId={viewerId} following={followingIds.includes(p.id)} steps={circle[p.id]} />)}</section>
        : <div className="empty"><p>No one here yet. Try another filter.</p></div>)}
      {q.trim() && (
        loading ? <p className="hint">Searching…</p>
          : list.length ? <section className="panel" style={{ gap: 0 }}>{list.map(p => <PersonRow key={p.id} p={p} viewerId={viewerId} following={followingIds.includes(p.id)} steps={circle[p.id]} />)}</section>
          : <div className="empty">No one matches “{q}”. Try a skill like “dog” or “handyman”.</div>
      )}
    </div>
  );
}

export function RequestForm({ authorId, defaultCity }: { authorId: string; defaultCity: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (body.trim().length < REQUEST_MIN) return setError(`Say a bit more about what you need (at least ${REQUEST_MIN} characters).`);
    setBusy(true); setError(null);
    const { data, error } = await createClient().from('requests').insert({ author_id: authorId, body: body.trim(), city: city.trim() || null }).select('id').single();
    setBusy(false);
    if (error) return setError(error.message);
    router.push(`/requests/${data.id}?posted=1`);
  }
  return (
    <form className="panel" onSubmit={post}>
      <label className="field"><span>What do you need?</span>
        <textarea id="request-body" maxLength={REQUEST_MAX} style={{ minHeight: 90 }} value={body} onChange={e => setBody(e.target.value)}
          placeholder="Need someone to fix a sagging fence gate this weekend. Anyone you trust?" />
      </label>
      <label className="field"><span>Where</span>
        <input id="request-city" className="input" maxLength={60} value={city} onChange={e => setCity(e.target.value)} placeholder="Greenwood, IN" />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy}>{busy ? 'Posting…' : 'Post to my people'}</button>
    </form>
  );
}

export function RecommendForm({ requestId, askerId, viewerId }: { requestId: string; askerId: string; viewerId: string }) {
  const router = useRouter();
  const { q, setQ, results, loading } = usePeopleSearch([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, show] = useToast();
  const options = results.filter(r => r.id !== askerId);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!picked) return setError('Pick a person to recommend.');
    setBusy(true); setError(null);
    const { error } = await createClient().from('request_answers').insert({ request_id: requestId, author_id: viewerId, recommended_id: picked.id, note: note.trim() || null });
    setBusy(false);
    if (error) return setError(error.code === '23505' ? 'You already recommended them here.' : error.message);
    show(`Recommended ${picked.display_name.split(' ')[0]}`);
    setPicked(null); setNote(''); setQ('');
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={send}>
      {toast}
      <h3>Recommend someone</h3>
      {picked ? (
        <div className="result" style={{ borderTop: 0 }}>
          <Avatar name={picked.display_name} url={picked.avatar_url} size={46} />
          <div className="info"><b>{picked.display_name}</b><span>{picked.headline || `@${picked.username}`}</span></div>
          <button type="button" className="btn sm ghost" onClick={() => setPicked(null)}>Change</button>
        </div>
      ) : (
        <>
          <label className="field"><span>Who do you trust for this?</span>
            <input id="rec-search" className="input" type="search" placeholder="Search Vouched…" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
          </label>
          {q.trim() && (loading ? <p className="hint">Searching…</p> : options.length ? (
            <div>{options.slice(0, 6).map(p => (
              <PersonRow key={p.id} p={p} viewerId={viewerId} following={false}
                action={<button type="button" className="btn sm primary" onClick={() => setPicked(p)}>Pick</button>} />
            ))}</div>
          ) : <p className="hint">No one by that name yet. Invite them to make a page, then recommend them.</p>)}
        </>
      )}
      <label className="field"><span>Why? (optional)</span>
        <input id="rec-note" className="input" maxLength={NOTE_MAX} value={note} onChange={e => setNote(e.target.value)} placeholder="Fixed my gate in an hour. Fair price." />
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn primary" disabled={busy || !picked}>Recommend</button>
      <p className="hint">They get a notification that you put their name forward.</p>
    </form>
  );
}

export function DeleteRequest({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  if (!confirm) return <button type="button" className="btn sm ghost" onClick={() => setConfirm(true)}>Delete my ask</button>;
  return (
    <div className="row">
      <button type="button" className="btn sm danger" onClick={async () => { await createClient().from('requests').delete().eq('id', requestId); router.push('/ask?tab=rec'); router.refresh(); }}>Yes, delete it</button>
      <button type="button" className="btn sm ghost" onClick={() => setConfirm(false)}>Cancel</button>
    </div>
  );
}
