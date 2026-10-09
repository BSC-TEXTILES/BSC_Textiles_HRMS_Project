'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { Logo } from '@/components/ui/Logo';

function ForbiddenContent() {
  const searchParams = useSearchParams();
  const attemptedPath = searchParams.get('from') || '';
  const { data: session } = useSession();

  const userRole = session?.user?.role?.replace(/_/g, ' ') || 'Authenticated User';
  const userName = session?.user?.name || 'Workspace User';

  return (
    <div className="min-h-screen bg-[#f8f9ff] flex flex-col justify-between p-6">
      {/* Top Navbar Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between py-4">
        <div className="flex items-center gap-3">
          <Logo variant="icon" size="sm" />
          <div className="flex flex-col">
            <span className="text-base font-bold tracking-tight text-[#0b1c30]">BSC Textiles Pvt Ltd</span>
            <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">Enterprise HRMS & Security</span>
          </div>
        </div>
        <div className="text-xs font-semibold px-3 py-1.5 rounded-full bg-red-50 text-red-600 border border-red-200 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Security Boundary Enforced
        </div>
      </header>

      {/* Main 403 Card */}
      <main className="max-w-xl w-full mx-auto my-auto bg-white rounded-2xl border border-slate-200/80 shadow-[0_20px_50px_rgba(11,28,48,0.06)] p-8 sm:p-10 text-center relative overflow-hidden">
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-500 via-amber-500 to-[#0058be]" />

        {/* Shield / Lock Icon */}
        <div className="w-20 h-20 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-6 text-red-600 shadow-sm">
          <span className="material-symbols-outlined text-[42px]">gpp_maybe</span>
        </div>

        <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-red-100 text-red-700 mb-3">
          HTTP 403 • Access Forbidden
        </span>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] tracking-tight mb-3">
          Role Privileges Insufficient
        </h1>

        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          Your current account role does not have authorization to view or manipulate resources at this endpoint.
          BSC Textiles enforces strict server-side and client-side <strong className="text-slate-800">Role-Based Access Control (RBAC)</strong>.
        </p>

        {/* User Identity Context Card */}
        <div className="bg-slate-50 rounded-xl p-4 text-left border border-slate-200/60 mb-6 space-y-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Active Account:</span>
            <span className="font-semibold text-slate-800">{userName}</span>
          </div>
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-500 font-medium">Assigned Role:</span>
            <span className="font-bold text-[#0058be] uppercase px-2 py-0.5 rounded bg-blue-50 border border-blue-100">
              {userRole}
            </span>
          </div>
          {attemptedPath && (
            <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/60">
              <span className="text-slate-500 font-medium">Target Path:</span>
              <code className="text-red-600 bg-red-50 px-1.5 py-0.5 rounded font-mono text-[11px] truncate max-w-[240px]">
                {attemptedPath}
              </code>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#0058be] text-white text-xs font-semibold hover:bg-[#00489c] transition-all shadow-md shadow-blue-500/20 active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">dashboard</span>
            Return to Dashboard
          </Link>

          <Link
            href="/my-desk"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold hover:bg-slate-200 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">person</span>
            My Desk Self-Service
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
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all active:scale-95"
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            Switch Account
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
      <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-[#0058be] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ForbiddenContent />
    </Suspense>
  );
}
