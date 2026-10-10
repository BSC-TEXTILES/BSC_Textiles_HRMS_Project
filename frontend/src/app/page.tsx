'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { getRoleHomePath, sanitizeCallbackUrl } from '@/lib/roles';

/**
 * Landing route: sends visitors to the login screen, or to the dashboard that
 * matches their role once a session exists.
 */
export default function Home() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (status === 'authenticated' && session?.user) {
      const callback = new URLSearchParams(window.location.search).get('callbackUrl');
      const target = sanitizeCallbackUrl(
        callback,
        getRoleHomePath(session.user.role)
      );
      window.location.replace(target);
      return;
    }

    if (status === 'unauthenticated') {
      const localToken = localStorage.getItem('bsc_token') || localStorage.getItem('token');
      if (!localToken) {
        window.location.replace('/login');
      } else {
        window.location.replace('/dashboard');
      }
    }
  }, [status, session]);

  // Instant safety fallback: if auth check hasn't resolved within 800ms, redirect to /login
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (typeof window !== 'undefined') {
        window.location.replace('/login');
      }
    }, 800);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] dark:bg-[#111317]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-[#722F37] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Redirecting to workspace…
        </p>
        <a
          href="/login"
          className="text-xs font-medium text-[#722F37] hover:underline mt-2 transition-colors"
        >
          Click here if not redirected automatically →
        </a>
      </div>
    </div>
  );
}
