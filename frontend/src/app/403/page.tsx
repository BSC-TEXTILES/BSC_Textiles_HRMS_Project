'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/Logo';
import { ShieldAlert, LayoutDashboard, User, LogOut } from 'lucide-react';

function ForbiddenContent() {
  const searchParams = useSearchParams();
  const attemptedPath = searchParams.get('from') || '';
  const { data: session } = useSession();

  const userRole = session?.user?.role?.replace(/_/g, ' ') || 'Authenticated User';
  const userName = session?.user?.name || 'Workspace User';

  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#111317] flex flex-col justify-between p-6">
      {/* Top Navbar Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size="sm" />
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-[#18181B] dark:text-white">BSC Textiles Pvt Ltd</span>
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">Enterprise Access Control</span>
          </div>
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-700 border border-red-200 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-600" />
          Access Restricted
        </div>
      </header>

      {/* Main 403 Card */}
      <main className="max-w-xl w-full mx-auto my-auto bg-white dark:bg-[#161920] rounded-xl border border-slate-200 dark:border-[#272A30] shadow-xs p-8 sm:p-10 text-center relative overflow-hidden">
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-[#722F37]" />

        {/* Shield / Lock Icon */}
        <div className="w-16 h-16 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 flex items-center justify-center mx-auto mb-6 text-red-600 shadow-xs">
          <ShieldAlert className="w-8 h-8" />
        </div>

        <span className="inline-block px-3 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200 mb-3">
          HTTP 403 • Access Restricted
        </span>

        <h1 className="text-2xl font-bold text-[#18181B] dark:text-white tracking-tight mb-2">
          Insufficient Role Permissions
        </h1>

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
          Your current account role does not have authorization to view or manipulate resources at this endpoint.
          BSC Textiles enforces enterprise <strong className="text-slate-700 dark:text-slate-300">Role-Based Access Control (RBAC)</strong>.
        </p>

        {/* User Identity Context Card */}
        <div className="bg-slate-50 dark:bg-slate-900/40 rounded-lg p-4 text-left border border-slate-200 dark:border-slate-800 mb-6 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Active Account:</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">{userName}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Assigned Role:</span>
            <span className="font-bold text-[#722F37] uppercase px-2 py-0.5 rounded bg-[#722F37]/10 border border-[#722F37]/20">
              {userRole}
            </span>
          </div>
          {attemptedPath && (
            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200 dark:border-slate-800">
              <span className="text-slate-500 font-medium">Target Path:</span>
              <code className="text-red-700 bg-red-50 px-1.5 py-0.5 rounded font-mono text-[11px] truncate max-w-[240px]">
                {attemptedPath}
              </code>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#722F37] text-white text-xs font-semibold hover:bg-[#5B232A] transition-all shadow-xs"
          >
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </Link>

          <Link
            href="/my-desk"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-all"
          >
            <User className="w-4 h-4" />
            My Desk
          </Link>

          <button
            onClick={() => {
              if (typeof window !== 'undefined') {
                localStorage.removeItem('bsc_token');
                localStorage.removeItem('token');
                localStorage.removeItem('bsc_user');
                document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
                document.cookie = 'bsc_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
              }
              signOut({ callbackUrl: '/login' });
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-6xl w-full mx-auto text-center py-4 text-xs text-slate-400">
        BSC Textiles Pvt Ltd • Est. 1938 • Enterprise Retail Workforce Operating System • Security Protocol v2.4
      </footer>
    </div>
  );
}

export default function ForbiddenPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#111317] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#722F37] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ForbiddenContent />
    </Suspense>
  );
}
