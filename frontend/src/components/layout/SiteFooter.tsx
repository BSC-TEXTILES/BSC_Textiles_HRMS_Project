'use client';

import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

/**
 * Enterprise Footer.
 * Sleek, unobtrusive system status and legal navigation mounted at the bottom of the viewport shell.
 */
export function SiteFooter() {
  return (
    <footer className="mt-8 border-t border-slate-200/70 bg-white/70 backdrop-blur-xs px-4 sm:px-6 py-2.5 text-[11px] text-slate-500 dark:border-slate-800/70 dark:bg-[#090e17]/70 dark:text-slate-400">
      <div className="mx-auto flex max-w-[1600px] flex-col sm:flex-row items-center justify-between gap-y-2 gap-x-4">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            BSC Textiles HRMS
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span className="text-slate-400 dark:text-slate-500">Enterprise Edition v2.4</span>
          <span className="hidden md:inline text-slate-300 dark:text-slate-700">•</span>
          <span className="hidden md:inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
            <ShieldCheck className="w-3 h-3" /> Encrypted &amp; Role-Scoped
          </span>
        </div>

        <nav aria-label="Legal & Policies" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-400 dark:text-slate-500">
          <Link href="/privacy-policy" className="hover:text-[#1346a1] dark:hover:text-blue-400 transition-colors">
            Privacy Policy
          </Link>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <Link href="/terms-of-use" className="hover:text-[#1346a1] dark:hover:text-blue-400 transition-colors">
            Terms of Use
          </Link>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <Link href="/cookie-policy" className="hover:text-[#1346a1] dark:hover:text-blue-400 transition-colors">
            Cookie Policy
          </Link>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <Link href="/data-retention" className="hover:text-[#1346a1] dark:hover:text-blue-400 transition-colors">
            Data Retention
          </Link>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span className="text-slate-400 dark:text-slate-500">© {new Date().getFullYear()} BSC Textiles</span>
        </nav>
      </div>
    </footer>
  );
}
