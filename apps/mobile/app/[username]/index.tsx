import { useCallback, useState } from 'react';
import { ActivityIndicator, Share, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { normalizeUsername, profileLink, type Profile } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL, supabase } from '@/lib/supabase';
import { useVouches } from '@/lib/hooks';
import { ProfileHeader } from '@/components/ProfileHeader';
import { ReportSheet } from '@/components/ReportSheet';
import { Banner, Button, Chip, Empty, Panel, Row, Screen, T, VouchCard } from '@/components/ui';

export default function PublicProfile() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const { session } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [already, setAlready] = useState(false);
  const [filter, setFilter] = useState('All');
  const [report, setReport] = useState<{ vouchId?: string; profileId?: string } | null>(null);
  const { vouches } = useVouches(profile?.id, 'approved');

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
  const shown = filter === 'All' ? vouches : vouches.filter(v => v.relationship === filter);

  return (
    <Screen edges={[]} theme={profile.theme} pageStyle={profile.style}>
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      {isOwner && <Banner>This is your public profile. It’s what people see from your link.</Banner>}
      <ProfileHeader profile={profile} vouches={vouches} styled />
      {!isOwner && profile.open_to_vouches && (
        <Button title={already ? 'Edit your vouch' : `Vouch for ${first}`} onPress={() => (session ? router.push(`/${profile.username}/vouch`) : router.push('/login'))} />
      )}
      {!isOwner && !profile.open_to_vouches && <T v="hint">{first} isn’t taking new vouches right now.</T>}
      <Row>
        <Button small kind="ghost" title="Share" onPress={() => { const url = profileLink(SITE_URL, profile.username); Share.share({ message: url, url }); }} />
        {!isOwner && session && <Button small kind="ghost" title="Report profile" onPress={() => setReport({ profileId: profile.id })} />}
      </Row>
      <T v="label">What people say about {first}</T>
      {circles.length > 2 && <Row style={{ gap: 6 }}>{circles.map(cl => <Chip key={cl} label={cl} selected={filter === cl} onPress={() => setFilter(cl)} />)}</Row>}
      {shown.length ? shown.map((v, i) => (
        <VouchCard key={v.id} v={v} theme={profile.theme} pageStyle={profile.style} index={i} onAuthorPress={v.author ? () => router.push(`/${v.author!.username}`) : undefined}
          onReport={session ? () => setReport({ vouchId: v.id }) : undefined} />
      )) : <Empty>No vouches yet. If you know {first}, be the first.</Empty>}
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
