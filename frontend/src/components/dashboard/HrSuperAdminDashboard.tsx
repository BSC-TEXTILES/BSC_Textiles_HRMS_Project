'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  UserX,
  CalendarDays,
  Clock,
  TrendingUp,
  Download,
  Plus,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileText,
  Sparkles,
  Users2,
  Fingerprint,
  Building2,
  ScanFace,
  RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { AddEmployeeDialog } from '@/components/employees/AddEmployeeDialog';
import { CANONICAL_HUB_STORES } from '@/components/employees/drawers/storeLocationsHelper';
import { KpiDetailsDrawer, KpiDrawerType } from '@/components/dashboard/KpiDetailsDrawer';

interface HrSuperAdminDashboardProps {
  onOpenAddEmployee?: () => void;
}

interface HrCommandCenterData {
  date: string;
  kpis: {
    headcount: number;
    present: number;
    absent: number;
    unplannedAbsent: number;
    onLeave: number;
    returnTomorrow: number;
    newJoiners: number;
    late: number;
    lateRate: number | null;
    attendanceRate: number | null;
    faceVerified: number;
  };
  hubs: Array<{ locationId: string; name: string; code: string | null; headcount: number; present: number; coveragePct: number | null }>;
  trend: Array<{ month: string; joinings: number; exits: number; headcount: number }>;
  departments: Array<{ name: string; count: number; pct: number | null }>;
  leave: {
    onLeaveTodayByType: Array<{ name: string; count: number }>;
    calendarMonth: string;
    daysWithLeave: Array<{ date: string; count: number }>;
    pendingRequests: number;
    upcomingRequests: number;
  };
  actionCenter: {
    leaveRequestsPending: number;
    correctionsPending: number;
    documentsPending: number;
    biometricSyncFailures: number;
    probationReviewsDue: number;
    resignationsPending: number;
    fnfPending: number;
  };
  compliance: { missingKyc: number; bankPending: number; pfEsiPending: number };
  onboarding: { joiningThisWeek: number; documentsPending: number; assetsPending: number };
  payrollReadiness: { runStatus: string | null; periodStart: string | null; periodEnd: string | null; payslipCount: number; coveragePct: number | null };
  recruitment: { activeCandidates: number; interviewsToday: number };
  engagements: { birthdaysToday: { count: number; names: string[] }; upcomingHolidays: Array<{ name: string; date: string }> };
}

const EMPTY_DATA: HrCommandCenterData = {
  date: '',
  kpis: { headcount: 0, present: 0, absent: 0, unplannedAbsent: 0, onLeave: 0, returnTomorrow: 0, newJoiners: 0, late: 0, lateRate: null, attendanceRate: null, faceVerified: 0 },
  hubs: [],
  trend: [],
  departments: [],
  leave: { onLeaveTodayByType: [], calendarMonth: '', daysWithLeave: [], pendingRequests: 0, upcomingRequests: 0 },
  actionCenter: { leaveRequestsPending: 0, correctionsPending: 0, documentsPending: 0, biometricSyncFailures: 0, probationReviewsDue: 0, resignationsPending: 0, fnfPending: 0 },
  compliance: { missingKyc: 0, bankPending: 0, pfEsiPending: 0 },
  onboarding: { joiningThisWeek: 0, documentsPending: 0, assetsPending: 0 },
  payrollReadiness: { runStatus: null, periodStart: null, periodEnd: null, payslipCount: 0, coveragePct: null },
  recruitment: { activeCandidates: 0, interviewsToday: 0 },
  engagements: { birthdaysToday: { count: 0, names: [] }, upcomingHolidays: [] },
};

const fmtDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function HrSuperAdminDashboard({ onOpenAddEmployee }: HrSuperAdminDashboardProps) {
  const [selectedHub, setSelectedHub] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');

  const [data, setData] = useState<HrCommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [hubs, setHubs] = useState<any[]>(CANONICAL_HUB_STORES);
  const [departments, setDepartments] = useState<any[]>([]);

  const [activeKpiDrawer, setActiveKpiDrawer] = useState<KpiDrawerType | null>(null);
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number | null>(null);
  const [todayYmd, setTodayYmd] = useState<string>('');
  const [displayDate, setDisplayDate] = useState<string>('');
  const [greeting, setGreeting] = useState('Good morning');

  // Add Employee dialog
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [dialogLocations, setDialogLocations] = useState<any[]>(CANONICAL_HUB_STORES);
  const [dialogDepartments, setDialogDepartments] = useState<any[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);

  const requestRef = useRef(0);

  useEffect(() => {
    const now = new Date();
    const ymd = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    setTodayYmd(ymd);
    setSelectedDate((prev) => prev || ymd);
    setSelectedCalendarDay(Number(ymd.slice(8, 10)));
    setDisplayDate(
      now.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
    );
    const hour = now.getHours();
    setGreeting(hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening');
  }, []);

  const fetchCommandCenter = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    try {
      const params: Record<string, string> = {};
      if (selectedHub !== 'all') params.locationId = selectedHub;
      if (selectedDepartment !== 'all') params.departmentId = selectedDepartment;
      if (selectedDate) params.date = selectedDate;
      const res = await api.get('/reports/hr-command-center', { params });
      if (requestId !== requestRef.current) return;
      setData(res.data && typeof res.data === 'object' ? res.data : null);
    } catch (err: any) {
      if (requestId !== requestRef.current) return;
      setData(null);
      setLoadError(err?.response?.data?.error || err?.message || 'The HR command center data could not be loaded.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [selectedHub, selectedDepartment, selectedDate]);

  useEffect(() => {
    fetchCommandCenter();
  }, [fetchCommandCenter]);

  useEffect(() => {
    Promise.all([
      api.get('/locations/all').catch(() => ({ data: [] })),
      api.get('/departments?limit=100').catch(() => ({ data: [] })),
    ]).then(([locRes, deptRes]) => {
      const locs = Array.isArray(locRes?.data) && locRes.data.length > 0 ? locRes.data : CANONICAL_HUB_STORES;
      const depts = deptRes?.data?.departments || deptRes?.data || [];
      setHubs(locs);
      setDialogLocations(locs);
      setDepartments(Array.isArray(depts) ? depts : []);
      setDialogDepartments(Array.isArray(depts) ? depts : []);
    });
  }, []);

  useEffect(() => {
    if (isAddEmployeeOpen && departments.length === 0) {
      setDepartmentsLoading(true);
      api
        .get('/departments?limit=100')
        .then((res) => {
          const depts = res?.data?.departments || res?.data || [];
          setDialogDepartments(depts);
        })
        .catch(() => setDialogDepartments([]))
        .finally(() => setDepartmentsLoading(false));
    }
  }, [isAddEmployeeOpen, departments.length]);

  const d = data || EMPTY_DATA;
  const kpis = d.kpis;

  const leaveDots = useMemo(() => {
    const map = new Map<number, number>();
    for (const entry of d.leave.daysWithLeave) {
      const day = Number(entry.date.slice(8, 10));
      if (Number.isFinite(day)) map.set(day, entry.count);
    }
    return map;
  }, [d.leave.daysWithLeave]);

  const calendarDays = useMemo(() => {
    const month = selectedDate ? selectedDate.slice(0, 7) : d.leave.calendarMonth || todayYmd.slice(0, 7);
    if (!month) return { label: '—', cells: [] as Array<number | null> };
    const [y, m] = month.split('-').map(Number);
    const first = new Date(Date.UTC(y, m - 1, 1));
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const offset = first.getUTCDay();
    const cells: Array<number | null> = Array.from({ length: offset }, () => null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(day);
    const label = first.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { label, cells };
  }, [selectedDate, d.leave.calendarMonth, todayYmd]);

  const ring = useMemo(() => {
    const present = kpis.present;
    const absent = kpis.absent;
    const onLeave = kpis.onLeave;
    const late = kpis.late;
    const denom = Math.max(present + absent + late, 1);
    const frac = (v: number) => Math.min(1, v / denom);
    const f1 = frac(present);
    const f2 = frac(absent);
    const f3 = frac(onLeave);
    const f4 = frac(late);
    return {
      present: { dash: 377 - 377 * f1, rotate: 0 },
      absent: { dash: 377 - 377 * f2, rotate: f1 * 360 },
      onLeave: { dash: 377 - 377 * f3, rotate: (f1 + f2) * 360 },
      late: { dash: 377 - 377 * f4, rotate: (f1 + f2 + f3) * 360 },
    };
  }, [kpis]);

  const trendChart = useMemo(() => {
    const trend = d.trend;
    if (!trend.length) return null;
    const values = trend.map((t) => t.headcount);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    const points = trend.map((t, i) => {
      const x = 10 + (i * 300) / Math.max(1, trend.length - 1);
      const y = 95 - 80 * ((t.headcount - min) / span);
      return { x, y, val: t.headcount, month: t.month };
    });
    const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} 95 L ${points[0].x.toFixed(1)} 95 Z`;
    const growth = values[0] > 0 ? Math.round(((values[values.length - 1] - values[0]) / values[0]) * 10000) / 100 : null;
    const maxFlow = Math.max(1, ...trend.map((t) => Math.max(t.joinings, t.exits)));
    return { points, linePath, areaPath, growth, maxFlow };
  }, [d.trend]);

  const actionTotal = useMemo(() => {
    const a = d.actionCenter;
    return (
      a.leaveRequestsPending +
      a.correctionsPending +
      a.documentsPending +
      a.biometricSyncFailures +
      a.probationReviewsDue +
      a.resignationsPending +
      a.fnfPending
    );
  }, [d.actionCenter]);

  const complianceTotal = d.compliance.missingKyc + d.compliance.bankPending + d.compliance.pfEsiPending;

  const handleExportReport = () => {
    if (!data) {
      toast.error('Nothing to export — the command center has not loaded.');
      return;
    }
    const rows: string[][] = [
      ['Metric', 'Value', 'As of'],
      ['Total Headcount', String(kpis.headcount), d.date],
      ['New Joiners (Month)', String(kpis.newJoiners), d.date],
      ['Present', String(kpis.present), d.date],
      ['Attendance Rate %', kpis.attendanceRate != null ? String(kpis.attendanceRate) : '—', d.date],
      ['Absent', String(kpis.absent), d.date],
      ['Unplanned Absent', String(kpis.unplannedAbsent), d.date],
      ['On Leave', String(kpis.onLeave), d.date],
      ['Late Arrivals', String(kpis.late), d.date],
      ['Face Verified', String(kpis.faceVerified), d.date],
      ['Corrections Pending', String(d.actionCenter.correctionsPending), d.date],
      ['Documents Pending', String(d.actionCenter.documentsPending), d.date],
      ['Biometric Sync Failures', String(d.actionCenter.biometricSyncFailures), d.date],
      ['Missing KYC (PAN/Aadhaar)', String(d.compliance.missingKyc), d.date],
      ['Bank Details Pending', String(d.compliance.bankPending), d.date],
      ['PF/ESI Pending', String(d.compliance.pfEsiPending), d.date],
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BSC_Workforce_Report_${d.date || new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success('Workforce report exported from live figures.');
  };

  const kpiCardClass =
    'p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all cursor-pointer group focus:outline-none focus:ring-2 active:scale-[0.99]';

  const kpiCards: Array<{
    key: KpiDrawerType;
    label: string;
    value: string;
    icon: React.ReactNode;
    iconClass: string;
    hint: React.ReactNode;
    hintClass: string;
  }> = [
    {
      key: 'headcount',
      label: 'Total Headcount',
      value: kpis.headcount.toLocaleString(),
      icon: <Users className="w-4 h-4" />,
      iconClass: 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400',
      hint: kpis.newJoiners > 0 ? `+${kpis.newJoiners} this month` : 'No joiners this month',
      hintClass: 'text-blue-600 dark:text-blue-400',
    },
    {
      key: 'present',
      label: 'Present Today',
      value: kpis.present.toLocaleString(),
      icon: <UserCheck className="w-4 h-4" />,
      iconClass: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400',
      hint: kpis.attendanceRate != null ? `${kpis.attendanceRate}% attendance` : 'Attendance rate unavailable',
      hintClass: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      key: 'absent',
      label: 'Absent Today',
      value: kpis.absent.toLocaleString(),
      icon: <UserX className="w-4 h-4" />,
      iconClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400',
      hint: `${kpis.unplannedAbsent} without approved leave`,
      hintClass: 'text-rose-600 dark:text-rose-400',
    },
    {
      key: 'leave',
      label: 'On Leave',
      value: kpis.onLeave.toLocaleString(),
      icon: <CalendarDays className="w-4 h-4" />,
      iconClass: 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400',
      hint: `${kpis.returnTomorrow} return tomorrow`,
      hintClass: 'text-purple-600 dark:text-purple-400',
    },
    {
      key: 'late',
      label: 'Late Arrivals',
      value: kpis.late.toLocaleString(),
      icon: <Clock className="w-4 h-4" />,
      iconClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
      hint: kpis.lateRate != null ? `${kpis.lateRate}% of present` : 'No present records',
      hintClass: 'text-amber-600 dark:text-amber-400',
    },
    {
      key: 'face_verified',
      label: 'Face Verified',
      value: kpis.faceVerified.toLocaleString(),
      icon: <ScanFace className="w-4 h-4" />,
      iconClass: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400',
      hint: 'Biometric matches today',
      hintClass: 'text-indigo-600 dark:text-indigo-400',
    },
  ];

  const colOf = (pct: number | null) =>
    pct == null ? 'text-slate-500' : pct >= 90 ? 'text-emerald-600 dark:text-emerald-400' : pct >= 75 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400';
  const barOf = (pct: number | null) =>
    pct == null ? 'bg-slate-400' : pct >= 90 ? 'bg-emerald-500' : pct >= 75 ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
              HR Command Center
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              {displayDate || 'Loading date…'}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{greeting}, Super Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Live workforce figures straight from the HRMS database{d.date ? ` for ${d.date}` : ''}.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="appearance-none bg-white dark:bg-[#131d36] text-slate-700 dark:text-slate-200 text-xs font-bold pl-3 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Locations</option>
              {hubs.map((h: any) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <Building2 className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="appearance-none bg-white dark:bg-[#131d36] text-slate-700 dark:text-slate-200 text-xs font-bold pl-3 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Departments</option>
              {departments.map((dept: any) => (
                <option key={dept.id} value={dept.id}>
                  {dept.name}
                </option>
              ))}
            </select>
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="bg-white dark:bg-[#131d36] text-slate-700 dark:text-slate-200 text-xs font-bold px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Report date"
          />

          <button
            onClick={() => fetchCommandCenter()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#131d36] border border-slate-200 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={handleExportReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#131d36] border border-slate-200 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Report</span>
          </button>

          <button
            onClick={() => {
              if (onOpenAddEmployee) onOpenAddEmployee();
              else setIsAddEmployeeOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Employee</span>
          </button>
        </div>
      </div>

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800">
          <p className="text-xs text-rose-900 dark:text-rose-200">
            <strong>Command center could not be loaded.</strong> {loadError} No example figures are shown in place of missing data.
          </p>
          <button
            onClick={() => fetchCommandCenter()}
            className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((card) => (
          <div
            key={card.key}
            role="button"
            tabIndex={0}
            onClick={() => setActiveKpiDrawer(card.key)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveKpiDrawer(card.key);
              }
            }}
            aria-label={`${card.label}: ${card.value}. Click to view details.`}
            className={kpiCardClass}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {card.label}
              </span>
              <div className={`p-2 rounded-xl ${card.iconClass}`}>{card.icon}</div>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {loading && !data ? '…' : card.value}
              </div>
              <div className="flex items-center justify-between mt-1">
                <div className={`text-[11px] font-semibold ${card.hintClass}`}>{card.hint}</div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center">
                  <span>View</span>
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Main two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT */}
        <div className="lg:col-span-8 space-y-6">
          {/* Attendance ring */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Today’s Attendance & Shift Coverage</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {d.date ? `Records for ${d.date}` : 'No attendance date available'} across {d.hubs.length} location{d.hubs.length === 1 ? '' : 's'}
                </p>
              </div>
              <Link href="/attendance/register" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline">
                <span>View Attendance Register</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="py-6 flex flex-col md:flex-row items-center justify-around gap-6">
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                  <circle cx="80" cy="80" r="60" className="stroke-slate-100 dark:stroke-slate-800" strokeWidth="16" fill="transparent" />
                  <circle
                    cx="80" cy="80" r="60" stroke="#10b981" strokeWidth="16" strokeDasharray="377"
                    strokeDashoffset={ring.present.dash} fill="transparent" strokeLinecap="round"
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    onMouseEnter={() => setHoveredSlice(`Present: ${kpis.present}`)} onMouseLeave={() => setHoveredSlice(null)}
                  />
                  <circle
                    cx="80" cy="80" r="60" stroke="#ef4444" strokeWidth="16" strokeDasharray="377"
                    strokeDashoffset={ring.absent.dash} fill="transparent"
                    transform={`rotate(${ring.absent.rotate} 80 80)`}
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    onMouseEnter={() => setHoveredSlice(`Absent: ${kpis.absent}`)} onMouseLeave={() => setHoveredSlice(null)}
                  />
                  <circle
                    cx="80" cy="80" r="60" stroke="#8b5cf6" strokeWidth="16" strokeDasharray="377"
                    strokeDashoffset={ring.onLeave.dash} fill="transparent"
                    transform={`rotate(${ring.onLeave.rotate} 80 80)`}
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    onMouseEnter={() => setHoveredSlice(`On Leave: ${kpis.onLeave}`)} onMouseLeave={() => setHoveredSlice(null)}
                  />
                  <circle
                    cx="80" cy="80" r="60" stroke="#f59e0b" strokeWidth="16" strokeDasharray="377"
                    strokeDashoffset={ring.late.dash} fill="transparent"
                    transform={`rotate(${ring.late.rotate} 80 80)`}
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    onMouseEnter={() => setHoveredSlice(`Late: ${kpis.late}`)} onMouseLeave={() => setHoveredSlice(null)}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  {hoveredSlice ? (
                    <div className="animate-in fade-in duration-150">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Selected</span>
                      <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400">{hoveredSlice}</div>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Headcount</span>
                      <span className="text-xl font-black text-slate-900 dark:text-white">{kpis.headcount.toLocaleString()}</span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        {kpis.attendanceRate != null ? `${kpis.attendanceRate}% present` : 'Attendance rate —'}
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-md">
                {[
                  { label: 'Present', value: kpis.present, dot: 'bg-[#10b981]' },
                  { label: 'Absent', value: kpis.absent, dot: 'bg-[#ef4444]' },
                  { label: 'On Leave', value: kpis.onLeave, dot: 'bg-[#8b5cf6]' },
                  { label: 'Late', value: kpis.late, dot: 'bg-[#f59e0b]' },
                  { label: 'Face Verified', value: kpis.faceVerified, dot: 'bg-blue-500' },
                  { label: 'Headcount', value: kpis.headcount, dot: 'bg-slate-400' },
                ].map((tile) => (
                  <div key={tile.label} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${tile.dot}`} />
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{tile.label}</span>
                    </div>
                    <div className="text-base font-black text-slate-900 dark:text-white mt-1">{tile.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Hub-wise coverage */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Location-wise Presence</span>
              {d.hubs.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No location-wise attendance records for this day.</p>
              ) : (
                d.hubs.map((hub) => (
                  <div key={hub.locationId}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800 dark:text-slate-200">{hub.name}</span>
                        {hub.coveragePct != null && hub.coveragePct < 75 && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                            Needs Attention
                          </span>
                        )}
                      </div>
                      <span className={`font-extrabold ${colOf(hub.coveragePct)}`}>
                        {hub.coveragePct != null ? `${hub.coveragePct}%` : '—'}
                        <span className="text-slate-400 font-semibold"> ({hub.present}/{hub.headcount})</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${barOf(hub.coveragePct)}`} style={{ width: `${Math.min(100, hub.coveragePct ?? 0)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Leave availability */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Leave Availability & Upcoming Absences</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Approved leaves on record{calendarDays.label !== '—' ? ` • ${calendarDays.label}` : ''}
                </p>
              </div>
              <Link href="/leaves" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 transition-colors">
                <span>Open Leave Calendar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5">
              <div className="md:col-span-6 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">{calendarDays.label}</span>
                  <span className="text-[10px] font-bold text-slate-400">Dots = approved leaves</span>
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-slate-400 mb-1">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((w) => (
                    <span key={w}>{w}</span>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {calendarDays.cells.map((day, idx) => {
                    if (day === null) return <div key={`pad-${idx}`} className="py-1.5" />;
                    const dayStr = `${calendarDays.label === '—' ? '' : selectedDate.slice(0, 8)}${String(day).padStart(2, '0')}`;
                    const dots = leaveDots.get(day);
                    const isToday = todayYmd && dayStr === todayYmd;
                    const isSelected = selectedCalendarDay === day;
                    return (
                      <button
                        key={day}
                        onClick={() => setSelectedCalendarDay(day)}
                        className={`relative py-1.5 rounded-lg font-bold transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white shadow-xs'
                            : isToday
                            ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                        }`}
                        title={dots ? `${dots} approved leave${dots === 1 ? '' : 's'}` : 'No approved leaves'}
                      >
                        <span>{day}</span>
                        {dots ? (
                          <span className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${dots >= 5 ? 'bg-rose-500' : 'bg-amber-500'}`} />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="md:col-span-6 flex flex-col justify-between space-y-3">
                <div className="p-3.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-700 dark:text-purple-300">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {kpis.onLeave} Employee{kpis.onLeave === 1 ? '' : 's'} on Leave Today
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-8">
                    {d.leave.onLeaveTodayByType.length > 0
                      ? d.leave.onLeaveTodayByType.map((t) => `${t.count} ${t.name}`).join(', ')
                      : 'No approved leave applications cover today.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {d.leave.upcomingRequests} Upcoming Leave Request{d.leave.upcomingRequests === 1 ? '' : 's'} (Next 7 Days)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-8">
                    Pending requests starting within a week are counted here.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-700 dark:text-blue-300">
                      <Clock className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      {d.leave.pendingRequests} Leave Request{d.leave.pendingRequests === 1 ? '' : 's'} Pending Approval
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-8">Awaiting HR Super Admin sign-off in the leave ledger.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-4 space-y-6">
          {/* Action Center */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Action Center</h2>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${actionTotal > 0 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30' : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:border-slate-700'}`}>
                  {actionTotal} Pending
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Pending approvals and items needing attention</p>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {[
                { label: `${d.actionCenter.leaveRequestsPending} Leave Requests Pending`, href: '/leaves', tag: 'Urgent', tagClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900', dot: 'bg-rose-500' },
                { label: `${d.actionCenter.correctionsPending} Attendance Corrections Pending`, href: '/attendance/missed-punching', tag: 'Review', tagClass: 'bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-900', dot: 'bg-orange-500' },
                { label: `${d.actionCenter.documentsPending} Employee Documents Pending`, href: '/employees/documents', tag: 'Dossier', tagClass: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900', dot: 'bg-amber-500' },
                { label: `${d.actionCenter.biometricSyncFailures} Biometric Sync Failures`, href: '/attendance/devices', tag: 'eSSL IoT', tagClass: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900', dot: 'bg-rose-500' },
                { label: `${d.actionCenter.probationReviewsDue} Probation Reviews Due`, href: '/employees', tag: 'HR Review', tagClass: 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900', dot: 'bg-blue-500' },
                { label: `${d.actionCenter.resignationsPending} Resignation / Exit Records`, href: '/employees/former', tag: 'Notice', tagClass: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900', dot: 'bg-purple-500' },
                { label: `${d.actionCenter.fnfPending} F&F Settlements Pending`, href: '/employees/former', tag: 'F&F', tagClass: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700', dot: 'bg-slate-400' },
              ].map((row) => (
                <Link key={row.label} href={row.href} className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-xl transition-colors group">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full ${row.dot}`} />
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">{row.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${row.tagClass}`}>{row.tag}</span>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
              <Link href="/organization/approvals" className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 transition-colors">
                <span>View All Pending Actions →</span>
              </Link>
            </div>
          </div>

          {/* Compliance Watch */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="pb-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Compliance Watch</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Statutory and employee documentation alerts</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${complianceTotal > 0 ? 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30' : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'}`}>
                {complianceTotal > 0 ? `${complianceTotal} Open` : 'Clear'}
              </span>
            </div>

            <div className="py-4 space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${d.compliance.missingKyc > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <span>{d.compliance.missingKyc} Active Employees Missing Verified PAN / Aadhaar</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${d.compliance.bankPending > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                <span>{d.compliance.bankPending} Bank Account Details Pending</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${d.compliance.pfEsiPending > 0 ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                <span>{d.compliance.pfEsiPending} PF / ESI Enrollments Pending</span>
              </div>
            </div>

            <div className="pt-2">
              <Link href="/reports" className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors">
                <span>Review Compliance</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Operational cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Onboarding</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">Joining Week</span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">{d.onboarding.joiningThisWeek}</div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Employees joining this week</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              {d.onboarding.documentsPending} documents pending · {d.onboarding.assetsPending} assets pending
            </p>
          </div>
          <div className="pt-4 mt-2">
            <Link href="/employees?filter=onboarding" className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 transition-colors">
              View Onboarding
            </Link>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Payroll Readiness</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                {d.payrollReadiness.runStatus || 'No Run'}
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">
              {d.payrollReadiness.coveragePct != null ? `${d.payrollReadiness.coveragePct}%` : '—'}
            </div>
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-2 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, d.payrollReadiness.coveragePct ?? 0)}%` }} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              {d.payrollReadiness.payslipCount} payslip{d.payrollReadiness.payslipCount === 1 ? '' : 's'} for the latest run
              {d.payrollReadiness.periodStart ? ` (${fmtDate(d.payrollReadiness.periodStart)} → ${fmtDate(d.payrollReadiness.periodEnd)})` : ''}
            </p>
          </div>
          <div className="pt-4 mt-2">
            <Link href="/payroll" className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 transition-colors">
              Open Payroll Checklist
            </Link>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Recruitment Pipeline</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">Hiring</span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">{d.recruitment.activeCandidates}</div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Active candidates</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{d.recruitment.interviewsToday} interviews today</p>
          </div>
          <div className="pt-4 mt-2">
            <Link href="/hiring/candidates" className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 transition-colors">
              View Recruitment
            </Link>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Employee Lifecycle</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">Exits & F&F</span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">{d.actionCenter.resignationsPending}</div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">Exit records in process</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{d.actionCenter.fnfPending} F&F settlements pending</p>
          </div>
          <div className="pt-4 mt-2">
            <Link href="/employees/former" className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 transition-colors">
              View Separations
            </Link>
          </div>
        </div>
      </div>

      {/* Workforce insights + engagements */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Workforce Insights</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">6-month headcount trend, joinings vs exits, and department distribution</p>
            </div>
            <Link href="/employees/analysis" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline">
              <span>View Workforce Analytics</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5">
            <div className="md:col-span-7 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Headcount Trend (Last 6 Months)</span>
                  {trendChart?.growth != null && (
                    <span className={`text-[11px] font-bold ${trendChart.growth >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {trendChart.growth >= 0 ? '+' : ''}{trendChart.growth}% Growth
                    </span>
                  )}
                </div>
                {!trendChart ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No workforce history available.</p>
                ) : (
                  <div className="h-32 w-full">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 320 100">
                      <defs>
                        <linearGradient id="hcGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0058be" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="#0058be" stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      <path d={trendChart.areaPath} fill="url(#hcGradient)" />
                      <path d={trendChart.linePath} fill="none" stroke="#0058be" strokeWidth="2.5" strokeLinecap="round" />
                      {trendChart.points.map((pt) => (
                        <circle key={pt.month + pt.x} cx={pt.x} cy={pt.y} r="3.5" fill="#0058be" className="stroke-white dark:stroke-slate-900 stroke-2">
                          <title>{`${pt.month}: ${pt.val} employees`}</title>
                        </circle>
                      ))}
                    </svg>
                    <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                      {d.trend.map((t) => (
                        <span key={t.month}>{t.month}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Joinings vs Exits</span>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-emerald-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Joinings
                    </span>
                    <span className="flex items-center gap-1 text-rose-500">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Exits
                    </span>
                  </div>
                </div>
                {d.trend.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">No joining or exit records yet.</p>
                ) : (
                  <div className="h-28 w-full flex items-end justify-between gap-2 px-2 pt-2 border-b border-slate-100 dark:border-slate-800">
                    {d.trend.map((item) => (
                      <div key={item.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                        <div className="flex items-end gap-1 w-full justify-center h-20">
                          <div
                            className="w-2.5 sm:w-3.5 bg-emerald-500 hover:bg-emerald-600 rounded-t-sm transition-all"
                            style={{ height: `${trendChart ? (item.joinings / trendChart.maxFlow) * 100 : 0}%` }}
                            title={`${item.month} Joinings: ${item.joinings}`}
                          />
                          <div
                            className="w-2.5 sm:w-3.5 bg-rose-400 hover:bg-rose-500 rounded-t-sm transition-all"
                            style={{ height: `${trendChart ? (item.exits / trendChart.maxFlow) * 100 : 0}%` }}
                            title={`${item.month} Exits: ${item.exits}`}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">{item.month}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="md:col-span-5 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 space-y-3">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Department Distribution</span>
              {d.departments.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No departments configured for this filter.</p>
              ) : (
                d.departments.slice(0, 6).map((dept) => (
                  <div key={dept.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-bold text-slate-700 dark:text-slate-300">{dept.name}</span>
                      <span className="font-extrabold text-blue-600 dark:text-blue-400">{dept.count}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, dept.pct ?? 0)}%` }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Engagements & notices */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">Engagements & Notices</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Birthdays and holidays from the records</p>
              </div>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>

            <div className="py-4 space-y-3.5">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                    <Users2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    {d.engagements.birthdaysToday.count} Employee Birthday{d.engagements.birthdaysToday.count === 1 ? '' : 's'} Today
                  </span>
                </div>
                {d.engagements.birthdaysToday.count > 0 && (
                  <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                    {d.engagements.birthdaysToday.names.slice(0, 2).join(', ')}
                    {d.engagements.birthdaysToday.count > 2 ? ` +${d.engagements.birthdaysToday.count - 2}` : ''}
                  </span>
                )}
              </div>

              {d.engagements.upcomingHolidays.length === 0 ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-bold text-slate-700 dark:text-slate-300">No upcoming holidays configured</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">The holiday master has no entries for this scope.</div>
                </div>
              ) : (
                d.engagements.upcomingHolidays.map((holiday) => (
                  <div key={`${holiday.date}-${holiday.name}`} className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 flex items-start gap-3">
                    <span className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0 mt-0.5">
                      <Calendar className="w-3.5 h-3.5" />
                    </span>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{holiday.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{fmtDate(holiday.date)}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="pt-2">
            <Link href="/organization/holidays" className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors">
              Manage Holiday Calendar
            </Link>
          </div>
        </div>
      </div>

      {/* Add Employee Dialog */}
      {isAddEmployeeOpen && (
        <AddEmployeeDialog
          isOpen={isAddEmployeeOpen}
          onClose={() => setIsAddEmployeeOpen(false)}
          onSuccess={() => {
            setIsAddEmployeeOpen(false);
            toast.success('Employee created successfully!');
            fetchCommandCenter();
          }}
          locations={dialogLocations}
          departments={dialogDepartments}
          departmentsLoading={departmentsLoading}
        />
      )}

      <KpiDetailsDrawer
        type={activeKpiDrawer}
        onClose={() => setActiveKpiDrawer(null)}
        locationId={selectedHub}
        departmentId={selectedDepartment}
        date={selectedDate || d.date}
      />
    </div>
  );
}

export default HrSuperAdminDashboard;
