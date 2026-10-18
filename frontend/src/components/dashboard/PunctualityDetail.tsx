'use client';

import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { 
  ArrowLeft, 
  Timer, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Users, 
  TrendingUp, 
  Building2, 
  Bell, 
  RefreshCw, 
  X,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import toast from 'react-hot-toast';

interface PunctualityData {
  metrics: {
    /** Null when no attendance row exists for the day — never a defaulted rate. */
    currentPunctualityRate: number | null;
    onTimeEmployees: number;
    gracePeriodEmployees: number;
    lateArrivalsCount: number;
    targetRate: number;
    warningThreshold: number;
    isWarningTriggered: boolean;
    hasRecords?: boolean;
  };
  lateArrivals: Array<{
    id: string;
    code: string | null;
    name: string | null;
    department: string | null;
    scheduledIn: string | null;
    actualIn: string | null;
    minutesLate: number;
    reason: string | null;
    penaltyApplied: number | null;
    status: string;
  }>;
  gracePeriodStaff: Array<{
    id: string;
    code: string | null;
    name: string | null;
    department: string | null;
    shiftName: string | null;
    scheduledTime: string | null;
    actualPunchTime: string | null;
    graceUsedMinutes: number;
    remainingGraceSeconds: number;
    status: string;
    verdict: string;
    avatar: string;
  }>;
  departmentBreakdown: Array<{
    department: string;
    onTimePct: number | null;
    target: number;
    staffCount: number;
    status: string;
  }>;
  sevenDayTrends: Array<{
    day: string;
    punctualityRate: number;
    target: number;
    lateCount: number;
    isCurrent?: boolean;
  }>;
}

/** Honest placeholder for any metric the backend has not reported. */
const NO_DATA = '—';

function formatRate(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : NO_DATA;
}

function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : NO_DATA;
}

function initialsOf(name: string | null | undefined): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

