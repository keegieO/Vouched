import Link from 'next/link';
import { THEMES, initials, type ThemeKey } from '@vouched/shared';

export function CheckMark({ size = 16, color = 'var(--accent-ink)', width = 3 }: { size?: number; color?: string; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  );
}

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="logo" aria-label="Vouched home">
      <span className="mark"><CheckMark /></span>
      <span className="word">vouched</span>
    </Link>
  );
}

const AV = [['#FFD9C7', '#7A2E0E'], ['#CDEFDD', '#0E5A3A'], ['#DCE3FF', '#1F2F8A'], ['#FCE0EF', '#7A1B4C'], ['#FFF0B0', '#5C4600'], ['#E5DBFF', '#3E2380'], ['#CDEEF5', '#0B4E5C'], ['#FFE0D6', '#8A2B12']];
const tint = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };

export function Avatar({ name, url, size = 64 }: { name: string; url?: string | null; size?: number }) {
  const [bg, fg] = tint(name || '?');
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: Math.round(size * 0.36), background: url ? undefined : bg, color: url ? undefined : fg }}>
      {url ? <img src={url} alt="" /> : initials(name)}
    </span>
  );
}

export function themeStyle(theme: ThemeKey | string | null | undefined): React.CSSProperties {
  const t = THEMES[(theme as ThemeKey) in THEMES ? (theme as ThemeKey) : 'cobalt'];
  return { ['--acc-l' as string]: t.light, ['--acc-d' as string]: t.dark, ['--soft-l' as string]: t.soft, ['--soft-d' as string]: t.softDark };
}

export function VerifiedPerson() {
  return <span className="ver"><CheckMark size={12} color="currentColor" /> Verified person</span>;
}
