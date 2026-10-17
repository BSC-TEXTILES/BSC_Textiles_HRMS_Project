'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  Users,
  UserCheck,
  UserX,
  CalendarDays,
  Clock,
  Briefcase,
  TrendingUp,
  Download,
  Plus,
  Filter,
  Calendar,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ShieldAlert,
  FileText,
  Sparkles,
  Cake,
  Award,
  Fingerprint,
  FileBadge,
  Building2,
  ExternalLink,
  ChevronLeft,
  Check,
  Percent,
  Layers,
  ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { AddEmployeeDialog } from '@/components/employees/AddEmployeeDialog';
import { CANONICAL_HUB_STORES } from '@/components/employees/drawers/storeLocationsHelper';
import { KpiDetailsDrawer, KpiDrawerType } from '@/components/dashboard/KpiDetailsDrawer';

interface HrSuperAdminDashboardProps {
  onOpenAddEmployee?: () => void;
}

export function HrSuperAdminDashboard({ onOpenAddEmployee }: HrSuperAdminDashboardProps) {
  // Filter States
  const [selectedHub, setSelectedHub] = useState('all');
  const [selectedDepartment, setSelectedDepartment] = useState('all');
  const [selectedTimeframe, setSelectedTimeframe] = useState('today');

  // Interactive Add Employee Dialog
  const [isAddEmployeeOpen, setIsAddEmployeeOpen] = useState(false);
  const [dialogLocations, setDialogLocations] = useState<any[]>(CANONICAL_HUB_STORES);
  const [dialogDepartments, setDialogDepartments] = useState<any[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);

  useEffect(() => {
    if (isAddEmployeeOpen) {
      setDepartmentsLoading(true);
      Promise.all([
        api.get('/locations/all').catch(() => ({ data: [] })),
        api.get('/departments?limit=100').catch(() => ({ data: [] })),
      ])
        .then(([locRes, deptRes]) => {
          const fetchedLocs = Array.isArray(locRes?.data) && locRes.data.length > 0 ? locRes.data : CANONICAL_HUB_STORES;
          setDialogLocations(fetchedLocs);
          setDialogDepartments(deptRes?.data?.departments || deptRes?.data || []);
        })
        .catch(() => {
          setDialogLocations(CANONICAL_HUB_STORES);
        })
        .finally(() => {
          setDepartmentsLoading(false);
        });
    }
  }, [isAddEmployeeOpen]);

  // Active KPI Detail Drawer
  const [activeKpiDrawer, setActiveKpiDrawer] = useState<KpiDrawerType | null>(null);

  // Calendar Day Selection for October 2024
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<number>(14);

  // Hover states for chart tooltips
  const [hoveredSlice, setHoveredSlice] = useState<string | null>(null);
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);

  // October 2024 days with high leave volume (amber / red dots)
  const highLeaveDays: Record<number, { count: number; severity: 'amber' | 'red' }> = {
    4: { count: 18, severity: 'amber' },
    11: { count: 22, severity: 'amber' },
    14: { count: 31, severity: 'red' }, // Today
    18: { count: 24, severity: 'amber' },
    25: { count: 28, severity: 'amber' },
    31: { count: 42, severity: 'red' }, // Diwali Festival
  };

  // 6-Month Headcount & Turnover Data
  const workforceTrend = [
    { month: 'May', headcount: 1280, joinings: 28, exits: 10 },
    { month: 'Jun', headcount: 1304, joinings: 32, exits: 8 },
    { month: 'Jul', headcount: 1328, joinings: 30, exits: 6 },
    { month: 'Aug', headcount: 1340, joinings: 24, exits: 12 },
    { month: 'Sep', headcount: 1348, joinings: 20, exits: 12 },
    { month: 'Oct', headcount: 1372, joinings: 36, exits: 12 },
  ];

  // Dynamic KPI Stats calculated from active filters
  const kpiStats = useMemo(() => {
    let headcount = 1372;
    let newJoiners = 24;
    let present = 1145;
    let absent = 46;
    let unplannedAbsent = 12;
    let onLeave = 31;
    let returnTomorrow = 9;
    let late = 18;
    let lateFollowUp = 6;
    let openPositions = 12;
    let urgentPositions = 4;

    if (selectedHub === 'davanagere') {
      headcount = 420; newJoiners = 8; present = 351; absent = 16; unplannedAbsent = 4; onLeave = 11; returnTomorrow = 3; late = 6; lateFollowUp = 2; openPositions = 4; urgentPositions = 2;
    } else if (selectedHub === 'belagavi') {
      headcount = 360; newJoiners = 6; present = 301; absent = 14; unplannedAbsent = 3; onLeave = 8; returnTomorrow = 2; late = 5; lateFollowUp = 2; openPositions = 3; urgentPositions = 1;
    } else if (selectedHub === 'hubli') {
      headcount = 310; newJoiners = 5; present = 259; absent = 10; unplannedAbsent = 3; onLeave = 7; returnTomorrow = 2; late = 4; lateFollowUp = 1; openPositions = 3; urgentPositions = 1;
    } else if (selectedHub === 'bengaluru') {
      headcount = 282; newJoiners = 5; present = 234; absent = 6; unplannedAbsent = 2; onLeave = 5; returnTomorrow = 2; late = 3; lateFollowUp = 1; openPositions = 2; urgentPositions = 0;
    }

    if (selectedDepartment === 'sales') {
      const ratio = 0.354;
      headcount = Math.round(headcount * ratio);
      newJoiners = Math.max(1, Math.round(newJoiners * ratio));
      present = Math.round(present * ratio);
      absent = Math.max(1, Math.round(absent * ratio));
      unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
      onLeave = Math.max(1, Math.round(onLeave * ratio));
      returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
      late = Math.max(1, Math.round(late * ratio));
      lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
      openPositions = Math.max(1, Math.round(openPositions * 0.4));
      urgentPositions = Math.max(1, Math.round(urgentPositions * 0.4));
    } else if (selectedDepartment === 'operations') {
      const ratio = 0.227;
      headcount = Math.round(headcount * ratio);
      newJoiners = Math.max(1, Math.round(newJoiners * ratio));
      present = Math.round(present * ratio);
      absent = Math.max(1, Math.round(absent * ratio));
      unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
      onLeave = Math.max(1, Math.round(onLeave * ratio));
      returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
      late = Math.max(1, Math.round(late * ratio));
      lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
      openPositions = Math.max(1, Math.round(openPositions * 0.25));
      urgentPositions = Math.max(1, Math.round(urgentPositions * 0.25));
    } else if (selectedDepartment === 'warehouse') {
      const ratio = 0.163;
      headcount = Math.round(headcount * ratio);
      newJoiners = Math.max(1, Math.round(newJoiners * ratio));
      present = Math.round(present * ratio);
      absent = Math.max(1, Math.round(absent * ratio));
      unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
      onLeave = Math.max(1, Math.round(onLeave * ratio));
      returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
      late = Math.max(1, Math.round(late * ratio));
      lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
      openPositions = Math.max(1, Math.round(openPositions * 0.25));
      urgentPositions = Math.max(1, Math.round(urgentPositions * 0.25));
    } else if (selectedDepartment === 'finance-hr') {
      const ratio = 0.063;
      headcount = Math.round(headcount * ratio);
      newJoiners = Math.max(1, Math.round(newJoiners * ratio));
      present = Math.round(present * ratio);
      absent = Math.max(1, Math.round(absent * ratio));
      unplannedAbsent = Math.max(0, Math.round(unplannedAbsent * ratio));
      onLeave = Math.max(1, Math.round(onLeave * ratio));
      returnTomorrow = Math.max(0, Math.round(returnTomorrow * ratio));
      late = Math.max(1, Math.round(late * ratio));
      lateFollowUp = Math.max(0, Math.round(lateFollowUp * ratio));
      openPositions = Math.max(0, Math.round(openPositions * 0.1));
      urgentPositions = 0;
    } else if (selectedDepartment === 'others') {
      const ratio = 0.192;
      headcount = Math.round(headcount * ratio);
      newJoiners = Math.max(1, Math.round(newJoiners * ratio));
      present = Math.round(present * ratio);
      absent = Math.max(1, Math.round(absent * ratio));
      unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
      onLeave = Math.max(1, Math.round(onLeave * ratio));
      returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
      late = Math.max(1, Math.round(late * ratio));
      lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
      openPositions = Math.max(1, Math.round(openPositions * 0.1));
      urgentPositions = Math.max(0, Math.round(urgentPositions * 0.1));
    }

    const attendanceRate = ((present / (headcount || 1)) * 100).toFixed(1);

    return {
      headcount: headcount.toLocaleString(),
      newJoiners,
      present: present.toLocaleString(),
      attendanceRate,
      absent,
      unplannedAbsent,
      onLeave,
      returnTomorrow,
      late,
      lateFollowUp,
      openPositions,
      urgentPositions,
    };
  }, [selectedHub, selectedDepartment]);

  // Export report action
  const handleExportReport = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Metric,Value,Supporting Note\n' +
      'Total Headcount,1372,+24 this month\n' +
      'Present Today,1145,83.5% attendance\n' +
      'Absent Today,46,12 unplanned absences\n' +
      'On Leave,31,9 return tomorrow\n' +
      'Late Arrivals,18,6 need follow-up\n' +
      'Open Positions,12,4 urgent vacancies\n';
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Textiles_Workforce_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Workforce Report exported successfully!');
  };

  return (
    <div className="space-y-6">
      {/* 4. MAIN DASHBOARD HEADING */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-2 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-500/20">
              HR Command Center
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              Monday, 14 October 2024
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Good morning, Super Admin
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Here is your workforce overview for today across all textile showrooms, retail hubs, and central warehouses in Karnataka.
          </p>
        </div>

        {/* Global Hub, Dept & Timeframe Filters + CTA Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Hub Selector */}
          <div className="relative">
            <select
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              className="appearance-none bg-white dark:bg-[#131d36] text-slate-700 dark:text-slate-200 text-xs font-bold pl-3 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Hubs (4 Locations)</option>
              <option value="davanagere">Davanagere Mega Store</option>
              <option value="belagavi">Belagavi Flagship</option>
              <option value="hubli">Hubli Warehouse</option>
              <option value="bengaluru">Bengaluru Store</option>
            </select>
            <Building2 className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Department Selector */}
          <div className="relative">
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="appearance-none bg-white dark:bg-[#131d36] text-slate-700 dark:text-slate-200 text-xs font-bold pl-3 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All Departments</option>
              <option value="sales">Sales & Retail (486)</option>
              <option value="operations">Operations (312)</option>
              <option value="warehouse">Warehouse (224)</option>
              <option value="finance-hr">Finance & HR (86)</option>
              <option value="others">Others (264)</option>
            </select>
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Timeframe Selector */}
          <div className="relative">
            <select
              value={selectedTimeframe}
              onChange={(e) => setSelectedTimeframe(e.target.value)}
              className="appearance-none bg-white dark:bg-[#131d36] text-slate-700 dark:text-slate-200 text-xs font-bold pl-3 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
            <Clock className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          {/* Secondary Action: Export Report */}
          <button
            onClick={handleExportReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-white dark:bg-[#131d36] border border-slate-200 dark:border-slate-800 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-blue-600 transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export Report</span>
          </button>

          {/* Primary Action: Add Employee */}
          <button
            onClick={() => {
              if (onOpenAddEmployee) {
                onOpenAddEmployee();
              } else {
                setIsAddEmployeeOpen(true);
              }
            }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 active:scale-[0.98] transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Add Employee</span>
          </button>
        </div>
      </div>

      {/* 5. KPI SUMMARY CARDS IN THE FIRST ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Total Headcount */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveKpiDrawer('headcount')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveKpiDrawer('headcount');
            }
          }}
          aria-label={`Total Headcount: ${kpiStats.headcount}. Click to view workforce details.`}
          className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-blue-400/80 dark:hover:border-blue-600/80 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-[#0e172a] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
              Total Headcount
            </span>
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/60 transition-colors">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpiStats.headcount}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                <span>+{kpiStats.newJoiners} this month</span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-blue-600 dark:text-blue-400 flex items-center">
                <span>View</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Present Today */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveKpiDrawer('present')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveKpiDrawer('present');
            }
          }}
          aria-label={`Present Today: ${kpiStats.present}. Click to view present employees.`}
          className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-emerald-400/80 dark:hover:border-emerald-600/80 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-[#0e172a] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
              Present Today
            </span>
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-900/60 transition-colors">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpiStats.present}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>{kpiStats.attendanceRate}% attendance</span>
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center">
                <span>View</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Absent Today */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveKpiDrawer('absent')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveKpiDrawer('absent');
            }
          }}
          aria-label={`Absent Today: ${kpiStats.absent}. Click to view absent employees.`}
          className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-rose-400/80 dark:hover:border-rose-600/80 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-rose-500 focus:ring-offset-2 dark:focus:ring-offset-[#0e172a] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">
              Absent Today
            </span>
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 group-hover:bg-rose-100 dark:group-hover:bg-rose-900/60 transition-colors">
              <UserX className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpiStats.absent}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                {kpiStats.unplannedAbsent} unplanned absences
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-rose-600 dark:text-rose-400 flex items-center">
                <span>View</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: On Leave */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveKpiDrawer('leave')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveKpiDrawer('leave');
            }
          }}
          aria-label={`On Leave Today: ${kpiStats.onLeave}. Click to view leave details.`}
          className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-purple-400/80 dark:hover:border-purple-600/80 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-[#0e172a] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
              On Leave
            </span>
            <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 group-hover:bg-purple-100 dark:group-hover:bg-purple-900/60 transition-colors">
              <CalendarDays className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpiStats.onLeave}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[11px] font-semibold text-purple-600 dark:text-purple-400">
                {kpiStats.returnTomorrow} return tomorrow
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-purple-600 dark:text-purple-400 flex items-center">
                <span>View</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Card 5: Late Arrivals */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveKpiDrawer('late')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveKpiDrawer('late');
            }
          }}
          aria-label={`Late Arrivals: ${kpiStats.late}. Click to view late arrivals.`}
          className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-amber-400/80 dark:hover:border-amber-600/80 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 dark:focus:ring-offset-[#0e172a] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
              Late Arrivals
            </span>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 group-hover:bg-amber-100 dark:group-hover:bg-amber-900/60 transition-colors">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpiStats.late}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                {kpiStats.lateFollowUp} need follow-up
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-amber-600 dark:text-amber-400 flex items-center">
                <span>View</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>

        {/* Card 6: Open Positions */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveKpiDrawer('open_positions')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveKpiDrawer('open_positions');
            }
          }}
          aria-label={`Open Positions: ${kpiStats.openPositions}. Click to view recruitment requisitions.`}
          className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-indigo-400/80 dark:hover:border-indigo-600/80 transition-all cursor-pointer group focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-[#0e172a] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
              Open Positions
            </span>
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/60 transition-colors">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {kpiStats.openPositions}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                {kpiStats.urgentPositions} urgent vacancies
              </div>
              <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center">
                <span>View</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 6. MAIN DASHBOARD CONTENT: TWO-COLUMN LAYOUT (65% / 35%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT COLUMN: ~65% (8/12 COLS) */}
        <div className="lg:col-span-8 space-y-6">
          {/* 7. LEFT COLUMN, FIRST LARGE CARD: Today's Attendance & Shift Coverage */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Today’s Attendance & Shift Coverage
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Live workforce availability across all hubs
                </p>
              </div>
              <Link
                href="/attendance/register"
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline"
              >
                <span>View Attendance Register</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Attendance Donut / Ring Chart + Legend */}
            <div className="py-6 flex flex-col md:flex-row items-center justify-around gap-6">
              {/* SVG Interactive Ring Chart */}
              <div className="relative w-48 h-48 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
                  {/* Background Track */}
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    className="stroke-slate-100 dark:stroke-slate-800"
                    strokeWidth="16"
                    fill="transparent"
                  />
                  {/* Segment: Present 1,145 (91.4%) */}
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    stroke="#10b981"
                    strokeWidth="16"
                    strokeDasharray="377"
                    strokeDashoffset={377 - (377 * 1145) / 1252}
                    fill="transparent"
                    strokeLinecap="round"
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    onMouseEnter={() => setHoveredSlice('Present: 1,145')}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                  {/* Segment: Absent 46 */}
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    stroke="#ef4444"
                    strokeWidth="16"
                    strokeDasharray="377"
                    strokeDashoffset={377 - (377 * 46) / 1252}
                    fill="transparent"
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    transform="rotate(320 80 80)"
                    onMouseEnter={() => setHoveredSlice('Absent: 46')}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                  {/* Segment: On Leave 31 */}
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    stroke="#8b5cf6"
                    strokeWidth="16"
                    strokeDasharray="377"
                    strokeDashoffset={377 - (377 * 31) / 1252}
                    fill="transparent"
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    transform="rotate(334 80 80)"
                    onMouseEnter={() => setHoveredSlice('On Leave: 31')}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                  {/* Segment: Late 18 */}
                  <circle
                    cx="80"
                    cy="80"
                    r="60"
                    stroke="#f59e0b"
                    strokeWidth="16"
                    strokeDasharray="377"
                    strokeDashoffset={377 - (377 * 18) / 1252}
                    fill="transparent"
                    className="transition-all duration-500 cursor-pointer hover:opacity-90"
                    transform="rotate(344 80 80)"
                    onMouseEnter={() => setHoveredSlice('Late: 18')}
                    onMouseLeave={() => setHoveredSlice(null)}
                  />
                </svg>

                {/* Donut Center Content */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                  {hoveredSlice ? (
                    <div className="animate-in fade-in duration-150">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Selected</span>
                      <div className="text-sm font-extrabold text-blue-600 dark:text-blue-400">{hoveredSlice}</div>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
                      <span className="text-xl font-black text-slate-900 dark:text-white">1,252</span>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">91.5% Active</span>
                    </>
                  )}
                </div>
              </div>

              {/* Legend with explicit counts */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-md">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#10b981]" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Present</span>
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1">1,145</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Absent</span>
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1">46</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6]" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">On Leave</span>
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1">31</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Late</span>
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1">18</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#94a3b8]" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">Not Punched</span>
                  </div>
                  <div className="text-base font-black text-slate-900 dark:text-white mt-1">12</div>
                </div>

                <div className="p-2.5 rounded-xl bg-blue-50/50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300">Scheduled</span>
                  </div>
                  <div className="text-base font-black text-blue-700 dark:text-blue-300 mt-1">1,252</div>
                </div>
              </div>
            </div>

            {/* Hub-wise coverage progress */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80 space-y-3.5">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-400">
                Hub-wise Shift Coverage
              </span>

              {/* Davanagere Mega Store — 92% Coverage — green progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Davanagere Mega Store</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">92% Coverage</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: '92%' }} />
                </div>
              </div>

              {/* Belagavi Flagship — 78% Coverage — amber progress bar and “Needs Attention” badge */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 dark:text-slate-200">Belagavi Flagship</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                      Needs Attention
                    </span>
                  </div>
                  <span className="font-extrabold text-amber-600 dark:text-amber-400">78% Coverage</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full transition-all duration-500" style={{ width: '78%' }} />
                </div>
              </div>

              {/* Hubli Warehouse — 96% Coverage — green progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Hubli Warehouse</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">96% Coverage</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: '96%' }} />
                </div>
              </div>

              {/* Bengaluru Store — 88% Coverage — blue progress bar */}
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-bold text-slate-800 dark:text-slate-200">Bengaluru Store</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400">88% Coverage</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full transition-all duration-500" style={{ width: '88%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* 9. LEFT COLUMN, SECOND ROW: Leave Availability & Upcoming Absences */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Leave Availability & Upcoming Absences
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  October 2024 monthly availability and team conflict analysis
                </p>
              </div>
              <Link
                href="/leaves"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 transition-colors"
              >
                <span>Open Leave Calendar</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5">
              {/* Mini Monthly Calendar for October 2024 */}
              <div className="md:col-span-6 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-black text-slate-800 dark:text-slate-200">October 2024</span>
                  <span className="text-[10px] font-bold text-slate-400">Festival Peak Period</span>
                </div>

                {/* Weekday headers */}
                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-extrabold text-slate-400 mb-1">
                  <span>Su</span>
                  <span>Mo</span>
                  <span>Tu</span>
                  <span>We</span>
                  <span>Th</span>
                  <span>Fr</span>
                  <span>Sa</span>
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-1 text-center text-xs">
                  {/* Empty cells for Sep offset (Oct 2024 starts on Tuesday) */}
                  <div className="py-1.5 text-slate-300 dark:text-slate-600">29</div>
                  <div className="py-1.5 text-slate-300 dark:text-slate-600">30</div>

                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                    const isSelected = selectedCalendarDay === day;
                    const highLeave = highLeaveDays[day];
                    const isToday = day === 14;

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
                      >
                        <span>{day}</span>
                        {highLeave && (
                          <span
                            className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full ${
                              highLeave.severity === 'red' ? 'bg-rose-500' : 'bg-amber-500'
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Leave Summary Metrics */}
              <div className="md:col-span-6 flex flex-col justify-between space-y-3">
                <div className="p-3.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/50">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-700 dark:text-purple-300">
                      <CalendarDays className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      31 Employees on Leave Today
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-8">
                    18 Planned Privilege Leaves, 9 Casual Leaves, 4 Sick Leaves.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/50">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-amber-500/20 text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      9 Upcoming Team Availability Conflicts
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-8">
                    Belagavi showroom sales counter has 5 overlapping requests for 18–20 Oct.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 rounded-lg bg-blue-500/20 text-blue-700 dark:text-blue-300">
                      <Clock className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      14 Leave Requests Pending Approval
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 pl-8">
                    Managers have reviewed 8; 6 awaiting HR Super Admin sign-off.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: ~35% (4/12 COLS) */}
        <div className="lg:col-span-4 space-y-6">
          {/* 8. RIGHT COLUMN, FIRST LARGE CARD: Action Center */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="pb-4 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Action Center
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                  48 Pending
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Pending approvals and items needing attention
              </p>
            </div>

            {/* Interactive Task Rows */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {/* 12 Leave Requests Pending — red/urgent */}
              <Link
                href="/leaves"
                className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                    12 Leave Requests Pending
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                    Urgent
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>

              {/* 8 Attendance Regularization Requests — orange */}
              <Link
                href="/attendance/missed-punching"
                className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                    8 Attendance Regularization Requests
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900">
                    Review
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>

              {/* 15 Employee Documents Pending — orange */}
              <Link
                href="/employees/documents"
                className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                    15 Employee Documents Pending
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900">
                    Dossier
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>

              {/* 6 Biometric Sync Failures — red */}
              <Link
                href="/attendance/devices"
                className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                    6 Biometric Sync Failures
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                    eSSL IoT
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>

              {/* 4 Probation Reviews Due — blue */}
              <Link
                href="/employees"
                className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                    4 Probation Reviews Due
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                    HR Review
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>

              {/* 3 Resignation Requests — purple */}
              <Link
                href="/employees/former"
                className="py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 px-2 -mx-2 rounded-xl transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 group-hover:text-blue-600 transition-colors">
                    3 Resignation Requests
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900">
                    Notice
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            </div>

            {/* Bottom link: View All Pending Actions → */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800/80">
              <Link
                href="/organization/approvals"
                className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 transition-colors"
              >
                <span>View All Pending Actions →</span>
              </Link>
            </div>
          </div>

          {/* 10. RIGHT COLUMN, SECOND CARD: Compliance Watch */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
            <div className="pb-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Compliance Watch
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Statutory and employee documentation alerts
                </p>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30">
                4 Critical
              </span>
            </div>

            {/* Compact Alert Items */}
            <div className="py-4 space-y-3">
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                <span>21 Employees Missing Aadhaar/PAN Documents</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                <span>8 Bank Account Verifications Pending</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-rose-500 mt-1 shrink-0" />
                <span>4 PF/ESI Enrollments Pending</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-blue-500 mt-1 shrink-0" />
                <span>6 Offer Letters Awaiting Signature</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-amber-500 mt-1 shrink-0" />
                <span>3 Employee IDs Expiring This Month</span>
              </div>
              <div className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                <span className="w-2 h-2 rounded-full bg-purple-500 mt-1 shrink-0" />
                <span>2 Shops & Establishments Compliance Tasks Due</span>
              </div>
            </div>

            {/* Action button: Review Compliance */}
            <div className="pt-2">
              <Link
                href="/reports"
                className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
              >
                <span>Review Compliance</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* 11. LOWER DASHBOARD SECTION: 4 EQUAL OPERATIONAL CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Onboarding */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Onboarding
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                Joining Week
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">8</div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
              Employees joining this week
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              3 documents pending · 2 assets pending
            </p>
          </div>
          <div className="pt-4 mt-2">
            <Link
              href="/employees?filter=onboarding"
              className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 transition-colors"
            >
              View Onboarding
            </Link>
          </div>
        </div>

        {/* Card 2: Payroll Readiness */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Payroll Readiness
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                Oct Cycle
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">94%</div>
            {/* Horizontal progress bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 mt-2 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: '94%' }} />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
              12 employee records need review
            </p>
          </div>
          <div className="pt-4 mt-2">
            <Link
              href="/payroll"
              className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 transition-colors"
            >
              Open Payroll Checklist
            </Link>
          </div>
        </div>

        {/* Card 3: Recruitment Pipeline */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Recruitment Pipeline
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                12 Roles
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">86</div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
              Active candidates
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              9 interviews today · 4 offers pending
            </p>
          </div>
          <div className="pt-4 mt-2">
            <Link
              href="/organization/approvals"
              className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 transition-colors"
            >
              View Recruitment
            </Link>
          </div>
        </div>

        {/* Card 4: Employee Lifecycle */}
        <div className="p-5 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between hover:shadow-md transition-all">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Employee Lifecycle
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                Exits & F&F
              </span>
            </div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-2">6</div>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-1">
              Employees on notice period
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              3 F&F settlements pending
            </p>
          </div>
          <div className="pt-4 mt-2">
            <Link
              href="/employees/former"
              className="flex items-center justify-center w-full py-2 rounded-xl text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 transition-colors"
            >
              View Separations
            </Link>
          </div>
        </div>
      </div>

      {/* 12. BOTTOM ANALYTICS AREA (WORKFORCE INSIGHTS & ANNOUNCEMENTS) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 12. Workforce Insights Card (Larger: 8/12 cols) */}
        <div className="lg:col-span-8 p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                Workforce Insights
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                6-month headcount growth, joinings vs exits, and department distribution
              </p>
            </div>
            <Link
              href="/employees/analysis"
              className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline"
            >
              <span>View Workforce Analytics</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-5">
            {/* Charts Column (7/12) */}
            <div className="md:col-span-7 space-y-6">
              {/* Line chart: Headcount trend for the last 6 months */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Headcount Trend (Last 6 Months)
                  </span>
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    +7.18% Growth
                  </span>
                </div>
                {/* SVG Line Chart */}
                <div className="h-32 w-full">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 320 100">
                    <defs>
                      <linearGradient id="hcGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0058be" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#0058be" stopOpacity="0.0" />
                      </linearGradient>
                    </defs>
                    {/* Area fill */}
                    <path
                      d="M 10 75 L 70 60 L 130 45 L 190 38 L 250 32 L 310 15 L 310 95 L 10 95 Z"
                      fill="url(#hcGradient)"
                    />
                    {/* Line path */}
                    <path
                      d="M 10 75 L 70 60 L 130 45 L 190 38 L 250 32 L 310 15"
                      fill="none"
                      stroke="#0058be"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    {/* Data dots */}
                    {[
                      { x: 10, y: 75, val: '1,280' },
                      { x: 70, y: 60, val: '1,304' },
                      { x: 130, y: 45, val: '1,328' },
                      { x: 190, y: 38, val: '1,340' },
                      { x: 250, y: 32, val: '1,348' },
                      { x: 310, y: 15, val: '1,372' },
                    ].map((pt, i) => (
                      <g key={i}>
                        <circle cx={pt.x} cy={pt.y} r="3.5" fill="#0058be" className="stroke-white dark:stroke-slate-900 stroke-2" />
                      </g>
                    ))}
                  </svg>
                  {/* Month X-Labels */}
                  <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                    <span>May</span>
                    <span>Jun</span>
                    <span>Jul</span>
                    <span>Aug</span>
                    <span>Sep</span>
                    <span>Oct</span>
                  </div>
                </div>
              </div>

              {/* Grouped Bar Chart: Joinings vs Exits */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Joinings vs Exits
                  </span>
                  <div className="flex items-center gap-3 text-[10px] font-bold">
                    <span className="flex items-center gap-1 text-emerald-600">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" /> Joinings
                    </span>
                    <span className="flex items-center gap-1 text-rose-500">
                      <span className="w-2 h-2 rounded-full bg-rose-500" /> Exits
                    </span>
                  </div>
                </div>
                {/* SVG Bar Chart */}
                <div className="h-28 w-full flex items-end justify-between gap-2 px-2 pt-2 border-b border-slate-100 dark:border-slate-800">
                  {workforceTrend.map((item, idx) => (
                    <div key={item.month} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <div className="flex items-end gap-1 w-full justify-center h-20">
                        {/* Joining bar */}
                        <div
                          className="w-2.5 sm:w-3.5 bg-emerald-500 hover:bg-emerald-600 rounded-t-sm transition-all"
                          style={{ height: `${(item.joinings / 40) * 100}%` }}
                          title={`${item.month} Joinings: ${item.joinings}`}
                        />
                        {/* Exit bar */}
                        <div
                          className="w-2.5 sm:w-3.5 bg-rose-400 hover:bg-rose-500 rounded-t-sm transition-all"
                          style={{ height: `${(item.exits / 40) * 100}%` }}
                          title={`${item.month} Exits: ${item.exits}`}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-slate-400">{item.month}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Department Distribution List (5/12) */}
            <div className="md:col-span-5 p-4 rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 space-y-3">
              <span className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Department Distribution
              </span>

              {/* Sales: 486 employees */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Sales & Showrooms</span>
                  <span className="font-extrabold text-blue-600 dark:text-blue-400">486</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full" style={{ width: '35.4%' }} />
                </div>
              </div>

              {/* Operations: 312 employees */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Operations & Retail</span>
                  <span className="font-extrabold text-indigo-600 dark:text-indigo-400">312</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full" style={{ width: '22.7%' }} />
                </div>
              </div>

              {/* Warehouse: 224 employees */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Central Warehouse</span>
                  <span className="font-extrabold text-amber-600 dark:text-amber-400">224</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-amber-500 rounded-full" style={{ width: '16.3%' }} />
                </div>
              </div>

              {/* Finance & HR: 86 employees */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Finance & HR HQ</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">86</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: '6.3%' }} />
                </div>
              </div>

              {/* Others: 264 employees */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Logistics & Support</span>
                  <span className="font-extrabold text-slate-600 dark:text-slate-400">264</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-slate-500 rounded-full" style={{ width: '19.2%' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 13. Announcements & Events Card (4/12 cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="pb-4 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Announcements & Events
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Internal notices, celebrations, and trainings
                </p>
              </div>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>

            <div className="py-4 space-y-3.5">
              {/* Diwali Holiday Notice — 31 Oct 2024 */}
              <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-900/50 flex items-start gap-3">
                <span className="p-1.5 rounded-lg bg-amber-500 text-white shrink-0 mt-0.5">
                  <Calendar className="w-3.5 h-3.5" />
                </span>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Diwali Holiday Notice — 31 Oct 2024
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Showroom rosters adjusted for festival evening timings.
                  </div>
                </div>
              </div>

              {/* Updated Leave Policy Published */}
              <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/50 flex items-start gap-3">
                <span className="p-1.5 rounded-lg bg-blue-600 text-white shrink-0 mt-0.5">
                  <FileText className="w-3.5 h-3.5" />
                </span>
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    Updated Leave Policy Published
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Revision in casual leave rollover and compensatory off rules.
                  </div>
                </div>
              </div>

              {/* POSH Training: 82% Completed */}
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start gap-3">
                <span className="p-1.5 rounded-lg bg-purple-600 text-white shrink-0 mt-0.5">
                  <Award className="w-3.5 h-3.5" />
                </span>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      POSH Training: 82% Completed
                    </span>
                    <span className="text-[10px] font-extrabold text-purple-600 dark:text-purple-400">82%</span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 mt-1.5 overflow-hidden">
                    <div className="h-full bg-purple-600 rounded-full" style={{ width: '82%' }} />
                  </div>
                </div>
              </div>

              {/* 12 Employee Birthdays Today */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                    <Cake className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    12 Employee Birthdays Today
                  </span>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                  Wishes Sent
                </span>
              </div>

              {/* 5 Work Anniversaries This Week */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800/60">
                <div className="flex items-center gap-2.5">
                  <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                    <Sparkles className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                    5 Work Anniversaries This Week
                  </span>
                </div>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                  5+ Years
                </span>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={() => toast.success('All announcements are up to date.')}
              className="w-full py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors"
            >
              Manage Notice Board
            </button>
          </div>
        </div>
      </div>

      {/* KPI Details Drawer */}
      <KpiDetailsDrawer
        type={activeKpiDrawer}
        onClose={() => setActiveKpiDrawer(null)}
        selectedHub={selectedHub}
        selectedDepartment={selectedDepartment}
        selectedTimeframe={selectedTimeframe}
      />

      {/* Add Employee Dialog */}
      {isAddEmployeeOpen && (
        <AddEmployeeDialog
          isOpen={isAddEmployeeOpen}
          onClose={() => setIsAddEmployeeOpen(false)}
          onSuccess={() => {
            setIsAddEmployeeOpen(false);
            toast.success('Employee created successfully!');
          }}
          locations={dialogLocations}
          departments={dialogDepartments}
          departmentsLoading={departmentsLoading}
        />
      )}
    </div>
  );
}
