import Link from 'next/link';
import { STYLES, isStyle, VOUCH_WITH_AUTHOR, TRUSTED_MIN_CIRCLES, TRUSTED_MIN_VOUCHES, profileLink, trustSummary, type VouchWithAuthor } from '@vouched/shared';
import { getViewer } from '@/lib/supabase/server';
import { ProfileHeader } from '@/components/ProfileHeader';
import { CopyButton, ShareButton, VouchList } from '@/components/client';
import { SITE_URL } from '@/lib/site';
import { socialCounts } from '@/lib/social';

export const metadata = { title: 'My profile' };

export default async function Home() {
  const { supabase, profile } = await getViewer();
  if (!profile) return null;
  const { data } = await supabase.from('vouches').select(VOUCH_WITH_AUTHOR)
    .eq('subject_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false });
  const vouches = (data ?? []) as unknown as VouchWithAuthor[];
  const counts = await socialCounts(supabase, profile.id, profile.id);
  const s = trustSummary(vouches);
  const url = profileLink(SITE_URL, profile.username);
  const pct = Math.min(100, Math.round((s.countedTowardBadge / TRUSTED_MIN_VOUCHES) * 100));

  return (
    <div className="profile-grid">
      <aside className="stack-lg">
        <ProfileHeader profile={profile} vouches={vouches} social={counts} />
        <section className="panel">
          <h3>Your link</h3>
          <div className="linkbox"><code>{url.replace(/^https?:\/\//, '')}</code><CopyButton text={url} /></div>
          <p className="hint">Put it in your Hinge, Instagram or TikTok bio, or paste it into a job or rental application.</p>
          <p className="hint">Page style: <b>{STYLES[isStyle(profile.style) ? profile.style : 'signed'].name}</b></p>
          <div className="row">
            <ShareButton url={url} title={`${profile.display_name} on Vouched`} className="btn sm ghost" />
            <Link className="btn sm ghost" href="/settings">Edit profile</Link>
          </div>
        </section>
      </aside>

      <div className="stack-lg">
        {!s.trusted ? (
          <section className="panel">
            <div className="row between"><h3>Trusted badge</h3>
              <span className="hint" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {s.countedTowardBadge}/{TRUSTED_MIN_VOUCHES} vouches · {s.nonFamilyCircles}/{TRUSTED_MIN_CIRCLES} circles
              </span>
            </div>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={TRUSTED_MIN_VOUCHES} aria-valuenow={s.countedTowardBadge}><i style={{ width: `${pct}%` }} /></div>
            <p className="hint">Get {TRUSTED_MIN_VOUCHES} vouches from at least {TRUSTED_MIN_CIRCLES} different parts of your life. Family vouches count half.</p>
            <Link className="btn primary" href="/ask">Ask for vouches</Link>
          </section>
        ) : (
          <div className="banner">You’re <b>Trusted</b>. The badge shows on your public profile.</div>
        )}

        <div className="row between">
          <span className="label">Vouches on your profile</span>
          <Link className="small" href="/written">Vouches you wrote</Link>
        </div>
        <VouchList vouches={vouches} signedIn viewerId={profile.id} subjectFirstName={profile.display_name.split(' ')[0]} emptyText="No vouches yet. Send your link to three people who know you well." />
      </div>
    </div>
  );
}
