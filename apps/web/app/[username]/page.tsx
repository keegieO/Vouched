import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import {
  GIFT_WITH_PEOPLE, STATUSES, VOUCH_WITH_AUTHOR, VOUCH_WITH_SUBJECT, isStyle, linkLabel, linkUrl, normalizeUsername, profileLink, timeAgo, PLATFORMS,
  type GiftWithPeople, type PersonalityRow, type Profile, type PropCount, type ReactionCount, type TrackRecord, type TrustStep, type ProfileLink,
  type VouchWithAuthor, type VouchWithSubject,
} from '@vouched/shared';
import { createClient, getViewer } from '@/lib/supabase/server';
import { themeStyle, Avatar } from '@/components/ui';
import { FollowButton } from '@/components/social';
import { LinkChip, ProfileMenu, ShareButton, ShareIconButton } from '@/components/ProfileActions';
import { AppShell } from '@/components/AppShell';
import { PageHeader } from '@/components/Sheet';
import { SiteHeader } from '@/components/SiteChrome';
import { Icon, platformIcon } from '@/components/Icon';
import { socialCounts } from '@/lib/social';
import { RecordBar } from '@/components/trust';
import { GiftShelf, PostVouch, Radar, TierPill } from '@/components/posts';
import { GiftButton, RecordView } from '@/components/v2';
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

