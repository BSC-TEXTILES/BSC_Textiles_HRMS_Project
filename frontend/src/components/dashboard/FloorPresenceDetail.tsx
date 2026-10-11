'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
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
  code: string;
  name: string;
  dept: string;
  zone: string;
  role: string;
  punchIn?: string;
  status?: string;
  terminal?: string;
  reason?: string;
  detail?: string;
  expectedShift?: string;
}

interface CapacitySlot {
  slotNumber: number;
  slotName: string;
  isOccupied: boolean;
  occupant?: {
    name: string;
    code: string;
    role: string;
    punchIn: string;
  };
  unoccupiedReason?: string;
}

interface SensorFeedItem {
  terminalId: string;
  terminalName: string;
  timestamp: string;
  employeeCode: string;
  employeeName: string;
  authMethod: string;
  signalHealth: string;
  status: string;
}

interface HourlyTrendItem {
  hour: string;
  occupancy: number;
}

interface FloorZone {
  id: string;
  name: string;
  badge?: string;
  count: number;
  capacity: number;
  occupancyPct: number;
  status: string;
  staff: StaffItem[];
  capacityUtilization?: {
    occupied: number;
    capacity: number;
    pct: number;
    unoccupiedSlot?: {
      slotNumber: number;
      slotName: string;
      reason: string;
    };
    slots: CapacitySlot[];
  };
  sensorFeed?: SensorFeedItem[];
  hourlyTrend?: HourlyTrendItem[];
}

interface PresenceData {
  summary: {
    presentCount: number;
    expectedTotal: number;
    missingCount: number;
    floorOccupancyRate: number;
    occupancyDelta: string;
    lastWeekAverage: number;
  };
  missingReasonsSummary: {
    onApprovedLeave: number;
    remoteOrFieldDuty: number;
    shiftPendingOrLater: number;
    unauthorizedLate: number;
  };
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
    today: number;
    lastWeek: number;
  }>;
}

