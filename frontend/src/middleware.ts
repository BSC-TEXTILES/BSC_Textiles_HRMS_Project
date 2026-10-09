import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const pathname = req.nextUrl.pathname;

    if (pathname.startsWith('/admin') && token?.role !== 'SUPER_ADMIN' && token?.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    if (pathname.startsWith('/operations') && !['SUPER_ADMIN', 'ADMIN', 'HR', 'FLOOR_MANAGER'].includes(token?.role || '')) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const pathname = req.nextUrl.pathname;
        
        if (pathname === '/login') {
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