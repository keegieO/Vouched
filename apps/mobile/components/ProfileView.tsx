import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, Share, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  GIFT_WITH_PEOPLE, PLATFORMS, STATUSES, VOUCH_WITH_AUTHOR, VOUCH_WITH_SUBJECT, linkLabel, linkUrl, profileLink, timeAgo,
  type GiftWithPeople, type PersonalityRow, type Profile, type PropCount, type ReactionCount, type TrackRecord, type TrustStep,
  type VouchWithAuthor, type VouchWithSubject,
} from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { useProfileLinks, useSocialCounts } from '@/lib/social';
import { FollowButton } from './social';
import { RecordBar } from './trust';
import { ReportSheet } from './ReportSheet';
import { Avatar, Button, FONT_BODY, FONT_BOLD, FONT_HEAVY, FONT_MED, T, useC } from './ui';
import { GUT, GiftButton, GiftShelf, ListRow, PostVouch, PrivateNoteSheet, Radar, Sheet, SheetOption, Tabs, TierPill } from './v2';

type TabKey = 'vouches' | 'personality' | 'gifts' | 'backed' | 'work';
type Mini = { username: string; display_name: string; avatar_url: string | null };

export function ProfileView({ profile, header }: { profile: Profile; header?: React.ReactNode }) {
  const c = useC(profile.theme);
  const router = useRouter();
  const { profile: viewer } = useAuth();
  const viewerId = viewer?.id ?? null;
  const isMe = viewerId === profile.id;
  const first = profile.display_name.split(' ')[0];
  const url = profileLink(SITE_URL, profile.username);
  const { counts } = useSocialCounts(profile.id, viewerId);
  const { links } = useProfileLinks(profile.id);
  const [tab, setTab] = useState<TabKey>('vouches');
  const [vouches, setVouches] = useState<VouchWithAuthor[]>([]);
  const [gifts, setGifts] = useState<GiftWithPeople[]>([]);
  const [tier, setTier] = useState<string | null>(null);
  const [inviter, setInviter] = useState<Mini | null>(null);
  const [props, setProps] = useState<PropCount[]>([]);
  const [path, setPath] = useState<TrustStep[]>([]);
  const [record, setRecord] = useState<TrackRecord>({ backed: 0, removed: 0, weight: 1 });
  const [rc, setRc] = useState<Map<string, ReactionCount>>(new Map());
  const [pers, setPers] = useState<PersonalityRow[]>([]);
  const [vibes, setVibes] = useState<{ id: string; body: string }[]>([]);
  const [given, setGiven] = useState<VouchWithSubject[]>([]);
  const [vouchedIn, setVouchedIn] = useState<(Mini & { id: string; headline: string | null })[]>([]);
  const [mine, setMine] = useState(false);
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState(false);
  const [report, setReport] = useState<{ profileId: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [{ data: v }, { data: g }, { data: t }, { data: inv }, { data: pr }, { data: tp }, { data: rec }, { data: m }] = await Promise.all([
      supabase.from('vouches').select(VOUCH_WITH_AUTHOR).eq('subject_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false }),
      supabase.from('gifts').select(GIFT_WITH_PEOPLE).eq('receiver_id', profile.id).order('created_at', { ascending: false }).limit(60),
      supabase.rpc('trust_tier', { p_user: profile.id }),
      profile.invited_by ? supabase.from('profiles').select('username, display_name, avatar_url').eq('id', profile.invited_by).maybeSingle() : Promise.resolve({ data: null }),
      supabase.rpc('props_summary', { p_user: profile.id }),
      viewerId && !isMe ? supabase.rpc('trust_path', { p_to: profile.id }) : Promise.resolve({ data: [] }),
      supabase.rpc('track_record', { p_user: profile.id }),
      viewerId && !isMe ? supabase.from('vouches').select('id').eq('subject_id', profile.id).eq('author_id', viewerId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const vs = (v ?? []) as unknown as VouchWithAuthor[];
    setVouches(vs); setGifts((g ?? []) as unknown as GiftWithPeople[]); setTier((t as string | null) ?? 'New');
    setInviter((inv as Mini | null) ?? null); setProps((pr ?? []) as PropCount[]); setPath((tp ?? []) as TrustStep[]);
    setRecord(((rec ?? []) as TrackRecord[])[0] ?? { backed: 0, removed: 0, weight: 1 }); setMine(!!m);
    if (vs.length) {
      const { data: counts } = await supabase.rpc('reaction_counts', { p_type: 'vouch', p_ids: vs.map(x => x.id) });
      setRc(new Map(((counts ?? []) as ReactionCount[]).map(x => [x.target_id, x])));
    }
    if (viewerId && !isMe) supabase.rpc('record_profile_view', { p_user: profile.id }).then(() => {});
  }, [profile.id, profile.invited_by, viewerId, isMe]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const loadTab = useCallback(async (k: TabKey) => {
    if (k === 'personality') {
      const [{ data: p }, { data: vb }] = await Promise.all([
        supabase.rpc('personality', { p_user: profile.id }),
        supabase.from('vibe_answers').select('id, body').eq('subject_id', profile.id).eq('status', 'shown').order('created_at', { ascending: false }).limit(30),
      ]);
      setPers((p ?? []) as PersonalityRow[]); setVibes((vb ?? []) as { id: string; body: string }[]);
    }
    if (k === 'backed') {
      const [{ data: gv }, { data: vi }] = await Promise.all([
        supabase.from('vouches').select(VOUCH_WITH_SUBJECT).eq('author_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false }),
        supabase.from('profiles').select('id, username, display_name, avatar_url, headline').eq('invited_by', profile.id).eq('standing', 'good'),
      ]);
      setGiven((gv ?? []) as unknown as VouchWithSubject[]); setVouchedIn((vi ?? []) as typeof vouchedIn);
    }
  }, [profile.id]);
  const pick = (k: TabKey) => { setTab(k); loadTab(k); };

  const subject = { username: profile.username, display_name: profile.display_name, avatar_url: profile.avatar_url };
  const pinned = profile.pinned_vouch_id ? vouches.find(v => v.id === profile.pinned_vouch_id) : undefined;
  const ordered = pinned ? [pinned, ...vouches.filter(v => v.id !== pinned.id)] : vouches;
  const vouchers = Array.from(new Map(vouches.filter(v => v.author).map(v => [v.author!.username, v.author!])).values());
  const canVouch = !isMe && (profile.who_can_vouch === 'everyone' || profile.who_can_vouch === 'following');
  const tabs: [TabKey, string][] = [['vouches', 'Vouches'], ['personality', 'Personality'], ['gifts', 'Gifts'], ['backed', 'Backed'], ...(profile.work_mode ? [['work', 'Hire me'] as [TabKey, string]] : [])];
  const stat = (n: number, l: string, onPress?: () => void) => (
    <Text onPress={onPress} style={{ fontFamily: FONT_BODY, fontSize: 14, color: c.muted }}><Text style={{ fontFamily: FONT_BOLD, color: c.ink }}>{n}</Text> {l}</Text>
  );
  const section = { paddingHorizontal: GUT, paddingVertical: 16, gap: 12, borderBottomWidth: 1, borderColor: c.line };
  const h3 = { fontFamily: FONT_HEAVY, fontSize: 17, color: c.ink, letterSpacing: -0.2 };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); await loadTab(tab); setRefreshing(false); }} />}>
      {header}
      <View style={{ height: 120, backgroundColor: c.accent, overflow: 'hidden' }}>
        {[0, 1, 2].map(i => <View key={i} style={{ position: 'absolute', right: -40 + i * -90, top: -60 + i * 30, width: 180, height: 180, borderRadius: 90, backgroundColor: i === 1 ? '#FF5CA8' : '#7B5CFF', opacity: 0.45 }} />)}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingHorizontal: GUT, marginTop: -44 }}>
        <View style={{ borderRadius: 999, borderWidth: 4, borderColor: c.bg }}><Avatar name={profile.display_name} url={profile.avatar_url} size={88} /></View>
        <View style={{ flexDirection: 'row', gap: 8, paddingBottom: 6, alignItems: 'center' }}>
          {isMe ? <Button small kind="ghost" title="Edit profile" onPress={() => router.push('/settings')} /> : <>
            {viewerId && <Pressable onPress={() => setMenu(true)} accessibilityLabel="More" style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: c.line2, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-horizontal" size={18} color={c.ink} /></Pressable>}
            <GiftButton toId={profile.id} toName={profile.display_name} />
            <FollowButton targetId={profile.id} following={counts.viewerFollows} />
          </>}
        </View>
      </View>

      <View style={{ paddingHorizontal: GUT, paddingTop: 10, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text style={{ fontFamily: FONT_HEAVY, fontSize: 21, color: c.ink, letterSpacing: -0.4 }}>{profile.display_name}</Text>
          <TierPill tier={tier} onPress={isMe ? () => router.push('/score') : () => Alert.alert(`${first} is ${tier}`, 'Tiers come from real vouches (weighted by who gave them), variety across their life, verification, time on Vouched and their track record. Gifts and likes never count.')} />
        </View>
        <Text style={{ fontFamily: FONT_BODY, color: c.muted, marginTop: -6 }}>@{profile.username}{profile.pronouns ? ` · ${profile.pronouns}` : ''}{counts.mutual ? ' · Vouched for each other' : ''}</Text>
        {profile.bio || profile.headline ? <Text style={{ fontFamily: FONT_BODY, fontSize: 15, lineHeight: 21, color: c.ink }}>{profile.bio || profile.headline}</Text> : null}
        <Pressable disabled={!inviter} onPress={() => inviter && router.push(`/${inviter.username}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {inviter ? <Avatar name={inviter.display_name} url={inviter.avatar_url} size={20} /> : <Text>⭐</Text>}
          <Text style={{ fontFamily: FONT_BODY, color: c.muted, fontSize: 14 }}>{inviter ? <>Vouched in by <Text style={{ fontFamily: FONT_BOLD, color: c.ink }}>{inviter.display_name}</Text></> : 'Founding member'}{profile.show_city && profile.city ? ` · ${profile.city}` : ''}</Text>
        </Pressable>
        {props.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{props.slice(0, 3).map(p => (
          <View key={p.prompt_id} style={{ backgroundColor: c.hiSoft, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 5 }}><Text style={{ fontFamily: FONT_MED, fontSize: 13, color: c.ink }}>{p.emoji} {p.label} ×{p.n}</Text></View>
        ))}</View>}
        {links.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{links.map(l => (
          <Pressable key={l.id} onPress={() => Linking.openURL(linkUrl(l))} accessibilityRole="link" style={{ flexDirection: 'row', gap: 6, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.line2 }}>
            <Text style={{ color: c.muted, fontSize: 12, fontFamily: FONT_BOLD }}>{PLATFORMS[l.platform].name}</Text><Text style={{ color: c.ink, fontSize: 14, fontFamily: FONT_MED }}>{linkLabel(l)}</Text>
          </Pressable>
        ))}</View>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
          {stat(vouches.length, 'vouches', () => pick('vouches'))}
          {(profile.show_counts || isMe) && stat(counts.followers, 'followers')}
          {(profile.show_counts || isMe) && stat(counts.following, 'following')}
          {stat(gifts.length, 'gifts', () => pick('gifts'))}
        </View>
        {viewerId && !isMe && (path.length > 1 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Ionicons name="link-outline" size={15} color={c.muted} />
            {path.map((s, i) => (
              <Text key={s.id} style={{ fontFamily: FONT_BODY, fontSize: 14, color: c.muted }}>{i > 0 ? '→ ' : ''}<Text onPress={() => router.push(`/${s.username}`)} style={{ fontFamily: FONT_BOLD, color: c.ink }}>{s.id === viewerId ? 'You' : s.display_name.split(' ')[0]}</Text></Text>
            ))}
            <Text style={{ fontFamily: FONT_BODY, fontSize: 12, color: c.muted }}>· {path.length === 2 ? 'direct' : `${path.length - 1} steps`}</Text>
          </View>
        ) : <Text style={{ fontFamily: FONT_BODY, fontSize: 14, color: c.muted }}>🔗 No vouches connect you yet. Be careful meeting someone with no link to your circle.</Text>)}
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: GUT, paddingTop: 12, paddingBottom: 4 }}>
        {isMe ? <>
          <Button kind="ghost" title="Trust score" onPress={() => router.push('/score')} style={{ flex: 1 }} />
          <Button kind="ghost" title="Vibe link" onPress={() => router.push('/vibe')} style={{ flex: 1 }} />
          <Button kind="ghost" title="Share" onPress={() => Share.share({ message: url, url })} style={{ flex: 1 }} />
        </> : <>
          {viewerId && canVouch ? <Button kind="accent" title={mine ? 'Edit vouch' : 'Vouch'} onPress={() => router.push(`/${profile.username}/vouch`)} style={{ flex: 1 }} />
            : !viewerId ? <Button kind="accent" title="Join to vouch" onPress={() => router.push('/login')} style={{ flex: 1 }} />
            : <Button kind="ghost" title="Not taking vouches" onPress={() => {}} disabled style={{ flex: 1 }} />}
          <Button kind="ghost" title="Share" onPress={() => Share.share({ message: url, url })} style={{ flex: 1 }} />
        </>}
      </View>

      {vouchers.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: GUT, paddingVertical: 14 }}>
          {vouchers.slice(0, 12).map(a => (
            <Pressable key={a.username} onPress={() => router.push(`/${a.username}`)} style={{ alignItems: 'center', gap: 5, width: 60 }}>
              <Avatar name={a.display_name} url={a.avatar_url} size={56} /><Text numberOfLines={1} style={{ fontFamily: FONT_BODY, fontSize: 12, color: c.ink }}>{a.display_name.split(' ')[0]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Tabs tabs={tabs} value={tab} onChange={pick} />

      {tab === 'vouches' && (ordered.length ? ordered.map(v => (
        <View key={v.id}>
          {pinned?.id === v.id && <Text style={{ fontFamily: FONT_BOLD, fontSize: 12, color: c.muted, paddingLeft: GUT + 52, paddingTop: 10 }}>📌 Pinned</Text>}
          <PostVouch v={{ ...v, subject }} counts={rc.get(v.id)} onChanged={load} />
        </View>
      )) : (
        <View style={{ padding: 32, alignItems: 'center', gap: 12 }}>
          <T v="muted" style={{ textAlign: 'center' }}>{isMe ? 'No vouches yet. Ask three people who know you well.' : `No vouches yet. Know ${first}? Put your name on them.`}</T>
          {isMe && <Button title="Ask for a vouch" onPress={() => router.push('/request-vouch')} />}
        </View>
      ))}

      {tab === 'personality' && <>
        <View style={section}>
          <Text style={h3}>{isMe ? 'Your' : `${first}’s`} vibe, by friends</Text>
          <Radar rows={pers} />
          <T v="hint" style={{ textAlign: 'center' }}>From {props.reduce((n, p) => n + Number(p.n), 0)} anonymous poll votes and {vouches.length} vouches.</T>
        </View>
        {(vibes.length > 0 || isMe || viewerId) && (
          <View style={section}>
            <Text style={h3}>In their words</Text>
            {vibes.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{vibes.map(v => (
              <View key={v.id} style={{ backgroundColor: c.accentSoft, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7 }}><Text style={{ fontFamily: FONT_BOLD, fontSize: 14, color: c.accent }}>{v.body}</Text></View>
            ))}</View>}
            {isMe ? <Button small kind="ghost" title="✨ Get answers with your vibe link" onPress={() => router.push('/vibe')} style={{ alignSelf: 'flex-start' }} />
              : viewerId ? <Button small kind="ghost" title={`Describe ${first}’s vibe`} onPress={() => router.push(`/vibe/${profile.username}`)} style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        )}
        {props.length > 0 && (
          <View style={section}>
            <Text style={h3}>Poll titles</Text>
            {props.map(p => (
              <View key={p.prompt_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 22 }}>{p.emoji ?? '✨'}</Text><Text style={{ flex: 1, fontFamily: FONT_BOLD, color: c.ink }}>{p.label}</Text><Text style={{ fontFamily: FONT_BOLD, color: c.ink }}>×{p.n}</Text>
              </View>
            ))}
          </View>
        )}
      </>}

      {tab === 'gifts' && (
        <View style={section}>
          <Text style={h3}>Gift shelf</Text>
          <GiftShelf gifts={gifts} />
          {!isMe && viewerId && <GiftButton toId={profile.id} toName={profile.display_name} label={`🎁 Send ${first} a gift`} />}
          <T v="hint">Gifts are just for fun. They never change anyone’s trust score.</T>
        </View>
      )}

      {tab === 'backed' && <>
        <View style={{ padding: GUT }}><RecordBar record={record} name={first} isMe={isMe} /></View>
        {vouchedIn.length > 0 && <Text style={{ fontFamily: FONT_BOLD, fontSize: 13, color: c.muted, paddingHorizontal: GUT, paddingBottom: 6 }}>Vouched in</Text>}
        {vouchedIn.map(x => <ListRow key={x.id} icon={<Avatar name={x.display_name} url={x.avatar_url} size={40} />} title={x.display_name} sub={x.headline || `@${x.username}`} onPress={() => router.push(`/${x.username}`)} />)}
        {given.length > 0 && <Text style={{ fontFamily: FONT_BOLD, fontSize: 13, color: c.muted, paddingHorizontal: GUT, paddingTop: 12, paddingBottom: 6 }}>Vouched for</Text>}
        {given.map(v => v.subject && <ListRow key={v.id} icon={<Avatar name={v.subject.display_name} url={v.subject.avatar_url} size={40} />} title={v.subject.display_name} sub={`${v.relationship} · ${timeAgo(v.approved_at ?? v.created_at)}`} onPress={() => router.push(`/${v.subject!.username}`)} />)}
        {!given.length && !vouchedIn.length && <T v="muted" style={{ textAlign: 'center', padding: 32 }}>{isMe ? 'You haven’t' : `${first} hasn’t`} backed anyone yet.</T>}
      </>}

      {tab === 'work' && (
        <View style={section}>
          <Text style={h3}>{profile.status ? STATUSES[profile.status] : 'Open to work'}</Text>
          {profile.headline ? <T>{profile.headline}</T> : null}
          {profile.skills?.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{profile.skills.map(k => (
            <View key={k} style={{ backgroundColor: c.sunk, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ fontFamily: FONT_MED, fontSize: 13, color: c.ink }}>{k}</Text></View>
          ))}</View>}
          <T v="hint">{vouches.filter(v => v.relationship === 'Client' || v.relationship === 'Coworker').length} work vouches from clients and coworkers.</T>
        </View>
      )}
      <View style={{ height: 40 }} />

      <Sheet open={menu} onClose={() => setMenu(false)} title={profile.display_name}>
        <SheetOption icon="🔒" title="Send private feedback" sub={`Only ${first} sees it`} onPress={() => { setMenu(false); setNote(true); }} />
        <SheetOption icon="📨" title={`Ask ${first} to vouch for you`} sub="They’ll get a notification" onPress={async () => {
          setMenu(false);
          const { error } = await supabase.from('vouch_requests').insert({ requester_id: viewerId, recipient_id: profile.id });
          Alert.alert(error ? 'Couldn’t send' : 'Request sent', error ? (error.code === '23505' ? `You already asked ${first}.` : error.message) : `${first} will get a notification.`);
        }} />
        <SheetOption icon="🚩" title="Report" sub="Scam, fake account or harassment" onPress={() => { setMenu(false); setReport({ profileId: profile.id }); }} />
        <SheetOption icon="⛔" danger title={`Block ${first}`} sub="They can’t vouch, vote or gift you" onPress={async () => {
          setMenu(false);
          const { error } = await supabase.from('blocks').insert({ blocker_id: viewerId, blocked_id: profile.id });
          Alert.alert(error ? 'Couldn’t block' : 'Blocked', error?.message);
        }} />
      </Sheet>
      {viewerId && <PrivateNoteSheet open={note} onClose={() => setNote(false)} toId={profile.id} toName={profile.display_name} />}
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </ScrollView>
  );
}
