'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  COMMENT_MAX, PRIVATE_NOTE_MAX, REACTIONS, VIBE_MAX, VIBE_PROMPTS, timeAgo,
  type Comment, type DropPrompt, type GiftType, type PropOption, type TargetType, type WeekResult,
} from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from './ui';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { useToast } from './client';

export function burst() {
  const b = document.createElement('div'); b.className = 'burst';
  const cols = ['#FFD400', '#fff', '#7A8CFF', '#FF5CA8'];
  for (let i = 0; i < 24; i++) {
    const s = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 110 + Math.random() * 170;
    s.style.cssText = `left:50%;top:62%;background:${cols[i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 80}px`;
    b.appendChild(s);
  }
  document.body.appendChild(b); setTimeout(() => b.remove(), 1000);
}

/* ─────────────── Reactions, comments, gift + share ─────────────── */
export function ReactBar({ type, id, n, top, mine, comments, viewerId, giftTo, shareUrl }: {
  type: TargetType; id: string; n: number; top: string[]; mine: string | null; comments: number;
  viewerId: string | null; giftTo?: { id: string; name: string } | null; shareUrl?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState({ n, top, mine });
  const [pop, setPop] = useState(false);
  const [cOpen, setCOpen] = useState(false);
  const [cCount, setCCount] = useState(comments);
  const [gift, setGift] = useState(false);
  const [toast, show] = useToast();
  const supabase = createClient();

  async function react(emoji: string | null) {
    if (!viewerId) return router.push('/login?mode=signup');
    setPop(false);
    const prev = state;
    if (emoji === null) {
      setState(s => ({ ...s, n: Math.max(0, s.n - 1), mine: null }));
      const { error } = await supabase.from('reactions').delete().eq('user_id', viewerId).eq('target_type', type).eq('target_id', id);
      if (error) { setState(prev); show(error.message); }
      return;
    }
    setState(s => ({ n: s.mine ? s.n : s.n + 1, mine: emoji, top: s.top.includes(emoji) ? s.top : [emoji, ...s.top].slice(0, 3) }));
    const { error } = await supabase.from('reactions').upsert({ user_id: viewerId, target_type: type, target_id: id, emoji }, { onConflict: 'user_id,target_type,target_id' });
    if (error) { setState(prev); show(error.message); }
  }
  async function share() {
    const url = shareUrl ?? window.location.href;
    try { if (navigator.share) await navigator.share({ url }); else { await navigator.clipboard.writeText(url); show('Link copied'); } } catch { /* closed */ }
  }

  return (
    <>
      {toast}
      {state.n > 0 && <span className="reacts"><span>{state.top.join('')}</span> {state.n}</span>}
      <div className="post-actions">
        {pop && (
          <div className="react-pop" role="menu">
            {REACTIONS.map(e => <button key={e} type="button" onClick={() => react(e)} aria-label={`React ${e}`}>{e}</button>)}
          </div>
        )}
        <button type="button" className={`act ${state.mine ? 'on' : ''}`} aria-label={state.mine ? 'Remove reaction' : 'React'}
          onClick={() => (state.mine ? react(null) : setPop(p => !p))}>
          {state.mine ? <span className="emo">{state.mine}</span> : <Icon name="heart" size="sm" />}
        </button>
        <button type="button" className="act" aria-label="Comments" onClick={() => setCOpen(true)}>
          <Icon name="msg" size="sm" />{cCount ? ` ${cCount}` : ''}
        </button>
        {giftTo && viewerId && giftTo.id !== viewerId
          ? <button type="button" className="act" aria-label={`Send ${giftTo.name} a gift`} onClick={() => setGift(true)}><Icon name="gift" size="sm" /></button>
          : <span />}
        <button type="button" className="act" aria-label="Share" onClick={share}><Icon name="share" size="sm" /></button>
      </div>
      <CommentsSheet open={cOpen} onClose={() => setCOpen(false)} type={type} id={id} viewerId={viewerId} onCount={setCCount} />
      {giftTo && <GiftSheet open={gift} onClose={() => setGift(false)} toId={giftTo.id} toName={giftTo.name} viewerId={viewerId} />}
    </>
  );
}

export function CommentsSheet({ open, onClose, type, id, viewerId, onCount }: {
  open: boolean; onClose: () => void; type: TargetType; id: string; viewerId: string | null; onCount?: (n: number) => void;
}) {
  const [list, setList] = useState<Comment[] | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const supabase = createClient();
  const load = useCallback(async () => {
    const { data } = await supabase.from('comments')
      .select('id, author_id, body, created_at, author:profiles!comments_author_id_fkey(username, display_name, avatar_url)')
      .eq('target_type', type).eq('target_id', id).order('created_at');
    const l = (data ?? []) as unknown as Comment[];
    setList(l); onCount?.(l.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, id]);
  useEffect(() => { if (open) load(); }, [open, load]);
  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!viewerId || !body.trim()) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from('comments').insert({ author_id: viewerId, target_type: type, target_id: id, body: body.trim() });
    setBusy(false);
    if (error) return setErr(error.message);
    setBody(''); load();
  }
  async function remove(cid: string) {
    await supabase.from('comments').delete().eq('id', cid); load();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Comments">
      {list === null ? <p className="hint">Loading…</p> : list.length ? list.map(c => (
        <div key={c.id} className="comment">
          <Avatar name={c.author?.display_name ?? '?'} url={c.author?.avatar_url} size={32} />
          <div className="grow">
            {c.author ? <Link href={`/${c.author.username}`}>{c.author.display_name}</Link> : <b>Deleted account</b>} <span className="hint">{timeAgo(c.created_at)}</span>
            <p style={{ overflowWrap: 'anywhere' }}>{c.body}</p>
          </div>
          {viewerId === c.author_id && <button type="button" className="iconbtn" aria-label="Delete comment" onClick={() => remove(c.id)}><Icon name="trash" size="xs" /></button>}
        </div>
      )) : <p className="muted">No comments yet. Say something nice.</p>}
      {viewerId ? (
        <form className="row nowrap" onSubmit={post}>
          <input className="input grow" maxLength={COMMENT_MAX} placeholder="Add a comment" value={body} onChange={e => setBody(e.target.value)} autoComplete="off" aria-label="Comment" />
          <button className="btn sm accent" disabled={busy || !body.trim()}>Post</button>
        </form>
      ) : <Link className="btn primary" href="/login?mode=signup">Join to comment</Link>}
      {err && <p className="error">{err}</p>}
    </Sheet>
  );
}

