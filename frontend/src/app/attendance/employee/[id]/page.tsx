'use client';

import React, { useState, useEffect, useCallback, use } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Fingerprint,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Download,
  Building2,
  MapPin,
  Cpu,
  Wifi,
  ShieldCheck,
  ChevronRight,
  User,
  Sliders,
  Check,
  X,
  FileText,
  AlertCircle,
  Zap,
  Radio,
  Lock,
  ArrowRight,
  Eye,
  Info
} from 'lucide-react';
import Link from 'next/link';

interface PunchDetail {
  id: string;
  punchTime: string;
  timeFormatted: string;
  punchType: string;
  verifyMode: string;
  deviceSerialNumber: string;
  deviceName: string;
  syncStatus: string;
}

interface CorrectionRecord {
  id: string;
  attendanceDate: string;
  originalLogin?: string;
  originalLogout?: string;
  requestedLogin?: string;
  requestedLogout?: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requesterName?: string;
  reviewerName?: string;
  reviewNote?: string;
  createdAt: string;
}

interface DailyAttendanceRow {
  date: string;
  dayNumber: number;
  dayOfWeek: string;
  isSunday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  isFutureDate: boolean;
  inPunch: string | null;
  outPunch: string | null;
  allPunches: PunchDetail[];
  workingSeconds: number;
  workingHoursFormatted: string;
  breakSeconds: number;
  breakMinutesFormatted: string;
  status: string;
  statusLabel: string;
  lateMinutes: number;
  earlyDepartureMinutes: number;
  flags: string[];
  hasMissingPunches: boolean;
  corrections: CorrectionRecord[];
  hasPendingCorrection: boolean;
  hasApprovedCorrection: boolean;
  dataSource: string;
}

interface EmployeeData {
  id: string;
  employeeCode: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  designation: string;
  location: {
    id: string;
    name: string;
    code: string;
  };
  department: string;
  shift: {
    id: string;
    name: string;
    timing: string;
    gracePeriodMinutes: number;
    lateThresholdMinutes: number;
  };
  biometricEnrollment: {
    enrollmentNumber: string;
    status: string;
    verifiedShowroom: string;
    hardwareModels: string;
  };
}

interface DeviceStatus {
  serialNumber: string;
  name: string;
  model: string;
  showroom: string;
  networkLink: string;
  status: string;
  lastSyncAt: string;
  lastError: string | null;
}

interface MonthlyReportData {
  employee: EmployeeData;
  period: {
    year: number;
    month: number;
    monthName: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    currentCalendarDate: string;
  };
  metrics: {
    presentDays: number;
    absentDays: number;
    weeklyOffs: number;
    holidays: number;
    leaveDays: number;
    pendingVerificationDays: number;
    totalWorkingHours: string;
    totalWorkingSeconds: number;
    missingPunchCount: number;
    pendingCorrectionsCount: number;
    pendingApprovalsCount: number;
  };
  deviceStatuses: DeviceStatus[];
  dailyRecords: DailyAttendanceRow[];
  lastBiometricSync: string;
}

