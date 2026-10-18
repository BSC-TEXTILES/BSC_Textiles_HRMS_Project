import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';
import { getRoleHomePath } from '@/lib/roles';

/**
 * Run on the Node.js runtime instead of the Edge runtime. Vercel Services
 * (vercel.json `services`) rejects Edge Function output, so the default Edge
 * middleware would fail the deploy with:
 *   "Edge Runtime is not supported in services ... produced Edge Function
 *    output 'src/middleware'". Node.js middleware is emitted as a regular
 *    function and is accepted.
 */
export const runtime = 'nodejs';

/**
 * Frontend RBAC rules. They mirror the sidebar filtering in
 * `components/layout/DashboardLayout.tsx`; the backend re-checks every request
 * through `authenticate` + `authorize`/`requireRole`, so this is defence in
 * depth — never the only gate.
 */
const ROUTE_RULES: Array<{ prefix: string; roles: string[]; except?: string[] }> = [
  {
    prefix: '/admin',
    roles: ['SUPER_ADMIN', 'ADMIN'],
  },
  {
    prefix: '/operations',
    roles: [
      'SUPER_ADMIN',
      'ADMIN',
      'HR',
      'HR_MANAGER',
      'HR_EXECUTIVE',
      'LOCATION_MANAGER',
      'FLOOR_MANAGER',
    ],
  },
  {
    prefix: '/payroll',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'],
  },
  {
    prefix: '/incentives',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'],
  },
  {
    prefix: '/organization',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'],
  },
  {
    prefix: '/reports',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'],
  },
  {
    // Candidate hiring is HR work; store managers screen walk-ins at their
    // location. The public candidate form lives under /apply, which is not in
    // the matcher below and therefore never passes through this middleware.
    prefix: '/hiring',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'LOCATION_MANAGER', 'FLOOR_MANAGER'],
  },
  {
    prefix: '/employees',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'],
    // Every signed-in user may open the profile dossier (their own record is
    // linked from the account menu regardless of role).
    except: ['/employees/profile'],
  },
];

/** Exact paths (checked before prefixes) that require elevated access. */
const EXACT_RULES: Array<{ path: string; roles: string[] }> = [
  {
    path: '/attendance/calculation',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'],
  },
  {
    path: '/attendance/corrections',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'],
  },
  {
    path: '/attendance/missed-punching',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'],
  },
  {
    // Attendance workbooks leave the system; same audience as the ledger.
    path: '/attendance/export',
    roles: ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'FLOOR_MANAGER'],
  },
];

function isAllowed(pathname: string, role?: string): boolean {
  const userRole = role || '';

  const exact = EXACT_RULES.find((rule) => rule.path === pathname);
  if (exact) return exact.roles.includes(userRole);

  const rule = ROUTE_RULES.find((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`));
  if (!rule) return true;

  if (rule.except?.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }

  return rule.roles.includes(userRole);
}

export default withAuth(
  function middleware(req: any) {
    try {
      const token = req.nextauth?.token;
      const pathname = req.nextUrl.pathname;

      // Root path: redirect to dashboard/home if authenticated, or login if not
      if (pathname === '/') {
        if (token) {
          const dest = getRoleHomePath(token.role as string);
          return NextResponse.redirect(new URL(dest, req.url));
        }
        return NextResponse.redirect(new URL('/login', req.url));
      }

      if (!isAllowed(pathname, token?.role)) {
        return NextResponse.redirect(
          new URL(`/403?from=${encodeURIComponent(pathname)}`, req.url)
        );
      }

      return NextResponse.next();
    } catch (err) {
      console.error('[Middleware Error]:', err);
      return NextResponse.next();
    }
  },
  {
    pages: {
      signIn: '/login',
    },
    // A committed fallback secret means anyone with the repository can mint a
    // session token, so production refuses to boot without a real one.
    secret:
      process.env.NEXTAUTH_SECRET ||
      (process.env.NODE_ENV === 'production'
        ? (() => {
            throw new Error('NEXTAUTH_SECRET is required in production');
          })()
        : 'bsc-textiles-hrms-dev-nextauth-secret-change-me-32-chars'),
    callbacks: {
      authorized: ({ token, req }: { token: any; req: any }) => {
        const pathname = req.nextUrl.pathname;

        // Public routes. The four policy documents must be readable from the
        // sign-in screen, before anyone has a session.
        if (pathname === '/login' || pathname === '/403') return true;
        if (pathname.startsWith('/api/')) return true;
        if (
          pathname === '/privacy-policy' ||
          pathname === '/terms-of-use' ||
          pathname === '/cookie-policy' ||
          pathname === '/data-retention'
        ) {
          return true;
        }

        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/',
    '/dashboard',
    '/dashboard/:path*',
    '/employees',
    '/employees/:path*',
    '/attendance',
    '/attendance/:path*',
    '/leaves',
    '/leaves/:path*',
    '/payroll',
    '/payroll/:path*',
    '/incentives',
    '/incentives/:path*',
    '/reports',
    '/reports/:path*',
    '/organization',
    '/organization/:path*',
    '/operations',
    '/operations/:path*',
    '/hiring',
    '/hiring/:path*',
    '/admin',
    '/admin/:path*',
    '/my-desk',
    '/my-desk/:path*',
    '/profile',
    '/profile/:path*',
  ],
};
