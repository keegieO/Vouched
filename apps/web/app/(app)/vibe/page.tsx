import Link from 'next/link';
import { VIBE_PROMPTS, vibeLink } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { Screen } from '@/components/Screen';
import { CopyButton, ShareButton } from '@/components/client';
import { SITE_URL } from '@/lib/site';

export const metadata = { title: 'What’s my vibe?' };

export default async function VibePage() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const url = vibeLink(SITE_URL, profile.username);
  const { data } = await supabase.from('vibe_answers').select('id, body').eq('subject_id', profile.id).eq('status', 'shown').order('created_at', { ascending: false });
  const shown = (data ?? []) as { id: string; body: string }[];
  return (
    <Screen title="What’s my vibe?" back className="flush">
      <div className="vibe-card">
        <span className="small" style={{ opacity: .85, fontWeight: 700 }}>ASK YOUR FRIENDS</span>
        <h2>What’s my vibe?</h2>
        <p style={{ opacity: .9 }}>Post your link on your story. Friends answer about you, and you pick what shows on your profile.</p>
        <div className="linkbox"><code style={{ color: '#fff' }}>{url.replace(/^https?:\/\//, '')}</code><CopyButton text={url} className="btn sm" /></div>
      </div>
      <div className="row" style={{ padding: '14px var(--gutr) 0 var(--gut)' }}>
        <ShareButton url={url} title="What’s my vibe?" text="Describe my vibe 👀" className="btn primary grow" />
        <Link className="btn ghost" href={`/vibe/${profile.username}`}>Preview</Link>
      </div>
      <div className="sec-label">Questions your friends get</div>
      {VIBE_PROMPTS.map(q => <div key={q} className="row-li"><span className="ic">💬</span><span className="info"><b>{q}</b></span></div>)}
      {shown.length > 0 && <>
        <div className="sec-label">On your profile</div>
        <div className="vibes" style={{ padding: '0 var(--gutr) 16px var(--gut)' }}>{shown.map(v => <span key={v.id} className="vibe">{v.body}</span>)}</div>
      </>}
      <p className="hint" style={{ padding: '12px var(--gutr) 0 var(--gut)' }}>New answers land in Activity → Review. Nothing shows until you tap Show.</p>
    </Screen>
  );
}
