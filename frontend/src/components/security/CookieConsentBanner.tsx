'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/api';

interface ConsentState {
  necessary: boolean;
  analytics: boolean;
  preferences: boolean;
  version: string;
  recorded: boolean;
}

/**
 * Cookie consent.
 *
 * Only the strictly-necessary category is on by default, and the choice is
 * written to the server (`cookie_consent`) rather than only to localStorage, so
 * there is a record a subject-access request can point at. The banner is keyed
 * to a policy version: publishing a new version re-prompts everyone.
 */
export function CookieConsentBanner() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [analytics, setAnalytics] = useState(false);
  const [preferences, setPreferences] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/session/consent', { timeout: 8000 })
      .then((response) => {
        if (cancelled) return;
        setState(response.data);
        setAnalytics(Boolean(response.data?.analytics));
        setPreferences(Boolean(response.data?.preferences));
      })
      .catch(() => {
        /* a failed lookup simply means the banner stays hidden */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || state.recorded) return null;

  const persist = async (next: { analytics: boolean; preferences: boolean }) => {
    setSaving(true);
    try {
      const { data } = await api.post('/session/consent', next);
      setState(data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-gray-200 bg-white/95 p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:p-5"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-gray-900 dark:text-slate-100">We use cookies</p>
          <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-slate-300">
            Necessary cookies keep you signed in and protect the session from cross-site request forgery — the system
            cannot work without them. Analytics and preference cookies are optional and are only set if you allow them.
            Read the{' '}
            <Link href="/cookie-policy" className="font-medium text-[#1346a1] underline dark:text-blue-300">
              Cookie Policy
            </Link>
            ,{' '}
            <Link href="/privacy-policy" className="font-medium text-[#1346a1] underline dark:text-blue-300">
              Privacy Policy
            </Link>{' '}
            and{' '}
            <Link href="/data-retention" className="font-medium text-[#1346a1] underline dark:text-blue-300">
              Data Retention Policy
            </Link>
            .
          </p>

          {showDetails && (
            <div className="mt-3 space-y-2">
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-slate-200">
                <input type="checkbox" checked disabled className="mt-0.5 h-4 w-4 rounded border-gray-300" />
                <span>
                  <span className="font-medium">Necessary</span> — session cookie, CSRF token, theme. Always on.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(event) => setAnalytics(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#1346a1]"
                />
                <span>
                  <span className="font-medium">Analytics</span> — aggregate page usage. Off by default.
                </span>
              </label>
              <label className="flex items-start gap-2 text-xs text-gray-700 dark:text-slate-200">
                <input
                  type="checkbox"
                  checked={preferences}
                  onChange={(event) => setPreferences(event.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#1346a1]"
                />
                <span>
                  <span className="font-medium">Preferences</span> — remembers your sidebar and hub selection.
                </span>
              </label>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowDetails((open) => !open)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            {showDetails ? 'Hide choices' : 'Choose cookies'}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => persist({ analytics: false, preferences: false })}
            className="rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Reject optional
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => persist(showDetails ? { analytics, preferences } : { analytics: true, preferences: true })}
            className="rounded-lg bg-[#1346a1] px-4 py-2 text-xs font-medium text-white hover:bg-[#0e3882] disabled:opacity-60"
          >
            {saving ? 'Saving…' : showDetails ? 'Save choices' : 'Accept all'}
          </button>
        </div>
      </div>
    </div>
  );
}
