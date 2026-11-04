import { trustSummary, type Profile, type Vouch } from '@vouched/shared';
import { Avatar, CheckMark } from './ui';

export type SocialCounts = { followers: number; following: number; given: number; mutual?: boolean };

export function ProfileHeader({ profile, vouches, social }: { profile: Profile; vouches: Pick<Vouch, 'relationship' | 'traits'>[]; social?: SocialCounts }) {
  const s = trustSummary(vouches);
  return (
    <div className="stack-lg">
      <div className="who">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={84} />
        <div className="stack" style={{ gap: 4, minWidth: 0 }}>
          <h2 style={{ overflowWrap: 'anywhere' }}>{profile.display_name}</h2>
          <span className="muted small">@{profile.username}{profile.show_city && profile.city ? ` · ${profile.city}` : ''}</span>
          <div className="row" style={{ gap: 6 }}>
            {s.trusted && <span className="pill-badge"><CheckMark size={12} /> Trusted</span>}
            {profile.phone_verified && <span className="pill-ok"><CheckMark size={12} color="currentColor" /> Phone verified</span>}
            {social?.mutual && <span className="pill-mutual">⇄ You vouched for each other</span>}
          </div>
        </div>
      </div>
      {profile.headline && <p style={{ fontSize: 17 }}>{profile.headline}</p>}
      {social && (
        <div className="counts">
          <span><b>{social.followers}</b> followers</span>
          <span><b>{social.following}</b> following</span>
          <span><b>{social.given}</b> vouches given</span>
        </div>
      )}
      <div className="stats" aria-label="Trust summary">
        <div className="stat"><b>{s.total}</b><span>vouches</span></div>
        <div className="stat"><b>{s.circles.length}</b><span>circles of life</span></div>
        <div className="stat"><b>0</b><span>written by {profile.display_name.split(' ')[0]}</span></div>
      </div>
      {s.topTraits.length > 0 && (
        <div className="stack" style={{ gap: 8 }}>
          <span className="label">What people say most</span>
          <div className="row" style={{ gap: 6 }}>
            {s.topTraits.map(([t, n]) => <span key={t} className="chip static">{t}<span className="n">×{n}</span></span>)}
          </div>
        </div>
      )}
    </div>
  );
}
