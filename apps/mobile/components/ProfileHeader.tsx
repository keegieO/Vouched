import { Linking, Pressable, Text, View } from 'react-native';
import { PLATFORMS, STATUSES, linkLabel, linkUrl, trustSummary, type Profile, type ProfileLink, type Vouch } from '@vouched/shared';
import { Avatar, Chip, Row, T, useC } from './ui';
import type { SocialCounts } from '@/lib/social';

export function ProfileHeader({ profile, vouches, styled = false, social, links = [] }: { profile: Profile; vouches: Pick<Vouch, 'relationship' | 'traits'>[]; styled?: boolean; social?: SocialCounts; links?: ProfileLink[] }) {
  const pageStyle = styled ? profile.style : 'signed';
  const c = useC(profile.theme, pageStyle);
  const s = trustSummary(vouches);
  const first = profile.display_name.split(' ')[0];
  return (
    <View style={{ gap: 14 }}>
      <View style={{ height: 110, borderRadius: 22, backgroundColor: c.style === 'badge' ? '#20242A' : c.accent, overflow: 'hidden', marginBottom: -54 }}>
        {profile.cover !== 'solid' && Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={{ position: 'absolute', left: -20 + i * 70, top: profile.cover === 'grid' ? 0 : -30 + (i % 2) * 40, width: profile.cover === 'stripes' ? 18 : 60, height: profile.cover === 'grid' ? 110 : 60, borderRadius: profile.cover === 'rings' || profile.cover === 'dots' ? 999 : 0, borderWidth: profile.cover === 'rings' ? 2 : 0, borderColor: 'rgba(255,255,255,.3)', backgroundColor: profile.cover === 'rings' ? 'transparent' : 'rgba(255,255,255,.14)', transform: profile.cover === 'stripes' ? [{ rotate: '35deg' }] : undefined }} />
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-end', paddingHorizontal: 4 }}>
        <View style={{ borderRadius: 999, borderWidth: 4, borderColor: c.bg }}><Avatar name={profile.display_name} url={profile.avatar_url} size={88} theme={profile.theme} pageStyle={pageStyle} /></View>
      </View>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <View style={{ gap: 4 }}>
          <T v="h2" c={c} style={c.upper && c.style !== 'signed' ? { textTransform: 'uppercase' } : undefined}>{profile.display_name}</T>
          <T v="hint" c={c}>@{profile.username}{profile.pronouns ? ` · ${profile.pronouns}` : ''}{profile.show_city && profile.city ? ` · ${profile.city}` : ''}</T>
          <Row style={{ gap: 6 }}>
            {profile.status && <View style={{ backgroundColor: c.goodSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}><T v="hint" c={c} style={{ color: c.good, fontWeight: '700' }}>● {STATUSES[profile.status]}</T></View>}
            {s.trusted && <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><T v="hint" c={c} style={{ color: c.accentInk, fontWeight: '700' }}>✓ Trusted</T></View>}
            {social?.mutual && <View style={{ backgroundColor: c.accentSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><T v="hint" c={c} style={{ color: c.ink, fontWeight: '700' }}>⇄ You vouched for each other</T></View>}
            {profile.phone_verified && <View style={{ backgroundColor: c.goodSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><T v="hint" c={c} style={{ color: c.good, fontWeight: '600' }}>✓ Phone verified</T></View>}
          </Row>
        </View>
      </View>
      {profile.headline ? <T c={c} style={{ fontSize: 17 }}>{profile.headline}</T> : null}
      {profile.bio ? <T v="muted" c={c}>{profile.bio}</T> : null}
      {links.length > 0 && (
        <Row style={{ gap: 8 }}>
          {links.map(l => (
            <Pressable key={l.id} onPress={() => Linking.openURL(linkUrl(l))} accessibilityRole="link"
              style={{ flexDirection: 'row', gap: 6, alignItems: 'center', paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
              <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>{PLATFORMS[l.platform].name}</Text>
              <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>{linkLabel(l)}</Text>
            </Pressable>
          ))}
        </Row>
      )}
      {profile.skills?.length > 0 && <Row style={{ gap: 6 }}>{profile.skills.map(k => <Chip key={k} label={k} c={c} />)}</Row>}
      {social && (
        <Row style={{ gap: 16 }}>
          <T v="hint" c={c}><T c={c} style={{ fontWeight: '800', fontSize: 14 }}>{social.followers}</T> followers</T>
          <T v="hint" c={c}><T c={c} style={{ fontWeight: '800', fontSize: 14 }}>{social.following}</T> following</T>
          <T v="hint" c={c}><T c={c} style={{ fontWeight: '800', fontSize: 14 }}>{social.given}</T> vouches given</T>
        </Row>
      )}
      <View style={{ flexDirection: 'row', borderWidth: c.style === 'pop' ? 3 : c.style === 'night' ? 0 : 1, borderColor: c.line, borderRadius: c.style === 'badge' ? 8 : 16, backgroundColor: c.style === 'night' ? c.surface : c.card }}>
        {[[s.total, 'vouches'], [s.circles.length, 'circles of life'], [0, `written by ${first}`]].map(([n, l], i) => (
          <View key={String(l)} style={{ flex: 1, padding: 12, borderLeftWidth: i ? 1 : 0, borderColor: c.line }}>
            <T c={c} style={{ fontSize: 24, fontWeight: '800' }}>{n}</T>
            <T v="hint" c={c}>{l}</T>
          </View>
        ))}
      </View>
      {s.topTraits.length > 0 && (
        <View style={{ gap: 8 }}>
          <T v="label" c={c}>What people say most</T>
          <Row style={{ gap: 6 }}>{s.topTraits.map(([t, n]) => <Chip key={t} label={t} count={n} c={c} />)}</Row>
        </View>
      )}
    </View>
  );
}
