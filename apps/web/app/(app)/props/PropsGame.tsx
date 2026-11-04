'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { pickPrompts, PROPS_PER_ROUND, type Prompt, type PropOption } from '@vouched/shared';
import { createClient } from '@/lib/supabase/client';
import { Avatar } from '@/components/ui';
import { Icon } from '@/components/Icon';

function burst() {
  const b = document.createElement('div'); b.className = 'burst';
  const cols = ['var(--hi)', '#fff', 'var(--acc-d)', '#FF8FB8'];
  for (let i = 0; i < 26; i++) {
    const s = document.createElement('i'), a = Math.random() * Math.PI * 2, d = 120 + Math.random() * 180;
    s.style.cssText = `left:50%;top:60%;background:${cols[i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 80}px`;
    b.appendChild(s);
  }
  document.body.appendChild(b); setTimeout(() => b.remove(), 1000);
}

export function PropsGame({ prompts }: { prompts: Prompt[] }) {
  const [supabase] = useState(() => createClient());
  const router = useRouter();
  const [round] = useState(() => pickPrompts(prompts, PROPS_PER_ROUND));
  const [i, setI] = useState(0);
  const [opts, setOpts] = useState<PropOption[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [given, setGiven] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    const { data } = await supabase.rpc('prop_options', { n: 4 });
    setOpts((data ?? []) as PropOption[]);
  }, [supabase]);
  useEffect(() => { loadOptions(); }, [loadOptions]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') router.push('/feed'); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [router]);

  async function pick(p: PropOption) {
    if (picked) return;
    setPicked(p.id); setNote(null);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('props').insert({ giver_id: user!.id, receiver_id: p.id, prompt_id: round[i].id });
    if (error) { setPicked(null); setNote(error.message); return; }
    burst(); setGiven(g => g + 1);
    setTimeout(() => { setPicked(null); setI(x => x + 1); loadOptions(); }, 650);
  }
  const skip = () => { setNote(null); setI(x => x + 1); loadOptions(); };

  if (!round.length) return <div className="game game-page"><div className="inner"><h1>No questions right now.</h1><Link className="btn hi" href="/feed">Back</Link></div></div>;

  if (i >= round.length) {
    return (
      <div className="game game-page">
        <div className="inner" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
          <span className="emoji-q"><Icon name="sparkle" /></span>
          <h1>{given ? `You made ${given} ${given === 1 ? 'person’s' : 'people’s'} day.` : 'Round over.'}</h1>
          <p style={{ opacity: .75, maxWidth: '24em' }}>They’ll see someone picked them, not who.</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link className="btn hi lg" href="/feed">Done</Link>
            <Link className="btn lg" style={{ color: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--surface) 30%, transparent)' }} href="/inbox">See your props</Link>
          </div>
        </div>
      </div>
    );
  }

  const q = round[i];
  return (
    <div className="game game-page">
      <div className="inner">
        <div className="row between nowrap">
          <Link className="iconbtn" style={{ color: 'var(--surface)' }} href="/feed" aria-label="Close"><Icon name="x" /></Link>
          <div className="bar grow" style={{ padding: '0 6px' }}>{round.map((_, k) => <i key={k} className={k <= i ? 'on' : ''} />)}</div>
          <span className="label" style={{ color: 'color-mix(in srgb, var(--surface) 70%, transparent)' }}>{i + 1}/{round.length}</span>
        </div>
        <span className="emoji-q"><Icon name={q.icon} /></span>
        <h1>{q.question}</h1>
        {note && <p role="status" style={{ color: 'var(--hi)' }}>{note}</p>}
        {opts.length ? (
          <div className="picks">
            {opts.map(p => (
              <button key={p.id} className={`pick ${picked === p.id ? 'chosen' : ''}`} onClick={() => pick(p)} disabled={!!picked && picked !== p.id}>
                <Avatar name={p.display_name} url={p.avatar_url} size={56} />
                {p.display_name}
                <span>{p.headline ? p.headline.split('.')[0] : `@${p.username}`}</span>
              </button>
            ))}
          </div>
        ) : <p style={{ opacity: .75, marginTop: 'auto' }}>Follow a few people first so we have friends to show you.</p>}
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="ghostbtn" onClick={loadOptions}><Icon name="shuffle" size="sm" /> Shuffle</button>
          <button className="ghostbtn" onClick={skip}>Skip</button>
        </div>
      </div>
    </div>
  );
}
