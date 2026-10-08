'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Shield, Building2, Sparkles, MapPin, CheckCircle2 } from 'lucide-react';
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
    description: 'Global unrestricted access',
    icon: Shield,
    color: 'bg-primary-100 text-primary-700 border-primary-200',
    iconColor: 'text-primary-600',
  },
  { 
    email: 'kavita.bhat@bsctextiles.com', 
    label: 'Belagavi HR', 
    description: 'BEL Branch only',
    icon: Building2,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    iconColor: 'text-emerald-600',
  },
  { 
    email: 'vikram.singh@bsctextiles.com', 
    label: 'Shivamogga HR', 
    description: 'SHI Branch only',
    icon: Building2,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    iconColor: 'text-amber-600',
  },
  { 
    email: 'amit.patel@bsctextiles.com', 
    label: 'Floor Manager', 
    description: 'Belagavi Floor 0',
    icon: MapPin,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    iconColor: 'text-blue-600',
  },
  { 
    email: 'ramesh.gowda@bsctextiles.com', 
    label: 'T-Shop Scanner', 
    description: 'QR Tea Scanner Role',
    icon: Sparkles,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
    iconColor: 'text-purple-600',
  },
  { 
    email: 'rajesh.kumar@bsctextiles.com', 
    label: 'Sales Employee', 
    description: 'My Desk Self-Service',
    icon: CheckCircle2,
    color: 'bg-gray-100 text-gray-700 border-gray-200',
    iconColor: 'text-gray-600',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { register, handleSubmit, setValue, formState: { errors }, watch } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const emailValue = watch('email');

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    setErrorMessage(null);
    
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        setErrorMessage(result.error);
        toast.error(result.error);
      } else {
        toast.success('Welcome back to BSC Textiles HRMS!');
        router.push('/dashboard');
        router.refresh();
      }
    } catch (error) {
      const message = 'An error occurred. Please try again.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const setPersona = (email: string) => {
    setValue('email', email);
    setValue('password', 'password123');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-950 via-primary-900 to-indigo-950 px-4 py-12 relative overflow-hidden">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-3xl -top-40 -left-40 animate-pulse-slow" />
        <div className="absolute w-[500px] h-[500px] bg-burgundy-500/10 rounded-full blur-3xl -bottom-40 -right-40 animate-pulse-slow" style={{ animationDelay: '1s' }} />
        <div className="absolute w-[400px] h-[400px] bg-primary-400/5 rounded-full blur-3xl top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
        
        {/* Subtle fabric texture overlay */}
        <div 
          className="absolute inset-0 opacity-[0.02] h-full w-full"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 36v-4H0v4H0v2h4v4h2v-4h4v-2H6zM6 4a4 4 0 00-4 4v2h4V4H6zm64 4a4 4 0 014-4h2v4h-4V4h-4zM4 30h4v4H4v-4zm2 26h4v4H6v-4zm38 4h4v4h-4v-4z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
            backgroundRepeat: 'repeat',
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-5xl">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-16 items-center">
          
          {/* Brand Visual Area */}
          <div className="hidden lg:block relative">
            <div className="relative h-[520px] rounded-3xl overflow-hidden bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 border border-primary-700/50 shadow-2xl">
              {/* Fabric texture background */}
              <div 
                className="absolute inset-0 opacity-10"
                style={{
                  backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'100\' height=\'100\' viewBox=\'0 0 100 100\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23ffffff\' fill-opacity=\'0.05\'%3E%3Cpath d=\'M50 50m-50 0a50 50 0 1 1 100 0a50 50 0 1 1 -100 0\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
                  backgroundRepeat: 'repeat',
                }}
              />
              
              {/* Decorative elements */}
              <div className="absolute inset-0 flex items-center justify-center p-12">
                <div className="relative z-10 text-center">
                  <Logo variant="full" size="xl" className="mx-auto mb-8" />
                  
                  <div className="space-y-6 max-w-md mx-auto">
                    <div className="inline-flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center">
                        <Building2 className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-semibold text-sm">4 Locations</p>
                        <p className="text-primary-200 text-xs">Belagavi • Davanagere • Shivamogga • Hubballi</p>
                      </div>
                    </div>
                    
                    <div className="inline-flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center">
                        <Shield className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-semibold text-sm">35+ Employees</p>
                        <p className="text-primary-200 text-xs">Active workforce across all stores</p>
                      </div>
                    </div>
                    
                    <div className="inline-flex items-center gap-3 px-5 py-3 bg-white/10 backdrop-blur-sm rounded-full border border-white/20">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-burgundy-500 to-burgundy-600 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-white font-semibold text-sm">8 Roles</p>
                        <p className="text-primary-200 text-xs">Granular permission-based access control</p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Heritage badge */}
                  <div className="mt-10 inline-flex items-center gap-2 px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
                    <span className="text-white/70 text-xs font-medium uppercase tracking-wider">Est.</span>
                    <span className="text-white font-bold text-lg">1938</span>
                    <span className="text-white/70 text-xs font-medium uppercase tracking-wider">Heritage</span>
                  </div>
                </div>
              </div>
              
              {/* Bottom accent */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-primary-950 to-transparent" />
            </div>
          </div>

          {/* Login Form Area */}
          <div className="relative z-10 w-full max-w-md mx-auto lg:mx-0">
            <div className="text-center lg:text-left mb-10">
              <Logo variant="full" size="lg" className="mx-auto lg:mx-0 mb-4" />
              <p className="text-primary-200 text-sm font-medium uppercase tracking-widest">Next Generation Workforce Management System</p>
            </div>

            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-6 sm:p-8">
              <div className="text-center lg:text-left mb-8">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight">Welcome Back</h1>
                <p className="text-gray-500 mt-2 text-sm">Sign in to access your BSC Textiles workspace</p>
              </div>

              {errorMessage && (
                <div className="mb-6 p-4 bg-burgundy-50 border border-burgundy-200 rounded-lg flex items-start gap-3 animate-slide-down" role="alert">
                  <div className="w-5 h-5 flex-shrink-0 mt-0.5 text-burgundy-600">
                    <svg fill="currentColor" viewBox="0 0 20 20" className="w-5 h-5"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-burgundy-800 text-sm font-medium">Authentication Failed</p>
                    <p className="text-burgundy-700 text-sm mt-0.5">{errorMessage}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <Label htmlFor="email">Email or Username</Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@bsctextiles.com"
                    {...register('email')}
                    disabled={isLoading}
                    error={errors.email?.message}
                    className="input"
                  />
                  {errors.email && (
                    <p className="mt-1.5 text-xs text-burgundy-600 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                      {errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="••••••••"
                      {...register('password')}
                      disabled={isLoading}
                      error={errors.password?.message}
                      className="input pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 rounded transition-colors"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="mt-1.5 text-xs text-burgundy-600 flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/></svg>
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  loading={isLoading}
                  className="w-full mt-2"
                >
                  {isLoading ? 'Signing in...' : 'Sign In to Workspace'}
                </Button>
              </form>

              {/* Quick-test Persona Pickers */}
              <div className="mt-8 pt-6 border-t border-gray-100">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-500 mb-4">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Quick Test Personas</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2" role="list" aria-label="Test personas">
                  {PERSONAS.map((persona, index) => (
                    <button
                      key={persona.email}
                      type="button"
                      onClick={() => setPersona(persona.email)}
                      disabled={isLoading}
                      className={cn(
                        'p-3 rounded-xl border transition-all duration-200 text-left',
                        'hover:bg-gray-50 hover:border-primary-200',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500',
                        'disabled:opacity-50 disabled:cursor-not-allowed',
                        persona.color
                      )}
                      role="listitem"
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', persona.iconColor)}>
                          <persona.icon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold text-gray-900 text-xs truncate">{persona.label}</div>
                          <div className="text-[10px] text-gray-500 truncate">{persona.description}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
                
                <p className="mt-4 text-center text-xs text-gray-400">
                  All test accounts use password: {' '}
                  <span className="font-mono text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">password123</span>
                </p>
              </div>

              {/* Security notice */}
              <div className="mt-6 p-4 bg-primary-50 border border-primary-100 rounded-lg">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 flex-shrink-0 mt-0.5 text-primary-600">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div className="text-xs text-primary-800">
                    <p className="font-semibold mb-1">Secure Authentication</p>
                    <p>Your credentials are encrypted and validated against BSC Textiles enterprise directory. Session tokens are HTTP-only cookies with 7-day expiry.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 text-center lg:text-left text-xs text-gray-400">
              <p>BSC Textiles HRMS v2.0</p>
              <p className="mt-1">© 2024 BSC Textiles Pvt Ltd. All rights reserved.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}