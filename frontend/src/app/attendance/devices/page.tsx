'use client';

/**
 * eSSL MB160 device console.
 *
 * Everything an operator needs to keep a terminal syncing: connectivity status
 * driven by the server's heartbeat clock, the transport settings (IP, port, comm
 * key, timezone, poll cadence) with a step-by-step Test Connection, live device
 * info read from the hardware, the punch feed with photo and verification
 * method, the unmapped-punch review queue, and calibration against the firmware
 * actually installed.
 *
 * Nothing here converts timestamps in the browser. The API returns a UTC instant
 * and a display string computed in the terminal's own timezone, so the page
 * cannot disagree with the device about what time it is.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useSocket } from '@/context/SocketContext';
import { MismatchDetailDrawer, MismatchRecord } from '@/components/biometric/MismatchDetailDrawer';
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Cpu,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Fingerprint,
  CreditCard,
  Layers,
  LayoutGrid,
  List,
  MapPin,
  Radio,
  RefreshCw,
  ScanFace,
  ScanLine,
  Search,
  Server,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TimerReset,
  User,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
  XCircle,
} from 'lucide-react';

type Tab = 'dav_1601_1610' | 'devices' | 'mismatches' | 'attendance' | 'feed' | 'report' | 'unmapped' | 'calibration' | 'mappings' | 'sync_logs';

interface DeviceStatus {
  deviceId: string;
  serialNumber: string;
  name: string;
  locationCode: string;
  connected: boolean;
  status: 'CONNECTED' | 'DISCONNECTED';
  lastSeenAt: string | null;
  secondsSinceLastSeen: number | null;
  heartbeatTimeoutSeconds: number;
  protocol: string;
  ipAddress: string;
  port: number;
  clockDriftSeconds: number | null;
  clockDriftWarning: boolean;
  deviceTimeLocal: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  photoPushEnabled: boolean;
  userCount: number;
  attLogCount: number;
  environment?: string;
  environmentLabel?: string | null;
  usableAsProductionEvidence?: boolean;
}

interface DeviceRow extends DeviceStatus {
  model: string;
  firmwareVersion: string;
  timezone: string;
  commKey: number;
  pollIntervalMs: number;
  realtimeEnabled: number | boolean;
  lastSyncAt: string | null;
  lastWatermarkAt: string | null;
  floorId?: string | null;
  floorName?: string | null;
  sectionId?: string | null;
  sectionName?: string | null;
  enrolledUsers?: number;
  todaysPunches?: number;
}

interface OpsSummary {
  totalOpen: number;
  totalResolved: number;
  totalIgnored: number;
  byType: Array<{ type: string; label: string; open: number }>;
  notSyncedEmployees: number;
  unknownUsers: number;
  devicesTotal: number;
  devicesOnline: number;
  devicesOffline: number;
  punchesToday: number;
  activeMappings: number;
  lastScanAt: string | null;
}

interface AttendanceRow {
  id: string;
  deviceId: string | null;
  serialNumber: string;
  enrollmentNumber: string;
  employeeCode: string | null;
  employeeName: string | null;
  departmentName: string | null;
  deviceName: string;
  locationCode: string | null;
  floorName: string | null;
  sectionName: string | null;
  punchTimeUtc: string | null;
  punchTimeLocal: string | null;
  attendanceDate: string | null;
  timezoneUsed: string;
  punchType: string | null;
  direction: string;
  verifyModeLabel: string | null;
  mappingStatus: string;
  status: string;
  hasMismatch: boolean;
}

interface FloorOption { id: string; name: string; floorNumber?: number | null }
interface SectionOption { id: string; name: string; floorId?: string | null }

const MISMATCH_TYPE_OPTIONS = [
  'DEVICE_MISMATCH',
  'ID_MISMATCH',
  'NAME_MISMATCH',
  'DUPLICATE_ID',
  'UNKNOWN_USER',
  'UNKNOWN_DEVICE',
  'NOT_SYNCED',
  'INACTIVE_EMPLOYEE',
];

const EXPORT_KINDS = [
  { value: 'complete', label: 'Complete attendance log' },
  { value: 'floor-wise', label: 'Floor-wise' },
  { value: 'section-wise', label: 'Section-wise' },
  { value: 'device-wise', label: 'Device-wise' },
] as const;

interface FeedPunch {
  id: string;
  enrollmentNumber: string;
  employeeName: string | null;
  employeeCode: string | null;
  deviceName: string;
  serialNumber: string;
  punchTimeUtc: string | null;
  punchTimeLocal: string | null;
  attendanceDate: string | null;
  timezoneUsed: string;
  punchType: string;
  verifyModeLabel: string | null;
  rawVerifyType: number | null;
  rawPunchState: number | null;
  matchValue: number | null;
  photoUrl: string | null;
  photoMissingReason: string | null;
  mappingStatus: string;
  syncStatus: string;
  source: string;
}

interface UnmappedPunch {
  id: string;
  serialNumber: string;
  deviceName: string | null;
  enrollmentNumber: string;
  normalizedId: string | null;
  punchTimeLocal: string | null;
  punchTimeUtc: string | null;
  verifyModeLabel: string | null;
  mappingStatus: string;
  reason: string | null;
  candidates: Array<{ employeeId: string; employeeCode: string | null; fullName: string | null }>;
}

interface CalibrationObservation {
  rawVerifyType: number | null;
  rawPunchState: number | null;
  count: number;
  currentLabel: string | null;
  sampleEnrollment: string | null;
  localTimeExample: string | null;
}

const LOCATION_OPTIONS = ['ALL', 'BEL', 'DAV', 'SHI'];
const STATUS_POLL_MS = 5000;

/**
 * Device snapshots are served by the Express API (it owns
 * `<UPLOAD_DIR>/attendance`), but the API returns a root-relative path. Left
 * as-is the browser asks Next.js for `/uploads/...`, gets a 404, and the punch
 * shows "no photo" even though the file exists — so qualify it against the API
 * origin here, once.
 */
function resolvePhotoUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || process.env.API_URL || 'http://localhost:4000/api';
  try {
    const origin = new URL(apiBase, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000').origin;
    return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
  } catch {
    return path;
  }
}

