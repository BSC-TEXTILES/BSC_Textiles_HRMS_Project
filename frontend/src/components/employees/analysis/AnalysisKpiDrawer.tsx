'use client';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import {
  X,
  RefreshCw,
  Search,
  Filter,
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
  ArrowRight,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import api from '@/lib/api';

export interface AnalysisKpiDrawerProps {
  open: boolean;
  onClose: () => void;
  category: string;
  title: string;
  preset: string;
  date?: string | null;
  customStartDate?: string;
  customEndDate?: string;
  locationId: string;
  departmentId: string;
  employeeStatus: string;
  locations: { id: string; code: string; name: string }[];
  departments: { id: string; name: string }[];
  triggerRef?: React.RefObject<HTMLElement | null>;
  onClearDrillDownDate?: () => void;
  autoRefreshTick?: number;
}

export function AnalysisKpiDrawer({
  open,
  onClose,
  category,
  title,
  preset,
  date,
  customStartDate,
  customEndDate,
  locationId,
  departmentId,
  employeeStatus,
  locations,
  departments,
  triggerRef,
  onClearDrillDownDate,
  autoRefreshTick = 0,
}: AnalysisKpiDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [limit] = useState<number>(15);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [summary, setSummary] = useState<any>({});
  const [breakdowns, setBreakdowns] = useState<any>({});

  // Local drawer search and filter chip
  const [search, setSearch] = useState<string>('');
  const [chipFilter, setChipFilter] = useState<string>('ALL');

  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset page and search when category changes
  useEffect(() => {
    if (open) {
      setPage(1);
      setSearch('');
      setChipFilter('ALL');
    }
  }, [open, category]);

  // Main drawer data fetcher
  const fetchDrawerData = useCallback(
    async (isBackground = false) => {
      if (!open || !category) return;

      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const p = new URLSearchParams();
        p.append('category', category);
        p.append('page', String(page));
        p.append('limit', String(limit));

        if (date) {
          p.append('date', date);
        } else {
          p.append('preset', preset);
          if (preset === 'custom' && customStartDate && customEndDate) {
            p.append('startDate', customStartDate);
            p.append('endDate', customEndDate);
          }
        }

        if (locationId && locationId !== 'all') p.append('locationId', locationId);
        if (departmentId && departmentId !== 'all') p.append('departmentId', departmentId);
        if (employeeStatus && employeeStatus !== 'ALL') p.append('status', employeeStatus);
        if (search.trim()) p.append('search', search.trim());

        const res = await api.get(`/analysis/drilldown?${p.toString()}`, {
          signal: abortControllerRef.current.signal,
        });

        setRows(res.data?.rows || []);
        setTotal(res.data?.total || 0);
        setTotalPages(res.data?.totalPages || 1);
        setSummary(res.data?.summary || {});
        setBreakdowns(res.data?.breakdowns || {});
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Failed to load drawer data:', err);
        setError(err?.response?.data?.message || err?.message || 'Failed to load details.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [open, category, page, limit, date, preset, customStartDate, customEndDate, locationId, departmentId, employeeStatus, search]
  );

  // Load data on filter/page change
  useEffect(() => {
    if (open) {
      fetchDrawerData();
    }
  }, [open, fetchDrawerData]);

  // Re-fetch on auto-refresh tick without resetting scroll or search
  useEffect(() => {
    if (open && autoRefreshTick > 0) {
      fetchDrawerData(true);
    }
  }, [autoRefreshTick, open, fetchDrawerData]);

  // Body scroll lock & Escape key handling
  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const triggerEl = triggerRef?.current;
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 60);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      triggerEl?.focus();
    };
  }, [open, onClose, triggerRef]);

  // Build readable filter summary string
  const activeLocation = locations.find((l) => l.id === locationId);
  const activeDepartment = departments.find((d) => d.id === departmentId);

  const filterSummary = useMemo(() => {
    const parts: string[] = [];
    if (date) {
      parts.push(`Date: ${date}`);
    } else {
      const presetMap: Record<string, string> = {
        today: 'Today',
        '7d': 'Last 7 Days',
        '30d': 'Last 30 Days',
        '90d': 'Last 90 Days',
        this_month: 'This Month',
        prev_month: 'Prev Month',
        all: 'All History',
        custom: `${customStartDate || ''} to ${customEndDate || ''}`,
      };
      parts.push(`Range: ${presetMap[preset] || preset}`);
    }

    if (activeLocation) {
      parts.push(`Hub: ${activeLocation.name} (${activeLocation.code})`);
    } else {
      parts.push('Hubs: All Retail Hubs');
    }

    if (activeDepartment) {
      parts.push(`Dept: ${activeDepartment.name}`);
    } else {
      parts.push('All Departments');
    }

    if (employeeStatus && employeeStatus !== 'ALL') {
      parts.push(`Status: ${employeeStatus}`);
    }

    return parts.join(' • ');
  }, [date, preset, customStartDate, customEndDate, activeLocation, activeDepartment, employeeStatus]);

  // Client-side chip filtering for secondary refinement
  const filteredRows = useMemo(() => {
    if (chipFilter === 'ALL') return rows;
    const cf = chipFilter.toUpperCase();

    return rows.filter((r) => {
      if (category === 'total_employees' || category === 'active_workforce') {
        return r.status?.toUpperCase() === cf;
      }
      if (category === 'inactive_exited') {
        return r.exitType?.toUpperCase().includes(cf);
      }
      if (category === 'logged_in') {
        return r.deviceType?.toUpperCase().includes(cf);
      }
      if (category === 'not_logged_in') {
        if (cf === 'ACCOUNT') return r.hasLoginAccount === 'Yes' || r.loginAccountStatus?.includes('Active');
        if (cf === 'NO_ACCOUNT') return r.hasLoginAccount === 'No' || r.loginAccountStatus?.includes('No');
        return true;
      }
      if (category === 'sessions') {
        return r.status?.toUpperCase() === cf;
      }
      if (category === 'login_events') {
        return r.result?.toUpperCase() === cf;
      }
      if (category === 'present') {
        return r.verificationMethod?.toUpperCase().includes(cf);
      }
      if (category === 'absent') {
        if (cf === 'LEAVE') return r.leaveStatus?.includes('Approved');
        if (cf === 'UNEXCUSED') return !r.leaveStatus?.includes('Approved');
        return true;
      }
      if (category === 'on_leave') {
        return r.leaveType?.toUpperCase().includes(cf);
      }
      if (category === 'attendance_records') {
        return r.status?.toUpperCase() === cf;
      }
      return true;
    });
  }, [rows, chipFilter, category]);

  // Determine footer action link
  const footerAction = useMemo(() => {
    if (category === 'inactive_exited' || category === 'inactive-emp') {
      return {
        label: 'Open Former Staff & F&F Settlement',
        href: '/employees/former',
      };
    }
    if (category === 'not_logged_in' || category === 'not_logged_in_today') {
      return {
        label: 'Open All Employees',
        href: '/employees',
      };
    }
    if (category === 'present' || category === 'present_today' || category === 'marked-present' || category === 'absent' || category === 'attendance_records') {
      return {
        label: 'Open Attendance Register',
        href: '/attendance/register',
      };
    }
    if (category === 'late' || category === 'late_today') {
      return {
        label: 'Open Late & Fine Management',
        href: '/attendance/late-fines',
      };
    }
    if (category === 'on_leave' || category === 'on_leave_today') {
      return {
        label: 'Open Leave Approvals',
        href: '/attendance/leaves',
      };
    }
    return null;
  }, [category]);

  if (!mounted || !open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="analysis-drawer-title"
      aria-describedby="analysis-drawer-filters"
    >
      {/* Fixed Backdrop: one even dim tone, no blur, no gradient */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer Panel */}
      <div className="relative z-10 w-full sm:w-[85vw] lg:w-[740px] max-w-full h-full bg-white dark:bg-[#0f172a] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-200 ease-out">
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 px-5 py-3.5 bg-white dark:bg-[#0f172a] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="analysis-drawer-title"
                className="text-base font-bold text-slate-900 dark:text-white tracking-tight truncate"
              >
                {title}
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 text-[#1346a1] dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800">
                {total} {total === 1 ? 'Record' : 'Records'}
              </span>
              {date && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                  <span>Drill-down: {date}</span>
                  {onClearDrillDownDate && (
                    <button
                      type="button"
                      onClick={onClearDrillDownDate}
                      className="ml-1 text-amber-600 hover:text-amber-900 dark:hover:text-white underline cursor-pointer"
                      title="Clear drill-down date"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
            </div>

            <p
              id="analysis-drawer-filters"
              className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5"
              title={filterSummary}
            >
              {filterSummary}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fetchDrawerData(false)}
              disabled={refreshing || loading}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh details"
              aria-label="Refresh drawer records"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing || loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Close details (Esc)"
              aria-label="Close details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 1. Summary Strip with Breakdown Cards */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {category === 'total_employees' && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Total Staff</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">{summary.total ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium">Active on Rolls</div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.active ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-amber-600 font-medium">On Probation</div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-300">{summary.probation ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-rose-600 font-medium">Separated / Exited</div>
                    <div className="text-base font-bold text-rose-700 dark:text-rose-300">{summary.exited ?? 0}</div>
                  </div>
                </>
              )}

              {category === 'active_workforce' && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Active Total</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">{summary.active ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-amber-600 font-medium">On Probation</div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-300">{summary.probation ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium">Active Sessions Today</div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.onFloor ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-blue-600 font-medium">Shifts Covered</div>
                    <div className="text-base font-bold text-blue-700 dark:text-blue-300">{breakdowns.byShift?.length || 2}</div>
                  </div>
                </>
              )}

              {category === 'inactive_exited' && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Total Exited</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">{summary.exitedCount ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-rose-600 font-medium">Resignations</div>
                    <div className="text-base font-bold text-rose-700 dark:text-rose-300">{summary.resigned ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-amber-600 font-medium">Terminations</div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-300">{summary.terminated ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-500 font-medium">F&F Settlement</div>
                    <div className="text-base font-bold text-slate-800 dark:text-slate-200">Pending Review</div>
                  </div>
                </>
              )}

              {(category === 'logged_in' || category === 'logged_in_today') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Unique Accounts</div>
                    <div className="text-base font-bold text-[#1346a1] dark:text-blue-300">{summary.uniqueAccounts ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium">Total Logins</div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.totalLogins ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-2">
                    <div className="text-[11px] text-slate-400 font-medium">Security Policy</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">IP Masked • Session Audit Active</div>
                  </div>
                </>
              )}

              {(category === 'not_logged_in' || category === 'not_logged_in_today') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-amber-600 font-medium">Without Login</div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-300">{summary.notLoggedInCount ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Active Staff</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">{summary.totalActive ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-2">
                    <div className="text-[11px] text-slate-400 font-medium">Recommended Action</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">Issue Web Credentials via Workforce Directory</div>
                  </div>
                </>
              )}

              {(category === 'currently_active') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                      Live Sessions
                    </div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.liveCount ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-amber-600 font-medium">Expiring &lt;15m</div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-300">{summary.expiringWithin15Min ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-2">
                    <div className="text-[11px] text-slate-400 font-medium">Session Invalidation</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">Automatic idle expiration enforced (24h TTL)</div>
                  </div>
                </>
              )}

              {(category === 'sessions' || category === 'sessions_today' || category === 'total-sessions') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Total Sessions</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">{summary.totalSessions ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium">Currently Active</div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.activeSessions ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-2">
                    <div className="text-[11px] text-slate-400 font-medium">Ended / Expired</div>
                    <div className="text-base font-bold text-slate-700 dark:text-slate-300">{summary.endedSessions ?? 0}</div>
                  </div>
                </>
              )}

              {(category === 'login_events' || category === 'total_login_events' || category === 'login-events-period') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Total Attempts</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">{summary.totalEvents ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium">Success</div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.successCount ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-rose-600 font-medium">Failed Attempts</div>
                    <div className="text-base font-bold text-rose-700 dark:text-rose-300">{summary.failureCount ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Status</div>
                    <div className="text-xs text-emerald-600 font-bold">No Brute-Force Alert</div>
                  </div>
                </>
              )}

              {(category === 'present' || category === 'present_today' || category === 'marked-present') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium">Present Staff</div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.presentCount ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Face Biometric</div>
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">{summary.verificationMethods?.Face ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">RFID / Terminal</div>
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">{summary.verificationMethods?.RFID ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Verification Mode</div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 font-bold">Multi-modal Biometric</div>
                  </div>
                </>
              )}

              {(category === 'absent' || category === 'absent_today') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-rose-600 font-medium">Absent Count</div>
                    <div className="text-base font-bold text-rose-700 dark:text-rose-300">{summary.absentCount ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-purple-600 font-medium">With Approved Leave</div>
                    <div className="text-base font-bold text-purple-700 dark:text-purple-300">{summary.onLeaveCount ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-2">
                    <div className="text-[11px] text-slate-400 font-medium">Compliance Check</div>
                    <div className="text-xs text-slate-600 dark:text-slate-300 font-medium">Absences flagged for daily muster reconciliation</div>
                  </div>
                </>
              )}

              {(category === 'late' || category === 'late_today') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-amber-600 font-medium">Late Count</div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-300">{summary.lateCount ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Average Delay</div>
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">{summary.avgMinutesLate ?? 0} mins</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-2">
                    <div className="text-[11px] text-slate-400 font-medium">Longest Recorded Delay</div>
                    <div className="text-base font-bold text-rose-600 dark:text-rose-400">{summary.longestDelay ?? '0 mins'}</div>
                  </div>
                </>
              )}

              {(category === 'on_leave' || category === 'on_leave_today') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-purple-600 font-medium">Approved Leaves</div>
                    <div className="text-base font-bold text-purple-700 dark:text-purple-300">{summary.onLeaveCount ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-3">
                    <div className="text-[11px] text-slate-400 font-medium">Categories Breakdown</div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {summary.byLeaveType && summary.byLeaveType.length > 0 ? (
                        summary.byLeaveType.map((lt: any, idx: number) => (
                          <span key={idx} className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                            {lt.type}: {lt.count}
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-400">Casual / Sick / Privilege</span>
                      )}
                    </div>
                  </div>
                </>
              )}

              {category === 'attendance_rate' && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Numerator (Present)</div>
                    <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">{summary.numerator ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Denominator (Recorded)</div>
                    <div className="text-base font-bold text-slate-800 dark:text-slate-100">{summary.denominator ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700 col-span-2">
                    <div className="text-[11px] text-purple-600 font-medium">Aggregate Attendance Rate</div>
                    <div className="text-base font-black text-purple-700 dark:text-purple-300">{summary.rate ?? '0%'}</div>
                  </div>
                </>
              )}

              {(category === 'attendance_records' || category === 'att-records-period') && (
                <>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-slate-400 font-medium">Total In Range</div>
                    <div className="text-base font-bold text-slate-900 dark:text-white">{summary.totalRecords ?? total}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-emerald-600 font-medium">Present / On-Time</div>
                    <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{summary.presentCount ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-amber-600 font-medium">Late Arrivals</div>
                    <div className="text-base font-bold text-amber-700 dark:text-amber-300">{summary.lateCount ?? 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[11px] text-rose-600 font-medium">Absent Punches</div>
                    <div className="text-base font-bold text-rose-700 dark:text-rose-300">{summary.absentCount ?? 0}</div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 2. Search & Filter Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search by ID, name, hub, designation..."
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:border-[#1346a1]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Filter Chips */}
            <div className="flex items-center gap-1.5 shrink-0 overflow-x-auto pb-1 sm:pb-0">
              <button
                type="button"
                onClick={() => setChipFilter('ALL')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                  chipFilter === 'ALL'
                    ? 'bg-[#1346a1] text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                All
              </button>
              {category === 'login_events' && (
                <>
                  <button
                    type="button"
                    onClick={() => setChipFilter('SUCCESS')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      chipFilter === 'SUCCESS'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Success
                  </button>
                  <button
                    type="button"
                    onClick={() => setChipFilter('FAILED')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      chipFilter === 'FAILED'
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Failed
                  </button>
                </>
              )}
              {category === 'sessions' && (
                <>
                  <button
                    type="button"
                    onClick={() => setChipFilter('ACTIVE')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      chipFilter === 'ACTIVE'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Active
                  </button>
                  <button
                    type="button"
                    onClick={() => setChipFilter('ENDED')}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer ${
                      chipFilter === 'ENDED'
                        ? 'bg-slate-700 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    Ended / Expired
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 3. Error Banner inside drawer */}
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchDrawerData(false)}
                className="font-bold underline cursor-pointer ml-3"
              >
                Retry
              </button>
            </div>
          )}

          {/* 4. Table Container with Sticky Headers */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-left text-xs whitespace-nowrap">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 backdrop-blur-xs text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-700 z-10">
                  {/* Total Employees Columns */}
                  {(category === 'total_employees' || category === 'total-emp' || category === 'all') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Designation</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Employment Type</th>
                      <th className="py-2.5 px-3">Joining Date</th>
                      <th className="py-2.5 px-3">Login Account</th>
                    </tr>
                  )}

                  {/* Active Workforce Columns */}
                  {(category === 'active_workforce' || category === 'active-emp') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Shift</th>
                      <th className="py-2.5 px-3">Employment Type</th>
                      <th className="py-2.5 px-3">Probation End Date</th>
                    </tr>
                  )}

                  {/* Inactive / Exited Columns */}
                  {(category === 'inactive_exited' || category === 'inactive-emp' || category === 'inactive') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Exit Type</th>
                      <th className="py-2.5 px-3">Exit Date</th>
                      <th className="py-2.5 px-3">Settlement Status</th>
                    </tr>
                  )}

                  {/* Logged In Today Columns */}
                  {(category === 'logged_in' || category === 'logged_in_today' || category === 'logged-in-today') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">First Login</th>
                      <th className="py-2.5 px-3">Last Login</th>
                      <th className="py-2.5 px-3">Logins</th>
                      <th className="py-2.5 px-3">Device Type</th>
                      <th className="py-2.5 px-3">IP Address</th>
                    </tr>
                  )}

                  {/* Not Yet Logged In Columns */}
                  {(category === 'not_logged_in' || category === 'not_logged_in_today' || category === 'not-logged-in-today') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Joining Date</th>
                      <th className="py-2.5 px-3">Days Since Joining</th>
                      <th className="py-2.5 px-3">Login Account Status</th>
                    </tr>
                  )}

                  {/* Currently Active Columns */}
                  {(category === 'currently_active' || category === 'currently-active') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Session Start</th>
                      <th className="py-2.5 px-3">Last Activity</th>
                      <th className="py-2.5 px-3">Expires At</th>
                      <th className="py-2.5 px-3">Device Type</th>
                      <th className="py-2.5 px-3">IP Address</th>
                    </tr>
                  )}

                  {/* Sessions Today Columns */}
                  {(category === 'sessions' || category === 'sessions_today' || category === 'total-sessions') && (
                    <tr>
                      <th className="py-2.5 px-3">Session ID</th>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Start Time</th>
                      <th className="py-2.5 px-3">End Time</th>
                      <th className="py-2.5 px-3">Duration</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  )}

                  {/* Total Login Events Columns */}
                  {(category === 'login_events' || category === 'total_login_events' || category === 'login-events-period') && (
                    <tr>
                      <th className="py-2.5 px-3">Event Time</th>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Result</th>
                      <th className="py-2.5 px-3">Failure Reason</th>
                      <th className="py-2.5 px-3">Device Type</th>
                    </tr>
                  )}

                  {/* Present Today Columns */}
                  {(category === 'present' || category === 'present_today' || category === 'marked-present') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Shift</th>
                      <th className="py-2.5 px-3">Punch-In Time</th>
                      <th className="py-2.5 px-3">Verification Method</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  )}

                  {/* Absent Today Columns */}
                  {(category === 'absent' || category === 'absent_today') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Shift</th>
                      <th className="py-2.5 px-3">Last Punch Date</th>
                      <th className="py-2.5 px-3">Leave Status</th>
                    </tr>
                  )}

                  {/* Late Arrivals Today Columns */}
                  {(category === 'late' || category === 'late_today') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Shift Start</th>
                      <th className="py-2.5 px-3">Actual Punch-In</th>
                      <th className="py-2.5 px-3">Minutes Late</th>
                    </tr>
                  )}

                  {/* On Approved Leave Columns */}
                  {(category === 'on_leave' || category === 'on_leave_today') && (
                    <tr>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Leave Type</th>
                      <th className="py-2.5 px-3">From</th>
                      <th className="py-2.5 px-3">To</th>
                      <th className="py-2.5 px-3">Approved By</th>
                    </tr>
                  )}

                  {/* Attendance Rate Columns */}
                  {category === 'attendance_rate' && (
                    <tr>
                      <th className="py-2.5 px-3">Hub Store</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Present</th>
                      <th className="py-2.5 px-3">Recorded</th>
                      <th className="py-2.5 px-3">Rate</th>
                    </tr>
                  )}

                  {/* Attendance Records Columns */}
                  {(category === 'attendance_records' || category === 'att-records-period') && (
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Employee Name</th>
                      <th className="py-2.5 px-3">Hub</th>
                      <th className="py-2.5 px-3">Shift</th>
                      <th className="py-2.5 px-3">Punch-In</th>
                      <th className="py-2.5 px-3">Punch-Out</th>
                      <th className="py-2.5 px-3">Source</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  )}
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading && !refreshing ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="animate-pulse">
                        <td colSpan={9} className="py-4 px-3">
                          <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-full" />
                        </td>
                      </tr>
                    ))
                  ) : filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 px-4 text-center">
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <AlertCircle className="w-8 h-8 stroke-1 text-slate-300 dark:text-slate-600 mb-2" />
                          <p className="font-semibold text-slate-700 dark:text-slate-300">
                            {search
                              ? `No records match "${search}"`
                              : category === 'currently_active'
                              ? 'No active sessions right now'
                              : category === 'login_events'
                              ? 'No login events in this range'
                              : category === 'late'
                              ? 'No late arrivals for this range'
                              : category === 'on_leave'
                              ? 'No approved leave in this range'
                              : 'No records match these filters'}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Try adjusting the date range, store hub, or department filter.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r, idx) => (
                      <tr
                        key={r.id ? `${r.id}-${idx}` : idx}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        {/* 1. Total Employees */}
                        {(category === 'total_employees' || category === 'total-emp' || category === 'all') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.designation}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === 'ACTIVE'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : r.status === 'PROBATION'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{r.employmentType}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.hireDate || '—'}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.hasLoginAccount === 'Yes'
                                    ? 'bg-blue-50 text-[#1346a1] dark:bg-blue-950 dark:text-blue-300'
                                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {r.hasLoginAccount}
                              </span>
                            </td>
                          </>
                        )}

                        {/* 2. Active Workforce */}
                        {(category === 'active_workforce' || category === 'active-emp') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.shiftName}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.employmentType}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.probationEndDate || 'Confirmed'}</td>
                          </>
                        )}

                        {/* 3. Inactive / Exited */}
                        {(category === 'inactive_exited' || category === 'inactive-emp' || category === 'inactive') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                {r.exitType || 'Exited'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{r.exitDate || '—'}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200">
                                {r.settlementStatus || 'Pending Clearance'}
                              </span>
                            </td>
                          </>
                        )}

                        {/* 4. Logged In Today */}
                        {(category === 'logged_in' || category === 'logged_in_today' || category === 'logged-in-today') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.firstLoginTime || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.lastLoginTime || '—'}</td>
                            <td className="py-2.5 px-3 font-bold text-slate-700 dark:text-slate-200">{r.loginCount}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.deviceType}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{r.ipAddress}</td>
                          </>
                        )}

                        {/* 5. Not Yet Logged In */}
                        {(category === 'not_logged_in' || category === 'not_logged_in_today' || category === 'not-logged-in-today') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{r.joiningDate || r.hireDate || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.daysSinceJoining || '—'}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.loginAccountStatus?.includes('Active')
                                    ? 'bg-blue-50 text-[#1346a1] dark:bg-blue-950 dark:text-blue-300'
                                    : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                }`}
                              >
                                {r.loginAccountStatus || 'No Account'}
                              </span>
                            </td>
                          </>
                        )}

                        {/* 6. Currently Active */}
                        {(category === 'currently_active' || category === 'currently-active') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.sessionStart || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.lastActivity || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.expiresAt || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.deviceType}</td>
                            <td className="py-2.5 px-3 font-mono text-slate-400 text-[11px]">{r.ipAddress}</td>
                          </>
                        )}

                        {/* 7. Sessions Today */}
                        {(category === 'sessions' || category === 'sessions_today' || category === 'total-sessions') && (
                          <>
                            <td className="py-2.5 px-3 font-mono text-slate-500 text-[11px]">{r.sessionId}</td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.startTime || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.endTime || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300 font-medium">{r.duration}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === 'Active'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </>
                        )}

                        {/* 8. Total Login Events */}
                        {(category === 'login_events' || category === 'total_login_events' || category === 'login-events-period') && (
                          <>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.eventTime}</td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.result === 'Success'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {r.result}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.failureReason}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.deviceType}</td>
                          </>
                        )}

                        {/* 9. Present Today */}
                        {(category === 'present' || category === 'present_today' || category === 'marked-present') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.shiftName}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold">
                              {r.punchInTime || r.actualLogin || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.verificationMethod}</td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {r.attendanceStatus || 'PRESENT'}
                              </span>
                            </td>
                          </>
                        )}

                        {/* 10. Absent Today */}
                        {(category === 'absent' || category === 'absent_today') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.shiftName}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.lastPunchDate || 'None in Range'}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  r.leaveStatus?.includes('Approved')
                                    ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {r.leaveStatus}
                              </span>
                            </td>
                          </>
                        )}

                        {/* 11. Late Arrivals Today */}
                        {(category === 'late' || category === 'late_today') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.shiftStart}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold">
                              {r.actualPunchIn || r.actualLogin || '—'}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-amber-600 dark:text-amber-400">
                              +{r.minutesLate} mins
                            </td>
                          </>
                        )}

                        {/* 12. On Approved Leave */}
                        {(category === 'on_leave' || category === 'on_leave_today') && (
                          <>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.departmentName}</td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
                                {r.leaveType}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-500">{r.from}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.to}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.approvedBy}</td>
                          </>
                        )}

                        {/* 13. Attendance Rate */}
                        {category === 'attendance_rate' && (
                          <>
                            <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-100">{r.hub}</td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.department}</td>
                            <td className="py-2.5 px-3 font-bold text-emerald-600 dark:text-emerald-400">{r.present}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.recorded}</td>
                            <td className="py-2.5 px-3 font-black text-purple-700 dark:text-purple-300 text-sm">{r.rate}</td>
                          </>
                        )}

                        {/* 14. Attendance Records */}
                        {(category === 'attendance_records' || category === 'att-records-period') && (
                          <>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.date}</td>
                            <td className="py-2.5 px-3 font-mono font-medium text-slate-500">
                              <Link
                                href={`/employees/profile/${r.employeeId || r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.employeeCode || '—'}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                              <Link
                                href={`/employees/profile/${r.employeeId || r.id}`}
                                className="hover:text-[#1346a1] hover:underline"
                                aria-label={`Open complete profile for ${r.fullName}`}
                              >
                                {r.fullName}
                              </Link>
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-700 dark:text-slate-300">
                              {r.locationCode || r.locationName}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.shiftName}</td>
                            <td className="py-2.5 px-3 text-slate-700 dark:text-slate-200 font-mono text-[11px] font-bold">
                              {r.punchIn || '—'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">{r.punchOut || '—'}</td>
                            <td className="py-2.5 px-3 text-slate-500">{r.source}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === 'PRESENT' || r.status === 'FACE_VERIFIED'
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                    : r.status === 'LATE'
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                }`}
                              >
                                {r.status}
                              </span>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer inside table container */}
            {totalPages > 1 && (
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="p-1 rounded-md border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer disabled:cursor-not-allowed"
                    aria-label="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sticky Drawer Footer Action (if matching module view exists) */}
        {footerAction && (
          <div className="sticky bottom-0 z-20 px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Cross-module navigation retains page filter scope
            </span>
            <Link
              href={footerAction.href}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#1346a1] text-white hover:bg-[#0e357e] transition-colors shadow-2xs"
            >
              <span>{footerAction.label}</span>
              <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