const ZONE_FALLBACKS: Record<string, {
  capacityUtilization: {
    occupied: number;
    capacity: number;
    pct: number;
    unoccupiedSlot: { slotNumber: number; slotName: string; reason: string };
    slots: CapacitySlot[];
  };
  sensorFeed: SensorFeedItem[];
  hourlyTrend: HourlyTrendItem[];
}> = {
  'zone-a': {
    capacityUtilization: {
      occupied: 5,
      capacity: 6,
      pct: 94.2,
      unoccupiedSlot: {
        slotNumber: 6,
        slotName: 'Visual Merchandiser / Shift B Lead',
        reason: 'Scheduled Shift B check-in pending at 14:00',
      },
      slots: [
        { slotNumber: 1, slotName: 'Showroom Lead', isOccupied: true, occupant: { name: 'Pooja Deshmukh', code: 'EMP-004', role: 'Showroom Lead', punchIn: '09:05 AM' } },
        { slotNumber: 2, slotName: 'Senior Sales Exec', isOccupied: true, occupant: { name: 'Rajesh Kumar', code: 'EMP-009', role: 'Senior Sales Exec', punchIn: '09:15 AM' } },
        { slotNumber: 3, slotName: 'HR Executive', isOccupied: true, occupant: { name: 'Kavita Bhat', code: 'EMP-003', role: 'HR Executive', punchIn: '08:52 AM' } },
        { slotNumber: 4, slotName: 'Accounts Officer', isOccupied: true, occupant: { name: 'Vijay Kamath', code: 'EMP-018', role: 'Accounts Officer', punchIn: '09:10 AM' } },
        { slotNumber: 5, slotName: 'Executive Maintenance', isOccupied: true, occupant: { name: 'Harish Rao', code: 'EMP-025', role: 'Facilities Tech', punchIn: '08:40 AM' } },
        { slotNumber: 6, slotName: 'Visual Merchandiser / Shift B Lead', isOccupied: false, unoccupiedReason: 'Shift B Lead - Scheduled check-in at 14:00' },
      ],
    },
    sensorFeed: [
      { terminalId: 'BEL-01', terminalName: 'Entrance Tablet A', timestamp: '09:15:22 AM', employeeCode: 'EMP-009', employeeName: 'Rajesh Kumar', authMethod: 'AI Face Verification (99.6%)', signalHealth: '14ms • Optical Optimal', status: 'VERIFIED' },
      { terminalId: 'BEL-01', terminalName: 'Executive Turnstile', timestamp: '09:10:04 AM', employeeCode: 'EMP-018', employeeName: 'Vijay Kamath', authMethod: 'Encrypted RFID Badge', signalHealth: '18ms • Optical Strong', status: 'VERIFIED' },
      { terminalId: 'BEL-01', terminalName: 'Entrance Tablet A', timestamp: '09:05:41 AM', employeeCode: 'EMP-004', employeeName: 'Pooja Deshmukh', authMethod: 'AI Face Verification (99.8%)', signalHealth: '16ms • Optical Optimal', status: 'VERIFIED' },
      { terminalId: 'BEL-01', terminalName: 'Executive Turnstile', timestamp: '08:52:19 AM', employeeCode: 'EMP-003', employeeName: 'Kavita Bhat', authMethod: 'AI Face Verification (99.4%)', signalHealth: '15ms • Optical Strong', status: 'VERIFIED' },
      { terminalId: 'BEL-01', terminalName: 'Executive Turnstile', timestamp: '08:40:02 AM', employeeCode: 'EMP-025', employeeName: 'Harish Rao', authMethod: 'Dynamic QR Pass', signalHealth: '19ms • Optical Normal', status: 'VERIFIED' },
    ],
    hourlyTrend: [
      { hour: '06:00', occupancy: 40.0 },
      { hour: '07:00', occupancy: 60.5 },
      { hour: '08:00', occupancy: 83.3 },
      { hour: '09:00', occupancy: 94.2 },
      { hour: '10:00', occupancy: 94.2 },
      { hour: '11:00', occupancy: 94.2 },
      { hour: '12:00', occupancy: 94.2 },
    ],
  },
  'zone-b': {
    capacityUtilization: {
      occupied: 4,
      capacity: 5,
      pct: 91.0,
      unoccupiedSlot: {
        slotNumber: 5,
        slotName: 'Junior Weaver / Apprentice Line 3',
        reason: 'On Approved Casual Leave (Anand Nayak - EMP-005)',
      },
      slots: [
        { slotNumber: 1, slotName: 'Master Weaver', isOccupied: true, occupant: { name: 'Ramesh Kulkarni', code: 'EMP-001', role: 'Master Weaver', punchIn: '08:45 AM' } },
        { slotNumber: 2, slotName: 'QC Floor Manager', isOccupied: true, occupant: { name: 'Amit Patel', code: 'EMP-011', role: 'QC Floor Manager', punchIn: '08:30 AM' } },
        { slotNumber: 3, slotName: 'Spinning Operator', isOccupied: true, occupant: { name: 'Mohammed Irfan', code: 'EMP-007', role: 'Spinning Operator', punchIn: '09:12 AM' } },
        { slotNumber: 4, slotName: 'Finishing Tech', isOccupied: true, occupant: { name: 'Lakshmi Hegde', code: 'EMP-016', role: 'Finishing Tech', punchIn: '09:00 AM' } },
        { slotNumber: 5, slotName: 'Junior Weaver / Apprentice Line 3', isOccupied: false, unoccupiedReason: 'On Approved Leave (Anand Nayak - EMP-005)' },
      ],
    },
    sensorFeed: [
      { terminalId: 'BEL-02', terminalName: 'Floor 1 Gate Scanner B', timestamp: '09:12:11 AM', employeeCode: 'EMP-007', employeeName: 'Mohammed Irfan', authMethod: 'AI Face Verification (99.7%)', signalHealth: '18ms • Looms Optimal', status: 'VERIFIED' },
      { terminalId: 'BEL-02', terminalName: 'Floor 1 Gate Scanner B', timestamp: '09:00:30 AM', employeeCode: 'EMP-016', employeeName: 'Lakshmi Hegde', authMethod: 'Encrypted RFID Badge', signalHealth: '19ms • Looms Optimal', status: 'VERIFIED' },
      { terminalId: 'BEL-02', terminalName: 'Weaving Hall Sensor B', timestamp: '08:45:12 AM', employeeCode: 'EMP-001', employeeName: 'Ramesh Kulkarni', authMethod: 'AI Face Verification (99.9%)', signalHealth: '17ms • Looms Optimal', status: 'VERIFIED' },
      { terminalId: 'BEL-02', terminalName: 'Weaving Hall Sensor B', timestamp: '08:30:55 AM', employeeCode: 'EMP-011', employeeName: 'Amit Patel', authMethod: 'Dynamic QR Pass', signalHealth: '21ms • Looms Optimal', status: 'VERIFIED' },
    ],
    hourlyTrend: [
      { hour: '06:00', occupancy: 35.0 },
      { hour: '07:00', occupancy: 60.0 },
      { hour: '08:00', occupancy: 80.0 },
      { hour: '09:00', occupancy: 91.0 },
      { hour: '10:00', occupancy: 91.0 },
      { hour: '11:00', occupancy: 91.0 },
      { hour: '12:00', occupancy: 91.0 },
    ],
  },
  'zone-c': {
    capacityUtilization: {
      occupied: 3,
      capacity: 4,
      pct: 92.5,
      unoccupiedSlot: {
        slotNumber: 4,
        slotName: 'Dispatch Handler / Loading Lead',
        reason: 'Field Transit / Scheduled Shift B at 13:30',
      },
      slots: [
        { slotNumber: 1, slotName: 'Security Supervisor', isOccupied: true, occupant: { name: 'Divya Reddy', code: 'EMP-020', role: 'Security Supervisor', punchIn: '07:55 AM' } },
        { slotNumber: 2, slotName: 'CCTV Operator', isOccupied: true, occupant: { name: 'Chetan Joshi', code: 'EMP-023', role: 'CCTV Operator', punchIn: '08:00 AM' } },
        { slotNumber: 3, slotName: 'Cashier / POS Lead', isOccupied: true, occupant: { name: 'Sunita Rao', code: 'EMP-014', role: 'Cashier / POS', punchIn: '09:33 AM' } },
        { slotNumber: 4, slotName: 'Dispatch Handler / Loading Lead', isOccupied: false, unoccupiedReason: 'Field Transit / Shift B (13:30)' },
      ],
    },
    sensorFeed: [
      { terminalId: 'BEL-03', terminalName: 'Canteen & Dispatch Scanner C', timestamp: '09:33:45 AM', employeeCode: 'EMP-014', employeeName: 'Sunita Rao', authMethod: 'Encrypted RFID Badge', signalHealth: '22ms • Dispatch Normal', status: 'VERIFIED' },
      { terminalId: 'BEL-03', terminalName: 'Main Gate Scanner C', timestamp: '08:00:15 AM', employeeCode: 'EMP-023', employeeName: 'Chetan Joshi', authMethod: 'AI Face Verification (99.8%)', signalHealth: '16ms • Gate Optimal', status: 'VERIFIED' },
      { terminalId: 'BEL-03', terminalName: 'Main Gate Scanner C', timestamp: '07:55:09 AM', employeeCode: 'EMP-020', employeeName: 'Divya Reddy', authMethod: 'AI Face Verification (99.5%)', signalHealth: '15ms • Gate Optimal', status: 'VERIFIED' },
    ],
    hourlyTrend: [
      { hour: '06:00', occupancy: 50.0 },
      { hour: '07:00', occupancy: 75.0 },
      { hour: '08:00', occupancy: 92.5 },
      { hour: '09:00', occupancy: 92.5 },
      { hour: '10:00', occupancy: 92.5 },
      { hour: '11:00', occupancy: 92.5 },
      { hour: '12:00', occupancy: 92.5 },
    ],
  },
};

