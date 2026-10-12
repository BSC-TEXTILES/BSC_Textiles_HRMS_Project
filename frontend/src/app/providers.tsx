'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/context/ThemeContext';
import { NotificationProvider } from '@/context/NotificationContext';

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
          {children}
        </NotificationProvider>
        <Toaster position="top-right" />
      </ThemeProvider>
    </SessionProvider>
  );
}