'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Loader2, Building2, Sparkles, Shield, User, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'admin@bsctextiles.com',
      password: 'password123',
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const result = await signIn('credentials', {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (result?.error) {
        toast.error(result.error);
      } else {
        toast.success('Welcome back to BSC Textiles HRMS!');
        router.push('/dashboard');
        router.refresh();
      }
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const setPersona = (email: string) => {
    setValue('email', email);
    setValue('password', 'password123');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-primary-950 to-indigo-950 px-4 py-8 relative overflow-hidden">
      {/* Decorative background glow */}
      <div className="absolute w-96 h-96 bg-primary-500/10 rounded-full blur-3xl -top-20 -left-20 pointer-events-none" />
      <div className="absolute w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -bottom-20 -right-20 pointer-events-none" />

      <div className="w-full max-w-lg z-10">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-indigo-600 text-white shadow-xl shadow-primary-500/20 mb-3 border border-white/10">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">BSC Textiles HRMS</h1>
          <p className="text-primary-300 text-xs font-semibold uppercase tracking-widest mt-1">
            Weaving Dreams, Building Futures
          </p>
          <p className="text-gray-400 text-xs mt-0.5">BSC Textiles Pvt Ltd • Next-Generation Workforce System</p>
        </div>

        {/* Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-2xl p-6 sm:p-8 shadow-2xl border border-white/20">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-gray-700 mb-1">
                Corporate Email Address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                {...register('email')}
                className="w-full px-3.5 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                placeholder="name@bsctextiles.com"
                disabled={isLoading}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-gray-700 mb-1">
                Secure Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  {...register('password')}
                  className="w-full pl-3.5 pr-10 py-2.5 text-sm border border-gray-300 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none transition-all"
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-xl shadow-lg shadow-primary-600/30 transition-all text-sm flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Sign In to HRMS Workspace</span>
              )}
            </button>
          </form>

          {/* Quick-test Persona Pickers */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>1-Click Test Personas (Multi-Location & Role Scoping)</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-left">
              <button
                type="button"
                onClick={() => setPersona('admin@bsctextiles.com')}
                className="p-2 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-gray-200 rounded-lg text-xs transition-colors"
              >
                <div className="font-bold text-gray-900">Super Admin</div>
                <div className="text-[10px] text-gray-500">Global unrestricted</div>
              </button>

              <button
                type="button"
                onClick={() => setPersona('kavita.bhat@bsctextiles.com')}
                className="p-2 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-gray-200 rounded-lg text-xs transition-colors"
              >
                <div className="font-bold text-gray-900">Belagavi HR</div>
                <div className="text-[10px] text-gray-500">BEL Branch Only</div>
              </button>

              <button
                type="button"
                onClick={() => setPersona('vikram.singh@bsctextiles.com')}
                className="p-2 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-gray-200 rounded-lg text-xs transition-colors"
              >
                <div className="font-bold text-gray-900">Shivamogga HR</div>
                <div className="text-[10px] text-gray-500">SHI Branch Only</div>
              </button>

              <button
                type="button"
                onClick={() => setPersona('amit.patel@bsctextiles.com')}
                className="p-2 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-gray-200 rounded-lg text-xs transition-colors"
              >
                <div className="font-bold text-gray-900">Floor Manager</div>
                <div className="text-[10px] text-gray-500">Belagavi Floor 0</div>
              </button>

              <button
                type="button"
                onClick={() => setPersona('ramesh.gowda@bsctextiles.com')}
                className="p-2 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-gray-200 rounded-lg text-xs transition-colors"
              >
                <div className="font-bold text-gray-900">T-Shop Scanner</div>
                <div className="text-[10px] text-gray-500">QR Tea Scanner Role</div>
              </button>

              <button
                type="button"
                onClick={() => setPersona('rajesh.kumar@bsctextiles.com')}
                className="p-2 bg-gray-50 hover:bg-primary-50 hover:border-primary-200 border border-gray-200 rounded-lg text-xs transition-colors"
              >
                <div className="font-bold text-gray-900">Sales Employee</div>
                <div className="text-[10px] text-gray-500">My Desk Self-Service</div>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}