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
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 border-[3px] border-[#0058be] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Redirecting to your workspace…
        </p>
        <a
          href="/login"
          className="text-xs font-medium text-[#0058be] hover:underline mt-2 transition-colors"
        >
          Click here if not redirected automatically →
        </a>
      </div>
    </div>
  );
}
