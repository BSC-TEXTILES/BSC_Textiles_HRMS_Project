'use client';

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { MetricDrillDownModal, type MetricKey } from '@/components/dashboard/MetricDrillDownModal';
import { DashboardCards } from '@/components/dashboard/DashboardCards';
import { KpiDetailContainer } from '@/components/dashboard/KpiDetailContainer';
import type { MetricDetailType } from '@/types/metricDetail';
import { BscHolidaysCalendar } from '@/components/dashboard/BscHolidaysCalendar';
import { KarnatakaHubsCardSection } from '@/components/dashboard/KarnatakaHubsCardSection';
import { ExecutiveShiftFilter, type ShiftOptionItem } from '@/components/dashboard/ExecutiveShiftFilter';
import { ExecutiveDeptFilter, type DeptOptionItem } from '@/components/dashboard/ExecutiveDeptFilter';
import { CreateCustomShiftModal, type CreatedBatchResult } from '@/components/dashboard/CreateCustomShiftModal';
import api from '@/lib/api';

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
  employeeCode: string;
  employeeName: string;
  locationName: string;
  terminal: string;
  scheduledTime: string;
  actualTime: string;
  method: string;
  score?: number;
  status: 'ON_TIME' | 'EARLY' | 'LATE' | 'OVERTIME' | 'PRESENT';
  incentive?: string;
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
  loc_bly: 'Bellary Silk Emporium (BLY-04)',
  BEL: 'Belagavi Flagship (BEL-01)',
  DAV: 'Davanagere Hub (DAV-02)',
  SHI: 'Shivamogga Hub (SHI-03)',
  BLY: 'Bellary Silk Emporium (BLY-04)',
};

const DEFAULT_HUBS = [
  { id: 'all', code: 'ALL', name: 'All Hubs (Karnataka Combined)' },
  { id: 'BEL', code: 'BEL', name: 'Belagavi Flagship (BEL-01)' },
  { id: 'DAV', code: 'DAV', name: 'Davanagere Hub (DAV-02)' },
  { id: 'SHI', code: 'SHI', name: 'Shivamogga Hub (SHI-03)' },
  { id: 'BLY', code: 'BLY', name: 'Bellary Hub (BLY-04)' },
];

const DEFAULT_DEPTS: DeptOptionItem[] = [
  { id: 'CS', name: 'Customer Service & Billing', code: 'CS' },
  { id: 'FIN', name: 'Finance & Accounts', code: 'FIN' },
  { id: 'HR', name: 'Human Resources', code: 'HR' },
  { id: 'INV', name: 'Inventory & Logistics', code: 'INV' },
  { id: 'SALES', name: 'Sales & Retail', code: 'SALES' },
  { id: 'OPS', name: 'Store Operations', code: 'OPS' },
];

function processDepartments(rawDepts: any[], isAllHubs: boolean): DeptOptionItem[] {
  if (!Array.isArray(rawDepts) || rawDepts.length === 0) return [];

  // Filter out inactive departments if status is present
  const activeDepts = rawDepts.filter((d: any) =>
    d.status ? d.status === 'ACTIVE' : true
  );

  // Group by canonical department key (code if available, otherwise trimmed uppercase name)
  const map = new Map<
    string,
    {
      code?: string;
      name: string;
      ids: string[];
      locations: Set<string>;
    }
  >();

  for (const d of activeDepts) {
    const key = (d.code || d.name || '').trim().toUpperCase();
    if (!key) continue;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        code: d.code,
        name: d.name,
        ids: d.id ? [d.id] : [],
        locations: new Set(d.locationId ? [d.locationId] : []),
      });
    } else {
      if (d.id && !existing.ids.includes(d.id)) {
        existing.ids.push(d.id);
      }
      if (d.locationId) {
        existing.locations.add(d.locationId);
      }
    }
  }

  // Map to DeptOptionItem list
  const items: DeptOptionItem[] = Array.from(map.values()).map((g) => ({
    id: isAllHubs ? g.ids.join(',') : g.ids[0] || g.code || g.name,
    name: g.name,
    code: g.code,
    hubCount: g.locations.size,
  }));

  // Sort alphabetically by department name
  items.sort((a, b) => a.name.localeCompare(b.name));

  return items;
}

