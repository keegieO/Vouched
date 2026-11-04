import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { VOUCH_WITH_AUTHOR, isStyle, normalizeUsername, profileLink, type Profile, type VouchWithAuthor } from '@vouched/shared';
import { createClient, getViewer } from '@/lib/supabase/server';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ReportMenu, ShareButton, VouchList } from '@/components/client';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { themeStyle } from '@/components/ui';
import { SITE_URL } from '@/lib/site';

async function load(username: string) {
  const supabase = createClient();
  const { data } = await supabase.from('profiles').select('*').eq('username', normalizeUsername(username)).maybeSingle();
  return data as Profile | null;
}

export async function generateMetadata({ params }: { params: { username: string } }): Promise<Metadata> {
  const p = await load(params.username);
  if (!p) return { title: 'Not found' };
  const first = p.display_name.split(' ')[0];
  return {
    title: `${p.display_name} (@${p.username})`,
    description: p.headline || `See what people who know ${first} say about them on Vouched.`,
    openGraph: { title: `${p.display_name} on Vouched`, description: p.headline || `What people who know ${first} say.`, url: profileLink(SITE_URL, p.username) },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function PublicProfile({ params }: { params: { username: string } }) {
  const profile = await load(params.username);
  if (!profile) notFound();
  const { supabase, user, profile: me } = await getViewer();

  const { data } = await supabase.from('vouches').select(VOUCH_WITH_AUTHOR)
    .eq('subject_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false });
  const vouches = (data ?? []) as unknown as VouchWithAuthor[];
  const isOwner = user?.id === profile.id;
  const first = profile.display_name.split(' ')[0];
  const url = profileLink(SITE_URL, profile.username);

  let alreadyVouched = false;
  if (user && !isOwner) {
    const { data: mine } = await supabase.from('vouches').select('id').eq('subject_id', profile.id).eq('author_id', user.id).maybeSingle();
    alreadyVouched = !!mine;
  }

  return (
    <div className={`themed pstyle pstyle-${isStyle(profile.style) ? profile.style : 'signed'}`} style={themeStyle(profile.theme)}>
      <SiteHeader signedIn={!!user} />
      <main className="container" style={{ paddingBlock: '24px 40px' }}>
        {isOwner && (
          <div className="banner" style={{ marginBottom: 20 }}>
            <b>This is your public profile.</b> It’s what people see from your link. <Link href="/settings">Edit it</Link>
          </div>
        )}
        <div className="profile-grid">
          <aside className="stack-lg">
            <ProfileHeader profile={profile} vouches={vouches} />
            <div className="stack" style={{ gap: 10 }}>
              {!isOwner && profile.open_to_vouches && (
                <Link className="btn primary block" href={`/${profile.username}/vouch`}>
                  {alreadyVouched ? 'Edit your vouch' : `Vouch for ${first}`}
                </Link>
              )}
              {!isOwner && !profile.open_to_vouches && <p className="hint">{first} isn’t taking new vouches right now.</p>}
              <div className="row">
                <ShareButton url={url} title={`${profile.display_name} on Vouched`} className="btn sm ghost" />
                {!isOwner && <ReportMenu profileId={profile.id} signedIn={!!user} />}
              </div>
            </div>
          </aside>
          <div className="stack-lg">
            <span className="label">What people say about {first}</span>
            <VouchList vouches={vouches} signedIn={!!user} emptyText={`No vouches yet. If you know ${first}, be the first.`} />
            {!me && (
              <section className="panel">
                <h3>Want a page like this?</h3>
                <p className="muted small">Your friends, coworkers and clients write it. You approve it. It takes five minutes to start.</p>
                <Link className="btn primary" href="/login?mode=signup">Get vouched, free</Link>
              </section>
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
