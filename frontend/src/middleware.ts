import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req: any) {
    const token = req.nextauth?.token;
    const pathname = req.nextUrl.pathname;

    if (pathname.startsWith('/admin') && token?.role !== 'SUPER_ADMIN' && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL(`/403?from=${encodeURIComponent(pathname)}`, req.url));
    }

    if (pathname.startsWith('/operations') && !['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'LOCATION_MANAGER', 'FLOOR_MANAGER'].includes(token?.role || '')) {
      return NextResponse.redirect(new URL(`/403?from=${encodeURIComponent(pathname)}`, req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }: { token: any; req: any }) => {
        const pathname = req.nextUrl.pathname;
        
        if (pathname === '/login' || pathname === '/403') {
          return true;
        }
        
        if (pathname.startsWith('/api/auth')) {
          return true;
        }

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
  ],
};