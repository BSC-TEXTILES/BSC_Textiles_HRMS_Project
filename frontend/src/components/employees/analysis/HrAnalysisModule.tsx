'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  BarChart3,
  Calendar,
  RefreshCw,
  RotateCcw,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { SummaryCardGrid, SummaryCounts, SummaryComparison } from './SummaryCardGrid';
import { ConnectedDotMainGraph, TimelinePoint } from './ConnectedDotMainGraph';
import { HourlyLoginDistributionChart } from './HourlyLoginDistributionChart';
import { LocationComparisonSection } from './LocationComparisonSection';
import { PunctualitySection } from './PunctualitySection';
import { EmployeeActivityDeepDive } from './EmployeeActivityDeepDive';
import { LongTermHistorySection } from './LongTermHistorySection';
import { AnalysisKpiDrawer } from './AnalysisKpiDrawer';

interface LocationItem {
  id: string;
  code: string;
  name: string;
}

interface DepartmentItem {
  id: string;
  name: string;
}

interface HrAnalysisModuleProps {
  initialLocationId?: string;
  initialDeptId?: string;
  className?: string;
  standalonePage?: boolean;
}

export function HrAnalysisModule({
  initialLocationId,
  initialDeptId,
  className = '',
  standalonePage = false,
}: HrAnalysisModuleProps) {
  // Filter states
  const [preset, setPreset] = useState<string>('30d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [locationId, setLocationId] = useState<string>(initialLocationId || 'all');
  const [departmentId, setDepartmentId] = useState<string>(initialDeptId || 'all');
  const [employeeStatus, setEmployeeStatus] = useState<string>('ALL');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');

  // Dropdown options
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [departments, setDepartments] = useState<DepartmentItem[]>([]);

  // Telemetry & data states
  const [summaryCounts, setSummaryCounts] = useState<SummaryCounts | null>(null);
  const [summaryComparison, setSummaryComparison] = useState<SummaryComparison | null>(null);
  const [timelinePoints, setTimelinePoints] = useState<TimelinePoint[]>([]);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [peakPeriod, setPeakPeriod] = useState<any>(null);
  const [lowestPeriod, setLowestPeriod] = useState<any>(null);
  const [locationStats, setLocationStats] = useState<any[]>([]);
  const [punctualityTrend, setPunctualityTrend] = useState<any[]>([]);
  const [repeatOffenders, setRepeatOffenders] = useState<any[]>([]);
  const [joiningTrend, setJoiningTrend] = useState<any[]>([]);
  const [deptBreakdown, setDeptBreakdown] = useState<any[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<any[]>([]);

  // Connected-dot trend drill-down date state
  const [drillDownTargetDate, setDrillDownTargetDate] = useState<string>('');

  // KPI Drawer states
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [activeDrawerCategory, setActiveDrawerCategory] = useState<string | null>(null);
  const [activeDrawerTitle, setActiveDrawerTitle] = useState<string>('');
  const triggerRef = useRef<HTMLElement | null>(null);

  // Loading & refresh management
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [autoRefreshTick, setAutoRefreshTick] = useState<number>(0);
  const [isDocumentVisible, setIsDocumentVisible] = useState<boolean>(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Cancellation controller ref
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track page visibility for auto-refresh pausing
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsDocumentVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Load locations and departments metadata once, with deduplication for departments
  useEffect(() => {
    let active = true;
    const loadMeta = async () => {
      try {
        const [locRes, deptRes] = await Promise.all([
          api.get('/locations/all').catch(() => ({ data: [] })),
          api.get('/departments?limit=100').catch(() => ({ data: [] })),
        ]);
        if (active) {
          const locs = Array.isArray(locRes.data) ? locRes.data : [];
          setLocations(
            locs.map((l: any) => ({
              id: l.id,
              code: l.code,
              name: l.name,
            }))
          );

          // Deduplicate departments by department name across store hubs
          const rawDepts = deptRes.data?.departments || deptRes.data || [];
          const seenNames = new Set<string>();
          const uniqueDepts: DepartmentItem[] = [];

          for (const d of rawDepts) {
            const trimmedName = (d.name || '').trim();
            if (trimmedName && !seenNames.has(trimmedName.toLowerCase())) {
              seenNames.add(trimmedName.toLowerCase());
              uniqueDepts.push({
                id: d.id,
                name: trimmedName,
              });
            }
          }
          setDepartments(uniqueDepts);
        }
      } catch (err) {
        console.warn('Metadata load error:', err);
      }
    };
    loadMeta();
    return () => {
      active = false;
    };
  }, []);

  // Construct query string for analytics endpoints
  const buildQuery = useCallback(
    (customPreset?: string) => {
      const p = new URLSearchParams();
      p.append('preset', customPreset || preset);
      if (preset === 'custom' && customStartDate && customEndDate) {
        p.append('startDate', customStartDate);
        p.append('endDate', customEndDate);
      }
      if (drillDownTargetDate) {
        p.append('date', drillDownTargetDate);
      }
      if (locationId && locationId !== 'all') p.append('locationId', locationId);
      if (departmentId && departmentId !== 'all') p.append('departmentId', departmentId);
      if (employeeStatus && employeeStatus !== 'ALL') p.append('status', employeeStatus);
      if (selectedEmployeeId) p.append('employeeId', selectedEmployeeId);
      return p.toString();
    },
    [preset, customStartDate, customEndDate, drillDownTargetDate, locationId, departmentId, employeeStatus, selectedEmployeeId]
  );

  // Main data fetch function
  const fetchAnalysisData = useCallback(
    async (isBackground = false) => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      if (!isBackground) setLoading(true);
      else setRefreshing(true);
      setFetchError(null);

      const qs = buildQuery();

      try {
        const [
          summaryRes,
          timelineRes,
          hourlyRes,
          locationsRes,
          punctualityRes,
          historyRes,
        ] = await Promise.all([
          api.get(`/analysis/summary?${qs}`),
          api.get(`/analysis/timeline?${qs}`),
          api.get(`/analysis/hourly?${qs}`),
          api.get(`/analysis/locations?${qs}`),
          api.get(`/analysis/punctuality?${qs}`),
          api.get(`/analysis/history-tenure?${qs}`),
        ]);

        setSummaryCounts(summaryRes.data?.counts || null);
        setSummaryComparison(summaryRes.data?.comparison || null);
        setTimelinePoints(timelineRes.data?.points || []);
        setHourlyData(hourlyRes.data?.hourlyData || []);
        setPeakPeriod(hourlyRes.data?.peakPeriod || null);
        setLowestPeriod(hourlyRes.data?.lowestPeriod || null);
        setLocationStats(locationsRes.data?.locations || []);
        setPunctualityTrend(punctualityRes.data?.trend || []);
        setRepeatOffenders(punctualityRes.data?.repeatOffenders || []);
        setJoiningTrend(historyRes.data?.joiningTrend || []);
        setDeptBreakdown(historyRes.data?.departmentBreakdown || []);
        setStatusBreakdown(historyRes.data?.statusBreakdown || []);

        const now = new Date();
        const time12IST = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) + ' IST';
        setLastUpdated(time12IST);
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
          return;
        }
        console.error('Failed to load analysis telemetry:', err);
        setFetchError(err?.response?.data?.message || err?.message || 'Could not load analysis data.');
        toast.error('Failed to load analysis telemetry');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [buildQuery]
  );

  // Trigger main data load on filter changes
  useEffect(() => {
    fetchAnalysisData();
  }, [fetchAnalysisData]);

  // Auto-refresh timer (every 30 seconds if enabled and document is visible)
  useEffect(() => {
    if (!autoRefresh || !isDocumentVisible) return;
    const interval = setInterval(() => {
      fetchAnalysisData(true);
      setAutoRefreshTick((t) => t + 1);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, isDocumentVisible, fetchAnalysisData]);

  // Handler when user clicks any of the 14 Summary Cards -> opens Drawer
  const handleCardClick = (category: string, title: string, triggerEl?: HTMLElement) => {
    if (triggerEl) {
      triggerRef.current = triggerEl;
    }
    setActiveDrawerCategory(category);
    setActiveDrawerTitle(title);
    setDrawerOpen(true);
  };

  // Handler when user closes the KPI Drawer
  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setActiveDrawerCategory(null);
  };

  // Handler when user clicks a dot on the Main Graph
  const handleGraphPointClick = (date: string) => {
    setDrillDownTargetDate(date);
    toast.success(`Date filter set to ${date}`);
  };

  // Handler to clear date drill-down
  const handleClearDrillDownDate = () => {
    setDrillDownTargetDate('');
    toast.success('Restored range view');
  };

  // Reset all filters
  const handleResetFilters = () => {
    setPreset('30d');
    setCustomStartDate('');
    setCustomEndDate('');
    setDrillDownTargetDate('');
    setLocationId('all');
    setDepartmentId('all');
    setEmployeeStatus('ALL');
    setSelectedEmployeeId('');
    toast.success('Analysis filters reset');
  };

  // Resolved location and department display names for drawer header summary
  const activeLocationName =
    locationId === 'all'
      ? 'All Retail Hubs (BEL, DAV, SHI)'
      : locations.find((l) => l.id === locationId)?.name || 'Store Hub';

  const activeDepartmentName =
    departmentId === 'all'
      ? 'All Departments'
      : departments.find((d) => d.id === departmentId)?.name || 'Department';

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Header & Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
        {/* Header Title & Top Controls */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          {/* Left Block: Title, subtitle, badge */}
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-[#1346a1] to-sky-600 text-white shadow-xs">
                <BarChart3 className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                    HR Workforce Analysis & Connected-Dot Telemetry
                  </h1>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                    Live Records
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Real-time database analytics for logins, punches, punctuality, and staff activity across stores
                </p>
              </div>
            </div>
          </div>

          {/* Right Group: Updated at, Auto-Refresh toggle, Refresh button */}
          <div className="flex items-center gap-2.5 shrink-0">
            {lastUpdated && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-medium mr-1 whitespace-nowrap">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                Updated at {lastUpdated}
              </span>
            )}

            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                  : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'
                }`}
              />
              <span>Auto-Refresh (30s)</span>
            </button>

            <button
              type="button"
              onClick={() => fetchAnalysisData(false)}
              disabled={refreshing || loading}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#1346a1] text-white hover:bg-[#0e357e] active:scale-95 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing || loading ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Updating...' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Filter Rows */}
        <div className="space-y-3">
          {/* Row 1: Segmented Range Tabs (horizontally scrollable container) */}
          <div className="overflow-x-auto pb-1 scrollbar-none">
            <div className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-medium min-w-max">
              {[
                { id: 'today', label: 'Today' },
                { id: '7d', label: '7 Days' },
                { id: '30d', label: '30 Days' },
                { id: '90d', label: '90 Days' },
                { id: 'this_month', label: 'This Month' },
                { id: 'prev_month', label: 'Prev Month' },
                { id: 'all', label: 'All History' },
                { id: 'custom', label: 'Custom' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setPreset(t.id);
                    setDrillDownTargetDate('');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    preset === t.id
                      ? 'bg-[#1346a1] text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs w-fit">
              <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5 shrink-0" />
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-2 py-0.5 bg-transparent text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-2 py-0.5 bg-transparent text-slate-800 dark:text-slate-200 text-xs focus:outline-none"
              />
            </div>
          )}

          {/* Row 2: Store hubs dropdown, Departments dropdown, Statuses dropdown, reset icon button */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 items-center">
            {/* Hubs Dropdown */}
            <div>
              <select
                id="analysis-filter-hub"
                aria-label="Filter by store hub"
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#1346a1]"
              >
                <option value="all">All Retail Hubs (BEL, DAV, SHI)</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Department Dropdown (deduplicated) */}
            <div>
              <select
                id="analysis-filter-department"
                aria-label="Filter by department"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#1346a1]"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Employment Status Dropdown */}
            <div>
              <select
                id="analysis-filter-status"
                aria-label="Filter by employment status"
                value={employeeStatus}
                onChange={(e) => setEmployeeStatus(e.target.value)}
                className="w-full h-9 px-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-medium focus:outline-none focus:border-[#1346a1]"
              >
                <option value="ALL">All Employment Statuses</option>
                <option value="ACTIVE">Active Staff Only</option>
                <option value="PROBATION">Probation Only</option>
                <option value="INACTIVE">Inactive / Separated</option>
              </select>
            </div>

            {/* Reset Icon Button with Tooltip */}
            <div className="flex items-center justify-end">
              <button
                type="button"
                onClick={handleResetFilters}
                className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold shrink-0 cursor-pointer"
                title="Reset filters"
                aria-label="Reset filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset filters</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Error Notice */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchAnalysisData(false)}
            className="font-bold underline cursor-pointer"
          >
            Retry Query
          </button>
        </div>
      )}

      {/* 2. Top Summary Cards (14 KPIs - Clickable with Drawer Integration) */}
      <SummaryCardGrid
        counts={summaryCounts}
        comparison={summaryComparison}
        loading={loading}
        onCardClick={handleCardClick}
        selectedCategory={drawerOpen ? activeDrawerCategory : null}
        preset={preset}
        selectedDate={drillDownTargetDate || null}
      />

      {/* 3. Main Connected-Dot Graph Visualization */}
      <ConnectedDotMainGraph
        points={timelinePoints}
        loading={loading}
        onPointClick={handleGraphPointClick}
        selectedDate={drillDownTargetDate || null}
        onClearDate={handleClearDrillDownDate}
      />

      {/* 4. Hourly Distribution and Location Breakdown Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HourlyLoginDistributionChart
          hourlyData={hourlyData}
          peakPeriod={peakPeriod}
          lowestPeriod={lowestPeriod}
          loading={loading}
        />
        <LocationComparisonSection
          locations={locationStats}
          loading={loading}
          onSelectLocation={(locId) => setLocationId(locId)}
          selectedLocationId={locationId}
        />
      </div>

      {/* 5. Late Arrival & Punctuality Analytics */}
      <PunctualitySection
        trend={punctualityTrend}
        repeatOffenders={repeatOffenders}
        loading={loading}
        onSelectEmployee={(empId) => setSelectedEmployeeId(empId)}
      />

      {/* 6. Employee-Wise Individual Activity Deep-Dive */}
      <EmployeeActivityDeepDive
        selectedEmployeeId={selectedEmployeeId}
        onSelectEmployee={(id) => setSelectedEmployeeId(id)}
        dateRange={{
          startDate: customStartDate || '',
          endDate: customEndDate || '',
          preset,
        }}
      />

      {/* 7. Long-Term HR History & Tenure Progression */}
      <LongTermHistorySection
        joiningTrend={joiningTrend}
        departmentBreakdown={deptBreakdown}
        statusBreakdown={statusBreakdown}
        loading={loading}
      />

      {/* 8. Full Viewport Slide-over KPI Drawer */}
      {activeDrawerCategory && (
        <AnalysisKpiDrawer
          open={drawerOpen}
          onClose={handleCloseDrawer}
          category={activeDrawerCategory}
          title={activeDrawerTitle}
          preset={preset}
          date={drillDownTargetDate || null}
          customStartDate={customStartDate || undefined}
          customEndDate={customEndDate || undefined}
          locationId={locationId}
          departmentId={departmentId}
          employeeStatus={employeeStatus}
          locations={locations}
          departments={departments}
          triggerRef={triggerRef}
          onClearDrillDownDate={handleClearDrillDownDate}
          autoRefreshTick={autoRefreshTick}
        />
      )}
    </div>
  );
}
