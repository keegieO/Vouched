import Link from 'next/link';
import { AXES, tierClass, timeAgo, type GiftWithPeople, type PersonalityRow, type ReactionCount, type VouchWithBoth } from '@vouched/shared';
import { Avatar } from './ui';
import { Icon } from './Icon';
import { ReactBar, VouchMenu } from './v2';

const first = (n?: string | null) => (n ?? '').split(' ')[0] || 'them';
const noCounts = (id: string): ReactionCount => ({ target_id: id, n: 0, top: [], mine: null, comments: 0 });

export function TierPill({ tier, href }: { tier: string | null | undefined; href?: string }) {
  if (!tier) return null;
  const inner = <><Icon name="shield" size="xs" /> {tier}</>;
  return href ? <Link className={`tier ${tierClass(tier)}`} href={href}>{inner}</Link> : <span className={`tier ${tierClass(tier)}`}>{inner}</span>;
}

export function PostVouch({ v, viewerId, counts, menu = true }: { v: VouchWithBoth; viewerId: string | null; counts?: ReactionCount; menu?: boolean }) {
  if (!v.author || !v.subject) return null;
  const c = counts ?? noCounts(v.id);
  return (
    <article className="post-item">
      <Link href={`/${v.author.username}`} aria-label={v.author.display_name}><Avatar name={v.author.display_name} url={v.author.avatar_url} size={40} /></Link>
      <div className="col">
        <div className="hd">
          <Link href={`/${v.author.username}`}>{v.author.display_name}</Link>
          <span className="h">@{v.author.username} · {timeAgo(v.approved_at ?? v.created_at)}</span>
          {menu && <VouchMenu vouchId={v.id} isAuthor={viewerId === v.author_id} isSubject={viewerId === v.subject_id} subjectFirst={first(v.subject.display_name)} signedIn={!!viewerId} />}
        </div>
        <div className="txt">vouched for <Link href={`/${v.subject.username}`}>{v.subject.display_name}</Link></div>
        <div className="quote">
          <span className="rel">{v.relationship} · {v.duration}</span>
          <blockquote>{v.body}</blockquote>
          {v.traits.length > 0 && <div className="row" style={{ gap: 6 }}>{v.traits.map(t => <span key={t} className="tag">{t}</span>)}</div>}
          <span className="sig">{v.author.display_name}</span>
        </div>
        {v.reply && <div className="reply"><b>{first(v.subject.display_name)} replied</b><span>{v.reply}</span></div>}
        <ReactBar type="vouch" id={v.id} n={Number(c.n)} top={c.top} mine={c.mine} comments={Number(c.comments)} viewerId={viewerId}
          giftTo={{ id: v.subject_id, name: v.subject.display_name }} shareUrl={`/${v.subject.username}`} />
      </div>
    </article>
  );
}

export function PostGift({ g, viewerId, counts }: { g: GiftWithPeople; viewerId: string | null; counts?: ReactionCount }) {
  if (!g.sender || !g.receiver) return null;
  const c = counts ?? noCounts(g.id);
  return (
    <article className="post-item">
      <Link href={`/${g.sender.username}`} aria-label={g.sender.display_name}><Avatar name={g.sender.display_name} url={g.sender.avatar_url} size={40} /></Link>
      <div className="col">
        <div className="hd"><Link href={`/${g.sender.username}`}>{g.sender.display_name}</Link><span className="h">· {timeAgo(g.created_at)}</span></div>
        <div className="gift-card">
          <span className="g">{g.type?.emoji ?? '🎁'}</span>
          <div><b>{g.type?.label ?? 'Gift'}</b> for <Link href={`/${g.receiver.username}`} style={{ fontWeight: 700, textDecoration: 'none' }}>{g.receiver.display_name}</Link>
            {g.note && <div className="muted small">“{g.note}”</div>}</div>
        </div>
        <ReactBar type="gift" id={g.id} n={Number(c.n)} top={c.top} mine={c.mine} comments={Number(c.comments)} viewerId={viewerId} shareUrl={`/${g.receiver.username}`} />
      </div>
    </article>
  );
}

