import path from 'node:path';
import type { NextConfig } from 'next';

const API_URL = process.env.BACKEND_URL || 'http://localhost:4000';

/**
 * This repository is the workspace root — not the drive root.
 *
 * Next walks up from `frontend/` looking for a lockfile to decide the workspace
 * root, and on this machine it finds an unrelated `D:\bun.lock` four levels up.
 * Left alone, that becomes the Turbopack root and the Docker output-tracing root,
 * which silently changes module resolution and can exclude the hoisted
 * `node_modules` from the image. Pinning it here is the fix; deleting someone
 * else's lockfile would not be.
 */
const WORKSPACE_ROOT = path.resolve(process.cwd(), '..');

/**
 * Content-Security-Policy for the browser-facing app.
 *
 * script-src keeps 'unsafe-inline' and that is a real, documented gap, not an
 * oversight: the App Router streams its payload as inline <script> tags
 * (`self.__next_f.push(...)`) — 24 of them on the login page alone — and
 * Next.js 15.5 has no way to attach a nonce to those. Any nonce or hash in
 * script-src makes the browser IGNORE 'unsafe-inline', so the choice is
 * 'unsafe-inline' or a blank page.
 *
 * What is controlled instead is where a script can GO, which is what an
 * injected script actually needs to do to be worth anything:
 *   - connect-src is 'self' plus the two dev origins, so exfiltration to an
 *     attacker's host over fetch/XHR/WebSocket is refused;
 *   - form-action 'self' blocks the same trick via a forged form;
 *   - base-uri 'self' blocks <base href> rewriting of every relative URL;
 *   - the session cookie is HttpOnly, so nothing a script runs can read it, and
 *     the access token lives in that cookie rather than localStorage.
 *
 * 'unsafe-eval' is dev-only: it is what `next dev` HMR uses, and it must not
 * exist in a production policy.
 */
function buildCsp(isDev: boolean): string {
  const directives: Array<[string, string]> = [
    ['default-src', "'self'"],
    [
      'script-src',
      isDev
        ? "'self' 'unsafe-inline' 'unsafe-eval'"
        : "'self' 'unsafe-inline'",
    ],
    // Inline style attributes are used throughout the UI, and the icon font is
    // served from Google's stylesheet host.
    ['style-src', "'self' 'unsafe-inline' https://fonts.googleapis.com"],
    // Same-origin photos come from the API; the Unsplash host is referenced by
    // demo avatars hard-coded into a handful of screens.
    [
      'img-src',
      isDev
        ? "'self' data: blob: https://images.unsplash.com http://localhost:4000"
        : "'self' data: blob: https://images.unsplash.com",
    ],
    ['font-src', "'self' data: https://fonts.gstatic.com"],
    [
      'connect-src',
      // In production the API and the socket are the same origin as the page
      // (NEXT_PUBLIC_API_URL=/api, /socket.io/ proxied by nginx), so 'self' is
      // the whole policy. Listing ws:/wss: here would defeat the point.
      isDev
        ? "'self' http://localhost:4000 ws://localhost:4000 http://127.0.0.1:4000 ws://127.0.0.1:4000"
        : "'self'",
    ],
    // The employee-document viewer embeds the API's own PDF preview.
    ['frame-src', "'self'"],
    ['worker-src', "'self' blob:"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'self'"],
  ];

  if (!isDev) directives.push(['upgrade-insecure-requests', '']);

  return directives.map(([key, value]) => (value ? `${key} ${value};` : `${key};`)).join(' ');
}

const IS_DEV = process.env.NODE_ENV !== 'production';

/**
 * Backend routes exposed through the Next.js dev server as a fallback for
 * code that calls relative `/api/...` URLs. The app normally talks to the
 * backend directly via NEXT_PUBLIC_API_URL.
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
  transpilePackages: ['recharts'],
  outputFileTracingRoot: WORKSPACE_ROOT,
  turbopack: { root: WORKSPACE_ROOT },
  images: {
    remotePatterns: [{ protocol: 'http', hostname: 'localhost' }],
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '12mb' },
    optimizePackageImports: ['lucide-react', 'recharts', 'date-fns'],
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // SAMEORIGIN, not DENY: the employee-document viewer embeds a
          // same-origin API response in an iframe. Keep this identical to
          // infra/nginx/snippets/security-headers.conf, which hides the
          // upstream value and re-emits its own at the edge.
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            // camera for enrolment and attendance selfies, geolocation for
            // showroom check-in — both are real features of this product.
            value: 'geolocation=(self), camera=(self), microphone=(self), payment=(), usb=()',
          },
          { key: 'Content-Security-Policy', value: buildCsp(IS_DEV) },
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
    return {
      fallback: [
        {
          source: '/api/:path*',
          destination: `${API_URL}/api/:path*`,
        },
      ],
    };
  },
};

export default nextConfig;
