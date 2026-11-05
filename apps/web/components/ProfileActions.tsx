'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import qrcode from 'qrcode-generator';
import { REPORT_REASONS, type ReportReason } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { useToast } from './client';
import { PrivateNoteSheet } from './v2';

function QR({ text }: { text: string }) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) d += `M${x} ${y}h1v1h-1z`;
  return (
    <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} role="img" aria-label={`QR code for ${text}`}>
      <rect x={-2} y={-2} width={n + 4} height={n + 4} fill="#fff" />
      <path d={d} fill="#0F1424" />
    </svg>
  );
}

export function ShareSheet({ open, onClose, url, name }: { open: boolean; onClose: () => void; url: string; name: string }) {
  const [toast, show] = useToast();
  async function copy() {
    try { await navigator.clipboard.writeText(url); show('Link copied'); } catch { show('Press and hold the link to copy it.'); }
  }
  return (
    <Sheet open={open} onClose={onClose} title={`Share ${name}`}>
      {toast}
      <div className="qr"><QR text={url} /></div>
      <p className="hint" style={{ textAlign: 'center' }}>Scan to open {url.replace(/^https?:\/\//, '')}</p>
      <div className="linkbox"><code>{url.replace(/^https?:\/\//, '')}</code><button type="button" className="btn sm primary" onClick={copy}>Copy</button></div>
      {typeof navigator !== 'undefined' && 'share' in navigator && (
        <button type="button" className="btn soft" onClick={() => navigator.share({ url, title: `${name} on Vouched` }).catch(() => {})}>
          <Icon name="share" size="sm" /> Share to an app
        </button>
      )}
    </Sheet>
  );
}

export function ShareIconButton({ url, name, label = 'Share' }: { url: string; name: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="iconbtn" aria-label={label} onClick={() => setOpen(true)}><Icon name="share" /></button>
      <ShareSheet open={open} onClose={() => setOpen(false)} url={url} name={name} />
    </>
  );
}

export function ShareButton({ url, name }: { url: string; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn soft" onClick={() => setOpen(true)}><Icon name="qr" size="sm" /> Share</button>
      <ShareSheet open={open} onClose={() => setOpen(false)} url={url} name={name} />
    </>
  );
}

/** "⋯" on someone else's profile: share, ask them to vouch, report, block. */
export function ProfileMenu({ targetId, firstName, url, viewerId, blocked, fullName }: { targetId: string; firstName: string; url: string; viewerId: string | null; blocked: boolean; fullName?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<'menu' | 'share' | 'report' | 'block' | 'note' | null>(null);
  const [reason, setReason] = useState<ReportReason>('fake');
  const [details, setDetails] = useState('');
  const [sent, setSent] = useState(false);
  const [toast, show] = useToast();
  const supabase = createClient();
  const close = () => { setOpen(null); setSent(false); };

  async function requestVouch() {
    if (!viewerId) return router.push('/login?mode=signup');
    const { error } = await supabase.from('vouch_requests').insert({ requester_id: viewerId, recipient_id: targetId });
    close();
    show(error ? (error.code === '23505' ? `You already asked ${firstName}.` : error.message) : `Asked ${firstName} to vouch for you`);
  }
  async function report() {
    if (!viewerId) return router.push('/login');
    await supabase.from('reports').insert({ reporter_id: viewerId, profile_id: targetId, reason, details: details || null });
    setSent(true);
  }
  async function toggleBlock() {
    if (!viewerId) return router.push('/login');
    const { error } = blocked
      ? await supabase.from('blocks').delete().eq('blocker_id', viewerId).eq('blocked_id', targetId)
      : await supabase.from('blocks').insert({ blocker_id: viewerId, blocked_id: targetId });
    close();
    show(error ? error.message : blocked ? 'Unblocked' : 'Blocked');
    router.refresh();
  }

  return (
    <>
      {toast}
      <button type="button" className="iconbtn raised" aria-label="More options" onClick={() => setOpen('menu')}><Icon name="more" size="sm" /></button>
      <Sheet open={open === 'menu'} onClose={close} title={firstName}>
        <button type="button" className="sheet-opt" onClick={() => setOpen('share')}><span className="ico"><Icon name="qr" /></span><span><b>Share profile</b><span>QR code and link</span></span></button>
        {viewerId && <button type="button" className="sheet-opt" onClick={() => setOpen('note')}><span className="ico"><Icon name="lock" /></span><span><b>Send private feedback</b><span>Only {firstName} sees it</span></span></button>}
        {viewerId && <button type="button" className="sheet-opt" onClick={requestVouch}><span className="ico"><Icon name="send" /></span><span><b>Ask {firstName} to vouch for you</b><span>They’ll get a notification</span></span></button>}
        <button type="button" className="sheet-opt" onClick={() => (viewerId ? setOpen('report') : router.push('/login'))}><span className="ico"><Icon name="flag" /></span><span><b>Report</b><span>Fake account, harassment or spam</span></span></button>
        {viewerId && <button type="button" className="sheet-opt" onClick={() => setOpen('block')}><span className="ico" style={{ background: 'var(--bad-soft)', color: 'var(--bad)' }}><Icon name="ban" /></span><span><b>{blocked ? 'Unblock' : 'Block'} {firstName}</b><span>They can’t vouch, follow or co-sign</span></span></button>}
      </Sheet>
      <ShareSheet open={open === 'share'} onClose={close} url={url} name={firstName} />
      <Sheet open={open === 'report'} onClose={close} title={sent ? 'Thanks for telling us' : 'Report this account'}>
        {sent ? (
          <><p className="muted">We review every report. If it breaks the rules, we remove it.</p><button className="btn primary" onClick={close}>Done</button></>
        ) : (
          <>
            <div className="stack">
              {(Object.keys(REPORT_REASONS) as ReportReason[]).map(r => (
                <label key={r} className="check"><input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {REPORT_REASONS[r]}</label>
              ))}
            </div>
            <textarea id="report-profile-details" className="input" maxLength={500} style={{ minHeight: 70 }} placeholder="Anything else? (optional)" value={details} onChange={e => setDetails(e.target.value)} />
            <button className="btn primary" onClick={report}>Send report</button>
          </>
        )}
      </Sheet>
      <Sheet open={open === 'block'} onClose={close} title={blocked ? `Unblock ${firstName}?` : `Block ${firstName}?`}>
        <p className="muted">{blocked ? 'They’ll be able to vouch for you and follow you again.' : 'They won’t be able to vouch for you, follow you or co-sign your vouches.'}</p>
        <button className={`btn ${blocked ? 'primary' : 'danger'}`} onClick={toggleBlock}>{blocked ? 'Unblock' : 'Block'}</button>
        <button className="btn ghost" onClick={close}>Cancel</button>
      </Sheet>
      {viewerId && <PrivateNoteSheet open={open === 'note'} onClose={close} toId={targetId} toName={fullName ?? firstName} viewerId={viewerId} />}
    </>
  );
}

export function LinkChip({ href, platform, label, icon }: { href: string; platform: string; label: string; icon: string }) {
  return (
    <Link className="linkchip" href={href} target="_blank" rel="noopener noreferrer nofollow">
      <Icon name={icon} size="xs" /><span className="plat">{platform}</span>{label}
    </Link>
  );
}
