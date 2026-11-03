import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { THEMES, normalizeUsername, trustSummary, type ThemeKey } from '@vouched/shared';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Vouched profile';

// The link-preview card people see when a Vouched link is pasted into a chat or bio.
export default async function OG({ params }: { params: { username: string } }) {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: p } = await supabase.from('profiles').select('id, display_name, username, headline, theme')
    .eq('username', normalizeUsername(params.username)).maybeSingle();
  const { data: v } = p
    ? await supabase.from('vouches').select('relationship, traits').eq('subject_id', p.id).eq('status', 'approved')
    : { data: [] };
  const s = trustSummary((v ?? []) as { relationship: string; traits: string[] }[] as never);
  const accent = THEMES[((p?.theme as ThemeKey) in THEMES ? p?.theme : 'cobalt') as ThemeKey].light;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#F8FAFD', padding: 72, fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 36, fontWeight: 800, color: '#131A2F' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 34 }}>✓</div>
          Vouched
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontSize: 76, fontWeight: 800, color: '#131A2F', letterSpacing: -2 }}>{p?.display_name ?? 'Vouched'}</div>
          {p?.headline && <div style={{ fontSize: 34, color: '#5B6580' }}>{p.headline}</div>}
        </div>
        <div style={{ display: 'flex', gap: 24, fontSize: 32, color: '#131A2F' }}>
          <div style={{ display: 'flex', background: accent, color: '#fff', padding: '12px 26px', borderRadius: 999, fontWeight: 700 }}>
            {s.total} {s.total === 1 ? 'vouch' : 'vouches'}
          </div>
          {s.topTraits.slice(0, 2).map(([t]) => (
            <div key={t} style={{ display: 'flex', border: '2px solid #D9DFEB', padding: '12px 26px', borderRadius: 999 }}>{t}</div>
          ))}
        </div>
      </div>
    ),
    size,
  );
}
