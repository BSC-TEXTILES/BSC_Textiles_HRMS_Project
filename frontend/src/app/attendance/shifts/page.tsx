'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { DetailDrillDownModal, type DetailMetric } from '@/components/dashboard/DetailDrillDownModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { ADMIN_ROLES } from '@/lib/roles';

/** Attendance statuses selectable from the Status filter (see shift-board API). */
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
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Canonical list of departments in required exact order */
const CANONICAL_DEPARTMENTS = [
  'Customer Service & Billing',
  'Finance & Accounts',
  'Human Resources',
  'Inventory & Logistics',
  'Sales & Retail',
  'Store Operations',
] as const;

interface DepartmentOption {
  id: string;
  name: string;
  disabled?: boolean;
}

interface ShiftOption {
  id: string;
  name: string;
  timeRange?: string;
  noRosterInHub?: boolean;
}

export default function ShiftsRosterPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role as string | undefined;
  const userLocationId = (session?.user as any)?.locationId as string | undefined;
  const canViewAllHubs = (ADMIN_ROLES as readonly string[]).includes(role || '');

  const [shifts, setShifts] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDate, setSelectedDate] = useState(() => ymdOf(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [board, setBoard] = useState<any>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [drill, setDrill] = useState<{ metric: DetailMetric; title: string; shiftId?: string; shiftName?: string } | null>(null);
  const [newShift, setNewShift] = useState({
    name: '',
    code: '',
    locationId: '',
    startTime: '09:30',
    endTime: '18:30',
    gracePeriod: 5,
    lateThreshold: 15,
  });

  const reqIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  /* ---------------- reference data ---------------- */

  useEffect(() => {
    if (!session) return;
    setSelectedLocation((cur) => {
      if (cur) return cur;
      if (canViewAllHubs || !userLocationId) return 'all';
      return userLocationId;
    });
  }, [session, canViewAllHubs, userLocationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/locations/all');
        if (!cancelled) setLocations(res.data || []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const [shiftsLoading, setShiftsLoading] = useState(true);
  const [shiftsError, setShiftsError] = useState<string | null>(null);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [deptsError, setDeptsError] = useState<string | null>(null);

  const [shiftDropdownOpen, setShiftDropdownOpen] = useState(false);
  const [shiftHighlightedIndex, setShiftHighlightedIndex] = useState(-1);
  const shiftContainerRef = useRef<HTMLDivElement>(null);
  const shiftTriggerRef = useRef<HTMLButtonElement>(null);

  /* ---------------- reference data ---------------- */

  useEffect(() => {
    if (!session) return;
    setSelectedLocation((cur) => {
      if (cur) return cur;
      if (canViewAllHubs || !userLocationId) return 'all';
      return userLocationId;
    });
  }, [session, canViewAllHubs, userLocationId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/locations/all');
        if (!cancelled) setLocations(res.data || []);
      } catch (e) {
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchDepartments = useCallback(async () => {
    setDeptsLoading(true);
    setDeptsError(null);
    try {
      const res = await api.get('/departments', { params: { limit: 100 } });
      setDepartments(res.data?.departments || []);
    } catch (err: any) {
      console.error('Failed to load departments:', err);
      setDeptsError('Could not load departments');
    } finally {
      setDeptsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const fetchShifts = useCallback(async () => {
    setShiftsLoading(true);
    setShiftsError(null);
    try {
      const res = await api.get('/shifts', { params: { limit: 100 } });
      setShifts(res.data?.shifts || []);
    } catch (err: any) {
      console.error('Failed to load shifts:', err);
      setShiftsError('Could not load shifts');
    } finally {
      setShiftsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  /* ---------------- memoized canonical dropdown options ---------------- */

  const departmentOptions = useMemo<DepartmentOption[]>(() => {
    const options: DepartmentOption[] = [
      { id: 'all', name: 'All Departments', disabled: false },
    ];

    for (const canonicalName of CANONICAL_DEPARTMENTS) {
      // Find matching department in current hub if specified, otherwise across any hub
      let match = departments.find(
        (d) =>
          d.name?.trim().toLowerCase() === canonicalName.toLowerCase() &&
          (selectedLocation && selectedLocation !== 'all' ? d.locationId === selectedLocation : true)
      );
      if (!match) {
        match = departments.find((d) => d.name?.trim().toLowerCase() === canonicalName.toLowerCase());
      }

      if (match) {
        options.push({
          id: match.id,
          name: canonicalName,
          disabled: false,
        });
      } else {
        if (process.env.NODE_ENV !== 'production' && !deptsLoading && departments.length > 0) {
          console.warn(`Department "${canonicalName}" is missing from master list.`);
        }
        options.push({
          id: `missing-${canonicalName}`,
          name: `${canonicalName} (Not available)`,
          disabled: true,
        });
      }
    }

    return options;
  }, [departments, selectedLocation, deptsLoading]);

  const uniqueShiftOptions = useMemo<ShiftOption[]>(() => {
    const options: ShiftOption[] = [
      { id: 'all', name: 'All Shifts' },
    ];

    // Group shifts by canonical code or name
    const groups = new Map<string, any[]>();
    for (const s of shifts) {
      const key = (s.code?.trim().toUpperCase() || s.name?.trim().toLowerCase());
      if (!key) continue;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(s);
    }

    // Preserve the canonical standard order: MORNING, GENERAL, EVENING, NIGHT, then custom batches
    const STANDARD_KEYS = ['MORNING', 'GENERAL', 'EVENING', 'NIGHT'];
    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      const idxA = STANDARD_KEYS.indexOf(a);
      const idxB = STANDARD_KEYS.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.localeCompare(b);
    });

    for (const key of sortedKeys) {
      const list = groups.get(key) || [];
      const activeList = list.filter((s) => s.status !== 'INACTIVE');
      const targetList = activeList.length > 0 ? activeList : list;

      let chosen = targetList.find(
        (s) => (selectedLocation && selectedLocation !== 'all' ? s.locationId === selectedLocation : true)
      );
      const existsInSelectedHub = Boolean(chosen);
      if (!chosen) {
        chosen = targetList[0];
      }
      if (!chosen) continue;

      const start = hmOf(chosen.startTime);
      const end = hmOf(chosen.endTime);
      const timeRange = start !== '—' && end !== '—' ? `${start} – ${end}${chosen.overnight ? ' (+1d)' : ''}` : undefined;
      const noRosterInHub = Boolean(selectedLocation && selectedLocation !== 'all' && !existsInSelectedHub);

      options.push({
        id: chosen.id,
        name: chosen.name,
        timeRange,
        noRosterInHub,
      });
    }

    return options;
  }, [shifts, selectedLocation]);

  // If selected shift is no longer available, reset to 'all' with toast notice
  useEffect(() => {
    if (shiftsLoading) return;
    if (selectedShift !== 'all') {
      const exists = shifts.some((s) => s.id === selectedShift);
      if (!exists && shifts.length > 0) {
        setSelectedShift('all');
        toast('Selected shift is no longer available. Reset to All Shifts.', { id: 'shift-reset-toast' });
      }
    }
  }, [shifts, selectedShift, shiftsLoading]);

  // Synchronize department selection when switching location hubs
  useEffect(() => {
    if (deptsLoading || selectedDept === 'all') return;
    const currentDeptObj = departments.find((d) => d.id === selectedDept);
    if (!currentDeptObj) return;

    const code = currentDeptObj.code?.trim().toUpperCase();
    const name = currentDeptObj.name?.trim().toLowerCase();

    const matchInLoc = departments.find(
      (d) =>
        (d.code?.trim().toUpperCase() === code || d.name?.trim().toLowerCase() === name) &&
        (selectedLocation === 'all' ? true : d.locationId === selectedLocation)
    );

    if (matchInLoc && matchInLoc.id !== selectedDept) {
      setSelectedDept(matchInLoc.id);
    }
  }, [selectedLocation, selectedDept, departments, deptsLoading]);

  // Synchronize shift selection when switching location hubs
  useEffect(() => {
    if (shiftsLoading || selectedShift === 'all') return;
    const currentShiftObj = shifts.find((s) => s.id === selectedShift);
    if (!currentShiftObj) return;

    const code = currentShiftObj.code?.trim().toUpperCase();
    const name = currentShiftObj.name?.trim().toLowerCase();

    const matchInLoc = shifts.find(
      (s) =>
        (s.code?.trim().toUpperCase() === code || s.name?.trim().toLowerCase() === name) &&
        (selectedLocation === 'all' ? true : s.locationId === selectedLocation)
    );

    if (matchInLoc && matchInLoc.id !== selectedShift) {
      setSelectedShift(matchInLoc.id);
    }
  }, [selectedLocation, selectedShift, shifts, shiftsLoading]);

  // Click outside to close shift listbox
  useEffect(() => {
    if (!shiftDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (shiftContainerRef.current && !shiftContainerRef.current.contains(e.target as Node)) {
        setShiftDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [shiftDropdownOpen]);

  const handleShiftKeyDown = (e: React.KeyboardEvent) => {
    if (shiftsLoading) return;
    if (!shiftDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setShiftDropdownOpen(true);
        const selIdx = uniqueShiftOptions.findIndex((o) => o.id === selectedShift);
        setShiftHighlightedIndex(selIdx >= 0 ? selIdx : 0);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setShiftHighlightedIndex((prev) => (prev + 1) % uniqueShiftOptions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setShiftHighlightedIndex((prev) => (prev - 1 + uniqueShiftOptions.length) % uniqueShiftOptions.length);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const highlighted = uniqueShiftOptions[shiftHighlightedIndex];
      if (highlighted) {
        setSelectedShift(highlighted.id);
      }
      setShiftDropdownOpen(false);
      shiftTriggerRef.current?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShiftDropdownOpen(false);
      shiftTriggerRef.current?.focus();
    } else if (e.key === 'Tab') {
      setShiftDropdownOpen(false);
    }
  };

  const selectedShiftLabel = useMemo(() => {
    if (selectedShift === 'all') return 'All Shifts';
    const found = uniqueShiftOptions.find((o) => o.id === selectedShift);
    if (found) return found.name;
    const match = shifts.find((s) => s.id === selectedShift);
    return match?.name || 'All Shifts';
  }, [selectedShift, uniqueShiftOptions, shifts]);

  /* ---------------- board data ---------------- */

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

  /* ---------------- actions ---------------- */

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newShift.name || !newShift.locationId) {
      toast.error('Shift name and location are required');
      return;
    }
    try {
      // Backend expects 24-hour wall-clock times (HH:MM), not full datetimes.
      await api.post('/shifts', {
        name: newShift.name,
        code: (newShift.code || `SHIFT-${Math.floor(100 + Math.random() * 900)}`).toUpperCase(),
        locationId: newShift.locationId,
        startTime: newShift.startTime,
        endTime: newShift.endTime,
        gracePeriod: Number(newShift.gracePeriod),
        lateThreshold: Number(newShift.lateThreshold),
      });
      toast.success('Shift created successfully!');
      setIsAddModalOpen(false);
      await fetchShifts();
      fetchBoard({ bustCache: true });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to create shift');
    }
  };

  const stepDate = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const dt = new Date(y, m - 1, d + delta);
    setSelectedDate(ymdOf(dt));
  };

  const openDrill = (metric: DetailMetric, title: string, shiftId?: string, shiftName?: string) =>
    setDrill({ metric, title, shiftId, shiftName });

  /* ---------------- derived ---------------- */

  const summary = board?.summary || null;
  const shiftCards: any[] = useMemo(() => board?.shifts || [], [board]);
  const hubName = useCallback(
    (id: string) => (id === 'all' ? 'All Hubs (Karnataka)' : locations.find((l) => l.id === id)?.name || 'All Hubs'),
    [locations]
  );

  const graceMinutes = useMemo(() => {
    const list = shiftCards.length > 0 ? shiftCards : shifts;
    if (list.length === 0) return 5;
    return Math.min(...list.map((s) => Number(s.gracePeriod ?? 5)));
  }, [shiftCards, shifts]);

  const lateCutoffMinutes = useMemo(() => {
    const list = shiftCards.length > 0 ? shiftCards : shifts;
    if (list.length === 0) return 15;
    return Math.max(...list.map((s) => Number(s.lateThreshold ?? 15)));
  }, [shiftCards, shifts]);

  const activeShiftsShown = shiftCards.length || shifts.length;

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
              <span className="text-[#1346a1]">Staff Rostering & Shift Allocations</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight">
                Floor Shifts & Workforce Rosters Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#F8F4F1] text-[#1346a1] text-[10px] font-bold uppercase tracking-wider border border-[#E5D5D7] flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#1346a1]"></span>
                {board?.isToday ? 'Live Roster' : board?.isFuture ? 'Future Schedule' : 'Historical Roster'}
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Active shift timing definitions, grace windows, store rosters, and floor allocation oversight — all
              figures below are read live from the attendance records for the selected date.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchBoard({ bustCache: true })}
              disabled={loading}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all text-xs font-bold disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[18px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
              Refresh
            </button>
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white shadow-md shadow-[#1346a1]/20 transition-all text-xs font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>+ Create Floor Shift</span>
            </button>
          </div>
        </div>

        {/* 5 SHIFT KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <button type="button" onClick={() => openDrill('shift-configs', 'Active Shifts')} aria-label="View Active Shifts details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Active Shifts</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6]">
                <span className="material-symbols-outlined text-[18px]">calendar_view_week</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">{activeShiftsShown}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">{locations.length} Hub{locations.length === 1 ? '' : 's'} In Scope</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-[#1346a1] dark:text-[#E8DCC6] font-semibold">
              <span>Shift windows configured</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-roster', 'Total Staff Rostered')} aria-label="View Total Staff Rostered details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Total Staff Rostered</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6]">
                <span className="material-symbols-outlined text-[18px]">badge</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">{loading ? '—' : summary?.rostered ?? 0}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">{summary?.withRecord ?? 0} with punch records</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <span>On the {selectedDate} roster</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-roster', 'Present On Floor')} aria-label="View Present On Floor details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Present On Floor</span>
              <div className="w-8 h-8 rounded-lg bg-[#F8F4F1] dark:bg-slate-800 flex items-center justify-center text-[#1346a1] dark:text-[#E8DCC6]">
                <span className="material-symbols-outlined text-[18px]">wb_sunny</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0058be] dark:text-blue-300">{loading ? '—' : summary?.present ?? 0}</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                {summary?.checkedOut ?? 0} checked out • {summary?.onBreak ?? 0} on break
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <span>{summary?.late ?? 0} arrived late</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-roster', 'Absent & Not Punched')} aria-label="View Absent and Not Punched details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Absent / No Punch</span>
              <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center text-red-600 dark:text-red-400">
                <span className="material-symbols-outlined text-[18px]">person_alert</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {loading ? '—' : (summary?.absent ?? 0) + (summary?.notPunchedIn ?? 0)}
              </div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                {summary?.absent ?? 0} absent • {summary?.notPunchedIn ?? 0} awaiting punch
              </div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-amber-600 dark:text-amber-400 font-semibold">
              <span>{summary?.incomplete ?? 0} missing OUT punch</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button type="button" onClick={() => openDrill('shift-exceptions', 'Grace Period & Regularization')} aria-label="View Grace Period and Regularization details" className={kpiCardClass}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Grace Period</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30] dark:text-white">{graceMinutes} Mins</div>
              <div className="text-[11px] text-slate-400 dark:text-slate-500">{lateCutoffMinutes}m Late Cutoff</div>
            </div>
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
              <span>{summary?.late ?? 0} late arrivals today</span>
            </div>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 group-hover:text-[#1346a1] transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>
        </div>

        {/* Location Filter & Shift Cards Grid */}
        <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#0b1c30] dark:text-white mr-1">Filter by Location Hub:</span>
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
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {shifts.length} Shift{shifts.length === 1 ? '' : 's'} Configured
            {summary ? ` • ${summary.rostered} Rostered` : ''}
          </span>
        </div>

        {/* Detail Drill-down Filters (Department / Shift / Status / Date) */}
        <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="fsr-dept" className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Department
            </label>
            <select
              id="fsr-dept"
              aria-label="Filter by department"
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              disabled={deptsLoading}
              className="h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0b1c30] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {deptsLoading ? (
                <option value="all">Loading…</option>
              ) : (
                departmentOptions.map((d) => (
                  <option key={d.id} value={d.id} disabled={d.disabled}>
                    {d.name}
                  </option>
                ))
              )}
            </select>
            {deptsError && (
              <div className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                <span>Could not load departments</span>
                <button
                  type="button"
                  onClick={() => fetchDepartments()}
                  className="underline font-bold hover:text-red-700"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <div ref={shiftContainerRef} className="relative flex flex-col gap-1">
            <label htmlFor="fsr-shift" className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              Shift
            </label>
            <button
              ref={shiftTriggerRef}
              type="button"
              id="fsr-shift"
              role="combobox"
              aria-label="Filter by shift"
              aria-expanded={shiftDropdownOpen}
              aria-haspopup="listbox"
              aria-controls="fsr-shift-listbox"
              aria-activedescendant={
                shiftDropdownOpen && shiftHighlightedIndex >= 0
                  ? `shift-opt-${uniqueShiftOptions[shiftHighlightedIndex]?.id || 'all'}`
                  : undefined
              }
              onClick={() => {
                if (shiftsLoading) return;
                setShiftDropdownOpen((prev) => !prev);
                if (!shiftDropdownOpen) {
                  const selIdx = uniqueShiftOptions.findIndex((o) => o.id === selectedShift);
                  setShiftHighlightedIndex(selIdx >= 0 ? selIdx : 0);
                }
              }}
              onKeyDown={handleShiftKeyDown}
              disabled={shiftsLoading}
              className="h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0b1c30] dark:text-white flex items-center justify-between gap-2 min-w-[170px] focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <span className="truncate">{shiftsLoading ? 'Loading…' : selectedShiftLabel}</span>
              <span className={`material-symbols-outlined text-[18px] text-slate-400 transition-transform ${shiftDropdownOpen ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {shiftDropdownOpen && (
              <ul
                id="fsr-shift-listbox"
                role="listbox"
                aria-label="Filter by shift"
                tabIndex={-1}
                className="absolute left-0 top-[calc(100%+4px)] z-50 w-64 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0e172a] p-1 shadow-lg focus:outline-none"
              >
                {uniqueShiftOptions.map((opt, idx) => {
                  const isSelected = selectedShift === opt.id;
                  const isHighlighted = shiftHighlightedIndex === idx;
                  return (
                    <li
                      key={opt.id}
                      id={`shift-opt-${opt.id}`}
                      role="option"
                      aria-selected={isSelected}
                      aria-label={
                        opt.id === 'all'
                          ? 'All shifts'
                          : `${opt.name}, ${opt.timeRange || ''}${opt.noRosterInHub ? ', No roster in this hub' : ''}`.trim()
                      }
                      onClick={() => {
                        setSelectedShift(opt.id);
                        setShiftDropdownOpen(false);
                        shiftTriggerRef.current?.focus();
                      }}
                      onMouseEnter={() => setShiftHighlightedIndex(idx)}
                      className={`flex flex-col gap-0.5 px-3 py-2 rounded-md cursor-pointer text-left transition-colors ${
                        isHighlighted ? 'bg-slate-100 dark:bg-slate-800' : ''
                      } ${
                        isSelected
                          ? 'bg-[#eff4ff] dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 font-bold'
                          : 'text-[#0b1c30] dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="text-xs font-semibold">{opt.name}</span>
                        {opt.noRosterInHub && (
                          <span className="text-[10px] text-slate-400 font-normal italic">
                            No roster in this hub
                          </span>
                        )}
                        {isSelected && (
                          <span className="material-symbols-outlined text-[16px] text-[#0058be] dark:text-blue-400">
                            check
                          </span>
                        )}
                      </div>
                      {opt.timeRange && (
                        <span className="text-[11px] text-slate-400 dark:text-slate-400 font-mono font-normal">
                          {opt.timeRange}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {shiftsError && (
              <div className="flex items-center gap-1 text-[11px] text-red-600 font-medium">
                <span>Could not load shifts</span>
                <button
                  type="button"
                  onClick={() => fetchShifts()}
                  className="underline font-bold hover:text-red-700"
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fsr-status" className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Attendance Status</label>
            <select
              id="fsr-status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0b1c30] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="fsr-date" className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Date</label>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => stepDate(-1)}
                aria-label="Previous day"
                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <input
                id="fsr-date"
                type="date"
                value={selectedDate}
                onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[#0b1c30] dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40 cursor-pointer"
              />
              <button
                type="button"
                onClick={() => stepDate(1)}
                aria-label="Next day"
                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDate(ymdOf(new Date()))}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-[#eff4ff] border border-[#dce9ff] text-[#0058be] hover:bg-[#dce9ff]"
              >
                Today
              </button>
            </div>
          </div>

          <div className="ml-auto text-right">
            {error ? (
              <button
                type="button"
                onClick={() => fetchBoard({ bustCache: true })}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Failed to load — Retry
              </button>
            ) : (
              <span className="text-[11px] text-slate-400 dark:text-slate-500">
                {loading ? 'Loading roster…' : `${board?.total ?? 0} record${(board?.total ?? 0) === 1 ? '' : 's'} match the filters`}
              </span>
            )}
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
              { label: 'Scheduled', value: summary.scheduled, tone: 'text-slate-500' },
            ].map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#0e172a] border border-slate-200/80 dark:border-slate-800 font-semibold text-slate-600 dark:text-slate-300">
                <span className={`font-mono font-bold ${s.tone}`}>{s.value}</span>
                {s.label}
              </span>
            ))}
          </div>
        )}

        {/* SHIFTS GRID */}
        {error && !board ? (
          <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-10 text-center">
            <span className="material-symbols-outlined text-red-400 text-[36px] mb-2">error</span>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">{error}</p>
            <button
              type="button"
              onClick={() => fetchBoard({ bustCache: true })}
              className="mt-3 px-4 py-2 text-xs font-semibold text-white bg-[#1346a1] hover:bg-[#0e3882] rounded-lg"
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(shiftCards.length > 0 ? shiftCards : shifts.map((s) => ({ ...s, staff: null }))).map((s: any) => {
              const staff = s.staff || { rostered: 0, present: 0, absent: 0, onLeave: 0, weeklyOff: 0, missingPunch: 0, onBreak: 0, late: 0 };
              const locationLabel = s.locationName || locations.find((l) => l.id === s.locationId)?.name || '';
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`View roster details for ${s.name}`}
                  onClick={() => openDrill('shift-roster', `Shift: ${s.name}`, s.id, s.name)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openDrill('shift-roster', `Shift: ${s.name}`, s.id, s.name);
                    }
                  }}
                  className="group bg-white dark:bg-[#0e172a] rounded-xl p-5 border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md hover:border-[#1346a1]/40 dark:hover:border-blue-500/40 hover:bg-[#F8F4F1]/30 dark:hover:bg-slate-800/40 transition-all flex flex-col justify-between cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
                >
                  <div>
                    {/* Card Header with Badges */}
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
                          {s.status === 'ACTIVE' ? 'Active' : s.status || 'Active'}
                        </span>
                        {s.overnight && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Overnight
                          </span>
                        )}
                        <span className="text-[11px] font-extrabold px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1 shadow-xs">
                          <span className="material-symbols-outlined text-[13px]">groups</span>
                          <span>{staff.rostered} Staff</span>
                        </span>
                      </div>
                    </div>

                    {/* PROMINENT WORKFORCE HEADCOUNT BOX */}
                    <div className="mt-3.5 p-3 rounded-xl bg-gradient-to-r from-blue-50/90 via-sky-50/60 to-indigo-50/80 dark:from-blue-950/40 dark:via-slate-900/40 dark:to-indigo-950/30 border border-blue-200/80 dark:border-blue-900/60 flex items-center justify-between shadow-xs">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-lg bg-[#0058be] text-white flex items-center justify-center shadow-xs shrink-0">
                          <span className="material-symbols-outlined text-[20px]">badge</span>
                        </div>
                        <div>
                          <div className="text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 tracking-wider">
                            Staff Headcount
                          </div>
                          <div className="text-sm font-extrabold text-[#0058be] dark:text-blue-300 font-mono leading-tight">
                            {staff.rostered} Employees Working
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
                        <span className="text-slate-500 dark:text-slate-400">Working Window:</span>
                        <span className="font-bold font-mono text-[#0b1c30] dark:text-white">
                          {hmOf(s.startTime)} – {hmOf(s.endTime)}
                          {s.overnight ? ' (+1d)' : ''}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span>Staff on this Shift:</span>
                        <span className="font-bold text-[#0058be] dark:text-blue-300 font-mono">
                          {staff.rostered} Staff ({staff.present} Present • {staff.absent + staff.onLeave + staff.weeklyOff + staff.missingPunch} Off)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span>Grace Period:</span>
                        <span className="font-bold text-[#1346a1] dark:text-[#E8DCC6]">{s.gracePeriod ?? 5} Mins</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span>Late Threshold:</span>
                        <span className="font-bold text-red-600 dark:text-red-400">{s.lateThreshold ?? 15} Mins</span>
                      </div>
                      <div className="flex items-center justify-between text-slate-600 dark:text-slate-300 px-1">
                        <span>Late / Missing Punch:</span>
                        <span className="font-bold text-amber-600 dark:text-amber-400">
                          {staff.late} late • {staff.missingPunch} missing
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-400 dark:text-slate-500 font-medium">{selectedDate}</span>
                    <span className="font-semibold text-[#1346a1] dark:text-[#E8DCC6] flex items-center gap-1">
                      <span>View Roster Details</span>
                      <span className="material-symbols-outlined text-[14px]">chevron_right</span>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-[#0058be] dark:text-blue-400 group-hover:text-[#1346a1] transition-colors">
                    <span>View {staff.rostered} Roster Details</span>
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* CREATE SHIFT MODAL */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1346a1] text-[20px]">calendar_view_week</span>
                  <h3 className="font-bold text-base text-[#0b1c30]">Create New Floor Shift</h3>
                </div>
                <button
                  onClick={() => setIsAddModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateShift} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Shift Name *</label>
                  <input
                    type="text"
                    required
                    value={newShift.name}
                    onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                    placeholder="e.g. Morning Retail Shift A"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Location Hub *</label>
                  <select
                    required
                    value={newShift.locationId}
                    onChange={(e) => setNewShift({ ...newShift, locationId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">Select Location</option>
                    {locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Time (HH:MM)</label>
                    <input
                      type="time"
                      required
                      value={newShift.startTime}
                      onChange={(e) => setNewShift({ ...newShift, startTime: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">End Time (HH:MM)</label>
                    <input
                      type="time"
                      required
                      value={newShift.endTime}
                      onChange={(e) => setNewShift({ ...newShift, endTime: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Grace Period (Mins)</label>
                    <input
                      type="number"
                      value={newShift.gracePeriod}
                      onChange={(e) => setNewShift({ ...newShift, gracePeriod: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Late Cutoff (Mins)</label>
                    <input
                      type="number"
                      value={newShift.lateThreshold}
                      onChange={(e) => setNewShift({ ...newShift, lateThreshold: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                    />
                  </div>
                </div>

                <p className="text-[10px] text-slate-400">
                  End time earlier than the start time creates an overnight shift (e.g. 22:00 → 07:00).
                </p>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#1346a1] hover:bg-[#0e3882] text-white rounded-lg font-bold shadow-sm"
                  >
                    Save Floor Shift
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

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