export default function EmployeeAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const employeeId = resolvedParams.id || '1604';

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [liveSyncEnabled, setLiveSyncEnabled] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(10);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [data, setData] = useState<MonthlyReportData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Selected date for details drawer
  const [selectedDay, setSelectedDay] = useState<DailyAttendanceRow | null>(null);

  // Correction Modal State
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionDate, setCorrectionDate] = useState('');
  const [correctionInTime, setCorrectionInTime] = useState('10:00');
  const [correctionOutTime, setCorrectionOutTime] = useState('19:30');
  const [correctionReason, setCorrectionReason] = useState('');
  const [submittingCorrection, setSubmittingCorrection] = useState(false);

  // HR Approvals drawer
  const [approvalsDrawerOpen, setApprovalsDrawerOpen] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const fetchAttendance = useCallback(async (showToast = false) => {
    try {
      if (showToast) setLoading(true);
      setErrorMessage(null);
      const res = await api.get(`/attendance/employee/${employeeId}`, {
        params: { year: selectedYear, month: selectedMonth },
      });
      if (res.data?.success) {
        setData(res.data.data);
        if (showToast) toast.success('Attendance records refreshed from biometric engine');
      }
    } catch (err: any) {
      console.error('Fetch attendance error:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to load employee attendance records';
      setErrorMessage(msg);
      if (showToast) toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [employeeId, selectedYear, selectedMonth]);

  useEffect(() => {
    fetchAttendance();
  }, [fetchAttendance]);

  // Live Sync auto-polling interval when enabled
  useEffect(() => {
    if (!liveSyncEnabled) return;
    const interval = setInterval(() => {
      fetchAttendance(false);
    }, 20000); // 20s live refresh
    return () => clearInterval(interval);
  }, [liveSyncEnabled, fetchAttendance]);

  // Handle manual trigger synchronization
  const handleTriggerSync = async () => {
    try {
      setSyncing(true);
      const res = await api.post(`/attendance/employee/${employeeId}/sync`);
      if (res.data?.success) {
        toast.success(res.data.message || 'Biometric hardware synchronized');
        fetchAttendance(false);
      }
    } catch (err: any) {
      toast.error('Sync failed: ' + (err.response?.data?.error || err.message));
    } finally {
      setSyncing(false);
    }
  };

  // Submit manual correction
  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionReason.trim()) {
      toast.error('Please specify a valid business reason for the attendance correction');
      return;
    }
    try {
      setSubmittingCorrection(true);
      const reqLogin = `${correctionDate}T${correctionInTime}:00`;
      const reqLogout = `${correctionDate}T${correctionOutTime}:00`;

      const res = await api.post(`/attendance/employee/${employeeId}/corrections`, {
        attendanceDate: correctionDate,
        requestedLogin: reqLogin,
        requestedLogout: reqLogout,
        reason: correctionReason,
      });

      if (res.data?.success) {
        toast.success('Correction request submitted for authorized HR review');
        setCorrectionModalOpen(false);
        setCorrectionReason('');
        fetchAttendance(false);
      }
    } catch (err: any) {
      toast.error('Failed to submit correction: ' + (err.response?.data?.error || err.message));
    } finally {
      setSubmittingCorrection(false);
    }
  };

  // HR Approve Correction
  const handleApproveCorrection = async (correctionId: string) => {
    try {
      setReviewingId(correctionId);
      const res = await api.post(`/attendance/employee/corrections/${correctionId}/approve`, {
        reviewNote: 'Verified with Davanagere Mega Store Manager and biometric device logs',
      });
      if (res.data?.success) {
        toast.success('Attendance correction approved and applied to authoritative payroll records');
        fetchAttendance(false);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve correction');
    } finally {
      setReviewingId(null);
    }
  };

  // HR Reject Correction
  const handleRejectCorrection = async (correctionId: string) => {
    try {
      setReviewingId(correctionId);
      const res = await api.post(`/attendance/employee/corrections/${correctionId}/reject`, {
        reviewNote: 'Rejected: Insufficient physical store verification',
      });
      if (res.data?.success) {
        toast.success('Correction request rejected');
        fetchAttendance(false);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject correction');
    } finally {
      setReviewingId(null);
    }
  };

  // Export report as CSV
  const handleExportReport = () => {
    if (!data?.dailyRecords) return;
    const headers = ['Date', 'Day', 'Status', 'In Punch', 'Out Punch', 'Working Hours', 'Break Time', 'Flags', 'Data Source'];
    const rows = data.dailyRecords.map((r) => [
      r.date,
      r.dayOfWeek,
      r.statusLabel,
      r.inPunch || '—',
      r.outPunch || '—',
      r.workingHoursFormatted,
      r.breakMinutesFormatted,
      `"${r.flags.join('; ')}"`,
      `"${r.dataSource}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Attendance_Report_Emp_${data.employee.employeeCode}_${data.period.monthName}_${data.period.year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Monthly attendance report exported as CSV');
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 font-semibold text-sm">
            Retrieving authoritative biometric attendance records for Employee {employeeId}...
          </p>
        </div>
      </DashboardLayout>
    );
  }

  if (errorMessage && !data) {
    return (
      <DashboardLayout>
        <div className="max-w-3xl mx-auto mt-12 p-8 bg-white border border-rose-200 rounded-2xl shadow-lg space-y-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900">Employee Identification Error</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{errorMessage}</p>
            </div>
          </div>

          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs space-y-1">
            <p className="font-bold">Required HR Review & Action:</p>
            <p>
              Under BSC Textiles HRMS compliance policies, biometric events cannot be mapped or processed for unverified employee numbers without authorized HR onboarding and formal showroom assignment.
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link
              href="/employees"
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg shadow-sm"
            >
              Go to Employee Directory
            </Link>
            <button
              onClick={() => fetchAttendance(true)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-lg"
            >
              Retry Search
            </button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!data) return null;

  const { employee, period, metrics, deviceStatuses, dailyRecords } = data;

  // Collect all pending corrections
  const allPendingCorrections = dailyRecords.flatMap((r) => r.corrections.filter((c) => c.status === 'PENDING'));

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-16">
        {/* Top Header Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-[#0058be] to-slate-900 p-6 text-white shadow-xl">
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-400/10 via-transparent to-transparent pointer-events-none" />
          
          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-200">
                <span className="flex items-center gap-1.5 bg-blue-500/20 px-2.5 py-1 rounded-full border border-blue-400/20">
                  <Fingerprint className="w-3.5 h-3.5 text-emerald-400" />
                  eSSL MB160 Biometric Verified
                </span>
                <span className="flex items-center gap-1.5 bg-white/10 px-2.5 py-1 rounded-full">
                  <MapPin className="w-3.5 h-3.5 text-blue-300" />
                  {employee.location.name} ({employee.location.code})
                </span>
                <span className="bg-emerald-500/20 text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-400/30">
                  PIN / UID: {employee.biometricEnrollment.enrollmentNumber}
                </span>
              </div>

              <div className="flex items-baseline gap-3">
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">{employee.name}</h1>
                <span className="text-sm font-bold text-blue-200 bg-white/10 px-2.5 py-0.5 rounded-lg">
                  EMP #{employee.employeeCode}
                </span>
              </div>

              <p className="text-xs md:text-sm text-slate-300">
                {employee.designation} · {employee.department} Department · {employee.shift.name} ({employee.shift.timing}) · Grace: {employee.shift.gracePeriodMinutes}m
              </p>
            </div>

            {/* Actions & Month Controls */}
            <div className="flex flex-wrap items-center gap-2.5 relative z-10">
              {/* Month Selector */}
              <div className="flex items-center bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-sm backdrop-blur-sm">
                <Calendar className="w-4 h-4 mr-2 text-blue-300" />
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="bg-transparent text-white font-semibold focus:outline-none cursor-pointer"
                >
                  <option value={10} className="text-slate-900">October 2026</option>
                  <option value={9} className="text-slate-900">September 2026</option>
                  <option value={8} className="text-slate-900">August 2026</option>
                </select>
              </div>

              {/* eSSL MB160 Live Biometric Sync Toggle Switch */}
              <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 backdrop-blur-sm shadow-xs">
                <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                  <Fingerprint className={`w-3.5 h-3.5 ${liveSyncEnabled ? 'text-emerald-400' : 'text-slate-400'}`} />
                  <span>eSSL Sync:</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={liveSyncEnabled}
                  onClick={() => {
                    const next = !liveSyncEnabled;
                    setLiveSyncEnabled(next);
                    toast.success(next ? 'eSSL MB160 Live Biometric Sync Enabled' : 'eSSL MB160 Live Sync Paused');
                  }}
                  className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border border-white/30 transition-colors duration-200 ease-in-out focus:outline-none ${
                    liveSyncEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                  }`}
                  title={liveSyncEnabled ? 'eSSL MB160 Live Push Active (Auto-refreshing)' : 'eSSL Live Sync Paused (Click to Enable)'}
                >
                  <span
                    className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-0.5 ${
                      liveSyncEnabled ? 'translate-x-5' : 'translate-x-0.5'
                    }`}
                  />
                </button>
                <span className={`text-[10px] font-black uppercase tracking-wider ${liveSyncEnabled ? 'text-emerald-300' : 'text-slate-400'}`}>
                  {liveSyncEnabled ? 'ON' : 'OFF'}
                </span>
              </div>

              {/* Refresh / Sync Now */}
              <button
                onClick={handleTriggerSync}
                disabled={syncing}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl shadow-md transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Devices'}
              </button>

              {/* Export Report */}
              <button
                onClick={handleExportReport}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                Export Report
              </button>
            </div>
          </div>
        </div>

        {/* Monthly Summary Metrics Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Present Days</div>
            <div className="text-2xl font-black text-emerald-600 mt-1">{metrics.presentDays}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Verified Floor Presence</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Verified Hours</div>
            <div className="text-2xl font-black text-blue-600 mt-1">{metrics.totalWorkingHours}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Net Working Time</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Weekly Offs</div>
            <div className="text-2xl font-black text-purple-600 mt-1">{metrics.weeklyOffs}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Sundays Scheduled</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Holidays</div>
            <div className="text-2xl font-black text-amber-600 mt-1">{metrics.holidays}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">National / State Offs</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pending Review</div>
            <div className="text-2xl font-black text-rose-500 mt-1">{metrics.pendingVerificationDays}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Missing Sync / Review</div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm relative">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">HR Approvals</div>
              {allPendingCorrections.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </div>
            <div className="text-2xl font-black text-indigo-600 mt-1">{allPendingCorrections.length}</div>
            <button
              onClick={() => setApprovalsDrawerOpen(true)}
              className="text-[11px] text-indigo-600 font-bold hover:underline mt-0.5 inline-block"
            >
              Review Requests →
            </button>
          </div>
        </div>

        {/* Real-time Davanagere Biometric Device Mesh Status Panel */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Davanagere Showroom Biometric Terminal Cluster (eSSL MB160 Mesh)
              </h3>
            </div>
            <div className="text-[11px] text-slate-500">
              Hardware Credentials Secured on Server · All 3 Devices Bound to Davanagere (DAV)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {deviceStatuses.map((dev, idx) => (
              <div
                key={dev.serialNumber}
                className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-start justify-between gap-2"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-bold text-slate-900">{dev.name}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Serial: <span className="font-mono font-semibold">{dev.serialNumber}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-500" />
                    <span>{dev.networkLink}</span>
                  </div>
                </div>

                <div className="text-right">
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {dev.status}
                  </span>
                  <div className="text-[10px] text-slate-400 mt-1">
                    Sync: {new Date(dev.lastSyncAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 31-Day October Attendance Register Table */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Daily Attendance Register — {period.monthName} {period.year}
              </h2>
              <p className="text-xs text-slate-500">
                Full 31 calendar dates showing valid punch sequences, verified breaks, and calculated working duration.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Present
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> Weekly Off
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Holiday
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Future / Pending
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4 font-bold">Date & Day</th>
                  <th className="py-3 px-4 font-bold">First Valid IN</th>
                  <th className="py-3 px-4 font-bold">Last Valid OUT</th>
                  <th className="py-3 px-4 font-bold">Punches</th>
                  <th className="py-3 px-4 font-bold">Net Working Time</th>
                  <th className="py-3 px-4 font-bold">Breaks</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 font-bold">Exceptions / Flags</th>
                  <th className="py-3 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {dailyRecords.map((row) => {
                  return (
                    <tr
                      key={row.date}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        row.isFutureDate
                          ? 'opacity-60 bg-slate-50/30'
                          : row.status === 'PRESENT'
                          ? 'bg-white'
                          : row.isSunday
                          ? 'bg-purple-50/20'
                          : row.isHoliday
                          ? 'bg-amber-50/20'
                          : 'bg-slate-50/30'
                      }`}
                    >
                      {/* Date & Day */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{row.date}</div>
                        <div className="text-[11px] text-slate-500">{row.dayOfWeek}</div>
                      </td>

                      {/* IN Punch */}
                      <td className="py-3 px-4">
                        {row.inPunch ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-xs font-semibold">
                            <Clock className="w-3 h-3" />
                            {row.inPunch}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      {/* OUT Punch */}
                      <td className="py-3 px-4">
                        {row.outPunch ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-xs font-semibold">
                            <Clock className="w-3 h-3" />
                            {row.outPunch}
                          </span>
                        ) : (
                          <span className="text-slate-400 font-mono">—</span>
                        )}
                      </td>

                      {/* Intermediate Punches Count */}
                      <td className="py-3 px-4">
                        {row.allPunches.length > 0 ? (
                          <button
                            onClick={() => setSelectedDay(row)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px]"
                            title="Click to view all punch logs"
                          >
                            <Eye className="w-3 h-3" />
                            {row.allPunches.length} Logs
                          </button>
                        ) : (
                          <span className="text-slate-400 font-mono">0</span>
                        )}
                      </td>

                      {/* Net Duration */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {row.workingHoursFormatted}
                      </td>

                      {/* Breaks */}
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {row.breakMinutesFormatted}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                            row.status === 'PRESENT'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : row.status === 'WEEKLY_OFF'
                              ? 'bg-purple-100 text-purple-800 border border-purple-200'
                              : row.status === 'HOLIDAY'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : row.status === 'FUTURE_DATE'
                              ? 'bg-slate-100 text-slate-600 border border-slate-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {row.statusLabel}
                        </span>
                      </td>

                      {/* Flags & Exceptions */}
                      <td className="py-3 px-4">
                        {row.flags.length > 0 ? (
                          <div className="space-y-0.5">
                            {row.flags.map((f, i) => (
                              <div
                                key={i}
                                className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 inline-block font-semibold mr-1"
                              >
                                {f}
                              </div>
                            ))}
                          </div>
                        ) : row.hasApprovedCorrection ? (
                          <span className="text-[10px] font-bold text-emerald-600">HR Correction Applied</span>
                        ) : (
                          <span className="text-[11px] text-slate-400">Regular Sequence</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="py-3 px-4 text-right">
                        {!row.isFutureDate && !row.isSunday && (
                          <button
                            onClick={() => {
                              setCorrectionDate(row.date);
                              setCorrectionInTime(row.inPunch ? '10:00' : '10:00');
                              setCorrectionOutTime(row.outPunch ? '19:30' : '19:30');
                              setCorrectionModalOpen(true);
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            Correct Punch
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detailed Punch Drawer Modal */}
        {selectedDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Punch Logs for {selectedDay.date} ({selectedDay.dayOfWeek})
                  </h3>
                  <p className="text-xs text-slate-500">Employee 1604 · Davanagere Mega Store Terminal Mesh</p>
                </div>
                <button
                  onClick={() => setSelectedDay(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {selectedDay.allPunches.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">No biometric punch events captured on this date.</p>
                ) : (
                  selectedDay.allPunches.map((p, idx) => (
                    <div
                      key={p.id || idx}
                      className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-semibold text-[10px]">
                            {p.punchType}
                          </span>
                          <span>{p.timeFormatted}</span>
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Terminal: <span className="font-medium text-slate-700">{p.deviceName}</span> (SN: {p.deviceSerialNumber})
                        </div>
                      </div>

                      <div className="text-right space-y-0.5">
                        <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 inline-block">
                          {p.verifyMode}
                        </span>
                        <div className="text-[10px] text-slate-400">Sync: Authorized</div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setSelectedDay(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual Attendance Correction Request Modal */}
        {correctionModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Request Attendance Correction</h3>
                  <p className="text-xs text-slate-500">Employee 1604 · Date: {correctionDate}</p>
                </div>
                <button
                  onClick={() => setCorrectionModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitCorrection} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Proposed IN Time</label>
                    <input
                      type="time"
                      value={correctionInTime}
                      onChange={(e) => setCorrectionInTime(e.target.value)}
                      required
                      className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Proposed OUT Time</label>
                    <input
                      type="time"
                      value={correctionOutTime}
                      onChange={(e) => setCorrectionOutTime(e.target.value)}
                      required
                      className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Business Justification / Reason <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={correctionReason}
                    onChange={(e) => setCorrectionReason(e.target.value)}
                    placeholder="e.g. Employee completed showroom shift at Davanagere Mega Store. Terminal 1 optical reader experienced brief communication glitch during evening checkout."
                    required
                    className="w-full px-3 py-2 border rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-blue-600" />
                    Strict Separation of Duties:
                  </p>
                  <p className="text-[11px] leading-relaxed">
                    Under HRMS attendance governance, the correction request will be logged immutably. An authorized HR manager or administrator other than the requester must formally approve this before records or payroll are recalculated.
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCorrectionModalOpen(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingCorrection}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-md disabled:opacity-50"
                  >
                    {submittingCorrection ? 'Submitting...' : 'Submit Request'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* HR Pending Approvals Drawer */}
        {approvalsDrawerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b pb-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Pending HR Attendance Approvals</h3>
                  <p className="text-xs text-slate-500">Employee 1604 · Davanagere Mega Store</p>
                </div>
                <button
                  onClick={() => setApprovalsDrawerOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {allPendingCorrections.length === 0 ? (
                  <p className="text-xs text-slate-500 py-6 text-center">No pending correction requests for this employee.</p>
                ) : (
                  allPendingCorrections.map((c) => (
                    <div
                      key={c.id}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900">Date: {c.attendanceDate}</span>
                        <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-bold rounded text-[10px]">
                          PENDING HR REVIEW
                        </span>
                      </div>

                      <div className="text-slate-600">
                        Reason: <span className="font-semibold text-slate-800">{c.reason}</span>
                      </div>

                      <div className="text-[11px] text-slate-400">
                        Requested by: {c.requesterName || 'Authorized Store User'} · {new Date(c.createdAt).toLocaleDateString()}
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                        <button
                          onClick={() => handleRejectCorrection(c.id)}
                          disabled={reviewingId === c.id}
                          className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded-lg font-bold text-xs"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleApproveCorrection(c.id)}
                          disabled={reviewingId === c.id}
                          className="px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg font-bold text-xs shadow-sm"
                        >
                          Approve & Apply
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setApprovalsDrawerOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
