'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { WidgetGate } from '@/components/access/Can';
import { useMyAccess } from '@/lib/rbac';
import type { MetricKey } from '@/components/dashboard/MetricDrillDownModal';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import type { MetricDetailType } from '@/types/metricDetail';
import { BscHolidaysCalendar } from '@/components/dashboard/BscHolidaysCalendar';
import { KarnatakaHubsCardSection } from '@/components/dashboard/KarnatakaHubsCardSection';
import { LiveActivitiesSection } from '@/components/dashboard/LiveActivitiesSection';
import { ExecutiveShiftFilter, type ShiftOptionItem } from '@/components/dashboard/ExecutiveShiftFilter';
import {
  ExecutiveDeptFilter,
  type DeptOptionItem,
  dashboardDepartmentOptions,
} from '@/components/dashboard/ExecutiveDeptFilter';
import { SHIFT_I_LABEL } from '@/config/shiftPolicyConfig';
import { notifyShiftsChanged, SHIFTS_CHANGED_EVENT } from '@/lib/shiftRegistry';
import type { CreatedCustomShift } from '@/components/dashboard/ExecutiveCustomShiftDialog';
import { ExecutiveHeaderSearch } from '@/components/dashboard/ExecutiveHeaderSearch';
import {
  ExecutiveSearchResultsDrawer,
  type SearchResultsData,
} from '@/components/dashboard/ExecutiveSearchResultsDrawer';
import api from '@/lib/api';

// Dynamically import heavy modals to eliminate ~5MB from the initial critical JS bundle
const MetricDrillDownModal = dynamic(
  () => import('@/components/dashboard/MetricDrillDownModal').then((mod) => mod.MetricDrillDownModal),
  { ssr: false }
);

const KpiDetailContainer = dynamic(
  () => import('@/components/dashboard/KpiDetailContainer').then((mod) => mod.KpiDetailContainer),
  { ssr: false }
);

const ExecutiveCustomShiftDialog = dynamic(
  () => import('@/components/dashboard/ExecutiveCustomShiftDialog').then((mod) => mod.ExecutiveCustomShiftDialog),
  { ssr: false }
);

interface DashboardStats {
  totalEmployees: number;
  present: number;
  absent: number;
  late: number;
  onLunch: number;
  onTeaBreak: number;
  weeklyOff: number;
  overtime: number;
  faceVerified: number;
  faceFailed: number;
  avgFaceMatch: number;
  qrScans: number;
  failedQrScans: number;
  incentiveToday: number;
  penaltyToday: number;
  openObservations: number;
  criticalObservations: number;
  liveStreams: number;
  activeSellingPoints: number;
}

interface PunchRecord {
  id: string;
  employeeCode: string | null;
  employeeName: string | null;
  /** Device-side user id, shown when no employee row could be matched. */
  deviceUserId: string | null;
  locationName: string;
  terminal: string;
  serialNumber: string | null;
  direction: string;
  punchTime: string;
  /** Verify-code label resolved at ingest; 'Unknown' when the device sent no code. */
  method: string;
  /** Only ever the score the terminal itself reported — null when it reported none. */
  matchValue: number | null;
  status: 'MATCHED' | 'MISMATCH' | 'UNKNOWN_USER' | 'ID_MISMATCH' | 'NOT_SYNCED';
}

// Detail-view titles for each drill-down KPI card.
const METRIC_TITLES: Record<MetricKey, string> = {
  workforce: 'Workforce Register',
  adherence: 'Floor Adherence',
  punches: 'Biometric Punches',
  breaks: 'Active Floor Breaks',
  incentives: 'Incentives Today',
};

// Human-readable hub labels for the drill-down filter context.
const HUB_LABELS: Record<string, string> = {
  all: 'All Hubs (Karnataka Combined)',
  loc_bel: 'Belagavi Flagship (BEL-01)',
  loc_dav: 'Davanagere Hub (DAV-02)',
  loc_shi: 'Shivamogga Hub (SHI-03)',
  BEL: 'Belagavi Flagship (BEL-01)',
  DAV: 'Davanagere Hub (DAV-02)',
  SHI: 'Shivamogga Hub (SHI-03)',
};


const NOT_REPORTED_METHOD = 'Not reported by device';

/** True only when the terminal itself named the method; 'Unknown (7)' is not confirmation. */
function isDeviceConfirmedMethod(method: string): boolean {
  return Boolean(method) && method !== NOT_REPORTED_METHOD && !method.startsWith('Unknown');
}

function ledgerStatusClass(status: PunchRecord['status']): string {
  switch (status) {
    case 'MATCHED':
      return 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800';
    case 'MISMATCH':
      return 'bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800';
    case 'UNKNOWN_USER':
    case 'ID_MISMATCH':
      return 'bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
  }
}

function toTerminalPunch(row: any): PunchRecord {
  const rawMatch = row.matchValue;
  const matchValue =
    rawMatch === null || rawMatch === undefined || rawMatch === '' ? null : Number(rawMatch);
  return {
    id: row.id,
    employeeCode: row.employeeCode ?? null,
    employeeName: row.employeeName ?? null,
    deviceUserId: row.enrollmentNumber ?? row.normalizedId ?? null,
    locationName: HUB_LABELS[row.locationCode] || row.locationCode || 'Unregistered terminal',
    terminal: row.deviceName || 'Unregistered terminal',
    serialNumber: row.serialNumber ?? null,
    direction: row.direction || '—',
    punchTime: row.punchTimeLocal || '—',
    method: row.verifyModeLabel || 'Unknown',
    matchValue: matchValue !== null && Number.isFinite(matchValue) ? matchValue : null,
    status: row.status,
  };
}
const DEFAULT_HUBS = [
  { id: 'all', code: 'ALL', name: 'All Hubs (Karnataka Combined)' },
  { id: 'BEL', code: 'BEL', name: 'Belagavi Flagship (BEL-01)' },
  { id: 'DAV', code: 'DAV', name: 'Davanagere Hub (DAV-02)' },
  { id: 'SHI', code: 'SHI', name: 'Shivamogga Hub (SHI-03)' },
];

