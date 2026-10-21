'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  ShieldCheck,
  FileText,
  Cookie,
  Database,
  ArrowLeft,
  Printer,
  ExternalLink,
} from 'lucide-react';

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

const POLICY_NAV = [
  { title: 'Privacy Policy', href: '/privacy-policy', icon: ShieldCheck },
  { title: 'Terms of Use', href: '/terms-of-use', icon: FileText },
  { title: 'Cookie Policy', href: '/cookie-policy', icon: Cookie },
  { title: 'Data Retention', href: '/data-retention', icon: Database },
];

/**
 * Enterprise Legal, Privacy & Compliance Page Shell.
 * Provides unified navigation across all four mandatory policies,
 * supports authenticated dashboard return and unauthenticated login return,
 * and includes dark mode and print support.
 */
export function LegalPage({
  title,
  summary,
  updated,
  sections,
}: {
  title: string;
  summary: string;
  updated: string;
  sections: LegalSection[];
}) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isLoggedIn = Boolean(session?.user);

  return (
    <main className="min-h-screen bg-[#F8F9FA] py-8 sm:py-12 dark:bg-[#0b101b] transition-colors">
      <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
        {/* Navigation & Header Strip */}
        <div className="flex items-center justify-between pb-4">
          <Link
            href={isLoggedIn ? '/dashboard' : '/login'}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1346a1] hover:text-[#0e3882] dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{isLoggedIn ? 'Back to Dashboard' : 'Back to sign in'}</span>
          </Link>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            title="Print policy"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print Document</span>
          </button>
        </div>

        {/* 4-Policy Tab Navigation */}
        <nav
          aria-label="Compliance Documents Navigation"
          className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6"
        >
          {POLICY_NAV.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#1346a1] text-white border-[#1346a1] shadow-md shadow-[#1346a1]/20'
                    : 'bg-white dark:bg-[#121929] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-[#1346a1] dark:text-blue-400'}`} />
                <span className="truncate">{item.title}</span>
              </Link>
            );
          })}
        </nav>

        {/* Main Document Card */}
        <div className="bg-white dark:bg-[#121929] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-6 sm:p-10">
          <header className="border-b border-slate-200/80 dark:border-slate-800 pb-6">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              <ShieldCheck className="h-4 w-4 text-[#1346a1] dark:text-blue-400" aria-hidden="true" />
              <span>BSC Textiles HRMS • Enterprise Compliance &amp; Policy</span>
            </div>
            <h1 className="mt-2.5 text-2xl sm:text-3xl font-extrabold text-[#0b1c30] dark:text-white tracking-tight">
              {title}
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              {summary}
            </p>
            <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-slate-500">
              <span>Last updated: {updated}</span>
              <span>•</span>
              <span className="text-emerald-600 dark:text-emerald-400">Legally Binding Policy</span>
            </div>
          </header>

          <div className="mt-8 space-y-8">
            {sections.map((section, idx) => (
              <section key={section.heading} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-[#1346a1]/10 text-[#1346a1] dark:text-blue-400 text-[11px] font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <h2 className="text-base font-bold text-[#0b1c30] dark:text-white">
                    {section.heading}
                  </h2>
                </div>
                <div className="pl-7 text-sm leading-relaxed text-slate-700 dark:text-slate-300 space-y-3">
                  {section.body}
                </div>
              </section>
            ))}
          </div>

          <footer className="mt-12 pt-6 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <div>
              Data controller &amp; compliance enquiries:{' '}
              <a
                href="mailto:security@bsctextiles.com"
                className="font-bold text-[#1346a1] dark:text-blue-400 hover:underline inline-flex items-center gap-1"
              >
                <span>security@bsctextiles.com</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="text-[11px] text-slate-400">
              © {new Date().getFullYear()} BSC Textiles Pvt. Ltd.
            </div>
          </footer>
        </div>
      </div>
    </main>
  );
}
