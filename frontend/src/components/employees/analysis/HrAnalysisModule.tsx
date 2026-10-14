'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  BarChart3,
  Calendar,
  Filter,
  RefreshCw,
  RotateCcw,
  Clock,
  MapPin,
  Building2,
  Users,
  ChevronDown,
  Layers,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { SummaryCardGrid, SummaryCounts, SummaryComparison } from './SummaryCardGrid';
import { ConnectedDotMainGraph, TimelinePoint } from './ConnectedDotMainGraph';
import { HourlyLoginDistributionChart } from './HourlyLoginDistributionChart';
import { LocationComparisonSection } from './LocationComparisonSection';
import { PunctualitySection } from './PunctualitySection';
import { EmployeeActivityDeepDive } from './EmployeeActivityDeepDive';
import { LongTermHistorySection } from './LongTermHistorySection';
import { DrillDownRecordsTable } from './DrillDownRecordsTable';

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

  // Drill-down state
  const [drillDownCategory, setDrillDownCategory] = useState<string>('all');
  const [drillDownTitle, setDrillDownTitle] = useState<string>('All Workforce Staff');
  const [drillDownTargetDate, setDrillDownTargetDate] = useState<string>('');
  const [drillDownRows, setDrillDownRows] = useState<any[]>([]);
  const [drillDownTotal, setDrillDownTotal] = useState<number>(0);
  const [drillDownPage, setDrillDownPage] = useState<number>(1);
  const [drillDownTotalPages, setDrillDownTotalPages] = useState<number>(1);
  const [drillDownSearch, setDrillDownSearch] = useState<string>('');
  const [drillDownLoading, setDrillDownLoading] = useState<boolean>(false);
  const [showDrillDown, setShowDrillDown] = useState<boolean>(false);

  // Loading & refresh management
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Cancellation controller ref to cancel obsolete in-flight requests on rapid filter changes
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load locations and departments metadata once
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
          const depts = deptRes.data?.departments || deptRes.data || [];
          setDepartments(
            depts.map((d: any) => ({
              id: d.id,
              name: d.name,
            }))
          );
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
      if (locationId && locationId !== 'all') p.append('locationId', locationId);
      if (departmentId && departmentId !== 'all') p.append('departmentId', departmentId);
      if (employeeStatus && employeeStatus !== 'ALL') p.append('status', employeeStatus);
      if (selectedEmployeeId) p.append('employeeId', selectedEmployeeId);
      return p.toString();
    },
    [preset, customStartDate, customEndDate, locationId, departmentId, employeeStatus, selectedEmployeeId]
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

        setLastUpdated(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
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

  // Fetch drill-down records
  const fetchDrillDownRecords = useCallback(async () => {
    try {
      setDrillDownLoading(true);
      const p = new URLSearchParams();
      p.append('category', drillDownCategory);
      if (drillDownTargetDate) p.append('date', drillDownTargetDate);
      if (locationId && locationId !== 'all') p.append('locationId', locationId);
      if (departmentId && departmentId !== 'all') p.append('departmentId', departmentId);
      if (employeeStatus && employeeStatus !== 'ALL') p.append('status', employeeStatus);
      if (drillDownSearch) p.append('search', drillDownSearch);
      p.append('page', String(drillDownPage));
      p.append('limit', '15');

      const res = await api.get(`/analysis/drilldown?${p.toString()}`);
      setDrillDownRows(res.data?.rows || []);
      setDrillDownTotal(res.data?.total || 0);
      setDrillDownTotalPages(res.data?.totalPages || 1);
    } catch (err) {
      console.warn('Drilldown fetch error:', err);
    } finally {
      setDrillDownLoading(false);
    }
  }, [drillDownCategory, drillDownTargetDate, locationId, departmentId, employeeStatus, drillDownSearch, drillDownPage]);

  // Trigger main data load on filter changes
  useEffect(() => {
    fetchAnalysisData();
  }, [fetchAnalysisData]);

  // Auto-refresh timer (every 30 seconds if enabled)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalysisData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchAnalysisData]);

  // Trigger drill-down data load when category, search, page or target date changes
  useEffect(() => {
    if (showDrillDown) {
      fetchDrillDownRecords();
    }
  }, [showDrillDown, fetchDrillDownRecords]);

  // Handler when user clicks a Summary Card
  const handleCardClick = (category: string, title: string) => {
    setDrillDownCategory(category);
    setDrillDownTitle(title);
    setDrillDownTargetDate(new Date().toISOString().slice(0, 10));
    setDrillDownPage(1);
    setShowDrillDown(true);

    // Smooth scroll into drill-down table
    setTimeout(() => {
      const el = document.getElementById('drilldown-table-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Handler when user clicks a dot on the Main Graph
  const handleGraphPointClick = (date: string) => {
    setDrillDownCategory('all');
    setDrillDownTitle(`Workforce Punch & Login Records on ${date}`);
    setDrillDownTargetDate(date);
    setDrillDownPage(1);
    setShowDrillDown(true);

    setTimeout(() => {
      const el = document.getElementById('drilldown-table-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // Reset all filters
  const handleResetFilters = () => {
    setPreset('30d');
    setCustomStartDate('');
    setCustomEndDate('');
    setLocationId('all');
    setDepartmentId('all');
    setEmployeeStatus('ALL');
    setSelectedEmployeeId('');
    setDrillDownSearch('');
    setShowDrillDown(false);
    toast.success('Analysis filters reset');
  };

  return (
    <div className={`space-y-6 ${className}`}>
      {/* 1. Header & Filter Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-gradient-to-tr from-[#1346a1] to-sky-600 text-white shadow-xs">
                <BarChart3 className="w-5 h-5" />
              </span>
              <div>
                <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <span>HR Workforce Analysis & Connected-Dot Telemetry</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    Live Records
                  </span>
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Real-time database analytics for logins, punches, punctuality, and staff activity across stores
                </p>
              </div>
            </div>
          </div>

          {/* Quick Refresh & Auto-Refresh Toggle */}
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Updated at {lastUpdated}
              </span>
            )}

            <button
              type="button"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                autoRefresh
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${autoRefresh ? 'bg-emerald-500 animate-ping' : 'bg-slate-400'}`} />
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

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Preset Buttons */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-medium">
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
                onClick={() => setPreset(t.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  preset === t.id
                    ? 'bg-white dark:bg-slate-700 text-[#1346a1] dark:text-white shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Custom Date Range Picker */}
          {preset === 'custom' && (
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
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

          {/* Location Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#1346a1]"
            >
              <option value="all">All Retail Hubs (BEL, DAV, SHI)</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#1346a1]"
            >
              <option value="all">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={employeeStatus}
              onChange={(e) => setEmployeeStatus(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#1346a1]"
            >
              <option value="ALL">All Employment Statuses</option>
              <option value="ACTIVE">Active Staff Only</option>
              <option value="PROBATION">Probation Only</option>
              <option value="INACTIVE">Inactive / Separated</option>
            </select>
          </div>

          {/* Reset Filters */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Reset Filters"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
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

      {/* 2. Top Summary Cards (14 KPIs) */}
      <SummaryCardGrid
        counts={summaryCounts}
        comparison={summaryComparison}
        loading={loading}
        onCardClick={handleCardClick}
        selectedCategory={showDrillDown ? drillDownCategory : undefined}
      />

      {/* 3. Main Connected-Dot Graph Visualization */}
      <ConnectedDotMainGraph
        points={timelinePoints}
        loading={loading}
        onPointClick={handleGraphPointClick}
        selectedDate={showDrillDown ? drillDownTargetDate : null}
      />

      {/* 4. Interactive Drill-Down Table (When Activated) */}
      {showDrillDown && (
        <DrillDownRecordsTable
          category={drillDownCategory}
          categoryTitle={drillDownTitle}
          targetDate={drillDownTargetDate}
          rows={drillDownRows}
          total={drillDownTotal}
          page={drillDownPage}
          limit={15}
          totalPages={drillDownTotalPages}
          loading={drillDownLoading}
          search={drillDownSearch}
          onSearchChange={(s) => {
            setDrillDownSearch(s);
            setDrillDownPage(1);
          }}
          onPageChange={setDrillDownPage}
          onClose={() => setShowDrillDown(false)}
          onSelectEmployee={(empId) => {
            setSelectedEmployeeId(empId);
            window.scrollTo({ top: 900, behavior: 'smooth' });
          }}
        />
      )}

      {/* 5. Hourly Distribution and Location Breakdown Row */}
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

      {/* 6. Late Arrival & Punctuality Analytics */}
      <PunctualitySection
        trend={punctualityTrend}
        repeatOffenders={repeatOffenders}
        loading={loading}
        onSelectEmployee={(empId) => setSelectedEmployeeId(empId)}
      />

      {/* 7. Employee-Wise Individual Activity Deep-Dive */}
      <EmployeeActivityDeepDive
        selectedEmployeeId={selectedEmployeeId}
        onSelectEmployee={(id) => setSelectedEmployeeId(id)}
        dateRange={{
          startDate: customStartDate || '',
          endDate: customEndDate || '',
          preset,
        }}
      />

      {/* 8. Long-Term HR History & Tenure Progression */}
      <LongTermHistorySection
        joiningTrend={joiningTrend}
        departmentBreakdown={deptBreakdown}
        statusBreakdown={statusBreakdown}
        loading={loading}
      />
    </div>
  );
}
