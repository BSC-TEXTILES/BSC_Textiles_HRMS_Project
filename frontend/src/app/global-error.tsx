'use client';

/**
 * Global error boundary for the App Router.
 *
 * Next.js requires this file so that unrecoverable root-layout errors and the
 * /500 fallback do NOT fall back to the Pages Router's built-in `_error` page,
 * which imports `<Html>` from `next/document` and crashes in the App Router.
 *
 * Because `global-error` replaces the *entire* `<html>` shell, it must render
 * its own `<html>` and `<body>` tags.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
          <div className="w-14 h-14 rounded-xl bg-red-50 text-red-600 mx-auto flex items-center justify-center font-bold text-xl border border-red-200">
            500
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-[#18181B] tracking-tight">
              Something Went Wrong
            </h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              An unexpected error occurred within the BSC Textiles HRMS system.
              Please try again or contact the system administrator.
            </p>
          </div>
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={reset}
              className="w-full sm:w-auto px-5 py-2.5 bg-[#1346a1] hover:bg-[#0e3882] text-white rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              Try Again
            </button>
            <a
              href="/dashboard"
              className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-all"
            >
              Go to Dashboard
            </a>
          </div>
          <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
            BSC Textiles Pvt Ltd &bull; Master Retail Operations Network
          </div>
        </div>
      </body>
    </html>
  );
}
