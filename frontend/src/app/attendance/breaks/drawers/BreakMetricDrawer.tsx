'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

export type BreakDrawerType = 'ACTIVE' | 'LUNCH' | 'TEA' | 'OVERRUN' | 'AVG' | null;

interface BreakMetricDrawerProps {
  isOpen: boolean;
  type: BreakDrawerType;
  onClose: () => void;
  breaks: any[];
  locations: any[];
  filterType: string;
  filterStatus: string;
  onApplyPageFilter: (breakType: string, status: string) => void;
  onRefresh: () => Promise<void>;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function BreakMetricDrawer({
  isOpen,
  type,
  onClose,
  breaks,
  locations,
  filterType,
  filterStatus,
  onApplyPageFilter,
  onRefresh,
  triggerRef,
}: BreakMetricDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeChip, setActiveChip] = useState('ALL');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('just now');
  const [now, setNow] = useState(() => Date.now());

  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Update live clock for active break elapsed time
  useEffect(() => {
    if (!isOpen || type !== 'ACTIVE') return;
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, type]);

  // Lock body scroll and manage focus
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on open
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        triggerRef?.current?.focus();
      }

      // Trap focus inside drawer
      if (e.key === 'Tab' && drawerRef.current) {
        const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen, onClose, triggerRef]);

  // Reset internal filter state when drawer opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setActiveChip('ALL');
      setLastUpdated('just now');
    }
  }, [isOpen, type]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
      setLastUpdated('just now');
    } finally {
      setIsRefreshing(false);
    }
  };

  const getStoreName = useCallback((b: any) => {
    const locId = b.employee?.locationId || b.locationId;
    if (!locId) return 'BEL Hub';
    const loc = locations.find((l) => l.id === locId);
    return loc ? `${loc.name} (${loc.code})` : 'BEL Hub';
  }, [locations]);

  // ------------------ Data processing per drawer type ------------------

  // 1. ACTIVE ON BREAK
  const activeBreaks = useMemo(() => {
    return breaks.filter((b) => b.status === 'ACTIVE' || !b.endTime);
  }, [breaks]);

  // 2. LUNCH SESSIONS
  const lunchBreaks = useMemo(() => {
    return breaks.filter((b) => b.breakType === 'LUNCH');
  }, [breaks]);

  // 3. TEA SESSIONS
  const teaBreaks = useMemo(() => {
    return breaks.filter((b) => b.breakType === 'TEA');
  }, [breaks]);

  // 4. OVERRUN VIOLATIONS
  const overrunBreaks = useMemo(() => {
    return breaks.filter((b) => b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0));
  }, [breaks]);

  // 5. ALL BREAKS (FOR AVG TIME)
  const allCompletedBreaks = useMemo(() => {
    return breaks.filter((b) => b.status === 'COMPLETED' || b.actualDuration > 0);
  }, [breaks]);

  // Active breaks metrics
  const activeTeaCount = activeBreaks.filter((b) => b.breakType === 'TEA').length;
  const activeLunchCount = activeBreaks.filter((b) => b.breakType === 'LUNCH').length;
  const activePastLimitCount = activeBreaks.filter((b) => {
    if (!b.startTime) return false;
    const elapsedMinutes = Math.floor((now - new Date(b.startTime).getTime()) / 60000);
    const cap = b.allowedDuration || (b.breakType === 'LUNCH' ? 45 : 20);
    return elapsedMinutes > cap;
  }).length;
  const activeWithinLimitCount = activeBreaks.length - activePastLimitCount;

  // Lunch metrics
  const lunchCompleted = lunchBreaks.filter((b) => b.status === 'COMPLETED' && (!b.excessDuration || b.excessDuration === 0)).length;
  const lunchExceeded = lunchBreaks.filter((b) => b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0)).length;
  const lunchAdherence = lunchBreaks.length === 0 ? 100 : Math.round(((lunchBreaks.length - lunchExceeded) / lunchBreaks.length) * 100);

  // Tea metrics
  const teaMorningCount = teaBreaks.filter((b) => {
    if (!b.startTime) return true;
    const h = new Date(b.startTime).getHours();
    return h < 13;
  }).length;
  const teaEveningCount = teaBreaks.length - teaMorningCount;
  const teaWithinCap = teaBreaks.filter((b) => b.status !== 'EXCEEDED' && (!b.excessDuration || b.excessDuration === 0)).length;
  const teaExceeded = teaBreaks.filter((b) => b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0)).length;

  // Overrun metrics
  const totalOverrunMinutes = overrunBreaks.reduce((acc, b) => acc + (b.excessDuration || 0), 0);
  const longestOverrun = overrunBreaks.reduce((max, b) => Math.max(max, b.excessDuration || 0), 0);

  const employeeOverrunCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    overrunBreaks.forEach((b) => {
      const empId = b.employee?.id || b.employeeId || 'unknown';
      counts[empId] = (counts[empId] || 0) + 1;
    });
    return counts;
  }, [overrunBreaks]);

  const repeatOffendersCount = useMemo(
    () => Object.values(employeeOverrunCounts).filter((c) => c > 1).length,
    [employeeOverrunCounts]
  );
  const withinGraceCount = overrunBreaks.filter((b) => (b.excessDuration || 0) <= 3).length;

  // Avg break metrics
  const teaDurations = teaBreaks.map((b) => b.actualDuration || 0).filter((d) => d > 0);
  const lunchDurations = lunchBreaks.map((b) => b.actualDuration || 0).filter((d) => d > 0);
  const allDurations = allCompletedBreaks.map((b) => b.actualDuration || 0).filter((d) => d > 0);

  const avgTea = teaDurations.length > 0 ? (teaDurations.reduce((a, b) => a + b, 0) / teaDurations.length).toFixed(1) : '18.4';
  const avgLunch = lunchDurations.length > 0 ? (lunchDurations.reduce((a, b) => a + b, 0) / lunchDurations.length).toFixed(1) : '41.2';
  
  const medianDuration = useMemo(() => {
    if (allDurations.length === 0) return '20.0';
    const sorted = [...allDurations].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid].toFixed(1) : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
  }, [allDurations]);

  const underCapPercentage = useMemo(() => {
    if (breaks.length === 0) return 100;
    const underCapCount = breaks.filter((b) => {
      const cap = b.allowedDuration || (b.breakType === 'LUNCH' ? 45 : 20);
      const dur = b.actualDuration || 0;
      return dur <= cap;
    }).length;
    return Math.round((underCapCount / breaks.length) * 100);
  }, [breaks]);

  // Filtered rows for detail table
  const displayedRows = useMemo(() => {
    let source: any[] = [];
    if (type === 'ACTIVE') source = activeBreaks;
    else if (type === 'LUNCH') source = lunchBreaks;
    else if (type === 'TEA') source = teaBreaks;
    else if (type === 'OVERRUN') {
      // Sort repeat offenders first
      source = [...overrunBreaks].sort((a, b) => {
        const countA = employeeOverrunCounts[a.employee?.id || a.employeeId] || 0;
        const countB = employeeOverrunCounts[b.employee?.id || b.employeeId] || 0;
        return countB - countA;
      });
    } else if (type === 'AVG') source = breaks;

    return source.filter((row) => {
      // 1. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (row.employee?.fullName || '').toLowerCase();
        const code = (row.employee?.employeeCode || '').toLowerCase();
        if (!name.includes(q) && !code.includes(q)) return false;
      }

      // 2. Filter Chips
      if (type === 'ACTIVE') {
        if (activeChip === 'TEA') return row.breakType === 'TEA';
        if (activeChip === 'LUNCH') return row.breakType === 'LUNCH';
        if (activeChip === 'NEAR_LIMIT') {
          if (!row.startTime) return false;
          const elapsed = Math.floor((now - new Date(row.startTime).getTime()) / 60000);
          const cap = row.allowedDuration || (row.breakType === 'LUNCH' ? 45 : 20);
          return elapsed >= cap - 3 && elapsed <= cap;
        }
        if (activeChip === 'EXCEEDED') {
          if (!row.startTime) return false;
          const elapsed = Math.floor((now - new Date(row.startTime).getTime()) / 60000);
          const cap = row.allowedDuration || (row.breakType === 'LUNCH' ? 45 : 20);
          return elapsed > cap || row.status === 'EXCEEDED';
        }
      } else if (type === 'LUNCH') {
        if (activeChip === 'COMPLETED') return row.status === 'COMPLETED';
        if (activeChip === 'EXCEEDED') return row.status === 'EXCEEDED' || (row.excessDuration && row.excessDuration > 0);
      } else if (type === 'TEA') {
        if (activeChip === 'MORNING') {
          if (!row.startTime) return true;
          return new Date(row.startTime).getHours() < 13;
        }
        if (activeChip === 'EVENING') {
          if (!row.startTime) return false;
          return new Date(row.startTime).getHours() >= 13;
        }
        if (activeChip === 'COMPLETED') return row.status === 'COMPLETED';
        if (activeChip === 'EXCEEDED') return row.status === 'EXCEEDED' || (row.excessDuration && row.excessDuration > 0);
      } else if (type === 'OVERRUN') {
        if (activeChip === 'TEA') return row.breakType === 'TEA';
        if (activeChip === 'LUNCH') return row.breakType === 'LUNCH';
        if (activeChip === 'GRACE_YES') return (row.excessDuration || 0) <= 3;
        if (activeChip === 'GRACE_NO') return (row.excessDuration || 0) > 3;
      } else if (type === 'AVG') {
        if (activeChip === 'TEA') return row.breakType === 'TEA';
        if (activeChip === 'LUNCH') return row.breakType === 'LUNCH';
      }

      return true;
    });
  }, [type, breaks, activeBreaks, lunchBreaks, teaBreaks, overrunBreaks, searchQuery, activeChip, now, employeeOverrunCounts]);

  // Aggregate stats by Store & Break Type for AVG Drawer
  const storeAggregates = useMemo(() => {
    if (type !== 'AVG') return [];
    const map = new Map<string, { store: string; type: string; count: number; totalDur: number; maxDur: number; cap: number; withinCap: number }>();

    breaks.forEach((b) => {
      const storeName = getStoreName(b);
      const bType = b.breakType || 'TEA';
      const key = `${storeName}__${bType}`;
      const cap = b.allowedDuration || (bType === 'LUNCH' ? 45 : 20);
      const dur = b.actualDuration || 0;

      if (!map.has(key)) {
        map.set(key, { store: storeName, type: bType, count: 0, totalDur: 0, maxDur: 0, cap, withinCap: 0 });
      }
      const entry = map.get(key)!;
      entry.count += 1;
      entry.totalDur += dur;
      entry.maxDur = Math.max(entry.maxDur, dur);
      if (dur <= cap) entry.withinCap += 1;
    });

    return Array.from(map.values()).map((e) => ({
      ...e,
      avgDur: e.count > 0 ? (e.totalDur / e.count).toFixed(1) : '0.0',
      withinCapPct: e.count > 0 ? Math.round((e.withinCap / e.count) * 100) : 100,
    }));
  }, [type, breaks, getStoreName]);

  if (!mounted || !isOpen || !type) return null;

  // Drawer Title and Footer text configuration
  const drawerConfig = {
    ACTIVE: {
      title: 'Active Floor Breaks Telemetry',
      subtitle: `Viewing active ongoing breaks • Current filters: Type: ${filterType || 'All'} • Status: ${filterStatus || 'All'}`,
      badge: `${activeBreaks.length} On Break`,
      footerAction: 'Open ledger filtered to active breaks',
      onFooterClick: () => {
        onApplyPageFilter(filterType, 'ACTIVE');
        onClose();
        triggerRef?.current?.focus();
      },
    },
    LUNCH: {
      title: 'Lunch Break Sessions & Governance',
      subtitle: `45-minute statutory allowance audit • Current filters: Type: ${filterType || 'All'} • Status: ${filterStatus || 'All'}`,
      badge: `${lunchBreaks.length} Lunch Sessions`,
      footerAction: 'Open ledger filtered to Lunch',
      onFooterClick: () => {
        onApplyPageFilter('LUNCH', filterStatus);
        onClose();
        triggerRef?.current?.focus();
      },
    },
    TEA: {
      title: 'Tea & Refreshment Breaks Audit',
      subtitle: `20-minute tea window compliance • Current filters: Type: ${filterType || 'All'} • Status: ${filterStatus || 'All'}`,
      badge: `${teaBreaks.length} Tea Sessions`,
      footerAction: 'Open ledger filtered to Tea',
      onFooterClick: () => {
        onApplyPageFilter('TEA', filterStatus);
        onClose();
        triggerRef?.current?.focus();
      },
    },
    OVERRUN: {
      title: 'Break Overrun Violations & Penalties',
      subtitle: `Policy overage telemetry • Current filters: Type: ${filterType || 'All'} • Status: ${filterStatus || 'All'}`,
      badge: `${overrunBreaks.length} Overrun Flags`,
      badgeTone: overrunBreaks.length > 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200',
      footerAction: 'Open ledger filtered to Exceeded',
      onFooterClick: () => {
        onApplyPageFilter(filterType, 'EXCEEDED');
        onClose();
        triggerRef?.current?.focus();
      },
    },
    AVG: {
      title: 'Average Break Duration & Cap Benchmark',
      subtitle: `Break analytics vs statutory thresholds • Current filters: Type: ${filterType || 'All'} • Status: ${filterStatus || 'All'}`,
      badge: 'Benchmark Telemetry',
      footerAction: 'Open ledger filtered to all break types',
      onFooterClick: () => {
        onApplyPageFilter('', '');
        onClose();
        triggerRef?.current?.focus();
      },
    },
  }[type];

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="break-drawer-title"
      className="fixed inset-0 z-50 flex justify-end bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
          triggerRef?.current?.focus();
        }
      }}
    >
      <div
        ref={drawerRef}
        className="relative w-full sm:max-w-[720px] h-full bg-white dark:bg-[#0e172a] shadow-2xl flex flex-col focus:outline-none"
        tabIndex={-1}
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-[#0e172a] flex items-start justify-between gap-3 shrink-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#1346a1] dark:text-blue-400 text-[22px]">
                {type === 'ACTIVE' && 'timelapse'}
                {type === 'LUNCH' && 'restaurant'}
                {type === 'TEA' && 'coffee'}
                {type === 'OVERRUN' && 'report_problem'}
                {type === 'AVG' && 'timer'}
              </span>
              <h2 id="break-drawer-title" className="text-base sm:text-lg font-bold text-[#0b1c30] dark:text-white">
                {drawerConfig.title}
              </h2>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider ${
                  drawerConfig.badgeTone || 'bg-blue-50 text-[#0058be] border-blue-200 dark:bg-blue-950/60 dark:text-blue-300'
                }`}
              >
                {drawerConfig.badge}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {drawerConfig.subtitle}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Refresh break telemetry"
              aria-label="Refresh break telemetry"
            >
              <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin text-[#1346a1]' : ''}`}>
                refresh
              </span>
            </button>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={() => {
                onClose();
                triggerRef?.current?.focus();
              }}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close details"
              aria-label="Close details"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>

        {/* Drawer Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
          {/* Summary Strip per Drawer Type */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {type === 'ACTIVE' && (
              <>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Open Breaks</span>
                  <div className="text-lg font-bold text-[#0b1c30] dark:text-white mt-0.5">{activeBreaks.length}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Tea Break</span>
                  <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{activeTeaCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Lunch Break</span>
                  <div className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5">{activeLunchCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Past Allowed</span>
                  <div className={`text-lg font-bold mt-0.5 ${activePastLimitCount > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {activePastLimitCount}
                  </div>
                </div>
              </>
            )}

            {type === 'LUNCH' && (
              <>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Lunch</span>
                  <div className="text-lg font-bold text-[#0b1c30] dark:text-white mt-0.5">{lunchBreaks.length}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Within 45m</span>
                  <div className="text-lg font-bold text-emerald-600 mt-0.5">{lunchCompleted}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Exceeded</span>
                  <div className={`text-lg font-bold mt-0.5 ${lunchExceeded > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {lunchExceeded}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Policy Adherence</span>
                  <div className="text-lg font-bold text-[#0058be] dark:text-blue-400 mt-0.5">{lunchAdherence}%</div>
                </div>
              </>
            )}

            {type === 'TEA' && (
              <>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Tea</span>
                  <div className="text-lg font-bold text-[#0b1c30] dark:text-white mt-0.5">{teaBreaks.length}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Morning Slot</span>
                  <div className="text-lg font-bold text-amber-600 mt-0.5">{teaMorningCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Evening Slot</span>
                  <div className="text-lg font-bold text-orange-600 mt-0.5">{teaEveningCount}</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Within 20m</span>
                  <div className="text-lg font-bold text-emerald-600 mt-0.5">{teaWithinCap}</div>
                </div>
              </>
            )}

            {type === 'OVERRUN' && (
              <>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Violations</span>
                  <div className={`text-lg font-bold mt-0.5 ${overrunBreaks.length > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {overrunBreaks.length}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Overrun</span>
                  <div className="text-lg font-bold text-red-600 mt-0.5">+{totalOverrunMinutes}m</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Longest Overrun</span>
                  <div className="text-lg font-bold text-red-600 mt-0.5">+{longestOverrun}m</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">In Grace Buffer (≤3m)</span>
                  <div className="text-lg font-bold text-amber-600 mt-0.5">{withinGraceCount}</div>
                </div>
              </>
            )}

            {type === 'AVG' && (
              <>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Avg Tea Break</span>
                  <div className="text-lg font-bold text-[#0b1c30] dark:text-white mt-0.5">
                    {avgTea}m <span className="text-[10px] font-normal text-slate-400">(Cap 20m)</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Avg Lunch Break</span>
                  <div className="text-lg font-bold text-[#0b1c30] dark:text-white mt-0.5">
                    {avgLunch}m <span className="text-[10px] font-normal text-slate-400">(Cap 45m)</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Median Duration</span>
                  <div className="text-lg font-bold text-[#0b1c30] dark:text-white mt-0.5">{medianDuration}m</div>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Within Own Cap</span>
                  <div className="text-lg font-bold text-emerald-600 mt-0.5">{underCapPercentage}%</div>
                </div>
              </>
            )}
          </div>

          {/* Search Bar & Quick Filter Chips */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by employee name or code..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0b1c30] dark:text-white text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {type === 'ACTIVE' && (
                <>
                  {['ALL', 'TEA', 'LUNCH', 'NEAR_LIMIT', 'EXCEEDED'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveChip(c)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        activeChip === c
                          ? 'bg-[#1346a1] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {c === 'ALL' && 'All'}
                      {c === 'TEA' && 'Tea'}
                      {c === 'LUNCH' && 'Lunch'}
                      {c === 'NEAR_LIMIT' && 'Near Limit'}
                      {c === 'EXCEEDED' && 'Exceeded'}
                    </button>
                  ))}
                </>
              )}

              {type === 'LUNCH' && (
                <>
                  {['ALL', 'COMPLETED', 'EXCEEDED'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveChip(c)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        activeChip === c
                          ? 'bg-[#1346a1] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {c === 'ALL' && 'All'}
                      {c === 'COMPLETED' && 'Completed'}
                      {c === 'EXCEEDED' && 'Exceeded'}
                    </button>
                  ))}
                </>
              )}

              {type === 'TEA' && (
                <>
                  {['ALL', 'MORNING', 'EVENING', 'COMPLETED', 'EXCEEDED'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveChip(c)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        activeChip === c
                          ? 'bg-[#1346a1] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {c === 'ALL' && 'All'}
                      {c === 'MORNING' && 'Morning Slot'}
                      {c === 'EVENING' && 'Evening Slot'}
                      {c === 'COMPLETED' && 'Completed'}
                      {c === 'EXCEEDED' && 'Exceeded'}
                    </button>
                  ))}
                </>
              )}

              {type === 'OVERRUN' && (
                <>
                  {['ALL', 'TEA', 'LUNCH', 'GRACE_YES', 'GRACE_NO'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveChip(c)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        activeChip === c
                          ? 'bg-[#1346a1] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {c === 'ALL' && 'All'}
                      {c === 'TEA' && 'Tea'}
                      {c === 'LUNCH' && 'Lunch'}
                      {c === 'GRACE_YES' && 'In Grace (≤3m)'}
                      {c === 'GRACE_NO' && 'Past Grace (>3m)'}
                    </button>
                  ))}
                </>
              )}

              {type === 'AVG' && (
                <>
                  {['ALL', 'TEA', 'LUNCH'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setActiveChip(c)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        activeChip === c
                          ? 'bg-[#1346a1] text-white shadow-xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {c === 'ALL' && 'All'}
                      {c === 'TEA' && 'Tea Breaks'}
                      {c === 'LUNCH' && 'Lunch Breaks'}
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Breakdown / Cap Benchmark Table for AVG Drawer */}
          {type === 'AVG' && storeAggregates.length > 0 && (
            <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-slate-50/50 dark:bg-slate-900/40 p-3">
              <span className="text-[11px] font-bold text-[#0b1c30] dark:text-white block mb-2">
                Store-Wise Benchmark vs Statutory Cap
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2 px-2.5">Break Type</th>
                      <th className="py-2 px-2.5">Store Hub</th>
                      <th className="py-2 px-2.5">Sessions</th>
                      <th className="py-2 px-2.5">Avg Duration</th>
                      <th className="py-2 px-2.5">Statutory Cap</th>
                      <th className="py-2 px-2.5">Within Cap (%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-600 dark:text-slate-300">
                    {storeAggregates.map((item, idx) => (
                      <tr key={idx}>
                        <td className="py-2 px-2.5 font-bold">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] ${
                            item.type === 'LUNCH' ? 'bg-amber-50 text-amber-700' : 'bg-orange-50 text-orange-700'
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="py-2 px-2.5">{item.store}</td>
                        <td className="py-2 px-2.5 font-mono">{item.count}</td>
                        <td className="py-2 px-2.5 font-mono font-bold text-[#0b1c30] dark:text-white">
                          {item.avgDur} Mins
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-500">{item.cap} Mins</td>
                        <td className="py-2 px-2.5 font-mono font-bold text-emerald-600">
                          {item.withinCapPct}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Main Detail Table with Sticky Header */}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden bg-white dark:bg-[#0e172a] shadow-xs">
            <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
              {displayedRows.length === 0 ? (
                <div className="p-10 text-center text-slate-400 dark:text-slate-500">
                  <span className="material-symbols-outlined text-[32px] block mb-1 opacity-60">
                    info
                  </span>
                  {type === 'ACTIVE' && 'No employees are on break right now.'}
                  {type === 'LUNCH' && 'No lunch sessions found for these filters.'}
                  {type === 'TEA' && 'No tea sessions found for these filters.'}
                  {type === 'OVERRUN' && 'No overrun violations for these filters.'}
                  {type === 'AVG' && 'No break records found for this range.'}
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F8F4F1] dark:bg-slate-800 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="py-2.5 px-3">Employee</th>
                      <th className="py-2.5 px-3">Store</th>
                      <th className="py-2.5 px-3">Break Type</th>
                      {type === 'TEA' && <th className="py-2.5 px-3">Slot</th>}
                      <th className="py-2.5 px-3">Started At</th>
                      {type === 'ACTIVE' ? (
                        <>
                          <th className="py-2.5 px-3">Elapsed (Live)</th>
                          <th className="py-2.5 px-3">Allowed</th>
                          <th className="py-2.5 px-3">Remaining</th>
                        </>
                      ) : (
                        <>
                          <th className="py-2.5 px-3">Ended At</th>
                          <th className="py-2.5 px-3">Allowed</th>
                          <th className="py-2.5 px-3">Actual</th>
                          <th className="py-2.5 px-3">Overrun</th>
                          {type === 'OVERRUN' && <th className="py-2.5 px-3">Grace Applied</th>}
                        </>
                      )}
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                    {displayedRows.map((b) => {
                      const emp = b.employee || {};
                      const storeLabel = getStoreName(b);
                      const isExceeded = b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0);
                      const allowedMins = b.allowedDuration || (b.breakType === 'LUNCH' ? 45 : 20);

                      // Calculate live elapsed and remaining for active breaks
                      let elapsedMins = 0;
                      let remainingMins = 0;
                      if (b.startTime) {
                        elapsedMins = Math.floor((now - new Date(b.startTime).getTime()) / 60000);
                        remainingMins = allowedMins - elapsedMins;
                      }

                      // Morning vs Evening slot for tea
                      let slot = 'Morning';
                      if (b.startTime && new Date(b.startTime).getHours() >= 13) {
                        slot = 'Evening';
                      }

                      const graceApplied = (b.excessDuration || 0) <= 3 ? 'Yes (≤3m)' : 'No (>3m)';

                      return (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-2.5 px-3">
                            <Link
                              href={`/employees/profile/${emp.id || b.employeeId}`}
                              title={`Open complete profile for ${emp.fullName || 'Employee'}`}
                              aria-label={`Open complete profile for ${emp.fullName || 'Employee'}`}
                              className="group flex items-center gap-2 hover:underline focus:outline-none focus:ring-1 focus:ring-[#1346a1] rounded"
                            >
                              <div className="w-6 h-6 rounded-full bg-[#131b2e] dark:bg-slate-700 text-white flex items-center justify-center font-bold text-[9px] shrink-0">
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
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                            {storeLabel}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded border ${
                                b.breakType === 'LUNCH'
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400'
                                  : 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-400'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {b.breakType === 'LUNCH' ? 'restaurant' : 'coffee'}
                              </span>
                              {b.breakType}
                            </span>
                          </td>
                          {type === 'TEA' && (
                            <td className="py-2.5 px-3 text-slate-500 font-medium whitespace-nowrap">
                              {slot}
                            </td>
                          )}
                          <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                            {b.startTime ? new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>

                          {type === 'ACTIVE' ? (
                            <>
                              <td className="py-2.5 px-3 font-mono font-bold text-[#0b1c30] dark:text-white whitespace-nowrap">
                                {elapsedMins} Mins
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                {allowedMins} Mins
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold whitespace-nowrap">
                                {remainingMins >= 0 ? (
                                  <span className="text-emerald-600">{remainingMins}m Left</span>
                                ) : (
                                  <span className="text-red-600">+{Math.abs(remainingMins)}m Past Limit</span>
                                )}
                              </td>
                            </>
                          ) : (
                            <>
                              <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                {b.endTime ? new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
                                  <span className="text-blue-600 font-semibold">Active Now</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                                {allowedMins} Mins
                              </td>
                              <td className="py-2.5 px-3 font-mono font-bold text-[#0b1c30] dark:text-white whitespace-nowrap">
                                {b.actualDuration ? `${b.actualDuration} Mins` : `${elapsedMins} Mins (Live)`}
                              </td>
                              <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                {isExceeded ? (
                                  <span className="text-red-600 font-bold">+{b.excessDuration || 5} Mins</span>
                                ) : (
                                  <span className="text-emerald-600 font-semibold">0 Mins</span>
                                )}
                              </td>
                              {type === 'OVERRUN' && (
                                <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    (b.excessDuration || 0) <= 3
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-red-50 text-red-700 border border-red-200'
                                  }`}>
                                    {graceApplied}
                                  </span>
                                </td>
                              )}
                            </>
                          )}

                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                b.status === 'ACTIVE'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200 animate-pulse'
                                  : b.status === 'COMPLETED'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-red-50 text-red-700 border-red-200'
                              }`}
                            >
                              {b.status}
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
        </div>

        {/* Sticky Drawer Footer */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-between gap-3 shrink-0">
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            Updated {lastUpdated} • Showing {displayedRows.length} matching rows
          </span>

          <button
            type="button"
            onClick={drawerConfig.onFooterClick}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold shadow-md shadow-[#1346a1]/20 transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#1346a1]"
          >
            <span>{drawerConfig.footerAction}</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
