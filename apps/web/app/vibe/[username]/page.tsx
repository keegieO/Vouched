import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { normalizeUsername } from '@vouched/shared';
import { createClient, getViewer } from '@/lib/supabase/server';
import { Avatar } from '@/components/ui';
import { SiteHeader } from '@/components/SiteChrome';
import { VibeAnswerForm } from '@/components/v2';

async function load(u: string) {
  const { data } = await createClient().from('profiles').select('id, username, display_name, avatar_url, standing').eq('username', normalizeUsername(u)).maybeSingle();
  return data as { id: string; username: string; display_name: string; avatar_url: string | null; standing: string } | null;
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const p = await load(params.username);
  return p ? { title: `What’s ${p.display_name.split(' ')[0]}’s vibe?`, description: `Describe ${p.display_name} in a few words on Vouched.` } : { title: 'Not found' };
}

export default async function VibeAnswer({ params }: { params: { username: string } }) {
  const p = await load(params.username);
  if (!p || p.standing !== 'good') notFound();
  const { profile: viewer } = await getViewer();
  const first = p.display_name.split(' ')[0];
  return (
    <div style={{ minHeight: '100dvh' }}>
      <SiteHeader signedIn={!!viewer} />
      <main className="auth-wrap" style={{ paddingTop: 12 }}>
        <div className="auth-card" style={{ alignItems: 'stretch' }}>
          <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
            <Avatar name={p.display_name} url={p.avatar_url} size={84} />
            <h1 style={{ fontSize: 30 }}>What’s {first}’s vibe?</h1>
            <p className="muted">Your answer goes to {first}. They choose what shows on their profile.</p>
          </div>
          {viewer?.id === p.id
            ? <p className="banner">This is your vibe link. Share it, and friends’ answers will show up in Activity. <Link href="/vibe">Back</Link></p>
            : <VibeAnswerForm subjectId={p.id} first={first} viewerId={viewer?.id ?? null} />}
        </div>
      </main>
    </div>
  );
}
