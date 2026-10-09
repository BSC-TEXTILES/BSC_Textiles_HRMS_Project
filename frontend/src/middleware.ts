import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

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
    const token = req.nextauth?.token;
    const pathname = req.nextUrl.pathname;

    if (!isAllowed(pathname, token?.role)) {
      return NextResponse.redirect(
        new URL(`/403?from=${encodeURIComponent(pathname)}`, req.url)
      );
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }: { token: any; req: any }) => {
        const pathname = req.nextUrl.pathname;

        // Public routes.
        if (pathname === '/login' || pathname === '/403') return true;
        if (pathname.startsWith('/api/auth')) return true;

        return !!token;
      },
    },
  }
);

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/employees/:path*',
    '/attendance/:path*',
    '/leaves/:path*',
    '/payroll/:path*',
    '/incentives/:path*',
    '/reports/:path*',
    '/organization/:path*',
    '/operations/:path*',
    '/admin/:path*',
    '/my-desk/:path*',
    '/profile/:path*',
  ],
};
