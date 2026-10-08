import type { NextConfig } from 'next';

const API_URL = 'http://localhost:4000';

const backendRoutes = [
  'health',
  'users',
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
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['localhost'],
  },
  async rewrites() {
    return backendRoutes.map((route) => ({
      source: `/api/${route}/:path*`,
      destination: `${API_URL}/api/${route}/:path*`,
    }));
  },
};

export default nextConfig;
