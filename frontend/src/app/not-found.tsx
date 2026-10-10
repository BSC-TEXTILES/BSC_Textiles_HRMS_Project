import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F8F9FA] dark:bg-[#111317] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 bg-white dark:bg-[#161920] p-8 rounded-xl shadow-xs border border-slate-200 dark:border-[#272A30]">
        <div className="w-14 h-14 rounded-xl bg-[#722F37]/10 text-[#722F37] mx-auto flex items-center justify-center font-bold text-xl border border-[#722F37]/20">
          404
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-[#18181B] dark:text-white tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            The enterprise resource or terminal route you requested does not exist or has been relocated within the BSC Textiles HRMS network.
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-5 py-2.5 bg-[#722F37] hover:bg-[#5B232A] text-white rounded-lg text-xs font-bold transition-all shadow-xs"
          >
            Go to Executive Dashboard
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all"
          >
            Sign In
          </Link>
        </div>
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-mono">
          BSC Textiles Pvt Ltd &bull; Master Retail Operations Network
        </div>
      </div>
    </div>
  );
}
