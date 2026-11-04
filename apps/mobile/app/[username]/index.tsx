import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Share, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { VOUCH_WITH_SUBJECT, normalizeUsername, profileLink, timeAgo, type Profile, type VouchWithSubject } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { useVouches } from '@/lib/hooks';
import { useProfileLinks, useSocialCounts } from '@/lib/social';
import { CosignButton, FollowButton, ReplyBlock } from '@/components/social';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ReportSheet } from '@/components/ReportSheet';
import { Avatar, Banner, Button, Chip, Empty, Panel, Row, Screen, T, VouchCard, useC } from '@/components/ui';

export default function PublicProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [already, setAlready] = useState(false);
  const [filter, setFilter] = useState('All');
  const [report, setReport] = useState<{ vouchId?: string; profileId?: string } | null>(null);
  const { vouches } = useVouches(profile?.id, 'approved');
  const { counts } = useSocialCounts(profile?.id, session?.user.id ?? null);
  const { links } = useProfileLinks(profile?.id ?? undefined);
  const [tab, setTab] = useState<'about' | 'given'>('about');
  const [given, setGiven] = useState<VouchWithSubject[]>([]);
  const c = useC();
  useFocusEffect(useCallback(() => {
    if (!profile || tab !== 'given') return;
    supabase.from('vouches').select(VOUCH_WITH_SUBJECT).eq('author_id', profile.id).eq('status', 'approved').order('approved_at', { ascending: false })
      .then(({ data }) => setGiven((data ?? []) as unknown as VouchWithSubject[]));
  }, [profile, tab]));

  useFocusEffect(useCallback(() => {
    (async () => {
      const { data } = await supabase.from('profiles').select('*').eq('username', normalizeUsername(String(username))).maybeSingle();
      setProfile((data as Profile | null) ?? null);
      if (data && session) {
        const { data: mine } = await supabase.from('vouches').select('id').eq('subject_id', data.id).eq('author_id', session.user.id).maybeSingle();
        setAlready(!!mine);
      }
    })();
  }, [username, session]));

  if (profile === undefined) return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  if (!profile) return <Screen edges={[]}><T v="h2">No one here</T><T v="muted">That profile doesn’t exist, or the username changed.</T></Screen>;

  const first = profile.display_name.split(' ')[0];
  const isOwner = session?.user.id === profile.id;
  const circles = ['All', ...Array.from(new Set(vouches.map(v => v.relationship)))];
  const ordered = profile.pinned_vouch_id ? [...vouches.filter(v => v.id === profile.pinned_vouch_id), ...vouches.filter(v => v.id !== profile.pinned_vouch_id)] : vouches;
  const shown = filter === 'All' ? ordered : ordered.filter(v => v.relationship === filter);

  return (
    <Screen edges={[]} theme={profile.theme} pageStyle={profile.style}>
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      {isOwner && <Banner>This is your public profile. It’s what people see from your link.</Banner>}
      <ProfileHeader profile={profile} vouches={vouches} styled social={counts} links={links} />
      {!isOwner && profile.open_to_vouches && (
        <Button title={already ? 'Edit your vouch' : `Vouch for ${first}`} onPress={() => (session ? router.push(`/${profile.username}/vouch`) : router.push('/login'))} />
      )}
      {!isOwner && !profile.open_to_vouches && <T v="hint">{first} isn’t taking new vouches right now.</T>}
      <Row>
        {!isOwner && <FollowButton targetId={profile.id} following={counts.viewerFollows} />}
        <Button small kind="ghost" title="Share" onPress={() => { const url = profileLink(SITE_URL, profile.username); Share.share({ message: url, url }); }} />
        {!isOwner && session && <Button small kind="ghost" title="Ask to vouch for you" onPress={async () => {
          const { error } = await supabase.from('vouch_requests').insert({ requester_id: session.user.id, recipient_id: profile.id });
          Alert.alert(error ? 'Couldn’t send' : 'Request sent', error ? (error.code === '23505' ? `You already asked ${first}.` : error.message) : `${first} will get a notification asking them to vouch for you.`);
        }} />}
        {!isOwner && session && <Button small kind="ghost" title="Report profile" onPress={() => setReport({ profileId: profile.id })} />}
      </Row>
      <View style={{ flexDirection: 'row', backgroundColor: c.surface, borderColor: c.line, borderWidth: 1, borderRadius: 12, padding: 4, gap: 4 }}>
        {([['about', `About ${first} (${vouches.length})`], ['given', `Written by ${first} (${counts.given})`]] as const).map(([k, l]) => (
          <Pressable key={k} onPress={() => setTab(k)} accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, padding: 9, borderRadius: 9, alignItems: 'center', backgroundColor: tab === k ? c.card : 'transparent' }}>
            <Text style={{ fontWeight: '600', fontSize: 13, color: tab === k ? c.ink : c.muted }}>{l}</Text>
          </Pressable>
        ))}
      </View>
      {tab === 'given' ? (given.length ? given.map(v => v.subject && (
        <Panel key={v.id}>
          <Row style={{ flexWrap: 'nowrap', gap: 10 }}>
            <Avatar name={v.subject.display_name} url={v.subject.avatar_url} size={34} />
            <Text style={{ flex: 1, color: c.ink }} onPress={() => router.push(`/${v.subject!.username}`)}>{first} vouched for <Text style={{ fontWeight: '700' }}>{v.subject.display_name}</Text><Text style={{ color: c.muted }}> · {timeAgo(v.approved_at ?? v.created_at)}</Text></Text>
          </Row>
          <T>{v.body}</T>
        </Panel>
      )) : <Empty>{first} hasn’t vouched for anyone yet.</Empty>) : null}
      {tab === 'about' && circles.length > 2 && <Row style={{ gap: 6 }}>{circles.map(cl => <Chip key={cl} label={cl} selected={filter === cl} onPress={() => setFilter(cl)} />)}</Row>}
      {tab === 'about' && (shown.length ? shown.map((v, i) => (
        <VouchCard key={v.id} v={v} theme={profile.theme} pageStyle={profile.style} index={i} onAuthorPress={v.author ? () => router.push(`/${v.author!.username}`) : undefined}
          onReport={session ? () => setReport({ vouchId: v.id }) : undefined}
          footer={<View style={{ gap: 8 }}>
            <CosignButton vouchId={v.id} subjectId={v.subject_id} authorId={v.author_id} cosigns={v.cosigns ?? []} />
            {v.reply ? <ReplyBlock name={profile.display_name} text={v.reply} /> : null}
          </View>} />
      )) : <Empty>No vouches yet. If you know {first}, be the first.</Empty>)}
      {!session && (
        <Panel>
          <T v="h3">Want a page like this?</T>
          <T v="muted">Your friends, coworkers and clients write it. You approve it.</T>
          <Button title="Get vouched, free" onPress={() => router.push('/login')} />
        </Panel>
      )}
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </Screen>
  );
}
