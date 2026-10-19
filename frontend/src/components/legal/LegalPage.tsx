'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';

export interface LegalSection {
  heading: string;
  body: ReactNode;
}

/**
 * Shared shell for the four policy documents, so they read as one set and the
 * "last updated" line cannot disagree between them.
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
  return (
    <main className="min-h-screen bg-[#F8F9FA] py-10 dark:bg-[#111317]">
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <Link href="/login" className="text-xs font-medium text-[#1346a1] hover:underline dark:text-blue-300">
          ← Back to sign in
        </Link>

        <header className="mt-4 border-b border-gray-200 pb-5 dark:border-slate-800">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            BSC Textiles HRMS · Policy
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900 dark:text-slate-100">{title}</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">{summary}</p>
          <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">Last updated: {updated}</p>
        </header>

        <div className="mt-6 space-y-7">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">{section.heading}</h2>
              <div className="mt-2 space-y-2 text-sm leading-relaxed text-gray-700 dark:text-slate-300">{section.body}</div>
            </section>
          ))}
        </div>

        <footer className="mt-10 border-t border-gray-200 pt-5 text-xs text-gray-500 dark:border-slate-800 dark:text-slate-400">
          Questions or a request about your data: write to{' '}
          <a href="mailto:security@bsctextiles.com" className="font-medium text-[#1346a1] underline dark:text-blue-300">
            security@bsctextiles.com
          </a>
          . Requests about your data can be raised by email once your identity is
            verified by HR.
        </footer>
      </div>
    </main>
  );
}
