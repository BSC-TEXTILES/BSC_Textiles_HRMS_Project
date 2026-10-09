'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getRoleHomePath, sanitizeCallbackUrl } from '@/lib/roles';

/**
 * Landing route: sends visitors to the login screen, or to the dashboard that
 * matches their role once a session exists.
 */
export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login');
    } else if (status === 'authenticated') {
      const target = sanitizeCallbackUrl(
        new URLSearchParams(window.location.search).get('callbackUrl'),
        getRoleHomePath(session?.user?.role)
      );
      router.replace(target);
    }
  }, [status, session?.user?.role, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f8f9ff]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-9 h-9 border-[3px] border-[#0058be] border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Redirecting to your workspace…
        </p>
      </div>
    </div>
  );
}
