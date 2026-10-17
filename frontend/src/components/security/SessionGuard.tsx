'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { signOut } from 'next-auth/react';
import { Clock, LogOut, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';

/**
 * The public candidate form (/apply) is anonymous: pinging the session
 * endpoint there would answer 401 and the API interceptor would bounce the
 * candidate to /login. The guard simply stays dormant on that route.
 */
function onPublicCandidateForm(): boolean {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/apply');
}

interface SessionStatus {
  authenticated: boolean;
  idleTimeoutSeconds: number;
  absoluteTimeoutSeconds: number;
  warningSeconds: number;
  idleExpiresAt: string | null;
  expiresAt: string | null;
  mustChangePassword?: boolean;
}

/**
 * Idle and absolute session enforcement in the browser.
 *
 * The server is authoritative — a request after the deadline is refused
 * whatever this component thinks — but a user should be told their session is
 * ending instead of losing unsaved work mid-form. The modal appears
 * SESSION_WARNING_SECONDS before the idle deadline and offers "Stay signed in",
 * which extends the idle window only; the absolute deadline is never moved.
 */
export function SessionGuard() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [warning, setWarning] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastPing = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get('/session/status', { timeout: 8000 });
      setStatus(data);
    } catch {
      /* a 401 here is handled by the api interceptor */
    }
  }, []);

  useEffect(() => {
    if (onPublicCandidateForm()) return;
    refresh();
  }, [refresh]);

  // Recompute the remaining idle time once a second from the server's own
  // deadline, so a suspended laptop or a clock skew cannot extend a session.
  useEffect(() => {
    if (!status?.idleExpiresAt) return;
    const timer = setInterval(() => {
      const remaining = Math.round((new Date(status.idleExpiresAt!).getTime() - Date.now()) / 1000);
      setSecondsLeft(remaining);
      if (remaining <= (status.warningSeconds || 60)) setWarning(true);
      if (remaining <= 0) {
        setWarning(false);
        signOut({ callbackUrl: '/login?reason=expired' });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // Any real interaction re-checks the server, so a session extended in another
  // tab is reflected here without waiting for the next poll.
  useEffect(() => {
    const onActivity = () => {
      const now = Date.now();
      if (now - lastPing.current < 20_000) return;
      lastPing.current = now;
      refresh();
    };
    window.addEventListener('focus', onActivity);
    window.addEventListener('visibilitychange', onActivity);
    return () => {
      window.removeEventListener('focus', onActivity);
      window.removeEventListener('visibilitychange', onActivity);
    };
  }, [refresh]);

  const staySignedIn = async () => {
    setBusy(true);
    try {
      const { data } = await api.post('/session/extend', {});
      setWarning(false);
      setStatus((current) =>
        current ? { ...current, idleExpiresAt: data.idleExpiresAt ?? current.idleExpiresAt, expiresAt: data.expiresAt ?? current.expiresAt } : current
      );
    } catch {
      signOut({ callbackUrl: '/login?reason=expired' });
    } finally {
      setBusy(false);
    }
  };

  if (!warning) return null;

  const minutes = Math.max(0, Math.floor((secondsLeft ?? 0) / 60));
  const seconds = Math.max(0, (secondsLeft ?? 0) % 60);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-warning-title"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <h2 id="session-warning-title" className="text-base font-semibold text-gray-900 dark:text-slate-100">
              Your session is about to end
            </h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
              For your security you are signed out after {Math.round((status?.idleTimeoutSeconds || 900) / 60)} minutes
              of inactivity, and no later than{' '}
              {Math.round((status?.absoluteTimeoutSeconds || 28800) / 3600)} hours after signing in.
            </p>
            <p className="mt-3 text-2xl font-semibold tabular-nums text-gray-900 dark:text-slate-100">
              {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign out now
          </button>
          <button
            type="button"
            onClick={staySignedIn}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-[#1346a1] px-4 py-2 text-sm font-medium text-white hover:bg-[#0e3882] disabled:opacity-60"
          >
            <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            {busy ? 'Extending…' : 'Stay signed in'}
          </button>
        </div>
      </div>
    </div>
  );
}