/* ─────────────── Gifts ─────────────── */
export function GiftSheet({ open, onClose, toId, toName, viewerId }: { open: boolean; onClose: () => void; toId: string; toName: string; viewerId: string | null }) {
  const router = useRouter();
  const [types, setTypes] = useState<GiftType[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const supabase = createClient();
    supabase.from('gift_types').select('key, emoji, label, premium, sort').eq('active', true).order('sort').then(({ data }) => setTypes((data ?? []) as GiftType[]));
    supabase.rpc('gifts_left_today').then(({ data }) => setLeft((data as number | null) ?? 0));
    setSent(null); setPick(null); setNote(''); setErr(null);
  }, [open]);
  async function send() {
    if (!viewerId) return router.push('/login?mode=signup');
    if (!pick) return;
    setBusy(true); setErr(null);
    const { error } = await createClient().from('gifts').insert({ sender_id: viewerId, receiver_id: toId, gift: pick, note: note.trim() || null });
    setBusy(false);
    if (error) return setErr(error.message);
    burst(); setSent(pick); router.refresh();
  }
  const first = toName.split(' ')[0];
  const free = (left ?? 0) > 0;
  return (
    <Sheet open={open} onClose={onClose} title={sent ? 'Sent!' : `Gift for ${first}`}>
      {sent ? (
        <>
          <p style={{ fontSize: 64, textAlign: 'center', lineHeight: 1 }}>{types.find(t => t.key === sent)?.emoji}</p>
          <p className="muted" style={{ textAlign: 'center' }}>{first} will see it on their gift shelf.</p>
          <button className="btn primary" onClick={onClose}>Done</button>
        </>
      ) : (
        <>
          <p className="hint">{left === null ? '…' : free ? 'You get 1 free gift a day.' : 'You’ve used today’s free gift. More tomorrow.'} Gifts never change anyone’s trust score.</p>
          <div className="giftgrid">
            {types.map(t => t.premium ? (
              <div key={t.key} className="giftopt locked"><span className="g">{t.emoji}</span>{t.label}<span className="hint">Soon</span></div>
            ) : (
              <button key={t.key} type="button" className="giftopt" aria-pressed={pick === t.key} disabled={!free} onClick={() => setPick(t.key)}>
                <span className="g">{t.emoji}</span>{t.label}
              </button>
            ))}
          </div>
          <input className="input" maxLength={80} placeholder="Add a note (optional)" value={note} onChange={e => setNote(e.target.value)} aria-label="Note" />
          {err && <p className="error">{err}</p>}
          <button className="btn accent lg block" disabled={!free || !pick || busy} onClick={send}>{busy ? 'Sending…' : 'Send'}</button>
        </>
      )}
    </Sheet>
  );
}

