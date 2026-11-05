import { useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type TextStyle, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { initials, timeAgo, type VouchWithAuthor } from '@vouched/shared';
import { useColors, type Colors } from '@/lib/theme';
import { useAuth } from '@/lib/auth';

export const FONT_DISPLAY = 'Inter_900Black';
export const FONT_BOLD = 'Inter_700Bold';
export const FONT_HEAVY = 'Inter_800ExtraBold';
export const FONT_BODY = 'Inter_400Regular';
export const FONT_MED = 'Inter_600SemiBold';
export const FONT_SIG = 'NothingYouCouldDo_400Regular';
const AV = [['#FFD9C7', '#7A2E0E'], ['#CDEFDD', '#0E5A3A'], ['#DCE3FF', '#1F2F8A'], ['#FCE0EF', '#7A1B4C'], ['#FFF0B0', '#5C4600'], ['#E5DBFF', '#3E2380'], ['#CDEEF5', '#0B4E5C'], ['#FFE0D6', '#8A2B12']];
export const tint = (s: string) => { let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };

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
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">{children}</ScrollView>
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
    h1: { fontSize: 30, fontFamily: FONT_DISPLAY, letterSpacing: -1, color: c.ink, lineHeight: 34 },
    h2: { fontSize: 21, fontFamily: FONT_HEAVY, letterSpacing: -0.5, color: c.ink },
    h3: { fontSize: 16, fontFamily: FONT_BOLD, color: c.ink },
    body: { fontSize: 15, fontFamily: FONT_BODY, color: c.ink, lineHeight: 21 },
    muted: { fontSize: 15, fontFamily: FONT_BODY, color: c.muted, lineHeight: 21 },
    label: { fontSize: 13, fontFamily: FONT_BOLD, color: c.muted },
    hint: { fontSize: 13, fontFamily: FONT_BODY, color: c.muted },
  };
  return <Text style={[base[v], style]} numberOfLines={numberOfLines}>{children}</Text>;
}

export function Button({ title, onPress, kind = 'primary', disabled, busy, small, style }: {
  title: string; onPress: () => void; kind?: 'primary' | 'accent' | 'ghost' | 'danger' | 'ink' | 'hi' | 'soft'; disabled?: boolean; busy?: boolean; small?: boolean; style?: ViewStyle;
}) {
  const c = useC();
  const bg = { primary: c.ink, accent: c.accent, danger: c.badSoft, ink: c.ink, hi: c.hi, soft: c.sunk, ghost: 'transparent' }[kind];
  const fg = { primary: c.bg, accent: c.accentInk, danger: c.bad, ink: c.bg, hi: c.hiInk, soft: c.ink, ghost: c.ink }[kind];
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{
        backgroundColor: bg, borderColor: kind === 'ghost' ? c.line2 : bg, borderWidth: 1, borderRadius: c.style === 'badge' ? 8 : 999,
        paddingVertical: small ? 7 : 12, paddingHorizontal: small ? 14 : 20, alignItems: 'center', justifyContent: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      }, style]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontFamily: FONT_BOLD, fontSize: small ? 14 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const c = useC();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <T v="label">{label}</T>
      <TextInput placeholderTextColor={c.muted} {...props}
        onFocus={e => { setFocus(true); props.onFocus?.(e); }} onBlur={e => { setFocus(false); props.onBlur?.(e); }}
        style={[{ backgroundColor: c.bg, borderColor: focus ? c.accent : c.line2, borderWidth: focus ? 2 : 1, borderRadius: 10, paddingHorizontal: 14,
          paddingVertical: 12, fontSize: 16, color: c.ink, fontFamily: FONT_BODY }, props.multiline && { minHeight: 120, textAlignVertical: 'top' }, props.style]} />
      {hint ? <T v="hint">{hint}</T> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress, count, disabled, c: cProp }: { label: string; selected?: boolean; onPress?: () => void; count?: number; disabled?: boolean; c?: Colors }) {
  const fallback = useC();
  const c = cProp ?? fallback;
  return (
    <Pressable onPress={onPress} disabled={!onPress || disabled} accessibilityState={{ selected }}
      style={{ paddingVertical: 7, paddingHorizontal: 14, borderRadius: c.style === 'badge' ? 4 : 999, borderWidth: c.style === 'pop' ? 2 : 1,
        borderColor: selected ? c.ink : c.line2, backgroundColor: selected ? c.ink : c.card, opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontFamily: FONT_MED, fontSize: 14, color: selected ? c.bg : c.ink }}>
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
  return <View style={[{ backgroundColor: c.card, borderColor: c.line, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }, style]}>{children}</View>;
}

export function Banner({ children, tone = 'accent' }: { children: React.ReactNode; tone?: 'accent' | 'good' | 'bad' }) {
  const c = useC();
  const bg = tone === 'good' ? c.goodSoft : tone === 'bad' ? c.badSoft : c.accentSoft;
  const fg = tone === 'good' ? c.good : tone === 'bad' ? c.bad : c.ink;
  return <View style={{ backgroundColor: bg, borderRadius: 14, padding: 12 }}><Text style={{ color: fg, fontSize: 15 }}>{children}</Text></View>;
}

export function Avatar({ name, url, size = 64, theme, pageStyle }: { name: string; url?: string | null; size?: number; theme?: string | null; pageStyle?: string | null }) {
  const c = useC(theme, pageStyle);
  const signed = c.style === 'signed';
  const [tbg, tfg] = tint(name || '?');
  return (
    <View style={{ width: size, height: size, borderRadius: c.style === 'badge' ? 6 : size / 2,
      backgroundColor: signed ? tbg : c.style === 'pop' || c.style === 'badge' ? c.accent : c.accentSoft,
      borderWidth: c.style === 'pop' ? 3 : c.style === 'night' ? 3 : 0, borderColor: c.style === 'night' ? c.accent : c.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} />
        : <Text style={{ color: signed ? tfg : c.style === 'pop' || c.style === 'badge' ? c.ink : c.accent, fontFamily: FONT_BOLD, fontSize: size * 0.36 }}>{initials(name)}</Text>}
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
        <Pressable onPress={onAuthorPress} disabled={!onAuthorPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <Avatar name={v.author?.display_name ?? '?'} url={v.author?.avatar_url} size={32} theme={theme} pageStyle={pageStyle} />
          <View style={{ flexShrink: 1 }}>
            <Text style={c.style === 'signed' ? { fontFamily: FONT_SIG, fontSize: 21, color: c.sig } : { fontSize: 15, color: c.sig, fontWeight: '800' }}>{v.author?.display_name ?? 'Deleted account'}</Text>
            <T v="hint" c={c}>{timeAgo(v.approved_at ?? v.created_at)}</T>
          </View>
        </Pressable>
        {v.author?.phone_verified ? (
          <View style={{ borderWidth: 1.5, borderColor: c.good, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '-4deg' }] }}>
            <Text style={{ color: c.good, fontSize: 11, fontWeight: '800' }}>✓ Real person</Text>
          </View>
        ) : null}
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
