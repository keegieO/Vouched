/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@vouched/shared'],
  // Fonts read at runtime by the vouch story card.
  experimental: { outputFileTracingIncludes: { '/api/card/[id]': ['./assets/fonts/**'] } },
  images: { remotePatterns: [{ protocol: 'https', hostname: '*.supabase.co' }] },
};
export default nextConfig;
