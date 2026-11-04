import Link from 'next/link';
import { stepsLabel, type PropCount, type TrackRecord, type TrustStep } from '@vouched/shared';
import { Avatar } from './ui';
import { Icon } from './Icon';

/** "You → Ben → Marcus" — the chain of real vouches between the viewer and someone. */
export function TrustPath({ steps, viewerId }: { steps: TrustStep[]; viewerId?: string | null }) {
  return (
    <div className="path">
      {steps.map((s, i) => (
        <span key={s.id} style={{ display: 'contents' }}>
          {i > 0 && <div className="edge"><i /><span>{s.via}</span></div>}
          <Link className="node" href={`/${s.username}`}>
            <Avatar name={s.display_name} url={s.avatar_url} size={44} />
            <b>{s.id === viewerId ? 'You' : s.display_name.split(' ')[0]}</b>
          </Link>
        </span>
      ))}
    </div>
  );
}

export function TrustPathCard({ steps, viewerId }: { steps: TrustStep[]; viewerId: string }) {
  if (steps.length < 2) {
    return (
      <section className="pathcard none">
        <span className="label">How you’re connected</span>
        <p className="small muted">No chain of vouches links you within 3 steps. Be careful meeting someone with no connection to your circle.</p>
      </section>
    );
  }
  return (
    <section className="pathcard">
      <div className="row between">
        <span className="label" style={{ color: 'var(--accent)' }}>How you’re connected</span>
        <span className="steps-chip" style={{ background: 'var(--card)' }}>{stepsLabel(steps.length - 1)}</span>
      </div>
      <TrustPath steps={steps} viewerId={viewerId} />
    </section>
  );
}

export function Ring({ left, total }: { left: number; total: number }) {
  const r = 19, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(left, total)) / total);
  return (
    <svg className="ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle className="bgc" cx="24" cy="24" r={r} />
      <circle className="fgc" cx="24" cy="24" r={r} strokeDasharray={c} strokeDashoffset={off} transform="rotate(-90 24 24)" />
      <text x="24" y="29" textAnchor="middle">{left}</text>
    </svg>
  );
}

export function Quota({ left, total, title, hint, action }: { left: number; total: number; title: string; hint?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="quota" aria-label={title}>
      <Ring left={left} total={total} />
      <div className="grow"><b>{title}</b>{hint && <p className="hint">{hint}</p>}</div>
      {action}
    </section>
  );
}

export function RecordBar({ record, name, isMe }: { record: TrackRecord; name: string; isMe: boolean }) {
  const who = isMe ? 'You’ve' : `${name} has`;
  return (
    <div className={`record ${record.removed ? 'flag' : ''}`}>
      <Icon name={record.removed ? 'flag' : 'shield'} />
      <div className="grow">
        <b>{record.removed
          ? `${record.removed} of ${record.backed} people ${isMe ? 'you' : name} backed ${record.removed === 1 ? 'was' : 'were'} removed for scam or fake-account reports`
          : `${who} backed ${record.backed} ${record.backed === 1 ? 'person' : 'people'}. All in good standing.`}</b>
        <br />
        <span>{record.removed ? 'Their vouches count for less until their record recovers.' : 'Backing people who turn out well makes your vouches count for more.'}</span>
      </div>
    </div>
  );
}

export function PropsCloud({ props, max = 5 }: { props: PropCount[]; max?: number }) {
  if (!props.length) return null;
  return (
    <div className="props-cloud">
      {props.slice(0, max).map(p => (
        <span key={p.prompt_id} className="prop"><Icon name={p.icon} size="xs" /> {p.label} <span className="n">×{p.n}</span></span>
      ))}
    </div>
  );
}

export function PropsCard({ given, total }: { given: number; total: number }) {
  const done = given >= total;
  return (
    <section className="propcard">
      <span className="label">Today’s props · {Math.min(given, total)}/{total}</span>
      <h2>{done ? 'You made some people’s day.' : 'Who would you call at 2am if your car broke down?'}</h2>
      <p style={{ color: 'color-mix(in srgb, var(--surface) 72%, transparent)', fontSize: 14, maxWidth: '26em' }}>
        {done ? 'New questions tomorrow. Props you get show up in Activity.' : 'Tap a friend. It’s anonymous, takes ten seconds, and shows up on their page.'}
      </p>
      <div><Link className="btn hi" href="/props">{done ? 'Play another round' : given ? 'Keep going' : 'Give props'}</Link></div>
    </section>
  );
}