export function GiftButton({ toId, toName, viewerId, label, className = 'iconbtn' }: { toId: string; toName: string; viewerId: string | null; label?: string; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} style={label ? undefined : { border: '1px solid var(--line-2)' }} aria-label={`Send ${toName} a gift`}
        onClick={() => (viewerId ? setOpen(true) : router.push('/login?mode=signup'))}>
        <Icon name="gift" size="sm" />{label}
      </button>
      <GiftSheet open={open} onClose={() => setOpen(false)} toId={toId} toName={toName} viewerId={viewerId} />
    </>
  );
}

/* ─────────────── Stories ─────────────── */
export type StorySlide =
  | { kind: 'vouch'; at: string; from: string; rel: string; body: string }
  | { kind: 'gift'; at: string; from: string; emoji: string; label: string; note: string | null }
  | { kind: 'poll'; at: string; emoji: string | null; label: string; question: string; n: number };
export type StoryPerson = { id: string; username: string; name: string; avatar: string | null; slides: StorySlide[] };

export function Stories({ me, people, playedToday }: { me: { name: string; avatar: string | null }; people: StoryPerson[]; playedToday: boolean }) {
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<{ pi: number; si: number } | null>(null);
  useEffect(() => {
    try { setSeen(new Set(JSON.parse(localStorage.getItem('vouched-seen-stories') || '[]'))); } catch { /* private mode */ }
  }, []);
  const markSeen = useCallback((id: string) => setSeen(s => {
    const n = new Set(s); n.add(id);
    try { localStorage.setItem('vouched-seen-stories', JSON.stringify([...n].slice(-200))); } catch { /* ignore */ }
    return n;
  }), []);
  const order = [...people].sort((a, b) => Number(seen.has(a.id)) - Number(seen.has(b.id)));
  return (
    <>
      <div className="stories" aria-label="Stories">
        <Link className="story" href={playedToday ? '/props/week' : '/props'}>
          <span className="plusbadge"><span className={`ringwrap ${playedToday ? 'seen' : 'hi'}`}><Avatar name={me.name} url={me.avatar} size={62} /></span><i>{playedToday ? '✓' : '5'}</i></span>
          <span>{playedToday ? 'Your week' : 'Today’s polls'}</span>
        </Link>
        {order.map((p, i) => (
          <button key={p.id} type="button" className="story" onClick={() => setOpen({ pi: i, si: 0 })}>
            <span className={`ringwrap ${seen.has(p.id) ? 'seen' : ''}`}><Avatar name={p.name} url={p.avatar} size={62} /></span>
            <span>{p.name.split(' ')[0]}</span>
          </button>
        ))}
      </div>
      {open && <StoryViewer people={order} start={open} onSeen={markSeen} onClose={() => setOpen(null)} />}
    </>
  );
}

