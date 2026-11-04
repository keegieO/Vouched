import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Vouched',
    short_name: 'Vouched',
    description: 'A profile written by the people who know you.',
    start_url: '/feed',
    display: 'standalone',
    background_color: '#F3F5FA',
    theme_color: '#2E4AD8',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  };
}