const DEFAULT_DEPTS = dashboardDepartmentOptions;

const DEFAULT_SHIFTS: ShiftOptionItem[] = [
  {
    id: 'shift-i-bel',
    name: SHIFT_I_LABEL,
    timeRange: '10:00 – 21:30',
    startTime: '10:00',
    endTime: '21:30',
    lunchDurationMinutes: 100,
    teaDurationMinutes: 20,
    teaBreakSlot: 'Evening',
    staffCount: 0,
    isCustom: false,
  },
  {
    id: 'shift-2-bel',
    name: 'Shift 2',
    timeRange: '11:00 – 21:00',
    startTime: '11:00',
    endTime: '21:00',
    lunchDurationMinutes: 45,
    teaDurationMinutes: 10,
    teaBreakSlot: 'None',
    staffCount: 0,
    isCustom: false,
  },
];

function parseShiftTime(timeVal: any): string {
  if (!timeVal) return '';
  if (typeof timeVal === 'string' && /^\d{2}:\d{2}/.test(timeVal) && !timeVal.includes('T')) {
    return timeVal.slice(0, 5);
  }
  try {
    const d = new Date(timeVal);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    }
  } catch { }
  return String(timeVal).slice(0, 5);
}

function normalizeTimeRange(shift: any): string {
  const start = parseShiftTime(shift.startTime) || '10:00';
  const end = parseShiftTime(shift.endTime) || '21:00';
  return `${start} – ${end}`;
}

function processShifts(rawShifts: any[], isAllHubs: boolean): ShiftOptionItem[] {
  if (!Array.isArray(rawShifts) || rawShifts.length === 0) return DEFAULT_SHIFTS;

  // 1. Match Shift I
  const shift1Matches = rawShifts.filter((s: any) => {
    const nameLower = (s.name || '').trim().toLowerCase();
    const codeUpper = (s.code || '').trim().toUpperCase();
    return (
      nameLower === 'shift i' ||
      nameLower === 'shift 1' ||
      codeUpper.startsWith('SHIFT_I')
    );
  });

  // 2. Match Shift 2
  const shift2Matches = rawShifts.filter((s: any) => {
    const nameLower = (s.name || '').trim().toLowerCase();
    const codeUpper = (s.code || '').trim().toUpperCase();
    return (
      nameLower === 'shift 2' ||
      nameLower === 'shift ii' ||
      codeUpper.startsWith('SHIFT_2')
    );
  });

  // 3. User custom shifts (strictly genuine user-created custom shifts)
  const customShiftsRaw = rawShifts.filter((s: any) => {
    const isCustom = Boolean(
      s.isCustom === true ||
      s.type === 'custom' ||
      s.scannerRoles?.isCustomShift === true ||
      s.scannerRoles?.isCustomBatch === true ||
      (typeof s.code === 'string' && s.code.startsWith('S_'))
    );
    if (!isCustom) return false;

    const nameLower = (s.name || '').trim().toLowerCase();
    const codeUpper = (s.code || '').trim().toUpperCase();

    if (
      nameLower === 'shift i' ||
      nameLower === 'shift 1' ||
      codeUpper.startsWith('SHIFT_I') ||
      nameLower === 'shift 2' ||
      nameLower === 'shift ii' ||
      codeUpper.startsWith('SHIFT_2')
    ) {
      return false;
    }

    return true;
  });

  const result: ShiftOptionItem[] = [];

  // Exact option 2: Shift I (Roman numeral I)
  const shift1Staff = shift1Matches.reduce(
    (sum: number, s: any) => sum + (s._count?.employees || 0),
    0
  );
  const shift1Id =
    shift1Matches.length > 0
      ? isAllHubs
        ? shift1Matches.map((s: any) => s.id).join(',')
        : shift1Matches[0].id
      : 'shift-i-bel';

  result.push({
    id: shift1Id,
    name: SHIFT_I_LABEL,
    timeRange: '10:00 – 21:30',
    startTime: '10:00',
    endTime: '21:30',
    lunchDurationMinutes: 100,
    teaDurationMinutes: 20,
    teaBreakSlot: 'Evening',
    staffCount: shift1Staff,
    isCustom: false,
  });

  // Exact option 3: Shift 2
  const shift2Staff = shift2Matches.reduce(
    (sum: number, s: any) => sum + (s._count?.employees || 0),
    0
  );
  const shift2Id =
    shift2Matches.length > 0
      ? isAllHubs
        ? shift2Matches.map((s: any) => s.id).join(',')
        : shift2Matches[0].id
      : 'shift-2-bel';

  result.push({
    id: shift2Id,
    name: 'Shift 2',
    timeRange: '11:00 – 21:00',
    startTime: '11:00',
    endTime: '21:00',
    lunchDurationMinutes: 45,
    teaDurationMinutes: 10,
    teaBreakSlot: 'None',
    staffCount: shift2Staff,
    isCustom: false,
  });

  // Exact option 4: Custom shifts in creation order, de-duplicated by shiftId
  const seenIds = new Set<string>();
  const sortedCustom = [...customShiftsRaw].sort((a: any, b: any) => {
    const timeA = new Date(a.createdAt || 0).getTime();
    const timeB = new Date(b.createdAt || 0).getTime();
    return timeA - timeB;
  });

  for (const s of sortedCustom) {
    if (!seenIds.has(s.id)) {
      seenIds.add(s.id);
      const scanner = s.scannerRoles || {};
      result.push({
        id: s.id,
        name: s.name,
        code: s.code,
        timeRange: normalizeTimeRange(s),
        startTime: s.startTime,
        endTime: s.endTime,
        lunchDurationMinutes: s.lunchDurationMinutes ?? 45,
        teaDurationMinutes: s.teaDurationMinutes ?? 0,
        teaBreakSlot: scanner.teaBreakSlot || 'None',
        staffCount: s._count?.employees || 0,
        isCustom: true,
      });
    }
  }

  // Also include any locally created custom shifts if not already present
  if (typeof window !== 'undefined') {
    try {
      const localCustom = JSON.parse(localStorage.getItem('bsc_custom_shifts') || '[]');
      if (Array.isArray(localCustom)) {
        for (const loc of localCustom) {
          if (loc?.id && !seenIds.has(loc.id)) {
            seenIds.add(loc.id);
            const start = loc.punchIn || loc.startTime || '10:00';
            const end = loc.punchOut || loc.endTime || '19:00';
            result.push({
              id: loc.id,
              name: loc.name,
              code: loc.code || loc.id,
              timeRange: `${start} – ${end}`,
              startTime: start,
              endTime: end,
              lunchDurationMinutes: loc.lunchBreakMinutes ?? 45,
              teaDurationMinutes: loc.teaBreakMinutes ?? 0,
              teaBreakSlot: loc.teaBreakMinutes > 0 ? 'Evening' : 'None',
              staffCount: 0,
              isCustom: true,
            });
          }
        }
      }
    } catch {
      // safe fallback
    }
  }

  return result;
}

