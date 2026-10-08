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

/** @type {import('next').NextConfig} */
const nextConfig = {
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

module.exports = nextConfig;
