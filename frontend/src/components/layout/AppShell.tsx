'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { DashboardLayoutFullShell } from './DashboardLayoutFullShell';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const currentPath = (pathname || '').toLowerCase();

  // If on public marketing landing page, login page, 403, legal policies, or standalone public
  // routes. /apply is the no-login candidate application form: no sidebar, no session assumptions.
  const isNonShellRoute =
    currentPath === '/' ||
    currentPath === '/login' ||
    currentPath.startsWith('/login/') ||
    currentPath === '/403' ||
    currentPath.startsWith('/403/') ||
    currentPath === '/not-found' ||
    currentPath.startsWith('/not-found/') ||
    currentPath === '/apply' ||
    currentPath.startsWith('/apply/') ||
    currentPath === '/privacy-policy' ||
    currentPath.startsWith('/privacy-policy/') ||
    currentPath === '/terms-of-use' ||
    currentPath.startsWith('/terms-of-use/') ||
    currentPath === '/cookie-policy' ||
    currentPath.startsWith('/cookie-policy/') ||
    currentPath === '/data-retention' ||
    currentPath.startsWith('/data-retention/') ||
    currentPath.startsWith('/api');

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
