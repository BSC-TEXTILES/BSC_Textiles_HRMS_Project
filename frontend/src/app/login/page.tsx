'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Loader2,
  ShieldCheck,
  Mail,
  Lock,
  CheckCircle2,
  Building2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { sanitizeCallbackUrl, getRoleHomePath } from '@/lib/roles';
import { safeJsonParse } from '@/lib/utils';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email or Employee Code is required')
    .refine(
      (value) => !value.includes('@') || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      'Please enter a valid email address'
    ),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

/** Seeded authorized roles for test validation */
const QUICK_TEST_ACCOUNTS = [
  {
    role: 'SUPER_ADMIN',
    email: 'admin@bsctextiles.com',
    label: 'Super Admin',
    desc: 'Executive Governance',
  },
  {
    role: 'HR_MANAGER',
    email: 'rbac.hr@bsctextiles.com',
    label: 'HR Manager',
    desc: 'Staff & Payroll',
  },
  {
    role: 'STAFF',
    email: 'rbac.employee@bsctextiles.com',
    label: 'Staff Member',
    desc: 'My Desk & Attendance',
  },
];

function LoginFormContent() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedAccountEmail, setSelectedAccountEmail] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<{ captchaId: string; svg: string } | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const [mfaChallenge, setMfaChallenge] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  // Safe same-origin redirect
  const callbackUrl = useMemo(
    () => sanitizeCallbackUrl(searchParams.get('callbackUrl'), getRoleHomePath(session?.user?.role)),
    [searchParams, session?.user?.role]
  );

  // The old build kept a bearer token in localStorage. Clearing it here means a
  // returning user cannot be mistaken for signed-in by any leftover code path.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('bsc_token');
    localStorage.removeItem('token');
    localStorage.removeItem('bsc_user');
    for (const name of ['token', 'bsc_token']) {
      document.cookie = `${name}=; path=/; max-age=0`;
    }
  }, []);

  // Auto-redirect only when NextAuth reports a live session and the backend
  // agrees (the cookie is what actually authorises requests).
  useEffect(() => {
    if (searchParams.get('callbackUrl')) return;
    if (status === 'authenticated' && session?.user) {
      window.location.href = getRoleHomePath(session.user.role);
    }
  }, [status, searchParams, session]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const apiBase = process.env.NEXT_PUBLIC_API_URL || '/api';

  /** Live countdown; the backend refuses attempts during the cooldown anyway. */
  useEffect(() => {
    if (lockSecondsLeft <= 0) return;
    const timer = setInterval(() => setLockSecondsLeft((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [lockSecondsLeft]);

  async function loadCaptcha() {
    try {
      const response = await fetch(`${apiBase}/session/captcha`, { credentials: 'include', cache: 'no-store' });
      const data = await response.json();
      if (data?.captchaId) {
        setCaptcha({ captchaId: data.captchaId, svg: data.svg });
        setCaptchaAnswer('');
      }
    } catch {
      /* the challenge is optional until the server asks for one */
    }
  }

  const finishSignIn = async (ticket: string, fallbackRole?: string) => {
    const result = await signIn('credentials', { ticket, redirect: false });
    if (result?.error) {
      const message =
        result.error === 'CredentialsSignin' ? 'Your session could not be established. Please try again.' : result.error;
      setErrorMessage(message);
      toast.error(message);
      return;
    }
    toast.success('Signed in successfully');
    window.location.href = sanitizeCallbackUrl(searchParams.get('callbackUrl'), getRoleHomePath(fallbackRole));
  };

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`${apiBase}/session/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          identifier: data.email.trim(),
          password: data.password,
          captchaId: captcha?.captchaId,
          captchaAnswer: captchaAnswer || undefined,
        }),
      });
      const payload = safeJsonParse<any>(await response.text(), {});

      if (response.status === 202 && payload?.challengeId) {
        setMfaChallenge(payload.challengeId);
        setErrorMessage(null);
        toast('Enter the code from your authenticator app.', { icon: '🔐' });
        return;
      }

      if (response.ok && payload?.ticket) {
        setLockSecondsLeft(0);
        setCaptcha(null);
        if (payload.mustChangePassword) {
          await finishSignIn(payload.ticket, payload.user?.role);
          window.location.href = '/change-password?forced=1';
          return;
        }
        await finishSignIn(payload.ticket, payload.user?.role);
        return;
      }

      // Every failure path refreshes the challenge: it is single-use, so a
      // retry without a fresh one would simply fail again.
      if (payload?.locked || response.status === 429) {
        setLockSecondsLeft(Number(payload?.retryAfterSeconds || 180));
        setErrorMessage(
          `Too many failed attempts. This sign-in is blocked for ${payload?.retryAfterSeconds || 180} seconds.`
        );
      } else {
        setErrorMessage(payload?.message || 'Invalid credentials. Check your login ID and password.');
      }

      if (payload?.captchaRequired) await loadCaptcha();
      else if (captcha) await loadCaptcha();
    } catch {
      const message = 'The authentication service is unreachable. Start the API on port 4000 and try again.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const submitMfa = async () => {
    if (!mfaChallenge || !mfaCode.trim()) return;
    setIsLoading(true);
    try {
      const response = await fetch(`${apiBase}/session/mfa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ challengeId: mfaChallenge, code: mfaCode.trim() }),
      });
      const payload = safeJsonParse<any>(await response.text(), {});
      if (response.ok && payload?.ticket) {
        setMfaChallenge(null);
        await finishSignIn(payload.ticket, payload.user?.role);
        return;
      }
      setErrorMessage(payload?.message || 'That code was not accepted.');
      if (payload?.error === 'Invalid credentials') setMfaChallenge(null);
    } catch {
      setErrorMessage('Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const applyAccount = (email: string) => {
    setSelectedAccountEmail(email);
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setValue('password', 'password123', { shouldValidate: true, shouldDirty: true });
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 sm:p-6 bg-[#F8F9FA] dark:bg-[#111317] text-[#18181B] dark:text-slate-100 transition-colors duration-200">
      {/* Top Header Utilities: Theme Toggle */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle size="md" />
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-[420px] my-auto">
        <div className="bg-white dark:bg-[#161920] rounded-xl border border-gray-200/90 dark:border-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 sm:p-8 transition-all">

          {/* Brand Header */}
          <div className="flex flex-col items-center text-center mb-1">
            <div className="w-16 h-16 rounded-xl bg-white dark:bg-slate-900 p-1.5 border border-gray-200 dark:border-slate-800 shadow-xs flex items-center justify-center overflow-hidden mb-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/bsc_logo.png"
                alt="BSC Textiles Since 1938"
                className="w-full h-full object-contain"
              />
            </div>

            <h1 className="text-xl font-bold tracking-tight text-[#18181B] dark:text-slate-100">
              BSC Textiles HRMS
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Since 1938 • Enterprise Workforce Portal
            </p>
          </div>

          {/* Error Banner Notification */}
          {errorMessage && (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50/90 dark:bg-red-950/40 dark:border-red-900/60 p-3 text-xs text-red-700 dark:text-red-300"
            >
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
              <span className="leading-snug font-medium">{errorMessage}</span>
            </div>
          )}

          {/* Form Fields */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-5 space-y-4">
            {/* Email / Employee Code Field */}
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-gray-700 dark:text-white mb-1.5">
                Employee Code or Email Address
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail className="w-4 h-4" aria-hidden="true" />
                </span>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder="e.g. admin@bsctextiles.com"
                  disabled={isLoading}
                  aria-invalid={errors.email ? 'true' : 'false'}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...register('email')}
                  className={`w-full h-10 rounded-lg border bg-white dark:bg-[#1A1D24] pl-9 pr-3 text-xs text-[#18181B] dark:text-white placeholder:text-slate-400 outline-none transition-all
                    disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400
                    focus:ring-2 focus:ring-[#0058be]/20 focus:border-[#0058be]
                    ${errors.email ? 'border-red-400 focus:border-red-500' : 'border-gray-300 dark:border-slate-700 hover:border-gray-400'}`}
                />
              </div>
              {errors.email && (
                <p id="email-error" role="alert" className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-semibold text-gray-700 dark:text-white">
                  Password
                </label>
                <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  Forgot it? Ask your Admin
                </span>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Lock className="w-4 h-4" aria-hidden="true" />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your security password"
                  disabled={isLoading}
                  aria-invalid={errors.password ? 'true' : 'false'}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                  className={`w-full h-10 rounded-lg border bg-white dark:bg-[#1A1D24] pl-9 pr-10 text-xs text-[#18181B] dark:text-white placeholder:text-slate-400 outline-none transition-all
                    disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400
                    focus:ring-2 focus:ring-[#0058be]/20 focus:border-[#0058be]
                    ${errors.password ? 'border-red-400 focus:border-red-500' : 'border-gray-300 dark:border-slate-700 hover:border-gray-400'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="mt-1 text-[11px] font-semibold text-red-600 dark:text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me Option */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-700 text-[#0058be] focus:ring-[#0058be]/20 cursor-pointer"
                />
                <span>Remember this terminal</span>
              </label>
              <span className="text-[11px] text-slate-400 font-medium">Secured Session</span>
            </div>

            {/* Cooldown countdown — attempts are refused until it reaches zero */}
            {lockSecondsLeft > 0 && (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50/90 dark:bg-amber-950/40 dark:border-amber-900/60 px-3 py-2.5"
              >
                <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                  Too many attempts. Try again in
                </span>
                <span className="tabular-nums text-sm font-bold text-amber-900 dark:text-amber-200">
                  {String(Math.floor(lockSecondsLeft / 60)).padStart(2, '0')}:
                  {String(lockSecondsLeft % 60).padStart(2, '0')}
                </span>
              </div>
            )}

            {/* CAPTCHA challenge, demanded after repeated failures */}
            {captcha && !mfaChallenge && (
              <div className="space-y-2 rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-gray-700 dark:text-slate-200">
                    Enter the characters shown
                  </span>
                  <button
                    type="button"
                    onClick={loadCaptcha}
                    className="text-[11px] font-medium text-[#0058be] dark:text-blue-400 hover:underline"
                  >
                    New challenge
                  </button>
                </div>
                <div
                  className="rounded-md border border-gray-200 dark:border-slate-700 overflow-hidden bg-white"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: captcha.svg }}
                />
                <input
                  value={captchaAnswer}
                  onChange={(event) => setCaptchaAnswer(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={6}
                  placeholder="Case-insensitive"
                  className="w-full h-9 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-[#1A1D24] px-3 text-xs uppercase tracking-[0.2em] outline-none focus:ring-2 focus:ring-[#0058be]/20 focus:border-[#0058be]"
                />
              </div>
            )}

            {/* Second factor */}
            {mfaChallenge && (
              <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/70 dark:bg-blue-950/30 dark:border-blue-900/60 p-3">
                <label htmlFor="mfa-code" className="block text-[11px] font-semibold text-blue-900 dark:text-blue-200">
                  Authenticator code or backup code
                </label>
                <div className="flex gap-2">
                  <input
                    id="mfa-code"
                    value={mfaCode}
                    onChange={(event) => setMfaCode(event.target.value)}
                    inputMode="text"
                    autoComplete="one-time-code"
                    placeholder="123456"
                    className="flex-1 h-9 rounded-lg border border-gray-300 dark:border-slate-700 bg-white dark:bg-[#1A1D24] px-3 text-xs tracking-[0.2em] outline-none focus:ring-2 focus:ring-[#0058be]/20"
                  />
                  <button
                    type="button"
                    onClick={submitMfa}
                    disabled={isLoading || !mfaCode.trim()}
                    className="h-9 px-3 rounded-lg bg-[#0058be] text-white text-xs font-semibold disabled:opacity-60"
                  >
                    Verify
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMfaChallenge(null);
                    setMfaCode('');
                  }}
                  className="text-[11px] font-medium text-slate-500 hover:underline"
                >
                  Cancel and sign in again
                </button>
              </div>
            )}

            {/* Primary Login Button */}
            <button
              type="submit"
              disabled={isLoading || lockSecondsLeft > 0 || Boolean(mfaChallenge)}
              className="w-full h-10 mt-2 rounded-lg bg-[#0058be] hover:bg-[#0047a0] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                  <span>Signing In...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5 text-white" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {/* Quick Test Accounts Bar */}
          <div className="mt-6 border-t border-gray-200/80 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-300 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-[#0058be] dark:text-blue-400" />
                <span>Test Role Credentials</span>
              </span>
              <span className="text-[10px] text-slate-400">1-click autofill</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {QUICK_TEST_ACCOUNTS.map((p) => {
                const isSelected = selectedAccountEmail === p.email;
                return (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => applyAccount(p.email)}
                    disabled={isLoading}
                    className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${isSelected
                      ? 'border-[#0058be] bg-[#0058be]/10 dark:bg-blue-950/60 ring-1 ring-[#0058be]'
                      : 'border-gray-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100/80 dark:hover:bg-slate-800'
                      }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-semibold text-[#18181B] dark:text-white truncate">{p.label}</span>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-[#0058be] dark:text-blue-400" />}
                    </div>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* System Integrity & Legal Footer */}
        <div className="mt-5 text-center space-y-2">
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-[#0058be] dark:text-blue-400" aria-hidden="true" />
            <span>Role-Based Access Control • Argon2id • HttpOnly Sessions</span>
          </div>
          <nav aria-label="Legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px]">
            <Link href="/privacy-policy" className="text-slate-500 hover:text-[#0058be] dark:text-slate-400 underline-offset-2 hover:underline">
              Privacy Policy
            </Link>
            <Link href="/terms-of-use" className="text-slate-500 hover:text-[#0058be] dark:text-slate-400 underline-offset-2 hover:underline">
              Terms of Use
            </Link>
            <Link href="/cookie-policy" className="text-slate-500 hover:text-[#0058be] dark:text-slate-400 underline-offset-2 hover:underline">
              Cookie Policy
            </Link>
            <Link href="/data-retention" className="text-slate-500 hover:text-[#0058be] dark:text-slate-400 underline-offset-2 hover:underline">
              Data Retention
            </Link>
          </nav>
          <p className="text-[10px] text-slate-400">
            © {new Date().getFullYear()} BSC Textiles Pvt. Ltd. • Karnataka Retail Network
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#F8F9FA] dark:bg-[#111317]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-[#0058be] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Loading BSC Textiles Workspace...
            </p>
          </div>
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