function StoryViewer({ people, start, onSeen, onClose }: { people: StoryPerson[]; start: { pi: number; si: number }; onSeen: (id: string) => void; onClose: () => void }) {
  const [pos, setPos] = useState(start);
  const p = people[pos.pi];
  const s = p?.slides[pos.si];
  const step = useCallback((dir: 1 | -1) => {
    setPos(({ pi, si }) => {
      const n = people[pi].slides.length;
      if (dir === -1) return si > 0 ? { pi, si: si - 1 } : pi > 0 ? { pi: pi - 1, si: 0 } : { pi, si };
      if (si + 1 < n) return { pi, si: si + 1 };
      onSeen(people[pi].id);
      if (pi + 1 < people.length) return { pi: pi + 1, si: 0 };
      setTimeout(onClose, 0);
      return { pi, si };
    });
  }, [people, onSeen, onClose]);
  useEffect(() => { const t = setTimeout(() => step(1), 5000); return () => clearTimeout(t); }, [pos, step]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { onSeen(p.id); onClose(); } if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [p, step, onSeen, onClose]);
  if (!p || !s) return null;
  return (
    <div className="viewer" role="dialog" aria-modal="true" aria-label={`${p.name}’s story`}>
      <div className="frame">
        <div className="bars">{p.slides.map((_, i) => <i key={`${pos.pi}-${i}`} className={i < pos.si ? 'done' : i === pos.si ? 'now' : ''}><b /></i>)}</div>
        <div className="head">
          <Avatar name={p.name} url={p.avatar} size={34} /><b>{p.name}</b><span style={{ opacity: .6, fontSize: 13 }}>{timeAgo(s.at)}</span>
          <span className="grow" />
          <button type="button" className="iconbtn" aria-label="Close" onClick={() => { onSeen(p.id); onClose(); }}><Icon name="x" /></button>
        </div>
        <div className="body">
          {s.kind === 'vouch' && <>
            <div className="small" style={{ opacity: .8 }}>New vouch from {s.from}</div>
            <div className="vcard"><span style={{ fontSize: 12, fontWeight: 700, color: '#536471' }}>{s.rel}</span>
              <p style={{ fontSize: 19, lineHeight: 1.35 }}>“{s.body}”</p><span style={{ fontFamily: 'var(--f-sig)', fontSize: 22, color: '#1D35B8' }}>{s.from}</span></div>
          </>}
          {s.kind === 'gift' && <>
            <div className="small" style={{ opacity: .8 }}>{s.from} sent a gift</div>
            <div className="vcard" style={{ alignItems: 'center', textAlign: 'center' }}><span style={{ fontSize: 80 }}>{s.emoji}</span><span className="big">{s.label}</span>{s.note && <p>“{s.note}”</p>}</div>
          </>}
          {s.kind === 'poll' && <>
            <div className="small" style={{ opacity: .8 }}>This week’s polls</div>
            <div className="big">Friends voted {p.name.split(' ')[0]}</div>
            <div className="vcard"><span style={{ fontSize: 48 }}>{s.emoji ?? '✨'}</span><span className="big">{s.label}</span><span style={{ color: '#536471' }}>{s.question} · {s.n} votes</span></div>
          </>}
        </div>
        <button type="button" className="tapzone l" aria-label="Previous" onClick={() => step(-1)} />
        <button type="button" className="tapzone r" aria-label="Next" onClick={() => step(1)} />
        <div className="row nowrap">
          <Link className="btn ghost" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.4)' }} href={`/${p.username}`} onClick={onClose}>View profile</Link>
        </div>
      </div>
    </div>
  );
}

