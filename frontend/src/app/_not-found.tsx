import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#f8f9ff] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 bg-white p-8 rounded-2xl shadow-xl border border-slate-200">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 text-[#0058be] mx-auto flex items-center justify-center font-black text-2xl border border-blue-100 shadow-sm">
          404
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Page Not Found
          </h1>
          <p className="text-xs text-slate-500 leading-relaxed">
            The enterprise resource or terminal route you requested does not exist or has been relocated within the BSC Textiles HRMS network.
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-5 py-2.5 bg-[#0058be] hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            Go to Executive Dashboard
          </Link>
          <Link
            href="/login"
            className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-all"
          >
            Authenticate
          </Link>
        </div>
        <div className="pt-4 border-t border-slate-100 text-[10px] text-slate-400 font-mono">
          BSC Textiles Pvt Ltd &bull; Master Retail Operations Network
        </div>
      </div>
    </div>
  );
}