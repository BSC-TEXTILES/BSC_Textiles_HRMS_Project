'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ResponsiveContainer, Line, XAxis, YAxis, Tooltip, type TooltipProps, CartesianGrid, AreaChart, Area } from 'recharts';
import { 
  ArrowLeft, 
  Users, 
  MapPin, 
  Layers, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  RefreshCw, 
  X,
  Building2,
  ShieldCheck,
  Briefcase,
  Search,
  AlertTriangle,
  Calendar,
  Activity,
  Filter,
  Check,
  UserCheck,
  UserX,
  Gauge,
  Radio,
  Wifi,
  Cpu,
  ChevronRight,
  Info
} from 'lucide-react';

interface StaffItem {
  id: string;
  code: string | null;
  name: string | null;
  dept: string | null;
  zone: string | null;
  role: string | null;
  punchIn?: string | null;
  status?: string | null;
  terminal?: string | null;
  reason?: string | null;
  detail?: string | null;
  expectedShift?: string | null;
}

interface SensorFeedItem {
  terminalId: string | null;
  terminalName: string | null;
  timestamp: string | null;
  employeeCode: string | null;
  employeeName: string | null;
  authMethod: string | null;
  signalHealth: string | null;
  status: string | null;
}

interface HourlyTrendItem {
  hour: string;
  occupancy: number;
}

interface CapacitySlot {
  slotNumber: number;
  slotName?: string | null;
  isOccupied?: boolean;
  unoccupiedReason?: string | null;
  occupant?: {
    name?: string | null;
    code?: string | null;
    punchIn?: string | null;
  } | null;
}

interface CapacityUtilization {
  occupied: number;
  capacity: number;
  pct: number | null;
  unoccupiedSlot?: { slotNumber: number; slotName: string; reason: string } | null;
  slots: Array<{
    slotNumber: number;
    slotName: string;
    isOccupied: boolean;
    occupant?: { name: string; code: string; role?: string; punchIn: string | null } | null;
    unoccupiedReason?: string | null;
  }>;
}

interface FloorZone {
  id: string;
  name: string;
  badge?: string | null;
  count: number;
  /** Seating capacity is not modelled in the database; null means unreported. */
  capacity: number | null;
  occupancyPct: number | null;
  status: string;
  staff: StaffItem[];
  /** Only present where HRMS models slot capacity; null means unreported. */
  capacityUtilization?: CapacityUtilization | null;
  sensorFeed?: SensorFeedItem[];
  hourlyTrend?: HourlyTrendItem[];
}

interface PresenceData {
  summary: {
    presentCount: number;
    expectedTotal: number | null;
    missingCount: number;
    floorOccupancyRate: number | null;
    occupancyDelta: string | null;
    lastWeekAverage: number | null;
    recordsToday?: number;
  };
  missingReasonsSummary?: unknown;
  presentStaff: StaffItem[];
  missingStaff: StaffItem[];
  departmentSplit: Array<{
    name: string;
    present: number;
    expected: number;
    pct: number;
    status: string;
    color: string;
  }>;
  floorZones: FloorZone[];
  historicalTrend: Array<{
    day: string;
    today: number | null;
    lastWeek: number | null;
  }>;
}

type ActiveViewType = 'roster' | 'zones' | 'missing' | 'weekly';

const CACHE_TTL_MS = 15000;
let presenceCache: { data: PresenceData; timestamp: number } | null = null;

/** Honest placeholder for anything the backend did not report. */
const NO_DATA = '—';

function formatPercent(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : NO_DATA;
}

function formatCount(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : NO_DATA;
}