export function PostResult({ r }: { r: { username: string; display_name: string; avatar_url: string | null; question: string; label: string; emoji: string | null; n: number } }) {
  return (
    <article className="post-item">
      <Link href={`/${r.username}`} aria-label={r.display_name}><Avatar name={r.display_name} url={r.avatar_url} size={40} /></Link>
      <div className="col">
        <div className="ctx"><Icon name="sparkle" size="xs" /> This week’s polls</div>
        <div className="hd"><Link href={`/${r.username}`}>{r.display_name}</Link><span className="h">was voted</span></div>
        <div className="result-card"><span className="q">{r.question}</span><span className="a">{r.emoji} {r.label} <span className="muted" style={{ fontWeight: 600, fontSize: 14 }}>· {r.n} votes</span></span></div>
        <div className="row"><Link className="btn sm ghost" href="/props">Vote in today’s polls</Link></div>
      </div>
    </article>
  );
}

export function PostJoin({ j }: { j: { username: string; display_name: string; avatar_url: string | null; created_at: string; inviter: { username: string; display_name: string; avatar_url: string | null } } }) {
  return (
    <article className="post-item">
      <Link href={`/${j.inviter.username}`} aria-label={j.inviter.display_name}><Avatar name={j.inviter.display_name} url={j.inviter.avatar_url} size={40} /></Link>
      <div className="col">
        <div className="hd"><Link href={`/${j.inviter.username}`}>{j.inviter.display_name}</Link><span className="h">· {timeAgo(j.created_at)}</span></div>
        <div className="txt">vouched <Link href={`/${j.username}`}>{j.display_name}</Link> in. Welcome to Vouched 👋</div>
      </div>
    </article>
  );
}

export function CaughtUp() {
  return (
    <div className="caught">
      <span className="ok"><Icon name="check" /></span>
      <b style={{ color: 'var(--ink)' }}>You’re all caught up</b>
      <span className="small">You’ve seen everything new from the last few days.</span>
    </div>
  );
}

export function Radar({ rows }: { rows: PersonalityRow[] }) {
  const data = AXES.map(a => [a, Number(rows.find(r => r.trait === a)?.score ?? 0)] as const);
  const cx = 150, cy = 135, R = 95, n = data.length;
  const pt = (i: number, r: number) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
  const ring = (k: number) => data.map((_, i) => pt(i, R * k).join(',')).join(' ');
  const shape = data.map(([, v], i) => pt(i, R * Math.max(0.12, v)).join(',')).join(' ');
  return (
    <svg className="radar" viewBox="0 0 300 270" role="img" aria-label={`Personality: ${data.map(([a, v]) => `${a} ${Math.round(v * 100)}%`).join(', ')}`}>
      {[0.33, 0.66, 1].map(k => <polygon key={k} className="grid" points={ring(k)} />)}
      {data.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} className="grid" x1={cx} y1={cy} x2={x} y2={y} />; })}
      <polygon className="shape" points={shape} />
      {data.map(([a], i) => { const [x, y] = pt(i, R + 18); return <text key={a} x={x} y={y + 4} textAnchor="middle">{a}</text>; })}
    </svg>
  );
}

export function GiftShelf({ gifts }: { gifts: GiftWithPeople[] }) {
  if (!gifts.length) return <p className="muted">No gifts yet.</p>;
  return (
    <div className="giftshelf">
      {gifts.map(g => (
        <Link key={g.id} className="gs" href={g.sender ? `/${g.sender.username}` : '#'} title={`${g.type?.label ?? 'Gift'} from ${g.sender?.display_name ?? 'someone'}`}>
          <span className="g">{g.type?.emoji ?? '🎁'}</span><span>{first(g.sender?.display_name)}</span>
        </Link>
      ))}
    </div>
  );
}
