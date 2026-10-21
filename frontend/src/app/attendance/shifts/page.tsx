'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DetailDrillDownModal, type DetailMetric } from '@/components/dashboard/DetailDrillDownModal';
import { AddShiftModal } from './components/AddShiftModal';
import { EditShiftModal } from './components/EditShiftModal';
import { ReassignShiftModal } from './components/ReassignShiftModal';
import { DeleteShiftModal } from './components/DeleteShiftModal';
import { ViewShiftEmployeesModal } from './components/ViewShiftEmployeesModal';
import { ShiftsDataTable } from './components/ShiftsDataTable';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { ADMIN_ROLES } from '@/lib/roles';
import { SHIFTS_CHANGED_EVENT, notifyShiftsChanged } from '@/lib/shiftRegistry';
import {
  Users,
  Clock,
  Plus,
  RefreshCw,
  Search,
  LayoutGrid,
  List,
  Edit3,
  ArrowRightLeft,
  Trash2,
  Utensils,
  Coffee,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';

/** Attendance statuses selectable from the Status filter */
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'PRESENT', label: 'Present (any)' },
  { value: 'CHECKED_OUT', label: 'Checked Out' },
  { value: 'PUNCHED_IN', label: 'Punched In' },
  { value: 'LATE', label: 'Late' },
  { value: 'ON_BREAK', label: 'On Break' },
  { value: 'ABSENT', label: 'Absent' },
  { value: 'ON_LEAVE', label: 'On Leave' },
  { value: 'WEEKLY_OFF', label: 'Weekly Off' },
  { value: 'HOLIDAY', label: 'Holiday' },
  { value: 'NOT_PUNCHED_IN', label: 'Not Punched In' },
  { value: 'INCOMPLETE', label: 'Missing Punch' },
  { value: 'SCHEDULED', label: 'Scheduled' },
];

function ymdOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hmOf(iso?: string | null): string {
  if (!iso) return '—';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(iso)) {
    const parts = iso.split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/** Canonical list of departments */
const CANONICAL_DEPARTMENTS = [
  'Customer Service & Billing',
  'Finance & Accounts',
  'Human Resources',
  'Inventory & Logistics',
  'Sales & Retail',
  'Store Operations',
] as const;

export default function ShiftsRosterPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const userLocationId = (session?.user as any)?.locationId as string | undefined;
  const canViewAllHubs = (ADMIN_ROLES as readonly string[]).includes(role || '');

  // Shifts & References
  const [shifts, setShifts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);

  // Filters & State
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => ymdOf(new Date()));
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  // Board Data & Status
  const [loading, setLoading] = useState(true);
  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<any>(null);

  // Modals State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any | null>(null);
  const [reassigningShift, setReassigningShift] = useState<any | null>(null);
  const [reassignPreselectedEmpId, setReassignPreselectedEmpId] = useState<string | undefined>(undefined);
  const [deletingShift, setDeletingShift] = useState<any | null>(null);
  const [viewEmployeesShift, setViewEmployeesShift] = useState<any | null>(null);
  const [drill, setDrill] = useState<{ metric: DetailMetric; title: string; shiftId?: string; shiftName?: string } | null>(null);

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------------- Initialize location ---------------- */
  useEffect(() => {
    if (!session) return;
    setSelectedLocation((cur) => {
      if (cur) return cur;
      if (canViewAllHubs || !userLocationId) return 'all';
      return userLocationId;
    });
  }, [session, canViewAllHubs, userLocationId]);

  /* ---------------- Fetch locations & departments ---------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [locRes, deptRes] = await Promise.all([
          api.get('/locations/all'),
          api.get('/departments', { params: { limit: 100 } }),
        ]);
        if (!cancelled) {
          setLocations(locRes.data || []);
          setDepartments(deptRes.data?.departments || []);
        }
      } catch (e) {
        console.error('Failed to load reference data:', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------- Fetch Shifts from Backend ---------------- */
  const fetchShifts = useCallback(async () => {
    setShiftsLoading(true);
    try {
      const params: any = { limit: 100 };
      if (selectedLocation && selectedLocation !== 'all') {
        params.locationId = selectedLocation;
      }
      const res = await api.get('/shifts', { params });
      setShifts(res.data?.shifts || []);
    } catch (err: any) {
      console.error('Failed to load shifts:', err);
    } finally {
      setShiftsLoading(false);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  // Synchronize shifts on global events
  useEffect(() => {
    const handleShiftEvent = () => {
      fetchShifts();
    };
    window.addEventListener(SHIFTS_CHANGED_EVENT, handleShiftEvent);
    return () => window.removeEventListener(SHIFTS_CHANGED_EVENT, handleShiftEvent);
  }, [fetchShifts]);

  /* ---------------- Fetch Live Roster Board ---------------- */
  const fetchBoard = useCallback(
    async (opts?: { bustCache?: boolean }) => {
      if (!selectedDate) return;
      const rid = ++reqIdRef.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const params: any = { date: selectedDate, limit: 1 };
        if (selectedLocation && selectedLocation !== 'all') params.locationId = selectedLocation;
        if (selectedDept !== 'all') params.departmentId = selectedDept;
        if (selectedShift !== 'all') params.shiftId = selectedShift;
        if (selectedStatus !== 'all') params.status = selectedStatus;
        if (opts?.bustCache) params._ts = String(Date.now());
        const res = await api.get('/attendance/shift-board', { params, signal: controller.signal });
        if (rid !== reqIdRef.current) return;
        setBoard(res.data);
      } catch (err: any) {
        if (rid !== reqIdRef.current) return;
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError' || err?.message === 'canceled') return;
        console.error('Shift board load failed:', err);
        setError(err?.response?.data?.message || err?.response?.data?.error || 'Failed to load the shift board.');
        setBoard(null);
      } finally {
        if (rid === reqIdRef.current) setLoading(false);
      }
    },
    [selectedDate, selectedLocation, selectedDept, selectedShift, selectedStatus]
  );

  useEffect(() => {
    fetchBoard();
    return () => abortRef.current?.abort();
  }, [fetchBoard]);

  const stepDate = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d + delta);
    setSelectedDate(ymdOf(dt));
  };

  const openDrill = (metric: DetailMetric, title: string, shiftId?: string, shiftName?: string) =>
    setDrill({ metric, title, shiftId, shiftName });

  /* ---------------- Filter and Search Shifts ---------------- */
  const boardShiftMap = useMemo(() => {
    const map = new Map<string, any>();
    if (board?.shifts) {
      for (const bs of board.shifts) {
        map.set(bs.id, bs);
      }
    }
    return map;
  }, [board]);

  const mergedShifts = useMemo(() => {
    return shifts.map((s) => {
      const bs = boardShiftMap.get(s.id);
      return {
        ...s,
        staff: bs?.staff || {
          rostered: s.staffCount || s._count?.employees || 0,
          present: 0,
          absent: 0,
          onLeave: 0,
          weeklyOff: 0,
          missingPunch: 0,
          onBreak: 0,
          late: 0,
        },
      };
    });
  }, [shifts, boardShiftMap]);

  const filteredShifts = useMemo(() => {
    let result = mergedShifts;

    // Filter by location
    if (selectedLocation && selectedLocation !== 'all') {
      result = result.filter((s) => s.locationId === selectedLocation);
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.code?.toLowerCase().includes(q) ||
          s.locationName?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [mergedShifts, selectedLocation, searchQuery]);

  const summary = board?.summary || null;
  const hubName = useCallback(
    (id: string) => (id === 'all' ? 'All Hubs (Karnataka Combined)' : locations.find((l) => l.id === id)?.name || 'All Hubs'),
    [locations]
  );

  const totalAssignedStaff = useMemo(() => {
    return filteredShifts.reduce((acc, s) => acc + Number(s.staffCount ?? s._count?.employees ?? 0), 0);
  }, [filteredShifts]);

  const drillFilters = {
    locationId: selectedLocation || 'all',
    departmentId: selectedDept,
    shiftId: drill?.shiftId || (selectedShift !== 'all' ? selectedShift : 'all'),
    status: selectedStatus,
    date: selectedDate,
  };

  const drillChips = [
    { label: 'Hub', value: hubName(selectedLocation || 'all') },
    { label: 'Dept', value: departments.find((d) => d.id === selectedDept)?.name || 'All Departments' },
    { label: 'Shift', value: drill?.shiftName || shifts.find((s) => s.id === drillFilters.shiftId)?.name || 'All Shifts' },
    { label: 'Status', value: STATUS_OPTIONS.find((o) => o.value === selectedStatus)?.label || selectedStatus },
    { label: 'Date', value: selectedDate },
  ];

  const kpiCardClass =
    'group bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/40 dark:hover:border-blue-500/40 hover:bg-[#F8F4F1]/40 dark:hover:bg-slate-800/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2';

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <span>Time & Attendance</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#1346a1]">Floor Shifts & Workforce Rosters Directory</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight">
                Floor Shifts & Workforce Rosters Directory
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F8F4F1] text-[#1346a1] text-[10px] font-bold uppercase tracking-wider border border-[#E5D5D7] flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#1346a1]"></span>
                {board?.isToday ? 'Live Roster' : board?.isFuture ? 'Future Schedule' : 'Historical Roster'}
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#0058be] text-[11px] font-mono font-bold border border-blue-200">
                {filteredShifts.length} Shift{filteredShifts.length === 1 ? '' : 's'} • {totalAssignedStaff} Workforce Assigned
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Centralized floor shift directory and workforce allocation module. Create, edit, reassign, and delete floor shifts with Men/Women break allowances and live biometric attendance tracking.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                fetchShifts();
                fetchBoard({ bustCache: true });
                toast.success('Shift directory refreshed');
              }}
              disabled={loading || shiftsLoading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-xs font-bold disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading || shiftsLoading ? 'animate-spin' : ''}`} />
              <span>Refresh / Sync</span>
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-md shadow-[#1346a1]/20 transition-all text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>+ Add Shift</span>
            </button>
          </div>
        </div>

        {/* 5 SHIFT KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <button type="button" onClick={() => openDrill('shift-configs', 'Active Shifts')} aria-label="View Active Shifts details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Configured Shifts</span>
              <span className="material-symbols-outlined text-slate-400 text-[18px]">calendar_view_week</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-[#0b1c30] dark:text-white">
                {filteredShifts.length}
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {hubName(selectedLocation || 'all')}
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-[#1346a1] dark:text-[#E8DCC6] font-semibold">
              <span>View shift specs</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-roster', 'Total Rostered Staff')} aria-label="View Rostered Staff details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Assigned Workforce</span>
              <span className="material-symbols-outlined text-[#1346a1] text-[18px]">badge</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-[#1346a1] dark:text-blue-400">
                {totalAssignedStaff}
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                {summary?.present ?? 0} currently on floor
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-[#1346a1] font-semibold">
              <span>View full roster</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-roster', 'Present On-Time Staff')} aria-label="View On-Time Staff details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">On-Time Attendance</span>
              <span className="material-symbols-outlined text-emerald-600 text-[18px]">check_circle</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {summary ? summary.present - summary.late : 0}
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Within grace window
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-emerald-600 font-semibold">
              <span>View present staff</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-exceptions', 'Late Arrivals')} aria-label="View Late Arrivals details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Late Arrivals</span>
              <span className="material-symbols-outlined text-amber-600 text-[18px]">schedule</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {summary?.late ?? 0}
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Exceeded late threshold
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-amber-600 font-semibold">
              <span>View late staff</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-exceptions', 'Missing Punches')} aria-label="View Missing Punches details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Missing Punches</span>
              <span className="material-symbols-outlined text-rose-600 text-[18px]">warning</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
                {summary?.missingPunch ?? 0}
              </div>
              <span className="text-[11px] font-semibold text-slate-500">
                Incomplete biometric punch
              </span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-rose-600 font-semibold">
              <span>View audit list</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>
        </div>

        {/* Location Filter & Controls Bar */}
        <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#0b1c30] dark:text-white mr-1">Location Hub:</span>
            {canViewAllHubs && (
              <button
                onClick={() => setSelectedLocation('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedLocation === 'all'
                    ? 'bg-[#1346a1] text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                All Hubs (Karnataka Combined)
              </button>
            )}
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => setSelectedLocation(loc.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  selectedLocation === loc.id
                    ? 'bg-[#1346a1] text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {loc.name} ({loc.code})
              </button>
            ))}
          </div>

          {/* Search bar & View toggle */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-60">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search shifts by name or code..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]"
              />
            </div>

            <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                title="Cards View"
                className={`p-1.5 transition-colors ${
                  viewMode === 'cards'
                    ? 'bg-white dark:bg-slate-900 text-[#1346a1] shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                title="Data Table View"
                className={`p-1.5 transition-colors ${
                  viewMode === 'table'
                    ? 'bg-white dark:bg-slate-900 text-[#1346a1] shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Detail Drill-down Filters Strip (Date / Status) */}
        <div className="bg-white dark:bg-[#0e172a] p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Roster Date:</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => stepDate(-1)}
                  aria-label="Previous day"
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                </button>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0b1c30] dark:text-white focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
                />
                <button
                  type="button"
                  onClick={() => stepDate(1)}
                  aria-label="Next day"
                  className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(ymdOf(new Date()))}
                  className="px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-50 text-[#0058be] border border-blue-200 hover:bg-blue-100"
                >
                  Today
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0b1c30] dark:text-white"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-right text-slate-400 text-[11px]">
            {loading ? 'Refreshing biometric roster…' : `${board?.total ?? 0} punch records for ${selectedDate}`}
          </div>
        </div>

        {/* Status meta strip */}
        {summary && !loading && (
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            {[
              { label: 'Checked out', value: summary.checkedOut, tone: 'text-emerald-600' },
              { label: 'Punched in', value: summary.present - summary.checkedOut - summary.onBreak, tone: 'text-blue-600' },
              { label: 'On break', value: summary.onBreak, tone: 'text-blue-600' },
              { label: 'Late', value: summary.late, tone: 'text-amber-600' },
              { label: 'On leave', value: summary.onLeave, tone: 'text-slate-600' },
              { label: 'Weekly off', value: summary.weeklyOff, tone: 'text-slate-500' },
              { label: 'Holiday', value: summary.holiday, tone: 'text-slate-500' },
            ].map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#0e172a] border border-slate-200/80 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                <span className={`font-mono font-bold ${s.tone}`}>{s.value}</span>
                {s.label}
              </span>
            ))}
          </div>
        )}

        {/* MAIN DIRECTORY VIEW: CARDS OR TABLE */}
        {error && !board ? (
          <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto text-red-500 mb-2" />
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{error}</p>
            <button
              type="button"
              onClick={() => fetchBoard({ bustCache: true })}
              className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#1346a1] hover:bg-[#0e3882] rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : viewMode === 'table' ? (
          <ShiftsDataTable
            shifts={filteredShifts}
            locations={locations}
            onViewEmployees={(shift) => setViewEmployeesShift(shift)}
            onEditShift={(shift) => setEditingShift(shift)}
            onChangeShift={(shift) => {
              setReassigningShift(shift);
              setReassignPreselectedEmpId(undefined);
            }}
            onDeleteShift={(shift) => setDeletingShift(shift)}
            onOpenDrill={(shift) => openDrill('shift-roster', `Shift: ${shift.name}`, shift.id, shift.name)}
          />
        ) : filteredShifts.length === 0 ? (
          <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-12 text-center text-slate-400">
            <Users className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <div className="font-bold text-slate-700 dark:text-slate-300 text-sm">No shifts configured for this selection.</div>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              You can create a floor shift with standard names (Shift I – Shift IX) and define Men/Women break durations.
            </p>
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1346a1] text-white text-xs font-bold shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Floor Shift</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredShifts.map((s) => {
              const staff = s.staff || { rostered: s.staffCount || 0, present: 0, absent: 0, onLeave: 0, weeklyOff: 0, missingPunch: 0, onBreak: 0, late: 0 };
              const loc = locations.find((l) => l.id === s.locationId);
              const locationLabel = s.locationName || (loc ? `${loc.name} (${loc.code})` : '');
              const staffCount = Number(s.staffCount ?? s._count?.employees ?? staff.rostered ?? 0);
              const maleLunch = s.maleLunchMinutes ?? s.lunchDurationMinutes ?? 45;
              const femaleLunch = s.femaleLunchMinutes ?? s.lunchDurationMinutes ?? 45;
              const maleTea = s.maleTeaMinutes ?? s.teaDurationMinutes ?? 15;
              const femaleTea = s.femaleTeaMinutes ?? s.teaDurationMinutes ?? 15;

              return (
                <div
                  key={s.id}
                  className="bg-white dark:bg-[#0e172a] rounded-xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-[#1346a1]/40 dark:hover:border-blue-500/40 transition-all flex flex-col justify-between"
                >
                  <div>
                    {/* Card Header & Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[10px] font-mono font-bold text-[#1346a1] dark:text-[#E8DCC6] bg-[#F8F4F1] dark:bg-slate-800 px-2 py-0.5 rounded border border-[#E5D5D7] dark:border-slate-700">
                          {s.code || 'SHIFT'}
                        </span>
                        <h3 className="text-base font-bold text-[#0b1c30] dark:text-white mt-1.5">{s.name}</h3>
                        {locationLabel && (
                          <span className="text-[11px] text-slate-400 dark:text-slate-500">{locationLabel}</span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          {s.status === 'ACTIVE' || !s.status ? 'Active' : s.status}
                        </span>
                        {s.overnight && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                            Overnight
                          </span>
                        )}
                      </div>
                    </div>

                    {/* PROMINENT WORKFORCE HEADCOUNT BOX */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setViewEmployeesShift(s)}
                      className="mt-3.5 p-3 rounded-xl bg-gradient-to-r from-blue-50/90 via-sky-50/60 to-indigo-50/80 dark:from-blue-950/40 dark:via-slate-900/40 dark:to-indigo-950/30 border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between shadow-xs cursor-pointer hover:border-blue-400 transition-colors"
                      title="Click to view assigned employees"
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#0058be] text-white flex items-center justify-center shadow-xs shrink-0">
                          <Users className="w-5 h-5" />
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                            Staff Headcount
                          </div>
                          <div className="text-sm font-extrabold text-[#0058be] dark:text-blue-300 font-mono leading-tight">
                            {staffCount} Employees Assigned
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end text-right">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                          {staff.present} On Floor
                        </span>
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                          {staff.absent} absent • {staff.onLeave} leave
                        </span>
                      </div>
                    </div>

                    {/* Working Parameters */}
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                        <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-[#1346a1]" />
                          Working Window:
                        </span>
                        <span className="font-bold font-mono text-[#0b1c30] dark:text-white">
                          {hmOf(s.startTime)} – {hmOf(s.endTime)}
                          {s.overnight ? ' (+1d)' : ''}
                        </span>
                      </div>

                      {/* Men Break Allowance */}
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span className="flex items-center gap-1">
                          <Utensils className="w-3.5 h-3.5 text-blue-600" />
                          Men Breaks:
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                          {maleLunch}m Lunch • {maleTea}m Tea
                        </span>
                      </div>

                      {/* Women Break Allowance */}
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span className="flex items-center gap-1">
                          <Utensils className="w-3.5 h-3.5 text-pink-600" />
                          Women Breaks:
                        </span>
                        <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                          {femaleLunch}m Lunch • {femaleTea}m Tea
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span>Grace / Late Cutoff:</span>
                        <span className="font-bold text-[#1346a1] dark:text-[#E8DCC6]">
                          {s.gracePeriod ?? 5}m Grace • {s.lateThreshold ?? 15}m Cutoff
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span>Biometric Status:</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {staff.late} late • {staff.missingPunch} missing
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom: Working Actions Bar */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="grid grid-cols-4 gap-1">
                      <button
                        type="button"
                        onClick={() => setViewEmployeesShift(s)}
                        className="py-1.5 px-2 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-1 transition-colors"
                        title="View assigned employees"
                      >
                        <Users className="w-3 h-3 text-[#1346a1]" />
                        <span>Staff</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingShift(s)}
                        className="py-1.5 px-2 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-1 transition-colors"
                        title="Edit shift timings and breaks"
                      >
                        <Edit3 className="w-3 h-3 text-amber-600" />
                        <span>Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReassigningShift(s);
                          setReassignPreselectedEmpId(undefined);
                        }}
                        className="py-1.5 px-2 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center justify-center gap-1 transition-colors"
                        title="Change shift (reassign employees)"
                      >
                        <ArrowRightLeft className="w-3 h-3 text-blue-600" />
                        <span>Reassign</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeletingShift(s)}
                        className="py-1.5 px-2 rounded-lg text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/50 flex items-center justify-center gap-1 transition-colors"
                        title="Delete shift"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => openDrill('shift-roster', `Shift: ${s.name}`, s.id, s.name)}
                      className="w-full py-1.5 px-3 rounded-lg text-[11px] font-bold text-[#1346a1] dark:text-[#E8DCC6] bg-[#F8F4F1]/60 dark:bg-slate-800/80 hover:bg-[#F8F4F1] dark:hover:bg-slate-800 flex items-center justify-between transition-colors border border-[#E5D5D7]/50"
                    >
                      <span>View Live Floor Attendance</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CREATE SHIFT MODAL */}
        <AddShiftModal
          open={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          locations={locations}
          defaultLocationId={selectedLocation !== 'all' ? selectedLocation : locations[0]?.id}
          onSuccess={async () => {
            await fetchShifts();
            fetchBoard({ bustCache: true });
            notifyShiftsChanged({ action: 'CREATE' });
          }}
        />

        {/* EDIT SHIFT MODAL */}
        <EditShiftModal
          open={Boolean(editingShift)}
          shift={editingShift}
          onClose={() => setEditingShift(null)}
          onSuccess={async () => {
            await fetchShifts();
            fetchBoard({ bustCache: true });
            notifyShiftsChanged({ action: 'UPDATE', shiftId: editingShift?.id });
          }}
        />

        {/* REASSIGN SHIFT MODAL */}
        <ReassignShiftModal
          open={Boolean(reassigningShift)}
          sourceShift={reassigningShift}
          availableShifts={shifts}
          preselectedEmployeeId={reassignPreselectedEmpId}
          onClose={() => {
            setReassigningShift(null);
            setReassignPreselectedEmpId(undefined);
          }}
          onSuccess={async () => {
            await fetchShifts();
            fetchBoard({ bustCache: true });
            notifyShiftsChanged({ action: 'UPDATE', shiftId: reassigningShift?.id });
          }}
        />

        {/* DELETE SHIFT MODAL */}
        <DeleteShiftModal
          open={Boolean(deletingShift)}
          shift={deletingShift}
          onClose={() => setDeletingShift(null)}
          onSuccess={async () => {
            await fetchShifts();
            fetchBoard({ bustCache: true });
            notifyShiftsChanged({ action: 'DELETE', shiftId: deletingShift?.id });
          }}
          onReassignRequest={(shift) => {
            setReassigningShift(shift);
            setReassignPreselectedEmpId(undefined);
          }}
        />

        {/* VIEW EMPLOYEES MODAL */}
        <ViewShiftEmployeesModal
          open={Boolean(viewEmployeesShift)}
          shift={viewEmployeesShift}
          onClose={() => setViewEmployeesShift(null)}
          onReassignIndividual={(shift, empId) => {
            setReassigningShift(shift);
            setReassignPreselectedEmpId(empId);
          }}
          onReassignAll={(shift) => {
            setReassigningShift(shift);
            setReassignPreselectedEmpId(undefined);
          }}
        />

        {/* CARD DRILL-DOWN DETAIL VIEW */}
        {drill && (
          <DetailDrillDownModal
            metric={drill.metric}
            title={drill.title}
            filters={drillFilters}
            chips={drillChips}
            preloaded={{ shifts, locations }}
            onClose={() => setDrill(null)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
