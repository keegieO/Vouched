'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { SearchResult } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { PersonRow, usePeopleSearch } from './social';
import { useToast } from './client';

/** Pick someone to vouch for, or to ask for a vouch. */
export function PeoplePicker({ mode, viewerId, initial, done }: { mode: 'write' | 'request'; viewerId: string; initial: SearchResult[]; done: string[] }) {
  const { q, setQ, results, loading } = usePeopleSearch(initial);
  const [asked, setAsked] = useState<string[]>([]);
  const [toast, show] = useToast();
  const list = results.filter(p => p.id !== viewerId);

  async function request(p: SearchResult) {
    const { error } = await createClient().from('vouch_requests').insert({ requester_id: viewerId, recipient_id: p.id });
    if (error) return show(error.code === '23505' ? `You already asked ${p.display_name.split(' ')[0]}.` : error.message);
    setAsked([...asked, p.id]);
    show(`Asked ${p.display_name.split(' ')[0]} to vouch for you`);
  }

  const action = (p: SearchResult) => mode === 'write'
    ? <Link className="btn sm primary" href={`/${p.username}/vouch`}>{done.includes(p.id) ? 'Edit' : 'Vouch'}</Link>
    : done.includes(p.id) ? <span className="hint">Vouched</span>
    : asked.includes(p.id) ? <button className="btn sm soft" disabled>Asked</button>
    : <button className="btn sm primary" onClick={() => request(p)}>Request</button>;

  return (
    <>
      {toast}
      <label className="search">
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>
        <span className="sr-only">Search people</span>
        <input id="picker-q" className="input" type="search" placeholder="Search people" value={q} onChange={e => setQ(e.target.value)} autoComplete="off" />
      </label>
      {!q.trim() && <span className="label">{initial.length ? 'People you follow' : 'Search for someone you know'}</span>}
      {loading ? <p className="hint">Searching…</p> : list.length ? (
        <section className="list">{list.map(p => <PersonRow key={p.id} p={p} viewerId={viewerId} following action={action(p)} />)}</section>
      ) : q.trim() ? <div className="empty"><p>No one matches “{q}”.</p></div> : null}
    </>
  );
}
