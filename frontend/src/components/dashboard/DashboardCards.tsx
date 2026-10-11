'use client';

import React from 'react';
import { 
  Fingerprint, 
  Users, 
  Router, 
  Clock, 
  ScanFace, 
  ArrowRight,
  TrendingUp,
  Activity,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';
import type { MetricDetailType } from '@/types/metricDetail';

interface DashboardStats {
  totalEmployees?: number;
  present?: number;
  absent?: number;
  late?: number;
  onLunch?: number;
  onTeaBreak?: number;
  weeklyOff?: number;
  overtime?: number;
  faceVerified?: number;
  faceFailed?: number;
  avgFaceMatch?: number;
  qrScans?: number;
  failedQrScans?: number;
  incentiveToday?: number;
  penaltyToday?: number;
}

interface DashboardCardsProps {
  onSelectMetric: (metric: MetricDetailType) => void;
  stats?: DashboardStats | null;
}

export function DashboardCards({ onSelectMetric, stats }: DashboardCardsProps) {
  // Shared interactive card styles
  const cardBaseClasses =
    'group relative flex flex-col justify-between w-full text-left bg-white dark:bg-[#0e172a] p-4 sm:p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs cursor-pointer transition-all duration-200 hover:scale-[1.02] hover:shadow-lg hover:border-[#0058be]/50 dark:hover:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-[#0058be] focus:ring-offset-2 active:scale-[0.99]';

  const viewDetailsHint = (
    <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400 opacity-75 group-hover:opacity-100 transition-opacity">
      <span>View granular report</span>
      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1 text-[#0058be] dark:text-blue-400" />
    </div>
  );

  const handleKeyDown = (e: React.KeyboardEvent, metric: MetricDetailType) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectMetric(metric);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full">
      {/* ========================================================================= */}
      {/* CARD 1: Total Today Punches                                               */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric('punches')}
        onKeyDown={(e) => handleKeyDown(e, 'punches')}
        aria-label="View detailed report for Total Today Punches"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Total Today Punches
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight">
                  50
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" />
                  +100%
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0058be] dark:text-blue-400 shrink-0 shadow-xs group-hover:bg-[#0058be] group-hover:text-white transition-colors">
              <Fingerprint className="w-5 h-5" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
              50 employees in-punched
            </p>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                99.8% Sync Rate
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">
                Peak: 9:00 AM
              </span>
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 2: On-Floor Live Presence                                            */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric('presence')}
        onKeyDown={(e) => handleKeyDown(e, 'presence')}
        aria-label="View detailed report for On-Floor Live Presence"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                On-Floor Live Presence
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight">
                  12
                </span>
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                  / 35 staff
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0 shadow-xs group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <Users className="w-5 h-5" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300 font-medium">92.5% Occupancy</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">+1.8% vs expected</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '92.5%' }} />
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
              23 off-floor (leaves & shifts)
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 3: Active Terminals                                                  */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric('terminals')}
        onKeyDown={(e) => handleKeyDown(e, 'terminals')}
        aria-label="View detailed report for Active Terminals"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Active Terminals
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight">
                  8 / 8
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Online
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0 shadow-xs group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Router className="w-5 h-5" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                <Activity className="w-3 h-3 text-emerald-500" />
                18ms Latency
              </span>
              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                0% Packet Loss
              </span>
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              Karnataka Network • All Hubs Connected
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 4: Punctuality Rate                                                  */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric('punctuality')}
        onKeyDown={(e) => handleKeyDown(e, 'punctuality')}
        aria-label="View detailed report for Punctuality Rate"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Punctuality Rate
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight">
                  96.4%
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  On-Time
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0 shadow-xs group-hover:bg-amber-600 group-hover:text-white transition-colors">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-amber-600 dark:text-amber-400">5 in Grace Period</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">0 Late Arrivals</span>
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate">
              5-minute window • Target: 95.0%+
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 5: AI Liveness Rate                                                  */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric('liveness')}
        onKeyDown={(e) => handleKeyDown(e, 'liveness')}
        aria-label="View detailed report for AI Liveness Rate"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                AI Liveness Rate
              </span>
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight">
                  100%
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  Verified
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shrink-0 shadow-xs group-hover:bg-purple-600 group-hover:text-white transition-colors">
              <ScanFace className="w-5 h-5" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5 mt-3">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-3 h-3 text-emerald-600" />
                0 Spoofing Attempts
              </span>
            </div>
            <div className="text-[10px] text-slate-400 dark:text-slate-500">
              Passive & 3D Parallax • 95% Match Gate
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>
    </div>
  );
}

export default DashboardCards;
