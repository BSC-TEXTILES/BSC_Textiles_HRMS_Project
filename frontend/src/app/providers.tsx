'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/context/ThemeContext';
import { NotificationProvider } from '@/context/NotificationContext';

import { DashboardShellProvider } from '@/context/DashboardShellContext';
import { AppShell } from '@/components/layout/AppShell';
import { SessionGuard } from '@/components/security/SessionGuard';
import { CookieConsentBanner } from '@/components/security/CookieConsentBanner';

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const handleRejection = (event: PromiseRejectionEvent) => {
      const reason = event?.reason;
      if (
        reason &&
        (reason instanceof Event ||
         (typeof reason === 'object' && ('target' in reason || 'isTrusted' in reason) && !(reason instanceof Error)))
      ) {
        event.preventDefault();
        if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        console.warn('[HRMS] Handled DOM Event rejection gracefully in client lifecycle:', reason);
      }
    };

    window.addEventListener('unhandledrejection', handleRejection, { capture: true });
    return () => {
      window.removeEventListener('unhandledrejection', handleRejection, { capture: true });
    };
  }, []);

  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <ThemeProvider>
        <NotificationProvider>
          <DashboardShellProvider>
            <AppShell>
              {children}
            </AppShell>
          </DashboardShellProvider>
        </NotificationProvider>
        {/* Mounted above the shell so the timeout modal and the consent banner
            also appear on /login, where the shell is intentionally absent. */}
        <SessionGuard />
        <CookieConsentBanner />
        <Toaster position="top-right" />
      </ThemeProvider>
    </SessionProvider>
  );
}