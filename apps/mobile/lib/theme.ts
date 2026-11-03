import { useColorScheme } from 'react-native';
import { THEMES, type ThemeKey } from '@vouched/shared';

const light = {
  bg: '#F3F5FA', surface: '#FBFCFE', card: '#FFFFFF', ink: '#131A2F', muted: '#5B6580', line: '#D9DFEB',
  accentInk: '#FFFFFF', good: '#1D8657', goodSoft: '#DFF3E8', bad: '#B4322A', badSoft: '#FBE4E1', sig: '#22307A',
};
const dark: typeof light = {
  bg: '#0A0D17', surface: '#111628', card: '#192037', ink: '#E8ECF7', muted: '#97A1BD', line: '#29314F',
  accentInk: '#0B0F1C', good: '#4BC48D', goodSoft: '#143326', bad: '#FF8A7E', badSoft: '#40201D', sig: '#BBC6FF',
};

export type Colors = typeof light & { accent: string; accentSoft: string; dark: boolean };

export function useColors(theme: ThemeKey | string | null | undefined = 'cobalt'): Colors {
  const isDark = useColorScheme() === 'dark';
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'cobalt'];
  return { ...(isDark ? dark : light), accent: isDark ? t.dark : t.light, accentSoft: isDark ? t.softDark : t.soft, dark: isDark };
}
