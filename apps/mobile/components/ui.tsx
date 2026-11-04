import { useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initials, timeAgo, type VouchWithAuthor } from '@vouched/shared';
import { useColors, type Colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';

export function useC(theme?: string | null, style?: string | null) {
  const { profile } = useAuth();
  return useColors(theme ?? profile?.theme, style);
}

export function Screen({ children, scroll = true, theme, pageStyle, edges = ['top'] }: {
  children: React.ReactNode; scroll?: boolean; theme?: string | null; pageStyle?: string | null; edges?: ('top' | 'bottom')[];
}) {
  const c = useC(theme, pageStyle);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={edges}>
      {scroll ? (
        <ScrollView contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : <View style={{ flex: 1, padding: 20, gap: 18 }}>{children}</View>}
    </SafeAreaView>
  );
}

export function T({ children, v = 'body', style, c: cProp, numberOfLines }: {
  children: React.ReactNode; v?: 'h1' | 'h2' | 'h3' | 'body' | 'muted' | 'label' | 'hint'; style?: TextStyle; c?: Colors; numberOfLines?: number;
}) {
  const fallback = useC();
  const c = cProp ?? fallback;
  const base: Record<string, TextStyle> = {
    h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.6, color: c.ink, lineHeight: 36 },
    h2: { fontSize: 23, fontWeight: '800', letterSpacing: -0.4, color: c.ink },
    h3: { fontSize: 17, fontWeight: '700', color: c.ink },
    body: { fontSize: 16, color: c.ink, lineHeight: 23 },
    muted: { fontSize: 15, color: c.muted, lineHeight: 21 },
    label: { fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', color: c.muted },
    hint: { fontSize: 13, color: c.muted },
  };
  return <Text style={[base[v], style]} numberOfLines={numberOfLines}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', disabled, busy, small, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger'; disabled?: boolean; busy?: boolean; small?: boolean; style?: ViewStyle;
}) {
  const c = useC();
  const bg = kind === 'primary' ? c.accent : kind === 'danger' ? c.badSoft : 'transparent';
  const fg = kind === 'primary' ? c.accentInk : kind === 'danger' ? c.bad : c.ink;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{
        backgroundColor: bg, borderColor: kind === 'ghost' ? c.line : bg, borderWidth: 1, borderRadius: small ? 10 : 14,
        paddingVertical: small ? 8 : 13, paddingHorizontal: small ? 12 : 18, alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 14 : 16 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useC();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="h3" style={{ fontSize: 15, fontWeight: '600' }}>{label}</T>
      <TextInput placeholderTextColor={c.muted} {...props}
        onFocus={e => { setFocus(true); props.onFocus?.(e); }} onBlur={e => { setFocus(false); props.onBlur?.(e); }}
        style={[{ backgroundColor: c.card, borderColor: focus ? c.accent : c.line, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12,
          paddingVertical: 11, fontSize: 16, color: c.ink }, props.multiline && { minHeight: 120, textAlignVertical: 'top' }, props.style]} />
      {hint ? <T v="hint">{hint}</T> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, count, disabled, c: cProp }: { label: string; selected?: boolean; onPress?: () => void; count?: number; disabled?: boolean; c?: Colors }) {
  const fallback = useC();
  const c = cProp ?? fallback;
  return (
    <Pressable onPress={onPress} disabled={!onPress || disabled} accessibilityState={{ selected }}
      style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: c.style === 'badge' ? 4 : 999, borderWidth: c.style === 'pop' ? 2 : 1,
        borderColor: selected ? c.accent : c.line, backgroundColor: selected ? c.accent : c.card, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontWeight: '600', fontSize: 14, color: selected ? c.accentInk : c.ink }}>
        {label}{count !== undefined ? <Text style={{ opacity: 0.6 }}>  ×{count}</Text> : null}
      </Text>
    </Pressable>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: ViewStyle }) => (
  <View style={[{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }, style]}>{children}</View>
);