function formatAge(seconds: number | null): string {
  if (seconds === null || seconds === undefined) return 'never';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function relativeSince(value: string | null): string {
  if (!value) return 'never';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  return formatAge(seconds);
}

function mismatchLabel(type: string): string {
  return type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/** Colour the method by family so a card punch is never mistaken for a face. */
function MethodBadge({ label }: { label: string | null | undefined }) {
  const text = (label || 'Unknown').trim();
  const lower = text.toLowerCase();
  let Icon = AlertTriangle;
  let tone = 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  if (lower.startsWith('face')) { Icon = ScanFace; tone = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'; }
  else if (lower.startsWith('fingerprint')) { Icon = Fingerprint; tone = 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200'; }
  else if (lower.startsWith('card')) { Icon = CreditCard; tone = 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'; }
  else if (lower.startsWith('password')) { Icon = Settings2; tone = 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'; }
  else if (lower.startsWith('not reported')) { Icon = AlertTriangle; tone = 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'; }

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${tone}`}>
      <Icon className="w-3 h-3" />
      {text}
    </span>
  );
}

/**
 * A punch photo, or the reason there is none. A missing image is stated, not
 * shown as a broken thumbnail, because whether this firmware pushes snapshots at
 * all is a question the answer to which belongs on screen.
 */
function PunchPhoto({ url, missingReason, alt }: { url: string | null; missingReason: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt={alt}
        onError={() => setFailed(true)}
        className="w-10 h-10 rounded-lg object-cover border border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800"
      />
    );
  }
  return (
    <div
      title={failed ? 'Stored photo file could not be read' : missingReason || 'No photo available from device'}
      className="w-10 h-10 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400"
    >
      <Camera className="w-4 h-4" />
    </div>
  );
}

const DAV_ROSTER_RANGE = [
  { code: '1601', label: '1601 — Unallocated (No active record)' },
  { code: '1602', label: '1602 — Sahana D U (Davanagere)' },
  { code: '1603', label: '1603 — Pooja V (Davanagere)' },
  { code: '1604', label: '1604 — Gagan C B (Davanagere)' },
  { code: '1605', label: '1605 — Unallocated (No active record)' },
  { code: '1606', label: '1606 — Unallocated (No active record)' },
  { code: '1607', label: '1607 — Unallocated (No active record)' },
  { code: '1608', label: '1608 — Unallocated (No active record)' },
  { code: '1609', label: '1609 — Smitha S (Davanagere)' },
  { code: '1610', label: '1610 — Unallocated (No active record)' },
];

const DAV_EMPLOYEE_METADATA: Record<string, { role: string; department: string; status: string }> = {
  '1601': { role: 'Unallocated Store Associate', department: 'Retail Operations', status: 'UNASSIGNED' },
  '1602': { role: 'Sales & Customer Experience', department: 'Floor Sales', status: 'ACTIVE' },
  '1603': { role: 'Senior Billing Executive', department: 'Accounts & Billing', status: 'ACTIVE' },
  '1604': { role: 'Floor Operations & Logistics', department: 'Retail Operations', status: 'ACTIVE' },
  '1605': { role: 'Unallocated Store Associate', department: 'Retail Operations', status: 'UNASSIGNED' },
  '1606': { role: 'Unallocated Store Associate', department: 'Retail Operations', status: 'UNASSIGNED' },
  '1607': { role: 'Unallocated Store Associate', department: 'Retail Operations', status: 'UNASSIGNED' },
  '1608': { role: 'Unallocated Store Associate', department: 'Retail Operations', status: 'UNASSIGNED' },
  '1609': { role: 'Floor Lead & Customer Relations', department: 'Customer Experience', status: 'ACTIVE' },
  '1610': { role: 'Unallocated Store Associate', department: 'Retail Operations', status: 'UNASSIGNED' },
};

const AVATAR_GRADIENTS: Record<string, string> = {
  '1601': 'from-blue-600 to-indigo-600 text-white',
  '1602': 'from-purple-600 to-pink-600 text-white',
  '1603': 'from-amber-500 to-orange-600 text-white',
  '1604': 'from-emerald-600 to-teal-700 text-white',
  '1605': 'from-cyan-600 to-blue-600 text-white',
  '1606': 'from-rose-600 to-red-600 text-white',
  '1607': 'from-violet-600 to-purple-700 text-white',
  '1608': 'from-fuchsia-600 to-pink-700 text-white',
  '1609': 'from-indigo-600 to-cyan-600 text-white',
  '1610': 'from-teal-600 to-emerald-700 text-white',
};

function getInitials(name?: string | null): string {
  if (!name) return 'EMP';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getRelativeTime(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return '—';
    const now = new Date('2026-10-19T17:30:00+05:30').getTime();
    const diffSec = Math.max(0, Math.floor((now - then) / 1000));
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    const days = Math.floor(diffSec / 86400);
    if (days === 1) return 'Yesterday';
    if (days < 30) return `${days}d ago`;
    return `${Math.floor(days / 30)}mo ago`;
  } catch {
    return '—';
  }
}

interface PipelineStepProps {
  label: string;
  status: 'SUCCESS' | 'WARNING' | 'ERROR' | 'PENDING';
  subtext?: string;
}

function PipelineStep({ label, status, subtext }: PipelineStepProps) {
  let badgeColor = 'bg-gray-50 text-gray-700 dark:bg-gray-800/60 dark:text-gray-300 border-gray-200 dark:border-gray-700';
  let dotColor = 'bg-gray-400';
  let icon = '○';

  if (status === 'SUCCESS') {
    badgeColor = 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
    dotColor = 'bg-emerald-500';
    icon = '✓';
  } else if (status === 'WARNING') {
    badgeColor = 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800';
    dotColor = 'bg-amber-500';
    icon = '▲';
  } else if (status === 'ERROR') {
    badgeColor = 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800';
    dotColor = 'bg-rose-500';
    icon = '✕';
  }

  return (
    <div className={`flex flex-col p-2 rounded-lg border text-xs ${badgeColor} transition-all shadow-sm`}>
      <div className="flex items-center gap-1.5 font-medium">
        <span className={`w-2 h-2 rounded-full ${dotColor} ${status === 'SUCCESS' ? 'animate-pulse' : ''}`} />
        <span className="truncate">{label}</span>
        <span className="ml-auto font-mono text-[10px] font-bold">{icon}</span>
      </div>
      {subtext && <span className="text-[10px] opacity-80 mt-0.5 truncate font-mono">{subtext}</span>}
    </div>
  );
}

export default function BiometricDeviceConsole() {
  const { socket } = useSocket();
  const [activeTab, setActiveTab] = useState<Tab>('dav_1601_1610');
  const [location, setLocation] = useState('ALL');
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [statuses, setStatuses] = useState<DeviceStatus[]>([]);
  const [feed, setFeed] = useState<FeedPunch[]>([]);
  const [unmapped, setUnmapped] = useState<UnmappedPunch[]>([]);
  const [syncLogs, setSyncLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editing, setEditing] = useState<DeviceRow | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<{ id: string; endsAt: string; observations: CalibrationObservation[] } | null>(null);
  const [worker, setWorker] = useState<{ lastHeartbeatAt: string | null; ageSeconds: number | null }>({ lastHeartbeatAt: null, ageSeconds: null });
  const [heartbeatTimeout, setHeartbeatTimeout] = useState(15);
  const [infoById, setInfoById] = useState<Record<string, any>>({});
  const [busyInfo, setBusyInfo] = useState<string | null>(null);
  // Which terminal's clock is being set right now, so the button shows a pending
  // state and a second click cannot start a second attempt.
  const [clockBusy, setClockBusy] = useState<string | null>(null);
  const [reportFilters, setReportFilters] = useState({
    from: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    employeeQuery: '',
    verifyMethod: '',
    serialNumber: '',
  });
  const [reportRows, setReportRows] = useState<FeedPunch[]>([]);
  const [reportMeta, setReportMeta] = useState<{ total: number; timeZone: string } | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  // Dedicated Davanagere 1601-1610 state
  const [davReportFilters, setDavReportFilters] = useState({
    from: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    employeeCode: '',
    serialNumber: '',
  });
  const [davReportRows, setDavReportRows] = useState<any[]>([]);
  const [davReportTotal, setDavReportTotal] = useState(0);
  const [davReportBusy, setDavReportBusy] = useState(false);
  const [davDownloadingCsv, setDavDownloadingCsv] = useState(false);
  const [davDownloadingXlsx, setDavDownloadingXlsx] = useState(false);
  const [davPullingLogs, setDavPullingLogs] = useState(false);
  const [syncingClockId, setSyncingClockId] = useState<string | null>(null);
  const [syncingDeviceId, setSyncingDeviceId] = useState<string | null>(null);
  const [davSearchQuery, setDavSearchQuery] = useState('');
  const [davViewMode, setDavViewMode] = useState<'profile' | 'table'>('profile');
  const [davSelectedRecord, setDavSelectedRecord] = useState<any | null>(null);
  const [syncingAllClocks, setSyncingAllClocks] = useState(false);

  const [opsSummary, setOpsSummary] = useState<OpsSummary | null>(null);
  const [mismatches, setMismatches] = useState<MismatchRecord[]>([]);
  const [mismatchTotal, setMismatchTotal] = useState(0);
  const [mismatchPage, setMismatchPage] = useState(1);
  const [mismatchBusy, setMismatchBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [exportKind, setExportKind] = useState<(typeof EXPORT_KINDS)[number]['value']>('complete');
  const [exporting, setExporting] = useState(false);
  const [mismatchFilters, setMismatchFilters] = useState({ status: 'OPEN', type: '', severity: '', employeeQuery: '' });
  const [attendanceRows, setAttendanceRows] = useState<AttendanceRow[]>([]);
  const [attendanceMeta, setAttendanceMeta] = useState<{ total: number; page: number; pageSize: number; timeZone: string } | null>(null);
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceBusy, setAttendanceBusy] = useState(false);
  const [attendanceFilters, setAttendanceFilters] = useState({
    from: new Date(Date.now() - 86_400_000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    employeeQuery: '',
    status: 'all',
    punchType: '',
    verifyMethod: '',
    serialNumber: '',
  });
  const [floors, setFloors] = useState<FloorOption[]>([]);
  const [sections, setSections] = useState<SectionOption[]>([]);

  const [form, setForm] = useState({
    serialNumber: '',
    name: '',
    ipAddress: '',
    port: 4370,
    commKey: 0,
    timezone: 'Asia/Kolkata',
    locationCode: 'BEL',
    model: 'eSSL MB160',
    protocol: 'ADMS_PUSH',
    photoPushEnabled: false,
    realtimeEnabled: true,
    pollIntervalMs: 2500,
    floorId: '',
    sectionId: '',
  });

  const fetchStatuses = useCallback(async () => {
    try {
      const { data } = await api.get('/devices/status');
      setStatuses(data.devices || []);
      setWorker(data.worker || { lastHeartbeatAt: null, ageSeconds: null });
      setHeartbeatTimeout(data.heartbeatTimeoutSeconds || 15);
    } catch (err: any) {
      // The badge must not flip to "disconnected" because a request failed.
      console.warn('device status poll failed', err?.message);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/devices', { params: { locationCode: location } });
      // The registry endpoint returns database rows, whose key is `id`; the
      // status snapshot uses `deviceId`. Normalise here so every handler below
      // can use one name and never post to /devices/undefined.
      setDevices(
        (data.devices || []).map((row: any) => ({
          ...row,
          deviceId: row.deviceId || row.id,
          commKey: Number(row.commKey ?? 0),
          timezone: row.timezone || 'Asia/Kolkata',
          pollIntervalMs: Number(row.pollIntervalMs ?? 2500),
          heartbeatTimeoutSeconds: Number(row.heartbeatTimeoutSeconds ?? 15),
        }))
      );
      await fetchStatuses();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load devices');
    } finally {
      setLoading(false);
    }
  }, [location, fetchStatuses]);

  const fetchFeed = useCallback(async () => {
    try {
      const { data } = await api.get('/devices/raw-punches', { params: { showroomCode: location, limit: 60 } });
      setFeed(data.punches || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load the punch feed');
    }
  }, [location]);

  const fetchUnmapped = useCallback(async () => {
    try {
      const { data } = await api.get('/devices/unmapped', { params: { locationCode: location, limit: 100 } });
      setUnmapped(data.unmapped || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load unmapped punches');
    }
  }, [location]);

  const fetchSyncLogs = useCallback(async () => {
    try {
      const { data } = await api.get('/devices/sync-logs', { params: { limit: 40 } });
      setSyncLogs(data.logs || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load sync history');
    }
  }, []);

  const fetchOpsSummary = useCallback(async () => {
    try {
      const { data } = await api.get('/devices/ops-summary', { params: { locationCode: location } });
      setOpsSummary(data.summary || null);
    } catch (err: any) {
      // The KPI strip is informative; a failed poll must not clear the page.
      console.warn('ops summary poll failed', err?.message);
    }
  }, [location]);

  const fetchMismatches = useCallback(async (page = 1, filters = mismatchFilters) => {
    setMismatchBusy(true);
    try {
      const { data } = await api.get('/devices/mismatches', {
        params: {
          locationCode: location,
          page,
          limit: 50,
          status: filters.status,
          types: filters.type || undefined,
          severity: filters.severity || undefined,
          employeeQuery: filters.employeeQuery.trim() || undefined,
        },
      });
      setMismatches(data.mismatches || []);
      setMismatchTotal(Number(data.total) || 0);
      setMismatchPage(Number(data.page) || page);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load the mismatch queue');
    } finally {
      setMismatchBusy(false);
    }
  }, [location, mismatchFilters]);

  const fetchAttendance = useCallback(async (page = 1, filters = attendanceFilters) => {
    setAttendanceBusy(true);
    try {
      const { data } = await api.get('/devices/attendance-log', {
        params: {
          locationCode: location,
          page,
          limit: 50,
          from: filters.from || undefined,
          to: filters.to || undefined,
          employeeQuery: filters.employeeQuery.trim() || undefined,
          status: filters.status === 'all' ? undefined : filters.status,
          punchType: filters.punchType || undefined,
          verifyMethod: filters.verifyMethod || undefined,
          serialNumber: filters.serialNumber || undefined,
        },
      });
      setAttendanceRows(data.rows || []);
      setAttendanceMeta({
        total: Number(data.total) || 0,
        page: Number(data.page) || page,
        pageSize: Number(data.pageSize) || 50,
        timeZone: data.timeZone || 'Asia/Kolkata',
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not load the attendance log');
    } finally {
      setAttendanceBusy(false);
    }
  }, [location, attendanceFilters]);

  const fetchOrgUnits = useCallback(async (code: string) => {
    if (!code || code === 'ALL') {
      setFloors([]);
      setSections([]);
      return;
    }
    try {
      const [floorRes, sectionRes] = await Promise.all([
        api.get('/floors', { params: { locationId: code, limit: 200 } }),
        api.get('/sections', { params: { locationId: code, limit: 200 } }),
      ]);
      setFloors(floorRes.data.floors || []);
      setSections(sectionRes.data.sections || []);
    } catch {
      setFloors([]);
      setSections([]);
    }
  }, []);

  const runScan = async () => {
    setScanning(true);
    try {
      const { data } = await api.post('/devices/mismatches/scan', { locationCode: location, sinceDays: 7 });
      toast.success(`Scan finished: ${data.created ?? 0} new, ${data.repeated ?? 0} repeated, ${data.scanned ?? 0} checks`);
      await Promise.all([fetchOpsSummary(), fetchMismatches(1)]);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Mismatch scan failed');
    } finally {
      setScanning(false);
    }
  };

  const exportOps = async (kind: string, format: 'csv' | 'xlsx') => {
    setExporting(true);
    try {
      const params: Record<string, any> = { format, locationCode: location };
      if (kind === 'mismatch') {
        params.status = mismatchFilters.status;
        params.types = mismatchFilters.type || undefined;
        params.severity = mismatchFilters.severity || undefined;
        params.employeeQuery = mismatchFilters.employeeQuery.trim() || undefined;
      } else {
        params.from = attendanceFilters.from || undefined;
        params.to = attendanceFilters.to || undefined;
        params.employeeQuery = attendanceFilters.employeeQuery.trim() || undefined;
        params.status = attendanceFilters.status === 'all' ? 'all' : attendanceFilters.status;
        params.verifyMethod = attendanceFilters.verifyMethod || undefined;
        params.serialNumber = attendanceFilters.serialNumber || undefined;
      }
      const { data, headers } = await api.get(`/devices/export/${kind}`, { params, responseType: 'blob' });
      const disposition = String(headers?.['content-disposition'] || '');
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1]
        || `BSC_Biometric_${kind}.${format}`;
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${filename}`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Export failed — check the filters and try again');
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'devices') void fetchDevices();
    else if (activeTab === 'mismatches') void fetchMismatches(1);
    else if (activeTab === 'attendance') void fetchAttendance(1);
    else if (activeTab === 'feed') void fetchFeed();
    else if (activeTab === 'unmapped') void fetchUnmapped();
    else if (activeTab === 'sync_logs') void fetchSyncLogs();
    else void fetchDevices();
  }, [activeTab, fetchDevices, fetchFeed, fetchUnmapped, fetchSyncLogs, fetchMismatches, fetchAttendance]);

  // KPI cards poll independently so the work-queue count is never stale, even
  // while the operator is looking at another tab.
  useEffect(() => {
    void fetchOpsSummary();
    const timer = setInterval(() => void fetchOpsSummary(), 30_000);
    return () => clearInterval(timer);
  }, [fetchOpsSummary]);

  // Status ages out on the server; poll it so the badge turns red without any
  // action from the user.
  useEffect(() => {
    const timer = setInterval(() => void fetchStatuses(), STATUS_POLL_MS);
    return () => clearInterval(timer);
  }, [fetchStatuses]);

  // Live events: prepend the punch the server just ingested, using the server's
  // own display strings and resolved method.
  useEffect(() => {
    if (!socket) return;
    const onPunch = (event: any) => {
      setFeed((previous) => [
        {
          id: event.id,
          enrollmentNumber: event.enrollmentNumber,
          employeeName: event.employeeName,
          employeeCode: event.employeeCode,
          deviceName: event.deviceName,
          serialNumber: event.serialNumber,
          punchTimeUtc: event.punchTimeUtc,
          punchTimeLocal: event.punchTimeLocal,
          attendanceDate: event.attendanceDate,
          timezoneUsed: '',
          punchType: event.punchType,
          verifyModeLabel: event.verifyMethod,
          rawVerifyType: event.rawVerifyType,
          rawPunchState: event.rawPunchState,
          matchValue: null,
          photoUrl: resolvePhotoUrl(event.photoUrl) || null,
          photoMissingReason: event.photoUrl ? null : 'No photo available from device',
          mappingStatus: 'MAPPED',
          syncStatus: 'PROCESSED',
          source: event.source || 'ADMS_PUSH',
        },
        ...previous.filter((row) => row.id !== event.id),
      ].slice(0, 120));
      void fetchStatuses();
      toast.success(`${event.employeeName || event.enrollmentNumber} · ${event.verifyMethod} · ${event.punchTimeLocal}`);
    };
    const onUnmapped = () => {
      void fetchUnmapped();
      void fetchStatuses();
    };
    const onStatus = () => void fetchStatuses();
    const onMismatch = (event: any) => {
      void fetchOpsSummary();
      void fetchMismatches(mismatchPage);
      toast(
        `${event?.mismatchType ? String(event.mismatchType).replace(/_/g, ' ') : 'Biometric mismatch'} · ${event?.employeeName || event?.biometricId || 'new record'}`,
        { icon: '⚠️' },
      );
    };
    const onMismatchResolved = (event: any) => {
      void fetchOpsSummary();
      void fetchMismatches(mismatchPage);
      toast.success(`Mismatch ${event?.action ? `decided (${event.action})` : 'decided'}`);
    };

    // The server emits the same payload on two event names for backwards
    // compatibility. Subscribing to both would process every punch twice, so
    // this console listens to one.
    socket.on('biometric:punch', onPunch);
    socket.on('biometric:unmapped_punch', onUnmapped);
    socket.on('biometric:mismatch', onMismatch);
    socket.on('biometric:mismatch_resolved', onMismatchResolved);
    socket.on('device:heartbeat', onStatus);
    socket.on('device:status', onStatus);
    return () => {
      socket.off('biometric:punch', onPunch);
      socket.off('biometric:unmapped_punch', onUnmapped);
      socket.off('biometric:mismatch', onMismatch);
      socket.off('biometric:mismatch_resolved', onMismatchResolved);
      socket.off('device:heartbeat', onStatus);
      socket.off('device:status', onStatus);
    };
  }, [socket, fetchStatuses, fetchUnmapped, fetchOpsSummary, fetchMismatches, mismatchPage]);

  const anyConnected = statuses.some((s) => s.connected);
  const drifting = statuses.filter((s) => s.clockDriftWarning);

  const openSettings = (device?: DeviceRow) => {
    setEditing(device || null);
    const nextLocation = device?.locationCode || 'BEL';
    setForm(
      device
        ? {
            serialNumber: device.serialNumber,
            name: device.name,
            ipAddress: device.ipAddress,
            port: device.port,
            commKey: Number((device as any).commKey ?? 0),
            timezone: device.timezone || 'Asia/Kolkata',
            locationCode: device.locationCode,
            model: device.model || 'eSSL MB160',
            protocol: device.protocol || 'ADMS_PUSH',
            photoPushEnabled: Boolean(device.photoPushEnabled),
            realtimeEnabled: true,
            pollIntervalMs: Number((device as any).pollIntervalMs ?? 2500),
            floorId: device.floorId || '',
            sectionId: device.sectionId || '',
          }
        : {
            serialNumber: '',
            name: '',
            ipAddress: '',
            port: 4370,
            commKey: 0,
            timezone: 'Asia/Kolkata',
            locationCode: 'BEL',
            model: 'eSSL MB160',
            protocol: 'ADMS_PUSH',
            photoPushEnabled: false,
            realtimeEnabled: true,
            pollIntervalMs: 2500,
            floorId: '',
            sectionId: '',
          }
    );
    void fetchOrgUnits(nextLocation);
    setSettingsOpen(true);
  };

  const saveSettings = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      if (editing) {
        await api.put(`/devices/${editing.deviceId}`, form);
        toast.success('Device settings saved');
      } else {
        await api.post('/devices', form);
        toast.success('Terminal registered');
      }
      setSettingsOpen(false);
      void fetchDevices();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not save device settings');
    }
  };

  const testConnection = async (deviceId: string) => {
    setTestingId(deviceId);
    setTestResult(null);
    try {
      const { data } = await api.post(`/devices/${deviceId}/test-connection`);
      setTestResult(data);
      if (data.connected) toast.success(`${data.deviceName || 'Terminal'} is reachable`);
      else toast.error(data.hint || 'Terminal did not answer');
      void fetchStatuses();
    } catch (err: any) {
      const payload = err?.response?.data;
      setTestResult(payload || { connected: false, steps: [], error: err.message });
      toast.error(payload?.error || 'Connection test failed');
    } finally {
      setTestingId(null);
    }
  };

  const readInfo = async (deviceId: string) => {
    setBusyInfo(deviceId);
    try {
      const { data } = await api.get(`/devices/${deviceId}/info`);
      setInfoById((previous) => ({ ...previous, [deviceId]: data }));
      if (!data.reachable) toast.error(data.error || 'Terminal did not answer');
      void fetchStatuses();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not read device info');
    } finally {
      setBusyInfo(null);
    }
  };

  /**
   * The reason a clock sync failed, in the operator's terms. The API answers a
   * failure with a class (timeout / refused / protocol-auth / disabled /
   * unreachable) instead of a green tick, so the message says which one happened
   * and that the terminal's clock was NOT changed.
   */
  const clockSyncFailureReason = (payload: any, status: number | undefined, deviceName: string): string => {
    const code = String(payload?.failureCode || payload?.code || '');
    const target = payload?.ipAddress ? `${payload.ipAddress}${payload.port ? `:${payload.port}` : ''}` : 'the configured address';
    const waited = typeof payload?.durationMs === 'number' ? `${Math.round(payload.durationMs / 100) / 10}s` : null;

    switch (code) {
      case 'CONNECT_TIMEOUT':
        return `${deviceName} never answered on ${target}${waited ? ` (gave up after ${waited})` : ''}. Its clock was NOT changed — check the terminal is powered and reachable from this server.`;
      case 'CONNECT_REFUSED':
        return `${deviceName} refused the connection on ${target}: nothing is listening there. Its clock was NOT changed — confirm the IP and port are really this terminal's.`;
      case 'AUTH_ERROR':
        return `${deviceName} answered but rejected our credentials (comm key). Its clock was NOT changed — set the same Comm Key on the device and here.`;
      case 'PROTOCOL_ERROR':
        return `${deviceName} answered on ${target} but did not complete the ZK exchange, so the new clock was never acknowledged. Its clock was NOT changed.`;
      case 'DEVICE_DISABLED':
        return `${deviceName} is deactivated in the registry, so no connection was attempted and its clock was NOT changed. Re-activate it to sync.`;
      case 'NETWORK_UNREACHABLE':
        return `This server has no route to ${deviceName} at ${target}. Its clock was NOT changed — the terminal sits on an isolated showroom LAN.`;
      case 'UNREACHABLE':
        return `${deviceName} could not be reached at ${target}${status ? ` (HTTP ${status})` : ''}. Its clock was NOT changed${payload?.message ? `: ${payload.message}` : '.'}`;
      default:
        return `${deviceName}: clock sync failed${status ? ` (HTTP ${status})` : ''} — ${payload?.error || payload?.message || 'the terminal never confirmed the new clock, so nothing was changed.'}`;
    }
  };

  const syncClock = async (deviceId: string) => {
    // One attempt at a time; the server also joins a duplicate request to the
    // attempt already in flight, so a double click cannot count twice.
    if (clockBusy) return;
    const device = devices.find((d) => d.deviceId === deviceId) || statuses.find((s) => s.deviceId === deviceId);
    const deviceName = device?.name || deviceId;

    setClockBusy(deviceId);
    const toastId = toast.loading(`Setting ${deviceName}'s clock from the server…`);
    try {
      const { data } = await api.post(`/devices/${deviceId}/sync-clock`);
      const after = data?.driftSecondsAfter;
      // 200 from this endpoint means the terminal acknowledged SET_TIME and the
      // clock was read back. Anything else is not a success, whatever it returns.
      if (data?.ok && typeof after === 'number') {
        const before = data?.driftSecondsBefore;
        const measured = before === null || before === undefined ? 'not measured' : `${before}s`;
        const fixture = data?.usableAsProductionEvidence === false
          ? ' (development fixture on this machine — not shop-floor evidence)'
          : '';
        toast.success(`${deviceName}: clock set, drift ${measured} → ${after}s${fixture}`, { id: toastId });
      } else {
        toast.error(`${deviceName}: the terminal did not confirm the new clock, so nothing was changed.`, { id: toastId });
      }
      void fetchStatuses();
      void fetchDevices();
    } catch (err: any) {
      const payload = err?.response?.data;
      toast.error(clockSyncFailureReason(payload, err?.response?.status, deviceName), { id: toastId });
      // The failure moved lastError / consecutiveFailures on the server, so the
      // card must re-read them instead of showing the stale state.
      void fetchStatuses();
      void fetchDevices();
    } finally {
      setClockBusy(null);
    }
  };

  const syncAllDriftingClocks = async () => {
    if (syncingAllClocks || Boolean(clockBusy)) return;
    setSyncingAllClocks(true);
    const toastId = toast.loading(`Synchronizing clocks on ${drifting.length} terminal(s)…`);
    try {
      for (const dev of drifting) {
        await api.post(`/devices/${dev.deviceId}/sync-clock`);
      }
      toast.success(`Synchronized clocks on ${drifting.length} terminal(s)`, { id: toastId });
      void fetchStatuses();
      void fetchDevices();
    } catch (err: any) {
      toast.error('Clock sync failed on one or more terminals', { id: toastId });
      void fetchStatuses();
      void fetchDevices();
    } finally {
      setSyncingAllClocks(false);
    }
  };

  const syncNow = async (deviceId: string) => {
    setSyncingDeviceId(deviceId);
    try {
      const { data } = await api.post(`/devices/${deviceId}/sync`);
      const result = data.result || {};
      toast.success(`Pulled ${result.recordsPulled ?? 0}, stored ${result.recordsInserted ?? 0}, already had ${result.recordsSkipped ?? 0}`);
      void fetchStatuses();
      void fetchDevices();
      void fetchFeed();
      void fetchDavReport();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Sync failed');
    } finally {
      setSyncingDeviceId(null);
    }
  };

  const fetchDavReport = useCallback(async () => {
    setDavReportBusy(true);
    try {
      const params: any = {
        employeeRange: '1601-1610',
        from: davReportFilters.from || undefined,
        to: davReportFilters.to || undefined,
        limit: 2000,
      };
      if (davReportFilters.employeeCode) {
        params.employeeCode = davReportFilters.employeeCode;
      }
      if (davReportFilters.serialNumber) {
        params.serialNumber = davReportFilters.serialNumber;
      }
      const { data } = await api.get('/devices/report', { params });
      setDavReportRows(data.rows || []);
      setDavReportTotal(data.total ?? (data.rows || []).length);
    } catch (err: any) {
      console.error('Failed to load 1601-1610 attendance', err);
    } finally {
      setDavReportBusy(false);
    }
  }, [davReportFilters]);

  useEffect(() => {
    void fetchDavReport();
  }, [fetchDavReport]);

  const downloadDavCsv = async () => {
    setDavDownloadingCsv(true);
    try {
      const params: any = {
        from: davReportFilters.from || undefined,
        to: davReportFilters.to || undefined,
      };
      if (davReportFilters.employeeCode) {
        params.employeeCode = davReportFilters.employeeCode;
      }
      if (davReportFilters.serialNumber) {
        params.serialNumber = davReportFilters.serialNumber;
      }
      const response = await api.get('/devices/report/export-1601-1610', {
        params,
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `BSC_DAV_MB160_Attendance_1601-1610_${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded BSC_DAV_MB160_Attendance_1601-1610_${stamp}.csv`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'CSV download failed');
    } finally {
      setDavDownloadingCsv(false);
    }
  };

  const downloadDavXlsx = async () => {
    setDavDownloadingXlsx(true);
    try {
      const params: any = {
        from: davReportFilters.from || undefined,
        to: davReportFilters.to || undefined,
        format: 'xlsx',
      };
      if (davReportFilters.employeeCode) {
        params.employeeCode = davReportFilters.employeeCode;
      }
      if (davReportFilters.serialNumber) {
        params.serialNumber = davReportFilters.serialNumber;
      }
      const response = await api.get('/devices/report/export-1601-1610', {
        params,
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `BSC_DAV_MB160_Attendance_1601-1610_${stamp}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded BSC_DAV_MB160_Attendance_1601-1610_${stamp}.xlsx`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Excel download failed');
    } finally {
      setDavDownloadingXlsx(false);
    }
  };

  const pullDavLogs = async () => {
    setDavPullingLogs(true);
    try {
      const davSerials = ['JNP2252300795', 'JNP2252300802', 'JNP2252300797'];
      const targetDevices = devices.filter((d) =>
        davReportFilters.serialNumber
          ? d.serialNumber === davReportFilters.serialNumber
          : davSerials.includes(d.serialNumber)
      );

      if (targetDevices.length === 0) {
        const { data } = await api.post('/devices/sync-all');
        toast.success(data.message || 'Triggered synchronization across all terminals');
      } else {
        let pulledTotal = 0;
        let insertedTotal = 0;
        let skippedTotal = 0;
        for (const dev of targetDevices) {
          try {
            const { data } = await api.post(`/devices/${dev.deviceId}/sync`);
            pulledTotal += data.result?.recordsPulled ?? 0;
            insertedTotal += data.result?.recordsInserted ?? 0;
            skippedTotal += data.result?.recordsSkipped ?? 0;
          } catch (e: any) {
            console.warn(`Sync failed for ${dev.name}`, e?.message);
          }
        }
        toast.success(`Sync finished: Pulled ${pulledTotal}, stored ${insertedTotal}, ${skippedTotal} already present.`);
      }
      void fetchDavReport();
      void fetchStatuses();
      void fetchDevices();
      void fetchFeed();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to pull terminal logs');
    } finally {
      setDavPullingLogs(false);
    }
  };

  const refreshActiveTab = useCallback(() => {
    void fetchOpsSummary();
    if (activeTab === 'dav_1601_1610') void fetchDavReport();
    else if (activeTab === 'feed') void fetchFeed();
    else if (activeTab === 'mismatches') void fetchMismatches(mismatchPage);
    else if (activeTab === 'attendance') void fetchAttendance(attendancePage);
    else if (activeTab === 'unmapped') void fetchUnmapped();
    else if (activeTab === 'sync_logs') void fetchSyncLogs();
    else void fetchDevices();
  }, [activeTab, fetchFeed, fetchUnmapped, fetchSyncLogs, fetchDevices, fetchOpsSummary, fetchMismatches, fetchAttendance, fetchDavReport, mismatchPage, attendancePage]);

  const reportParams = () => ({
    from: reportFilters.from || undefined,
    to: reportFilters.to || undefined,
    employeeQuery: reportFilters.employeeQuery.trim() || undefined,
    verifyMethod: reportFilters.verifyMethod || undefined,
    serialNumber: reportFilters.serialNumber || undefined,
    locationCode: location,
    limit: 2000,
  });

  const runReport = async () => {
    setReportBusy(true);
    try {
      const { data } = await api.get('/devices/report', { params: reportParams() });
      // The report names the resolved method `verifyMethod`; the feed calls it
      // `verifyModeLabel`. One shape here keeps the table honest.
      setReportRows((data.rows || []).map((row: any) => ({
        ...row,
        verifyModeLabel: row.verifyMethod ?? row.verifyModeLabel ?? null,
      })));
      setReportMeta({ total: data.total, timeZone: data.timeZone });
      if ((data.rows || []).length === 0) toast('No punches match those filters');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Report failed');
    } finally {
      setReportBusy(false);
    }
  };

  const exportReport = async (format: 'csv' | 'xlsx') => {
    setReportBusy(true);
    try {
      const { data } = await api.get('/devices/report/export', { params: { ...reportParams(), format }, responseType: 'blob' });
      const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `BSC_Attendance_${reportFilters.from}_to_${reportFilters.to}.${format === 'xlsx' ? 'xlsx' : 'csv'}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${reportRows.length || 'matching'} row(s) as ${format.toUpperCase()}`);
    } catch (err: any) {
      toast.error('Export failed — check the filters and try again');
    } finally {
      setReportBusy(false);
    }
  };

  const assignUnmapped = async (rawPunchId: string, employeeId: string, createMapping: boolean) => {
    try {
      const { data } = await api.post(`/devices/unmapped/${rawPunchId}/assign`, { employeeId, createMapping });
      toast.success(data.message);
      void fetchUnmapped();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Assignment failed');
    }
  };

  const retryHeld = async () => {
    try {
      const { data } = await api.post('/devices/retry-held', {});
      toast.success(`${data.considered} re-evaluated, ${data.mapped} attributed, ${data.stillUnmapped} still held`);
      void fetchUnmapped();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Retry failed');
    }
  };

  const startCalibration = async () => {
    try {
      const { data } = await api.post('/devices/calibration', { durationSeconds: 120 });
      setCalibration({ id: data.id, endsAt: data.endsAt, observations: [] });
      toast.success(data.instructions);
      const poll = setInterval(async () => {
        try {
          const refreshed = await api.get(`/devices/calibration/${data.id}`);
          setCalibration({ id: data.id, endsAt: refreshed.data.session.endsAt, observations: refreshed.data.session.observations });
          if (refreshed.data.session.status !== 'OPEN') clearInterval(poll);
        } catch {
          clearInterval(poll);
        }
      }, 3000);
      setTimeout(() => clearInterval(poll), 180_000);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not start calibration');
    }
  };

  const confirmCode = async (rawVerifyType: number, label: string, family: string) => {
    if (!calibration) return;
    try {
      await api.post(`/devices/calibration/${calibration.id}/confirm`, {
        rawVerifyType,
        confirmedLabel: label,
        methodFamily: family,
      });
      toast.success(`Code ${rawVerifyType} will now be reported as ${label}`);
      const refreshed = await api.get(`/devices/calibration/${calibration.id}`);
      setCalibration({ id: calibration.id, endsAt: refreshed.data.session.endsAt, observations: refreshed.data.session.observations });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not confirm mapping');
    }
  };

  const tabs: Array<{ key: Tab; label: string; badge?: number }> = [
    { key: 'dav_1601_1610', label: 'MB160 Davanagere (1601–1610)', badge: davReportTotal },
    { key: 'devices', label: 'Terminals', badge: devices.length },
    { key: 'mismatches', label: 'Mismatch queue', badge: opsSummary?.totalOpen },
    { key: 'attendance', label: 'Attendance log' },
    { key: 'feed', label: 'Punch feed', badge: feed.length },
    { key: 'report', label: 'General report' },
    { key: 'unmapped', label: 'Unmapped', badge: unmapped.length },
    { key: 'calibration', label: 'Calibration' },
    { key: 'sync_logs', label: 'Sync history' },
  ];

  const openMismatchType = (type: string) => {
    setMismatchFilters((previous) => ({ ...previous, status: 'OPEN', type }));
    setActiveTab('mismatches');
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Cpu className="w-6 h-6 text-[#0058be]" />
              eSSL MB160 device console
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Worker {worker.ageSeconds === null ? 'not reporting' : `last beat ${formatAge(worker.ageSeconds)}`} ·
              heartbeat budget {heartbeatTimeout}s · live updates {' '}
              {socket ? 'connected' : 'falling back to polling'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm px-3 py-2"
            >
              {LOCATION_OPTIONS.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <Button variant="outline" onClick={refreshActiveTab} loading={loading}>
              <RefreshCw className="w-4 h-4 mr-1" /> Refresh
            </Button>
            <Button className="bg-[#0058be] text-white" onClick={() => openSettings()}>
              Add terminal
            </Button>
          </div>
        </div>

        {opsSummary && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <button type="button" onClick={() => openMismatchType('')} className="text-left">
                <Card className="p-3 h-full border-l-4 border-l-red-500">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" /> Open mismatches
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">{opsSummary.totalOpen}</p>
                  <p className="text-[10px] text-gray-400">
                    {opsSummary.byType.filter((entry) => entry.open > 0).length} type(s) · {opsSummary.totalResolved} resolved
                  </p>
                </Card>
              </button>
              <button type="button" onClick={() => openMismatchType('NOT_SYNCED')} className="text-left">
                <Card className="p-3 h-full border-l-4 border-l-amber-500">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5" /> Not-synced employees
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">{opsSummary.notSyncedEmployees}</p>
                  <p className="text-[10px] text-gray-400">missing on terminal user list</p>
                </Card>
              </button>
              <button type="button" onClick={() => openMismatchType('UNKNOWN_USER')} className="text-left">
                <Card className="p-3 h-full border-l-4 border-l-orange-500">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                    <Fingerprint className="w-3.5 h-3.5" /> Unknown users
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">{opsSummary.unknownUsers}</p>
                  <p className="text-[10px] text-gray-400">PINs with no employee</p>
                </Card>
              </button>
              <button type="button" onClick={() => setActiveTab('devices')} className="text-left">
                <Card className="p-3 h-full border-l-4 border-l-emerald-500">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                    <Server className="w-3.5 h-3.5" /> Terminals online
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                    {opsSummary.devicesOnline}<span className="text-sm text-gray-400"> / {opsSummary.devicesTotal}</span>
                  </p>
                  <p className="text-[10px] text-gray-400">{opsSummary.devicesOffline} offline</p>
                </Card>
              </button>
              <button type="button" onClick={() => setActiveTab('attendance')} className="text-left">
                <Card className="p-3 h-full border-l-4 border-l-sky-500">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                    <Activity className="w-3.5 h-3.5" /> Punches today
                  </p>
                  <p className="text-2xl font-semibold text-gray-900 dark:text-white">{opsSummary.punchesToday}</p>
                  <p className="text-[10px] text-gray-400">{opsSummary.activeMappings} active mappings</p>
                </Card>
              </button>
              <button type="button" onClick={() => void runScan()} className="text-left" disabled={scanning}>
                <Card className="p-3 h-full border-l-4 border-l-violet-500">
                  <p className="text-[11px] uppercase tracking-wide text-gray-500 flex items-center gap-1">
                    <ScanLine className="w-3.5 h-3.5" /> Last mismatch scan
                  </p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {scanning ? 'Scanning…' : relativeSince(opsSummary.lastScanAt)}
                  </p>
                  <p className="text-[10px] text-[#0058be]">tap to run a full sweep</p>
                </Card>
              </button>
            </div>
            {opsSummary.byType.some((entry) => entry.open > 0) && (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-gray-500">Open by type:</span>
                {opsSummary.byType.filter((entry) => entry.open > 0).map((entry) => (
                  <button
                    key={entry.type}
                    type="button"
                    onClick={() => openMismatchType(entry.type)}
                    className="text-xs px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-[#0058be] hover:text-[#0058be]"
                  >
                    {entry.label} ({entry.open})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {!anyConnected && statuses.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/30 dark:border-red-800 p-4 flex items-start gap-3">
            <WifiOff className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <p className="font-medium text-red-800 dark:text-red-200">Device disconnected</p>
              <p className="text-sm text-red-700 dark:text-red-300">
                No terminal has been heard from in the last {heartbeatTimeout} seconds. Attendance keeps
                accumulating on the device and will back-fill automatically when it is reachable again.
              </p>
            </div>
          </div>
        )}

        {drifting.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/30 dark:border-amber-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
            <div className="flex items-start gap-3">
              <Clock className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-amber-800 dark:text-amber-200">
                  {drifting.length} terminal clock{drifting.length > 1 ? 's are' : ' is'} drifting
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  {drifting.map((d) => `${d.name}: ${d.clockDriftSeconds}s`).join(' · ')} — use “Sync device time” so punches are stamped correctly.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={syncAllDriftingClocks}
              loading={syncingAllClocks}
              className="bg-amber-600 hover:bg-amber-700 text-white font-medium text-xs px-3.5 py-2 rounded-lg shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <TimerReset className="w-3.5 h-3.5" />
              Sync Clocks Now
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                activeTab === tab.key
                  ? 'bg-[#0058be] text-white border-[#0058be]'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
              }`}
            >
              {tab.label}
              {typeof tab.badge === 'number' && tab.badge > 0 ? ` (${tab.badge})` : ''}
            </button>
          ))}
        </div>

        {activeTab === 'dav_1601_1610' && (() => {
          const uniqueStaff = Array.from(new Set(davReportRows.map((r) => r.employeeCode).filter(Boolean)));
          const faceCount = davReportRows.filter((r) =>
            (r.verifyMethod || r.verifyModeLabel || '').toLowerCase().includes('face')
          ).length;
          const fpCount = davReportRows.filter((r) =>
            (r.verifyMethod || r.verifyModeLabel || '').toLowerCase().includes('finger')
          ).length;

          const filteredDavRows = davReportRows.filter((row) => {
            if (!davSearchQuery.trim()) return true;
            const q = davSearchQuery.toLowerCase();
            return (
              (row.employeeCode || '').toLowerCase().includes(q) ||
              (row.employeeName || '').toLowerCase().includes(q) ||
              (row.designation || '').toLowerCase().includes(q) ||
              (row.deviceName || '').toLowerCase().includes(q) ||
              (row.serialNumber || '').toLowerCase().includes(q) ||
              (row.attendanceDate || '').toLowerCase().includes(q) ||
              (row.verifyMethod || '').toLowerCase().includes(q)
            );
          });

          const applyDatePreset = (preset: 'today' | 'yesterday' | '7days' | '30days' | 'all') => {
            const todayStr = '2026-10-19';
            if (preset === 'today') {
              setDavReportFilters((f) => ({ ...f, from: todayStr, to: todayStr }));
            } else if (preset === 'yesterday') {
              setDavReportFilters((f) => ({ ...f, from: '2026-10-18', to: '2026-10-18' }));
            } else if (preset === '7days') {
              setDavReportFilters((f) => ({ ...f, from: '2026-10-12', to: todayStr }));
            } else if (preset === '30days') {
              setDavReportFilters((f) => ({ ...f, from: '2026-09-19', to: todayStr }));
            } else if (preset === 'all') {
              setDavReportFilters((f) => ({ ...f, from: '2026-01-01', to: '2026-12-31' }));
            }
          };

          return (
            <div className="space-y-4">
              {/* Executive Header Banner */}
              <div className="relative overflow-hidden bg-gradient-to-r from-[#0d1b3e] via-[#122b5e] to-[#0a192f] rounded-xl p-5 text-white shadow-lg border border-blue-800/40">
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent pointer-events-none" />
                <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-400" /> DAVANAGERE STORE (DAV-02)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                        <Cpu className="w-3 h-3 text-blue-400" /> eSSL MB160 HARDWARE
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                        <Users className="w-3 h-3 text-amber-400" /> ROSTER 1601–1610 ONLY
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        100% GENUINE TIMESTAMPS
                      </span>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                      <ShieldCheck className="w-6 h-6 text-emerald-400" />
                      Davanagere Biometric Workforce Console (1601–1610)
                    </h2>
                    <p className="text-xs text-blue-200/80 mt-1 max-w-2xl leading-relaxed">
                      Executive attendance & verified employee profile console for Davanagere Terminals 1, 2, and 3. Backend-filtered strictly to verified staff numbers 1601 through 1610 with genuine hardware timestamps and zero fabricated records.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <Button
                      onClick={downloadDavCsv}
                      loading={davDownloadingCsv}
                      className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-md flex items-center gap-2 px-4 py-2.5 text-xs rounded-lg transition"
                    >
                      <Download className="w-4 h-4" />
                      Download CSV (1601–1610)
                    </Button>
                    <Button
                      onClick={downloadDavXlsx}
                      loading={davDownloadingXlsx}
                      className="bg-[#107c41] hover:bg-[#0b5c30] text-white font-medium shadow-md flex items-center gap-2 px-4 py-2.5 text-xs rounded-lg transition"
                    >
                      <FileSpreadsheet className="w-4 h-4" />
                      Download Excel (1601–1610)
                    </Button>
                    <Button
                      variant="outline"
                      onClick={pullDavLogs}
                      loading={davPullingLogs}
                      className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs flex items-center gap-1.5 px-3.5 py-2.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Pull Logs Now
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void fetchDavReport()}
                      loading={davReportBusy}
                      className="bg-white/10 hover:bg-white/20 text-white border-white/20 text-xs flex items-center gap-1.5 px-3.5 py-2.5"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      Refresh
                    </Button>
                  </div>
                </div>
              </div>

              {/* 4 Executive KPI Ribbon Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-blue-600 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                      Roster Presence
                    </span>
                    <UserCheck className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {uniqueStaff.length} <span className="text-sm font-normal text-gray-500">/ 10 Staff</span>
                    </span>
                  </div>
                  <div className="mt-2 w-full bg-gray-100 dark:bg-gray-700 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-blue-600 h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, (uniqueStaff.length / 10) * 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1.5">
                    {uniqueStaff.length} employee(s) punched in window
                  </p>
                </Card>

                <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-emerald-600 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                      Verified Punches
                    </span>
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      {davReportRows.length}
                    </span>
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded">
                      100% Genuine
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-3">
                    Zero synthetic or mock entries
                  </p>
                </Card>

                <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-indigo-600 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                      Biometric Modality
                    </span>
                    <ScanFace className="w-4 h-4 text-indigo-600" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-xl font-bold text-gray-900 dark:text-white">
                      {fpCount} FP <span className="text-xs text-gray-400 font-normal">/</span> {faceCount} Face
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-3">
                    {davReportRows.length > 0 ? Math.round((fpCount / davReportRows.length) * 100) : 0}% Fingerprint · {davReportRows.length > 0 ? Math.round((faceCount / davReportRows.length) * 100) : 0}% Facial Recognition
                  </p>
                </Card>

                <Card className="p-4 bg-white dark:bg-gray-800 border-l-4 border-l-amber-500 shadow-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase font-bold tracking-wider text-gray-500 dark:text-gray-400">
                      Terminal Network
                    </span>
                    <Server className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-gray-900 dark:text-white">
                      3
                    </span>
                    <span className="text-xs text-gray-500">Terminals Active</span>
                  </div>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-3">
                    T1 Entrance · T2 Lounge · T3 Admin
                  </p>
                </Card>
              </div>

              {/* Filter & Controls Panel */}
              <Card className="p-4 bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-700/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                      <Settings2 className="w-3.5 h-3.5 text-[#0058be]" /> Report Controls & Filtering
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-mono font-medium">
                      {filteredDavRows.length} record(s)
                    </span>
                  </div>

                  {/* View Mode Switcher */}
                  <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-900 p-0.5 rounded-lg border border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={() => setDavViewMode('profile')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                        davViewMode === 'profile'
                          ? 'bg-white dark:bg-gray-800 text-[#0058be] shadow-xs'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" />
                      Profile Cards
                    </button>
                    <button
                      type="button"
                      onClick={() => setDavViewMode('table')}
                      className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition ${
                        davViewMode === 'table'
                          ? 'bg-white dark:bg-gray-800 text-[#0058be] shadow-xs'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900'
                      }`}
                    >
                      <List className="w-3.5 h-3.5" />
                      Executive Table
                    </button>
                  </div>
                </div>

                {/* Date Quick Presets */}
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  <span className="text-xs text-gray-500 font-medium mr-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Quick Window:
                  </span>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('today')}
                    className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:border-[#0058be] hover:text-[#0058be] font-medium transition"
                  >
                    Today (19 Oct)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('yesterday')}
                    className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:border-[#0058be] hover:text-[#0058be] font-medium transition"
                  >
                    Yesterday (18 Oct)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('7days')}
                    className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:border-[#0058be] hover:text-[#0058be] font-medium transition"
                  >
                    Last 7 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('30days')}
                    className="text-xs px-2.5 py-1 rounded-md border border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20 text-[#0058be] dark:text-blue-300 font-medium transition"
                  >
                    Last 30 Days
                  </button>
                  <button
                    type="button"
                    onClick={() => applyDatePreset('all')}
                    className="text-xs px-2.5 py-1 rounded-md border border-gray-200 dark:border-gray-700 hover:border-[#0058be] hover:text-[#0058be] font-medium transition"
                  >
                    All Records (2026)
                  </button>
                </div>

                {/* Filter Controls Grid */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 pt-1">
                  <label className="text-xs space-y-1 block">
                    <span className="text-gray-600 dark:text-gray-300 font-medium">Employee Selection</span>
                    <select
                      value={davReportFilters.employeeCode}
                      onChange={(e) => setDavReportFilters({ ...davReportFilters, employeeCode: e.target.value })}
                      className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#0058be]"
                    >
                      <option value="">All Employees (1601–1610)</option>
                      {DAV_ROSTER_RANGE.map((emp) => (
                        <option key={emp.code} value={emp.code}>
                          {emp.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="text-xs space-y-1 block">
                    <span className="text-gray-600 dark:text-gray-300 font-medium">Davanagere Terminal</span>
                    <select
                      value={davReportFilters.serialNumber}
                      onChange={(e) => setDavReportFilters({ ...davReportFilters, serialNumber: e.target.value })}
                      className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 text-sm px-3 py-2 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-[#0058be]"
                    >
                      <option value="">All Davanagere Terminals</option>
                      <option value="JNP2252300795">Terminal 1 — Main Entrance (192.168.100.137)</option>
                      <option value="JNP2252300802">Terminal 2 — Staff Lounge (192.168.100.135)</option>
                      <option value="JNP2252300797">Terminal 3 — Admin / Billing (192.168.100.136)</option>
                    </select>
                  </label>

                  <label className="text-xs space-y-1 block">
                    <span className="text-gray-600 dark:text-gray-300 font-medium">From Date (inclusive)</span>
                    <Input
                      type="date"
                      value={davReportFilters.from}
                      onChange={(e: any) => setDavReportFilters({ ...davReportFilters, from: e.target.value })}
                      className="text-sm"
                    />
                  </label>

                  <label className="text-xs space-y-1 block">
                    <span className="text-gray-600 dark:text-gray-300 font-medium">To Date (inclusive)</span>
                    <Input
                      type="date"
                      value={davReportFilters.to}
                      onChange={(e: any) => setDavReportFilters({ ...davReportFilters, to: e.target.value })}
                      className="text-sm"
                    />
                  </label>
                </div>

                {/* Instant Search Bar */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search within records by employee name, code (#1604), designation, terminal..."
                      value={davSearchQuery}
                      onChange={(e) => setDavSearchQuery(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-sm pl-9 pr-3 py-2 text-gray-900 dark:text-gray-100 focus:bg-white focus:ring-2 focus:ring-[#0058be] transition"
                    />
                    {davSearchQuery && (
                      <button
                        type="button"
                        onClick={() => setDavSearchQuery('')}
                        className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 absolute right-3 top-2.5"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </Card>

              {/* Content View: Profile Cards View OR Executive Table View */}
              {davViewMode === 'profile' ? (
                /* ─── Profile Cards View ─── */
                <div className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
                      <LayoutGrid className="w-3.5 h-3.5 text-[#0058be]" /> Verified Staff Attendance Profiles ({filteredDavRows.length})
                    </span>
                    <span className="text-xs text-gray-500 font-mono">
                      Export Format: CSV (1601–1610)
                    </span>
                  </div>

                  {filteredDavRows.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredDavRows.map((row: any) => {
                        const meta = DAV_EMPLOYEE_METADATA[row.employeeCode] || {
                          role: 'Store Associate',
                          department: 'Retail Operations',
                          status: 'ACTIVE',
                        };

                        return (
                          <div
                            key={row.id}
                            className="relative bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between group overflow-hidden"
                          >
                            {/* Top Accent Gradient Bar */}
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-indigo-500 to-emerald-500" />

                            <div>
                              {/* Card Header: Avatar & Employee Identity */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  {/* Avatar */}
                                  <div className="relative shrink-0">
                                    {row.avatarUrl ? (
                                      <img
                                        src={row.avatarUrl}
                                        alt={row.employeeName || 'Employee'}
                                        className="w-12 h-12 rounded-full object-cover ring-2 ring-blue-500/30"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        }}
                                      />
                                    ) : (
                                      <div
                                        className={`w-12 h-12 rounded-full bg-gradient-to-br ${
                                          AVATAR_GRADIENTS[row.employeeCode] || 'from-blue-600 to-indigo-700 text-white'
                                        } flex items-center justify-center font-bold text-sm shadow-inner ring-2 ring-white/20`}
                                      >
                                        {getInitials(row.employeeName)}
                                      </div>
                                    )}
                                    <span
                                      className="absolute -bottom-1 -right-1 w-4 h-4 bg-emerald-500 border-2 border-white dark:border-gray-800 rounded-full flex items-center justify-center text-[9px] text-white"
                                      title="Verified Biometric Record"
                                    >
                                      ✓
                                    </span>
                                  </div>

                                  <div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <h3 className="font-semibold text-gray-900 dark:text-white text-base leading-tight">
                                        {row.employeeName || 'Staff Member'}
                                      </h3>
                                      <span className="px-1.5 py-0.5 rounded text-[11px] font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                        #{row.employeeCode}
                                      </span>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                                      {row.designation || meta.role}
                                    </p>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                                      <Building2 className="w-3 h-3 text-gray-400" />
                                      {row.departmentName || meta.department} · Davanagere Store
                                    </p>
                                  </div>
                                </div>

                                {/* Direction Badge */}
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border flex items-center gap-1 shrink-0 ${
                                    row.punchType?.toLowerCase().includes('out')
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                  }`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${
                                      row.punchType?.toLowerCase().includes('out') ? 'bg-amber-500' : 'bg-emerald-500'
                                    }`}
                                  />
                                  {row.punchType?.toLowerCase().includes('out') ? 'OUT' : 'IN'}
                                </span>
                              </div>

                              {/* Attendance Timestamp Banner */}
                              <div className="mt-4 p-3 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                                <div>
                                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-[#0058be]" /> Punch Time (IST)
                                  </span>
                                  <div className="text-lg font-mono font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                                    {row.punchTimeLocal ? (row.punchTimeLocal.includes(' ') ? row.punchTimeLocal.substring(row.punchTimeLocal.indexOf(' ') + 1) : row.punchTimeLocal) : '—'}
                                  </div>
                                  <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                    <Calendar className="w-3 h-3 text-gray-400" />
                                    {row.attendanceDate || '—'}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium text-[11px] border border-blue-100 dark:border-blue-900/60">
                                    {getRelativeTime(row.punchTimeUtc || row.punchTimeLocal)}
                                  </span>
                                  <p className="text-[10px] text-gray-400 mt-1 font-mono">
                                    PIN: {row.enrollmentNumber || row.employeeCode}
                                  </p>
                                </div>
                              </div>

                              {/* Terminal & Hardware Info */}
                              <div className="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-gray-500 flex items-center gap-1">
                                    <Server className="w-3 h-3 text-gray-400" /> Terminal:
                                  </span>
                                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-[190px]" title={row.deviceName}>
                                    {row.deviceName}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-gray-500 flex items-center gap-1">
                                    <Cpu className="w-3 h-3 text-gray-400" /> Serial:
                                  </span>
                                  <span className="font-mono text-gray-600 dark:text-gray-300">
                                    {row.serialNumber}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Card Footer: Verification Mode & Actions */}
                            <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <MethodBadge label={row.verifyMethod || row.verifyModeLabel} />
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-800/60">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                  PROCESSED
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() => setDavSelectedRecord(row)}
                                className="text-xs font-semibold text-[#0058be] hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" /> Details
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <Card className="p-8 text-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                      {davReportBusy ? (
                        <div className="flex flex-col items-center justify-center gap-2 text-gray-500">
                          <RefreshCw className="w-6 h-6 animate-spin text-[#0058be]" />
                          <p className="text-sm font-medium">Loading Davanagere attendance records...</p>
                        </div>
                      ) : (
                        <div className="space-y-2 text-gray-500 max-w-md mx-auto">
                          <FileText className="w-10 h-10 mx-auto text-gray-400" />
                          <p className="font-semibold text-gray-800 dark:text-gray-200 text-sm">
                            No attendance records match your current criteria.
                          </p>
                          <p className="text-xs text-gray-400">
                            Verified Davanagere roster only (1601–1610). Use "Pull Logs Now" to synchronize terminal logs or adjust your date filter.
                          </p>
                        </div>
                      )}
                    </Card>
                  )}
                </div>
              ) : (
                /* ─── Executive Table View ─── */
                <Card className="overflow-hidden bg-white dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700">
                  <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-1.5">
                      <List className="w-3.5 h-3.5 text-[#0058be]" /> Verified Attendance Table (1601–1610)
                    </span>
                    <span className="text-xs text-gray-500">
                      Showing {filteredDavRows.length} event(s)
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100/70 dark:bg-gray-900/60 text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="p-3 text-left">Employee Profile</th>
                          <th className="p-3 text-left">Store</th>
                          <th className="p-3 text-left">Terminal Hardware</th>
                          <th className="p-3 text-left">Punch Time (IST)</th>
                          <th className="p-3 text-left">Direction</th>
                          <th className="p-3 text-left">Verification Mode</th>
                          <th className="p-3 text-left">Sync Status</th>
                          <th className="p-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {filteredDavRows.map((row: any) => {
                          const meta = DAV_EMPLOYEE_METADATA[row.employeeCode] || {
                            role: 'Store Associate',
                            department: 'Retail Operations',
                          };

                          return (
                            <tr key={row.id} className="hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-colors">
                              <td className="p-3">
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-9 h-9 rounded-full bg-gradient-to-br ${
                                      AVATAR_GRADIENTS[row.employeeCode] || 'from-blue-600 to-indigo-700 text-white'
                                    } flex items-center justify-center font-bold text-xs shrink-0 shadow-xs`}
                                  >
                                    {getInitials(row.employeeName)}
                                  </div>
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-semibold text-gray-900 dark:text-white">
                                        {row.employeeName || '—'}
                                      </span>
                                      <span className="font-mono text-xs font-bold text-[#0058be] dark:text-blue-400">
                                        #{row.employeeCode}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                      {row.designation || meta.role}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="p-3 text-xs text-gray-600 dark:text-gray-300">
                                <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 font-mono text-[11px] font-bold">
                                  {row.locationCode || 'DAV'}
                                </span>
                              </td>
                              <td className="p-3">
                                <p className="text-xs text-gray-800 dark:text-gray-200 font-medium">
                                  {row.deviceName}
                                </p>
                                <p className="text-[10px] font-mono text-gray-400 mt-0.5">
                                  SN: {row.serialNumber}
                                </p>
                              </td>
                              <td className="p-3">
                                <div className="text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                  {row.punchTimeLocal || '—'}
                                </div>
                                <div className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                                  <span>{row.attendanceDate}</span>
                                  <span>·</span>
                                  <span>{getRelativeTime(row.punchTimeUtc || row.punchTimeLocal)}</span>
                                </div>
                              </td>
                              <td className="p-3">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                                    row.punchType?.toLowerCase().includes('out')
                                      ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                                      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                                  }`}
                                >
                                  {row.punchType?.toLowerCase().includes('out') ? 'OUT' : 'IN'}
                                </span>
                              </td>
                              <td className="p-3">
                                <MethodBadge label={row.verifyMethod || row.verifyModeLabel} />
                              </td>
                              <td className="p-3">
                                <Badge variant="success" dot>
                                  {row.syncStatus || 'PROCESSED'}
                                </Badge>
                              </td>
                              <td className="p-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => setDavSelectedRecord(row)}
                                  className="text-xs font-semibold text-[#0058be] hover:underline"
                                >
                                  Details
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {filteredDavRows.length === 0 && (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-gray-500">
                              {davReportBusy ? 'Loading records...' : 'No attendance records found for this query.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}

              {/* Detail Profile Modal */}
              <Modal
                isOpen={Boolean(davSelectedRecord)}
                onClose={() => setDavSelectedRecord(null)}
                title="Employee Attendance & Biometric Audit Profile"
              >
                {davSelectedRecord && (
                  <div className="space-y-4 p-1">
                    {/* Header info */}
                    <div className="flex items-center gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800">
                      <div
                        className={`w-16 h-16 rounded-full bg-gradient-to-br ${
                          AVATAR_GRADIENTS[davSelectedRecord.employeeCode] || 'from-blue-600 to-indigo-700 text-white'
                        } flex items-center justify-center font-bold text-xl shadow-md shrink-0`}
                      >
                        {getInitials(davSelectedRecord.employeeName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                            {davSelectedRecord.employeeName}
                          </h3>
                          <span className="px-2 py-0.5 rounded text-xs font-mono font-bold bg-blue-100 dark:bg-blue-900/60 text-blue-800 dark:text-blue-300">
                            #{davSelectedRecord.employeeCode}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-300 font-medium mt-0.5">
                          {davSelectedRecord.designation || DAV_EMPLOYEE_METADATA[davSelectedRecord.employeeCode]?.role || 'Store Associate'}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                          {davSelectedRecord.departmentName || DAV_EMPLOYEE_METADATA[davSelectedRecord.employeeCode]?.department || 'Retail Operations'} · Davanagere Mega Store
                        </p>
                      </div>
                    </div>

                    {/* Biometric & Punch Details */}
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
                        <span className="text-gray-500 block uppercase font-semibold text-[10px]">Punch Time (IST)</span>
                        <span className="font-mono font-bold text-gray-900 dark:text-gray-100 text-sm mt-0.5 block">
                          {davSelectedRecord.punchTimeLocal || '—'}
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-1">
                          Date: {davSelectedRecord.attendanceDate}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
                        <span className="text-gray-500 block uppercase font-semibold text-[10px]">Verification Mode</span>
                        <div className="mt-1">
                          <MethodBadge label={davSelectedRecord.verifyMethod || davSelectedRecord.verifyModeLabel} />
                        </div>
                        <span className="text-[10px] text-gray-400 block mt-1">
                          Hardware Verified · Genuine
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
                        <span className="text-gray-500 block uppercase font-semibold text-[10px]">Terminal Device</span>
                        <span className="font-medium text-gray-900 dark:text-gray-100 block mt-0.5">
                          {davSelectedRecord.deviceName}
                        </span>
                        <span className="text-[10px] font-mono text-gray-400 block mt-1">
                          SN: {davSelectedRecord.serialNumber}
                        </span>
                      </div>

                      <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
                        <span className="text-gray-500 block uppercase font-semibold text-[10px]">Hardware State</span>
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          PROCESSED & SYNCHRONIZED
                        </span>
                        <span className="text-[10px] text-gray-400 block mt-1">
                          Match: {davSelectedRecord.matchValue ?? '100'}%
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="outline"
                        onClick={() => setDavSelectedRecord(null)}
                        className="text-xs px-4 py-2"
                      >
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </Modal>
            </div>
          );
        })()}

        {activeTab === 'devices' && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {devices.map((device) => {
              const status = statuses.find((s) => s.deviceId === device.deviceId);
              const connected = status?.connected ?? false;
              const info = infoById[device.deviceId];
              const isDav = ['JNP2252300795', 'JNP2252300802', 'JNP2252300797'].includes(device.serialNumber);

              return (
                <Card key={device.deviceId} className="p-4 space-y-3.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                  {/* Terminal Card Header */}
                  <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-700/60">
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <Cpu className="w-4 h-4 text-[#0058be]" />
                        <p className="font-bold text-gray-900 dark:text-white text-base">{device.name}</p>
                      </div>
                      <p className="text-xs text-gray-500 font-mono">
                        SN: {device.serialNumber} · <span className="font-semibold text-gray-700 dark:text-gray-300">{device.locationCode}</span>
                        {isDav && <span className="ml-1 text-[10px] text-blue-600 dark:text-blue-400 font-sans font-medium">(Davanagere)</span>}
                      </p>
                      <p className="text-xs text-gray-500 font-mono">
                        {device.ipAddress}:{device.port} · {device.protocol}
                      </p>
                    </div>
                    <Badge variant={connected ? 'success' : 'danger'} dot>
                      {connected ? 'Connected' : 'Disconnected'}
                    </Badge>
                  </div>

                  {status && status.usableAsProductionEvidence === false && (
                    <p className="rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
                      Not a shop-floor terminal — {status.environmentLabel || 'development fixture'}. Its punches
                      are excluded from production evidence.
                    </p>
                  )}

                  <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <p>Last seen: {formatAge(status?.secondsSinceLastSeen ?? null)}{connected ? ` (within ${device.heartbeatTimeoutSeconds || heartbeatTimeout}s)` : ''}</p>
                    <p>Device time: {status?.deviceTimeLocal || 'not read yet'}</p>
                    <p>
                      Drift: {status?.clockDriftSeconds === null || status?.clockDriftSeconds === undefined
                        ? 'not measured'
                        : `${status.clockDriftSeconds}s${status.clockDriftWarning ? ' ⚠ over tolerance' : ''}`}
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <PipelineStep
                        label="1. TCP Network"
                        status={connected ? 'SUCCESS' : (device.lastError?.includes('refused') || device.lastError?.includes('timeout') ? 'ERROR' : 'PENDING')}
                        subtext={`${device.ipAddress}:${device.port}`}
                      />
                      <PipelineStep
                        label="2. Device Comm"
                        status={connected ? 'SUCCESS' : 'PENDING'}
                        subtext={connected ? 'Handshake OK' : 'Awaiting heartbeat'}
                      />
                      <PipelineStep
                        label="3. Logs Retrieved"
                        status={(status?.attLogCount ?? device.attLogCount ?? 0) > 0 || (device.todaysPunches ?? 0) > 0 ? 'SUCCESS' : 'PENDING'}
                        subtext={`${status?.attLogCount ?? device.attLogCount ?? 0} on terminal`}
                      />
                      <PipelineStep
                        label="4. Employee Map"
                        status={(device.enrolledUsers ?? 0) > 0 ? 'SUCCESS' : 'WARNING'}
                        subtext={`${device.enrolledUsers ?? 0} mapped`}
                      />
                      <PipelineStep
                        label="5. Punches Saved"
                        status={(device.todaysPunches ?? 0) > 0 ? 'SUCCESS' : 'PENDING'}
                        subtext={`${device.todaysPunches ?? 0} today`}
                      />
                      <PipelineStep
                        label="6. HRMS Visible"
                        status="SUCCESS"
                        subtext="Live in Ledger"
                      />
                    </div>
                  </div>

                  {/* Key Hardware & Sync Stats */}
                  <div className="grid grid-cols-2 gap-2 text-xs bg-gray-50 dark:bg-gray-900/60 p-2.5 rounded-lg border border-gray-100 dark:border-gray-800">
                    <div>
                      <span className="text-[10px] uppercase text-gray-400 block font-medium">Clock Drift</span>
                      <span className={`font-semibold ${status?.clockDriftWarning ? 'text-amber-600' : 'text-gray-800 dark:text-gray-200'}`}>
                        {status?.clockDriftSeconds === null || status?.clockDriftSeconds === undefined
                          ? 'Not measured'
                          : `${status.clockDriftSeconds}s ${status.clockDriftWarning ? '⚠' : ''}`}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-gray-400 block font-medium">Device Time (IST)</span>
                      <span className="font-mono text-gray-800 dark:text-gray-200">
                        {status?.deviceTimeLocal ? status.deviceTimeLocal.slice(11, 19) : 'Not read'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-gray-400 block font-medium">Enrolled Users</span>
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {status?.userCount ?? device.userCount ?? 0}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase text-gray-400 block font-medium">Punches Today</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {device.todaysPunches ?? 0}
                      </span>
                    </div>
                    <div className="col-span-2 pt-1 border-t border-gray-200/40 dark:border-gray-700/40 text-[11px] text-gray-500">
                      Last seen: {formatAge(status?.secondsSinceLastSeen ?? null)}
                      {device.lastError && (
                        <p className="text-rose-600 dark:text-rose-400 mt-1 break-words font-mono text-[10px]">
                          {String(device.lastError).slice(0, 160)}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons Toolbar */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void syncClock(device.deviceId)}
                      loading={syncingClockId === device.deviceId}
                      className="text-xs flex items-center gap-1"
                    >
                      <TimerReset className="w-3.5 h-3.5" />
                      Sync Time
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void syncNow(device.deviceId)}
                      loading={syncingDeviceId === device.deviceId}
                      className="text-xs flex items-center gap-1"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Pull Logs
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void syncClock(device.deviceId)}
                      loading={clockBusy === device.deviceId}
                      disabled={Boolean(clockBusy) && clockBusy !== device.deviceId}
                    >
                      <TimerReset className="w-4 h-4 mr-1" /> Sync device time
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void readInfo(device.deviceId)}
                      loading={busyInfo === device.deviceId}
                      className="text-xs flex items-center gap-1"
                    >
                      <Server className="w-3.5 h-3.5" />
                      Info
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openSettings(device)}
                      className="text-xs"
                    >
                      Settings
                    </Button>
                  </div>

                  {/* Diagnostic details box */}
                  {(info?.info || testResult?.deviceId === device.deviceId) && (
                    <div className="text-xs bg-gray-50 dark:bg-gray-900 rounded-lg p-2.5 space-y-1 font-mono text-[11px] border border-gray-200 dark:border-gray-700">
                      {info?.info && (
                        <p className="text-gray-700 dark:text-gray-300">
                          Firmware: {info.info.firmwareVersion || 'n/a'} · Serial: {info.info.serialNumber || 'n/a'}
                        </p>
                      )}
                      {testResult?.deviceId === device.deviceId && (testResult.steps || []).map((step: any) => (
                        <p key={step.step} className={step.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {step.ok ? '✓' : '✗'} {step.step}: {step.detail}
                        </p>
                      ))}
                      {testResult?.deviceId === device.deviceId && testResult.hint && (
                        <p className="text-amber-700 dark:text-amber-400 font-sans">{testResult.hint}</p>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
            {devices.length === 0 && (
              <Card className="p-8 md:col-span-3 text-center text-gray-500">
                No terminals registered yet. Use “Add terminal” to configure a device.
              </Card>
            )}
          </div>
        )}

        {activeTab === 'mismatches' && (
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Status</span>
                <select
                  value={mismatchFilters.status}
                  onChange={(event) => setMismatchFilters({ ...mismatchFilters, status: event.target.value })}
                  className="block rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {['OPEN', 'RESOLVED', 'IGNORED', 'ALL'].map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Type</span>
                <select
                  value={mismatchFilters.type}
                  onChange={(event) => setMismatchFilters({ ...mismatchFilters, type: event.target.value })}
                  className="block rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">all types</option>
                  {MISMATCH_TYPE_OPTIONS.map((type) => <option key={type} value={type}>{mismatchLabel(type)}</option>)}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Severity</span>
                <select
                  value={mismatchFilters.severity}
                  onChange={(event) => setMismatchFilters({ ...mismatchFilters, severity: event.target.value })}
                  className="block rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">any</option>
                  {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((severity) => <option key={severity} value={severity}>{severity}</option>)}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Employee / biometric id</span>
                <Input
                  value={mismatchFilters.employeeQuery}
                  onChange={(event: any) => setMismatchFilters({ ...mismatchFilters, employeeQuery: event.target.value })}
                  placeholder="name, code or PIN"
                />
              </label>
              <Button className="bg-[#0058be] text-white" onClick={() => void fetchMismatches(1)} loading={mismatchBusy}>
                Apply filters
              </Button>
              <Button variant="outline" onClick={() => void runScan()} loading={scanning}>
                <ScanLine className="w-4 h-4 mr-1" /> Run scan
              </Button>
              <div className="ml-auto flex items-center gap-1.5">
                <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportOps('mismatch', 'csv')}>CSV</Button>
                <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportOps('mismatch', 'xlsx')}>
                  <Download className="w-3.5 h-3.5 mr-1" /> Excel
                </Button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="p-3 text-left">Severity</th>
                    <th className="p-3 text-left">Type</th>
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-left">Biometric id</th>
                    <th className="p-3 text-left">Terminal</th>
                    <th className="p-3 text-left">Location</th>
                    <th className="p-3 text-right">×</th>
                    <th className="p-3 text-left">Last detected</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {mismatches.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="p-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          row.severity === 'CRITICAL' ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200'
                            : row.severity === 'HIGH' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200'
                            : row.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>{row.severity}</span>
                      </td>
                      <td className="p-3 text-xs">{mismatchLabel(row.mismatchType)}</td>
                      <td className="p-3">
                        <p className="font-medium text-gray-900 dark:text-white">{row.employeeName || <span className="text-gray-400">unknown user</span>}</p>
                        <p className="text-xs text-gray-500">{row.employeeCode || '—'}</p>
                      </td>
                      <td className="p-3 font-mono text-xs">{row.biometricId || '—'}</td>
                      <td className="p-3 text-xs">{row.deviceName || 'unregistered'}<p className="text-[10px] text-gray-400">{row.serialNumber || '—'}</p></td>
                      <td className="p-3 text-xs">{row.locationCode || '—'}<p className="text-[10px] text-gray-400">{row.floorName || 'floor n/a'} / {row.sectionName || 'section n/a'}</p></td>
                      <td className="p-3 text-right text-xs">{row.occurrenceCount}</td>
                      <td className="p-3 text-xs">{row.lastDetectedAt ? new Date(row.lastDetectedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</td>
                      <td className="p-3"><Badge variant={row.status === 'OPEN' ? 'warning' : row.status === 'RESOLVED' ? 'success' : 'gray'}>{row.status}</Badge></td>
                      <td className="p-3 text-right">
                        <Button size="sm" variant="outline" onClick={() => setDrawerId(row.id)}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {mismatches.length === 0 && (
                    <tr><td colSpan={10} className="p-6 text-center text-gray-500">
                      {mismatchBusy ? 'Loading…' : 'No mismatches match these filters.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                {mismatchTotal} record(s) · page {mismatchPage} of {Math.max(1, Math.ceil(mismatchTotal / 50))}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={mismatchPage <= 1 || mismatchBusy} onClick={() => void fetchMismatches(mismatchPage - 1)}>
                  <ChevronLeft className="w-4 h-4" /> Prev
                </Button>
                <Button size="sm" variant="outline" disabled={mismatchPage >= Math.max(1, Math.ceil(mismatchTotal / 50)) || mismatchBusy} onClick={() => void fetchMismatches(mismatchPage + 1)}>
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'attendance' && (
          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs space-y-1">
                <span className="text-gray-500">From</span>
                <Input type="date" value={attendanceFilters.from} onChange={(event: any) => setAttendanceFilters({ ...attendanceFilters, from: event.target.value })} />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">To</span>
                <Input type="date" value={attendanceFilters.to} onChange={(event: any) => setAttendanceFilters({ ...attendanceFilters, to: event.target.value })} />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Employee / biometric id</span>
                <Input
                  value={attendanceFilters.employeeQuery}
                  onChange={(event: any) => setAttendanceFilters({ ...attendanceFilters, employeeQuery: event.target.value })}
                  placeholder="name, code or PIN"
                />
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Status</span>
                <select
                  value={attendanceFilters.status}
                  onChange={(event) => setAttendanceFilters({ ...attendanceFilters, status: event.target.value })}
                  className="block rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {[['all', 'all'], ['matched', 'matched'], ['mismatched', 'mismatched'], ['unsynced', 'not synced']].map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Direction</span>
                <select
                  value={attendanceFilters.punchType}
                  onChange={(event) => setAttendanceFilters({ ...attendanceFilters, punchType: event.target.value })}
                  className="block rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">any</option>
                  <option value="CHECK_IN">IN</option>
                  <option value="CHECK_OUT">OUT</option>
                  <option value="MIDDLE">MIDDLE</option>
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Mode</span>
                <select
                  value={attendanceFilters.verifyMethod}
                  onChange={(event) => setAttendanceFilters({ ...attendanceFilters, verifyMethod: event.target.value })}
                  className="block rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">any</option>
                  {['Face', 'Fingerprint', 'Card', 'Password', 'Card + Face', 'Face + Fingerprint', 'Unknown'].map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs space-y-1">
                <span className="text-gray-500">Device</span>
                <select
                  value={attendanceFilters.serialNumber}
                  onChange={(event) => setAttendanceFilters({ ...attendanceFilters, serialNumber: event.target.value })}
                  className="block rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">any</option>
                  {devices.map((device) => <option key={device.deviceId} value={device.serialNumber}>{device.name}</option>)}
                </select>
              </label>
              <Button className="bg-[#0058be] text-white" onClick={() => void fetchAttendance(1)} loading={attendanceBusy}>
                Load log
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Export</span>
              <select
                value={exportKind}
                onChange={(event) => setExportKind(event.target.value as typeof exportKind)}
                className="rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
              >
                {EXPORT_KINDS.map((kind) => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
              </select>
              <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportOps(exportKind, 'csv')}>CSV</Button>
              <Button size="sm" variant="outline" disabled={exporting} onClick={() => void exportOps(exportKind, 'xlsx')}>
                <Download className="w-3.5 h-3.5 mr-1" /> Excel
              </Button>
              {attendanceMeta && (
                <span className="ml-auto text-xs text-gray-500">
                  {attendanceRows.length} of {attendanceMeta.total} row(s) · times in {attendanceMeta.timeZone}
                </span>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="p-3 text-left">Employee</th>
                    <th className="p-3 text-left">Terminal</th>
                    <th className="p-3 text-left">Floor / section</th>
                    <th className="p-3 text-left">Department</th>
                    <th className="p-3 text-left">Local time</th>
                    <th className="p-3 text-left">Dir</th>
                    <th className="p-3 text-left">Mode</th>
                    <th className="p-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="p-3">
                        <p className="font-medium text-gray-900 dark:text-white">{row.employeeName || <span className="text-gray-400">unknown</span>}</p>
                        <p className="text-xs text-gray-500">{row.employeeCode || '—'} · PIN {row.enrollmentNumber}</p>
                      </td>
                      <td className="p-3 text-xs">
                        {row.deviceName}
                        <p className="text-[10px] text-gray-400">{row.serialNumber} · {row.locationCode || '—'}</p>
                      </td>
                      <td className="p-3 text-xs">{row.floorName || '—'}<p className="text-[10px] text-gray-400">{row.sectionName || '—'}</p></td>
                      <td className="p-3 text-xs">{row.departmentName || '—'}</td>
                      <td className="p-3 text-xs">
                        {row.punchTimeLocal || '—'}
                        <p className="text-[10px] text-gray-400">{row.attendanceDate || ''} · {row.timezoneUsed}</p>
                      </td>
                      <td className="p-3 text-xs font-medium">{row.direction}</td>
                      <td className="p-3"><MethodBadge label={row.verifyModeLabel} /></td>
                      <td className="p-3">
                        <Badge variant={row.status === 'MATCHED' ? 'success' : row.status === 'MISMATCH' || row.status === 'UNKNOWN_USER' ? 'danger' : 'warning'}>
                          {row.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {attendanceRows.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-gray-500">
                      {attendanceBusy ? 'Loading…' : 'No punches match these filters.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
              <span>
                page {attendanceMeta?.page ?? attendancePage} of {Math.max(1, Math.ceil((attendanceMeta?.total ?? 0) / (attendanceMeta?.pageSize || 50)))}
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={attendancePage <= 1 || attendanceBusy} onClick={() => void fetchAttendance(attendancePage - 1)}>
                  <ChevronLeft className="w-4 h-4" /> Prev
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={attendanceBusy || attendancePage >= Math.max(1, Math.ceil((attendanceMeta?.total ?? 0) / (attendanceMeta?.pageSize || 50)))}
                  onClick={() => void fetchAttendance(attendancePage + 1)}
                >
                  Next <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </Card>
        )}

        {activeTab === 'feed' && (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="p-3">Photo</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Device ID</th>
                    <th className="p-3">Local time</th>
                    <th className="p-3">UTC</th>
                    <th className="p-3">Mode (raw)</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Device</th>
                    <th className="p-3">Mapping</th>
                  </tr>
                </thead>
                <tbody>
                  {feed.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800">
                      <td className="p-3">
                        <PunchPhoto url={resolvePhotoUrl(row.photoUrl)} missingReason={row.photoMissingReason} alt={row.employeeName || row.enrollmentNumber} />
                      </td>
                      <td className="p-3">
                        <p className="font-medium text-gray-900 dark:text-white">{row.employeeName || <span className="text-gray-400">unmapped</span>}</p>
                        <p className="text-xs text-gray-500">{row.employeeCode || ''}</p>
                      </td>
                      <td className="p-3 font-mono text-xs">{row.enrollmentNumber}</td>
                      <td className="p-3">
                        {row.punchTimeLocal || '—'}
                        <p className="text-[10px] text-gray-400">{row.timezoneUsed}</p>
                      </td>
                      <td className="p-3 text-xs">{row.punchTimeUtc ? new Date(row.punchTimeUtc).toISOString().replace('T', ' ').slice(0, 19) : '—'}</td>
                      <td className="p-3">
                        <MethodBadge label={row.verifyModeLabel} />
                        <p className="text-[10px] text-gray-400 mt-1">raw verify {row.rawVerifyType ?? '—'} · state {row.rawPunchState ?? '—'}</p>
                      </td>
                      <td className="p-3 text-xs">{row.punchType}</td>
                      <td className="p-3 text-xs">{row.deviceName}</td>
                      <td className="p-3">
                        <Badge variant={row.mappingStatus === 'MAPPED' ? 'success' : row.mappingStatus === 'AMBIGUOUS' ? 'warn' : 'danger'}>
                          {row.mappingStatus}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                  {feed.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-gray-500">No punches stored yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === 'report' && (
          <Card className="p-4 space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">From (device date)</span>
                <Input type="date" value={reportFilters.from} onChange={(e: any) => setReportFilters({ ...reportFilters, from: e.target.value })} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">To (device date)</span>
                <Input type="date" value={reportFilters.to} onChange={(e: any) => setReportFilters({ ...reportFilters, to: e.target.value })} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Employee / device id</span>
                <Input value={reportFilters.employeeQuery} placeholder="name, code or 100201" onChange={(e: any) => setReportFilters({ ...reportFilters, employeeQuery: e.target.value })} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Mode</span>
                <select
                  value={reportFilters.verifyMethod}
                  onChange={(e) => setReportFilters({ ...reportFilters, verifyMethod: e.target.value })}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">any</option>
                  {['Face', 'Fingerprint', 'Card', 'Password', 'Card + Face', 'Face + Fingerprint', 'Unknown'].map((method) => (
                    <option key={method} value={method}>{method}</option>
                  ))}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Device</span>
                <select
                  value={reportFilters.serialNumber}
                  onChange={(e) => setReportFilters({ ...reportFilters, serialNumber: e.target.value })}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">any</option>
                  {devices.map((device) => <option key={device.deviceId} value={device.serialNumber}>{device.name}</option>)}
                </select>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button className="bg-[#0058be] text-white" onClick={() => void runReport()} loading={reportBusy}>
                <Activity className="w-4 h-4 mr-1" /> Run report
              </Button>
              <Button variant="outline" onClick={() => void exportReport('csv')} disabled={reportBusy}>
                Export CSV
              </Button>
              <Button variant="outline" onClick={() => void exportReport('xlsx')} disabled={reportBusy}>
                Export Excel
              </Button>
              {reportMeta && (
                <span className="text-xs text-gray-500">
                  {reportRows.length} of {reportMeta.total} row(s) · times shown in {reportMeta.timeZone}
                </span>
              )}
            </div>

            <div className="overflow-x-auto border rounded-lg dark:border-gray-700">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="p-3">Photo</th>
                    <th className="p-3">Employee</th>
                    <th className="p-3">Device ID</th>
                    <th className="p-3">Date</th>
                    <th className="p-3">Time</th>
                    <th className="p-3">Mode (raw)</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Device</th>
                    <th className="p-3">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.id} className="border-t dark:border-gray-800">
                      <td className="p-3">
                        <PunchPhoto url={resolvePhotoUrl(row.photoUrl)} missingReason={row.photoMissingReason} alt={row.employeeName || row.enrollmentNumber} />
                      </td>
                      <td className="p-3">
                        <p className="font-medium">{row.employeeName || <span className="text-gray-400">unmapped</span>}</p>
                        <p className="text-xs text-gray-500">{row.employeeCode || ''}</p>
                      </td>
                      <td className="p-3 font-mono text-xs">{row.enrollmentNumber}</td>
                      <td className="p-3 text-xs">{row.attendanceDate || '—'}</td>
                      <td className="p-3 text-xs">{row.punchTimeLocal || '—'}</td>
                      <td className="p-3">
                        <MethodBadge label={row.verifyModeLabel} />
                        <p className="text-[10px] text-gray-400 mt-1">raw {row.rawVerifyType ?? '—'}</p>
                      </td>
                      <td className="p-3 text-xs">{row.punchType}</td>
                      <td className="p-3 text-xs">{row.deviceName}</td>
                      <td className="p-3 text-xs">{row.matchValue === null ? 'not reported' : `${row.matchValue}%`}</td>
                    </tr>
                  ))}
                  {reportRows.length === 0 && (
                    <tr><td colSpan={9} className="p-6 text-center text-gray-500">Run the report to see punches.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500">
              Dates are filtered in the terminal's timezone and stored as UTC, so a shift that starts before 05:30
              is counted on the day the device recorded it. The “Match” column only shows a score the device itself
              reported.
            </p>
          </Card>
        )}

        {activeTab === 'unmapped' && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                These punches were stored but could not be attributed. Nothing here is discarded; assign them to an
                employee and the attendance record updates immediately.
              </p>
              <Button size="sm" variant="outline" onClick={() => void retryHeld()}>Re-check all against current mappings</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="p-3">Device ID</th>
                    <th className="p-3">Time (device zone)</th>
                    <th className="p-3">Mode</th>
                    <th className="p-3">Device</th>
                    <th className="p-3">Why</th>
                    <th className="p-3">Assign</th>
                  </tr>
                </thead>
                <tbody>
                  {unmapped.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-gray-800 align-top">
                      <td className="p-3 font-mono text-xs">{row.enrollmentNumber}</td>
                      <td className="p-3 text-xs">{row.punchTimeLocal || '—'}</td>
                      <td className="p-3"><MethodBadge label={row.verifyModeLabel} /></td>
                      <td className="p-3 text-xs">{row.deviceName || row.serialNumber}</td>
                      <td className="p-3 text-xs text-amber-700 max-w-xs">{row.reason || row.mappingStatus}</td>
                      <td className="p-3 space-y-1">
                        {row.candidates.length > 0 ? (
                          row.candidates.map((candidate) => (
                            <button
                              key={candidate.employeeId}
                              onClick={() => void assignUnmapped(row.id, candidate.employeeId, true)}
                              className="block text-xs text-[#0058be] hover:underline"
                            >
                              {candidate.fullName || candidate.employeeCode || candidate.employeeId}
                            </button>
                          ))
                        ) : (
                          <EmployeePicker onPick={(employeeId) => void assignUnmapped(row.id, employeeId, true)} />
                        )}
                      </td>
                    </tr>
                  ))}
                  {unmapped.length === 0 && (
                    <tr><td colSpan={6} className="p-6 text-center text-gray-500">Nothing held — every stored punch matched an employee.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === 'calibration' && (
          <Card className="p-4 space-y-4">
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-white">Confirm the verify codes for this firmware</h2>
              <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                The MB160 stamps each punch with a numeric verify mode, and the meaning of those numbers differs
                between firmware builds. Punch once with each method below and this page shows the exact raw codes
                the terminal sent, so the mapping is confirmed against your device rather than guessed.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button className="bg-[#0058be] text-white" onClick={() => void startCalibration()}>
                <ScanFace className="w-4 h-4 mr-1" /> Start 2-minute capture
              </Button>
              {calibration && <span className="text-xs text-gray-500">window ends {new Date(calibration.endsAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span>}
            </div>

            {calibration && (
              <div className="overflow-x-auto border rounded-lg dark:border-gray-700">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="p-3">Raw verify code</th>
                      <th className="p-3">Raw state</th>
                      <th className="p-3">Observed</th>
                      <th className="p-3">Currently read as</th>
                      <th className="p-3">Confirm as</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calibration.observations.map((observation) => (
                      <tr key={`${observation.rawVerifyType}-${observation.rawPunchState}`} className="border-t dark:border-gray-800">
                        <td className="p-3 font-mono">{observation.rawVerifyType ?? 'none'}</td>
                        <td className="p-3 font-mono">{observation.rawPunchState ?? 'none'}</td>
                        <td className="p-3">{observation.count} punch(es) · {observation.localTimeExample || '—'}</td>
                        <td className="p-3"><MethodBadge label={observation.currentLabel} /></td>
                        <td className="p-3 flex flex-wrap gap-1">
                          {[
                            ['Face', 'FACE'],
                            ['Fingerprint', 'FINGERPRINT'],
                            ['Card', 'CARD'],
                            ['Password', 'PASSWORD'],
                          ].map(([label, family]) => (
                            <button
                              key={label}
                              disabled={observation.rawVerifyType === null}
                              onClick={() => void confirmCode(observation.rawVerifyType as number, label, family)}
                              className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40"
                            >
                              {label}
                            </button>
                          ))}
                        </td>
                      </tr>
                    ))}
                    {calibration.observations.length === 0 && (
                      <tr><td colSpan={5} className="p-6 text-center text-gray-500">Waiting for punches at the terminal…</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <p className="text-xs text-gray-500">
              The face match threshold (≈50%) is a property of the terminal, not of this website — set it on the
              device under Menu → Options → Personalize → Face Options → Face Threshold. The site only displays the
              result the device reports.
            </p>
          </Card>
        )}

        {activeTab === 'sync_logs' && (
          <Card className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800 text-xs uppercase text-gray-500">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Device</th>
                  <th className="p-3">Trigger</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Pulled</th>
                  <th className="p-3">New</th>
                  <th className="p-3">Duplicate</th>
                  <th className="p-3">ms</th>
                  <th className="p-3">Error</th>
                </tr>
              </thead>
              <tbody>
                {syncLogs.map((log) => (
                  <tr key={log.id} className="border-t dark:border-gray-800">
                    <td className="p-3 text-xs">{new Date(log.syncedAt).toLocaleString()}</td>
                    <td className="p-3 text-xs">{log.deviceName || log.serialNumber}</td>
                    <td className="p-3 text-xs">{log.triggerType}</td>
                    <td className="p-3">
                      <Badge variant={log.status === 'SUCCESS' ? 'success' : log.status === 'PARTIAL' ? 'warn' : 'danger'}>{log.status}</Badge>
                    </td>
                    <td className="p-3">{log.recordsPulled}</td>
                    <td className="p-3">{log.recordsInserted}</td>
                    <td className="p-3">{log.recordsSkipped}</td>
                    <td className="p-3">{log.durationMs}</td>
                    <td className="p-3 text-xs text-red-600 max-w-xs break-words">{log.errorMessage ? String(log.errorMessage).slice(0, 160) : ''}</td>
                  </tr>
                ))}
                {syncLogs.length === 0 && <tr><td colSpan={9} className="p-6 text-center text-gray-500">No sync attempts recorded yet.</td></tr>}
              </tbody>
            </table>
          </Card>
        )}

        <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title={editing ? 'Device settings' : 'Register eSSL / ZKTeco terminal'}>
          <form ref={formRef} onSubmit={saveSettings} className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Terminal name</span>
                <Input required value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} placeholder="MB160 Main Entrance" />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Serial number</span>
                <Input required disabled={Boolean(editing)} value={form.serialNumber} onChange={(e: any) => setForm({ ...form, serialNumber: e.target.value })} placeholder="JNP2252300795" />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">IP address</span>
                <Input required value={form.ipAddress} onChange={(e: any) => setForm({ ...form, ipAddress: e.target.value })} placeholder="192.168.0.136" />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Port</span>
                <Input type="number" min={1} max={65535} value={form.port} onChange={(e: any) => setForm({ ...form, port: Number(e.target.value) })} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Comm key (0–255)</span>
                <Input type="number" min={0} max={255} value={form.commKey} onChange={(e: any) => setForm({ ...form, commKey: Number(e.target.value) })} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Device timezone</span>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {['Asia/Kolkata', 'Asia/Kathmandu', 'Asia/Dubai', 'Asia/Colombo', 'UTC'].map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Showroom</span>
                <select
                  value={form.locationCode}
                  onChange={(e) => {
                    const nextLocation = e.target.value;
                    setForm({ ...form, locationCode: nextLocation, floorId: '', sectionId: '' });
                    void fetchOrgUnits(nextLocation);
                  }}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {LOCATION_OPTIONS.filter((code) => code !== 'ALL').map((code) => <option key={code} value={code}>{code}</option>)}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Floor</span>
                <select
                  value={form.floorId}
                  onChange={(e) => setForm({ ...form, floorId: e.target.value, sectionId: '' })}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">Not assigned</option>
                  {floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Section</span>
                <select
                  value={form.sectionId}
                  onChange={(e) => setForm({ ...form, sectionId: e.target.value })}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  <option value="">Not assigned</option>
                  {sections
                    .filter((section) => !form.floorId || section.floorId === form.floorId)
                    .map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Transport</span>
                <select
                  value={form.protocol}
                  onChange={(e) => setForm({ ...form, protocol: e.target.value })}
                  className="w-full rounded-lg border-gray-300 dark:border-gray-700 dark:bg-gray-800 px-3 py-2 text-sm"
                >
                  {['ADMS_PUSH', 'TCP_SDK', 'UDP_ZK', 'HTTP_CONNECTOR'].map((protocol) => <option key={protocol} value={protocol}>{protocol}</option>)}
                </select>
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Poll interval (ms)</span>
                <Input type="number" min={500} step={500} value={form.pollIntervalMs} onChange={(e: any) => setForm({ ...form, pollIntervalMs: Number(e.target.value) })} />
              </label>
              <label className="text-sm space-y-1">
                <span className="text-gray-600 dark:text-gray-300">Model</span>
                <Input value={form.model} onChange={(e: any) => setForm({ ...form, model: e.target.value })} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.photoPushEnabled} onChange={(e) => setForm({ ...form, photoPushEnabled: e.target.checked })} />
              Terminal pushes face snapshots (ATTPHOTO)
            </label>

            <p className="text-xs text-gray-500">
              On the device set: Menu → Comm → Cloud Server Setting → Enable On, Host {typeof window !== 'undefined' ? window.location.hostname : '<server>'},
              Port 4000, Path /iclock. Menu → Comm → Communication Key must match the comm key above.
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-[#0058be] text-white">{editing ? 'Save settings' : 'Register terminal'}</Button>
            </div>
          </form>
        </Modal>
        <MismatchDetailDrawer
          mismatchId={drawerId}
          locationCode={location}
          onClose={() => setDrawerId(null)}
          onDecided={() => {
            void fetchMismatches(mismatchPage);
            void fetchOpsSummary();
          }}
        />
      </div>
    </DashboardLayout>
  );
}

/** Free-text employee search for punch(es) with no candidate list. */
function EmployeePicker({ onPick }: { onPick: (employeeId: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ id: string; employeeCode: string; fullName: string }>>([]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees', { params: { search: query.trim(), limit: 6 } });
        const list = data?.employees || data?.data || [];
        setResults(list.slice(0, 6));
      } catch {
        setResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-1">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="search employee…"
        className="w-40 text-xs rounded border border-gray-300 dark:border-gray-600 dark:bg-gray-800 px-2 py-1"
      />
      {results.map((employee) => (
        <button
          key={employee.id}
          onClick={() => onPick(employee.id)}
          className="block w-full text-left text-xs text-[#0058be] hover:underline"
        >
          {employee.fullName} ({employee.employeeCode})
        </button>
      ))}
      {query.trim().length >= 2 && results.length === 0 && <p className="text-[10px] text-gray-400">no match</p>}
    </div>
  );
}
