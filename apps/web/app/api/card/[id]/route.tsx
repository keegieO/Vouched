import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { SITE_URL } from '@/lib/site';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/env';

export const runtime = 'nodejs';
export const revalidate = 3600;

const CHECK_SVG = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0NCIgaGVpZ2h0PSI0NCIgdmlld0JveD0iMCAwIDI0IDI0Ij48cGF0aCBkPSJNNSAxMi41bDQuNSA0LjVMMTkgNyIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjZmZmZmZmIiBzdHJva2Utd2lkdGg9IjMuNCIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PC9zdmc+';

const fontDir = path.join(process.cwd(), 'assets', 'fonts');
const fonts = Promise.all([
  readFile(path.join(fontDir, 'hanken-grotesk-latin-800-normal.woff')),
  readFile(path.join(fontDir, 'hanken-grotesk-latin-500-normal.woff')),
  readFile(path.join(fontDir, 'nothing-you-could-do-latin-400-normal.woff')),
]);

type Row = {
  body: string; relationship: string; duration: string; traits: string[];
  author: { display_name: string } | null;
  subject: { display_name: string; username: string } | null;
};

/** A 1080×1920 story image of one approved vouch: "Dana put her name on me." */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  const { data } = await supabase.from('vouches')
    .select('body, relationship, duration, traits, author:profiles!vouches_author_id_fkey(display_name), subject:profiles!vouches_subject_id_fkey(display_name, username)')
    .eq('id', params.id).eq('status', 'approved').maybeSingle();
  const v = data as unknown as Row | null;
  if (!v || !v.subject) return new Response('Not found', { status: 404 });

  const [bold, regular, sig] = await fonts;
  const author = v.author?.display_name ?? 'Someone';
  const site = SITE_URL.replace(/^https?:\/\//, '');
  const size = v.body.length > 200 ? 52 : v.body.length > 120 ? 60 : 68;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0D1120', color: '#fff', padding: '120px 90px', fontFamily: 'Hanken', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -120, top: -120, width: 460, height: 460, borderRadius: 999, background: '#FFE14D', display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, fontSize: 40, fontWeight: 800 }}>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: '#2340D8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={CHECK_SVG} width={44} height={44} alt="" />
          </div>
          vouched
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 150, fontSize: 92, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>
          <span style={{ fontFamily: 'Sig', fontWeight: 400, color: '#FFE14D', fontSize: 110, letterSpacing: 0 }}>{author.split(' ')[0]}</span>
          <span>put their name</span>
          <span>on {v.subject.display_name.split(' ')[0]}.</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: 90, background: '#fff', color: '#0D1120', borderRadius: 48, padding: '60px 64px', gap: 30 }}>
          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 2, textTransform: 'uppercase', color: '#2340D8' }}>{v.relationship} · {v.duration}</span>
          <span style={{ fontSize: size, fontWeight: 500, lineHeight: 1.25 }}>“{v.body}”</span>
          <span style={{ fontFamily: 'Sig', fontSize: 64, color: '#1D35B8' }}>{author}</span>
        </div>
        <div style={{ display: 'flex', marginTop: 'auto', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 34, fontWeight: 800 }}>
          <span style={{ color: 'rgba(255,255,255,.75)', fontWeight: 500 }}>Invite-only · 3 vouches a month</span>
          <span>{site}/{v.subject.username}</span>
        </div>
      </div>
    ),
    {
      width: 1080, height: 1920,
      fonts: [
        { name: 'Hanken', data: bold, weight: 800, style: 'normal' },
        { name: 'Hanken', data: regular, weight: 500, style: 'normal' },
        { name: 'Sig', data: sig, weight: 400, style: 'normal' },
      ],
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' },
    },
  );
}