/* ─────────────── Daily polls ─────────────── */
export function DropGame({ prompts, streak }: { prompts: DropPrompt[]; streak: number }) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const todo = useRef(prompts.filter(p => !p.answered)).current;
  const [i, setI] = useState(0);
  const [opts, setOpts] = useState<PropOption[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [given, setGiven] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const seenIds = useRef<string[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.rpc('prop_options', { n: 4, exclude: seenIds.current.slice(-12) });
    const list = (data ?? []) as PropOption[];
    seenIds.current.push(...list.map(x => x.id));
    setOpts(list);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push('/feed'); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [router]);

  async function pick(p: PropOption) {
    if (picked) return;
    setPicked(p.id); setNote(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('props').insert({ giver_id: user!.id, receiver_id: p.id, prompt_id: todo[i].id });
    if (error) { setPicked(null); setNote(error.message); return; }
    burst(); setGiven(g => g + 1);
    setTimeout(() => { setPicked(null); setI(x => x + 1); load(); }, 600);
  }
  const skip = () => { setNote(null); setI(x => x + 1); load(); };

  if (i >= todo.length) {
    return (
      <div className="drop"><div className="inner" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <span className="emoji">🎉</span>
        <h1 className="q">{todo.length ? 'Done for today' : 'You already played today'}</h1>
        <span className="streak" style={{ fontSize: 15, alignSelf: 'center' }}>🔥 {streak + (given > 0 ? (prompts.some(p => p.answered) ? 0 : 1) : 0)} day streak</span>
        <p style={{ opacity: .75, maxWidth: '24em' }}>Your picks are anonymous. New polls every day at noon.</p>
        <div className="row" style={{ justifyContent: 'center' }}>
          <Link className="btn hi lg" href="/feed">Done</Link>
          <Link className="ghostbtn" href="/props/week">See your week</Link>
        </div>
      </div></div>
    );
  }
  const q = todo[i];
  const done = prompts.length - todo.length + i;
  return (
    <div className="drop"><div className="inner">
      <div className="row nowrap">
        <Link className="iconbtn" href="/feed" aria-label="Close"><Icon name="x" /></Link>
        <div className="progress" aria-hidden="true">{prompts.map((_, k) => <i key={k} className={k <= done ? 'on' : ''} />)}</div>
        <span className="small" style={{ opacity: .7 }}>{done + 1}/{prompts.length}</span>
      </div>
      <span className="emoji">{q.emoji ?? '✨'}</span>
      <h1 className="q">{q.question}</h1>
      {note && <p role="status" style={{ color: 'var(--hi)' }}>{note}</p>}
      {opts.length ? (
        <div className="picks">
          {opts.map(p => (
            <button key={p.id} type="button" className={`pk ${picked === p.id ? 'chosen' : ''}`} onClick={() => pick(p)} disabled={!!picked && picked !== p.id}>
              <Avatar name={p.display_name} url={p.avatar_url} size={56} />
              <span>{p.display_name}</span>
              <span>@{p.username}</span>
            </button>
          ))}
        </div>
      ) : <p style={{ opacity: .75, marginTop: 'auto' }}>Follow a few people first so there are friends to pick from.</p>}
      <div className="row" style={{ justifyContent: 'center', gap: 28 }}>
        <button type="button" className="ghostbtn" onClick={load}><Icon name="shuffle" size="sm" /> Shuffle</button>
        <button type="button" className="ghostbtn" onClick={skip}>Skip</button>
      </div>
    </div></div>
  );
}

export function WeekReveal({ results, shareUrl }: { results: WeekResult[]; shareUrl: string }) {
  const [toast, show] = useToast();
  async function share() {
    const text = `My friends voted me ${results.slice(0, 3).map(r => `${r.emoji ?? ''} ${r.label}`).join(', ')} on Vouched`;
    try { if (navigator.share) await navigator.share({ text, url: shareUrl }); else { await navigator.clipboard.writeText(`${text} ${shareUrl}`); show('Copied'); } } catch { /* closed */ }
  }
  return (
    <div className="drop"><div className="inner">
      {toast}
      <div className="row between nowrap"><b>Your week</b><Link className="iconbtn" href="/inbox" aria-label="Close"><Icon name="x" /></Link></div>
      <h1 className="q">Your friends voted you…</h1>
      <div className="reveal">
        {results.length ? results.slice(0, 6).map((r, i) => (
          <div key={r.prompt_id} className="rv" style={{ animationDelay: `${i * 0.25}s` }}>
            <span className="e">{r.emoji ?? '✨'}</span><div className="grow"><b>{r.label}</b><span>{r.question}</span></div><b>×{r.n}</b>
          </div>
        )) : <p style={{ opacity: .75 }}>No votes yet this week. Play today’s polls. Friends usually pick you back.</p>}
      </div>
      <div className="row" style={{ marginTop: 'auto', justifyContent: 'center' }}>
        {results.length ? <button type="button" className="btn hi lg" onClick={share}><Icon name="share" size="sm" /> Share my results</button>
          : <Link className="btn hi lg" href="/props">Play today’s polls</Link>}
      </div>
    </div></div>
  );
}

/* ─────────────── Vouch menu: withdraw / hide / report ─────────────── */
export function VouchMenu({ vouchId, isAuthor, isSubject, subjectFirst, signedIn }: { vouchId: string; isAuthor: boolean; isSubject: boolean; subjectFirst: string; signedIn: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [report, setReport] = useState<'no' | 'form' | 'sent'>('no');
  const [toast, show] = useToast();
  const supabase = createClient();
  async function withdraw() {
    const { error } = await supabase.rpc('withdraw_vouch', { p_vouch_id: vouchId });
    if (error) return show(error.message);
    setOpen(false); show(`Vouch withdrawn. ${subjectFirst}’s score will reflect it.`); router.refresh();
  }
  async function hide() {
    const { error } = await supabase.rpc('set_vouch_status', { p_vouch_id: vouchId, p_status: 'hidden' });
    if (error) return show(error.message);
    setOpen(false); show('Hidden. Only you can see it.'); router.refresh();
  }
  async function sendReport(reason: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    await supabase.from('reports').insert({ reporter_id: user.id, vouch_id: vouchId, reason });
    setReport('sent');
  }
  return (
    <>
      {toast}
      <button type="button" className="iconbtn" style={{ marginLeft: 'auto', width: 30, height: 30 }} aria-label="More" onClick={() => (signedIn ? setOpen(true) : router.push('/login'))}>
        <Icon name="more" size="sm" />
      </button>
      <Sheet open={open} onClose={() => { setOpen(false); setConfirm(false); setReport('no'); }} title={report === 'sent' ? 'Thanks for telling us' : 'Vouch'}>
        {report === 'sent' ? (
          <><p className="muted">We review every report. Only confirmed scams or fake accounts change anyone’s score.</p><button className="btn primary" onClick={() => { setOpen(false); setReport('no'); }}>Done</button></>
        ) : report === 'form' ? (
          [['fake', 'Fake or untrue'], ['harassment', 'Harassment'], ['private_info', 'Shares private info'], ['spam', 'Spam']].map(([k, l]) => (
            <button key={k} type="button" className="sheet-opt" onClick={() => sendReport(k)}><span className="ico"><Icon name="flag" size="sm" /></span><span><b>{l}</b></span></button>
          ))
        ) : (
          <>
            {isAuthor && (confirm ? (
              <div className="stack">
                <p>Take your name off {subjectFirst}? It lowers their trust score and you don’t get the vouch back this month.</p>
                <div className="row"><button className="btn danger" onClick={withdraw}>Withdraw</button><button className="btn ghost" onClick={() => setConfirm(false)}>Cancel</button></div>
              </div>
            ) : (
              <button type="button" className="sheet-opt" onClick={() => setConfirm(true)}><span className="ico"><Icon name="back" size="sm" /></span><span><b>Withdraw this vouch</b><span>Takes your name off {subjectFirst}</span></span></button>
            ))}
            {isSubject && <button type="button" className="sheet-opt" onClick={hide}><span className="ico"><Icon name="eye" size="sm" /></span><span><b>Hide from my profile</b><span>Only you will see it</span></span></button>}
            <button type="button" className="sheet-opt" onClick={() => setReport('form')}><span className="ico"><Icon name="flag" size="sm" /></span><span><b>Report</b><span>Fake, harassment or private info</span></span></button>
          </>
        )}
      </Sheet>
    </>
  );
}

/* ─────────────── Private feedback ─────────────── */
export function PrivateNoteSheet({ open, onClose, toId, toName, viewerId }: { open: boolean; onClose: () => void; toId: string; toName: string; viewerId: string }) {
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const first = toName.split(' ')[0];
  async function send() {
    setState('busy'); setErr(null);
    const { error } = await createClient().from('private_notes').insert({ sender_id: viewerId, recipient_id: toId, body: text.trim() });
    if (error) { setState('idle'); return setErr(error.message); }
    setState('sent');
  }
  return (
    <Sheet open={open} onClose={() => { onClose(); setState('idle'); setText(''); }} title={state === 'sent' ? 'Sent privately' : `Private feedback for ${first}`}>
      {state === 'sent' ? (
        <><p className="muted">Only {first} can see it. It never shows on their profile.</p><button className="btn primary" onClick={onClose}>Done</button></>
      ) : (
        <>
          <p className="hint">Honest and kind. {first} will see it’s from you, and it never shows publicly.</p>
          <textarea maxLength={PRIVATE_NOTE_MAX} value={text} onChange={e => setText(e.target.value)} aria-label="Feedback"
            placeholder="You’re great, but you flake on plans a lot. I’d love to hang more." />
          {err && <p className="error">{err}</p>}
          <button className="btn accent block" disabled={state === 'busy' || text.trim().length < 3} onClick={send}>Send privately</button>
        </>
      )}
    </Sheet>
  );
}

/* ─────────────── Small actions ─────────────── */
export function RecordView({ id }: { id: string }) {
  useEffect(() => { createClient().rpc('record_profile_view', { p_user: id }); }, [id]);
  return null;
}

export function ProfileToggle({ field, on, label, hint, table = 'profiles', userId }: { field: string; on: boolean; label: string; hint?: string; table?: 'profiles' | 'user_settings'; userId: string }) {
  const router = useRouter();
  const [v, setV] = useState(on);
  const [toast, show] = useToast();
  async function flip() {
    const next = !v; setV(next);
    const supabase = createClient();
    const { error } = table === 'profiles'
      ? await supabase.from('profiles').update({ [field]: next }).eq('id', userId)
      : await supabase.from('user_settings').upsert({ user_id: userId, [field]: next }, { onConflict: 'user_id' });
    if (error) { setV(!next); show(error.message); } else router.refresh();
  }
  return (
    <div className="li static">
      {toast}
      <span className="grow"><b style={{ fontWeight: 600 }}>{label}</b>{hint && <><br /><span className="hint">{hint}</span></>}</span>
      <button type="button" className="toggle" role="switch" aria-checked={v} aria-label={label} onClick={flip} />
    </div>
  );
}

export function VouchAgain({ subjectId, name }: { subjectId: string; name: string }) {
  const router = useRouter();
  const [done, setDone] = useState<string | null>(null);
  async function answer(yes: boolean) {
    const { error } = await createClient().rpc('answer_vouch_again', { p_subject: subjectId, p_yes: yes });
    setDone(error ? error.message : yes ? 'Thanks. Kept private.' : 'Got it. Kept private. It only affects their score.');
    router.refresh();
  }
  return (
    <div className="row-li">
      <span className="ic">🤝</span>
      <span className="info"><b>Would you still vouch for {name}?</b><span>{done ?? 'Private. Only counts in their score.'}</span></span>
      {!done && <><button className="btn sm ghost" onClick={() => answer(true)}>Yes</button><button className="btn sm ghost" onClick={() => answer(false)}>No</button></>}
    </div>
  );
}

export function VibeReview({ id }: { id: string }) {
  const router = useRouter();
  const set = async (s: 'shown' | 'hidden') => { await createClient().rpc('set_vibe_status', { p_id: id, p_status: s }); router.refresh(); };
  return (
    <>
      <button className="btn sm primary" onClick={() => set('shown')}>Show</button>
      <button className="iconbtn" aria-label="Hide" onClick={() => set('hidden')}><Icon name="x" size="sm" /></button>
    </>
  );
}

export function VibeAnswerForm({ subjectId, first, viewerId }: { subjectId: string; first: string; viewerId: string | null }) {
  const router = useRouter();
  const [prompt, setPrompt] = useState(0);
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [err, setErr] = useState<string | null>(null);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!viewerId) return router.push(`/login?mode=signup&next=${encodeURIComponent(location.pathname)}`);
    setState('busy'); setErr(null);
    const { error } = await createClient().from('vibe_answers').insert({ subject_id: subjectId, author_id: viewerId, prompt, body: text.trim() });
    if (error) { setState('idle'); return setErr(error.code === '23505' ? 'You already answered that one. Pick another question.' : error.message); }
    setState('sent');
  }
  if (state === 'sent') return <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}><span style={{ fontSize: 48 }}>💌</span><h2>Sent!</h2><p className="muted">{first} chooses whether it shows on their profile.</p></div>;
  return (
    <form className="stack" onSubmit={send}>
      <div className="chips">{VIBE_PROMPTS.map((q, k) => <button key={q} type="button" className="chip" aria-pressed={prompt === k} onClick={() => setPrompt(k)}>{q}</button>)}</div>
      <input className="input" maxLength={VIBE_MAX} value={text} onChange={e => setText(e.target.value)} placeholder="steady, goofy, generous" aria-label={VIBE_PROMPTS[prompt]} />
      {err && <p className="error">{err}</p>}
      <button className="btn accent lg block" disabled={state === 'busy' || !text.trim()}>{viewerId ? 'Send' : 'Join to answer'}</button>
      <p className="hint" style={{ textAlign: 'center' }}>Positive and honest. {first} sees who sent it.</p>
    </form>
  );
}
