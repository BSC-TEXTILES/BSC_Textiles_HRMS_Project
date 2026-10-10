'use client';

import { SessionProvider } from 'next-auth/react';
import { ReactNode } from 'react';
import { Toaster } from 'react-hot-toast';
import { ThemeProvider } from '@/context/ThemeContext';
import { NotificationProvider } from '@/context/NotificationContext';

export function Providers({ children }: { children: ReactNode }) {
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