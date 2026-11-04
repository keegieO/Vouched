import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: 'Vouched — put your name on it', template: '%s · Vouched' },
  description: 'The invite-only social network where every connection is backed by someone real. Three vouches a month, a track record on the line, and a trust path to anyone.',
  openGraph: { siteName: 'Vouched', type: 'website' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Vouched', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F3F6' },
    { media: '(prefers-color-scheme: dark)', color: '#090B11' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=Hanken+Grotesk:wght@400;500;600;700;800;900&family=Nothing+You+Could+Do&family=Archivo:wght@800;900&family=DM+Sans:wght@400;500;700&family=Sora:wght@600;700;800&family=Manrope:wght@400;500;600;700&family=Barlow+Condensed:wght@700;800&family=Barlow:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        {/* Apply the theme chosen in Settings → Appearance before first paint */}
        <script dangerouslySetInnerHTML={{ __html: "try{var m=localStorage.getItem('vouched-theme');if(m==='light'||m==='dark')document.documentElement.setAttribute('data-theme',m)}catch(e){}" }} />
        {children}
      </body>
    </html>
  );
}
