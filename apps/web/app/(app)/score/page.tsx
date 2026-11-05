import Link from 'next/link';
import type { MyTrust } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { TierPill } from '@/components/posts';
import { Icon } from '@/components/Icon';

export const metadata = { title: 'Trust score' };
const ICON: Record<string, string> = { vouches: '✍️', circles: '🧭', verified: '🪪', tenure: '📅', record: '🛡️', withdrawn: '↩️', vouch_again: '🤐', reports: '🚫', quiet: '💤' };

export default async function ScorePage() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const { data } = await supabase.rpc('my_trust');
  const t = ((data ?? []) as MyTrust[])[0] ?? { score: 0, tier: 'New', next_tier: 'Known', points_to_next: 25, factors: [] };
  const r = 60, c = 2 * Math.PI * r;
  return (
    <Screen title="Trust score" back className="flush">
      <div className="score-hero">
        <svg className="gauge" viewBox="0 0 180 180" role="img" aria-label={`Trust score ${t.score} out of 100`}>
          <circle className="bg" cx="90" cy="90" r={r} />
          <circle className="fg" cx="90" cy="90" r={r} strokeDasharray={c} strokeDashoffset={c * (1 - t.score / 100)} transform="rotate(-90 90 90)" />
          <text x="90" y="98" textAnchor="middle">{t.score}</text>
          <text className="lbl" x="90" y="120" textAnchor="middle">out of 100</text>
        </svg>
        <TierPill tier={t.tier} />
        <p className="muted small" style={{ textAlign: 'center', maxWidth: '30em' }}>
          Everyone sees your tier. Only you see the number.
          {t.next_tier && <> <b style={{ color: 'var(--ink)' }}>{t.points_to_next} more points</b> to reach {t.next_tier}.</>}
        </p>
      </div>
      <div className="sec-label">What’s in your score</div>
      {t.factors.length ? t.factors.map(f => (
        <div key={f.key} className="factor">
          <span className="ic">{ICON[f.key] ?? '•'}</span>
          <span className="grow"><b>{f.label}</b>{f.detail && <div className="hint">{f.detail}</div>}</span>
          <span className={`pts ${f.points > 0 ? 'up' : 'down'}`}>{f.points > 0 ? '+' : ''}{f.points}</span>
        </div>
      )) : <p className="muted" style={{ padding: '8px var(--gut)' }}>Nothing yet. Your first vouch is the biggest jump.</p>}
      <div className="sec-label">How to raise it</div>
      <Link className="row-li" href="/request-vouch"><span className="ic">✍️</span><span className="info"><b>Ask someone who knows you to vouch</b><span>Vouches from trusted people count most</span></span><Icon name="chev" size="sm" /></Link>
      {!profile.phone_verified && <Link className="row-li" href="/settings/account"><span className="ic">📱</span><span className="info"><b>Verify your phone</b><span>+6 points</span></span><Icon name="chev" size="sm" /></Link>}
      <Link className="row-li" href="/props"><span className="ic">🔥</span><span className="info"><b>Stay active</b><span>Going quiet for a month costs points. Polls, vouches and gifts all count.</span></span><Icon name="chev" size="sm" /></Link>
      <div className="row-li"><span className="ic">⏳</span><span className="info"><b>Vouches fade after a year</b><span>Get re-vouched to keep your score fresh. Gifts and likes never change it.</span></span></div>
    </Screen>
  );
}
