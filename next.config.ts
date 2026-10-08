import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Payslip PDFs and Excel exports are generated on demand; nothing to optimise away.
  poweredByHeader: false,
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=()' },
        ],
      },
      {
        // The realtime feed must never be buffered by a proxy or cached by a CDN.
        source: '/api/notifications/stream',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-transform' }],
      },
    ];
  },
};

export default nextConfig;
