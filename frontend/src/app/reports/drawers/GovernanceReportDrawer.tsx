'use client';

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export type GovernanceMetric = 'muster' | 'face' | 'incentives' | 'compliance';

export interface GovernanceDrawerFilters {
  locationId: string;
  locationName: string;
  month: string;
  monthLabel: string;
  departmentId: string;
  departmentName: string;
  shiftId: string;
  shiftName: string;
  status: string;
}

interface GovernanceReportDrawerProps {
  metric: GovernanceMetric;
  filters: GovernanceDrawerFilters;
  empIdByCode: Record<string, string>;
  onClose: () => void;
  onSwitchTab: (tabId: 'attendance' | 'face' | 'incentives' | 'payroll') => void;
}

/** Indian currency formatter: ₹1,84,500 */
export function formatINR(val: number): string {
  return '₹' + Math.round(val).toLocaleString('en-IN');
}

const DASH = '—';
const NOT_RECORDED = 'Not recorded';
const NOT_MEASURED = 'Not measured';

const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** First/last day of the drawer's `YYYY-MM` month filter. */
function monthWindow(month: string): { start: string; end: string } {
  const [yearNum, monthNum] = String(month || '').split('-').map(Number);
  if (!yearNum || !monthNum || monthNum < 1 || monthNum > 12) {
    const now = new Date();
    return { start: toDateKey(new Date(now.getFullYear(), now.getMonth(), 1)), end: toDateKey(now) };
  }
  return {
    start: `${yearNum}-${String(monthNum).padStart(2, '0')}-01`,
    end: toDateKey(new Date(yearNum, monthNum, 0)),
  };
}

const fmtStamp = (value: unknown): string => {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return DASH;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
};

