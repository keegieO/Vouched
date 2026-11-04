import { View } from 'react-native';
import { trustSummary, type Profile, type Vouch } from '@vouched/shared';
import { Avatar, Chip, Row, T, useC } from './ui';

export function ProfileHeader({ profile, vouches, styled = false }: { profile: Profile; vouches: Pick<Vouch, 'relationship' | 'traits'>[]; styled?: boolean }) {
  const pageStyle = styled ? profile.style : 'signed';
  const c = useC(profile.theme, pageStyle);
  const s = trustSummary(vouches);
  const first = profile.display_name.split(' ')[0];
  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
        <Avatar name={profile.display_name} url={profile.avatar_url} size={80} theme={profile.theme} pageStyle={pageStyle} />
        <View style={{ flex: 1, gap: 4 }}>
          <T v="h2" c={c} style={c.upper && c.style !== 'signed' ? { textTransform: 'uppercase' } : undefined}>{profile.display_name}</T>
          <T v="hint" c={c}>@{profile.username}{profile.show_city && profile.city ? ` · ${profile.city}` : ''}</T>
          <Row style={{ gap: 6 }}>
            {s.trusted && <View style={{ backgroundColor: c.accent, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><T v="hint" c={c} style={{ color: c.accentInk, fontWeight: '700' }}>✓ Trusted</T></View>}
            {profile.phone_verified && <View style={{ backgroundColor: c.goodSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}><T v="hint" c={c} style={{ color: c.good, fontWeight: '600' }}>✓ Phone verified</T></View>}
          </Row>
        </View>
      </View>
      {profile.headline ? <T c={c} style={{ fontSize: 17 }}>{profile.headline}</T> : null}
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
