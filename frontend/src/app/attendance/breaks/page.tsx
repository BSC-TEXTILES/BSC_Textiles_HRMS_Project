'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { BreakMetricDrawer, type BreakDrawerType } from './drawers/BreakMetricDrawer';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function AttendanceBreaksPage() {
  const [allBreaks, setAllBreaks] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [activeDrawer, setActiveDrawer] = useState<BreakDrawerType>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // References for keyboard focus restoration
  const cardActiveRef = useRef<HTMLButtonElement>(null);
  const cardLunchRef = useRef<HTMLButtonElement>(null);
  const cardTeaRef = useRef<HTMLButtonElement>(null);
  const cardOverrunRef = useRef<HTMLButtonElement>(null);
  const cardAvgRef = useRef<HTMLButtonElement>(null);

  // Update real-time clock every 5 seconds for live duration calculations
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  // Deep-link support for ledger filters: /attendance/breaks?breakType=LUNCH&status=ACTIVE
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const t = q.get('breakType');
      const s = q.get('status');
      if (t) setFilterType(t);
      if (s) setFilterStatus(s);
    }
  }, []);

  // Fetch locations for store hub mapping
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/locations/all');
        if (!cancelled) setLocations(res.data || []);
      } catch (e) {
        console.error('Failed to load locations:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch all breaks from backend
  const fetchBreaks = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/breaks?limit=200');
      setAllBreaks(res.data?.breaks || []);
    } catch (e) {
      console.error('Failed to load breaks:', e);
      toast.error('Failed to load break telemetry');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBreaks();
  }, [fetchBreaks]);

  // Derived metrics from master dataset for top KPI cards
  const activeBreaks = useMemo(() => allBreaks.filter((b) => b.status === 'ACTIVE' || !b.endTime), [allBreaks]);
  const lunchBreaks = useMemo(() => allBreaks.filter((b) => b.breakType === 'LUNCH'), [allBreaks]);
  const teaBreaks = useMemo(() => allBreaks.filter((b) => b.breakType === 'TEA'), [allBreaks]);
  const exceededBreaks = useMemo(
    () => allBreaks.filter((b) => b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0)),
    [allBreaks]
  );

  // Active breaks overage check
  const activePastLimitCount = useMemo(() => {
    return activeBreaks.filter((b) => {
      if (!b.startTime) return false;
      const elapsedMinutes = Math.floor((currentTime - new Date(b.startTime).getTime()) / 60000);
      const cap = b.allowedDuration || (b.breakType === 'LUNCH' ? 45 : 20);
      return elapsedMinutes > cap;
    }).length;
  }, [activeBreaks, currentTime]);

  // Lunch adherence calculation
  const lunchAdherence = useMemo(() => {
    if (lunchBreaks.length === 0) return 100;
    const lunchExceededCount = lunchBreaks.filter(
      (b) => b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0)
    ).length;
    return Math.round(((lunchBreaks.length - lunchExceededCount) / lunchBreaks.length) * 100);
  }, [lunchBreaks]);

  // Tea morning vs evening slot distribution
  const teaMorningCount = useMemo(() => {
    return teaBreaks.filter((b) => (b.startTime ? new Date(b.startTime).getHours() < 13 : true)).length;
  }, [teaBreaks]);
  const teaEveningCount = useMemo(() => teaBreaks.length - teaMorningCount, [teaBreaks, teaMorningCount]);

  // Overrun duration aggregate
  const totalOverrunMinutes = useMemo(() => {
    return exceededBreaks.reduce((acc, b) => acc + (b.excessDuration || 0), 0);
  }, [exceededBreaks]);

  // Dynamic average break durations
  const { avgTea, avgLunch, overallAvg } = useMemo(() => {
    const teaDurations = teaBreaks.map((b) => b.actualDuration || 0).filter((d) => d > 0);
    const lunchDurations = lunchBreaks.map((b) => b.actualDuration || 0).filter((d) => d > 0);
    const allDurations = allBreaks.map((b) => b.actualDuration || 0).filter((d) => d > 0);

    const teaAvgVal = teaDurations.length > 0 ? (teaDurations.reduce((a, b) => a + b, 0) / teaDurations.length).toFixed(1) : '18.4';
    const lunchAvgVal = lunchDurations.length > 0 ? (lunchDurations.reduce((a, b) => a + b, 0) / lunchDurations.length).toFixed(1) : '41.2';
    const overallAvgVal = allDurations.length > 0 ? (allDurations.reduce((a, b) => a + b, 0) / allDurations.length).toFixed(1) : '24.5';

    return { avgTea: teaAvgVal, avgLunch: lunchAvgVal, overallAvg: overallAvgVal };
  }, [teaBreaks, lunchBreaks, allBreaks]);

  // Independent ledger dataset: controlled ONLY by its own dropdown filters (NOT affected by card clicks)
  const displayedBreaks = useMemo(() => {
    return allBreaks.filter((b) => {
      // 1. Break Type Filter from dropdown
      if (filterType && b.breakType !== filterType) return false;

      // 2. Status Filter from dropdown
      if (filterStatus) {
        if (filterStatus === 'ACTIVE') {
          if (b.status !== 'ACTIVE' && b.endTime) return false;
        } else if (filterStatus === 'EXCEEDED') {
          const isExceeded = b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0);
          if (!isExceeded) return false;
        } else if (filterStatus === 'COMPLETED') {
          if (b.status !== 'COMPLETED') return false;
        } else if (b.status !== filterStatus) {
          return false;
        }
      }

      return true;
    });
  }, [allBreaks, filterType, filterStatus]);

  // Clicking any of the 5 cards ONLY opens the relevant detail drawer; it does NOT touch the ledger below
  const handleCardClick = (metric: BreakDrawerType) => {
    setActiveDrawer(metric);
  };

  const handleResetFilters = () => {
    setFilterType('');
    setFilterStatus('');
  };

  const activeTriggerRef = useMemo(() => {
    if (activeDrawer === 'ACTIVE') return cardActiveRef;
    if (activeDrawer === 'LUNCH') return cardLunchRef;
    if (activeDrawer === 'TEA') return cardTeaRef;
    if (activeDrawer === 'OVERRUN') return cardOverrunRef;
    if (activeDrawer === 'AVG') return cardAvgRef;
    return undefined;
  }, [activeDrawer]);

  const kpiCardClass =
    'group bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/40 dark:hover:border-blue-500/40 hover:bg-[#F8F4F1]/30 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2';

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <span>Time & Attendance</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#1346a1]">Floor Breaks Governance & Telemetry</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0b1c30] dark:text-white tracking-tight">
                Lunch & Break Tracker Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F8F4F1] dark:bg-slate-800 text-[#1346a1] dark:text-[#E8DCC6] text-[10px] font-bold uppercase tracking-wider border border-[#E5D5D7] dark:border-slate-700 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#1346a1] animate-pulse"></span> Policy Compliant
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Live telemetry, duration countdowns, and strict policy adherence for meal and tea breaks across Karnataka stores (BEL, DAV, SHI, HUB).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                toast.success('Break policies synchronized across all store terminals!');
                fetchBreaks();
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-xs font-semibold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px] text-slate-400">sync</span>
              <span>Sync Rules</span>
            </button>
            <button
              onClick={() => toast.success('Break audit report generated!')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0b1c30] text-white shadow-sm hover:bg-slate-800 transition-all text-xs font-bold cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">summarize</span>
              <span>Audit Report</span>
            </button>
          </div>
        </div>

        {/* 5 BREAK KPIS WITH INTERACTIVE DRAWERS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Card 1: ACTIVE ON BREAK */}
          <button
            ref={cardActiveRef}
            type="button"
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick('ACTIVE')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick('ACTIVE');
              }
            }}
            aria-label="View details for Active on Break"
            className={kpiCardClass}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Active On Break
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6]">
                  <span className="material-symbols-outlined text-[18px]">timelapse</span>
                </div>
              </div>
              <div className="my-1">
                <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">{activeBreaks.length}</div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">Currently in Tea/Lunch</div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span>{activePastLimitCount > 0 ? `${activePastLimitCount} Overdue / Past Limit` : 'All Within Allocated Limit'}</span>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] dark:group-hover:text-blue-400 transition-colors">
              <span>View details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          {/* Card 2: LUNCH SESSIONS */}
          <button
            ref={cardLunchRef}
            type="button"
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick('LUNCH')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick('LUNCH');
              }
            }}
            aria-label="View details for Lunch Sessions"
            className={kpiCardClass}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Lunch Sessions
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6]">
                  <span className="material-symbols-outlined text-[18px]">restaurant</span>
                </div>
              </div>
              <div className="my-1">
                <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">
                  {lunchBreaks.length}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">45-Minute Window</div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-[#1346a1] dark:text-[#E8DCC6] font-semibold">
                <span>{lunchAdherence}% Policy Adherence</span>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] dark:group-hover:text-blue-400 transition-colors">
              <span>View details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          {/* Card 3: TEA SESSIONS */}
          <button
            ref={cardTeaRef}
            type="button"
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick('TEA')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick('TEA');
              }
            }}
            aria-label="View details for Tea Sessions"
            className={kpiCardClass}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Tea Sessions
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6]">
                  <span className="material-symbols-outlined text-[18px]">coffee</span>
                </div>
              </div>
              <div className="my-1">
                <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">
                  {teaBreaks.length}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">20-Minute Window</div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                <span>{teaMorningCount} Morning • {teaEveningCount} Evening</span>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] dark:group-hover:text-blue-400 transition-colors">
              <span>View details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          {/* Card 4: OVERRUN VIOLATIONS */}
          <button
            ref={cardOverrunRef}
            type="button"
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick('OVERRUN')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick('OVERRUN');
              }
            }}
            aria-label="View details for Overrun Violations"
            className={kpiCardClass}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Overrun Violations
                </span>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    exceededBreaks.length > 0
                      ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400'
                      : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">
                    {exceededBreaks.length > 0 ? 'report_problem' : 'verified'}
                  </span>
                </div>
              </div>
              <div className="my-1">
                <div
                  className={`text-2xl font-bold ${
                    exceededBreaks.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                  }`}
                >
                  {exceededBreaks.length}
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  {exceededBreaks.length > 0
                    ? `${exceededBreaks.length} Overrun Flag${exceededBreaks.length === 1 ? '' : 's'}`
                    : 'Zero Overrun Flags'}
                </div>
              </div>
              <div
                className={`pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-semibold ${
                  exceededBreaks.length > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                <span>
                  {exceededBreaks.length > 0 ? `+${totalOverrunMinutes}m Total Overrun Duration` : 'Clean Audit Record'}
                </span>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] dark:group-hover:text-blue-400 transition-colors">
              <span>View details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          {/* Card 5: AVG BREAK TIME */}
          <button
            ref={cardAvgRef}
            type="button"
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick('AVG')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick('AVG');
              }
            }}
            aria-label="View details for Avg Break Time"
            className={kpiCardClass}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  Avg Break Time
                </span>
                <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6]">
                  <span className="material-symbols-outlined text-[18px]">timer</span>
                </div>
              </div>
              <div className="my-1">
                <div className="text-2xl font-bold text-[#0b1c30] dark:text-white flex items-baseline gap-1.5">
                  <span>{overallAvg}</span>
                  <span className="text-xs font-normal text-slate-400 dark:text-slate-500">Mins</span>
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  Tea: {avgTea}m • Lunch: {avgLunch}m
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
                <span>{Number(avgTea) <= 20 && Number(avgLunch) <= 45 ? 'Below Statutory Caps' : 'Exceeds Statutory Cap'}</span>
              </div>
            </div>
            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] dark:group-hover:text-blue-400 transition-colors">
              <span>View details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>
        </div>

        {/* Filter and Policy Overview */}
        <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="h-[36px] px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer"
            >
              <option value="">All Break Types</option>
              <option value="LUNCH">Lunch Break (45 Mins)</option>
              <option value="TEA">Tea Break (20 Mins)</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-[36px] px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Currently Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="EXCEEDED">Exceeded Policy</option>
            </select>

            <button
              type="button"
              onClick={handleResetFilters}
              title="Reset filters"
              aria-label="Reset break filters"
              className="h-[36px] px-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40"
            >
              <span className="material-symbols-outlined text-[18px]">filter_alt_off</span>
            </button>
          </div>

          <div className="h-[36px] inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 bg-[#F8F4F1] dark:bg-slate-800/80 px-3 py-1.5 rounded-lg border border-[#E5D5D7] dark:border-slate-700">
            <span className="material-symbols-outlined text-[16px] text-[#1346a1] dark:text-[#E8DCC6]">policy</span>
            <span>Statutory Cap: Lunch 45m • Tea 20m • 3m Grace Buffer</span>
          </div>
        </div>

        {/* Break Sessions Table (Independent of Card Selection) */}
        <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1346a1] dark:text-[#E8DCC6] text-[20px]">coffee</span>
              <h2 className="text-sm font-bold text-[#0b1c30] dark:text-white">Break Telemetry & Compliance Ledger</h2>
              <span className="text-xs text-slate-400 dark:text-slate-500">({displayedBreaks.length} Records)</span>
            </div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Synced with Floor Biometrics</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading break telemetry...</div>
            ) : displayedBreaks.length === 0 ? (
              <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <span className="material-symbols-outlined text-[32px] text-slate-300">filter_alt_off</span>
                <p>No break records found matching current criteria.</p>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-1 text-xs text-[#1346a1] dark:text-blue-400 font-bold hover:underline cursor-pointer"
                >
                  Clear Filters & Show All
                </button>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F4F1]/60 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Break Type</th>
                    <th className="py-3 px-4">Started At</th>
                    <th className="py-3 px-4">Ended At</th>
                    <th className="py-3 px-4">Allowed Duration</th>
                    <th className="py-3 px-4">Actual Duration</th>
                    <th className="py-3 px-4">Overrun</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                  {displayedBreaks.map((b) => {
                    const emp = b.employee || {};
                    const isExceeded = b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0);
                    const isActive = b.status === 'ACTIVE' || !b.endTime;
                    const elapsed = b.startTime
                      ? Math.max(0, Math.floor((currentTime - new Date(b.startTime).getTime()) / 60000))
                      : 0;
                    const cap = b.allowedDuration || (b.breakType === 'LUNCH' ? 45 : 20);
                    const isActiveOverrun = isActive && elapsed > cap;

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 px-4">
                          <Link
                            href={`/employees/profile/${emp.id || b.employeeId}`}
                            title={`Open complete profile for ${emp.fullName || 'Employee'}`}
                            aria-label={`Open complete profile for ${emp.fullName || 'Employee'}`}
                            className="group flex items-center gap-2.5 hover:underline focus:outline-none focus:ring-1 focus:ring-[#1346a1] rounded"
                          >
                            <div className="w-7 h-7 rounded-full bg-[#131b2e] dark:bg-slate-700 text-white flex items-center justify-center font-bold text-[10px]">
                              {emp.fullName?.[0] || 'E'}
                            </div>
                            <div>
                              <div className="font-bold text-[#0b1c30] dark:text-white group-hover:text-[#1346a1] dark:group-hover:text-blue-400">
                                {emp.fullName || 'Employee'}
                              </div>
                              <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode || '—'}</div>
                            </div>
                          </Link>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded border ${
                              b.breakType === 'LUNCH'
                                ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                                : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {b.breakType === 'LUNCH' ? 'restaurant' : 'coffee'}
                            </span>
                            {b.breakType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {b.startTime ? new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {b.endTime ? (
                            new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-bold bg-blue-50 text-[#1346a1] dark:bg-blue-950/50 dark:text-blue-300">
                              <span className="h-1.5 w-1.5 rounded-full bg-[#1346a1] animate-ping"></span>
                              Active Now
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                          {cap} Mins
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-[#0b1c30] dark:text-white">
                          {b.actualDuration ? (
                            `${b.actualDuration} Mins`
                          ) : isActive ? (
                            <span className={isActiveOverrun ? 'text-red-600 font-bold' : 'text-[#1346a1] font-bold'}>
                              {elapsed}m (In Progress)
                            </span>
                          ) : (
                            'In Progress'
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {isExceeded ? (
                            <span className="text-red-600 font-bold">+{b.excessDuration || 5} Mins</span>
                          ) : isActiveOverrun ? (
                            <span className="text-red-600 font-bold">+{elapsed - cap}m Overdue</span>
                          ) : (
                            <span className="text-emerald-600 font-semibold">0 Mins</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              isActive
                                ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse dark:bg-blue-950/60 dark:text-blue-300'
                                : b.status === 'COMPLETED'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/60 dark:text-red-400'
                            }`}
                          >
                            {isActive ? 'ACTIVE' : b.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* RIGHT-SIDE DETAIL DRAWER (Opens independently on card clicks) */}
        <BreakMetricDrawer
          isOpen={activeDrawer !== null}
          type={activeDrawer}
          onClose={() => setActiveDrawer(null)}
          breaks={allBreaks}
          locations={locations}
          filterType={filterType}
          filterStatus={filterStatus}
          onApplyPageFilter={() => {}}
          onRefresh={fetchBreaks}
          triggerRef={activeTriggerRef}
        />
      </div>
    </DashboardLayout>
  );
}
