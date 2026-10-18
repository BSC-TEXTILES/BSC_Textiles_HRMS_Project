'use client';

import React from 'react';
import { 
  Users, 
  UserCheck, 
  Fingerprint, 
  Coffee, 
  Banknote,
  ArrowRight
} from 'lucide-react';
import type { MetricKey } from '@/components/dashboard/MetricDrillDownModal';

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
  onSelectMetric?: (metric: any) => void;
  stats?: DashboardStats | null;
}

export function DashboardCards({ onSelectMetric, stats }: DashboardCardsProps) {
  // Shared interactive card styles matching enterprise screenshot
  const cardBaseClasses =
    'group relative flex flex-col justify-between w-full text-left bg-white dark:bg-[#0e172a] p-4 sm:p-4.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs cursor-pointer transition-all duration-200 hover:shadow-md hover:border-[#0058be]/40 dark:hover:border-blue-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#0058be] focus:ring-offset-2 active:scale-[0.99]';

  const viewDetailsHint = (
    <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400 opacity-80 group-hover:opacity-100 transition-opacity">
      <span>VIEW DETAILS</span>
      <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
    </div>
  );

  const handleKeyDown = (e: React.KeyboardEvent, metric: MetricKey) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelectMetric?.(metric);
    }
  };

  // Every figure below comes from /reports/dashboard-summary. When the backend
  // has not reported a metric the card shows an em-dash rather than a placeholder
  // number, so an empty day never looks like a measured one.
  const NO_DATA = '—';
  const num = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;

  const totalEmployees = num(stats?.totalEmployees);
  const present = num(stats?.present);
  const absent = num(stats?.absent);
  const late = num(stats?.late);
  const weeklyOff = num(stats?.weeklyOff);
  const hasPunchStats = stats?.qrScans !== undefined || stats?.faceVerified !== undefined;
  const biometricPunches = hasPunchStats
    ? (stats?.qrScans ?? 0) + (stats?.faceVerified ?? 0)
    : null;
  // Only ever the mean of match values the terminals themselves reported; the
  // backend returns 0 when no face verification row exists, which is no data.
  const avgFaceMatch = num(stats?.avgFaceMatch);
  const qrScans = num(stats?.qrScans);
  const lunchBreaks = num(stats?.onLunch);
  const teaBreaks = num(stats?.onTeaBreak);
  const totalBreaks =
    lunchBreaks === null && teaBreaks === null ? null : (lunchBreaks ?? 0) + (teaBreaks ?? 0);
  const incentiveToday = num(stats?.incentiveToday);
  const presentPct =
    present !== null && totalEmployees !== null && totalEmployees > 0
      ? `${((present / totalEmployees) * 100).toFixed(1)}% Present`
      : `${NO_DATA} Present`;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 w-full">
      {/* ========================================================================= */}
      {/* CARD 1: WORKFORCE REGISTER                                                */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric?.('workforce')}
        onKeyDown={(e) => handleKeyDown(e, 'workforce')}
        aria-label="View Workforce Register report"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                WORKFORCE REGISTER
              </span>
              <div className="text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight mt-1">
                {totalEmployees ?? NO_DATA}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0058be] dark:text-blue-400 shrink-0 shadow-xs group-hover:bg-[#0058be] group-hover:text-white transition-colors">
              <Users className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 font-medium">
              <span>Active On Floor:</span>
              <span className="font-bold text-[#0b1c30] dark:text-slate-100">{present ?? NO_DATA}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Probation: {NO_DATA} • Off: {weeklyOff ?? NO_DATA}</span>
              <span className="text-[#0058be] dark:text-blue-400 font-bold">MTD: {NO_DATA}</span>
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 2: FLOOR ADHERENCE                                                   */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric?.('adherence')}
        onKeyDown={(e) => handleKeyDown(e, 'adherence')}
        aria-label="View Floor Adherence report"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                FLOOR ADHERENCE
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight">
                  {present ?? NO_DATA}
                </span>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  / {totalEmployees ?? NO_DATA}
                </span>
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0058be] dark:text-blue-400 shrink-0 shadow-xs group-hover:bg-[#0058be] group-hover:text-white transition-colors">
              <UserCheck className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="mt-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0058be] dark:text-blue-400">
                <span className="w-1.5 h-1.5 rounded-full bg-[#0058be] dark:bg-blue-400" />
                {presentPct}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                {late ?? NO_DATA} Late
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {weeklyOff ?? NO_DATA} Weekly Off • {absent ?? NO_DATA} Absent
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 3: BIOMETRIC PUNCHES                                                 */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric?.('punches')}
        onKeyDown={(e) => handleKeyDown(e, 'punches')}
        aria-label="View Biometric Punches report"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                BIOMETRIC PUNCHES
              </span>
              <div className="text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight mt-1">
                {biometricPunches ?? NO_DATA}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0058be] dark:text-blue-400 shrink-0 shadow-xs group-hover:bg-[#0058be] group-hover:text-white transition-colors">
              <Fingerprint className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="mt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 font-medium">
              <span>Face Verified:</span>
              <span className="font-bold text-[#0b1c30] dark:text-slate-100">
                {avgFaceMatch === null ? 'Not reported by device' : `${avgFaceMatch.toFixed(1)}% Avg`}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>RFID & QR Scans:</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">
                {qrScans === null ? NO_DATA : `${qrScans} scans`}
              </span>
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 4: ACTIVE FLOOR BREAKS                                               */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric?.('breaks')}
        onKeyDown={(e) => handleKeyDown(e, 'breaks')}
        aria-label="View Active Floor Breaks report"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                ACTIVE FLOOR BREAKS
              </span>
              <div className="text-3xl font-extrabold text-[#0b1c30] dark:text-slate-100 tracking-tight mt-1">
                {totalBreaks ?? NO_DATA}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0058be] dark:text-blue-400 shrink-0 shadow-xs group-hover:bg-[#0058be] group-hover:text-white transition-colors">
              <Coffee className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="mt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 font-medium">
              <span>Lunch: {lunchBreaks ?? NO_DATA}</span>
              <span>Tea: {teaBreaks ?? NO_DATA}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[#0058be] dark:text-blue-400 font-semibold">Break overrun check</span>
              <span className="text-slate-500 dark:text-slate-400">Not reported</span>
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>

      {/* ========================================================================= */}
      {/* CARD 5: INCENTIVES TODAY                                                  */}
      {/* ========================================================================= */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelectMetric?.('incentives')}
        onKeyDown={(e) => handleKeyDown(e, 'incentives')}
        aria-label="View Incentives Today report"
        className={cardBaseClasses}
      >
        <div>
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                INCENTIVES TODAY
              </span>
              <div className="text-3xl font-extrabold text-[#0058be] dark:text-blue-400 tracking-tight mt-1">
                {incentiveToday === null ? NO_DATA : `₹${incentiveToday.toLocaleString('en-IN')}`}
              </div>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center text-[#0058be] dark:text-blue-400 shrink-0 shadow-xs group-hover:bg-[#0058be] group-hover:text-white transition-colors">
              <Banknote className="w-4.5 h-4.5" />
            </div>
          </div>

          <div className="mt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 font-medium">
              <span>Early Login:</span>
              <span className="font-bold text-[#0b1c30] dark:text-slate-100">{NO_DATA}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Sales & Overtime:</span>
              <span className="font-semibold text-slate-500 dark:text-slate-400">{NO_DATA}</span>
            </div>
          </div>
        </div>

        {viewDetailsHint}
      </div>
    </div>
  );
}