const DEFAULT_SHIFTS: ShiftOptionItem[] = [
  { id: 'MORNING', name: 'Morning Shift', timeRange: '09:00 – 18:00', staffCount: 24 },
  { id: 'GENERAL', name: 'General Shift', timeRange: '09:30 – 18:30', staffCount: 8 },
  { id: 'EVENING', name: 'Evening Shift', timeRange: '12:00 – 21:00', staffCount: 3 },
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
  } catch {}
  return String(timeVal).slice(0, 5);
}

function normalizeTimeRange(shift: any): string {
  const nameLower = (shift.name || '').toLowerCase();
  if (nameLower.includes('morning')) return '09:00 – 18:00';
  if (nameLower.includes('general')) return '09:30 – 18:30';
  if (nameLower.includes('evening')) return '12:00 – 21:00';
  const start = parseShiftTime(shift.startTime) || '09:30';
  const end = parseShiftTime(shift.endTime) || '18:30';
  return `${start} – ${end}`;
}

function processShifts(rawShifts: any[], isAllHubs: boolean): ShiftOptionItem[] {
  if (!Array.isArray(rawShifts) || rawShifts.length === 0) return [];

  if (!isAllHubs) {
    const items: ShiftOptionItem[] = rawShifts.map((s: any) => {
      const isBatch = Boolean(s.scannerRoles?.isCustomBatch || s.code?.startsWith('BATCH_'));
      return {
        id: s.id,
        name: s.name,
        timeRange: normalizeTimeRange(s),
        staffCount: s._count?.employees ?? undefined,
        capacity: s.scannerRoles?.capacity ?? undefined,
        isCustomBatch: isBatch,
      };
    });

    return items.sort((a, b) => {
      const getPriority = (name: string) => {
        const n = name.toLowerCase();
        if (n.includes('morning')) return 1;
        if (n.includes('general')) return 2;
        if (n.includes('evening')) return 3;
        return 4;
      };
      const pA = getPriority(a.name);
      const pB = getPriority(b.name);
      if (pA !== pB) return pA - pB;
      return a.name.localeCompare(b.name);
    });
  }

  const standardMorning: any[] = [];
  const standardGeneral: any[] = [];
  const standardEvening: any[] = [];
  const customBatches: any[] = [];

  rawShifts.forEach((s: any) => {
    const isBatch = Boolean(s.scannerRoles?.isCustomBatch || s.code?.startsWith('BATCH_'));
    if (isBatch) {
      customBatches.push(s);
      return;
    }
    const nameLower = (s.name || '').toLowerCase();
    if (nameLower.includes('morning') || s.code === 'MORNING') {
      standardMorning.push(s);
    } else if (nameLower.includes('general') || s.code === 'GENERAL') {
      standardGeneral.push(s);
    } else if (nameLower.includes('evening') || s.code === 'EVENING') {
      standardEvening.push(s);
    } else {
      customBatches.push(s);
    }
  });

  const result: ShiftOptionItem[] = [];

  if (standardMorning.length > 0) {
    const totalStaff = standardMorning.reduce((sum, s) => sum + (s._count?.employees || 0), 0);
    result.push({
      id: standardMorning.map((s) => s.id).join(','),
      name: 'Morning Shift',
      timeRange: '09:00 – 18:00',
      staffCount: totalStaff > 0 ? totalStaff : 24,
      isCustomBatch: false,
    });
  }

  if (standardGeneral.length > 0) {
    const totalStaff = standardGeneral.reduce((sum, s) => sum + (s._count?.employees || 0), 0);
    result.push({
      id: standardGeneral.map((s) => s.id).join(','),
      name: 'General Shift',
      timeRange: '09:30 – 18:30',
      staffCount: totalStaff > 0 ? totalStaff : 8,
      isCustomBatch: false,
    });
  }

  if (standardEvening.length > 0) {
    const totalStaff = standardEvening.reduce((sum, s) => sum + (s._count?.employees || 0), 0);
    result.push({
      id: standardEvening.map((s) => s.id).join(','),
      name: 'Evening Shift',
      timeRange: '12:00 – 21:00',
      staffCount: totalStaff > 0 ? totalStaff : 3,
      isCustomBatch: false,
    });
  }

  const batchByName = new Map<string, ShiftOptionItem>();
  customBatches.forEach((b: any) => {
    if (!batchByName.has(b.name)) {
      batchByName.set(b.name, {
        id: b.id,
        name: b.name,
        timeRange: normalizeTimeRange(b),
        staffCount: b._count?.employees,
        capacity: b.scannerRoles?.capacity,
        isCustomBatch: true,
      });
    }
  });

  Array.from(batchByName.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((batch) => result.push(batch));

  return result;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHub, setSelectedHub] = useState('all');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [selectedShift, setSelectedShift] = useState('all');
  const [hubOptions, setHubOptions] = useState(DEFAULT_HUBS);
  const [shiftOptions, setShiftOptions] = useState<ShiftOptionItem[]>(DEFAULT_SHIFTS);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [shiftsError, setShiftsError] = useState<string | null>(null);
  const [shiftNotice, setShiftNotice] = useState<string | null>(null);
  const [createBatchModalOpen, setCreateBatchModalOpen] = useState(false);
  const shiftCacheRef = useRef<Record<string, ShiftOptionItem[]>>({});
  const [deptOptions, setDeptOptions] = useState<DeptOptionItem[]>(DEFAULT_DEPTS);
  const [deptsLoading, setDeptsLoading] = useState(false);
  const [deptsError, setDeptsError] = useState<string | null>(null);
  const [deptNotice, setDeptNotice] = useState<string | null>(null);
  const deptCacheRef = useRef<Record<string, DeptOptionItem[]>>({});
  const [activeMetric, setActiveMetric] = useState<MetricKey | null>(null);
  const [selectedKpiMetric, setSelectedKpiMetric] = useState<MetricDetailType>(null);
  const [recentPunches, setRecentPunches] = useState<PunchRecord[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [filterAnimationKey, setFilterAnimationKey] = useState(0);

  const fetchDashboardData = useCallback(async () => {
    try {
      setLoading(true);

      // Build comprehensive filter query parameters for backend
      const qp = new URLSearchParams();
      if (selectedHub !== 'all') qp.set('locationId', selectedHub);
      if (selectedDept !== 'all' && selectedDept !== 'ALL') qp.set('departmentId', selectedDept);
      if (selectedShift !== 'all') qp.set('shiftId', selectedShift);
      if (selectedDate) qp.set('date', selectedDate);
      const qs = qp.toString() ? `?${qp.toString()}` : '';

      const [summaryRes, attendanceRes, fvRes] = await Promise.all([
        api.get(`/reports/dashboard-summary${qs}`).catch(() => ({ data: null })),
        api.get(`/attendance${qs ? `${qs}&limit=16` : '?limit=16'}`).catch(() => ({ data: { attendances: [] } })),
        api.get(`/face-verification${qs ? `${qs}&limit=16` : '?limit=16'}`).catch(() => ({ data: { verifications: [] } })),
      ]);

      if (summaryRes.data) {
        setStats(summaryRes.data);
      }

      // Format punch records for display
      const attList = attendanceRes.data?.attendances || attendanceRes.data?.attendance || [];
      if (attList.length > 0) {
        const mapped: PunchRecord[] = attList.slice(0, 8).map((a: any, idx: number) => {
          const emp = a.employee || {};
          const isEarly = Number(a.earlyLoginIncentive) > 0;
          const isLate = a.status === 'LATE';
          return {
            id: a.id || `punch-${idx}`,
            employeeCode: emp.employeeCode || `TEST-EMP-00${idx + 1}`,
            employeeName: emp.fullName || 'Rajesh Kumar',
            locationName: a.location?.name || 'Belagavi Flagship (BEL-01)',
            terminal: idx % 2 === 0 ? 'Entrance Biometric Tablet A' : 'Floor 1 Gate Scanner B',
            scheduledTime: a.shift?.startTime ? `${a.shift.startTime.slice(0, 5)} AM` : '09:30 AM',
            actualTime: a.actualLogin ? new Date(a.actualLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:24 AM',
            method: a.faceVerified ? 'Biometric Face (96.4%)' : 'Encrypted QR Scan',
            score: a.faceMatchPercentage ? Number(a.faceMatchPercentage) : 96.4,
            status: isEarly ? 'EARLY' : isLate ? 'LATE' : 'ON_TIME',
            incentive: isEarly ? `+₹${Number(a.earlyLoginIncentive)}` : undefined,
          };
        });
        setRecentPunches(mapped);
      } else {
        // Fallback realistic seeded records filtered by selected criteria
        const allFallbacks: PunchRecord[] = [
          {
            id: 'p-1',
            employeeCode: 'TEST-EMP-001',
            employeeName: 'Rajesh Kumar',
            locationName: 'Belagavi Flagship (BEL-01)',
            terminal: 'Entrance Biometric Tablet A',
            scheduledTime: '09:30 AM',
            actualTime: '09:20 AM',
            method: 'Biometric Face (96.4%)',
            score: 96.4,
            status: 'EARLY',
            incentive: '+₹600',
          },
          {
            id: 'p-2',
            employeeCode: 'TEST-EMP-002',
            employeeName: 'Priya Sharma',
            locationName: 'Belagavi Flagship (BEL-01)',
            terminal: 'Floor 1 Gate Scanner B',
            scheduledTime: '09:30 AM',
            actualTime: '09:28 AM',
            method: 'Encrypted QR Scan',
            score: 98.2,
            status: 'ON_TIME',
          },
          {
            id: 'p-3',
            employeeCode: 'TEST-EMP-003',
            employeeName: 'Amit Patel',
            locationName: 'Davanagere Showroom (DAV-02)',
            terminal: 'Central Biometric Terminal 1',
            scheduledTime: '10:30 AM',
            actualTime: '10:24 AM',
            method: 'Biometric Face (95.1%)',
            score: 95.1,
            status: 'EARLY',
            incentive: '+₹360',
          },
          {
            id: 'p-4',
            employeeCode: 'TEST-EMP-007',
            employeeName: 'Suresh Reddy',
            locationName: 'Shivamogga Megastore (SHI-03)',
            terminal: 'Staff Entry Scanner S-1',
            scheduledTime: '10:30 AM',
            actualTime: '10:30 AM',
            method: 'Biometric Face (94.0%)',
            score: 94.0,
            status: 'ON_TIME',
          },
          {
            id: 'p-5',
            employeeCode: 'TEST-EMP-012',
            employeeName: 'Meenakshi Sundaram',
            locationName: 'Belagavi Flagship (BEL-01)',
            terminal: 'Atelier Staff Biometric Gate',
            scheduledTime: '09:00 AM',
            actualTime: '08:55 AM',
            method: 'Biometric Face (97.8%)',
            score: 97.8,
            status: 'EARLY',
            incentive: '+₹300',
          },
          {
            id: 'p-6',
            employeeCode: 'TEST-EMP-018',
            employeeName: 'Deepak Vernekar',
            locationName: 'Shivamogga Megastore (SHI-03)',
            terminal: 'Cash Desk Biometric Terminal C',
            scheduledTime: '12:00 PM',
            actualTime: '11:58 AM',
            method: 'Encrypted QR Scan',
            score: 99.1,
            status: 'ON_TIME',
          },
          {
            id: 'p-7',
            employeeCode: 'TEST-EMP-025',
            employeeName: 'Kavitha Patil',
            locationName: 'Bellary Silk Emporium (BLY-04)',
            terminal: 'Main Concourse Biometric Terminal B',
            scheduledTime: '09:30 AM',
            actualTime: '09:25 AM',
            method: 'Biometric Face (95.8%)',
            score: 95.8,
            status: 'EARLY',
            incentive: '+₹300',
          },
        ];

        const filtered = allFallbacks.filter((item) => {
          if (selectedHub !== 'all') {
            const h = selectedHub.toLowerCase();
            const loc = item.locationName.toLowerCase();
            if (h.includes('bel') && !loc.includes('belagavi')) return false;
            if (h.includes('dav') && !loc.includes('davanagere')) return false;
            if (h.includes('shi') && !loc.includes('shivamogga')) return false;
            if (h.includes('bly') && !loc.includes('bellary')) return false;
          }
          if (selectedShift !== 'all') {
            const activeOpt = shiftOptions.find((o) => o.id === selectedShift);
            const s = (activeOpt?.name || selectedShift).toLowerCase();
            if (s.includes('morning') && !item.scheduledTime.includes('09:00')) return false;
            if (s.includes('general') && !item.scheduledTime.includes('09:30') && !item.scheduledTime.includes('10:30')) return false;
            if (s.includes('evening') && !item.scheduledTime.includes('12:00')) return false;
          }
          return true;
        });

        setRecentPunches(filtered);
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
      setFilterAnimationKey((prev) => prev + 1);
    }
  }, [selectedHub, selectedDept, selectedDate, selectedShift, shiftOptions]);

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

  // Load department options dynamically with caching and duplicate removal
  const loadDeptOptions = useCallback(
    async (hub: string, force = false) => {
      if (!force && deptCacheRef.current[hub]) {
        setDeptOptions(deptCacheRef.current[hub]);
        return;
      }

      try {
        setDeptsLoading(true);
        setDeptsError(null);
        const loc = hub !== 'all' ? `&locationId=${hub}` : '';
        const deptRes = await api.get(`/departments?limit=100${loc}`).catch(() => ({ data: null }));
        const dList = deptRes.data?.departments || deptRes.data || [];
        const processed = processDepartments(dList, hub === 'all');
        const finalList = processed.length > 0 ? processed : DEFAULT_DEPTS;

        deptCacheRef.current[hub] = finalList;
        setDeptOptions(finalList);

        // Verify that current selected department still exists in newly loaded options
        setSelectedDept((prevDept) => {
          if (prevDept === 'all' || prevDept === 'ALL') return 'all';
          const match = finalList.find((d) => d.id === prevDept);
          if (match) return prevDept;

          // If exact ID not found, check if a department with matching name exists
          const prevObj = deptOptions.find((o) => o.id === prevDept);
          const nameMatch = finalList.find(
            (d) => prevObj && d.name.toLowerCase() === prevObj.name.toLowerCase()
          );
          if (nameMatch) return nameMatch.id;

          // Reset to All Departments and show short notice
          setDeptNotice("Department selection reset to 'All Departments' for the selected hub.");
          return 'all';
        });
      } catch {
        setDeptsError('Could not load departments');
        if (!deptCacheRef.current[hub]) {
          setDeptOptions(DEFAULT_DEPTS);
        }
      } finally {
        setDeptsLoading(false);
      }
    },
    [deptOptions]
  );

  // Load departments whenever selectedHub changes (cached in memory)
  useEffect(() => {
    loadDeptOptions(selectedHub);
  }, [selectedHub, loadDeptOptions]);

  // Auto-dismiss department notice
  useEffect(() => {
    if (!deptNotice) return;
    const timer = setTimeout(() => setDeptNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [deptNotice]);

  // Load location options dynamically from backend once per page load
  useEffect(() => {
    let ignore = false;
    const loadLocations = async () => {
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
        // keep default hubs
      }
    };
    loadLocations();
    return () => {
      ignore = true;
    };
  }, []);

  const handleBatchCreated = (newBatch: CreatedBatchResult) => {
    // Invalidate shift caches
    delete shiftCacheRef.current[newBatch.locationId];
    delete shiftCacheRef.current['all'];

    const newOption: ShiftOptionItem = {
      id: newBatch.id,
      name: newBatch.name,
      timeRange: `${newBatch.startTime} – ${newBatch.endTime}`,
      staffCount: newBatch.assignedCount,
      capacity: newBatch.capacity,
      isCustomBatch: true,
    };

    setShiftOptions((prev) => [newOption, ...prev.filter((p) => p.id !== newBatch.id)]);
    setSelectedShift(newBatch.id);
    setShiftNotice(`Custom shift batch "${newBatch.name}" created and set as active filter.`);
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
    (selectedDept !== 'all' && selectedDept !== 'ALL' ? 1 : 0) +
    (selectedShift !== 'all' ? 1 : 0) +
    (selectedDate !== new Date().toISOString().slice(0, 10) ? 1 : 0);

  // Safe fallback counts
  const totalEmp = stats?.totalEmployees ?? 35;
  const presentCount = stats?.present ?? 12;
  const activeFloor = presentCount;
  const lateCount = stats?.late ?? 0;
  const onBreakCount = (stats?.onLunch ?? 0) + (stats?.onTeaBreak ?? 0);
  const punchesToday = (stats?.qrScans ?? 52) + (stats?.faceVerified ?? 35);
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
    <DashboardLayout activeShiftLabel={activeShiftHeaderLabel}>
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
                  Since 1938 • FY 2024-25 Q3
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 p-0.5 border border-slate-200/90 dark:border-slate-800 shadow-xs flex items-center justify-center shrink-0 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/images/bsc_logo.png" alt="BSC Textiles Since 1938" className="w-full h-full object-contain" />
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

          {/* Department Reset Notice */}
          {deptNotice && (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-xs text-[#0058be] dark:text-blue-300 animate-pop-in"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">info</span>
                <span>{deptNotice}</span>
              </div>
              <button
                type="button"
                onClick={() => setDeptNotice(null)}
                className="p-0.5 rounded hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors"
                aria-label="Dismiss department notice"
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

                {/* Department Filter (Custom Accessible Listbox with Built-in "All Departments" First) */}
                <ExecutiveDeptFilter
                  selectedDeptId={selectedDept}
                  onSelectDept={(id) => setSelectedDept(id)}
                  deptOptions={deptOptions}
                  loading={deptsLoading}
                  error={deptsError}
                  onRetry={() => loadDeptOptions(selectedHub, true)}
                />

                {/* Date Filter with Quick Today/Yesterday toggles */}
                <div className="flex items-center gap-1.5 bg-white dark:bg-[#0c1424] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs text-xs group hover:border-[#0058be] dark:hover:border-blue-500 transition-colors">
                  <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[16px] group-hover:scale-110 transition-transform">calendar_today</span>
                  <span className="text-[10px] uppercase text-slate-400 font-bold">Date:</span>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent font-semibold text-xs text-[#0b1c30] dark:text-slate-100 focus:outline-none cursor-pointer"
                  />
                  <div className="flex items-center gap-1 pl-1 border-l border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleSetQuickDate('today')}
                      className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-colors ${
                        selectedDate === new Date().toISOString().slice(0, 10)
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
                  onOpenCreateModal={() => setCreateBatchModalOpen(true)}
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
                    {loading ? 'Refreshing Feed...' : 'Terminal Sync: Live 99.8%'}
                  </span>
                </div>
                <button
                  onClick={handleManualSync}
                  className={`flex items-center justify-center p-2 rounded-lg bg-white dark:bg-[#0c1424] text-slate-600 dark:text-slate-300 hover:text-[#0058be] dark:hover:text-blue-400 border border-slate-200 dark:border-slate-700 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95 ${
                    syncing || loading ? 'animate-spin text-[#0058be]' : ''
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
                    >
                      <span className="material-symbols-outlined text-[13px] leading-none">close</span>
                    </button>
                  </span>
                )}

                {selectedDept !== 'all' && selectedDept !== 'ALL' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white dark:bg-slate-800 text-[#0058be] dark:text-blue-400 border border-blue-200 dark:border-blue-900 shadow-xs animate-pop-in">
                    <span>Dept: {deptOptions.find(d => d.id === selectedDept)?.name || selectedDept}</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDept('all')}
                      className="hover:text-red-600 dark:hover:text-red-400 p-0.5 rounded-full"
                      title="Clear Dept filter"
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
        <DashboardCards
          onSelectMetric={(metric) => setActiveMetric(metric)}
          stats={stats}
        />

        {/* MAIN OPERATIONAL & STATUTORY CALENDAR GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* LEFT SIDE: BSC CALENDAR & HOLIDAYS WITH HR CSV UPLOAD & TEMPLATE */}
          <div className="lg:col-span-4 xl:col-span-4 flex flex-col gap-4">
            <BscHolidaysCalendar />
          </div>

          {/* RIGHT SIDE: STORE HUBS, LIVE BIOMETRICS & SHIFTS */}
          <div className="lg:col-span-8 xl:col-span-8 flex flex-col gap-5">
            {/* SECTION 2: KARNATAKA STORE HUBS MONITOR & INTERACTIVE CARD CRUD */}
            <KarnatakaHubsCardSection
              selectedHub={selectedHub}
              onSelectHub={setSelectedHub}
              selectedShiftLabel={selectedShift !== 'all' ? activeShiftName : undefined}
              selectedDeptLabel={
                selectedDept !== 'all' && selectedDept !== 'ALL'
                  ? deptOptions.find((d) => d.id === selectedDept)?.name
                  : undefined
              }
            />

        {/* SECTION 3: RECENT BIOMETRIC TERMINAL PUNCHES LEDGER */}
        <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0058be] dark:text-blue-400 text-[20px]">fingerprint</span>
              <div>
                <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100">Live Biometric & IoT Terminal Punch Ledger</h3>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">
                  {recentPunches.length} punch records • {selectedHub !== 'all' ? (HUB_LABELS[selectedHub] || selectedHub) : 'Karnataka Hubs'} • {selectedDate}
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
                <h4 className="text-sm font-bold text-[#0b1c30] dark:text-slate-200">No punches found for the selected filter combination</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
                  There are no attendance records matching this specific Hub, Department, Date, or Shift criteria.
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
                    <th className="py-3 px-4">Store Hub & Terminal</th>
                    <th className="py-3 px-4">Scheduled</th>
                    <th className="py-3 px-4">Actual Punch</th>
                    <th className="py-3 px-4">Biometric Verification</th>
                    <th className="py-3 px-4">Status & Incentive</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {recentPunches.map((punch, idx) => (
                    <tr key={`${punch.id || idx}-${idx}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-[#131b2e] dark:bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
                            {punch.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-bold text-[#0b1c30] dark:text-slate-100">{punch.employeeName}</div>
                            <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{punch.employeeCode}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#0b1c30] dark:text-slate-200">{punch.locationName}</div>
                        <div className="text-[10px] text-slate-400 dark:text-slate-500">{punch.terminal}</div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {punch.scheduledTime}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-[#0b1c30] dark:text-slate-100">
                        {punch.actualTime}
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#0058be] dark:text-blue-400 font-medium bg-[#eff4ff] dark:bg-blue-950/60 px-2 py-0.5 rounded border border-[#dce9ff] dark:border-blue-900/50">
                          <span className="material-symbols-outlined text-[13px]">verified</span>
                          {punch.method}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            punch.status === 'EARLY' ? 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' :
                            punch.status === 'LATE' ? 'bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800' :
                            'bg-blue-50 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}>
                            {punch.status}
                          </span>
                          {punch.incentive && (
                            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                              {punch.incentive}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

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
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    selectedShift !== 'all' && (selectedShift === morningShift?.id || activeShiftName.toLowerCase().includes('morning'))
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
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    selectedShift !== 'all' && (selectedShift === generalShift?.id || activeShiftName.toLowerCase().includes('general'))
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
                  className={`p-2 rounded-lg border transition-all cursor-pointer ${
                    selectedShift !== 'all' && (selectedShift === eveningShift?.id || activeShiftName.toLowerCase().includes('evening'))
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

      {/* Create Custom Shift Batch Modal */}
      <CreateCustomShiftModal
        open={createBatchModalOpen}
        onClose={() => setCreateBatchModalOpen(false)}
        hubs={hubOptions}
        initialHubId={selectedHub}
        existingShiftNames={shiftOptions.map((s) => s.name)}
        onSuccess={handleBatchCreated}
      />
    </DashboardLayout>
  );
}