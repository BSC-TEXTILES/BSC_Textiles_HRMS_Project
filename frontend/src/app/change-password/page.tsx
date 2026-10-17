'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, signOut } from 'next-auth/react';
import { Check, Eye, EyeOff, KeyRound, ShieldAlert, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';

interface Rule {
  id: string;
  label: string;
  ok: boolean;
}

interface Policy {
  minLength: number;
  historyCount: number;
  expiryDays: number;
  valid: boolean;
  score: number;
  label: string;
  errors: string[];
}

const LABELS = ['very weak', 'weak', 'fair', 'strong', 'excellent'];

function ChangePasswordContent() {
  const searchParams = useSearchParams();
  const forced = searchParams.get('forced') === '1';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!next) {
      setPolicy(null);
      return;
    }
    const timer = setTimeout(() => {
      // The server is the only authority on policy; the meter mirrors it
      // exactly instead of a second client-side implementation that could drift.
      api
        .post('/session/password/evaluate', { password: next })
        .then((response) => setPolicy(response.data))
        .catch(() => setPolicy(null));
    }, 250);
    return () => clearTimeout(timer);
  }, [next]);

  const rules: Rule[] = [
    { id: 'length', label: `At least ${policy?.minLength ?? 12} characters`, ok: next.length >= (policy?.minLength ?? 12) },
    { id: 'upper', label: 'One uppercase letter', ok: /[A-Z]/.test(next) },
    { id: 'lower', label: 'One lowercase letter', ok: /[a-z]/.test(next) },
    { id: 'number', label: 'One number', ok: /[0-9]/.test(next) },
    { id: 'special', label: 'One special character', ok: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?~`]/.test(next) },
    { id: 'identity', label: 'Not based on your login ID or name', ok: policy ? !policy.errors.some((e) => /login ID/i.test(e)) : false },
    { id: 'breach', label: 'Not a known or previously used password', ok: policy ? policy.valid : false },
  ];

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      // The cookie-based session endpoint, not the legacy /auth/change-password:
      // the password gate refuses every route for an account that has not
      // changed its issued password yet, and the legacy path was not on the
      // exempt list — so a forced change posted to a route that always answered
      // 403, and nobody holding a temporary password could ever sign in.
      await api.post('/session/password/change', { currentPassword: current, newPassword: next });
      toast.success('Password updated. Sign in again with your new password.');
      await signOut({ redirect: false });
      window.location.href = '/login';
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.response?.data?.error || 'Could not change your password.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const score = policy?.score ?? 0;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-xl space-y-4">
        {forced && (
          <Card>
            <CardContent className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-medium text-gray-900 dark:text-slate-100">A temporary password is still in use</p>
                <p className="mt-1 text-gray-600 dark:text-slate-300">
                  An administrator issued this account&apos;s password. The rest of the system stays locked until you
                  replace it with one only you know.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-slate-100">Change password</h1>
            <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
              You must confirm your current password. Every device is signed out afterwards, and the change is recorded
              in the audit trail and emailed to you and your administrators.
            </p>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <Input
                label="Current password"
                type={show ? 'text' : 'password'}
                value={current}
                onChange={(event) => setCurrent(event.target.value)}
                autoComplete="current-password"
                required
              />
              <div>
                <Input
                  label="New password"
                  type={show ? 'text' : 'password'}
                  value={next}
                  onChange={(event) => setNext(event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShow((visible) => !visible)}
                  className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 hover:text-gray-800 dark:text-slate-400"
                >
                  {show ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                  {show ? 'Hide passwords' : 'Show passwords'}
                </button>
              </div>

              {next.length > 0 && (
                <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-slate-700">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-gray-700 dark:text-slate-200">Strength</span>
                    <span
                      className={
                        score >= 3 ? 'font-semibold text-emerald-600' : score === 2 ? 'font-semibold text-amber-600' : 'font-semibold text-red-600'
                      }
                    >
                      {LABELS[score] || 'very weak'}
                    </span>
                  </div>
                  <div className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((index) => (
                      <span
                        key={index}
                        className={
                          index < score
                            ? 'h-1.5 flex-1 rounded-full bg-emerald-500'
                            : 'h-1.5 flex-1 rounded-full bg-gray-200 dark:bg-slate-700'
                        }
                      />
                    ))}
                  </div>
                  <ul className="space-y-1">
                    {rules.map((rule) => (
                      <li key={rule.id} className="flex items-center gap-1.5 text-[11px]">
                        {rule.ok ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                        )}
                        <span className={rule.ok ? 'text-gray-700 dark:text-slate-300' : 'text-gray-500 dark:text-slate-400'}>
                          {rule.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400">
                    The last {policy?.historyCount ?? 5} passwords cannot be reused
                    {policy?.expiryDays ? `, and this one expires after ${policy.expiryDays} days.` : '.'}
                  </p>
                </div>
              )}

              <Input
                label="Confirm new password"
                type={show ? 'text' : 'password'}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                autoComplete="new-password"
                error={error ?? undefined}
                required
              />

              <div className="flex flex-wrap items-center justify-between gap-2">
                {forced ? (
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/login' })}
                    className="text-xs font-medium text-gray-500 hover:underline dark:text-slate-400"
                  >
                    Cancel and sign out
                  </button>
                ) : (
                  <Link href="/my-desk" className="text-xs font-medium text-gray-500 hover:underline dark:text-slate-400">
                    Back to my desk
                  </Link>
                )}
                <Button type="submit" size="sm" loading={saving} disabled={!policy?.valid || confirm.length === 0}>
                  {!saving && <KeyRound className="h-4 w-4" aria-hidden="true" />}
                  Update password
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordContent />
    </Suspense>
  );
}
