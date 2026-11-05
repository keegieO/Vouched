import { useColorScheme } from 'react-native';
import { THEMES, isStyle, type StyleKey, type ThemeKey } from '@vouched/shared';

// Clean, flat, X-style: white/black, hairline dividers, one blue accent, highlighter yellow for polls.
const light = {
  bg: '#FFFFFF', surface: '#FFFFFF', card: '#FFFFFF', sunk: '#F7F9F9', ink: '#0F1419', muted: '#536471', line: '#EFF3F4', line2: '#CFD9DE',
  accentInk: '#FFFFFF', good: '#00A36C', goodSoft: '#E3F6EE', bad: '#F4212E', badSoft: '#FDE7E9', sig: '#1D35B8',
  hi: '#FFD400', hiSoft: '#FFF8D6', hiInk: '#2A2300',
};
const dark: typeof light = {
  bg: '#000000', surface: '#000000', card: '#000000', sunk: '#16181C', ink: '#E7E9EA', muted: '#71767B', line: '#2F3336', line2: '#3E4144',
  accentInk: '#000000', good: '#00BA7C', goodSoft: '#06261B', bad: '#F4212E', badSoft: '#2C0B0E', sig: '#A9B5FF',
  hi: '#FFD400', hiSoft: '#2A2509', hiInk: '#2A2300',
};

// Public-page styles. Signed follows the phone's light/dark setting; the others keep their own look.
const STYLE_PALETTES: Record<Exclude<StyleKey, 'signed'>, typeof light> = {
  pop: { bg: '#FFD23F', surface: '#FFF8E0', card: '#FFFFFF', sunk: '#FFF1B8', ink: '#161616', muted: '#3F3B2E', line: '#161616',
    accentInk: '#161616', good: '#146B43', goodSoft: '#C9F5DD', bad: '#B4322A', badSoft: '#FBE4E1', sig: '#161616', hi: '#FFE14D', hiSoft: '#FFF6C7', hiInk: '#3B3100', line2: '#161616' },
  night: { bg: '#12101F', surface: '#1C1930', card: '#1C1930', sunk: '#16132A', ink: '#EDEAF8', muted: '#A9A5C6', line: '#2E2A48',
    accentInk: '#12101F', good: '#7EE0B5', goodSoft: '#173A2E', bad: '#FF9C92', badSoft: '#40201D', sig: '#EDEAF8', hi: '#FFE14D', hiSoft: '#3A3410', hiInk: '#2B2400', line2: '#3A3560' },
  badge: { bg: '#E9ECF0', surface: '#F4F6F8', card: '#FFFFFF', sunk: '#E3E7EC', ink: '#20242A', muted: '#48505C', line: '#C6CCD5',
    accentInk: '#20242A', good: '#1D7A4E', goodSoft: '#DDF2E7', bad: '#B4322A', badSoft: '#FBE4E1', sig: '#20242A', hi: '#FFE14D', hiSoft: '#FFF6C7', hiInk: '#3B3100', line2: '#B3BAC5' },
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
      dark: sysDark, style: s, border: 1, radius: 16, hardShadow: false, dashed: false, upper: false };
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
