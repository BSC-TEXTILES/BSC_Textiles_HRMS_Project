'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, useSession, getSession } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  Eye, 
  EyeOff, 
  Shield, 
  Building2, 
  Sparkles, 
  MapPin, 
  CheckCircle2, 
  Lock, 
  ArrowRight,
  Store,
  Clock,
  Award,
  Users,
  Fingerprint
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { cn } from '@/lib/utils';

const loginSchema = z.object({
  email: z.string().min(1, 'Email or username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

const PERSONAS = [
  { 
    email: 'admin@bsctextiles.com', 
    label: 'Super Admin', 
    roleTag: 'ALL HUBS',
    description: 'Executive & Global unrestricted access',
    icon: Shield,
    accent: 'from-amber-500/20 to-amber-600/10 border-amber-500/40 text-amber-300 hover:border-amber-400',
    iconColor: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  { 
    email: 'kavita.bhat@bsctextiles.com', 
    label: 'Belagavi HR', 
    roleTag: 'BELAGAVI',
    description: 'BEL Flagship workforce & payroll',
    icon: Building2,
    accent: 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/40 text-emerald-300 hover:border-emerald-400',
    iconColor: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  { 
    email: 'amit.patel@bsctextiles.com', 
    label: 'Floor Manager', 
    roleTag: 'FLOOR 0',
    description: 'Shift rosters & floor discipline',
    icon: MapPin,
    accent: 'from-blue-500/20 to-blue-600/10 border-blue-500/40 text-blue-300 hover:border-blue-400',
    iconColor: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  },
  { 
    email: 'ramesh.gowda@bsctextiles.com', 
    label: 'T-Shop Scanner', 
    roleTag: 'REFRESHMENT',
    description: 'QR tea & break audit console',
    icon: Sparkles,
    accent: 'from-purple-500/20 to-purple-600/10 border-purple-500/40 text-purple-300 hover:border-purple-400',
    iconColor: 'text-purple-400',
    badge: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  },
  { 
    email: 'rajesh.kumar@bsctextiles.com', 
    label: 'Sales Employee', 
    roleTag: 'MY DESK',
    description: 'Self-service dossier & payslips',
    icon: CheckCircle2,
    accent: 'from-cyan-500/20 to-cyan-600/10 border-cyan-500/40 text-cyan-300 hover:border-cyan-400',
    iconColor: 'text-cyan-400',
    badge: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
  { 
    email: 'vikram.singh@bsctextiles.com', 
    label: 'Shivamogga HR', 
    roleTag: 'SHIVAMOGGA',
    description: 'SHI Hub regional administration',
    icon: Building2,
    accent: 'from-rose-500/20 to-rose-600/10 border-rose-500/40 text-rose-300 hover:border-rose-400',
    iconColor: 'text-rose-400',
    badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  },
];

const STORE_HUBS = [
  { name: 'Belagavi Flagship', code: 'BEL-01', status: 'Optimal', count: '4 Terminals' },
  { name: 'Davanagere Weaving Showroom', code: 'DAV-02', status: 'Optimal', count: '2 Terminals' },
  { name: 'Shivamogga Retail Apex', code: 'SHI-03', status: 'Optimal', count: '2 Terminals' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';
  const { data: session, status } = useSession();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activePersonaEmail, setActivePersonaEmail] = useState<string | null>(null);

  // Auto-redirect if already authenticated
  useEffect(() => {
    if (status === 'authenticated') {
      window.location.href = callbackUrl;
    }
  }, [status, callbackUrl]);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrorMessage(null);
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

      // 1. Direct login to acquire guaranteed fresh JWT token immediately
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
        console.warn('[Login] Direct token pre-fetch warning:', e);
      }

      // 2. NextAuth session synchronization
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        const errorMsg = result.error;
        setErrorMessage(errorMsg);
        toast.error(errorMsg);
        setIsLoading(false);
        return;
      }

      if (result?.ok) {
        toast.success('Welcome back to BSC Textiles HRMS!');
        
        try {
          const freshSession = await getSession();
          if (freshSession?.token) {
            localStorage.setItem('bsc_token', freshSession.token);
            localStorage.setItem('token', freshSession.token);
            if (freshSession.user) {
              localStorage.setItem('bsc_user', JSON.stringify(freshSession.user));
            }
          }
        } catch {
          // ignore session fetch error, proceed to navigate
        }

        // Full page redirect ensures complete session and cookie sync
        window.location.href = callbackUrl;
        return;
      }
    } catch (error) {
      const message = 'An error occurred during authentication. Please try again.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const setPersona = (email: string) => {
    setActivePersonaEmail(email);
    setValue('email', email, { shouldValidate: true });
    setValue('password', 'password123', { shouldValidate: true });
    setErrorMessage(null);
  };

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-10 overflow-x-hidden">
      {/* Background Layer with Ultra-HD Luxury Atelier Image */}
      <div 
        className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-transform duration-1000 scale-105"
        style={{
          backgroundImage: "url('/images/textile_luxury_bg.jpg')",
        }}
      >
        {/* Layered Rich Gradient Overlays for High Legibility & Cinematic Atmosphere */}
        <div className="absolute inset-0 bg-gradient-to-tr from-slate-950 via-slate-950/85 to-[#0b1c30]/80" />
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-slate-950/50 to-slate-950/90" />
        
        {/* Subtle Gold / Indigo Ambient Glows */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-amber-500/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-indigo-500/15 rounded-full blur-[120px] pointer-events-none" />
      </div>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-7xl mx-auto">
        
        {/* Top Floating Header Banner */}
        <header className="mb-4 lg:mb-6 flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-slate-900/60 backdrop-blur-md border border-white/15 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 via-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-500/20 flex-shrink-0">
              <span className="font-extrabold text-slate-950 text-base tracking-tighter">BSC</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-base tracking-tight">BSC Textiles Pvt Ltd</span>
                <span className="text-[10px] uppercase font-extrabold tracking-wider px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Est. 1938
                </span>
              </div>
              <p className="text-xs text-slate-300">Master Retail Workforce & Enterprise HRMS Platform</p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {/* Prominent BSC HRMS v2.4 Release Badge */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-r from-amber-500/25 to-amber-600/15 border border-amber-400/50 text-amber-300 text-xs font-black shadow-lg shadow-amber-500/15 tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>BSC HRMS v2.4</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>Biometric Cloud: Live 99.8%</span>
            </div>
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-slate-200 text-xs font-medium">
              <Shield className="w-3.5 h-3.5 text-amber-400" />
              <span>Karnataka Regional Network</span>
            </div>
          </div>
        </header>

        {/* Two-Column Grid: Heritage Brand Story + Glass Login Card */}
        <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          
          {/* LEFT COLUMN: BRAND STORY & ENTERPRISE TELEMETRY (7 Cols) */}
          <div className="lg:col-span-7 flex flex-col space-y-4 text-white">
            
            {/* Main Headline Cluster */}
            <div className="space-y-2.5">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-gradient-to-r from-amber-500/15 via-indigo-500/15 to-transparent border border-amber-500/30 text-amber-300 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Weaving Dreams, Building Futures</span>
              </div>
              
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-[1.15]">
                Intelligent Retail Workforce & Biometric Operations
              </h1>
              
              <p className="text-slate-300 text-xs sm:text-sm leading-relaxed max-w-2xl font-light">
                Seamlessly orchestrating Karnataka retail store operations across 3 flagship hubs, 350+ artisans, IoT face verification, and instant ₹1/sec early login incentive calculation.
              </p>
            </div>

            {/* 3 Flagship Hubs Matrix */}
            <div className="p-4 rounded-2xl bg-slate-900/70 backdrop-blur-xl border border-white/15 shadow-2xl space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-300">
                <span className="flex items-center gap-1.5 text-amber-300">
                  <Store className="w-4 h-4 text-amber-400" />
                  Karnataka Enterprise Hub Network
                </span>
                <span className="text-emerald-400 font-extrabold">3 Active Outlets</span>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                {STORE_HUBS.map((hub) => (
                  <div 
                    key={hub.code}
                    className="p-2.5 rounded-xl bg-white/[0.05] border border-white/10 hover:border-amber-500/40 transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[11px] font-bold text-amber-400">{hub.code}</span>
                        <span className="text-xs font-semibold text-slate-100">{hub.name}</span>
                      </div>
                      <span className="text-[10px] text-slate-300">{hub.count}</span>
                    </div>
                    <span className="w-2 h-2 rounded-full bg-emerald-400" title={hub.status} />
                  </div>
                ))}
              </div>
            </div>

            {/* Feature Metric Strip */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-900/60 backdrop-blur-md border border-white/15 text-center">
                <Fingerprint className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <div className="text-lg font-extrabold text-white">96.4%</div>
                <div className="text-[10px] text-slate-300 font-medium">Face Match Rate</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 backdrop-blur-md border border-white/15 text-center">
                <Clock className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
                <div className="text-lg font-extrabold text-white">3 Shifts</div>
                <div className="text-[10px] text-slate-300 font-medium">Automated Rosters</div>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/60 backdrop-blur-md border border-white/15 text-center">
                <Award className="w-5 h-5 text-cyan-400 mx-auto mb-1" />
                <div className="text-lg font-extrabold text-white">₹1 / sec</div>
                <div className="text-[10px] text-slate-300 font-medium">Early Login Bonus</div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: FROSTED GLASS LOGIN CARD (5 Cols) */}
          <div className="lg:col-span-5 w-full">
            <div className="relative rounded-3xl bg-slate-900/90 backdrop-blur-2xl border border-white/20 p-5 sm:p-7 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)]">
              
              {/* Card Header with Visible BSC HRMS v2.4 Badge */}
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                      <Lock className="w-4 h-4 text-amber-400" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">Sign In</h2>
                  </div>
                  <p className="text-xs text-slate-300">
                    Authenticate to your BSC Textiles workspace
                  </p>
                </div>
                
                {/* Prominently visible v2.4 card badge */}
                <div className="flex flex-col items-end flex-shrink-0">
                  <span className="px-2.5 py-1 rounded-lg bg-amber-400/20 border border-amber-400/50 text-amber-300 font-black text-xs shadow-sm tracking-wide">
                    BSC HRMS v2.4
                  </span>
                  <span className="text-[10px] text-emerald-400 font-bold mt-0.5 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Enterprise Portal
                  </span>
                </div>
              </div>

              {/* Error Alert Banner */}
              {errorMessage && (
                <div 
                  className="mb-4 p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl flex items-start gap-3 animate-slide-down text-rose-200 text-xs" 
                  role="alert"
                >
                  <div className="w-4 h-4 rounded-full bg-rose-500/30 flex items-center justify-center flex-shrink-0 mt-0.5 text-rose-400 font-bold">
                    !
                  </div>
                  <div>
                    <p className="font-bold text-rose-300">Authentication Failed</p>
                    <p className="mt-0.5 text-rose-200/90">{errorMessage}</p>
                  </div>
                </div>
              )}

              {/* Form Element */}
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
                <div>
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-200 mb-1 block">
                    Enterprise Email or Username
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@bsctextiles.com"
                    {...register('email')}
                    disabled={isLoading}
                    className="w-full bg-slate-950/70 border-slate-700/80 text-white placeholder:text-slate-400 rounded-xl focus:border-amber-400 focus:ring-amber-400/20 text-xs h-10"
                  />
                  {errors.email && (
                    <p className="mt-1 text-[11px] text-rose-400 font-medium">
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label htmlFor="password" className="text-xs font-semibold text-slate-200 block">
                      Security Password
                    </Label>
                    <span className="text-[10px] text-amber-300 font-mono font-semibold bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                      Default: password123
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••••••"
                      {...register('password')}
                      disabled={isLoading}
                      className="w-full bg-slate-950/70 border-slate-700/80 text-white placeholder:text-slate-400 rounded-xl focus:border-amber-400 focus:ring-amber-400/20 text-xs h-10 pr-11 font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-slate-300" /> : <Eye className="w-4 h-4 text-slate-300" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1 text-[11px] text-rose-400 font-medium">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                {/* Primary CTA Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full h-10 mt-1 rounded-xl font-extrabold text-xs uppercase tracking-wider flex items-center justify-center gap-2 text-slate-950 bg-gradient-to-r from-amber-400 via-amber-300 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/25 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                      <span>Authenticating Session...</span>
                    </>
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* QUICK TEST PERSONAS SECTION - HIGH VISIBILITY */}
              <div className="mt-5 pt-4 border-t border-white/15">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-amber-300">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Quick-Select Test Personas</span>
                  </div>
                  <span className="text-[10px] text-slate-200 font-bold bg-white/10 px-2 py-0.5 rounded-full border border-white/15">
                    Click to auto-fill
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2" role="list" aria-label="Quick test personas">
                  {PERSONAS.map((persona) => {
                    const isSelected = activePersonaEmail === persona.email;
                    return (
                      <button
                        key={persona.email}
                        type="button"
                        onClick={() => setPersona(persona.email)}
                        disabled={isLoading}
                        className={cn(
                          'p-2 rounded-xl border text-left transition-all duration-200 relative group cursor-pointer',
                          'bg-gradient-to-br backdrop-blur-sm shadow-sm',
                          isSelected 
                            ? 'ring-2 ring-amber-400 border-amber-400 bg-amber-500/25 shadow-amber-500/20 shadow-md' 
                            : cn(persona.accent, 'bg-slate-950/60 hover:bg-slate-950/90')
                        )}
                        role="listitem"
                      >
                        <div className="flex items-start gap-2">
                          <div className={cn('p-1 rounded-lg bg-black/40 flex-shrink-0 mt-0.5', persona.iconColor)}>
                            <persona.icon className="w-3.5 h-3.5" aria-hidden="true" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-extrabold text-white text-xs truncate">
                                {persona.label}
                              </span>
                              {isSelected && (
                                <CheckCircle2 className="w-3 h-3 text-amber-400 flex-shrink-0" />
                              )}
                            </div>
                            <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.2 rounded border inline-block mt-0.5', persona.badge)}>
                              {persona.roleTag}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Security Footnote with High-Contrast BSC HRMS v2.4 Badge */}
              <div className="mt-4 pt-3.5 border-t border-white/15 flex items-center justify-between text-xs font-medium">
                <span className="flex items-center gap-1.5 text-slate-300 text-[11px]">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  AES-256 Encrypted Session
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-950/80 border border-amber-400/40 text-amber-300 font-extrabold text-[11px] tracking-wide shadow-sm flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  BSC HRMS v2.4
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Global Footer */}
        <footer className="mt-6 text-center text-xs text-slate-300 font-normal">
          © 2026 BSC Textiles Pvt Ltd • Karnataka Retail Operations Network • Version 2.4 Active
        </footer>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-amber-200 text-xs font-semibold uppercase tracking-wider">Loading BSC Textiles HRMS...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}