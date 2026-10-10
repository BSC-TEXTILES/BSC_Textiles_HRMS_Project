'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { signIn, useSession, getSession } from 'next-auth/react';
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
    email: 'vikram.singh@bsctextiles.com',
    label: 'HR Manager',
    desc: 'Staff & Payroll',
  },
  {
    role: 'STAFF',
    email: 'rajesh.kumar@bsctextiles.com',
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

  // Safe same-origin redirect
  const callbackUrl = useMemo(
    () => sanitizeCallbackUrl(searchParams.get('callbackUrl'), getRoleHomePath(session?.user?.role)),
    [searchParams, session?.user?.role]
  );

  // Auto-redirect ONLY if visiting /login directly with an active, valid token (no callback redirect in progress)
  useEffect(() => {
    const hasCallback = searchParams.get('callbackUrl');
    if (hasCallback) return;

    if (status === 'authenticated' && session?.user) {
      const localToken = typeof window !== 'undefined' ? (localStorage.getItem('bsc_token') || localStorage.getItem('token')) : null;
      if (localToken) {
        window.location.href = getRoleHomePath(session.user.role);
      }
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

  const clearStoredCredentials = () => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('bsc_token');
    localStorage.removeItem('token');
    localStorage.removeItem('bsc_user');
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'bsc_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
  };

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // Direct authenticate with backend to ensure the token is immediately cached
      let directToken: string | null = null;
      let directUser: any = null;
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
        const loginRes = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.email, password: data.password }),
        });
        const loginData = await loginRes.json().catch(() => ({}));
        if (loginRes.ok && loginData?.token) {
          directToken = loginData.token;
          directUser = loginData.user;
          localStorage.setItem('bsc_token', loginData.token);
          localStorage.setItem('token', loginData.token);
          if (loginData.user) {
            localStorage.setItem('bsc_user', JSON.stringify(loginData.user));
          }
          document.cookie = `token=${encodeURIComponent(loginData.token)}; path=/; max-age=604800; SameSite=Lax`;
          document.cookie = `bsc_token=${encodeURIComponent(loginData.token)}; path=/; max-age=604800; SameSite=Lax`;
        }
      } catch (directErr) {
        // Non-fatal, NextAuth will perform primary verification
      }

      // 1. NextAuth credentials sign-in for RBAC session cookies
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        const errorMsg =
          result.error === 'CredentialsSignin' || result.error.includes('Credentials')
            ? 'Invalid email or password. Please verify your credentials and try again.'
            : result.error;
        clearStoredCredentials();
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        return;
      }

      // 2. Success → sync fresh session tokens and cookies
      toast.success('Signed in successfully');
      let landing = '/dashboard';
      try {
        const freshSession = await getSession();
        const effectiveToken = freshSession?.token || directToken;
        if (effectiveToken) {
          localStorage.setItem('bsc_token', effectiveToken);
          localStorage.setItem('token', effectiveToken);
          const effectiveUser = freshSession?.user || directUser;
          if (effectiveUser) {
            localStorage.setItem('bsc_user', JSON.stringify(effectiveUser));
          }
          document.cookie = `token=${encodeURIComponent(effectiveToken)}; path=/; max-age=604800; SameSite=Lax`;
          document.cookie = `bsc_token=${encodeURIComponent(effectiveToken)}; path=/; max-age=604800; SameSite=Lax`;
        }
        landing = sanitizeCallbackUrl(
          searchParams.get('callbackUrl'),
          getRoleHomePath(freshSession?.user?.role || directUser?.role)
        );
      } catch {
        landing = '/dashboard';
      }

      window.location.href = landing;
    } catch {
      const message = 'Authentication service encountered an issue. Please try again.';
      setErrorMessage(message);
      toast.error(message);
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
      {/* Top Header Utilities */}
      <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-20">
        <ThemeToggle size="md" />
      </div>

      {/* Main Login Card */}
      <div className="w-full max-w-[420px] my-auto">
        <div className="bg-white dark:bg-[#161920] rounded-xl border border-gray-200/90 dark:border-slate-800 shadow-[0_2px_12px_rgba(0,0,0,0.04)] p-6 sm:p-8 transition-all">
          
          {/* Brand Header */}
          <div className="flex flex-col items-center text-center">
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
              <label htmlFor="email" className="block text-xs font-semibold text-gray-700 dark:text-slate-300 mb-1.5">
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
                  className={`w-full h-10 rounded-lg border bg-white dark:bg-[#1A1D24] pl-9 pr-3 text-xs text-[#18181B] dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all
                    disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400
                    focus:ring-2 focus:ring-[#722F37]/20 focus:border-[#722F37]
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
                <label htmlFor="password" className="block text-xs font-semibold text-gray-700 dark:text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => toast('Please contact HR / IT Administrator to reset your password.', { icon: '🔐' })}
                  className="text-[11px] font-medium text-[#722F37] dark:text-[#E8DCC6] hover:underline focus:outline-none"
                >
                  Forgot password?
                </button>
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
                  className={`w-full h-10 rounded-lg border bg-white dark:bg-[#1A1D24] pl-9 pr-10 text-xs text-[#18181B] dark:text-slate-100 placeholder:text-slate-400 outline-none transition-all
                    disabled:bg-slate-50 dark:disabled:bg-slate-800 disabled:text-slate-400
                    focus:ring-2 focus:ring-[#722F37]/20 focus:border-[#722F37]
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
              <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-3.5 h-3.5 rounded border-gray-300 dark:border-slate-700 text-[#722F37] focus:ring-[#722F37]/20 cursor-pointer"
                />
                <span>Remember this terminal</span>
              </label>
              <span className="text-[11px] text-slate-400 font-medium">Secured Session</span>
            </div>

            {/* Primary Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 mt-2 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white text-xs font-semibold shadow-xs flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
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
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Building2 className="w-3 h-3 text-[#722F37] dark:text-[#E8DCC6]" />
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
                    className={`p-2 rounded-lg border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#722F37] bg-[#722F37]/5 dark:bg-[#722F37]/20 ring-1 ring-[#722F37]'
                        : 'border-gray-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-100/80 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-semibold text-[#18181B] dark:text-slate-100 truncate">{p.label}</span>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-[#722F37] dark:text-[#E8DCC6]" />}
                    </div>
                    <span className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* System Integrity & Legal Footer */}
        <div className="mt-5 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Role-Based Access Control • TLS 1.3 Encryption</span>
          </div>
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
            <div className="w-8 h-8 border-3 border-[#722F37] border-t-transparent rounded-full animate-spin" />
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
