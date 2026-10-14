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
  // Range period counts
  loggedInPeriod?: number;
  markedPresentPeriod?: number;
  absentPeriod?: number;
  lateArrivalsPeriod?: number;
  onLeavePeriod?: number;
  totalSessionsPeriod?: number;
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
  onCardClick: (category: string, title: string, triggerEl?: HTMLElement) => void;
  selectedCategory?: string | null;
  preset?: string;
  selectedDate?: string | null;
}

interface CardConfig {
  id: string;
  category: string;
  group: 'Workforce' | 'Access' | 'Attendance';
  title: string;
  value: number | string;
  sublabel: string;
  icon: any;
  iconColor: string;
  iconBg: string;
  change?: number;
  changeLabel?: string;
  isLive?: boolean;
}

export function SummaryCardGrid({
  counts,
  comparison,
  loading,
  onCardClick,
  selectedCategory,
  preset = '30d',
  selectedDate,
}: SummaryCardGridProps) {
  if (loading && !counts) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 2xl:grid-cols-7 gap-3 mb-6">
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-slate-100 dark:bg-slate-800/60 animate-pulse border border-slate-200/80 dark:border-slate-800 p-4"
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

  const isTodayOnly = !selectedDate && preset === 'today';
  const dateSuffix = selectedDate
    ? `(${selectedDate})`
    : preset === 'today'
    ? 'Today'
    : preset === '7d'
    ? '(7 Days)'
    : preset === '30d'
    ? '(30 Days)'
    : preset === '90d'
    ? '(90 Days)'
    : preset === 'this_month'
    ? '(This Month)'
    : preset === 'prev_month'
    ? '(Prev Month)'
    : '(Period)';

  const cards: CardConfig[] = [
    // 1. Total Employees
    {
      id: 'total_employees',
      category: 'total_employees',
      group: 'Workforce',
      title: 'Total Employees',
      value: c.totalEmployees,
      sublabel: `${c.activeEmployees} active on rolls`,
      icon: Users,
      iconColor: 'text-blue-600 dark:text-blue-400',
      iconBg: 'bg-blue-50 dark:bg-blue-950/50',
    },
    // 2. Active Workforce
    {
      id: 'active_workforce',
      category: 'active_workforce',
      group: 'Workforce',
      title: 'Active Workforce',
      value: c.activeEmployees,
      sublabel: `${c.probationEmployees} on probation`,
      icon: UserCheck,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
    },
    // 3. Inactive / Exited
    {
      id: 'inactive_exited',
      category: 'inactive_exited',
      group: 'Workforce',
      title: 'Inactive / Exited',
      value: c.inactiveEmployees,
      sublabel: 'Separated staff',
      icon: UserX,
      iconColor: 'text-slate-600 dark:text-slate-400',
      iconBg: 'bg-slate-100 dark:bg-slate-800/80',
    },
    // 4. Logged In Today / Range
    {
      id: 'logged_in',
      category: 'logged_in',
      group: 'Access',
      title: isTodayOnly ? 'Logged In Today' : `Logged In ${dateSuffix}`,
      value: !isTodayOnly && c.loggedInPeriod !== undefined ? c.loggedInPeriod : c.loggedInToday,
      sublabel: 'Unique accounts signed in',
      icon: LogIn,
      iconColor: 'text-sky-600 dark:text-sky-400',
      iconBg: 'bg-sky-50 dark:bg-sky-950/50',
    },
    // 5. Not Yet Logged In
    {
      id: 'not_logged_in',
      category: 'not_logged_in',
      group: 'Access',
      title: 'Not Yet Logged In',
      value: c.notLoggedInToday,
      sublabel: 'Active staff without login',
      icon: Clock,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/50',
    },
    // 6. Currently Active
    {
      id: 'currently_active',
      category: 'currently_active',
      group: 'Access',
      title: 'Currently Active',
      value: c.currentlyActive,
      sublabel: 'Unexpired live sessions',
      icon: Radio,
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/50',
      isLive: true,
    },
    // 7. Present Today / Range
    {
      id: 'present',
      category: 'present',
      group: 'Attendance',
      title: isTodayOnly ? 'Present Today' : `Present ${dateSuffix}`,
      value: !isTodayOnly && c.markedPresentPeriod !== undefined ? c.markedPresentPeriod : c.markedPresentToday,
      sublabel: 'Punched / verified attendance',
      icon: CheckCircle2,
      iconColor: 'text-teal-600 dark:text-teal-400',
      iconBg: 'bg-teal-50 dark:bg-teal-950/50',
    },
    // 8. Absent Today / Range
    {
      id: 'absent',
      category: 'absent',
      group: 'Attendance',
      title: isTodayOnly ? 'Absent Today' : `Absent ${dateSuffix}`,
      value: !isTodayOnly && c.absentPeriod !== undefined ? c.absentPeriod : c.absentToday,
      sublabel: 'No recorded attendance',
      icon: AlertCircle,
      iconColor: 'text-rose-600 dark:text-rose-400',
      iconBg: 'bg-rose-50 dark:bg-rose-950/50',
    },
    // 9. Late Arrivals Today / Range
    {
      id: 'late',
      category: 'late',
      group: 'Attendance',
      title: isTodayOnly ? 'Late Arrivals Today' : `Late Arrivals ${dateSuffix}`,
      value: !isTodayOnly && c.lateArrivalsPeriod !== undefined ? c.lateArrivalsPeriod : c.lateArrivalsToday,
      sublabel: 'Beyond shift grace limit',
      icon: AlertTriangle,
      iconColor: 'text-amber-600 dark:text-amber-400',
      iconBg: 'bg-amber-50 dark:bg-amber-950/50',
    },
    // 10. On Approved Leave
    {
      id: 'on_leave',
      category: 'on_leave',
      group: 'Attendance',
      title: isTodayOnly ? 'On Approved Leave' : `On Leave ${dateSuffix}`,
      value: !isTodayOnly && c.onLeavePeriod !== undefined ? c.onLeavePeriod : c.onLeaveToday,
      sublabel: 'HR approved requests',
      icon: Calendar,
      iconColor: 'text-purple-600 dark:text-purple-400',
      iconBg: 'bg-purple-50 dark:bg-purple-950/50',
    },
    // 11. Sessions Today / Range
    {
      id: 'sessions',
      category: 'sessions',
      group: 'Access',
      title: isTodayOnly ? 'Sessions Today' : `Sessions ${dateSuffix}`,
      value: !isTodayOnly && c.totalSessionsPeriod !== undefined ? c.totalSessionsPeriod : c.totalSessionsToday,
      sublabel: 'Total auth sessions opened',
      icon: Laptop,
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/50',
    },
    // 12. Attendance Rate
    {
      id: 'attendance_rate',
      category: 'attendance_rate',
      group: 'Attendance',
      title: 'Attendance Rate',
      value: `${c.averageAttendanceRate}%`,
      sublabel: 'Present vs recorded ratio',
      icon: TrendingUp,
      iconColor: 'text-violet-600 dark:text-violet-400',
      iconBg: 'bg-violet-50 dark:bg-violet-950/50',
      change: comparison?.attendanceRateChange,
      changeLabel: 'vs prior period',
    },
    // 13. Attendance Records
    {
      id: 'attendance_records',
      category: 'attendance_records',
      group: 'Attendance',
      title: 'Attendance Records',
      value: c.totalAttendanceRecords,
      sublabel: 'In selected date range',
      icon: FileSpreadsheet,
      iconColor: 'text-cyan-600 dark:text-cyan-400',
      iconBg: 'bg-cyan-50 dark:bg-cyan-950/50',
    },
    // 14. Total Login Events
    {
      id: 'login_events',
      category: 'login_events',
      group: 'Access',
      title: 'Total Login Events',
      value: c.totalLoginEvents,
      sublabel: `${c.failedLoginEvents} failed attempts`,
      icon: ShieldCheck,
      iconColor: 'text-blue-700 dark:text-blue-300',
      iconBg: 'bg-blue-50 dark:bg-blue-950/50',
      change: comparison?.loginEventsChange,
      changeLabel: 'vs prior period',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 2xl:grid-cols-7 gap-3 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = selectedCategory === card.category;

        return (
          <button
            key={card.id}
            id={`kpi-card-${card.category}`}
            type="button"
            onClick={(e) => onCardClick(card.category, card.title, e.currentTarget)}
            aria-label={`View details for ${card.title}`}
            aria-expanded={isSelected}
            className={`text-left p-3.5 rounded-xl bg-white dark:bg-slate-900 border transition-all duration-150 cursor-pointer group shadow-xs hover:shadow-md relative overflow-hidden flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] ${
              isSelected
                ? 'border-[#1346a1] ring-2 ring-[#1346a1]/25 dark:border-blue-500 bg-blue-50/20 dark:bg-blue-950/25'
                : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
            }`}
          >
            {/* 1. Top row: Icon (top-left) with a light tint, and Group label / comparative change */}
            <div className="flex items-center justify-between gap-1 mb-2">
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconColor}`}
              >
                <Icon className="w-4 h-4" />
              </div>

              <div className="flex items-center gap-1.5">
                {card.change !== undefined && card.change !== null && card.change !== 0 ? (
                  <span
                    className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap shrink-0 ${
                      card.change > 0
                        ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60'
                        : 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60'
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
                ) : (
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-slate-400 dark:text-slate-500">
                    {card.group}
                  </span>
                )}
              </div>
            </div>

            {/* 2. Label (12px, uppercase, muted) */}
            <div className="text-[12px] uppercase font-semibold text-slate-500 dark:text-slate-400 truncate tracking-wide">
              {card.title}
            </div>

            {/* 3. Value (22-24px, 600, one font, no mixed sizes) */}
            <div className="mt-1">
              <span className="text-[23px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">
                {typeof card.value === 'number' ? card.value.toLocaleString('en-IN') : card.value}
              </span>
            </div>

            {/* 4. Sub-text (12px, muted, single line, with live dot if active) */}
            <div
              className="text-[12px] text-slate-500 dark:text-slate-400 truncate mt-1 flex items-center gap-1.5"
              title={card.sublabel}
            >
              {card.isLive && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
              )}
              <span className="truncate">{card.sublabel}</span>
            </div>

            {/* 5. Footer link "View details →", aligned to bottom of every card */}
            <div className="text-[11px] font-medium text-[#1346a1] dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300 transition-colors mt-2.5 flex items-center justify-between border-t border-slate-100 dark:border-slate-800/80 pt-2">
              <span>View details</span>
              <span className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
