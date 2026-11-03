'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BODY_MAX, DURATIONS, MAX_TRAITS, RELATIONSHIPS, TRAITS, vouchError, type Vouch } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';

type Props = {
  subjectId: string; subjectUsername: string; firstName: string; authorId: string; authorName: string; existing: Vouch | null;
};

export function VouchForm({ subjectId, subjectUsername, firstName, authorId, authorName, existing }: Props) {
  const router = useRouter();
  const [relationship, setRelationship] = useState<string>(existing?.relationship ?? '');
  const [duration, setDuration] = useState<string>(existing?.duration ?? DURATIONS[3]);
  const [traits, setTraits] = useState<string[]>(existing?.traits ?? []);
  const [body, setBody] = useState(existing?.body ?? '');
  const [agree, setAgree] = useState(!!existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const problem = vouchError({ relationship, duration, traits, body });

  function toggleTrait(t: string) {
    setTraits(cur => cur.includes(t) ? cur.filter(x => x !== t) : cur.length < MAX_TRAITS ? [...cur, t] : cur);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (problem) return setError(problem);
    if (!agree) return setError('Confirm the vouch is true and positive.');
    setBusy(true); setError(null);
    const supabase = createClient();
    const { error } = existing
      ? await supabase.rpc('edit_my_vouch', { p_vouch_id: existing.id, p_relationship: relationship, p_duration: duration, p_traits: traits, p_body: body.trim() })
      : await supabase.from('vouches').insert({ subject_id: subjectId, author_id: authorId, relationship, duration, traits, body: body.trim() });
    setBusy(false);
    if (error) return setError(error.code === '23505' ? 'You already vouched for this person. Reload to edit it.' : error.message);
    router.push(`/${subjectUsername}/vouch/sent${existing ? '?edited=1' : ''}`);
  }

  return (
    <form className="stack-lg" onSubmit={submit}>
      <div className="field"><span>How do you know {firstName}?</span>
        <div className="row" role="group" style={{ gap: 6 }}>
          {RELATIONSHIPS.map(r => (
            <button key={r} type="button" className="chip" aria-pressed={relationship === r} onClick={() => setRelationship(r)}>{r}</button>
          ))}
        </div>
      </div>

      <label className="field" htmlFor="duration"><span>For how long?</span>
        <select id="duration" value={duration} onChange={e => setDuration(e.target.value)}>
          {DURATIONS.map(d => <option key={d}>{d}</option>)}
        </select>
      </label>

      <div className="field"><span>Pick up to {MAX_TRAITS} that fit</span>
        <div className="row" role="group" style={{ gap: 6 }}>
          {TRAITS.map(t => (
            <button key={t} type="button" className="chip" aria-pressed={traits.includes(t)} onClick={() => toggleTrait(t)}
              disabled={!traits.includes(t) && traits.length >= MAX_TRAITS}>{t}</button>
          ))}
        </div>
      </div>

      <label className="field" htmlFor="body"><span>Say it in your words</span>
        <textarea id="body" maxLength={BODY_MAX} value={body} onChange={e => setBody(e.target.value)}
          placeholder={`A real moment beats a compliment. What did ${firstName} do?`} />
        <span className="hint" style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{body.length}/{BODY_MAX}</span>
      </label>

      <label className="check">
        <input id="agree" type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} />
        <span>This is true, positive, and shares nothing private like an address or health info. It will be signed <b>{authorName}</b>.</span>
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <button className="btn primary block" disabled={busy || !!problem || !agree}>
        {busy ? 'Sending…' : existing ? 'Save and resend' : 'Post vouch'}
      </button>
      <p className="hint">{firstName} approves it before it shows on their profile.</p>
    </form>
  );
}