export function Panel({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useC();
  return <View style={[{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 }, style]}>{children}</View>;
}

export function Banner({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'good' | 'bad' }) {
  const c = useC();
  const bg = tone === 'good' ? c.goodSoft : tone === 'bad' ? c.badSoft : c.accentSoft;
  const fg = tone === 'good' ? c.good : tone === 'bad' ? c.bad : c.ink;
  return <View style={{ backgroundColor: bg, borderRadius: 14, padding: 12 }}><Text style={{ color: fg, fontSize: 15 }}>{children}</Text></View>;
}

export function Avatar({ name, url, size = 64, theme, pageStyle }: { name: string; url?: string | null; size?: number; theme?: string | null; pageStyle?: string | null }) {
  const c = useC(theme, pageStyle);
  const round = c.style === 'pop' || c.style === 'night';
  return (
    <View style={{ width: size, height: size, borderRadius: round ? size / 2 : c.style === 'badge' ? 6 : size * 0.3,
      backgroundColor: c.style === 'pop' || c.style === 'badge' ? c.accent : c.accentSoft,
      borderWidth: c.style === 'pop' ? 3 : c.style === 'night' ? 3 : 0, borderColor: c.style === 'night' ? c.accent : c.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} />
        : <Text style={{ color: c.style === 'pop' || c.style === 'badge' ? c.ink : c.accent, fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>}
    </View>
  );
}

export function VouchCard({ v, footer, onAuthorPress, theme, pageStyle, index = 0, onReport }: {
  v: VouchWithAuthor; footer?: React.ReactNode; onAuthorPress?: () => void; theme?: string | null; pageStyle?: string | null; index?: number; onReport?: () => void;
}) {
  const c = useC(theme, pageStyle);
  const card: ViewStyle = {
    backgroundColor: c.style === 'night' ? c.surface : c.card,
    borderColor: c.style === 'badge' ? '#B3BAC5' : c.line, borderWidth: c.style === 'signed' ? 1 : c.border,
    borderStyle: c.dashed ? 'dashed' : 'solid', borderRadius: c.radius,
    ...(c.style === 'night' ? (index % 2 ? { borderBottomRightRadius: 8 } : { borderBottomLeftRadius: 8 }) : null),
    ...(c.hardShadow ? { shadowColor: '#161616', shadowOffset: { width: 5, height: 5 }, shadowOpacity: 1, shadowRadius: 0,
      transform: [{ rotate: index % 2 ? '0.8deg' : '-0.8deg' }] } : null),
  };
  return (
    <View style={[styles.card, card]}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text style={[{ color: c.style === 'pop' || c.style === 'badge' ? c.ink : c.accent, fontWeight: '700', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
          c.style === 'pop' && { backgroundColor: c.accent, borderWidth: 2, borderColor: c.ink, borderRadius: 999, paddingHorizontal: 8, overflow: 'hidden' }]}>{v.relationship}</Text>
        <Row style={{ gap: 10 }}>
          <T v="hint" c={c}>{v.duration}</T>
          {onReport && <Pressable onPress={onReport} hitSlop={10} accessibilityLabel="Report"><Text style={{ color: c.muted, fontWeight: '800' }}>⋯</Text></Pressable>}
        </Row>
      </Row>
      <T c={c}>{v.body}</T>
      {v.traits.length > 0 && (
        <Row style={{ gap: 6 }}>
          {v.traits.map(t => (
            <View key={t} style={{ backgroundColor: c.accentSoft, borderRadius: c.style === 'badge' ? 4 : 999, borderWidth: c.style === 'pop' ? 2 : 0, borderColor: c.ink, paddingVertical: 4, paddingHorizontal: 10 }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: c.ink }}>{t}</Text>
            </View>
          ))}
        </Row>
      )}
      <View style={{ borderTopWidth: 1, borderStyle: c.style === 'night' ? 'solid' : 'dashed', borderColor: c.line, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <Pressable onPress={onAuthorPress} disabled={!onAuthorPress}>
          <Text style={c.style === 'signed' ? { fontStyle: 'italic', fontSize: 18, color: c.sig, fontWeight: '600' } : { fontSize: 15, color: c.sig, fontWeight: '800' }}>{v.author?.display_name ?? 'Deleted account'}</Text>
        </Pressable>
        <T v="hint" c={c}>{v.author ? '✓ Verified · ' : ''}{timeAgo(v.approved_at ?? v.created_at)}</T>
      </View>
      {footer}
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  const c = useC();
  return (
    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: c.line, borderRadius: 18, padding: 28, alignItems: 'center' }}>
      <Text style={{ color: c.muted, textAlign: 'center', fontSize: 15 }}>{children}</Text>
    </View>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return children ? <Banner tone="bad">{children}</Banner> : null;
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 12 },
});