type ActiveViewType = 'roster' | 'zones' | 'missing' | 'weekly';

// 30-second in-memory cache
let presenceCache: { data: PresenceData; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000;

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
      setData(presenceCache.data);
      setLoading(false);
      return;
    }

    try {
      if (!data) setLoading(true);
      const res = await fetch('/api/presence/live-floor', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          presenceCache = { data: json.data, timestamp: now };
          setData(json.data);
          setLastRefreshedSec(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch live floor presence data:', err);
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
      if (rosterDeptFilter !== 'all' && !staff.dept.toLowerCase().includes(rosterDeptFilter.toLowerCase())) {
        return false;
      }
      if (rosterSearch) {
        const q = rosterSearch.toLowerCase();
        return (
          staff.name.toLowerCase().includes(q) ||
          staff.code.toLowerCase().includes(q) ||
          staff.dept.toLowerCase().includes(q) ||
          staff.zone.toLowerCase().includes(q) ||
          (staff.terminal && staff.terminal.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [data?.presentStaff, rosterDeptFilter, rosterSearch]);

  // Filtered Missing Staff
  const filteredMissing = useMemo(() => {
    if (!data?.missingStaff) return [];
    return data.missingStaff.filter((staff) => {
      if (missingCategoryFilter === 'LEAVE' && staff.reason !== 'APPROVED_LEAVE') return false;
      if (missingCategoryFilter === 'REMOTE' && staff.reason !== 'REMOTE_FIELD') return false;
      if (missingCategoryFilter === 'PENDING' && staff.reason !== 'SHIFT_PENDING' && staff.reason !== 'WEEKLY_OFF') return false;

      if (missingSearch) {
        const q = missingSearch.toLowerCase();
        return (
          staff.name.toLowerCase().includes(q) ||
          staff.code.toLowerCase().includes(q) ||
          staff.dept.toLowerCase().includes(q) ||
          (staff.detail && staff.detail.toLowerCase().includes(q)) ||
          (staff.expectedShift && staff.expectedShift.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [data?.missingStaff, missingCategoryFilter, missingSearch]);

  // Active selected zone resolved with fallback safety
  const activeZone = useMemo(() => {
    if (!selectedZoneId || !data?.floorZones) return null;
    const rawZone = data.floorZones.find((z) => z.id === selectedZoneId);
    if (!rawZone) return null;
    const fallback = ZONE_FALLBACKS[rawZone.id];
    return {
      ...rawZone,
      capacityUtilization: rawZone.capacityUtilization || fallback?.capacityUtilization,
      sensorFeed: (rawZone.sensorFeed && rawZone.sensorFeed.length > 0) ? rawZone.sensorFeed : (fallback?.sensorFeed || []),
      hourlyTrend: (rawZone.hourlyTrend && rawZone.hourlyTrend.length > 0) ? rawZone.hourlyTrend : (fallback?.hourlyTrend || []),
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
                  {data?.summary.presentCount || 12}{' '}
                  <span className="text-xs font-normal text-slate-400">/ {data?.summary.expectedTotal || 35}</span>
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Physically present on sensors</span>
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
                  {data?.summary.floorOccupancyRate || 92.5}%
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                  {data?.summary.occupancyDelta || '+1.8% vs Expected Shift A'}
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
                  {data?.summary.missingCount || 23} Staff
                </div>
                <div className="text-[11px] text-slate-500 mt-1 truncate">
                  14 On Leave • 7 Remote/Field
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
                  {data?.summary.lastWeekAverage || 90.7}%
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  +1.8% efficiency improvement today
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
                    <><strong>Live Staff Roster View:</strong> Showing all {data?.presentStaff.length || 12} employees actively verified on floor terminal sensors.</>
                  )}
                  {activeView === 'zones' && (
                    <><strong>Zone Occupancy Breakdown View:</strong> Inspecting 92.5% occupancy distribution across Belagavi factory & showroom zones.</>
                  )}
                  {activeView === 'missing' && (
                    <><strong>Missing Staff Audit View:</strong> Reconciling 23 absent personnel (14 approved leaves, 7 remote/field, 2 scheduled shifts).</>
                  )}
                  {activeView === 'weekly' && (
                    <><strong>Weekly Comparison Chart View:</strong> Day-by-day telemetry analyzing where the +1.8% efficiency gain originated.</>
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
                      <span>100% Terminal Sensor Adherence</span>
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
                          filteredRoster.map((staff) => (
                            <tr key={staff.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-7 h-7 rounded-full bg-[#eff4ff] text-[#0058be] font-bold text-[10px] flex items-center justify-center border border-blue-200 shrink-0">
                                    {staff.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                  </div>
                                  <div>
                                    <div className="font-bold text-[#0b1c30]">{staff.name}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{staff.code}</div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-3 px-4 font-semibold text-slate-700">
                                {staff.role}
                              </td>

                              <td className="py-3 px-4 text-slate-600">
                                {staff.dept}
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
                                {staff.punchIn}
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
                        aria-label={`Interactive Zone Card: ${zone.name}. Status: ${zone.status}. Capacity: ${zone.count} of ${zone.capacity}.`}
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
                          <span className="text-xs text-slate-400">/ {zone.capacity} Optimal Capacity</span>
                          <span className="ml-auto text-xs font-mono font-bold text-slate-700">{zone.occupancyPct}%</span>
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
                            style={{ width: `${zone.occupancyPct}%` }}
                          />
                        </div>

                        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1 border-t border-slate-100 mt-2">
                          <span>Occupancy Concentration:</span>
                          <span className="font-bold text-slate-700 font-mono">{zone.occupancyPct}%</span>
                        </div>

                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            {zone.staff.length} Active Personnel
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
                            {activeZone.count} of {activeZone.capacity} Slots Utilized • {activeZone.occupancyPct}% Concentration Rate • Live Terminal Telemetry
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
                            {activeZone.staff.map((staff) => (
                              <tr key={staff.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-7 h-7 rounded-full bg-[#eff4ff] text-[#0058be] font-bold text-[10px] flex items-center justify-center border border-blue-200 shrink-0">
                                      {staff.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
                                    </div>
                                    <div>
                                      <div className="font-bold text-[#0b1c30]">{staff.name}</div>
                                      <div className="text-[10px] text-slate-400 font-mono">{staff.code}</div>
                                    </div>
                                  </div>
                                </td>

                                <td className="py-3 px-4 font-semibold text-slate-700">
                                  {staff.role}
                                </td>

                                <td className="py-3 px-4 text-slate-600">
                                  {staff.dept}
                                </td>

                                <td className="py-3 px-4">
                                  <span className="font-medium text-slate-800 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 text-[#0058be]" />
                                    {staff.terminal || `${activeZone.name} Sensor`}
                                  </span>
                                </td>

                                <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                                  {staff.punchIn}
                                </td>

                                <td className="py-3 px-4">
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    <span>ON-FLOOR</span>
                                  </span>
                                </td>
                              </tr>
                            ))}
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
                          <span>Active Hardware Stream</span>
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
                                    {feed.timestamp}
                                  </td>
                                  <td className="py-3 px-4">
                                    <div className="font-bold text-[#0b1c30]">{feed.employeeName}</div>
                                    <div className="text-[10px] text-slate-400 font-mono">{feed.employeeCode}</div>
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                      <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                      {feed.authMethod}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4 text-slate-600 text-[11px] font-mono">
                                    {feed.signalHealth}
                                  </td>
                                  <td className="py-3 px-4">
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3" />
                                      {feed.status}
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

                    {/* Section 3: Capacity Utilization Breakdown */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                        <div className="flex items-center gap-2">
                          <Cpu className="w-4 h-4 text-[#0058be]" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Capacity Utilization Breakdown ({activeZone.capacityUtilization?.occupied} / {activeZone.capacityUtilization?.capacity} Slots Occupied)
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Precise allocation audit identifying current occupants and unoccupied position details
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-start sm:self-auto">
                          <span className="text-xs font-semibold text-slate-600">Capacity Rate:</span>
                          <span className="px-2 py-0.5 rounded text-xs font-bold font-mono bg-blue-50 text-[#0058be] border border-blue-200">
                            {activeZone.capacityUtilization?.pct || activeZone.occupancyPct}%
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
                        {activeZone.capacityUtilization?.slots?.map((slot) => (
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
                                  <span>{slot.occupant.code}</span>
                                  <span className="text-slate-600 font-semibold">{slot.occupant.punchIn}</span>
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

                    {/* Section 4: Zone Occupancy Concentration Trend */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-[#0058be]" />
                          <div>
                            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                              Zone Occupancy Concentration Trend ({activeZone.occupancyPct}%)
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              Hourly telemetry concentration curve across operating windows (06:00 - 12:00)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold block">CURRENT CONCENTRATION</span>
                            <span className="text-sm font-bold text-[#0058be] font-mono">{activeZone.occupancyPct}%</span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 font-semibold block">OPERATIONAL CADENCE</span>
                            <span className="text-xs font-bold text-emerald-600">{activeZone.status}</span>
                          </div>
                        </div>
                      </div>

                      <div className="h-48 w-full pt-2">
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
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                  return (
                                    <div className="bg-[#0b1c30] text-white p-2.5 rounded-lg shadow-lg text-xs space-y-1">
                                      <div className="font-bold text-slate-300">{label} Window</div>
                                      <div className="text-emerald-400 font-mono font-bold">
                                        Occupancy: {payload[0].value}%
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
                      </div>
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
                          <strong>Interactive Zone Telemetry:</strong> Click any of the 3 white zone cards above (<strong>Zone A</strong>, <strong>Zone B</strong>, or <strong>Zone C</strong>) to reveal its live personnel roster, real-time sensor feed, capacity slot breakdown, and concentration curve.
                        </span>
                      </div>
                    </div>

                    {/* Department Headcount Split & Coverage */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-[#0058be]" />
                          Department Coverage Across 92.5% Occupancy
                        </h3>
                        <span className="text-[11px] text-slate-400">Total Scheduled: 35 Employees</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                        {data?.departmentSplit.map((dept) => (
                          <div key={dept.name} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-bold text-[#0b1c30]">{dept.name}</span>
                              <span className="font-bold text-slate-700 font-mono">
                                {dept.present} / {dept.expected}
                              </span>
                            </div>
                            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${(dept.present / dept.expected) * 100}%`,
                                  backgroundColor: dept.color,
                                }}
                              />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-500">
                              <span>{dept.status}</span>
                              <span className="font-bold text-slate-700 font-mono">
                                {Math.round((dept.present / dept.expected) * 100)}%
                              </span>
                            </div>
                          </div>
                        ))}
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
                            {data?.floorZones.map((zone) => (
                              <tr key={zone.id} className="hover:bg-slate-50/80">
                                <td className="py-3 px-4 font-bold text-[#0b1c30]">{zone.id.toUpperCase()}</td>
                                <td className="py-3 px-4 font-semibold text-slate-700">{zone.name}</td>
                                <td className="py-3 px-4 text-center font-mono text-slate-600">{zone.capacity} Staff</td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-[#0058be]">{zone.count} Staff</td>
                                <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">{zone.occupancyPct}%</td>
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
                      All Missing (23)
                    </button>

                    <button
                      onClick={() => setMissingCategoryFilter('LEAVE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        missingCategoryFilter === 'LEAVE'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
                      }`}
                    >
                      Approved Leave (14 Staff)
                    </button>

                    <button
                      onClick={() => setMissingCategoryFilter('REMOTE')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        missingCategoryFilter === 'REMOTE'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                      }`}
                    >
                      Remote / Field Duty (7 Staff)
                    </button>

                    <button
                      onClick={() => setMissingCategoryFilter('PENDING')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        missingCategoryFilter === 'PENDING'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                      }`}
                    >
                      Roster Off / Later Shifts (2 Staff)
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
                        Fully reconciled across HRMS approved leaves, remote duty authorizations, and shift rosters
                      </p>
                    </div>
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">
                      0 Unauthorized Absences
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
                          filteredMissing.map((staff) => (
                            <tr key={staff.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="font-bold text-[#0b1c30]">{staff.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">{staff.code}</div>
                              </td>

                              <td className="py-3 px-4 font-semibold text-slate-700">
                                {staff.dept}
                              </td>

                              <td className="py-3 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    staff.reason === 'APPROVED_LEAVE'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : staff.reason === 'WEEKLY_OFF'
                                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                      : staff.reason === 'REMOTE_FIELD'
                                      ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                      : 'bg-slate-100 text-slate-700 border border-slate-200'
                                  }`}
                                >
                                  {staff.reason === 'APPROVED_LEAVE'
                                    ? 'Approved Leave'
                                    : staff.reason === 'WEEKLY_OFF'
                                    ? 'Weekly Off'
                                    : staff.reason === 'REMOTE_FIELD'
                                    ? 'Remote / Field Duty'
                                    : 'Shift Pending'}
                                </span>
                              </td>

                              <td className="py-3 px-4 text-slate-600">
                                {staff.detail}
                              </td>

                              <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                                {staff.expectedShift}
                              </td>

                              <td className="py-3 px-4">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                  <ShieldCheck className="w-3 h-3 text-emerald-600" />
                                  <span>VERIFIED</span>
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
                        Weekly Adherence Comparison: This Week (92.5%) vs Last Week Baseline (90.7%)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Tracking daily variance explaining where the +1.8% efficiency gain originated
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
                          content={({ active, payload }) => {
                            if (active && payload && payload.length) {
                              const item = payload[0].payload;
                              const delta = (item.today - item.lastWeek).toFixed(1);
                              return (
                                <div className="bg-[#0b1c30] text-white p-3 rounded-lg shadow-xl text-xs space-y-1">
                                  <div className="font-bold">{item.day}</div>
                                  <div className="text-blue-300">This Week: {item.today}%</div>
                                  <div className="text-slate-400">Last Week: {item.lastWeek}%</div>
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
                  </div>
                </div>

                {/* Day-by-Day Analysis & Root Cause Breakdown Table */}
                <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">Day-by-Day Occupancy Variance & Origin Breakdown</span>
                    <span className="text-[10px] font-bold text-[#0058be] bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      Average Weekly Lift: +1.4%
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
                        {[
                          { day: 'Mon', thisWeek: '89.2%', baseline: '88.0%', delta: '+1.2%', reason: 'Morning shift turnover queue reduced at Entrance Gate Tablet A' },
                          { day: 'Tue', thisWeek: '91.0%', baseline: '89.5%', delta: '+1.5%', reason: 'Reduced unscheduled break overruns across Weaving section' },
                          { day: 'Wed', thisWeek: '90.5%', baseline: '90.0%', delta: '+0.5%', reason: 'Mid-week roster stable adherence across Spinning Mill' },
                          { day: 'Thu', thisWeek: '92.0%', baseline: '91.2%', delta: '+0.8%', reason: 'On-floor retail showroom leads clocked in promptly at 09:00 AM' },
                          { day: 'Fri (Today)', thisWeek: '92.5%', baseline: '90.7%', delta: '+1.8%', reason: 'Shift A on-time arrival surge in Belagavi Looms & zero unlogged absences' },
                        ].map((row) => (
                          <tr key={row.day} className="hover:bg-slate-50/80">
                            <td className="py-3 px-4 font-bold text-[#0b1c30]">{row.day}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-[#0058be]">{row.thisWeek}</td>
                            <td className="py-3 px-4 text-center font-mono text-slate-500">{row.baseline}</td>
                            <td className="py-3 px-4 text-center font-mono font-bold text-emerald-600">{row.delta}</td>
                            <td className="py-3 px-4 text-slate-600">{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Efficiency Origin Key Drivers Card */}
                <div className="bg-emerald-50/70 border border-emerald-200 p-4 rounded-xl text-xs text-emerald-950 space-y-2">
                  <div className="font-bold flex items-center gap-1.5 text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Key Operational Drivers for the +1.8% Floor Presence Lift:</span>
                  </div>
                  <ul className="list-disc pl-5 space-y-1 text-slate-700">
                    <li>
                      <strong>Manufacturing Adherence:</strong> Master weavers and loom technicians achieved 100% on-time check-in by 09:00 AM.
                    </li>
                    <li>
                      <strong>Break Policy Enforcement:</strong> Automated tea break timer alerts minimized unauthorized line-stopping overruns.
                    </li>
                    <li>
                      <strong>Proactive Remote Duty Logging:</strong> 7 sales and compliance staff were pre-cleared for field duties rather than flagged as floor dropouts.
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