export default async function ProfilePage({ params, searchParams }: { params: { username: string }; searchParams: { tab?: string } }) {
  const profile = await load(params.username);
  if (!profile) notFound();
  const { supabase, profile: viewer } = await getViewer();
  const viewerId = viewer?.id ?? null;
  const isMe = viewerId === profile.id;
  const work = !!profile.work_mode;
  const TABS = ['vouches', 'personality', 'gifts', 'backed', ...(work ? ['work'] : [])];
  const tab = TABS.includes(searchParams.tab ?? '') ? searchParams.tab! : 'vouches';
  const first = profile.display_name.split(' ')[0];
  const url = profileLink(SITE_URL, profile.username);

  if (profile.standing === 'removed') {
    return (
      <main className="auth-wrap"><div className="auth-card">
        <h1 style={{ fontSize: 32 }}>This account was removed</h1>
        <p className="muted">It broke Vouched’s rules on scams or fake accounts. People who vouched for it have that on their record.</p>
        <Link className="btn ghost" href="/">Go home</Link>
      </div></main>
    );
  }

  const [{ data: vdata }, { data: links }, counts, { data: gdata }, { data: mine }, { data: theyFollow }, { data: blk }, { data: tierRow }] = await Promise.all([
    supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false }),
    supabase.from('profile_links').select('*').eq('profile_id', profile.id).order('position'),
    socialCounts(supabase, profile.id, viewerId),
    supabase.from('gifts').select(GIFT_WITH_PEOPLE).eq('receiver_id', profile.id).order('created_at', { ascending: false }).limit(60),
    viewerId && !isMe ? supabase.from('vouches').select('id').eq('subject_id', profile.id).eq('author_id', viewerId).maybeSingle() : Promise.resolve({ data: null }),
    viewerId && !isMe ? supabase.from('follows').select('follower_id').eq('follower_id', profile.id).eq('followee_id', viewerId).maybeSingle() : Promise.resolve({ data: null }),
    viewerId && !isMe ? supabase.from('blocks').select('blocked_id').eq('blocker_id', viewerId).eq('blocked_id', profile.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc('trust_tier', { p_user: profile.id }),
  ]);
  const vouches = (vdata ?? []) as unknown as VouchWithAuthor[];
  const gifts = (gdata ?? []) as unknown as GiftWithPeople[];
  const [{ data: inviterRow }, { data: rec }, { data: propRows }, { data: pathRows }, { data: pers }, { data: vibeRows }, { data: rc }, extra] = await Promise.all([
    profile.invited_by ? supabase.from('profiles').select('username, display_name, avatar_url').eq('id', profile.invited_by).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc('track_record', { p_user: profile.id }),
    supabase.rpc('props_summary', { p_user: profile.id }),
    viewerId && !isMe ? supabase.rpc('trust_path', { p_to: profile.id }) : Promise.resolve({ data: null }),
    tab === 'personality' ? supabase.rpc('personality', { p_user: profile.id }) : Promise.resolve({ data: [] }),
    tab === 'personality' ? supabase.from('vibe_answers').select('id, body, prompt').eq('subject_id', profile.id).eq('status', 'shown').order('created_at', { ascending: false }).limit(30) : Promise.resolve({ data: [] }),
    tab === 'vouches' && vouches.length ? supabase.rpc('reaction_counts', { p_type: 'vouch', p_ids: vouches.map(v => v.id) }) : Promise.resolve({ data: [] }),
    tab === 'backed'
      ? Promise.all([
          supabase.from('vouches').select(VOUCH_WITH_SUBJECT).eq('author_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false }),
          supabase.from('profiles').select('id, username, display_name, avatar_url, headline').eq('invited_by', profile.id).eq('standing', 'good'),
        ])
      : Promise.resolve(null),
  ]);
  const inviter = inviterRow as { username: string; display_name: string; avatar_url: string | null } | null;
  const record = ((rec ?? []) as TrackRecord[])[0] ?? { backed: 0, removed: 0, weight: 1 };
  const props = (propRows ?? []) as PropCount[];
  const path = (pathRows ?? []) as TrustStep[];
  const tier = (tierRow as string | null) ?? 'New';
  const counts2 = new Map(((rc ?? []) as ReactionCount[]).map(c => [c.target_id, c]));
  const given = ((extra?.[0].data ?? []) as unknown as VouchWithSubject[]);
  const vouchedIn = ((extra?.[1].data ?? []) as { id: string; username: string; display_name: string; avatar_url: string | null; headline: string | null }[]);
  const plinks = (links ?? []) as ProfileLink[];
  const canVouch = !isMe && (profile.who_can_vouch === 'everyone' || (profile.who_can_vouch === 'following' && !!theyFollow));
  const styleKey = isStyle(profile.style) ? profile.style : 'signed';
  const tabHref = (t: string) => `/${profile.username}${t === 'vouches' ? '' : `?tab=${t}`}`;
  const subject = { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url };
  const pinned = profile.pinned_vouch_id ? vouches.find(v => v.id === profile.pinned_vouch_id) : undefined;
  const ordered = pinned ? [pinned, ...vouches.filter(v => v.id !== pinned.id)] : vouches;
  const vouchers = Array.from(new Map(vouches.filter(v => v.author).map(v => [v.author!.username, v.author!])).values());
  const gifters = Object.values(gifts.reduce<Record<string, { p: NonNullable<GiftWithPeople['sender']>; n: number }>>((acc, g) => {
    if (g.sender) (acc[g.sender.username] ??= { p: g.sender, n: 0 }).n++; return acc;
  }, {})).sort((a, b) => b.n - a.n).slice(0, 5);

  const body = (
    <div className={`screen flush themed pstyle pstyle-${styleKey}`} style={themeStyle(profile.theme)}>
      {viewerId && !isMe && <RecordView id={profile.id} />}
      <div className={`cover pcover ${profile.cover ?? 'ink'}`} />
      <div className="p-top">
        <Avatar name={profile.display_name} url={profile.avatar_url} size={92} />
        <div className="row nowrap" style={{ gap: 8, paddingBottom: 6 }}>
          {isMe ? <Link className="btn sm ghost" href="/settings/profile">Edit profile</Link> : <>
            <ProfileMenu targetId={profile.id} firstName={first} fullName={profile.display_name} url={url} viewerId={viewerId} blocked={!!blk} />
            <GiftButton toId={profile.id} toName={profile.display_name} viewerId={viewerId} />
            <FollowButton targetId={profile.id} following={counts.viewerFollows} viewerId={viewerId} />
          </>}
        </div>
      </div>
      <div className="p-info">
        <h1>{profile.display_name} <TierPill tier={tier} href={isMe ? '/score' : '/how'} /></h1>
        <span className="muted" style={{ marginTop: -8 }}>@{profile.username}{profile.pronouns ? ` · ${profile.pronouns}` : ''}{counts.mutual ? ' · Vouched for each other' : ''}</span>
        {(profile.bio || profile.headline) && <p style={{ overflowWrap: 'anywhere' }}>{profile.bio || profile.headline}</p>}
        <span className="invited" style={{ cursor: 'default' }}>
          {inviter ? <><Avatar name={inviter.display_name} url={inviter.avatar_url} size={20} /> Vouched in by <Link href={`/${inviter.username}`} style={{ textDecoration: 'none' }}><b>{inviter.display_name}</b></Link></> : <>⭐ Founding member</>}
          {profile.show_city && profile.city ? ` · ${profile.city}` : ''}
        </span>
        {props.length > 0 && <div className="knownfor">{props.slice(0, 3).map(p => <span key={p.prompt_id} className="kf hi">{p.emoji} {p.label} ×{p.n}</span>)}</div>}
        {plinks.length > 0 && <div className="p-links" style={{ padding: 0 }}>{plinks.map(l => <LinkChip key={l.id} href={linkUrl(l)} platform={PLATFORMS[l.platform].name} label={linkLabel(l)} icon={platformIcon(l.platform)} />)}</div>}
        <div className="p-stats">
          <Link href={tabHref('vouches')}><b>{vouches.length}</b> vouches</Link>
          {(profile.show_counts || isMe) && <>
            <Link href={`/${profile.username}/followers`}><b>{counts.followers}</b> followers</Link>
            <Link href={`/${profile.username}/following`}><b>{counts.following}</b> following</Link>
          </>}
          <Link href={tabHref('gifts')}><b>{gifts.length}</b> gifts</Link>
        </div>
        {viewerId && !isMe && (path.length > 1 ? (
          <div className="pathline"><Icon name="link" size="xs" />
            {path.map((s, i) => <span key={s.id} style={{ display: 'contents' }}>{i > 0 && <span className="arrow">→</span>}<Link href={`/${s.username}`}>{s.id === viewerId ? 'You' : s.display_name.split(' ')[0]}</Link></span>)}
            <span className="pv">· {path.length === 2 ? 'direct' : `${path.length - 1} steps`}</span>
          </div>
        ) : <div className="pathline muted"><Icon name="link" size="xs" /> No vouches connect you yet. Be careful meeting someone with no link to your circle.</div>)}
      </div>
      <div className="p-buttons">
        {isMe ? <>
          <Link className="btn ghost" href="/score">Trust score</Link>
          <Link className="btn ghost" href="/vibe">Vibe link</Link>
          <ShareButton url={url} name="your page" />
        </> : <>
          {canVouch ? <Link className="btn accent" href={`/${profile.username}/vouch`}>{mine ? 'Edit vouch' : 'Vouch'}</Link> : <button className="btn ghost" disabled>Not taking vouches</button>}
          <ShareButton url={url} name={first} />
        </>}
      </div>
      {vouchers.length > 0 && (
        <div className="circle-row" aria-label="People who vouched">
          {vouchers.slice(0, 12).map(a => <Link key={a.username} className="story" href={`/${a.username}`}><Avatar name={a.display_name} url={a.avatar_url} size={56} /><span>{a.display_name.split(' ')[0]}</span></Link>)}
        </div>
      )}
      <nav className="tabs" aria-label="Profile sections">
        <Link href={tabHref('vouches')} aria-current={tab === 'vouches' ? 'page' : undefined}>Vouches</Link>
        <Link href={tabHref('personality')} aria-current={tab === 'personality' ? 'page' : undefined}>Personality</Link>
        <Link href={tabHref('gifts')} aria-current={tab === 'gifts' ? 'page' : undefined}>Gifts</Link>
        <Link href={tabHref('backed')} aria-current={tab === 'backed' ? 'page' : undefined}>Backed</Link>
        {work && <Link href={tabHref('work')} aria-current={tab === 'work' ? 'page' : undefined}>Hire me</Link>}
      </nav>

      {tab === 'vouches' && (ordered.length ? ordered.map(v => (
        <div key={v.id}>
          {pinned?.id === v.id && <div className="post-item" style={{ paddingBottom: 0, borderBottom: 0 }}><span className="pinned-label" style={{ marginLeft: 52 }}><Icon name="pin" size="xs" /> Pinned</span></div>}
          <PostVouch v={{ ...v, subject }} viewerId={viewerId} counts={counts2.get(v.id)} />
        </div>
      )) : <div className="empty"><Icon name="pen" /><p>{isMe ? 'No vouches yet. Ask three people who know you well.' : `No vouches yet. Know ${first}? Put your name on them.`}</p>
        {isMe && <Link className="btn primary" href="/request-vouch">Ask for a vouch</Link>}</div>)}

      {tab === 'personality' && <>
        <section className="psec">
          <h3>{isMe ? 'Your' : `${first}’s`} vibe, by friends</h3>
          <Radar rows={(pers ?? []) as PersonalityRow[]} />
          <p className="hint" style={{ textAlign: 'center' }}>From {props.reduce((n, p) => n + Number(p.n), 0)} anonymous poll votes and {vouches.length} vouches.</p>
        </section>
        {(((vibeRows ?? []) as { id: string; body: string }[]).length > 0 || isMe) && (
          <section className="psec">
            <h3>In their words</h3>
            <div className="vibes">{((vibeRows ?? []) as { id: string; body: string }[]).map(v => <span key={v.id} className="vibe">{v.body}</span>)}</div>
            {isMe && <Link className="btn sm ghost" style={{ alignSelf: 'flex-start' }} href="/vibe"><Icon name="sparkle" size="sm" /> Get answers with your vibe link</Link>}
            {!isMe && viewerId && <Link className="btn sm ghost" style={{ alignSelf: 'flex-start' }} href={`/vibe/${profile.username}`}>Describe {first}’s vibe</Link>}
          </section>
        )}
        {props.length > 0 && (
          <section className="psec">
            <h3>Poll titles</h3>
            {props.map(p => <div key={p.prompt_id} className="row nowrap"><span style={{ fontSize: 22 }}>{p.emoji ?? '✨'}</span><span className="grow"><b>{p.label}</b></span><b>×{p.n}</b></div>)}
          </section>
        )}
      </>}

      {tab === 'gifts' && <>
        <section className="psec">
          <h3>Gift shelf</h3>
          <GiftShelf gifts={gifts} />
          {!isMe && <GiftButton toId={profile.id} toName={profile.display_name} viewerId={viewerId} className="btn hi" label={` Send ${first} a gift`} />}
          <p className="hint">Gifts are just for fun. They never change anyone’s trust score.</p>
        </section>
        {gifters.length > 0 && (
          <section className="psec">
            <h3>Top gifters</h3>
            <div className="row">{gifters.map(g => <Link key={g.p.username} className="row nowrap" style={{ textDecoration: 'none', gap: 8 }} href={`/${g.p.username}`}><Avatar name={g.p.display_name} url={g.p.avatar_url} size={32} /><span className="small"><b>{g.p.display_name.split(' ')[0]}</b> ×{g.n}</span></Link>)}</div>
          </section>
        )}
      </>}

      {tab === 'backed' && <>
        <div style={{ padding: '14px var(--gutr) 0 var(--gut)' }}><RecordBar record={record} name={first} isMe={isMe} /></div>
        {vouchedIn.length > 0 && <>
          <div className="sec-label">Vouched in</div>
          {vouchedIn.map(x => (
            <Link key={x.id} href={`/${x.username}`} className="row-li"><Avatar name={x.display_name} url={x.avatar_url} size={40} /><span className="info"><b>{x.display_name}</b><span>{x.headline || `@${x.username}`}</span></span></Link>
          ))}
        </>}
        {given.length > 0 && <>
          <div className="sec-label">Vouched for</div>
          {given.map(v => v.subject && (
            <Link key={v.id} href={`/${v.subject.username}`} className="row-li">
              <Avatar name={v.subject.display_name} url={v.subject.avatar_url} size={40} />
              <span className="info"><b>{v.subject.display_name}</b><span>{v.relationship} · {timeAgo(v.approved_at ?? v.created_at)}</span></span>
            </Link>
          ))}
        </>}
        {!given.length && !vouchedIn.length && <div className="empty"><p>{isMe ? 'You haven’t' : `${first} hasn’t`} backed anyone yet.</p></div>}
      </>}

      {tab === 'work' && (
        <section className="psec">
          <h3>{profile.status ? STATUSES[profile.status] : 'Open to work'}</h3>
          {profile.headline && <p>{profile.headline}</p>}
          {profile.skills?.length > 0 && <div className="row" style={{ gap: 6 }}>{profile.skills.map(k => <span key={k} className="tag">{k}</span>)}</div>}
          <p className="hint">{vouches.filter(v => v.relationship === 'Client' || v.relationship === 'Coworker').length} work vouches from clients and coworkers.</p>
        </section>
      )}
    </div>
  );

  if (viewer) {
    return (
      <AppShell profile={viewer}>
        <PageHeader title={profile.display_name} sub={`${vouches.length} ${vouches.length === 1 ? 'vouch' : 'vouches'}`} back={!isMe}
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
      <div style={{ maxWidth: 600, margin: '0 auto', borderLeft: '1px solid var(--line)', borderRight: '1px solid var(--line)' }}>{body}</div>
      <div className="public-cta">
        <span className="small"><b>Know {first}?</b> Vouched is invite-only. Got a code?</span>
        <Link className="btn sm primary" href="/join">Join</Link>
      </div>
    </div>
  );
}
