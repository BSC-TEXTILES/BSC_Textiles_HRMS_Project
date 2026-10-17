'use client';

import Link from 'next/link';

/**
 * Legal footer. Mounted once, inside the app shell, so the policy links appear
 * on every authenticated screen and not only on the sign-in page.
 */
export function SiteFooter() {
  return (
    <footer className="border-t border-gray-200/80 bg-white/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <nav aria-label="Legal" className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Link href="/privacy-policy" className="hover:text-[#1346a1] hover:underline dark:hover:text-blue-300">
            Privacy Policy
          </Link>
          <Link href="/terms-of-use" className="hover:text-[#1346a1] hover:underline dark:hover:text-blue-300">
            Terms of Use
          </Link>
          <Link href="/cookie-policy" className="hover:text-[#1346a1] hover:underline dark:hover:text-blue-300">
            Cookie Policy
          </Link>
          <Link href="/data-retention" className="hover:text-[#1346a1] hover:underline dark:hover:text-blue-300">
            Data Retention
          </Link>
          <Link href="/privacy" className="font-medium hover:underline">
            My privacy
          </Link>
        </nav>
        <span>© {new Date().getFullYear()} BSC Textiles Pvt. Ltd.</span>
      </div>
    </footer>
  );
}