const fmtDay = (value: unknown): string => {
  if (!value) return DASH;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const num = (value: unknown): number => {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Counts of `{label, value}` built from the rows the server actually returned. */
function groupCounts(
  rows: any[],
  pick: (row: any) => string | null,
  format?: (label: string, count: number) => string
) {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = pick(row);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => ({ label, value: format ? format(label, count) : String(count) }));
}

/**
 * The drawer only ever shows rows read from a real endpoint:
 *   muster       GET /reports/attendance-summary
 *   face         GET /face-verification (stored face transactions)
 *   incentives   GET /incentives/transactions
 *   compliance   GET /payroll/runs
 * A field the endpoint does not return is rendered as a placeholder — never as a
 * demonstration name, code, percentage, latency or rupee amount.
 */
function useDrawerData(metric: GovernanceMetric, filters: GovernanceDrawerFilters) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [summary, setSummary] = useState<Record<string, any>>({});
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    setLoading(true);
    setError(null);
    setRestricted(false);

    const { start, end } = monthWindow(filters.month);
    const q = new URLSearchParams();
    if (filters.locationId && filters.locationId !== 'all' && filters.locationId !== 'ALL') {
      q.set('locationId', filters.locationId);
    }
    if (metric === 'muster') {
      if (filters.departmentId && filters.departmentId !== 'all') q.set('departmentId', filters.departmentId);
      if (filters.shiftId && filters.shiftId !== 'all') q.set('shiftId', filters.shiftId);
      q.set('startDate', start);
      q.set('endDate', end);
    }

    try {
      let res: any = null;
      if (metric === 'muster') {
        res = await api.get(`/reports/attendance-summary?${q.toString()}`, { signal });
      } else if (metric === 'face') {
        q.set('limit', '100');
        q.set('startDate', start);
        q.set('endDate', end);
        res = await api.get(`/face-verification?${q.toString()}`, { signal });
      } else if (metric === 'incentives') {
        q.set('limit', '100');
        q.set('startDate', start);
        q.set('endDate', end);
        res = await api.get(`/incentives/transactions?${q.toString()}`, { signal });
      } else {
        res = await api.get('/payroll/runs?limit=50', { signal });
      }

      const data = res?.data || {};
      const hubLabel = filters.locationName || 'All hubs';

      if (metric === 'muster') {
        const list: any[] = data.summary || data.data || [];
        const mapped = list.map((r) => {
          const totalDays = num(r.totalDays);
          const absent = num(r.absent);
          const present = num(r.present);
          return {
            id: r.employeeCode || r.employeeId,
            employeeId: r.employeeId || null,
            code: r.employeeCode || DASH,
            name: r.employeeName || DASH,
            department: r.department || DASH,
            hub: hubLabel,
            totalDays,
            present,
            absent,
            late: num(r.late),
            earlyExit: num(r.early),
            overtime: num(r.overtime),
            workingHours: num(r.totalWorkingHours),
            attPercent: totalDays > 0 ? Math.round(((totalDays - absent) / totalDays) * 1000) / 10 : null,
          };
        });
        const sum = (pick: (row: any) => number) => mapped.reduce((acc, r) => acc + pick(r), 0);
        const totalDays = sum((r) => num(r.totalDays));
        const totalAbsent = sum((r) => num(r.absent));
        setRows(mapped);
        setSummary({
          attendancePct: totalDays > 0 ? `${Math.round(((totalDays - totalAbsent) / totalDays) * 1000) / 10}%` : null,
          totalPresent: sum((r) => num(r.present)),
          totalAbsent,
          totalLate: sum((r) => num(r.late)),
          totalEarlyExit: sum((r) => num(r.earlyExit)),
          overtimeHours: `${sum((r) => num(r.overtime)).toFixed(1)} hrs`,
          hubsLabel: hubLabel,
          breakdownHub: [],
          breakdownDept: groupCounts(
            mapped,
            (r) => (r.attPercent === null ? null : r.department),
            (label) => {
              const deptRows = mapped.filter((r) => r.department === label);
              const d = deptRows.reduce((acc, r) => acc + num(r.totalDays), 0);
              const a = deptRows.reduce((acc, r) => acc + num(r.absent), 0);
              return d > 0 ? `${Math.round(((d - a) / d) * 1000) / 10}%` : DASH;
            }
          ),
        });
      } else if (metric === 'face') {
        const list: any[] = data.verifications || data.rows || [];
        const mapped = list.map((v) => {
          const verified = String(v.status || v.result || '').toUpperCase() === 'VERIFIED';
          const score = typeof v.score === 'number' && Number.isFinite(v.score) ? v.score : null;
          return {
            id: v.id,
            employeeId: v.employeeId || null,
            terminal: v.deviceId || NOT_RECORDED,
            hub: v.locationName || hubLabel,
            scanTime: fmtStamp(v.attemptedAt || v.verifiedAt),
            code: v.employeeCode || DASH,
            name: v.employeeName || DASH,
            result: verified ? 'Verified' : 'Failed',
            // Only a score the stored transaction actually carries is shown; the
            // website never invents a face-match percentage.
            confidence: score === null ? 'Not reported' : `${score.toFixed(1)}%`,
            latency: null,
          };
        });
        const failed = mapped.filter((r) => r.result === 'Failed').length;
        const pageCount = mapped.length;
        setRows(mapped);
        setSummary({
          matchRate: pageCount > 0 ? `${Math.round(((pageCount - failed) / pageCount) * 1000) / 10}% Verified` : null,
          totalScans: typeof data.total === 'number' ? data.total : pageCount,
          failedMatches: failed,
          avgLatency: null,
          slowestTerminal: null,
          breakdownTerminal: groupCounts(mapped, (r) => (r.terminal === NOT_RECORDED ? null : r.terminal), (_label, count) => `${count} scan(s)`),
          breakdownHub: groupCounts(mapped, (r) => r.hub, (_label, count) => `${count} scan(s)`),
        });
      } else if (metric === 'incentives') {
        const list: any[] = data.transactions || [];
        const mapped = list.map((t) => ({
          id: t.id,
          employeeId: t.employeeId || t.employee?.id || null,
          code: t.employee?.employeeCode || DASH,
          name: t.employee?.fullName || DASH,
          department: t.department?.name || NOT_RECORDED,
          hub: t.location?.name || hubLabel,
          type: t.incentiveRule?.name || NOT_RECORDED,
          basis: t.calculationBasis || NOT_RECORDED,
          amount: num(t.calculatedAmount),
          approvalStatus: String(t.status || '').replace(/_/g, ' ') || DASH,
          paymentStatus: t.payrollRunId ? 'In a payroll run' : 'Not in a payroll run',
          transactionDate: fmtDay(t.transactionDate),
          rawStatus: t.status,
        }));
        const total = mapped.reduce((acc, r) => acc + r.amount, 0);
        const approved = mapped.filter((r) => r.rawStatus === 'APPROVED').reduce((acc, r) => acc + r.amount, 0);
        const pending = mapped.filter((r) => r.rawStatus === 'PENDING_APPROVAL').reduce((acc, r) => acc + r.amount, 0);
        setRows(mapped);
        setSummary({
          totalAccrued: mapped.length > 0 ? formatINR(total) : null,
          eligibleStaff: new Set(mapped.map((r) => r.employeeId).filter(Boolean)).size,
          totalPaid: mapped.length > 0 ? formatINR(approved) : null,
          totalPending: mapped.length > 0 ? formatINR(pending) : null,
          avgPerEmp: mapped.length > 0 ? formatINR(Math.round(total / mapped.length)) : null,
          breakdownDept: groupCounts(mapped, (r) => (r.department === NOT_RECORDED ? null : r.department), (_label, count) => `${count} entry(s)`),
          breakdownHub: groupCounts(mapped, (r) => r.type, (_label, count) => `${count} entry(s)`),
        });
      } else {
        const list: any[] = data.runs || (Array.isArray(data) ? data : []);
        const mapped = list.map((r) => ({
          id: r.id,
          runId: r.id,
          periodStart: fmtDay(r.periodStart),
          periodEnd: fmtDay(r.periodEnd),
          status: r.status || DASH,
          processedBy: r.processedBy || NOT_RECORDED,
          processedAt: fmtStamp(r.processedAt),
          items: Array.isArray(r.items) ? r.items.length : null,
        }));
        const latest = mapped[0] || null;
        setRows(mapped);
        setSummary({
          runsLoaded: mapped.length,
          latestStatus: latest ? latest.status : null,
          latestPeriod: latest ? `${latest.periodStart} → ${latest.periodEnd}` : null,
          latestProcessedAt: latest && latest.processedAt !== DASH ? latest.processedAt : null,
          totalItems: mapped.reduce((acc, r) => acc + num(r.items), 0),
          breakdownStatus: groupCounts(mapped, (r) => r.status, (_label, count) => `${count} run(s)`),
        });
      }
    } catch (err: any) {
      if (err?.name === 'CanceledError' || err?.name === 'AbortError' || axiosIsCancel(err)) return;
      if (err?.response?.status === 403) {
        setRestricted(true);
        setError(null);
      } else {
        setError(err?.response?.data?.error || 'Could not load the records for this report.');
      }
      setRows([]);
      setSummary({});
    } finally {
      setLoading(false);
    }
  }, [metric, filters]);

  useEffect(() => {
    load();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [load]);

  return { loading, error, restricted, rows, summary, reload: load };
}

