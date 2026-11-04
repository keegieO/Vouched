import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  STATUSES, VOUCH_WITH_AUTHOR, VOUCH_WITH_SUBJECT, badgesFor, isStyle, linkLabel, linkUrl, normalizeUsername, profileLink,
  timeAgo, trustSummary, PLATFORMS, type Profile, type PropCount, type TrackRecord, type TrustStep, type ProfileLink, type VouchWithAuthor, type VouchWithSubject,
} from '@vouched/shared';
import { createClient, getViewer } from '@/lib/supabase/server';
import { CheckMark, themeStyle, Avatar } from '@/components/ui';
import { VouchList } from '@/components/client';
import { VouchCard } from '@/components/VouchCard';
import { FollowButton } from '@/components/social';
import { LinkChip, ProfileMenu, ShareButton, ShareIconButton } from '@/components/ProfileActions';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/Sheet';
import { SiteHeader } from '@/components/SiteChrome';
import { Icon, platformIcon } from '@/components/Icon';
import { socialCounts } from '@/lib/social';
import { PropsCloud, RecordBar, TrustPathCard } from '@/components/trust';
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

export default async function ProfilePage({ params, searchParams }: { params: { username: string }; searchParams: { tab?: string; filter?: string } }) {
  const profile = await load(params.username);
  if (!profile) notFound();
  const { supabase, user, profile: viewer } = await getViewer();
  const viewerId = viewer?.id ?? null;
  const isMe = viewerId === profile.id;
  const tab = searchParams.tab === 'given' || searchParams.tab === 'backed' ? 'given' : searchParams.tab === 'about' ? 'about' : 'vouches';
  const first = profile.display_name.split(' ')[0];
  const url = profileLink(SITE_URL, profile.username);

  const [{ data: vdata }, { data: links }, counts, { count: recs }, { data: gdata }, { data: mine }, { data: theyFollow }, { data: blk }] = await Promise.all([
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false }),
    supabase.from('profile_links').select('*').eq('profile_id', profile.id).order('position'),
    socialCounts(supabase, profile.id, viewerId),
    supabase.from('request_answers').select('id', { count: 'exact', head: true }).eq('author_id', profile.id),
    tab === 'given'
      ? supabase.from('vouches').select(VOUCH_WITH_SUBJECT).eq('author_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    viewerId && !isMe ? supabase.from('vouches').select('id').eq('subject_id', profile.id).eq('author_id', viewerId).maybeSingle() : Promise.resolve({ data: null }),
    viewerId && !isMe ? supabase.from('follows').select('follower_id').eq('follower_id', profile.id).eq('followee_id', viewerId).maybeSingle() : Promise.resolve({ data: null }),
    viewerId && !isMe ? supabase.from('blocks').select('blocked_id').eq('blocker_id', viewerId).eq('blocked_id', profile.id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const [{ data: inviterRow }, { data: rec }, { data: propRows }, { data: pathRows }, { data: invitedRows }] = await Promise.all([
    profile.invited_by ? supabase.from('profiles').select('username, display_name, avatar_url').eq('id', profile.invited_by).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc('track_record', { p_user: profile.id }),
    supabase.rpc('props_summary', { p_user: profile.id }),
    viewerId && !isMe ? supabase.rpc('trust_path', { p_to: profile.id }) : Promise.resolve({ data: null }),
    tab === 'given' ? supabase.from('profiles').select('id, username, display_name, avatar_url, headline').eq('invited_by', profile.id).eq('standing', 'good') : Promise.resolve({ data: [] }),
  ]);
  const inviter = inviterRow as { username: string; display_name: string; avatar_url: string | null } | null;
  const record = ((rec ?? []) as TrackRecord[])[0] ?? { backed: 0, removed: 0, weight: 1 };
  const props = (propRows ?? []) as PropCount[];
  const propsTotal = props.reduce((n, p) => n + Number(p.n), 0);
  const path = (pathRows ?? []) as TrustStep[];
  const vouchedIn = (invitedRows ?? []) as { id: string; username: string; display_name: string; avatar_url: string | null; headline: string | null }[];
  if (profile.standing === 'removed') {
    return (
      <main className="auth-wrap"><div className="auth-card">
        <h1 style={{ fontSize: 32 }}>This account was removed</h1>
        <p className="muted">It broke Vouched’s rules on scams or fake accounts. People who vouched for it have that on their record.</p>
        <Link className="btn ghost" href="/">Go home</Link>
      </div></main>
    );
  }
  const vouches = (vdata ?? []) as unknown as VouchWithAuthor[];
  const given = (gdata ?? []) as unknown as VouchWithSubject[];
  const plinks = (links ?? []) as ProfileLink[];
  const s = trustSummary(vouches);
  const cosigns = vouches.reduce((n, v) => n + (v.cosigns?.length ?? 0), 0);
  const pinned = profile.pinned_vouch_id ? vouches.find(v => v.id === profile.pinned_vouch_id) : undefined;
  const rest = pinned ? vouches.filter(v => v.id !== pinned.id) : vouches;
  const canVouch = !isMe && (profile.who_can_vouch === 'everyone' || (profile.who_can_vouch === 'following' && !!theyFollow));
  const badges = badgesFor({ vouches: vouches.length, trusted: s.trusted, given: counts.given, recs: recs ?? 0, cosigns, phone: profile.phone_verified });
  const styleKey = isStyle(profile.style) ? profile.style : 'signed';
  const tabHref = (t: string) => `/${profile.username}${t === 'vouches' ? '' : `?tab=${t}`}`;

  const body = (
    <div className={`screen themed pstyle pstyle-${styleKey}`} style={themeStyle(profile.theme)}>
      <div className={`cover ${profile.cover ?? 'dots'}`} />
      <div className="p-head">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={96} />
        <div className="row" style={{ gap: 6, paddingBottom: 6 }}>
          {!isMe && <ProfileMenu targetId={profile.id} firstName={first} url={url} viewerId={viewerId} blocked={!!blk} />}
        </div>
      </div>
      <div className="p-name">
        <h2>{profile.display_name}</h2>
        <span className="muted">@{profile.username}{profile.pronouns ? ` · ${profile.pronouns}` : ''}</span>
        <div className="row" style={{ gap: 6, marginTop: 4 }}>
          {profile.status && <span className="status">{STATUSES[profile.status]}</span>}
          {s.trusted && <span className="pill-badge"><CheckMark size={11} /> Trusted</span>}
          {profile.phone_verified && <span className="pill-ok">✓ Phone verified</span>}
          {counts.mutual && <span className="pill-mutual">⇄ Vouched for each other</span>}
        </div>
      </div>
      {inviter ? (
        <Link className="invited" href={`/${inviter.username}`} style={{ textDecoration: 'none' }}>
          <Avatar name={inviter.display_name} url={inviter.avatar_url} size={22} /> Vouched in by <b>{inviter.display_name}</b>
        </Link>
      ) : <span className="invited"><Icon name="star" size="xs" /> Founding member</span>}
      {profile.headline && <p style={{ padding: '0 4px', fontSize: 16, fontWeight: 500 }}>{profile.headline}</p>}
      {plinks.length > 0 && (
        <div className="p-links">
          {plinks.map(l => <LinkChip key={l.id} href={linkUrl(l)} platform={PLATFORMS[l.platform].name} label={linkLabel(l)} icon={platformIcon(l.platform)} />)}
        </div>
      )}
      <div className="p-stats">
        {(profile.show_counts || isMe) && (
          <>
            <Link href={`/${profile.username}/followers`}><b>{counts.followers}</b> followers</Link>
            <Link href={`/${profile.username}/following`}><b>{counts.following}</b> following</Link>
          </>
        )}
      </div>
      <div className="p-actions">
        {isMe ? (
          <>
            <Link className="btn soft" href="/settings/profile"><Icon name="edit" size="sm" /> Edit profile</Link>
            <ShareButton url={url} name="your page" />
          </>
        ) : (
          <>
            <FollowButton targetId={profile.id} following={counts.viewerFollows} viewerId={viewerId} small={false} />
            {canVouch
              ? <Link className={`btn ${counts.viewerFollows ? 'primary' : 'soft'}`} href={`/${profile.username}/vouch`}>{mine ? 'Edit vouch' : 'Vouch'}</Link>
              : <button className="btn soft" disabled>Not taking vouches</button>}
          </>
        )}
      </div>
      {viewerId && !isMe && <TrustPathCard steps={path} viewerId={viewerId} />}
      <div className="statrow">
        <Link className="stat" href={tabHref('vouches')}><b>{s.total}</b><span>vouches</span></Link>
        <Link className="stat" href={tabHref('about')}><b>{propsTotal}</b><span>props</span></Link>
        <Link className={`stat ${record.removed ? 'flag' : ''}`} href={tabHref('backed')}><b>{record.backed}</b><span>{record.removed ? `${record.removed} removed` : 'backed'}</span></Link>
      </div>
      <PropsCloud props={props} />
      {isMe && !s.trusted && (
        <section className="card">
          <div className="row between"><h3>Trusted badge</h3><span className="hint" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.countedTowardBadge}/10 · {s.nonFamilyCircles}/3 circles</span></div>
          <div className="progress"><i style={{ width: `${Math.min(100, s.countedTowardBadge * 10)}%` }} /></div>
          <div className="row between"><p className="hint">10 vouches from 3 parts of your life. Family counts half.</p><Link className="btn sm primary" href="/ask">Ask</Link></div>
        </section>
      )}

      <nav className="utabs" aria-label="Profile sections">
        <Link href={tabHref('vouches')} aria-current={tab === 'vouches' ? 'page' : undefined}>Vouches</Link>
        <Link href={tabHref('backed')} aria-current={tab === 'given' ? 'page' : undefined}>Backed</Link>
        <Link href={tabHref('about')} aria-current={tab === 'about' ? 'page' : undefined}>About</Link>
      </nav>

      {tab === 'vouches' && (
        <>
          {pinned && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="pinned-label"><Icon name="pin" size="xs" /> Pinned</span>
              <VouchCard v={pinned} social={{ viewerId, subjectFirstName: first }} />
            </div>
          )}
          {(!pinned || rest.length > 0) && (
            <VouchList vouches={rest} signedIn={!!user} viewerId={viewerId} subjectFirstName={first}
              emptyText={isMe ? 'No vouches yet. Ask three people who know you well.' : `No vouches yet. If you know ${first}, be the first.`} />
          )}
        </>
      )}

      {tab === 'given' && <RecordBar record={record} name={first} isMe={isMe} />}
      {tab === 'given' && vouchedIn.length > 0 && (
        <>
          <span className="label list-head">Vouched in</span>
          <section className="list">
            {vouchedIn.map(x => (
              <Link key={x.id} href={`/${x.username}`} className="person" style={{ textDecoration: 'none', color: 'inherit' }}>
                <Avatar name={x.display_name} url={x.avatar_url} size={44} />
                <span className="grow"><b>{x.display_name}</b><br /><span className="hint">{x.headline || `@${x.username}`}</span></span>
              </Link>
            ))}
          </section>
        </>
      )}
      {tab === 'given' && (given.length ? (
        <div className="stack">
          <span className="label list-head">Vouched for</span>
          {given.map(v => v.subject && (
            <section key={v.id} className="item">
              <div className="item-head">
                <Avatar name={v.subject.display_name} url={v.subject.avatar_url} size={36} />
                <p>{first} vouched for <Link href={`/${v.subject.username}`}>{v.subject.display_name}</Link> <span className="hint">· {timeAgo(v.approved_at ?? v.created_at)}</span></p>
              </div>
              <div className="quote"><span className="rel">{v.relationship}</span><blockquote>{v.body}</blockquote></div>
            </section>
          ))}
        </div>
      ) : !vouchedIn.length && <div className="empty"><p>{isMe ? 'You haven’t' : `${first} hasn’t`} backed anyone yet.</p></div>)}

      {tab === 'about' && (
        <>
          {profile.bio && <section className="card"><span className="label">About</span><p>{profile.bio}</p></section>}
          {profile.skills?.length > 0 && (
            <section className="card"><span className="label">Skills &amp; services</span>
              <div className="row" style={{ gap: 6 }}>{profile.skills.map(k => <span key={k} className="tag">{k}</span>)}</div>
            </section>
          )}
          {s.topTraits.length > 0 && (
            <section className="card"><span className="label">What people say most</span>
              <div className="row" style={{ gap: 6 }}>{s.topTraits.map(([t, n]) => <span key={t} className="chip static">{t} <span className="n">×{n}</span></span>)}</div>
            </section>
          )}
          <section className="stack"><span className="label">Badges</span>
            <div className="badges">
              {badges.filter(b => b.earned || isMe).map(b => (
                <div key={b.key} className={`bdg ${b.earned ? '' : 'locked'}`}><span className="bi"><Icon name={b.key === 'trusted' ? 'shield' : b.key === 'generous' ? 'gift' : b.key === 'connector' ? 'users' : b.key === 'phone' ? 'phone' : b.key === 'backed' ? 'check' : 'star'} size="sm" /></span><b>{b.name}</b><span>{b.desc}</span></div>
              ))}
            </div>
          </section>
          <section className="list">
            {profile.show_city && profile.city && <div className="li static"><span className="ico"><Icon name="map" size="sm" /></span>{profile.city}</div>}
            <div className="li static"><span className="ico"><Icon name="cal" size="sm" /></span>Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</div>
          </section>
        </>
      )}
    </div>
  );

  if (viewer) {
    return (
      <AppShell profile={viewer}>
        <PageHeader title={isMe ? profile.display_name : `@${profile.username}`} back={!isMe}
          actions={<>
            <ShareIconButton url={url} name={isMe ? 'your page' : first} />
            {isMe && <Link className="iconbtn" href="/settings" aria-label="Settings"><Icon name="gear" /></Link>}
          </>} />
        {body}
      </AppShell>
    );
  }
  return (
    <div className={`themed pstyle pstyle-${styleKey}`} style={{ ...themeStyle(profile.theme), minHeight: '100dvh', paddingBottom: 90 }}>
      <SiteHeader signedIn={false} />
      {body}
      <div className="public-cta">
        <span className="small"><b>Know {first}?</b> Vouched is invite-only. Got a code?</span>
        <Link className="btn sm primary" href="/join">Join</Link>
      </div>
    </div>
  );
}