export default function DashboardPage() {
  // Role-based section visibility: the widgets a role may see come from the
  // access-control matrix (Admin assigns them, Super Admin owns the roles).
  const access = useMyAccess();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHub, setSelectedHubState] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('bsc_selected_hub') || 'all';
    }
    return 'all';
  });

  const setSelectedHub = useCallback((hub: string) => {
    setSelectedHubState(hub);
    if (typeof window !== 'undefined') {
      localStorage.setItem('bsc_selected_hub', hub);
      window.dispatchEvent(new CustomEvent('bsc:hub-changed-external', { detail: { hub } }));
    }
  }, []);

  useEffect(() => {
    const handleHeaderHub = (e: any) => {
      if (e?.detail?.hub) {
        setSelectedHubState(e.detail.hub);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('bsc:hub-changed', handleHeaderHub);
      return () => window.removeEventListener('bsc:hub-changed', handleHeaderHub);
    }
  }, []);
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedShift, setSelectedShift] = useState('all');
  const [hubOptions, setHubOptions] = useState(DEFAULT_HUBS);
  const [shiftOptions, setShiftOptions] = useState<ShiftOptionItem[]>(DEFAULT_SHIFTS);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftsError, setShiftsError] = useState<string | null>(null);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);
  const [customShiftDialogOpen, setCustomShiftDialogOpen] = useState(false);
  const shiftCacheRef = useRef<Record<string, ShiftOptionItem[]>>({});
  const [deptOptions, setDeptOptions] = useState<Array<{ id: string; name: string }>>(DEFAULT_DEPTS);
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [selectedKpiMetric, setSelectedKpiMetric] = useState<MetricDetailType>(null);
  const [recentPunches, setRecentPunches] = useState<PunchRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [filterAnimationKey, setFilterAnimationKey] = useState(0);
  const [searchDrawerOpen, setSearchDrawerOpen] = useState(false);
  const [searchDrawerQuery, setSearchDrawerQuery] = useState('');
  const [searchDrawerResults, setSearchDrawerResults] = useState<SearchResultsData>({
    employees: [],
    departments: [],
    hubs: [],
  });

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // The executive hub filter lists the company's standard departments; those
      // option ids are slugs, not department row ids, so the request carries the
      // department *name* and the API resolves it against the employee master.
      const deptFilterValue =
        selectedDept === 'all' ? null : (deptOptions.find((d) => d.id === selectedDept)?.name ?? selectedDept);

      // Build comprehensive filter query parameters for backend
      const qp = new URLSearchParams();
      if (selectedHub !== 'all') qp.set('locationId', selectedHub);
      if (selectedDept !== 'all' && deptFilterValue) qp.set('departmentId', deptFilterValue);
      if (selectedShift !== 'all') qp.set('shiftId', selectedShift);
      if (selectedDate) qp.set('date', selectedDate);
      const qs = qp.toString() ? `?${qp.toString()}` : '';

      const ledgerQp = new URLSearchParams();
      if (selectedHub !== 'all') ledgerQp.set('locationCode', selectedHub);
      if (deptFilterValue) ledgerQp.set('departmentId', deptFilterValue);
      if (selectedDate) {
        ledgerQp.set('from', selectedDate);
        ledgerQp.set('to', selectedDate);
      }
      ledgerQp.set('limit', '10');

      const [summaryRes, ledgerRes] = await Promise.all([
        api.get(`/reports/dashboard-summary${qs}`).catch(() => ({ data: null })),
        api.get(`/devices/attendance-log?${ledgerQp.toString()}`).catch(() => ({ data: { rows: [] } })),
      ]);

      if (summaryRes.data) {
        setStats(summaryRes.data);
      }

      // The ledger lists raw terminal events, not calculated attendance: a row
      // appears here only because a device actually sent it.
      const ledgerRows: any[] = ledgerRes.data?.rows || [];
      setRecentPunches(ledgerRows.map(toTerminalPunch));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setFilterAnimationKey((prev) => prev + 1);
    }
  }, [selectedHub, selectedDept, selectedDate, selectedShift, deptOptions]);

  // Execute reactive refresh whenever any filter changes
  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Auto-dismiss short notice
  useEffect(() => {
    if (!shiftNotice) return;
    const timer = setTimeout(() => setShiftNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [shiftNotice]);

  // Load shift options dynamically with caching and duplicate removal
  const loadShiftOptions = useCallback(
    async (hub: string, force = false) => {
      if (!force && shiftCacheRef.current[hub]) {
        setShiftOptions(shiftCacheRef.current[hub]);
        return;
      }

      try {
        setShiftsLoading(true);
        setShiftsError(null);
        const loc = hub !== 'all' ? `&locationId=${hub}` : '';
        const shiftRes = await api.get(`/shifts?limit=100${loc}`).catch(() => ({ data: null }));
        const sList = shiftRes.data?.shifts || shiftRes.data || [];
        const processed = processShifts(sList, hub === 'all');
        const finalList = processed.length > 0 ? processed : DEFAULT_SHIFTS;

        shiftCacheRef.current[hub] = finalList;
        setShiftOptions(finalList);

        // Verify that current selected shift still exists
        setSelectedShift((prevShift) => {
          if (prevShift === 'all') return 'all';
          const match = finalList.find((s) => s.id === prevShift);
          if (match) return prevShift;

          // If exact ID not found, check if a shift with matching name exists
          const prevObj = shiftOptions.find((o) => o.id === prevShift);
          const nameMatch = finalList.find(
            (s) => prevObj && s.name.toLowerCase() === prevObj.name.toLowerCase()
          );
          if (nameMatch) return nameMatch.id;

          // Reset to all and notify
          setShiftNotice("Shift selection reset to 'All Shifts' for the selected hub.");
          return 'all';
        });
      } catch {
        setShiftsError('Could not load shifts');
        if (!shiftCacheRef.current[hub]) {
          setShiftOptions(DEFAULT_SHIFTS);
        }
      } finally {
        setShiftsLoading(false);
      }
    },
    [shiftOptions]
  );

  // Load shifts whenever selectedHub changes (cached in memory)
  useEffect(() => {
    loadShiftOptions(selectedHub);
  }, [selectedHub, loadShiftOptions]);

  // Load hub location options dynamically from backend
  useEffect(() => {
    let ignore = false;
    const loadHubLocations = async () => {
      try {
        const locRes = await api.get('/locations/all').catch(() => ({ data: null }));
        if (!ignore) {
          const lList = locRes.data;
          if (Array.isArray(lList) && lList.length > 0) {
            setHubOptions([
              { id: 'all', code: 'ALL', name: 'All Hubs (Karnataka Combined)' },
              ...lList.map((l: any) => ({
                id: l.code || l.id,
                code: l.code,
                name: `${l.name} (${l.code})`,
              })),
            ]);
          }
        }
      } catch {
        // Safe fallback already in hubOptions initial state
      }
    };
    loadHubLocations();
    return () => {
      ignore = true;
    };
  }, []);

  // Listen for shift changes broadcast from other components or tabs
  useEffect(() => {
    const handleShiftRegistryChange = () => {
      shiftCacheRef.current = {};
      loadShiftOptions(selectedHub, true);
    };
    window.addEventListener(SHIFTS_CHANGED_EVENT, handleShiftRegistryChange);
    return () => window.removeEventListener(SHIFTS_CHANGED_EVENT, handleShiftRegistryChange);
  }, [selectedHub, loadShiftOptions]);

  const handleCustomShiftCreated = (newShift: CreatedCustomShift) => {
    shiftCacheRef.current = {};

    const newOption: ShiftOptionItem = {
      id: newShift.id,
      name: newShift.name,
      code: newShift.code,
      timeRange: `${newShift.startTime} – ${newShift.endTime}`,
      startTime: newShift.startTime,
      endTime: newShift.endTime,
      lunchDurationMinutes: newShift.lunchDurationMinutes,
      teaDurationMinutes: newShift.teaDurationMinutes,
      teaBreakSlot: newShift.teaBreakSlot,
      staffCount: newShift.staffCount,
      isCustom: true,
    };

    setShiftOptions((prev) => {
      if (prev.some((p) => p.id === newShift.id)) return prev;
      return [...prev, newOption];
    });

    // Auto-select the newly created custom shift in the Executive Dashboard
    setSelectedShift(newShift.id);

    // Broadcast newly created shift to all modules across the application
    notifyShiftsChanged({
      id: newShift.id,
      name: newShift.name,
      code: newShift.code,
      type: 'custom',
      punchIn: newShift.startTime,
      punchOut: newShift.endTime,
      lunchBreakMinutes: newShift.lunchDurationMinutes,
      lunchBreakLabel: `${newShift.lunchDurationMinutes} Min`,
      teaBreakMinutes: newShift.teaDurationMinutes,
      teaBreakLabel: newShift.teaDurationMinutes > 0 ? `${newShift.teaDurationMinutes} Min` : 'No Tea Break',
      isActive: true,
    });

    setShiftNotice(`Shift ${newShift.name} added.`);
  };

  const handleManualSync = async () => {
    setSyncing(true);
    await fetchDashboardData();
    setTimeout(() => setSyncing(false), 600);
  };

  const handleSetQuickDate = (type: 'today' | 'yesterday') => {
    if (type === 'today') {
      setSelectedDate(new Date().toISOString().slice(0, 10));
    } else {
      const y = new Date();
      y.setDate(y.getDate() - 1);
      setSelectedDate(y.toISOString().slice(0, 10));
    }
  };

  const handleResetFilters = () => {
    setSelectedHub('all');
    setSelectedDept('all');
    setSelectedShift('all');
    setSelectedDate(new Date().toISOString().slice(0, 10));
  };

  const activeFilterCount =
    (selectedHub !== 'all' ? 1 : 0) +
    (selectedDept !== 'all' ? 1 : 0) +
    (selectedShift !== 'all' ? 1 : 0) +
    (selectedDate !== new Date().toISOString().slice(0, 10) ? 1 : 0);

  // Safe fallback counts
  const totalEmp = stats?.totalEmployees ?? 35;
  const presentCount = stats?.present ?? 12;
  const activeFloor = presentCount;
  const lateCount = stats?.late ?? 0;
  const onBreakCount = (stats?.onLunch ?? 0) + (stats?.onTeaBreak ?? 0);
  const totalIncentive = stats?.incentiveToday ?? 6900;

  // Shared interactive styles for the 5 drill-down KPI cards.
  const cardActionClass =
    'group flex flex-col justify-between w-full text-left bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs cursor-pointer transition-all hover:shadow-md hover:border-[#0058be]/40 dark:hover:border-blue-500/40 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#0058be] focus:ring-offset-2 active:scale-[0.99]';

  // Small "View details" affordance shown at the bottom of each clickable card.
  const viewDetailsHint = (
    <span className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400 opacity-70 group-hover:opacity-100 transition-opacity">
      <span>View Details</span>
      <span className="material-symbols-outlined text-[14px] transition-transform group-hover:translate-x-0.5">arrow_forward</span>
    </span>
  );

  const activeShiftItem = useMemo(
    () => (selectedShift === 'all' ? null : shiftOptions.find((s) => s.id === selectedShift)),
    [selectedShift, shiftOptions]
  );
  const activeShiftName = activeShiftItem ? activeShiftItem.name : 'All Shifts';
  const activeShiftHeaderLabel = selectedShift !== 'all' && activeShiftItem
    ? `${activeShiftItem.name} (${activeShiftItem.timeRange})`
    : undefined;

  const morningShift = shiftOptions.find((s) => s.name.toLowerCase().includes('morning'));
  const generalShift = shiftOptions.find((s) => s.name.toLowerCase().includes('general'));
  const eveningShift = shiftOptions.find((s) => s.name.toLowerCase().includes('evening'));

  return (
    <DashboardLayout
      activeShiftLabel={activeShiftHeaderLabel}
      headerSearchSlot={
        <ExecutiveHeaderSearch
          onSelectDept={(deptId: string) => setSelectedDept(deptId)}
          onSelectHub={(hubId: string) => setSelectedHub(hubId)}
          onOpenSearchDrawer={(q: string, r: SearchResultsData) => {
            setSearchDrawerQuery(q);
            setSearchDrawerResults(r);
            setSearchDrawerOpen(true);
          }}
          selectedHubId={selectedHub}
        />
      }
    >
      <div className="flex flex-col w-full gap-5">
        {/* TOP HEADER & CONTROLS BANNER */}
        <div className="flex flex-col gap-4 bg-white dark:bg-[#0e172a] p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#eff4ff] dark:bg-blue-950/60 text-[#0058be] dark:text-blue-400 text-[11px] font-bold uppercase tracking-wider border border-[#dce9ff] dark:border-blue-900/50">
                  <span className="material-symbols-outlined text-[14px]">corporate_fare</span>
                  BSC Retail Enterprise Hubs
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-[#eff4ff] dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium border border-slate-200 dark:border-slate-700">
                  <span className="material-symbols-outlined text-[13px] text-[#0058be] dark:text-blue-400">verified</span>
                  Since 1938 • FY 2026-27 Q3
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 p-0.5 border border-slate-200/90 dark:border-slate-800 shadow-xs flex items-center justify-center shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/bsc_logo.png" alt="BSC Textiles Since 1938" width={40} height={40} className="w-full h-full object-contain" />
                </div>
                <h1 className="text-2xl font-bold text-[#0b1c30] dark:text-slate-100 tracking-tight">
                  Executive Workforce & Operations Dashboard
                </h1>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
                Real-time overview of workforce, biometric punch adherence, Karnataka store hubs, and payroll disbursal.
              </p>
            </div>

            {/* Quick Action CTA Group */}
            <div className="flex items-center flex-wrap gap-2 self-start lg:self-center">
              <Link
                href="/employees"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0b1c30] dark:bg-blue-600 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-800 dark:hover:bg-blue-500 transition-all active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[17px]">person_add</span>
                <span>+ Quick Onboard Employee</span>
              </Link>
              <Link
                href="/attendance/shifts"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#eff4ff] dark:bg-blue-950/60 text-[#0058be] dark:text-blue-400 rounded-lg text-xs font-semibold hover:bg-[#dce9ff] dark:hover:bg-blue-900/60 transition-colors border border-[#dce9ff] dark:border-blue-900/50"
              >
                <span className="material-symbols-outlined text-[17px]">edit_calendar</span>
                <span>Floor Shift Regularization</span>
              </Link>
              <Link
                href="/reports"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              >
                <span className="material-symbols-outlined text-[17px] text-slate-400 dark:text-slate-400">summarize</span>
                <span>Monthly Report</span>
              </Link>
            </div>
          </div>

          {/* Clean Connected Horizontal Line Divider */}
          <div className="w-full border-t border-slate-200/80 dark:border-slate-800 my-0.5" />

          {/* Shift Reset / Creation Notice */}
          {shiftNotice && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs text-[#0058be] dark:text-blue-300 animate-pop-in"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">info</span>
                <span>{shiftNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setShiftNotice(null)}
                className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
                aria-label="Dismiss notice"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            </div>
          )}

          {/* Filter & Terminal Connectivity Bar */}
          <div className="flex flex-col gap-3 pt-3 bg-[#eff4ff]/60 dark:bg-[#131f38]/60 p-3.5 rounded-xl border border-slate-200/60 dark:border-slate-800 transition-all">
            <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* Hub Selector */}
                <div className="flex items-center gap-1.5 bg-white dark:bg-[#0c1424] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-xs group hover:border-[#0058be] dark:hover:border-blue-500 transition-colors">
                  <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[16px] group-hover:scale-110 transition-transform">storefront</span>
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Hub:</span>
                  <select
                    value={selectedHub}
                    onChange={(e) => setSelectedHub(e.target.value)}
                    className="bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-slate-100 focus:outline-none cursor-pointer pr-1"
                  >
                    {hubOptions.map((h) => (
                      <option key={h.id} value={h.id} className="dark:bg-[#0c1424]">
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Department Filter */}
                <ExecutiveDeptFilter
                  selectedDeptId={selectedDept}
                  onSelectDept={(id) => setSelectedDept(id)}
                  deptOptions={deptOptions}
                />

                {/* Date Filter with Quick Today/Yesterday toggles */}
                <div className="flex items-center gap-1.5 bg-white dark:bg-[#0c1424] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-xs group hover:border-[#0058be] dark:hover:border-blue-500 transition-colors">
                  <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[16px] group-hover:scale-110 transition-transform">calendar_today</span>
                  <label htmlFor="dashboard-date-filter" className="text-[10px] uppercase text-slate-500 dark:text-slate-400 font-bold cursor-pointer">Date:</label>
                  <input
                    id="dashboard-date-filter"
                    aria-label="Filter by date"
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-slate-100 focus:outline-none cursor-pointer"
                  />
                  <div className="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleSetQuickDate('today')}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${selectedDate === new Date().toISOString().slice(0, 10)
                          ? 'bg-[#0058be] text-white dark:bg-blue-600'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                        }`}
                      title="Set to Today"
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSetQuickDate('yesterday')}
                      aria-label="Set date to Yesterday"
                      className="px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded transition-colors"
                      title="Set to Yesterday"
                    >
                      Yest
                    </button>
                  </div>
                </div>

                {/* Shift Filter with Create Custom Shift */}
                <ExecutiveShiftFilter
                  selectedShiftId={selectedShift}
                  onSelectShift={(id) => setSelectedShift(id)}
                  shiftOptions={shiftOptions}
                  loading={shiftsLoading}
                  error={shiftsError}
                  onRetry={() => loadShiftOptions(selectedHub, true)}
                  onOpenCreateModal={() => setCustomShiftDialogOpen(true)}
                />
              </div>

              {/* Live Sync Beacon & Refresh */}
              <div className="flex items-center justify-between lg:justify-end gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#0c1424] rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0058be] opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0058be]"></span>
                  </span>
                  <span className="text-[10px] font-bold text-[#0b1c30] dark:text-slate-100 uppercase tracking-wider">
                    {/* No real uptime figure exists for the terminal fleet, so
                        none is invented here. The pill reports transport state;
                        per-device health is on /attendance/devices. */}
                    {loading ? 'Refreshing feed…' : 'Terminal feed connected'}
                  </span>
                </div>
                <button
                  onClick={handleManualSync}
                  className={`flex items-center justify-center p-2 rounded-lg bg-white dark:bg-[#0c1424] text-slate-600 dark:text-slate-300 hover:text-[#0058be] dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 ${syncing || loading ? 'animate-spin text-[#0058be]' : ''
                    }`}
                  title="Sync Live Biometric Feeds"
                >
                  <span className="material-symbols-outlined text-[18px]">sync</span>
                </button>
              </div>
            </div>

            {/* Active Filters Pill Bar with Reset CTA */}
            {activeFilterCount > 0 && (
              <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 animate-pop-in">
                <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-[14px] text-[#0058be] dark:text-blue-400">filter_alt</span>
                  Active Filters ({activeFilterCount}):
                </span>

                {selectedHub !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-[#0058be] dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-xs animate-pop-in">
                    <span>Hub: {hubOptions.find(h => h.id === selectedHub)?.name || selectedHub}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedHub('all')}
                      className="hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded-full"
                      title="Clear Hub filter"
                      aria-label="Clear Hub filter"
                    >
                      <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                    </button>
                  </span>
                )}

                {selectedDept !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-[#0058be] dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-xs animate-pop-in">
                    <span>Dept: {deptOptions.find(d => d.id === selectedDept)?.name || selectedDept}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDept('all')}
                      className="hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded-full"
                      title="Clear Dept filter"
                      aria-label="Clear Dept filter"
                    >
                      <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                    </button>
                  </span>
                )}

                {selectedShift !== 'all' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-[#0058be] dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-xs animate-pop-in">
                    <span>Shift: {activeShiftName}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedShift('all')}
                      className="hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded-full"
                      title="Clear Shift filter"
                      aria-label="Clear Shift filter"
                    >
                      <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                    </button>
                  </span>
                )}

                {selectedDate !== new Date().toISOString().slice(0, 10) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-[#0058be] dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-xs animate-pop-in">
                    <span>Date: {selectedDate}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                      className="hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded-full"
                      title="Reset Date to Today"
                      aria-label="Reset Date to Today"
                    >
                      <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                    </button>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 border border-red-200 dark:border-red-900/50 transition-colors ml-auto"
                >
                  <span className="material-symbols-outlined text-[14px]">filter_alt_off</span>
                  <span>Reset All</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 5 KEY METRIC KPI CARDS (INTERACTIVE DETAIL DRILL-DOWN) */}
        <WidgetGate widgetKey="EXECUTIVE_KPI" access={access}>
          <DashboardCards
            onSelectMetric={(metric) => setActiveMetric(metric)}
            stats={stats}
          />
        </WidgetGate>

        {/* MAIN OPERATIONAL & STATUTORY CALENDAR GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT SIDE: BSC CALENDAR & HOLIDAYS WITH HR CSV UPLOAD & TEMPLATE */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-4">
            <WidgetGate widgetKey="HOLIDAY_CALENDAR" access={access}>
              <BscHolidaysCalendar />
            </WidgetGate>
          </div>

          {/* RIGHT SIDE: STORE HUBS, LIVE BIOMETRICS & SHIFTS */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-5">
            {/* SECTION 2: KARNATAKA STORE HUBS MONITOR & INTERACTIVE CARD CRUD */}
            <WidgetGate widgetKey="STORE_HUBS" access={access}>
              <KarnatakaHubsCardSection
                selectedHub={selectedHub}
                onSelectHub={setSelectedHub}
                selectedShiftLabel={selectedShift !== 'all' ? activeShiftName : undefined}
              />
            </WidgetGate>

            {/* SECTION 2B: LIVE ACTIVITIES — the real-time workforce feed. */}
            {/*
              Previously this was a session-only strip of socket messages with
              client-generated ids, and it shared the PUNCH_LEDGER widget gate
              with the punch ledger below it, so one dashboard toggle hid two
              unrelated sections. It now has its own widget key and its own
              persisted, filterable, past-date-aware data source.
            */}
            <WidgetGate widgetKey="LIVE_ACTIVITIES" access={access}>
              <LiveActivitiesSection selectedDate={selectedDate} />
            </WidgetGate>

            {/* SECTION 3: TERMINAL PUNCH LEDGER — raw device-reported events. */}
            <WidgetGate widgetKey="PUNCH_LEDGER" access={access}>
            <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">fingerprint</span>
                  <div>
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100">Terminal Punch Ledger</h3>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">
                      {recentPunches.length} events reported by the terminals • {selectedHub !== 'all' ? (HUB_LABELS[selectedHub] || selectedHub) : 'Karnataka Hubs'} • {selectedDate}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href="/attendance/punches"
                    className="px-3 py-1.5 text-xs font-semibold text-[#0058be] dark:text-blue-400 bg-[#eff4ff] dark:bg-blue-950/60 hover:bg-[#dce9ff] dark:hover:bg-blue-900/60 rounded-lg transition-colors border border-[#dce9ff] dark:border-blue-900/50"
                  >
                    Open Terminal Console
                  </Link>
                </div>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                {recentPunches.length === 0 ? (
                  <div className="py-12 px-4 flex flex-col items-center justify-center text-center gap-2.5 animate-pop-in">
                    <div className="w-12 h-12 rounded-full bg-[#eff4ff] dark:bg-slate-800 flex items-center justify-center text-[#0058be] dark:text-blue-400">
                      <span className="material-symbols-outlined text-[24px]">search_off</span>
                    </div>
                    <h4 className="text-sm font-bold text-[#0b1c30] dark:text-slate-200">No terminal reported a punch for this filter</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                      This ledger only lists events the biometric terminals actually sent. Nothing is generated here when a
                      device is offline, unsynced or filtered out — check terminal status under Attendance → Devices.
                    </p>
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="mt-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#0058be] dark:bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs"
                    >
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#eff4ff]/60 dark:bg-[#111c33] text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 tracking-wider">
                      <tr>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Store Hub &amp; Terminal</th>
                        <th className="py-3 px-4">Direction</th>
                        <th className="py-3 px-4">Device Punch Time</th>
                        <th className="py-3 px-4">Verification Method</th>
                        <th className="py-3 px-4">Record Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                      {recentPunches.map((punch, idx) => {
                        const methodKnown = isDeviceConfirmedMethod(punch.method);
                        const initials = (punch.employeeName || punch.deviceUserId || '?')
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)
                          .toUpperCase();
                        return (
                          <tr key={`${punch.id}-${idx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-full bg-[#131b2e] dark:bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                                  {initials}
                                </div>
                                <div>
                                  {punch.employeeName ? (
                                    <>
                                      <div className="font-bold text-[#0b1c30] dark:text-slate-100">{punch.employeeName}</div>
                                      <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{punch.employeeCode}</div>
                                    </>
                                  ) : (
                                    <>
                                      <div className="font-bold text-amber-700 dark:text-amber-300">Unmatched device ID</div>
                                      <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{punch.deviceUserId}</div>
                                    </>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-[#0b1c30] dark:text-slate-200">{punch.locationName}</div>
                              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                {punch.terminal}{punch.serialNumber ? ` • ${punch.serialNumber}` : ''}
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                              {punch.direction}
                            </td>
                            <td className="py-3 px-4 font-mono font-bold text-[#0b1c30] dark:text-slate-100">
                              {punch.punchTime}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded border ${
                                  methodKnown
                                    ? 'text-[#0058be] dark:text-blue-400 bg-[#eff4ff] dark:bg-blue-950/60 border-[#dce9ff] dark:border-blue-900/50'
                                    : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800'
                                }`}
                                title={methodKnown ? 'Method reported by the terminal' : 'The terminal did not report a verifiable method for this event'}
                              >
                                <span className="material-symbols-outlined text-[13px]">{methodKnown ? 'verified' : 'help'}</span>
                                {punch.method}{punch.matchValue !== null ? ` · ${punch.matchValue}` : ''}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${ledgerStatusClass(punch.status)}`}>
                                {punch.status.replace('_', ' ')}
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
            </WidgetGate>

            {/* SECTION 4: FLOOR SHIFT ALLOCATION & ROSTER SUMMARY */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-[#0e172a] p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100">Floor Shifts Overview</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#eff4ff] dark:bg-blue-950/60 text-[#0058be] dark:text-blue-400">3 Shift Windows</span>
                  </div>
                  <div className="space-y-3">
                    <div
                      onClick={() => {
                        if (morningShift) {
                          setSelectedShift(selectedShift === morningShift.id ? 'all' : morningShift.id);
                        }
                      }}
                      className={`p-2 rounded-lg border transition-all cursor-pointer ${selectedShift !== 'all' && (selectedShift === morningShift?.id || activeShiftName.toLowerCase().includes('morning'))
                          ? 'bg-blue-50/70 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800 ring-1 ring-blue-400'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border-transparent'
                        }`}
                      title="Click to filter by Morning Shift"
                    >
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-[#0b1c30] dark:text-slate-200">Shift A (Morning Floor)</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">09:00 - 18:00 (24 Staff)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-[#0058be] h-2 rounded-full" style={{ width: '92%' }} />
                      </div>
                    </div>
                    <div
                      onClick={() => {
                        if (generalShift) {
                          setSelectedShift(selectedShift === generalShift.id ? 'all' : generalShift.id);
                        }
                      }}
                      className={`p-2 rounded-lg border transition-all cursor-pointer ${selectedShift !== 'all' && (selectedShift === generalShift?.id || activeShiftName.toLowerCase().includes('general'))
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 ring-1 ring-emerald-400'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border-transparent'
                        }`}
                      title="Click to filter by General Shift"
                    >
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-[#0b1c30] dark:text-slate-200">Shift B (General Floor)</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">09:30 - 18:30 (8 Staff)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>
                    <div
                      onClick={() => {
                        if (eveningShift) {
                          setSelectedShift(selectedShift === eveningShift.id ? 'all' : eveningShift.id);
                        }
                      }}
                      className={`p-2 rounded-lg border transition-all cursor-pointer ${selectedShift !== 'all' && (selectedShift === eveningShift?.id || activeShiftName.toLowerCase().includes('evening'))
                          ? 'bg-amber-50/70 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 ring-1 ring-amber-400'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 border-transparent'
                        }`}
                      title="Click to filter by Evening Shift"
                    >
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-semibold text-[#0b1c30] dark:text-slate-200">Shift C (Evening Cashier)</span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">12:00 - 21:00 (3 Staff)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div className="bg-amber-500 h-2 rounded-full" style={{ width: '100%' }} />
                      </div>
                    </div>
                  </div>
                </div>
                <Link
                  href="/attendance/shifts"
                  className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-[#0058be] dark:text-blue-400 hover:underline flex items-center justify-between"
                >
                  <span>Manage Shift Rosters</span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </Link>
              </div>

              <div className="bg-white dark:bg-[#0e172a] p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100">Break Compliance Policy</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">Audit Grade</span>
                  </div>
                  <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                      <span>Male Lunch Limit:</span>
                      <span className="font-bold text-[#0b1c30] dark:text-slate-100">45 Mins (Zero Tolerance)</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                      <span>Female Lunch Limit:</span>
                      <span className="font-bold text-[#0b1c30] dark:text-slate-100">45 Mins</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                      <span>Tea Break (Morning/Eve):</span>
                      <span className="font-bold text-[#0b1c30] dark:text-slate-100">20 Mins Allowed</span>
                    </div>
                  </div>
                </div>
                <Link
                  href="/attendance/breaks"
                  className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-semibold text-[#0058be] dark:text-blue-400 hover:underline flex items-center justify-between"
                >
                  <span>Open Lunch & Break Monitor</span>
                  <span className="material-symbols-outlined text-[16px]">chevron_right</span>
                </Link>
              </div>

              <div className="bg-white dark:bg-[#0e172a] p-5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100">Instant Quick Links</h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">HR Tools</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <Link
                      href="/payroll"
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#0058be] dark:hover:border-blue-500 hover:bg-[#eff4ff] dark:hover:bg-slate-800/60 transition-all flex flex-col items-center justify-center text-center gap-1 group"
                    >
                      <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">payments</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#0058be] dark:group-hover:text-blue-400">Payroll Ledger</span>
                    </Link>
                    <Link
                      href="/operations/face-verification"
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#0058be] dark:hover:border-blue-500 hover:bg-[#eff4ff] dark:hover:bg-slate-800/60 transition-all flex flex-col items-center justify-center text-center gap-1 group"
                    >
                      <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">shield</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#0058be] dark:group-hover:text-blue-400">Face Verify</span>
                    </Link>
                    <Link
                      href="/admin/audit-logs"
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#0058be] dark:hover:border-blue-500 hover:bg-[#eff4ff] dark:hover:bg-slate-800/60 transition-all flex flex-col items-center justify-center text-center gap-1 group"
                    >
                      <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">rule</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#0058be] dark:group-hover:text-blue-400">Audit Logs</span>
                    </Link>
                    <Link
                      href="/my-desk"
                      className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-[#0058be] dark:hover:border-blue-500 hover:bg-[#eff4ff] dark:hover:bg-slate-800/60 transition-all flex flex-col items-center justify-center text-center gap-1 group"
                    >
                      <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">person</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-[#0058be] dark:group-hover:text-blue-400">My Desk</span>
                    </Link>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 text-center">
                  BSC Textiles Workforce v2.0 • Karnataka Regional Network
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Card drill-down detail modal */}
      {activeMetric && (
        <MetricDrillDownModal
          metric={activeMetric}
          title={METRIC_TITLES[activeMetric]}
          filters={{
            locationId: selectedHub,
            departmentId: selectedDept,
            shiftId: selectedShift,
            date: selectedDate,
          }}
          context={{
            hub: HUB_LABELS[selectedHub] || 'All Hubs (Karnataka)',
            dept:
              selectedDept === 'all'
                ? 'All Departments'
                : deptOptions.find((d) => d.id === selectedDept)?.name || 'All Departments',
            shift:
              selectedShift === 'all'
                ? 'All Shifts'
                : activeShiftName,
            date: selectedDate,
          }}
          onClose={() => setActiveMetric(null)}
        />
      )}

      {/* 5 KPI Cards Interactive Detail Slide-over / Modal Container */}
      <KpiDetailContainer
        activeMetric={selectedKpiMetric}
        onClose={() => setSelectedKpiMetric(null)}
        locationId={selectedHub}
      />

      {/* Create Custom Shift Dialog */}
      <ExecutiveCustomShiftDialog
        open={customShiftDialogOpen}
        onClose={() => setCustomShiftDialogOpen(false)}
        existingShiftNames={shiftOptions.map((s) => s.name)}
        locationId={selectedHub}
        onSuccess={handleCustomShiftCreated}
      />

      {/* Executive Header Search Results Slide-over Drawer */}
      <ExecutiveSearchResultsDrawer
        isOpen={searchDrawerOpen}
        onClose={() => setSearchDrawerOpen(false)}
        query={searchDrawerQuery}
        results={searchDrawerResults}
        onSelectDept={(deptId: string) => setSelectedDept(deptId)}
        onSelectHub={(hubId: string) => setSelectedHub(hubId)}
        selectedHubId={selectedHub}
      />
    </DashboardLayout>
  );
}