/** Renders an attendance status code as readable text without inventing a category. */
function reasonLabel(reason: string | null | undefined): string {
  if (!reason) return 'Status not reported';
  return reason
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function getInitials(name?: string | null): string {
  if (!name) return NO_DATA;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return NO_DATA;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function FloorPresenceDetail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  locationId?: string;
}) {
  const [data, setData] = useState<PresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const dataRef = useRef<PresenceData | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // The 4 Interactive Filter Cards State
  const [activeView, setActiveView] = useState<ActiveViewType>('roster');

  // Sub-filters for active views
  const [rosterSearch, setRosterSearch] = useState('');
  const [rosterDeptFilter, setRosterDeptFilter] = useState('all');
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [missingCategoryFilter, setMissingCategoryFilter] = useState<'ALL' | 'LEAVE' | 'REMOTE' | 'PENDING'>('ALL');
  const [missingSearch, setMissingSearch] = useState('');
  const [lastRefreshedSec, setLastRefreshedSec] = useState(0);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && presenceCache && now - presenceCache.timestamp < CACHE_TTL_MS) {
      dataRef.current = presenceCache.data;
      setData(presenceCache.data);
      setLoading(false);
      return;
    }

    try {
      if (!dataRef.current) setLoading(true);
      const res = await fetch('/api/presence/live-floor', { credentials: 'include' }).catch(() => null);
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
          presenceCache = { data: json.data, timestamp: now };
          dataRef.current = json.data;
          setData(json.data);
          setLastRefreshedSec(0);
        }
      }
    } catch {
      // Gracefully maintain existing cache or state
    } finally {
      setLoading(false);
    }

  }, []);

  useEffect(() => {
    if (open) {
      fetchData();
      const interval = setInterval(() => {
        fetchData(true);
      }, 10000);
      const timer = setInterval(() => {
        setLastRefreshedSec((prev) => prev + 1);
      }, 1000);

      return () => {
        clearInterval(interval);
        clearInterval(timer);
      };
    }
  }, [open, fetchData]);

  // Filtered Roster Staff
  const filteredRoster = useMemo(() => {
    if (!data?.presentStaff) return [];
    return data.presentStaff.filter((staff) => {
      if (rosterDeptFilter !== 'all' && !(staff.dept || '').toLowerCase().includes(rosterDeptFilter.toLowerCase())) {
        return false;
      }
      if (rosterSearch) {
        const q = rosterSearch.toLowerCase();
        return (
          (staff.name || '').toLowerCase().includes(q) ||
          (staff.code || '').toLowerCase().includes(q) ||
          (staff.dept || '').toLowerCase().includes(q) ||
          (staff.zone || '').toLowerCase().includes(q) ||
          (staff.terminal || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data?.presentStaff, rosterDeptFilter, rosterSearch]);

  // Filtered Missing Staff
  const filteredMissing = useMemo(() => {
    if (!data?.missingStaff) return [];
    return data.missingStaff.filter((staff) => {
      const reason = (staff.reason || '').toUpperCase();
      if (missingCategoryFilter === 'LEAVE' && !reason.includes('LEAVE')) return false;
      if (missingCategoryFilter === 'REMOTE' && !reason.includes('REMOTE') && !reason.includes('FIELD')) return false;
      if (
        missingCategoryFilter === 'PENDING' &&
        !reason.includes('PENDING') &&
        !reason.includes('WEEKLY_OFF') &&
        !reason.includes('OFF')
      ) {
        return false;
      }

      if (missingSearch) {
        const q = missingSearch.toLowerCase();
        return (
          (staff.name || '').toLowerCase().includes(q) ||
          (staff.code || '').toLowerCase().includes(q) ||
          (staff.dept || '').toLowerCase().includes(q) ||
          (staff.detail || '').toLowerCase().includes(q) ||
          (staff.expectedShift || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [data?.missingStaff, missingCategoryFilter, missingSearch]);

  // Absence categories counted from the rows that actually exist.
  const missingCounts = useMemo(() => {
    const rows = data?.missingStaff || [];
    const count = (predicate: (reason: string) => boolean) =>
      rows.filter((r) => predicate((r.reason || '').toUpperCase())).length;
    return {
      total: rows.length,
      leave: count((reason) => reason.includes('LEAVE')),
      remote: count((reason) => reason.includes('REMOTE') || reason.includes('FIELD')),
      pending: count((reason) => reason.includes('PENDING') || reason.includes('OFF')),
    };
  }, [data?.missingStaff]);

  // Active selected zone — no invented fallback telemetry.
  const activeZone = useMemo(() => {
    if (!selectedZoneId || !data?.floorZones) return null;
    const rawZone = data.floorZones.find((z) => z.id === selectedZoneId);
    if (!rawZone) return null;
    return {
      ...rawZone,
      staff: Array.isArray(rawZone.staff) ? rawZone.staff : [],
      capacityUtilization: rawZone.capacityUtilization ?? null,
      sensorFeed: Array.isArray(rawZone.sensorFeed) ? rawZone.sensorFeed : [],
      hourlyTrend: Array.isArray(rawZone.hourlyTrend) ? rawZone.hourlyTrend : [],
    };
  }, [selectedZoneId, data?.floorZones]);

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
            <div className="w-8 h-8 rounded-lg bg-[#eff4ff] text-[#0058be] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">On-Floor Live Presence — Staff & Zone Telemetry</h2>
              <p className="text-[11px] text-slate-500">Karnataka Hub Floor Occupancy • Belagavi Flagship Focus</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${loading ? 'animate-spin' : ''}`} />
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
            <div className="h-48 bg-white rounded-xl border border-slate-200" />
            <div className="h-64 bg-white rounded-xl border border-slate-200" />
          </div>
        ) : (
          <>
            {/* ========================================================================= */}
            {/* 4 Interactive White Draggable Cards (Top Header Controls)                */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Live On-Floor Staff -> Triggers Live Staff Roster */}
              <div
                draggable={true}
                role="button"
                tabIndex={0}
                onClick={() => setActiveView('roster')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveView('roster');
                  }
                }}
                aria-label="Filter to Live Staff Roster view"
                className={`bg-white p-4 rounded-xl border shadow-xs cursor-pointer select-none transition-all duration-200 hover:shadow-md hover:scale-[1.01] text-left ${
                  activeView === 'roster'
                    ? 'ring-2 ring-[#0058be] border-[#0058be] bg-blue-50/20 shadow-md'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Live On-Floor Staff
                  </span>
                  {activeView === 'roster' ? (
                    <span className="w-2 h-2 rounded-full bg-[#0058be] animate-pulse" />
                  ) : (
                    <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
                <div className="text-2xl font-bold text-[#0b1c30] mt-1">
                  {formatCount(data?.summary?.presentCount)}{' '}
                  <span className="text-xs font-normal text-slate-400">/ {formatCount(data?.summary?.expectedTotal)}</span>
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Checked in and still on shift</span>
                </div>
              </div>

              {/* Card 2: Floor Occupancy Rate -> Triggers Zone Occupancy Breakdown */}
              <div
                draggable={true}
                role="button"
                tabIndex={0}
                onClick={() => setActiveView('zones')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveView('zones');
                  }
                }}
                aria-label="Filter to Zone Occupancy Breakdown view"
                className={`bg-white p-4 rounded-xl border shadow-xs cursor-pointer select-none transition-all duration-200 hover:shadow-md hover:scale-[1.01] text-left ${
                  activeView === 'zones'
                    ? 'ring-2 ring-[#0058be] border-[#0058be] bg-blue-50/20 shadow-md'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Floor Occupancy Rate
                  </span>
                  {activeView === 'zones' ? (
                    <span className="w-2 h-2 rounded-full bg-[#0058be] animate-pulse" />
                  ) : (
                    <Gauge className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
                <div className="text-2xl font-bold text-[#0058be] mt-1">
                  {formatPercent(data?.summary?.floorOccupancyRate)}
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                  {data?.summary?.occupancyDelta ?? 'No shift comparison reported'}
                </div>
              </div>

              {/* Card 3: Missing Staff Breakdown -> Triggers Missing Staff Audit */}
              <div
                draggable={true}
                role="button"
                tabIndex={0}
                onClick={() => setActiveView('missing')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveView('missing');
                  }
                }}
                aria-label="Filter to Missing Staff Audit view"
                className={`bg-white p-4 rounded-xl border shadow-xs cursor-pointer select-none transition-all duration-200 hover:shadow-md hover:scale-[1.01] text-left ${
                  activeView === 'missing'
                    ? 'ring-2 ring-amber-500 border-amber-500 bg-amber-50/40 shadow-md'
                    : 'border-slate-200 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider">
                    Missing Staff Breakdown
                  </span>
                  {activeView === 'missing' ? (
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  ) : (
                    <UserX className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
                <div className="text-2xl font-bold text-slate-800 mt-1">
                  {formatCount(data?.summary?.missingCount)} Staff
                </div>
                <div className="text-[11px] text-slate-500 mt-1 truncate">
                  {missingCounts.leave} On Leave • {missingCounts.remote} Remote/Field
                </div>
              </div>

              {/* Card 4: Last Week Baseline -> Triggers Weekly Comparison Chart */}
              <div
                draggable={true}
                role="button"
                tabIndex={0}
                onClick={() => setActiveView('weekly')}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setActiveView('weekly');
                  }
                }}
                aria-label="Filter to Weekly Comparison Chart view"
                className={`bg-white p-4 rounded-xl border shadow-xs cursor-pointer select-none transition-all duration-200 hover:shadow-md hover:scale-[1.01] text-left ${
                  activeView === 'weekly'
                    ? 'ring-2 ring-emerald-600 border-emerald-600 bg-emerald-50/20 shadow-md'
                    : 'border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    Last Week Baseline
                  </span>
                  {activeView === 'weekly' ? (
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  ) : (
                    <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
                <div className="text-2xl font-bold text-emerald-600 mt-1">
                  {formatPercent(data?.summary?.lastWeekAverage)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {data?.summary?.lastWeekAverage === null || data?.summary?.lastWeekAverage === undefined
                    ? 'No prior-week occupancy recorded'
                    : 'Baseline from stored attendance'}
                </div>
              </div>
            </div>

            {/* Contextual Active View Banner */}
            <div className={`p-3 rounded-xl border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs ${
              activeView === 'roster'
                ? 'bg-blue-50 border-blue-200 text-[#0058be]'
                : activeView === 'zones'
                ? 'bg-blue-50 border-blue-200 text-[#0058be]'
                : activeView === 'missing'
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <div className="flex items-center gap-2">
                {activeView === 'roster' && <UserCheck className="w-4 h-4 shrink-0 text-[#0058be]" />}
                {activeView === 'zones' && <Layers className="w-4 h-4 shrink-0 text-[#0058be]" />}
                {activeView === 'missing' && <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />}
                {activeView === 'weekly' && <TrendingUp className="w-4 h-4 shrink-0 text-emerald-600" />}

                <span>
                  {activeView === 'roster' && (
                    <><strong>Live Staff Roster View:</strong> Showing {data?.presentStaff.length ?? 0} employee{data?.presentStaff.length === 1 ? '' : 's'} with a recorded check-in and no clock-out yet.</>
                  )}
                  {activeView === 'zones' && (
                    <><strong>Zone Occupancy Breakdown View:</strong> Floors reported by the terminals today — {data?.floorZones.length ?? 0} zone{data?.floorZones.length === 1 ? '' : 's'} with check-in telemetry.</>
                  )}
                  {activeView === 'missing' && (
                    <><strong>Missing Staff Audit View:</strong> {data?.summary?.missingCount ?? 0} personnel not on the floor, grouped by the attendance status the system holds.</>
                  )}
                  {activeView === 'weekly' && (
                    <><strong>Weekly Comparison Chart View:</strong> Occupancy across the last 7 days, only where the database holds those attendance rows.</>
                  )}
                </span>
              </div>

              <div className="text-[11px] font-bold shrink-0 self-end sm:self-auto flex items-center gap-2">
                <span>View: {activeView.toUpperCase()}</span>
                {activeView !== 'roster' && (
                  <button
                    onClick={() => setActiveView('roster')}
                    className="underline hover:opacity-80 transition-opacity ml-1"
                  >
                    Switch to Roster
                  </button>
                )}
              </div>
            </div>

            {/* ========================================================================= */}
            {/* VIEW 1: Live Staff Roster (Triggered by Card 1)                           */}
            {/* ========================================================================= */}
            {activeView === 'roster' && (
              <div className="space-y-4">
                {/* Search & Department Filter Bar */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="flex flex-1 items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Filter active staff by name, employee code, department, or terminal..."
                      value={rosterSearch}
                      onChange={(e) => setRosterSearch(e.target.value)}
                      className="bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none w-full"
                    />
                    {rosterSearch && (
                      <button onClick={() => setRosterSearch('')} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={rosterDeptFilter}
                      onChange={(e) => setRosterDeptFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-200 text-xs text-slate-700 px-3 py-2 rounded-lg font-medium focus:outline-none"
                    >
                      <option value="all">All Departments</option>
                      <option value="Manufacturing">Manufacturing (Looms & Mill)</option>
                      <option value="Admin">Admin & HR</option>
                      <option value="Retail">Retail & Showroom</option>
                      <option value="Security">Security & Facilities</option>
                    </select>

                    {(rosterSearch || rosterDeptFilter !== 'all') && (
                      <button
                        onClick={() => {
                          setRosterSearch('');
                          setRosterDeptFilter('all');
                        }}
                        className="text-xs text-[#0058be] hover:underline font-bold px-2"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>

                {/* Staff Roster Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Live Staff Roster ({filteredRoster.length} Verified Present On-Floor)
                    </span>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>HRMS Checked-In Records</span>
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">Employee</th>
                          <th className="py-2.5 px-4">Role & Designation</th>
                          <th className="py-2.5 px-4">Department</th>
                          <th className="py-2.5 px-4">Zone & Terminal Location</th>
                          <th className="py-2.5 px-4">Last Detected Time</th>
                          <th className="py-2.5 px-4">Live Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredRoster.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">
                              No employees found matching filter criteria.
                            </td>
                          </tr>
                        ) : (
                          filteredRoster.map((staff, idx) => (
                            <tr key={`${staff.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-[#eff4ff] text-[#0058be] font-bold text-[10px] flex items-center justify-center border border-blue-200 shrink-0">
                                    {getInitials(staff.name)}
                                  </div>
                                  <div>
                                    <div className="font-bold text-[#0b1c30]">{staff.name || 'Unmatched device ID'}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{staff.code || NO_DATA}</div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3 px-4 font-semibold text-slate-700">
                                {staff.role || NO_DATA}
                              </td>

                              <td className="py-3 px-4 text-slate-600">
                                {staff.dept || NO_DATA}
                              </td>

                              <td className="py-3 px-4">
                                <div className="flex flex-col">
                                  <span className="font-medium text-slate-800 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-[#0058be]" />
                                    {staff.zone}
                                  </span>
                                  {staff.terminal && (
                                    <span className="text-[10px] text-slate-400 font-mono ml-4">
                                      Sensor Terminal: {staff.terminal}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                                {staff.punchIn || NO_DATA}
                              </td>

                              <td className="py-3 px-4">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  <span>ON-FLOOR</span>
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 2: Zone Occupancy Breakdown (Triggered by Card 2)                   */}
            {/* ========================================================================= */}
            {/* ========================================================================= */}
            {/* VIEW 2: Zone Occupancy Breakdown (Triggered by Card 2)                   */}
            {/* ========================================================================= */}
            {activeView === 'zones' && (
              <div className="space-y-4">
                {/* 3 Interactive White Draggable Zone Cards */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {data?.floorZones.map((zone) => {
                    const isSelected = selectedZoneId === zone.id;
                    return (
                      <div
                        key={zone.id}
                        draggable={true}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedZoneId(isSelected ? null : zone.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedZoneId(isSelected ? null : zone.id);
                          }
                        }}
                        aria-label={`Interactive Zone Card: ${zone.name}. Status: ${zone.status}. On floor: ${zone.count}.`}
                        className={`p-4 rounded-xl border bg-white shadow-xs cursor-pointer select-none transition-all duration-200 hover:shadow-md hover:scale-[1.01] text-left ${
                          isSelected
                            ? 'ring-2 ring-[#0058be] border-[#0058be] bg-blue-50/25 shadow-md'
                            : 'border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Spatial Zone Unit
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                zone.id === 'zone-a'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : zone.id === 'zone-b'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              }`}
                            >
                              {zone.status}
                            </span>
                            {isSelected && (
                              <span className="w-2 h-2 rounded-full bg-[#0058be] animate-pulse" title="Active View" />
                            )}
                          </div>
                        </div>

                        <h4 className="text-sm font-bold text-[#0b1c30]">{zone.name}</h4>

                        <div className="flex items-baseline gap-1.5 my-2">
                          <span className="text-2xl font-bold text-[#0058be]">{zone.count}</span>
                          <span className="text-xs text-slate-400">
                            {zone.capacity === null || zone.capacity === undefined ? 'Capacity not reported' : `/ ${zone.capacity} Optimal Capacity`}
                          </span>
                          <span className="ml-auto text-xs font-mono font-bold text-slate-700">{formatPercent(zone.occupancyPct)}</span>
                        </div>

                        {/* Progress / Concentration Bar */}
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden my-2">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              zone.id === 'zone-a'
                                ? 'bg-gradient-to-r from-blue-500 to-indigo-600'
                                : zone.id === 'zone-b'
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-600'
                                : 'bg-gradient-to-r from-blue-500 to-emerald-500'
                            }`}
                            style={{ width: `${zone.occupancyPct ?? 0}%` }}
                          />
                        </div>

                        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100 mt-2">
                          <span>Occupancy Concentration:</span>
                          <span className="font-bold text-slate-700 font-mono">{formatPercent(zone.occupancyPct)}</span>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            {zone.staff?.length ?? 0} Active Personnel
                          </span>
                          <span
                            className={`font-semibold flex items-center gap-1 ${
                              isSelected ? 'text-[#0058be]' : 'text-slate-400 hover:text-slate-600'
                            }`}
                          >
                            <span>{isSelected ? 'Focused Details' : 'Click to View'}</span>
                            <ChevronRight
                              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                isSelected ? 'rotate-90 text-[#0058be]' : ''
                              }`}
                            />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ========================================================================= */}
                {/* FOCUSED ZONE DETAIL VIEW (When one of the 3 Zone cards is selected)     */}
                {/* ========================================================================= */}
                {selectedZoneId && activeZone ? (
                  <div className="space-y-4 pt-1">
                    {/* Header Controls for Focused Zone */}
                    <div className="bg-white p-4 rounded-xl border border-[#0058be]/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-[#eff4ff] text-[#0058be] flex items-center justify-center font-bold text-sm border border-blue-200 shrink-0">
                          <MapPin className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-[#0b1c30]">
                              {activeZone.name} — Focused Detail View
                            </h3>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-[#0058be] border border-blue-200">
                              {activeZone.status}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500">
                            {activeZone.count} on this floor •{' '}
                            {activeZone.capacity === null || activeZone.capacity === undefined
                              ? 'Capacity not reported'
                              : `${activeZone.capacity} slots recorded`} •{' '}
                            {formatPercent(activeZone.occupancyPct)} concentration • recorded terminal punch events
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-start sm:self-center">
                        <button
                          onClick={() => setSelectedZoneId(null)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors"
                        >
                          <ArrowLeft className="w-3.5 h-3.5 text-[#0058be]" />
                          <span>Back to All 3 Zones</span>
                        </button>
                      </div>
                    </div>

                    {/* Section 1: Full Personnel Roster */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-[#0058be]" />
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Active Personnel Roster in {activeZone.name} ({activeZone.staff.length} Detected)
                          </h4>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Live Terminal Verification
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/50 text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-4">Employee</th>
                              <th className="py-2.5 px-4">Designation</th>
                              <th className="py-2.5 px-4">Department</th>
                              <th className="py-2.5 px-4">Terminal Sensor Location</th>
                              <th className="py-2.5 px-4">Punch-In Time</th>
                              <th className="py-2.5 px-4">Presence Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeZone.staff && activeZone.staff.length > 0 ? (
                              activeZone.staff.map((staff, idx) => (
                                <tr key={`${staff.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="flex items-center gap-2.5">
                                      <div className="w-7 h-7 rounded-full bg-[#eff4ff] text-[#0058be] font-bold text-[10px] flex items-center justify-center border border-blue-200 shrink-0">
                                        {getInitials(staff.name)}
                                      </div>
                                      <div>
                                        <div className="font-bold text-[#0b1c30]">{staff.name || 'Unmatched device ID'}</div>
                                        <div className="text-[10px] text-slate-400 font-mono">{staff.code || NO_DATA}</div>
                                      </div>
                                    </div>
                                  </td>

                                  <td className="py-3 px-4 font-semibold text-slate-700">
                                    {staff.role || NO_DATA}
                                  </td>

                                  <td className="py-3 px-4 text-slate-600">
                                    {staff.dept || NO_DATA}
                                  </td>

                                  <td className="py-3 px-4">
                                    <span className="font-medium text-slate-800 flex items-center gap-1">
                                      <MapPin className="w-3 h-3 text-[#0058be]" />
                                      {staff.terminal || `${activeZone.name} Sensor`}
                                    </span>
                                  </td>

                                  <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                                    {staff.punchIn || NO_DATA}
                                  </td>

                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                      <span>ON-FLOOR</span>
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="py-8 text-center text-slate-400">
                                  No active personnel currently recorded in this zone
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Section 2: Live Sensor Feed / Terminal Log */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-[#0058be]" />
                          <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                            Live Sensor Feed & Detection Logs ({activeZone.name})
                          </h4>
                        </div>
                        <span className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                          <Wifi className="w-3.5 h-3.5 text-blue-500" />
                          <span>Recorded punch events</span>
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/50 text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-4">Terminal Scanner</th>
                              <th className="py-2.5 px-4">Timestamp</th>
                              <th className="py-2.5 px-4">Detected Personnel</th>
                              <th className="py-2.5 px-4">Biometric / Auth Mode</th>
                              <th className="py-2.5 px-4">Optical Latency & Health</th>
                              <th className="py-2.5 px-4">Verification</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {activeZone.sensorFeed && activeZone.sensorFeed.length > 0 ? (
                              activeZone.sensorFeed.map((feed, idx) => (
                                <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                                  <td className="py-3 px-4">
                                    <div className="font-semibold text-slate-800">{feed.terminalName}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{feed.terminalId}</div>
                                  </td>
                                  <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                                    {feed.timestamp || NO_DATA}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-[#0b1c30]">{feed.employeeName || 'Unmatched device ID'}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{feed.employeeCode || NO_DATA}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                      {feed.authMethod || 'Not reported by device'}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-600 text-[11px] font-mono">
                                    {feed.signalHealth || NO_DATA}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {feed.status || NO_DATA}
                                    </span>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={6} className="py-6 text-center text-slate-400">
                                  No recent sensor logs recorded for this zone.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Section 3: Capacity Utilization Breakdown (only when reported) */}
                    {(activeZone.capacityUtilization?.slots?.length ?? 0) > 0 ? (
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-[#0058be]" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Capacity Utilization Breakdown ({activeZone.capacityUtilization?.occupied ?? NO_DATA} / {activeZone.capacityUtilization?.capacity ?? NO_DATA} Slots Occupied)
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Precise allocation audit identifying current occupants and unoccupied position details
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span className="text-xs font-semibold text-slate-600">Capacity Rate:</span>
                          <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-blue-50 text-[#0058be] border border-blue-200">
                            {formatPercent(activeZone.capacityUtilization?.pct ?? activeZone.occupancyPct)}
                          </span>
                        </div>
                      </div>

                      {/* Unoccupied Slot Callout Banner */}
                      {activeZone.capacityUtilization?.unoccupiedSlot && (
                        <div className="p-3.5 rounded-lg bg-amber-50/80 border border-amber-200 flex items-start gap-3">
                          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                          <div className="text-xs">
                            <span className="font-bold text-amber-900">
                              Unoccupied Slot #{activeZone.capacityUtilization.unoccupiedSlot.slotNumber}:
                            </span>{' '}
                            <span className="font-semibold text-amber-800">
                              {activeZone.capacityUtilization.unoccupiedSlot.slotName}
                            </span>
                            <div className="text-[11px] text-amber-700 mt-0.5 font-medium">
                              Allocation Note: {activeZone.capacityUtilization.unoccupiedSlot.reason}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Slot-by-Slot Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                        {activeZone.capacityUtilization?.slots?.map((slot: CapacitySlot) => (
                          <div
                            key={slot.slotNumber}
                            className={`p-3.5 rounded-lg border text-left transition-all ${
                              slot.isOccupied
                                ? 'bg-slate-50/60 border-slate-200'
                                : 'bg-amber-50/40 border-dashed border-amber-300'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs mb-1.5">
                              <span className="font-mono font-bold text-slate-500">
                                Slot #{slot.slotNumber}
                              </span>
                              {slot.isOccupied ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                  OCCUPIED
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  UNOCCUPIED
                                </span>
                              )}
                            </div>

                            <div className="font-bold text-xs text-[#0b1c30] truncate">
                              {slot.slotName}
                            </div>

                            {slot.isOccupied && slot.occupant ? (
                              <div className="mt-2 pt-2 border-t border-slate-200/60 text-[11px]">
                                <div className="font-semibold text-slate-800">{slot.occupant.name}</div>
                                <div className="text-slate-500 text-[10px] font-mono flex items-center justify-between mt-0.5">
                                  <span>{slot.occupant.code || NO_DATA}</span>
                                  <span className="text-slate-600 font-semibold">{slot.occupant.punchIn || NO_DATA}</span>
                                </div>
                              </div>
                            ) : (
                              <div className="mt-2 pt-2 border-t border-amber-200/60 text-[11px] text-amber-800 font-medium">
                                {slot.unoccupiedReason || 'Unallocated slot'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    ) : (
                      <div className="bg-white p-4 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 flex items-center gap-2">
                        <Info className="w-4 h-4 text-slate-400 shrink-0" />
                        <span>
                          Slot-level capacity is not modelled in HRMS, so this floor has no seat allocation to report.
                        </span>
                      </div>
                    )}

                    {/* Section 4: Zone Occupancy Concentration Trend */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#0058be]" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Zone Occupancy Concentration Trend ({formatPercent(activeZone.occupancyPct)})
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Hourly presence curve, only where punch history exists for this floor
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold block">CURRENT CONCENTRATION</span>
                            <span className="text-sm font-bold text-[#0058be] font-mono">{formatPercent(activeZone.occupancyPct)}</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold block">OPERATIONAL CADENCE</span>
                            <span className="text-xs font-bold text-emerald-600">{activeZone.status}</span>
                          </div>
                        </div>
                      </div>

                      {(activeZone.hourlyTrend?.length ?? 0) === 0 ? (
                        <div className="h-48 w-full flex items-center justify-center text-xs text-slate-400">
                          No hourly occupancy history reported for this floor.
                        </div>
                      ) : (
                      <div className="h-48 w-full pt-2">
                        {isMounted && (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={activeZone.hourlyTrend}
                              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient id={`zoneGrad-${activeZone.id}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#0058be" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="#0058be" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis
                                dataKey="hour"
                                tickLine={false}
                                axisLine={{ stroke: '#cbd5e1' }}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                              />
                              <YAxis
                                domain={[0, 100]}
                                tickLine={false}
                                axisLine={false}
                                tick={{ fontSize: 11, fill: '#64748b' }}
                                tickFormatter={(v: number | string) => `${v}%`}
                              />
                              <Tooltip
                                content={({ active, payload, label }: TooltipProps<number, string>) => {
                                  if (active && payload && payload.length) {
                                    const val = payload[0]?.value ?? 0;
                                    return (
                                      <div className="bg-[#0b1c30] text-white p-2.5 rounded-lg shadow-lg text-xs space-y-1">
                                        <div className="font-bold text-slate-300">{label} Window</div>
                                        <div className="text-emerald-400 font-mono font-bold">
                                          Occupancy: {val}%
                                        </div>
                                      </div>
                                    );
                                  }
                                  return null;
                                }}
                              />
                              <Area
                                type="monotone"
                                dataKey="occupancy"
                                stroke="#0058be"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill={`url(#zoneGrad-${activeZone.id})`}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* ========================================================================= */
                  /* OVERVIEW VIEW (When no specific Zone card is clicked)                    */
                  /* ========================================================================= */
                  <>
                    {/* Helper Navigation Tip */}
                    <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-200/60 flex items-center justify-between text-xs text-blue-900">
                      <div className="flex items-center gap-2">
                        <Info className="w-4 h-4 text-[#0058be] shrink-0" />
                        <span>
                          <strong>Interactive Zone Telemetry:</strong> Click any zone card above to reveal the staff checked in on that floor, the punch events the terminals reported for it, and any capacity breakdown HRMS holds.
                        </span>
                      </div>
                    </div>

                    {/* Department Headcount Split & Coverage */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#0058be]" />
                          Department Coverage — Checked-In vs Roster
                        </h3>
                        <span className="text-[11px] text-slate-400">
                          Total On Roster: {formatCount(data?.summary?.expectedTotal)} Employees
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                        {(data?.departmentSplit || []).map((dept) => {
                          const safeExpected = Math.max(0, dept.expected || 0);
                          const safePresent = Math.max(0, dept.present || 0);
                          const pct = safeExpected > 0 ? Math.min(100, Math.round((safePresent / safeExpected) * 100)) : 0;
                          return (
                            <div key={dept.name} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-[#0b1c30]">{dept.name}</span>
                                <span className="font-bold text-slate-700 font-mono">
                                  {safePresent} / {safeExpected}
                                </span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: dept.color || '#0058be',
                                  }}
                                />
                              </div>
                              <div className="flex items-center justify-between text-[10px] text-slate-500">
                                <span>{dept.status || 'Active'}</span>
                                <span className="font-bold text-slate-700 font-mono">
                                  {pct}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Headcount Target vs Actual Zone Summary Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                        <h4 className="text-xs font-bold text-slate-700">Zone-by-Zone Headcount Target vs Live Sensor Telemetry</h4>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-50/70 text-slate-500 font-bold border-b border-slate-200">
                            <tr>
                              <th className="py-2.5 px-4">Zone Cluster</th>
                              <th className="py-2.5 px-4">Operational Section</th>
                              <th className="py-2.5 px-4 text-center">Optimal Capacity</th>
                              <th className="py-2.5 px-4 text-center">Live Verified Headcount</th>
                              <th className="py-2.5 px-4 text-center">Occupancy Rate</th>
                              <th className="py-2.5 px-4">Telemetry Health</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(data?.floorZones || []).map((zone) => (
                              <tr key={zone.id} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-bold text-[#0b1c30]">{zone.id.toUpperCase()}</td>
                                <td className="py-3 px-4 font-semibold text-slate-700">{zone.name}</td>
                                <td className="py-3 px-4 text-center font-mono text-slate-600">
                                  {zone.capacity === null || zone.capacity === undefined ? NO_DATA : `${zone.capacity} Staff`}
                                </td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-[#0058be]">{zone.count} Staff</td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">{formatPercent(zone.occupancyPct)}</td>
                                <td className="py-3 px-4">
                                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    {zone.status}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 3: Missing Staff Audit (Triggered by Card 3)                         */}
            {/* ========================================================================= */}
            {activeView === 'missing' && (
              <div className="space-y-4">
                {/* Categorization Summary Bar & Filters */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setMissingCategoryFilter('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        missingCategoryFilter === 'ALL'
                          ? 'bg-slate-800 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      All Missing ({missingCounts.total})
                    </button>

                    <button
                      onClick={() => setMissingCategoryFilter('LEAVE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        missingCategoryFilter === 'LEAVE'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      Leave Status ({missingCounts.leave} Staff)
                    </button>

                    <button
                      onClick={() => setMissingCategoryFilter('REMOTE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        missingCategoryFilter === 'REMOTE'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                      }`}
                    >
                      Remote / Field Duty ({missingCounts.remote} Staff)
                    </button>

                    <button
                      onClick={() => setMissingCategoryFilter('PENDING')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        missingCategoryFilter === 'PENDING'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      }`}
                    >
                      Roster Off / Later Shifts ({missingCounts.pending} Staff)
                    </button>
                  </div>

                  <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg w-full md:w-64">
                    <Search className="w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search missing personnel..."
                      value={missingSearch}
                      onChange={(e) => setMissingSearch(e.target.value)}
                      className="bg-transparent border-none text-xs text-slate-800 placeholder-slate-400 focus:outline-none w-full"
                    />
                    {missingSearch && (
                      <button onClick={() => setMissingSearch('')} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Audit Reconciliation Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-slate-700">
                        Missing Staff Audit ({filteredMissing.length} Personnel Listed)
                      </span>
                      <p className="text-[10px] text-slate-400">
                        Grouped only by the attendance status stored in HRMS — approvals are not inferred
                      </p>
                    </div>
                    <span className="text-[10px] bg-slate-50 text-slate-600 px-2.5 py-0.5 rounded-full font-bold border border-slate-200">
                      {data?.missingStaff?.length ?? 0} On Record
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">Employee</th>
                          <th className="py-2.5 px-4">Department</th>
                          <th className="py-2.5 px-4">Classification</th>
                          <th className="py-2.5 px-4">HRMS Justification / Authorization Detail</th>
                          <th className="py-2.5 px-4">Expected Schedule</th>
                          <th className="py-2.5 px-4">Compliance Audit</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredMissing.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="py-8 text-center text-slate-400">
                              No absent personnel found in this category.
                            </td>
                          </tr>
                        ) : (
                          filteredMissing.map((staff, idx) => (
                            <tr key={`${staff.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-bold text-[#0b1c30]">{staff.name || 'Unmatched device ID'}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{staff.code || NO_DATA}</div>
                              </td>

                              <td className="py-3 px-4 font-semibold text-slate-700">
                                {staff.dept || NO_DATA}
                              </td>

                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    (staff.reason || '').includes('LEAVE')
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : (staff.reason || '').includes('WEEKLY') || (staff.reason || '').includes('OFF')
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : (staff.reason || '').includes('REMOTE') || (staff.reason || '').includes('FIELD')
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {reasonLabel(staff.reason)}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-slate-600">
                                {staff.detail || 'No authorisation detail recorded'}
                              </td>

                              <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                                {staff.expectedShift || NO_DATA}
                              </td>

                              <td className="py-3 px-4">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                                  <ShieldCheck className="w-3 h-3 text-slate-400" />
                                  <span>Status on record</span>
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 4: Weekly Comparison Chart (Triggered by Card 4)                     */}
            {/* ========================================================================= */}
            {activeView === 'weekly' && (
              <div className="space-y-4">
                {/* Historical Occupancy Trend Line Chart */}
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 mb-2 border-b border-slate-100 gap-2">
                    <div>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                        Weekly Adherence Comparison: This Week vs Last Week Baseline
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Occupancy per day, computed only from attendance rows the database holds
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-1.5 bg-[#0058be] rounded-full" />
                        <span className="text-[11px] text-slate-700 font-bold">This Week</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3 h-1.5 bg-slate-400 rounded-full" />
                        <span className="text-[11px] text-slate-400 font-medium">Last Week Baseline</span>
                      </div>
                    </div>
                  </div>

                  <div className="h-48 w-full pt-3">
                    {isMounted && (
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data?.historicalTrend || []} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                          <defs>
                            <linearGradient id="presenceThisWeek" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#0058be" stopOpacity={0.25} />
                              <stop offset="95%" stopColor="#0058be" stopOpacity={0.0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis domain={[85, 95]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                          <Tooltip
                            content={({ active, payload }: TooltipProps<number, string>) => {
                              if (active && payload && payload.length) {
                                const item = payload[0]?.payload;
                                if (!item) return null;
                                const today = typeof item.today === 'number' ? item.today : Number(item.today) || 0;
                                const lastWeek = typeof item.lastWeek === 'number' ? item.lastWeek : Number(item.lastWeek) || 0;
                                const delta = (today - lastWeek).toFixed(1);
                                return (
                                  <div className="bg-[#0b1c30] text-white p-3 rounded-lg shadow-xl text-xs space-y-1">
                                    <div className="font-bold">{item.day}</div>
                                    <div className="text-blue-300">This Week: {today}%</div>
                                    <div className="text-slate-400">Last Week: {lastWeek}%</div>
                                    <div className="text-emerald-400 font-semibold pt-1 border-t border-slate-700">
                                      Adherence Gain: +{delta}%
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Area type="monotone" dataKey="today" stroke="#0058be" strokeWidth={3} fillOpacity={1} fill="url(#presenceThisWeek)" />
                          <Line type="monotone" dataKey="lastWeek" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: '#94a3b8' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                {/* Day-by-Day Analysis & Root Cause Breakdown Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Day-by-Day Occupancy Variance & Origin Breakdown</span>
                    <span className="text-[10px] font-bold text-[#0058be] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      {(data?.historicalTrend?.length ?? 0) > 0 ? `${data?.historicalTrend?.length ?? 0} days reported` : 'No days reported'}
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/70 text-slate-500 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">Roster Day</th>
                          <th className="py-2.5 px-4 text-center">This Week Occupancy</th>
                          <th className="py-2.5 px-4 text-center">Last Week Baseline</th>
                          <th className="py-2.5 px-4 text-center">Variance (Delta)</th>
                          <th className="py-2.5 px-4">Efficiency Improvement Origin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(data?.historicalTrend?.length ?? 0) === 0 ? (
                          <tr>
                            <td colSpan={5} className="py-8 text-center text-slate-400">
                              No occupancy history reported for the selected week.
                            </td>
                          </tr>
                        ) : (
                          (data?.historicalTrend || []).map((row) => {
                            const delta =
                              typeof row.today === 'number' && typeof row.lastWeek === 'number'
                                ? `${row.today - row.lastWeek >= 0 ? '+' : ''}${(row.today - row.lastWeek).toFixed(1)}%`
                                : NO_DATA;
                            return (
                              <tr key={row.day} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-bold text-[#0b1c30]">{row.day}</td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-[#0058be]">{formatPercent(row.today)}</td>
                                <td className="py-3 px-4 text-center font-mono text-slate-500">{formatPercent(row.lastWeek)}</td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">{delta}</td>
                                <td className="py-3 px-4 text-slate-600">Not reported</td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Data provenance note — replaces the unverifiable "key drivers" claims */}
                <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-950 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <Info className="w-4 h-4 text-emerald-600" />
                    <span>What this view is built from:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    <li>
                      <strong>Attendance rows:</strong> who is checked in today, straight from the HRMS attendance table.
                    </li>
                    <li>
                      <strong>Terminal punch events:</strong> device, timestamp and the verification method the terminal itself reported.
                    </li>
                    <li>
                      <strong>Not available:</strong> seat capacity per floor, prior-week occupancy baseline and the reason behind an absence are not stored, so they are left unreported rather than estimated.
                    </li>
                  </ul>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FloorPresenceDetail;