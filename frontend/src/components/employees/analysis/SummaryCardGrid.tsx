'use client';

import React from 'react';
import {
  Users,
  UserCheck,
  UserX,
  LogIn,
  Clock,
  Radio,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Calendar,
  Laptop,
  TrendingUp,
  FileSpreadsheet,
  ShieldCheck,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react';

export interface SummaryCounts {
  totalEmployees: number;
  activeEmployees: number;
  inactiveEmployees: number;
  probationEmployees: number;
  loggedInToday: number;
  notLoggedInToday: number;
  currentlyActive: number;
  markedPresentToday: number;
  absentToday: number;
  lateArrivalsToday: number;
  onLeaveToday: number;
  totalSessionsToday: number;
  averageAttendanceRate: number;
  totalAttendanceRecords: number;
  totalLoginEvents: number;
  failedLoginEvents: number;
  uniqueEmployeesLoggedIn: number;
}

export interface SummaryComparison {
  attendanceRateChange: number;
  loginEventsChange: number;
  prevTotalLoginEvents: number;
  prevAttendanceRate: number;
}

interface SummaryCardGridProps {
  counts: SummaryCounts | null;
  comparison: SummaryComparison | null;
  loading: boolean;
  onCardClick: (category: string, title: string) => void;
  selectedCategory?: string;
}

interface CardConfig {
  id: string;
  category: string;
  title: string;
  value: number | string;
  suffix?: string;
  sublabel: string;
  icon: any;
  iconColor: string;
  iconBg: string;
  accentBar: string;
  change?: number;
  changeLabel?: string;
  pulseLive?: boolean;
}

export function SummaryCardGrid({
  counts,
  comparison,
  loading,
  onCardClick,
  selectedCategory,
}: SummaryCardGridProps) {
  if (loading && !counts) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3.5 mb-6">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800/60 animate-pulse border border-slate-200/60 dark:border-slate-700/60 p-4"
          />
        ))}
      </div>
    );
  }

  const c = counts || {
    totalEmployees: 0,
    activeEmployees: 0,
    inactiveEmployees: 0,
    probationEmployees: 0,
    loggedInToday: 0,
    notLoggedInToday: 0,
    currentlyActive: 0,
    markedPresentToday: 0,
    absentToday: 0,
    lateArrivalsToday: 0,
    onLeaveToday: 0,
    totalSessionsToday: 0,
    averageAttendanceRate: 0,
    totalAttendanceRecords: 0,
    totalLoginEvents: 0,
    failedLoginEvents: 0,
    uniqueEmployeesLoggedIn: 0,
  };

  const cards: CardConfig[] = [
    {
      id: 'total-emp',
      category: 'all',
      title: 'Total Employees',
      value: c.totalEmployees,
      sublabel: `${c.activeEmployees} active on rolls`,
      icon: Users,
      iconColor: 'text-[#1346a1] dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-900/40',
      accentBar: 'from-[#1346a1] to-blue-500',
    },
    {
      id: 'active-emp',
      category: 'all',
      title: 'Active Workforce',
      value: c.activeEmployees,
      sublabel: `${c.probationEmployees} on probation`,
      icon: UserCheck,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-900/40',
      accentBar: 'from-emerald-500 to-teal-400',
    },
    {
      id: 'inactive-emp',
      category: 'inactive',
      title: 'Inactive / Exited',
      value: c.inactiveEmployees,
      sublabel: 'Separated staff',
      icon: UserX,
      iconColor: 'text-slate-500 dark:text-slate-400',
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      accentBar: 'from-slate-400 to-slate-500',
    },
    {
      id: 'logged-in-today',
      category: 'logged_in_today',
      title: 'Logged In Today',
      value: c.loggedInToday,
      sublabel: 'Unique accounts signed in',
      icon: LogIn,
      iconColor: 'text-sky-600 dark:text-sky-400',
      iconBg: 'bg-sky-50 dark:bg-sky-900/40',
      accentBar: 'from-sky-500 to-cyan-400',
    },
    {
      id: 'not-logged-in-today',
      category: 'not_logged_in_today',
      title: 'Not Yet Logged In',
      value: c.notLoggedInToday,
      sublabel: 'Active staff without login',
      icon: Clock,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-900/40',
      accentBar: 'from-amber-400 to-orange-400',
    },
    {
      id: 'currently-active',
      category: 'currently_active',
      title: 'Currently Active',
      value: c.currentlyActive,
      sublabel: 'Unexpired live sessions',
      icon: Radio,
      iconColor: 'text-emerald-500 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-900/40',
      accentBar: 'from-emerald-400 to-green-500',
      pulseLive: true,
    },
    {
      id: 'marked-present',
      category: 'present_today',
      title: 'Present Today',
      value: c.markedPresentToday,
      sublabel: 'Punched / verified today',
      icon: CheckCircle2,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-900/40',
      accentBar: 'from-emerald-500 to-teal-500',
    },
    {
      id: 'absent-today',
      category: 'absent_today',
      title: 'Absent Today',
      value: c.absentToday,
      sublabel: 'No recorded attendance',
      icon: AlertCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-900/40',
      accentBar: 'from-rose-500 to-red-600',
    },
    {
      id: 'late-today',
      category: 'late_today',
      title: 'Late Arrivals Today',
      value: c.lateArrivalsToday,
      sublabel: 'Beyond shift grace limit',
      icon: AlertTriangle,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-900/40',
      accentBar: 'from-amber-500 to-yellow-500',
    },
    {
      id: 'on-leave-today',
      category: 'on_leave_today',
      title: 'On Approved Leave',
      value: c.onLeaveToday,
      sublabel: 'HR approved requests',
      icon: Calendar,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-50 dark:bg-purple-900/40',
      accentBar: 'from-purple-500 to-indigo-500',
    },
    {
      id: 'total-sessions',
      category: 'all',
      title: 'Sessions Today',
      value: c.totalSessionsToday,
      sublabel: 'Total auth sessions opened',
      icon: Laptop,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-900/40',
      accentBar: 'from-indigo-500 to-blue-500',
    },
    {
      id: 'attendance-rate',
      category: 'present_today',
      title: 'Attendance Rate',
      value: c.averageAttendanceRate,
      suffix: '%',
      sublabel: 'Present vs recorded ratio',
      icon: TrendingUp,
      iconColor: 'text-violet-600 dark:text-violet-400',
      iconBg: 'bg-violet-50 dark:bg-violet-900/40',
      accentBar: 'from-violet-500 to-purple-500',
      change: comparison?.attendanceRateChange,
      changeLabel: 'vs prior period',
    },
    {
      id: 'att-records-period',
      category: 'all',
      title: 'Attendance Records',
      value: c.totalAttendanceRecords,
      sublabel: 'In selected date range',
      icon: FileSpreadsheet,
      iconColor: 'text-teal-600 dark:text-teal-400',
      iconBg: 'bg-teal-50 dark:bg-teal-900/40',
      accentBar: 'from-teal-500 to-emerald-400',
    },
    {
      id: 'login-events-period',
      category: 'all',
      title: 'Total Login Events',
      value: c.totalLoginEvents,
      sublabel: `${c.failedLoginEvents} failed attempts`,
      icon: ShieldCheck,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBg: 'bg-cyan-50 dark:bg-cyan-900/40',
      accentBar: 'from-cyan-500 to-blue-500',
      change: comparison?.loginEventsChange,
      changeLabel: 'vs prior period',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3.5 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = selectedCategory === card.category;

        return (
          <button
            key={card.id}
            type="button"
            onClick={() => onCardClick(card.category, card.title)}
            className={`text-left p-3.5 rounded-2xl bg-white dark:bg-slate-900 border transition-all duration-200 cursor-pointer group shadow-2xs hover:shadow-md hover:-translate-y-0.5 relative overflow-hidden flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] ${
              isSelected
                ? 'border-[#1346a1] ring-2 ring-[#1346a1]/25 dark:border-blue-500 bg-blue-50/15 dark:bg-blue-950/20'
                : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {/* Top decorative accent line */}
            <div
              className={`absolute top-0 left-0 right-0 h-1 bg-gradient-to-r ${card.accentBar} opacity-80 group-hover:opacity-100 transition-opacity`}
            />

            {/* Top row: Icon and comparative badge */}
            <div className="flex items-center justify-between gap-1 mb-2 pt-0.5">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconColor} shadow-2xs`}
              >
                <Icon className="w-4 h-4" />
              </div>

              {card.pulseLive ? (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Live
                </span>
              ) : card.change !== undefined && card.change !== null && card.change !== 0 ? (
                <span
                  className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-md whitespace-nowrap shrink-0 ${
                    card.change > 0
                      ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800'
                      : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800'
                  }`}
                  title={`${card.changeLabel}: ${card.change > 0 ? '+' : ''}${card.change}%`}
                >
                  {card.change > 0 ? (
                    <ArrowUpRight className="w-3 h-3 shrink-0 mr-0.5" />
                  ) : (
                    <ArrowDownRight className="w-3 h-3 shrink-0 mr-0.5" />
                  )}
                  {Math.abs(card.change)}%
                </span>
              ) : null}
            </div>

            {/* Value & Suffix */}
            <div>
              <div className="flex items-baseline whitespace-nowrap">
                <span className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {typeof card.value === 'number' ? card.value.toLocaleString('en-IN') : card.value}
                  {card.suffix && (
                    <span className="text-sm font-bold text-slate-500 dark:text-slate-400 ml-0.5">
                      {card.suffix}
                    </span>
                  )}
                </span>
              </div>

              {/* Title */}
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate mt-1">
                {card.title}
              </div>

              {/* Sublabel */}
              <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {card.sublabel}
              </div>
            </div>

            {/* Bottom drill-down indicator */}
            <div className="text-[9px] font-semibold text-[#1346a1] dark:text-blue-400 opacity-60 group-hover:opacity-100 transition-opacity mt-2 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5">
              <span>Drill down</span>
              <span className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
