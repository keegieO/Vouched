import Link from 'next/link';
import { notFound } from 'next/navigation';
import { REPORT_REASONS, timeAgo, type ReportReason } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { ReportActions, StandingForm } from './AdminActions';

export const metadata = { title: 'Admin' };
export const dynamic = 'force-dynamic';

type Report = {
  id: string; reason: ReportReason; details: string | null; status: string; created_at: string; admin_note: string | null;
  reporter_username: string | null; profile_id: string | null; profile_username: string | null; profile_name: string | null; profile_standing: string | null;
  vouch_id: string | null; vouch_body: string | null; vouch_status: string | null;
  vouch_author_id: string | null; vouch_author_username: string | null; vouch_subject_username: string | null; reports_on_target: number;
};
type Stats = { members: number; joined_7d: number; vouches: number; props: number; open_reports: number; removed: number; feedback_7d: number };
type Feedback = { id: string; kind: string; body: string; platform: string | null; app_version: string | null; page: string | null; created_at: string; username: string | null };

export default async function Admin({ searchParams }: { searchParams: { tab?: string } }) {
  const { supabase, profile } = await getViewer();
  if (!profile) notFound();
  const { data: ok } = await supabase.rpc('is_admin');
  if (!ok) notFound();
  const tab = searchParams.tab === 'done' ? 'done' : searchParams.tab === 'feedback' ? 'feedback' : 'open';

  const [{ data: st }, { data: reps }, { data: fb }] = await Promise.all([
    supabase.rpc('admin_stats'),
    tab === 'feedback' ? Promise.resolve({ data: [] }) : supabase.rpc('admin_reports', { status_filter: tab === 'open' ? 'open' : null, lim: 100 }),
    tab === 'feedback' ? supabase.rpc('admin_feedback', { lim: 100 }) : Promise.resolve({ data: [] }),
  ]);
  const stats = ((st ?? []) as Stats[])[0];
  const reports = ((reps ?? []) as Report[]).filter(r => tab === 'open' || r.status !== 'open');
  const feedback = (fb ?? []) as Feedback[];

  return (
    <Screen title="Admin" back="/settings">
      {stats && (
        <div className="statrow" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className="stat"><b>{stats.members}</b><span>members</span></div>
          <div className="stat"><b>{stats.joined_7d}</b><span>joined 7d</span></div>
          <div className="stat"><b>{stats.vouches}</b><span>vouches</span></div>
          <div className="stat"><b>{stats.props}</b><span>props</span></div>
          <div className={`stat ${stats.open_reports ? 'flag' : ''}`}><b>{stats.open_reports}</b><span>open reports</span></div>
          <div className="stat"><b>{stats.removed}</b><span>removed</span></div>
          <div className="stat"><b>{stats.feedback_7d}</b><span>feedback 7d</span></div>
        </div>
      )}
      <nav className="segmented" aria-label="Admin">
        <Link href="/admin" aria-current={tab === 'open' ? 'page' : undefined}>Open reports</Link>
        <Link href="/admin?tab=done" aria-current={tab === 'done' ? 'page' : undefined}>Resolved</Link>
        <Link href="/admin?tab=feedback" aria-current={tab === 'feedback' ? 'page' : undefined}>Feedback</Link>
      </nav>

      {tab !== 'feedback' && (reports.length ? reports.map(r => (
        <section key={r.id} className="card stack">
          <div className="row between">
            <span className={`pill ${r.reason === 'scam' || r.reason === 'fake' ? 'flag' : ''}`}>{REPORT_REASONS[r.reason] ?? r.reason}</span>
            <span className="hint">{timeAgo(r.created_at)} · by @{r.reporter_username ?? 'deleted'}{r.reports_on_target > 1 ? ` · ${r.reports_on_target} reports on this` : ''}</span>
          </div>
          {r.profile_id && (
            <p>Account: <Link href={`/${r.profile_username}`}><b>{r.profile_name}</b> @{r.profile_username}</Link>{r.profile_standing === 'removed' ? ' · removed' : ''}</p>
          )}
          {r.vouch_id && (
            <div className="quote">
              <span className="rel">Vouch by @{r.vouch_author_username ?? 'deleted'} for @{r.vouch_subject_username ?? 'deleted'} · {r.vouch_status}</span>
              <blockquote>{r.vouch_body}</blockquote>
            </div>
          )}
          {!r.profile_id && !r.vouch_id && <p className="hint">The reported account or vouch was already deleted.</p>}
          {r.details && <p className="muted">“{r.details}”</p>}
          {r.status === 'open'
            ? <ReportActions id={r.id} hasVouch={!!r.vouch_id} canRemove={!!(r.profile_id || r.vouch_author_id)} />
            : <p className="hint">{r.status === 'dismissed' ? 'Dismissed' : 'Action taken'}{r.admin_note ? ` — ${r.admin_note}` : ''}</p>}
        </section>
      )) : <div className="empty"><p>{tab === 'open' ? 'No open reports. Nice.' : 'Nothing resolved yet.'}</p></div>)}

      {tab === 'feedback' && (feedback.length ? (
        <section className="list">
          {feedback.map(f => (
            <div key={f.id} className="person" style={{ alignItems: 'flex-start' }}>
              <span className="grow">
                <b>{f.kind === 'bug' ? 'Bug' : f.kind === 'idea' ? 'Idea' : 'Other'}</b> <span className="hint">@{f.username ?? 'deleted'} · {f.platform ?? '?'} {f.app_version ?? ''} · {timeAgo(f.created_at)}{f.page ? ` · ${f.page}` : ''}</span>
                <br /><span style={{ whiteSpace: 'pre-wrap' }}>{f.body}</span>
              </span>
            </div>
          ))}
        </section>
      ) : <div className="empty"><p>No feedback yet.</p></div>)}

      <span className="label list-head">Remove or restore by username</span>
      <StandingForm />
      <p className="hint">Only remove for verified scams or fake accounts. Removing hides the account, hides the vouches they wrote, and marks the record of everyone who vouched for or vouched them in.</p>
    </Screen>
  );
}
