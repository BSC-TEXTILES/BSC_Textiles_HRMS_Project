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
  UserRound, 
  ShieldCheck, 
  Mail, 
  Lock, 
  Sparkles,
  CheckCircle2
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Logo } from '@/components/ui/Logo';
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

/** Seeded demo test personas for 1-click authentication verification */
const DEMO_PERSONAS = [
  {
    role: 'ADMIN',
    email: 'admin@bsctextiles.com',
    label: 'Super Admin',
    desc: 'Executive & Governance',
    badge: 'Executive',
    badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  {
    role: 'HR',
    email: 'vikram.singh@bsctextiles.com',
    label: 'HR Manager',
    desc: 'Payroll & Rosters',
    badge: 'Operations',
    badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  {
    role: 'EMPLOYEE',
    email: 'rajesh.kumar@bsctextiles.com',
    label: 'Staff Member',
    desc: 'My Desk & Payslips',
    badge: 'Self-Service',
    badgeColor: 'bg-[#eff4ff] text-[#0058be] border-[#dce9ff]',
  },
];

function LoginFormContent() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedPersonaEmail, setSelectedPersonaEmail] = useState<string | null>(null);

  // Safe same-origin redirect
  const callbackUrl = useMemo(
    () => sanitizeCallbackUrl(searchParams.get('callbackUrl'), getRoleHomePath(session?.user?.role)),
    [searchParams, session?.user?.role]
  );

  // Auto-redirect if session already active
  useEffect(() => {
    if (status === 'authenticated') {
      window.location.href = sanitizeCallbackUrl(
        searchParams.get('callbackUrl'),
        getRoleHomePath(session?.user?.role)
      );
    }
  }, [status, searchParams, session?.user?.role]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, touchedFields },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onTouched',
  });

  const emailValue = watch('email');

  // Detect current active persona
  const activePersonaObj = DEMO_PERSONAS.find((p) => p.email.toLowerCase() === emailValue?.trim().toLowerCase());

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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

      // 1. Direct backend pre-flight login to prime local storage & cookies
      try {
        const directRes = await fetch(`${apiUrl}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: data.email, password: data.password }),
        });
        const directData = await directRes.json().catch(() => null);
        if (directRes.ok && directData?.token) {
          localStorage.setItem('bsc_token', directData.token);
          localStorage.setItem('token', directData.token);
          if (directData.user) {
            localStorage.setItem('bsc_user', JSON.stringify(directData.user));
          }
          document.cookie = `token=${encodeURIComponent(directData.token)}; path=/; max-age=604800; SameSite=Lax`;
          document.cookie = `bsc_token=${encodeURIComponent(directData.token)}; path=/; max-age=604800; SameSite=Lax`;
        }
      } catch (e) {
        console.warn('[Login] Direct token sync notice:', e);
      }

      // 2. NextAuth credentials sign-in for RBAC session cookies
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

      // 3. Success → sync fresh session and redirect based on role
      toast.success('Welcome to BSC Textiles HRMS!');
      let landing = callbackUrl;
      try {
        const freshSession = await getSession();
        if (freshSession?.token) {
          localStorage.setItem('bsc_token', freshSession.token);
          localStorage.setItem('token', freshSession.token);
          if (freshSession.user) {
            localStorage.setItem('bsc_user', JSON.stringify(freshSession.user));
          }
        }
        landing = sanitizeCallbackUrl(
          searchParams.get('callbackUrl'),
          getRoleHomePath(freshSession?.user?.role)
        );
      } catch {
        // Best effort fallback
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

  const applyPersona = (email: string) => {
    setSelectedPersonaEmail(email);
    setValue('email', email, { shouldValidate: true, shouldDirty: true });
    setValue('password', 'password123', { shouldValidate: true, shouldDirty: true });
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-[#f4f7fb] text-[#0b1c30] relative overflow-hidden">
      {/* Subtle modern ambient background decorations */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(0,88,190,0.12),rgba(255,255,255,0))]" 
      />
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -top-40 -left-40 w-96 h-96 rounded-full bg-blue-400/10 blur-[100px]" 
      />
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-indigo-400/10 blur-[100px]" 
      />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-[430px] my-auto">
        {/* ================================================================= */}
        {/* PROFILE CARD CONTAINER                                            */}
        {/* ================================================================= */}
        <div className="bg-white/95 backdrop-blur-xl rounded-[28px] border border-slate-200/90 shadow-[0_20px_50px_-15px_rgba(11,28,48,0.12),0_4px_16px_rgba(0,0,0,0.03)] px-6 py-8 sm:px-8 sm:py-9 transition-all">
          
          {/* Top Company Brand Header */}
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center gap-2.5">
              <Logo variant="icon" size="md" />
              <div className="flex flex-col text-left">
                <span className="text-[17px] font-black tracking-tight text-[#0b1c30] leading-none">
                  BSC Textiles
                </span>
                <span className="text-[10px] uppercase font-bold tracking-widest text-[#0058be] mt-0.5">
                  HRMS Enterprise
                </span>
              </div>
            </div>
          </div>

          {/* Profile Card Silhouette Avatar */}
          <div className="mt-6 flex flex-col items-center">
            <div className="relative">
              <div className="w-[76px] h-[76px] rounded-full bg-gradient-to-tr from-[#0058be] via-[#1d63d8] to-[#3b82f6] text-white flex items-center justify-center shadow-[0_12px_24px_-6px_rgba(0,88,190,0.4)] ring-4 ring-blue-50/80">
                <UserRound className="w-9 h-9 text-white/95" strokeWidth={1.75} aria-hidden="true" />
              </div>
              <span
                className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-emerald-500 border-[3px] border-white flex items-center justify-center shadow-xs"
                title="Portal Online & Ready"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              </span>
            </div>

            {/* Profile Welcome Information */}
            <div className="mt-3.5 text-center">
              <h1 className="text-xl font-bold tracking-tight text-[#0b1c30]">
                {activePersonaObj ? activePersonaObj.label : 'Welcome Back'}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500">
                {activePersonaObj 
                  ? activePersonaObj.desc 
                  : 'Please sign in to your workforce account'}
              </p>

              {/* Dynamic Persona Status Pill */}
              {activePersonaObj && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all animate-in fade-in zoom-in-95">
                  <span className={`w-1.5 h-1.5 rounded-full ${activePersonaObj.role === 'ADMIN' ? 'bg-amber-500' : activePersonaObj.role === 'HR' ? 'bg-emerald-500' : 'bg-[#0058be]'}`} />
                  <span className="uppercase tracking-wider">{activePersonaObj.badge} Mode</span>
                </div>
              )}
            </div>
          </div>

          {/* Error Banner Notification (Reserved height to prevent layout shifts) */}
          <div className="mt-3 min-h-[2.5rem]" aria-live="polite">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50/90 px-3.5 py-2.5 text-xs text-red-700 animate-[slideUp_0.2s_ease-out]"
              >
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" aria-hidden="true" />
                <span className="leading-snug font-medium">{errorMessage}</span>
              </div>
            )}
          </div>

          {/* Form Fields */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="mt-1 space-y-4">
            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-xs font-bold text-slate-700 mb-1.5">
                Email Address or Employee Code
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
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
                  className={`w-full h-11 rounded-xl border bg-slate-50/50 pl-10 pr-3.5 text-xs font-medium text-[#0b1c30] placeholder:text-slate-400 outline-none transition-all
                    disabled:bg-slate-100 disabled:text-slate-400
                    focus:bg-white focus:ring-4 focus:ring-[#0058be]/10
                    ${errors.email ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : 'border-slate-200/90 hover:border-slate-300 focus:border-[#0058be]'}`}
                />
              </div>
              {errors.email && (
                <p id="email-error" role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-xs font-bold text-slate-700">
                  Security Password
                </label>
                <button
                  type="button"
                  onClick={() => toast('Please contact HR/IT Administrator to initiate password reset.', { icon: '🔐' })}
                  className="text-[11px] font-semibold text-[#0058be] hover:underline focus:outline-none"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
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
                  className={`w-full h-11 rounded-xl border bg-slate-50/50 pl-10 pr-11 text-xs font-medium text-[#0b1c30] placeholder:text-slate-400 outline-none transition-all
                    disabled:bg-slate-100 disabled:text-slate-400
                    focus:bg-white focus:ring-4 focus:ring-[#0058be]/10
                    ${errors.password ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : 'border-slate-200/90 hover:border-slate-300 focus:border-[#0058be]'}`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  disabled={isLoading}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 focus:outline-none"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember Me Option */}
            <div className="flex items-center justify-between pt-0.5">
              <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  defaultChecked
                  className="w-4 h-4 rounded border-slate-300 text-[#0058be] focus:ring-[#0058be]/20 cursor-pointer"
                />
                <span>Remember this terminal</span>
              </label>
              <span className="text-[10px] text-slate-400">12h secure session</span>
            </div>

            {/* Primary Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-xl bg-[#0058be] hover:bg-[#0049a3] text-white text-xs font-bold shadow-[0_10px_20px_-8px_rgba(0,88,190,0.6)] flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" aria-hidden="true" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Sign In to Workspace</span>
                  <ArrowRight className="w-4 h-4 text-white" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          {/* Quick Demo Personas (1-click fill) */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-[#0058be]" />
                <span>Quick Role Access</span>
              </span>
              <span className="text-[10px] text-slate-400">1-click test</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {DEMO_PERSONAS.map((p) => {
                const isSelected = selectedPersonaEmail === p.email;
                return (
                  <button
                    key={p.email}
                    type="button"
                    onClick={() => applyPersona(p.email)}
                    disabled={isLoading}
                    className={`p-2 rounded-xl border text-left flex flex-col justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'border-[#0058be] bg-[#eff4ff] ring-2 ring-[#0058be]/20 shadow-xs'
                        : 'border-slate-200 bg-slate-50/70 hover:bg-slate-100/70 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] font-bold text-[#0b1c30] truncate">{p.label}</span>
                      {isSelected && <CheckCircle2 className="w-3 h-3 text-[#0058be]" />}
                    </div>
                    <span className="text-[9px] text-slate-500 font-medium truncate mt-0.5">{p.badge}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Security & System Integrity Footer */}
        <div className="mt-5 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-medium text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
            <span>Role-Based Access Control • TLS 1.3 Encrypted</span>
          </div>
          <p className="text-[10px] text-slate-400">
            © {new Date().getFullYear()} BSC Textiles Pvt Ltd • Karnataka Retail Network
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
        <div className="min-h-screen flex items-center justify-center bg-[#f4f7fb]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-[#0058be] border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
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
