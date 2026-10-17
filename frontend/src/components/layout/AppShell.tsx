'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DashboardLayoutFullShell } from './DashboardLayoutFullShell';

// Routes that do NOT use the enterprise app shell
const NON_SHELL_ROUTES = ['/', '/login', '/403', '/not-found'];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // If on public marketing landing page, login page, 403, or standalone public
  // routes. /apply is the no-login candidate application form: no sidebar, no
  // session assumptions.
  const isNonShellRoute = 
    NON_SHELL_ROUTES.includes(pathname) ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/403') ||
    pathname.startsWith('/apply') ||
    pathname.startsWith('/api');

  if (isNonShellRoute) {
    return <>{children}</>;
  }

  return (
    <DashboardLayoutFullShell>
      {children}
    </DashboardLayoutFullShell>
  );
}

export default AppShell;
