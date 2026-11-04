'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { REPORT_REASONS, type ReportReason, type VouchWithAuthor } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { VouchCard } from './VouchCard';

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2600);
    return () => clearTimeout(t);
  }, [msg]);
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return [node, setMsg] as const;
}

export function CopyButton({ text, label = 'Copy', done = 'Copied', className = 'btn sm primary' }: { text: string; label?: string; done?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt('Copy this:', text);
    }
  }
  return <button type="button" className={className} onClick={copy}>{copied ? done : label}</button>;
}

export function ShareButton({ url, title, text, className = 'btn ghost' }: { url: string; title: string; text?: string; className?: string }) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== 'undefined' && !!navigator.share), []);
  if (!canShare) return <CopyButton text={url} label="Copy link" done="Link copied" className={className} />;
  return (
    <button type="button" className={className} onClick={() => navigator.share({ url, title, text }).catch(() => {})}>
      Share
    </button>
  );
}

/** "⋯" menu on a vouch or profile with Report (and optional extra items). */
export function ReportMenu({ vouchId, profileId, signedIn }: { vouchId?: string; profileId?: string; signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('fake');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const router = useRouter();

  async function send() {
    setState('sending');
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return router.push('/login');
    const { error } = await supabase.from('reports').insert({
      reporter_id: user.id, vouch_id: vouchId ?? null, profile_id: profileId ?? null, reason, details: details || null,
    });
    setState(error ? 'error' : 'sent');
  }

  return (
    <>
      <details className="menu">
        <summary aria-label="More options">⋯</summary>
        <div>
          <button type="button" onClick={e => { (e.currentTarget.closest('details') as HTMLDetailsElement).open = false; signedIn ? setOpen(true) : router.push('/login'); }}>
            Report
          </button>
        </div>
      </details>
      {open && (
        <div className="dialog-backdrop" onClick={e => e.target === e.currentTarget && setOpen(false)}>
          <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title">
            {state === 'sent' ? (
              <>
                <h2 id="report-title">Thanks for telling us</h2>
                <p className="muted">We review every report. If it breaks the rules, we remove it.</p>
                <button className="btn primary" onClick={() => setOpen(false)}>Done</button>
              </>
            ) : (
              <>
                <h2 id="report-title">Report {vouchId ? 'this vouch' : 'this profile'}</h2>
                <div className="stack" role="radiogroup">
                  {(Object.keys(REPORT_REASONS) as ReportReason[]).map(r => (
                    <label key={r} className="check">
                      <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
                      {REPORT_REASONS[r]}
                    </label>
                  ))}
                </div>
                <label className="field">
                  <span>Anything else? (optional)</span>
                  <textarea id="report-details" maxLength={500} value={details} onChange={e => setDetails(e.target.value)} style={{ minHeight: 80 }} />
                </label>
                {state === 'error' && <p className="error">That didn’t send. Check your connection and try again.</p>}
                <div className="row">
                  <button className="btn primary" disabled={state === 'sending'} onClick={send}>Send report</button>
                  <button className="btn ghost" onClick={() => setOpen(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/** Approved vouches with relationship filter chips. */
export function VouchList({ vouches, signedIn, emptyText, viewerId = null, subjectFirstName }: {
  vouches: VouchWithAuthor[]; signedIn: boolean; emptyText: string; viewerId?: string | null; subjectFirstName?: string;
}) {
  const [filter, setFilter] = useState('All');
  const circles = ['All', ...Array.from(new Set(vouches.map(v => v.relationship)))];
  const shown = filter === 'All' ? vouches : vouches.filter(v => v.relationship === filter);
  if (!vouches.length) return <div className="empty">{emptyText}</div>;
  return (
    <div className="stack">
      {circles.length > 2 && (
        <div className="row" role="group" aria-label="Filter by relationship" style={{ gap: 6 }}>
          {circles.map(c => (
            <button key={c} type="button" className="chip" aria-pressed={c === filter} onClick={() => setFilter(c)}>
              {c}{c !== 'All' && <span className="n">{vouches.filter(v => v.relationship === c).length}</span>}
            </button>
          ))}
        </div>
      )}
      {shown.map(v => (
        <VouchCard key={v.id} v={v} menu={<ReportMenu vouchId={v.id} signedIn={signedIn} />}
          social={subjectFirstName ? { viewerId, subjectFirstName } : undefined} />
      ))}
    </div>
  );
}
