import { useState } from 'react';
import { Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { TRUSTED_MIN_CIRCLES, TRUSTED_MIN_VOUCHES, profileLink, trustSummary } from '@vouched/shared';
import { useAuth } from '@/lib/auth';
import { SITE_URL } from '@/lib/supabase';
import { useVouches } from '@/lib/hooks';
import { useProfileLinks, useSocialCounts } from '@/lib/social';
import { CosignButton, ReplyBlock, ReplyControl } from '@/components/social';
import { ProfileHeader } from '@/components/ProfileHeader';
import { PropsCloud, StatRow, VouchedInBy, useTrust } from '@/components/trust';
import { ReportSheet } from '@/components/ReportSheet';
import { Banner, Button, Chip, Empty, Panel, Row, Screen, T, VouchCard, useC } from '@/components/ui';

export default function MyProfile() {
  const { profile } = useAuth();
  const router = useRouter();
  const c = useC();
  const { vouches, reload } = useVouches(profile?.id, 'approved');
  const { counts } = useSocialCounts(profile?.id, profile?.id ?? null);
  const { links } = useProfileLinks(profile?.id);
  const [filter, setFilter] = useState('All');
  const [copied, setCopied] = useState(false);
  const [report, setReport] = useState<{ vouchId: string } | null>(null);
  const trust = useTrust(profile?.id, profile?.invited_by, profile?.id ?? null);
  if (!profile) return null;

  const s = trustSummary(vouches);
  const url = profileLink(SITE_URL, profile.username);
  const circles = ['All', ...Array.from(new Set(vouches.map(v => v.relationship)))];
  const ordered = profile.pinned_vouch_id ? [...vouches.filter(v => v.id === profile.pinned_vouch_id), ...vouches.filter(v => v.id !== profile.pinned_vouch_id)] : vouches;
  const shown = filter === 'All' ? ordered : ordered.filter(v => v.relationship === filter);
  const pct = Math.min(100, Math.round((s.countedTowardBadge / TRUSTED_MIN_VOUCHES) * 100));

  return (
    <Screen>
      <ProfileHeader profile={profile} vouches={vouches} social={counts} links={links} />
      <VouchedInBy inviter={trust.inviter} />
      <StatRow vouches={vouches.length} props={trust.propsTotal} record={trust.record} onPress={k => k === 'backed' && router.push(`/${profile.username}`)} />
      <PropsCloud props={trust.props} />

      <Panel>
        <T v="h3">Your link</T>
        <T style={{ fontWeight: '600' }} numberOfLines={1}>{url.replace(/^https?:\/\//, '')}</T>
        <Row>
          <Button small title={copied ? 'Copied' : 'Copy link'} onPress={async () => { await Clipboard.setStringAsync(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }} />
          <Button small kind="ghost" title="Share" onPress={() => Share.share({ message: url, url })} />
          <Button small kind="ghost" title="View public" onPress={() => router.push(`/${profile.username}`)} />
          <Button small kind="ghost" title="Settings" onPress={() => router.push('/settings')} />
          <Button small kind="ghost" title="Request a vouch" onPress={() => router.push('/request-vouch')} />
          <Button small kind="ghost" title="Invites" onPress={() => router.push('/invite')} />
        </Row>
        <T v="hint">Put it in your Hinge, Instagram or TikTok bio, or paste it into a job or rental application.</T>
      </Panel>

      {s.trusted ? <Banner>You’re Trusted. The badge shows on your public profile.</Banner> : (
        <Panel>
          <Row style={{ justifyContent: 'space-between' }}>
            <T v="h3">Trusted badge</T>
            <T v="hint">{s.countedTowardBadge}/{TRUSTED_MIN_VOUCHES} · {s.nonFamilyCircles}/{TRUSTED_MIN_CIRCLES} circles</T>
          </Row>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: c.line, overflow: 'hidden' }}>
            <View style={{ width: `${pct}%`, height: 8, backgroundColor: c.good, borderRadius: 4 }} />
          </View>
          <T v="hint">Get {TRUSTED_MIN_VOUCHES} vouches from at least {TRUSTED_MIN_CIRCLES} parts of your life. Family vouches count half.</T>
          <Button title="Ask for vouches" onPress={() => router.push('/(tabs)/ask')} />
        </Panel>
      )}

      <Row style={{ justifyContent: 'space-between' }}>
        <T v="label">Vouches on your profile</T>
        <Button small kind="ghost" title="Vouches you wrote" onPress={() => router.push('/written')} />
      </Row>
      {circles.length > 2 && <Row style={{ gap: 6 }}>{circles.map(cl => <Chip key={cl} label={cl} selected={filter === cl} onPress={() => setFilter(cl)} />)}</Row>}
      {shown.length ? shown.map(v => (
        <VouchCard key={v.id} v={v} onAuthorPress={v.author ? () => router.push(`/${v.author!.username}`) : undefined} onReport={() => setReport({ vouchId: v.id })}
          footer={<View style={{ gap: 8 }}>
            <CosignButton vouchId={v.id} subjectId={v.subject_id} authorId={v.author_id} cosigns={v.cosigns ?? []} />
            {v.reply ? <ReplyBlock name={profile.display_name} text={v.reply} /> : <ReplyControl vouchId={v.id} authorFirst={(v.author?.display_name ?? '').split(' ')[0] || 'them'} onDone={reload} />}
          </View>} />
      )) : <Empty>No vouches yet. Send your link to three people who know you well.</Empty>}
      <ReportSheet target={report} onClose={() => setReport(null)} />
    </Screen>
  );
}
