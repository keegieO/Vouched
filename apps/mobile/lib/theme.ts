import { useColorScheme } from 'react-native';
import { THEMES, isStyle, type StyleKey, type ThemeKey } from '@vouched/shared';

const light = {
  bg: '#F3F5FA', surface: '#FBFCFE', card: '#FFFFFF', ink: '#131A2F', muted: '#5B6580', line: '#D9DFEB',
  accentInk: '#FFFFFF', good: '#1D8657', goodSoft: '#DFF3E8', bad: '#B4322A', badSoft: '#FBE4E1', sig: '#22307A',
};
const dark: typeof light = {
  bg: '#0A0D17', surface: '#111628', card: '#192037', ink: '#E8ECF7', muted: '#97A1BD', line: '#29314F',
  accentInk: '#0B0F1C', good: '#4BC48D', goodSoft: '#143326', bad: '#FF8A7E', badSoft: '#40201D', sig: '#BBC6FF',
};

// Public-page styles. Signed follows the phone's light/dark setting; the others keep their own look.
const STYLE_PALETTES: Record<Exclude<StyleKey, 'signed'>, typeof light> = {
  pop: { bg: '#FFD23F', surface: '#FFF8E0', card: '#FFFFFF', ink: '#161616', muted: '#3F3B2E', line: '#161616',
    accentInk: '#161616', good: '#146B43', goodSoft: '#C9F5DD', bad: '#B4322A', badSoft: '#FBE4E1', sig: '#161616' },
  night: { bg: '#12101F', surface: '#1C1930', card: '#1C1930', ink: '#EDEAF8', muted: '#A9A5C6', line: '#2E2A48',
    accentInk: '#12101F', good: '#7EE0B5', goodSoft: '#173A2E', bad: '#FF9C92', badSoft: '#40201D', sig: '#EDEAF8' },
  badge: { bg: '#E9ECF0', surface: '#F4F6F8', card: '#FFFFFF', ink: '#20242A', muted: '#48505C', line: '#C6CCD5',
    accentInk: '#20242A', good: '#1D7A4E', goodSoft: '#DDF2E7', bad: '#B4322A', badSoft: '#FBE4E1', sig: '#20242A' },
};

export type Colors = typeof light & {
  accent: string; accentSoft: string; dark: boolean; style: StyleKey;
  border: number; radius: number; hardShadow: boolean; dashed: boolean; upper: boolean;
};

export function useColors(theme: ThemeKey | string | null | undefined = 'cobalt', style?: StyleKey | string | null): Colors {
  const sysDark = useColorScheme() === 'dark';
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'cobalt'];
  const s: StyleKey = isStyle(style) ? style : 'signed';
  if (s === 'signed') {
    return { ...(sysDark ? dark : light), accent: sysDark ? t.dark : t.light, accentSoft: sysDark ? t.softDark : t.soft,
      dark: sysDark, style: s, border: 1, radius: 18, hardShadow: false, dashed: false, upper: false };
  }
  const p = STYLE_PALETTES[s];
  return {
    ...p, accent: t.dark, accentSoft: s === 'night' ? '#2E2A48' : s === 'pop' ? '#FFF1B8' : '#E3E7EC',
    dark: s === 'night', style: s,
    border: s === 'pop' ? 3 : s === 'badge' ? 2 : 0,
    radius: s === 'badge' ? 8 : s === 'night' ? 22 : 18,
    hardShadow: s === 'pop', dashed: s === 'badge', upper: s !== 'night',
  };
}