function axiosIsCancel(err: any): boolean {
  return Boolean(err?.code === 'ERR_CANCELED' || err?.__CANCEL__);
}

export function GovernanceReportDrawer({
  metric,
  filters,
  empIdByCode,
  onClose,
  onSwitchTab,
}: GovernanceReportDrawerProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChip, setActiveChip] = useState('All');
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const { loading, error, restricted, rows: records, summary: summaryData, reload } = useDrawerData(metric, filters);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (mounted && closeBtnRef.current) closeBtnRef.current.focus();
  }, [mounted]);

  const handleEmployeeClick = useCallback(
    (employeeId?: string, employeeCode?: string) => {
      const resolvedId = employeeId || (employeeCode && empIdByCode[employeeCode]) || employeeCode;
      if (resolvedId && resolvedId !== DASH) {
        router.push(`/employees/profile/${resolvedId}`);
      } else {
        toast('Employee profile dossier not found', { icon: 'ℹ️' });
      }
    },
    [empIdByCode, router]
  );

  const meta = useMemo(() => {
    switch (metric) {
      case 'muster':
        return {
          title: 'Muster Attendance Details',
          tabId: 'attendance' as const,
          tabLabel: 'Attendance Muster Roll (Form T)',
          chips: ['All', 'Below 95%', 'Late Only', 'Absent Only'],
          emptyMsg: 'No attendance records returned for these filters',
          source: 'GET /reports/attendance-summary',
        };
      case 'face':
        return {
          title: 'Face Verification Transactions',
          tabId: 'face' as const,
          tabLabel: 'Biometric Face Telemetry',
          chips: ['All', 'Verified', 'Failed'],
          emptyMsg: 'No stored face verification transactions for these filters',
          source: 'GET /face-verification',
        };
      case 'incentives':
        return {
          title: 'Incentive Transactions Details',
          tabId: 'incentives' as const,
          tabLabel: 'Incentives Ledger',
          chips: ['All', 'Approved', 'Pending Approval', 'Rejected'],
          emptyMsg: 'No incentive records for this month',
          source: 'GET /incentives/transactions',
        };
      case 'compliance':
        return {
          title: 'Statutory Payroll Runs',
          tabId: 'payroll' as const,
          tabLabel: 'Statutory Payroll',
          chips: ['All'],
          emptyMsg: 'No payroll runs returned for this account',
          source: 'GET /payroll/runs',
        };
    }
  }, [metric]);

  const handleRefresh = () => {
    setRefreshing(true);
    reload().finally(() => setRefreshing(false));
  };

  const filteredRecords = useMemo(() => {
    let result = records;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((r) =>
        [r.name, r.code, r.department, r.hub, r.terminal, r.id, r.type, r.basis, r.status, r.approvalStatus]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }

    if (activeChip !== 'All') {
      if (metric === 'muster') {
        if (activeChip === 'Below 95%') result = result.filter((r) => (r.attPercent ?? 100) < 95);
        if (activeChip === 'Late Only') result = result.filter((r) => num(r.late) > 0);
        if (activeChip === 'Absent Only') result = result.filter((r) => num(r.absent) > 0);
      } else if (metric === 'face') {
        if (activeChip === 'Verified') result = result.filter((r) => r.result === 'Verified');
        if (activeChip === 'Failed') result = result.filter((r) => r.result === 'Failed');
      } else if (metric === 'incentives') {
        if (activeChip === 'Approved') result = result.filter((r) => r.rawStatus === 'APPROVED');
        if (activeChip === 'Pending Approval') result = result.filter((r) => r.rawStatus === 'PENDING_APPROVAL');
        if (activeChip === 'Rejected') result = result.filter((r) => r.rawStatus === 'REJECTED');
      }
    }

    return result;
  }, [records, searchQuery, activeChip, metric]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-labelledby="gov-rep-drawer-title" className="fixed inset-0 z-50 flex justify-end">
      <div onClick={onClose} className="fixed inset-0 bg-black/50 transition-opacity cursor-pointer" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-[740px] md:w-[80vw] lg:max-w-[740px] h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col overflow-hidden border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-200">
        {/* Sticky Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="gov-rep-drawer-title"
                  className="text-lg font-bold text-slate-900 dark:text-slate-100 font-display tracking-tight"
                >
                  {meta.title}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-[#f7eeee] text-[#722f37] dark:bg-slate-800 dark:text-slate-300 border border-[#dfc2c4]">
                  {records.length} {records.length === 1 ? 'Record' : 'Records'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Rows read from <span className="font-mono">{meta.source}</span> for the active filters
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={loading || refreshing}
                aria-label="Refresh drawer data"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                title="Refresh report records"
              >
                <span className={`material-symbols-outlined text-[20px] ${refreshing ? 'animate-spin' : ''}`}>refresh</span>
              </button>

              <button
                ref={closeBtnRef}
                type="button"
                onClick={onClose}
                aria-label="Close details"
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#722f37]"
              >
                <span className="material-symbols-outlined text-[22px]">close</span>
              </button>
            </div>
          </div>

          {/* Active Filter Summary Bar */}
          <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80">
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mr-1">Active Filters:</span>
            {[
              { icon: 'store', text: filters.locationName },
              { icon: 'calendar_month', text: filters.monthLabel },
              { icon: 'badge', text: filters.departmentName },
              { icon: 'schedule', text: filters.shiftName },
              { icon: 'verified_user', text: filters.status === 'all' ? 'All Statuses' : filters.status },
            ].map((chip) => (
              <span
                key={chip.icon}
                className="inline-flex items-center gap-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded-md"
              >
                <span className="material-symbols-outlined text-[12px] text-slate-400">{chip.icon}</span>
                {chip.text}
              </span>
            ))}
          </div>
        </div>

        {/* Scrollable Drawer Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {restricted ? (
            <div className="p-8 text-center bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl">
              <span className="material-symbols-outlined text-4xl text-amber-600 mb-2">lock</span>
              <h3 className="text-sm font-bold text-amber-900 dark:text-amber-200">Restricted by role</h3>
              <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                Your user role is not authorized to read this report endpoint.
              </p>
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 rounded-xl">
              <span className="material-symbols-outlined text-4xl text-rose-600 mb-2">cloud_off</span>
              <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">Report data unavailable</h3>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-1">{error}</p>
            </div>
          ) : loading && !refreshing ? (
            <div className="space-y-4 animate-pulse">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-20 bg-slate-100 dark:bg-slate-800 rounded-xl" />
                ))}
              </div>
              <div className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg" />
              <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded-xl" />
            </div>
          ) : (
            <>
              {/* Summary strips — every number is counted from the loaded rows */}
              {metric === 'muster' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                    <Stat label="Muster Health" value={summaryData.attendancePct ?? DASH} sub={summaryData.hubsLabel} accent />
                    <Stat label="Total Present" value={fmt(summaryData.totalPresent)} sub="Days Logged" tone="emerald" />
                    <Stat label="Total Absent" value={fmt(summaryData.totalAbsent)} sub="Days" tone="red" />
                    <Stat label="Late Arrivals" value={fmt(summaryData.totalLate)} sub="Days" tone="amber" />
                    <Stat label="Early Exit" value={fmt(summaryData.totalEarlyExit)} sub="Days" />
                    <Stat label="Overtime" value={summaryData.overtimeHours ?? DASH} sub="Approved OT" tone="indigo" />
                  </div>
                  <Breakdowns
                    left={{ title: 'Attendance % by Store Hub', items: summaryData.breakdownHub }}
                    right={{ title: 'Attendance % by Department', items: summaryData.breakdownDept }}
                  />
                </div>
              )}

              {metric === 'face' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    <Stat
                      label="Verified Share (loaded page)"
                      value={summaryData.matchRate ?? DASH}
                      sub={`${records.length} row(s) on this page`}
                      accent
                    />
                    <Stat label="Total Stored Scans" value={fmt(summaryData.totalScans)} sub="Server count" />
                    <Stat label="Failed Verifications" value={fmt(summaryData.failedMatches)} sub="On this page" tone="amber" />
                    <Stat label="Scan Latency" value={NOT_MEASURED} sub="Device does not report it" />
                    <Stat label="Terminal Column" value="Device ID" sub="As stored on the transaction" />
                  </div>
                  <Breakdowns
                    left={{ title: 'Scans by Device ID', items: summaryData.breakdownTerminal }}
                    right={{ title: 'Scans by Store Hub', items: summaryData.breakdownHub }}
                  />
                </div>
              )}

              {metric === 'incentives' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
                    <Stat label="Amount (loaded rows)" value={summaryData.totalAccrued ?? DASH} sub={filters.monthLabel} accent />
                    <Stat label="Employees With Entries" value={fmt(summaryData.eligibleStaff)} sub="Distinct on this page" />
                    <Stat label="Approved Amount" value={summaryData.totalPaid ?? DASH} sub="status = APPROVED" tone="emerald" />
                    <Stat label="Pending Approval" value={summaryData.totalPending ?? DASH} sub="status = PENDING_APPROVAL" tone="amber" />
                    <Stat label="Avg per Entry" value={summaryData.avgPerEmp ?? DASH} sub="Loaded rows only" />
                  </div>
                  <Breakdowns
                    left={{ title: 'Entries by Incentive Rule', items: summaryData.breakdownDept }}
                    right={{ title: 'Entries by Store Hub', items: summaryData.breakdownHub }}
                  />
                </div>
              )}

              {metric === 'compliance' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <Stat label="Runs Loaded" value={fmt(summaryData.runsLoaded)} sub="GET /payroll/runs" />
                    <Stat label="Latest Run Status" value={summaryData.latestStatus ?? DASH} sub="As stored" tone="emerald" />
                    <Stat label="Latest Period" value={summaryData.latestPeriod ?? DASH} sub="periodStart → periodEnd" />
                    <Stat label="Payslip Rows in Loaded Runs" value={fmt(summaryData.totalItems)} sub="Counted from items" />
                  </div>
                  <Breakdowns
                    left={{ title: 'Runs by Status', items: summaryData.breakdownStatus }}
                    right={null}
                  />
                </div>
              )}

              {/* Search + chips */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                <div className="relative flex-1 max-w-sm">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-[18px] text-slate-400">search</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by code, name, hub, terminal..."
                    className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs rounded-lg border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-[#722f37] transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                  {meta.chips.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => setActiveChip(chip)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
                        activeChip === chip
                          ? 'bg-[#722f37] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Detail table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-xs">
                <div className="overflow-x-auto max-h-[360px] scrollbar-thin">
                  <table className="w-full text-left font-body-sm text-xs whitespace-nowrap">
                    <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[11px] font-bold border-b border-slate-200 dark:border-slate-700">
                      {metric === 'muster' && (
                        <tr>
                          <th className="py-2.5 px-3.5">Employee ID</th>
                          <th className="py-2.5 px-3.5">Employee Name</th>
                          <th className="py-2.5 px-3.5">Department</th>
                          <th className="py-2.5 px-3.5">Store Hub</th>
                          <th className="py-2.5 px-3.5 text-center">Total Days</th>
                          <th className="py-2.5 px-3.5 text-center">Present</th>
                          <th className="py-2.5 px-3.5 text-center">Absent</th>
                          <th className="py-2.5 px-3.5 text-center">Late</th>
                          <th className="py-2.5 px-3.5 text-center">Early Exit</th>
                          <th className="py-2.5 px-3.5 text-center">Overtime</th>
                          <th className="py-2.5 px-3.5 text-center">Working Hrs</th>
                          <th className="py-2.5 px-3.5">Attendance %</th>
                        </tr>
                      )}
                      {metric === 'face' && (
                        <tr>
                          <th className="py-2.5 px-3.5">Device ID</th>
                          <th className="py-2.5 px-3.5">Store Hub</th>
                          <th className="py-2.5 px-3.5">Verified At</th>
                          <th className="py-2.5 px-3.5">Employee ID</th>
                          <th className="py-2.5 px-3.5">Employee Name</th>
                          <th className="py-2.5 px-3.5 text-center">Result</th>
                          <th className="py-2.5 px-3.5 text-center">Stored Score</th>
                          <th className="py-2.5 px-3.5 text-center">Latency</th>
                        </tr>
                      )}
                      {metric === 'incentives' && (
                        <tr>
                          <th className="py-2.5 px-3.5">Employee ID</th>
                          <th className="py-2.5 px-3.5">Employee Name</th>
                          <th className="py-2.5 px-3.5">Incentive Rule</th>
                          <th className="py-2.5 px-3.5">Store Hub</th>
                          <th className="py-2.5 px-3.5">Calculation Basis</th>
                          <th className="py-2.5 px-3.5">Transaction Date</th>
                          <th className="py-2.5 px-3.5 text-right">Amount (₹)</th>
                          <th className="py-2.5 px-3.5 text-center">Status</th>
                          <th className="py-2.5 px-3.5 text-center">Payroll Link</th>
                        </tr>
                      )}
                      {metric === 'compliance' && (
                        <tr>
                          <th className="py-2.5 px-3.5">Run ID</th>
                          <th className="py-2.5 px-3.5">Period Start</th>
                          <th className="py-2.5 px-3.5">Period End</th>
                          <th className="py-2.5 px-3.5 text-center">Status</th>
                          <th className="py-2.5 px-3.5">Processed By</th>
                          <th className="py-2.5 px-3.5">Processed At</th>
                          <th className="py-2.5 px-3.5 text-center">Payslip Rows</th>
                        </tr>
                      )}
                    </thead>

                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredRecords.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="py-12 text-center text-slate-500">
                            {meta.emptyMsg}
                          </td>
                        </tr>
                      ) : (
                        filteredRecords.map((row, idx) => (
                          <tr key={row.id || idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                            {metric === 'muster' && (
                              <>
                                <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500">{row.code}</td>
                                <td className="py-2 px-3.5 font-semibold text-slate-900 dark:text-slate-100">
                                  <NameButton
                                    name={row.name}
                                    onClick={() => handleEmployeeClick(row.employeeId, row.code === DASH ? undefined : row.code)}
                                  />
                                </td>
                                <td className="py-2 px-3.5 text-slate-600 dark:text-slate-300">{row.department}</td>
                                <td className="py-2 px-3.5 text-slate-600 dark:text-slate-300">{row.hub}</td>
                                <td className="py-2 px-3.5 text-center font-mono font-medium">{row.totalDays}</td>
                                <td className="py-2 px-3.5 text-center font-mono font-bold text-emerald-700">{row.present}</td>
                                <td className="py-2 px-3.5 text-center font-mono font-bold text-red-600">{row.absent}</td>
                                <td className="py-2 px-3.5 text-center font-mono font-bold text-amber-600">{row.late}</td>
                                <td className="py-2 px-3.5 text-center font-mono text-slate-600">{row.earlyExit}</td>
                                <td className="py-2 px-3.5 text-center font-mono text-indigo-600">{row.overtime}h</td>
                                <td className="py-2 px-3.5 text-center font-mono text-slate-700">{row.workingHours}h</td>
                                <td className="py-2 px-3.5">
                                  {row.attPercent === null ? (
                                    <span className="font-mono text-slate-400">{DASH}</span>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <div className="w-16 bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full ${row.attPercent >= 95 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                          style={{ width: `${Math.max(0, Math.min(100, row.attPercent))}%` }}
                                        />
                                      </div>
                                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{row.attPercent}%</span>
                                    </div>
                                  )}
                                </td>
                              </>
                            )}

                            {metric === 'face' && (
                              <>
                                <td className="py-2 px-3.5 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                  {row.terminal}
                                </td>
                                <td className="py-2 px-3.5 text-slate-600 dark:text-slate-300">{row.hub}</td>
                                <td className="py-2 px-3.5 text-slate-500 font-mono text-[11px]">{row.scanTime}</td>
                                <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500">{row.code}</td>
                                <td className="py-2 px-3.5 font-semibold text-slate-900 dark:text-slate-100">
                                  <NameButton
                                    name={row.name}
                                    onClick={() => handleEmployeeClick(row.employeeId, row.code === DASH ? undefined : row.code)}
                                  />
                                </td>
                                <td className="py-2 px-3.5 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                      row.result === 'Verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    {row.result}
                                  </span>
                                </td>
                                <td className="py-2 px-3.5 text-center font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {row.confidence}
                                </td>
                                <td className="py-2 px-3.5 text-center font-mono text-slate-400">{NOT_MEASURED}</td>
                              </>
                            )}

                            {metric === 'incentives' && (
                              <>
                                <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500">{row.code}</td>
                                <td className="py-2 px-3.5 font-semibold text-slate-900 dark:text-slate-100">
                                  <NameButton
                                    name={row.name}
                                    onClick={() => handleEmployeeClick(row.employeeId, row.code === DASH ? undefined : row.code)}
                                  />
                                </td>
                                <td className="py-2 px-3.5 text-slate-600 dark:text-slate-300">{row.type}</td>
                                <td className="py-2 px-3.5 text-slate-600 dark:text-slate-300">{row.hub}</td>
                                <td className="py-2 px-3.5 text-slate-500">{row.basis}</td>
                                <td className="py-2 px-3.5 text-slate-500 font-mono text-[11px]">{row.transactionDate}</td>
                                <td className="py-2 px-3.5 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                                  {formatINR(row.amount)}
                                </td>
                                <td className="py-2 px-3.5 text-center">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                      row.rawStatus === 'APPROVED'
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : row.rawStatus === 'REJECTED'
                                        ? 'bg-rose-100 text-rose-800'
                                        : 'bg-amber-100 text-amber-800'
                                    }`}
                                  >
                                    {row.approvalStatus}
                                  </span>
                                </td>
                                <td className="py-2 px-3.5 text-center text-[11px] text-slate-600 dark:text-slate-300">
                                  {row.paymentStatus}
                                </td>
                              </>
                            )}

                            {metric === 'compliance' && (
                              <>
                                <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500">{row.runId}</td>
                                <td className="py-2 px-3.5 text-slate-800 dark:text-slate-200 font-semibold">{row.periodStart}</td>
                                <td className="py-2 px-3.5 text-slate-800 dark:text-slate-200 font-semibold">{row.periodEnd}</td>
                                <td className="py-2 px-3.5 text-center">
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                                    {row.status}
                                  </span>
                                </td>
                                <td className="py-2 px-3.5 text-slate-600 dark:text-slate-300">{row.processedBy}</td>
                                <td className="py-2 px-3.5 font-mono text-[11px] text-slate-500">{row.processedAt}</td>
                                <td className="py-2 px-3.5 text-center font-mono text-slate-700 dark:text-slate-300">
                                  {row.items === null ? DASH : row.items}
                                </td>
                              </>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="flex-shrink-0 px-6 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500 font-mono">
            Showing {filteredRecords.length} records matching drawer filters
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onSwitchTab(meta.tabId);
                onClose();
              }}
              className="px-4 py-1.5 text-xs font-bold text-white bg-[#722f37] hover:bg-[#5b232a] rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <span>Open {meta.tabLabel} tab</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === '') return DASH;
  return String(value);
}

function Stat({
  label,
  value,
  sub,
  tone,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'emerald' | 'red' | 'amber' | 'indigo';
  accent?: boolean;
}) {
  const toneClass =
    tone === 'emerald'
      ? 'text-emerald-700 dark:text-emerald-400'
      : tone === 'red'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'amber'
      ? 'text-amber-600 dark:text-amber-400'
      : tone === 'indigo'
      ? 'text-indigo-600 dark:text-indigo-400'
      : 'text-slate-800 dark:text-slate-200';
  return (
    <div className="p-3 bg-[#fbfbfa] dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700">
      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
      <div
        className={`text-xl font-bold font-mono mt-0.5 ${
          accent ? 'text-[#722f37] dark:text-[#cb9da2]' : toneClass
        }`}
      >
        {value}
      </div>
      {sub ? <span className="text-[10px] text-slate-500">{sub}</span> : null}
    </div>
  );
}

function Breakdowns({
  left,
  right,
}: {
  left: { title: string; items?: Array<{ label: string; value: string }> } | null;
  right: { title: string; items?: Array<{ label: string; value: string }> } | null;
}) {
  const panels = [left, right].filter(Boolean) as Array<{ title: string; items?: any[] }>;
  if (panels.length === 0) return null;
  return (
    <div className={panels.length === 1 ? 'grid grid-cols-1 gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-3'}>
      {panels.map((panel) => (
        <div
          key={panel.title}
          className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/70 dark:border-slate-700 text-xs"
        >
          <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px] block mb-2">
            {panel.title}
          </span>
          {panel.items && panel.items.length > 0 ? (
            <div className="space-y-1.5">
              {panel.items.map((b: any, idx: number) => (
                <div key={`${b.label}-${idx}`} className="flex justify-between items-center text-slate-600 dark:text-slate-400">
                  <span className="truncate">{b.label}</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{b.value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400">No data reported by the endpoint for this breakdown.</p>
          )}
        </div>
      ))}
    </div>
  );
}

function NameButton({ name, onClick }: { name: string; onClick: () => void }) {
  if (!name || name === DASH) return <span className="text-slate-400">{DASH}</span>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open complete profile for ${name}`}
      className="hover:text-[#722f37] hover:underline text-left cursor-pointer focus:outline-none focus:underline"
    >
      {name}
    </button>
  );
}