let punctualityCache: { data: PunctualityData; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000;

export function PunctualityDetail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  locationId?: string;
}) {
  const [data, setData] = useState<PunctualityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'late' | 'grace' | 'departments' | 'trends'>('grace');
  const [lastRefreshedSec, setLastRefreshedSec] = useState(0);
  const [graceCountdowns, setGraceCountdowns] = useState<Record<string, number>>({});
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && punctualityCache && now - punctualityCache.timestamp < CACHE_TTL_MS) {
      setData(punctualityCache.data);
      setLoading(false);
      return;
    }

    try {
      if (!data) setLoading(true);
      const res = await fetch('/api/analytics/punctuality', { credentials: 'include' }).catch(() => null);
      if (res && res.ok) {
        const text = await res.text().catch(() => '');
        let json: any = null;
        try {
          if (text && text.trim().length > 0) {
            json = JSON.parse(text);
          }
        } catch {
          json = null;
        }
        if (json?.success && json?.data) {
          punctualityCache = { data: json.data, timestamp: now };
          setData(json.data);
          setLastRefreshedSec(0);

          // Initialize countdown timers
          const initCountdowns: Record<string, number> = {};
          (Array.isArray(json.data.gracePeriodStaff) ? json.data.gracePeriodStaff : []).forEach((s: any) => {
            initCountdowns[s.id] = s.remainingGraceSeconds;
          });
          setGraceCountdowns(initCountdowns);
        }
      }
    } catch {
      // Gracefully maintain existing cache or state
    } finally {
      setLoading(false);
    }

  }, [data]);

  useEffect(() => {
    if (open) {
      fetchData();
      const interval = setInterval(() => {
        fetchData(true);
      }, 10000);
      const timer = setInterval(() => {
        setLastRefreshedSec(prev => prev + 1);
      }, 1000);

      // Decrement grace countdowns
      const countdownInterval = setInterval(() => {
        setGraceCountdowns(prev => {
          const next = { ...prev };
          Object.keys(next).forEach(k => {
            if (next[k] > 0) next[k] -= 1;
          });
          return next;
        });
      }, 1000);

      return () => {
        clearInterval(interval);
        clearInterval(timer);
        clearInterval(countdownInterval);
      };
    }
  }, [open, fetchData]);

  const handleNotifyHR = () => {
    // No notification endpoint is wired to this action, so the toast must not
    // claim an alert was delivered to a named HR manager.
    toast('Alert not sent: no HR notification service is connected to this action.', { icon: 'ℹ️' });
  };

  const rate = data?.metrics?.currentPunctualityRate ?? null;
  const targetRate = data?.metrics?.targetRate ?? null;
  const lateCount = data?.metrics?.lateArrivalsCount ?? null;
  const graceCount = data?.metrics?.gracePeriodEmployees ?? null;
  const onTimeCount = data?.metrics?.onTimeEmployees ?? null;
  const graceRows = data?.gracePeriodStaff ?? [];
  const lateArrivalsRows = data?.lateArrivals ?? [];
  const deptRows = data?.departmentBreakdown ?? [];
  const trendRows = data?.sevenDayTrends ?? [];
  const todayTrend = trendRows.find((t) => t.isCurrent) ?? trendRows[trendRows.length - 1];

  if (!open) return null;

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#0058be]" />
            <span>Back to Dashboard</span>
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Punctuality Rate &amp; Shift Adherence Analytics</h2>
              <p className="text-[11px] text-slate-500">
                {data?.metrics
                  ? `On-Time ${formatRate(data.metrics.currentPunctualityRate)} • ${formatCount(data.metrics.gracePeriodEmployees)} in Grace Window • ${formatCount(data.metrics.lateArrivalsCount)} Late Today`
                  : 'No punctuality records reported yet'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
            <span>Refreshed {lastRefreshedSec}s ago</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Drawer Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {loading && !data ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="h-24 bg-white rounded-xl border border-slate-200 p-4" />
              ))}
            </div>
            <div className="h-64 bg-white rounded-xl border border-slate-200" />
          </div>
        ) : (
          <>
            {/* Alert System Banner */}
            {typeof rate === 'number' && rate < 90 ? (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl flex items-center justify-between text-xs text-red-900 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  <div>
                    <span className="font-bold">CRITICAL PUNCTUALITY ALERT:</span> Punctuality rate dropped to{' '}
                    {rate}% (below corporate 90% threshold).
                  </div>
                </div>
                <button
                  onClick={handleNotifyHR}
                  className="px-3 py-1.5 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors flex items-center gap-1.5"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Notify HR Manager</span>
                </button>
              </div>
            ) : typeof rate === 'number' ? (
              <div className="bg-emerald-50/70 border border-emerald-200 p-3.5 rounded-xl flex items-center justify-between text-xs text-emerald-900 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <span className="font-bold">On-Time Rate For Today:</span>{' '}
                    <strong>{rate}%</strong> against a corporate target of {formatRate(targetRate)}.{' '}
                    {formatCount(lateCount)} late arrival{lateCount === 1 ? '' : 's'} recorded from punched-in staff.
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                  {rate >= (targetRate ?? 0) ? 'Target Met' : 'Below Target'}
                </span>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex items-center justify-between text-xs text-slate-600 shadow-xs">
                <div className="flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 text-slate-400 shrink-0" />
                  <div>
                    <span className="font-bold">No punctuality data reported:</span> no attendance rows with a
                    scheduled and actual clock-in exist for the selected day, so no rate can be calculated.
                  </div>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                  Awaiting Records
                </span>
              </div>
            )}

            {/* KPI Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Punctuality Rate</span>
                <div className="text-2xl font-bold text-emerald-600 mt-1">{formatRate(rate)}</div>
                <div className="text-[11px] text-slate-500 mt-1 font-semibold">
                  {typeof rate === 'number' && typeof targetRate === 'number'
                    ? rate >= targetRate
                      ? `At or above the ${formatRate(targetRate)} target`
                      : `Below the ${formatRate(targetRate)} target`
                    : 'No data reported'}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Grace Period Utilization</span>
                <div className="text-2xl font-bold text-amber-600 mt-1">{formatCount(graceCount)} Employees</div>
                <div className="text-[11px] text-amber-700 mt-1">Within &lt; 5m arrival window</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Late Arrivals</span>
                <div className="text-2xl font-bold text-slate-900 mt-1">{formatCount(lateCount)}</div>
                <div className="text-[11px] text-slate-500 mt-1 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{lateCount === 0 ? 'None recorded today' : 'Penalties not reported by this feed'}</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">On-Time Clock-Ins</span>
                <div className="text-2xl font-bold text-[#0058be] mt-1">{formatCount(onTimeCount)} Staff</div>
                <div className="text-[11px] text-slate-500 mt-1">Clocked in at or before scheduled time</div>
              </div>
            </div>

            {/* 4 Tabs Navigation Bar */}
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <button
                onClick={() => setActiveTab('grace')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'grace'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Tab 2: Grace Period Utilization ({formatCount(graceCount)} Staff)</span>
              </button>

              <button
                onClick={() => setActiveTab('late')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'late'
                    ? 'bg-[#0058be] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Tab 1: Late Arrivals ({formatCount(lateCount)} Late)</span>
              </button>

              <button
                onClick={() => setActiveTab('departments')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'departments'
                    ? 'bg-[#0058be] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>Tab 3: Department Breakdown</span>
              </button>

              <button
                onClick={() => setActiveTab('trends')}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeTab === 'trends'
                    ? 'bg-[#0058be] text-white shadow-xs'
                    : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Tab 4: 7-Day Adherence Trends</span>
              </button>
            </div>

            {/* TAB 1: Late Arrivals Table */}
            {activeTab === 'late' && (
              lateArrivalsRows.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 text-center space-y-3">
                  <div className="w-12 h-12 rounded-full bg-slate-50 text-slate-500 mx-auto flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-bold text-[#0b1c30]">No late arrivals recorded for today</h4>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {formatCount(lateCount)} attendance rows carry a late clock-in. This reflects only the punches
                    already recorded by the terminals today, not a compliance guarantee.
                  </p>
                  <div className="pt-2 text-[11px] text-slate-400 font-mono">
                    BSC Textiles HR Compliance Policy • 5-min Grace Buffer Protocol
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-5 py-3.5 bg-red-50/60 border-b border-red-200/60">
                    <h4 className="text-xs font-bold text-red-900">
                      Late Arrivals Recorded Today ({lateArrivalsRows.length})
                    </h4>
                    <p className="text-[11px] text-red-700">
                      Derived from attendance rows whose clock-in falls after the grace buffer
                    </p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">Employee</th>
                          <th className="py-2.5 px-4">Department</th>
                          <th className="py-2.5 px-4">Scheduled In</th>
                          <th className="py-2.5 px-4">Actual In</th>
                          <th className="py-2.5 px-4">Minutes Late</th>
                          <th className="py-2.5 px-4">Penalty</th>
                          <th className="py-2.5 px-4">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lateArrivalsRows.map((row, idx) => (
                          <tr key={`${row.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-[#0b1c30]">{row.name || 'Unmatched device ID'}</div>
                              <div className="text-[10px] text-slate-400 font-mono">{row.code || '—'}</div>
                            </td>
                            <td className="py-3 px-4 text-slate-600">{row.department || '—'}</td>
                            <td className="py-3 px-4 font-mono text-slate-600">{row.scheduledIn || '—'}</td>
                            <td className="py-3 px-4 font-mono font-semibold text-slate-700">{row.actualIn || '—'}</td>
                            <td className="py-3 px-4 font-mono font-bold text-red-700">{row.minutesLate}</td>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              {typeof row.penaltyApplied === 'number' ? `₹${row.penaltyApplied}` : 'Not reported'}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200">
                                {row.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}

            {/* TAB 2: Grace Period Utilization (staff still inside the buffer) */}
            {activeTab === 'grace' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 bg-amber-50/50 border-b border-amber-200/60 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-amber-900">
                      Grace Period Buffer Active: {graceRows.length} {graceRows.length === 1 ? 'Employee' : 'Employees'} In Grace Window (-5min window)
                    </h4>
                    <p className="text-[11px] text-amber-700">
                      Countdown timer monitors window before automated Late penalty classification
                    </p>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                    {graceRows.length} Active Grace {graceRows.length === 1 ? 'Usage' : 'Usages'}
                  </span>
                </div>

                <div className="divide-y divide-slate-100">
                  {graceRows.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400">
                      No employee is inside the grace window right now.
                    </div>
                  ) : (
                    graceRows.map((staff, idx) => {
                      const secs = graceCountdowns[staff.id] ?? staff.remainingGraceSeconds;
                      const mins = Math.floor(secs / 60);
                      const remSecs = secs % 60;
                      const formattedTimer = `${mins}m ${String(remSecs).padStart(2, '0')}s`;

                      return (
                        <div key={`${staff.id || idx}-${idx}`} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 transition-colors">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] shrink-0"
                              style={{ backgroundColor: staff.avatar }}
                            >
                              {initialsOf(staff.name)}
                            </div>
                            <div>
                              <div className="font-bold text-xs text-[#0b1c30]">{staff.name || 'Unmatched device ID'}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {staff.code || '—'} • {staff.department || '—'}
                              </div>
                              <div className="text-[11px] text-amber-700 font-medium mt-0.5">
                                {staff.verdict}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 self-end sm:self-auto">
                            <div className="text-right">
                              <span className="text-[10px] text-slate-400 block">Punch Time:</span>
                              <span className="font-mono text-xs font-bold text-slate-700">
                                {staff.actualPunchTime || '—'}
                              </span>
                            </div>

                            {/* Live Countdown Timer */}
                            <div className="px-3 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-right">
                              <span className="text-[9px] font-bold uppercase tracking-wider text-amber-600 block">
                                Timer to Lock
                              </span>
                              <span className="font-mono text-xs font-bold text-amber-900">
                                {secs > 0 ? formattedTimer : 'Resolved'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 3: Department Breakdown Bar Chart */}
            {activeTab === 'departments' && (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-[#0058be]" />
                      Department Punctuality Comparison vs Corporate Benchmark (Target: {formatRate(targetRate ?? 95)}+)
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Computed from today&apos;s attendance rows only; departments without a punch are not listed
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-blue-50 text-[#0058be] text-[10px] font-bold border border-blue-200">
                    Corporate Target: {formatRate(targetRate ?? 95)}
                  </span>
                </div>

                {deptRows.length === 0 ? (
                  <div className="h-56 w-full flex items-center justify-center text-xs text-slate-400">
                    No department punctuality data reported for today.
                  </div>
                ) : (
                  <div className="h-56 w-full pt-2">
                    {isMounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={deptRows} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="department" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                          <Tooltip />
                          <ReferenceLine y={targetRate ?? 95} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `Target ${targetRate ?? 95}%`, fill: '#ef4444', fontSize: 10 }} />
                          <Bar dataKey="onTimePct" fill="#0058be" radius={[6, 6, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: 7-Day Trends Line Chart */}
            {activeTab === 'trends' && (
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                      7-Day Punctuality Rate Trend{todayTrend ? ` (Latest Reported Day: ${todayTrend.punctualityRate}%)` : ''}
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Daily on-time share calculated from stored attendance records
                    </p>
                  </div>
                  <span className="px-2.5 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                    Today: {todayTrend ? formatRate(todayTrend.punctualityRate) : NO_DATA}
                  </span>
                </div>

                {trendRows.length === 0 ? (
                  <div className="h-56 w-full flex items-center justify-center text-xs text-slate-400">
                    No punctuality history reported for the last 7 days.
                  </div>
                ) : (
                  <div className="h-56 w-full pt-2">
                    {isMounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendRows} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                          <Tooltip />
                          <ReferenceLine y={targetRate ?? 95} stroke="#f59e0b" strokeDasharray="3 3" label={{ value: `Target ${targetRate ?? 95}%`, fill: '#f59e0b', fontSize: 10 }} />
                          <Line type="monotone" dataKey="punctualityRate" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}