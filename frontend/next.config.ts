import type { NextConfig } from 'next';
import path from 'path';

const API_URL = process.env.BACKEND_URL || 'http://localhost:4000';

/**
 * Backend routes exposed through the Next.js dev server as a fallback for
 * code that calls relative `/api/...` URLs. The app normally talks to the
 * backend directly via `NEXT_PUBLIC_API_URL`.
 */
const backendRoutes = [
  'health',
  'users',
  'roles',
  'settings',
  'devices',
  'kyc',
  'locations',
  'floors',
  'departments',
  'sections',
  'selling-points',
  'employees',
  'shifts',
  'attendance',
  'breaks',
  'face-verification',
  'qr-codes',
  'incentives',
  'observations',
  'live-streams',
  'weekly-offs',
  'holidays',
  'reports',
  'audit',
  'payroll',
  'penalties',
  'notifications',
  'staff-ops',
  'observation-levels',
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, '../node_modules'),
      'node_modules',
      ...(config.resolve.modules || []),
    ];
    return config;
  },
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
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=()',
          },
        ],
      },
      {
        // The realtime feed must never be buffered by a proxy or cached by a CDN.
        source: '/api/notifications/stream',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-transform' }],
      },
    ];
  },
  async rewrites() {
    return backendRoutes.map((route) => ({
      source: `/api/${route}/:path*`,
      destination: `${API_URL}/api/${route}/:path*`,
    }));
  },
};

export default nextConfig;
