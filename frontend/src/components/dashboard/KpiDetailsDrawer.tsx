'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  X,
  Search,
  Filter,
  Users,
  UserCheck,
  UserX,
  CalendarDays,
  Clock,
  Briefcase,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  TrendingUp,
  Building2,
  Calendar,
  Sparkles,
  PhoneCall,
  UserPlus,
  ArrowRight,
  BadgeCheck,
  ShieldAlert,
} from 'lucide-react';

export type KpiDrawerType = 'headcount' | 'present' | 'absent' | 'leave' | 'late' | 'open_positions';

interface KpiDetailsDrawerProps {
  type: KpiDrawerType | null;
  onClose: () => void;
  selectedHub: string;
  selectedDepartment: string;
  selectedTimeframe: string;
}

export function getFilteredMetrics(selectedHub: string, selectedDepartment: string) {
  let headcount = 1372;
  let permanent = 1120;
  let contract = 198;
  let trainees = 54;
  let newJoiners = 24;

  let present = 1145;
  let onTime = 1127;
  let earlyCheckIn = 184;
  let onShift = 892;

  let absent = 46;
  let unplannedAbsent = 12;
  let pendingRegularization = 18;
  let unexcusedNoShow = 16;

  let onLeave = 31;
  let returnTomorrow = 9;
  let earnedLeave = 14;
  let casualSickLeave = 17;

  let late = 18;
  let lateFollowUp = 6;
  let avgDelay = '24m';
  let lateTrend = '-4';

  let openPositions = 12;
  let urgentPositions = 4;
  let candidatesPipeline = 48;
  let interviewsToday = 6;
  let offersPending = 3;

  if (selectedHub === 'davanagere') {
    headcount = 420; permanent = 343; contract = 61; trainees = 16; newJoiners = 8;
    present = 351; onTime = 346; earlyCheckIn = 56; onShift = 274;
    absent = 16; unplannedAbsent = 4; pendingRegularization = 6; unexcusedNoShow = 6;
    onLeave = 11; returnTomorrow = 3; earnedLeave = 5; casualSickLeave = 6;
    late = 6; lateFollowUp = 2; avgDelay = '26m'; lateTrend = '-1';
    openPositions = 4; urgentPositions = 2; candidatesPipeline = 16; interviewsToday = 2; offersPending = 1;
  } else if (selectedHub === 'belagavi') {
    headcount = 360; permanent = 294; contract = 52; trainees = 14; newJoiners = 6;
    present = 301; onTime = 296; earlyCheckIn = 48; onShift = 235;
    absent = 14; unplannedAbsent = 3; pendingRegularization = 6; unexcusedNoShow = 5;
    onLeave = 8; returnTomorrow = 2; earnedLeave = 4; casualSickLeave = 4;
    late = 5; lateFollowUp = 2; avgDelay = '24m'; lateTrend = '-1';
    openPositions = 3; urgentPositions = 1; candidatesPipeline = 14; interviewsToday = 2; offersPending = 1;
  } else if (selectedHub === 'hubli') {
    headcount = 310; permanent = 253; contract = 45; trainees = 12; newJoiners = 5;
    present = 259; onTime = 255; earlyCheckIn = 42; onShift = 202;
    absent = 10; unplannedAbsent = 3; pendingRegularization = 4; unexcusedNoShow = 3;
    onLeave = 7; returnTomorrow = 2; earnedLeave = 3; casualSickLeave = 4;
    late = 4; lateFollowUp = 1; avgDelay = '22m'; lateTrend = '-1';
    openPositions = 3; urgentPositions = 1; candidatesPipeline = 10; interviewsToday = 1; offersPending = 1;
  } else if (selectedHub === 'bengaluru') {
    headcount = 282; permanent = 230; contract = 40; trainees = 12; newJoiners = 5;
    present = 234; onTime = 230; earlyCheckIn = 38; onShift = 181;
    absent = 6; unplannedAbsent = 2; pendingRegularization = 2; unexcusedNoShow = 2;
    onLeave = 5; returnTomorrow = 2; earnedLeave = 2; casualSickLeave = 3;
    late = 3; lateFollowUp = 1; avgDelay = '20m'; lateTrend = '-1';
    openPositions = 2; urgentPositions = 0; candidatesPipeline = 8; interviewsToday = 1; offersPending = 0;
  }

  if (selectedDepartment === 'sales') {
    const ratio = 0.354;
    headcount = Math.round(headcount * ratio);
    permanent = Math.round(permanent * ratio);
    contract = Math.round(contract * ratio);
    newJoiners = Math.max(1, Math.round(newJoiners * ratio));
    present = Math.round(present * ratio);
    onTime = Math.round(onTime * ratio);
    earlyCheckIn = Math.round(earlyCheckIn * ratio);
    onShift = Math.round(onShift * ratio);
    absent = Math.max(1, Math.round(absent * ratio));
    unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
    pendingRegularization = Math.max(1, Math.round(pendingRegularization * ratio));
    unexcusedNoShow = Math.max(1, Math.round(unexcusedNoShow * ratio));
    onLeave = Math.max(1, Math.round(onLeave * ratio));
    returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
    earnedLeave = Math.max(1, Math.round(earnedLeave * ratio));
    casualSickLeave = Math.max(1, Math.round(casualSickLeave * ratio));
    late = Math.max(1, Math.round(late * ratio));
    lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
    openPositions = Math.max(1, Math.round(openPositions * 0.4));
    urgentPositions = Math.max(1, Math.round(urgentPositions * 0.4));
  } else if (selectedDepartment === 'operations') {
    const ratio = 0.227;
    headcount = Math.round(headcount * ratio);
    permanent = Math.round(permanent * ratio);
    contract = Math.round(contract * ratio);
    newJoiners = Math.max(1, Math.round(newJoiners * ratio));
    present = Math.round(present * ratio);
    onTime = Math.round(onTime * ratio);
    earlyCheckIn = Math.round(earlyCheckIn * ratio);
    onShift = Math.round(onShift * ratio);
    absent = Math.max(1, Math.round(absent * ratio));
    unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
    pendingRegularization = Math.max(1, Math.round(pendingRegularization * ratio));
    unexcusedNoShow = Math.max(1, Math.round(unexcusedNoShow * ratio));
    onLeave = Math.max(1, Math.round(onLeave * ratio));
    returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
    earnedLeave = Math.max(1, Math.round(earnedLeave * ratio));
    casualSickLeave = Math.max(1, Math.round(casualSickLeave * ratio));
    late = Math.max(1, Math.round(late * ratio));
    lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
    openPositions = Math.max(1, Math.round(openPositions * 0.25));
    urgentPositions = Math.max(1, Math.round(urgentPositions * 0.25));
  } else if (selectedDepartment === 'warehouse') {
    const ratio = 0.163;
    headcount = Math.round(headcount * ratio);
    permanent = Math.round(permanent * ratio);
    contract = Math.round(contract * ratio);
    newJoiners = Math.max(1, Math.round(newJoiners * ratio));
    present = Math.round(present * ratio);
    onTime = Math.round(onTime * ratio);
    earlyCheckIn = Math.round(earlyCheckIn * ratio);
    onShift = Math.round(onShift * ratio);
    absent = Math.max(1, Math.round(absent * ratio));
    unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
    pendingRegularization = Math.max(1, Math.round(pendingRegularization * ratio));
    unexcusedNoShow = Math.max(1, Math.round(unexcusedNoShow * ratio));
    onLeave = Math.max(1, Math.round(onLeave * ratio));
    returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
    earnedLeave = Math.max(1, Math.round(earnedLeave * ratio));
    casualSickLeave = Math.max(1, Math.round(casualSickLeave * ratio));
    late = Math.max(1, Math.round(late * ratio));
    lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
    openPositions = Math.max(1, Math.round(openPositions * 0.25));
    urgentPositions = Math.max(1, Math.round(urgentPositions * 0.25));
  } else if (selectedDepartment === 'finance-hr') {
    const ratio = 0.063;
    headcount = Math.round(headcount * ratio);
    permanent = Math.round(permanent * ratio);
    contract = Math.round(contract * ratio);
    newJoiners = Math.max(1, Math.round(newJoiners * ratio));
    present = Math.round(present * ratio);
    onTime = Math.round(onTime * ratio);
    earlyCheckIn = Math.round(earlyCheckIn * ratio);
    onShift = Math.round(onShift * ratio);
    absent = Math.max(1, Math.round(absent * ratio));
    unplannedAbsent = Math.max(0, Math.round(unplannedAbsent * ratio));
    pendingRegularization = Math.max(1, Math.round(pendingRegularization * ratio));
    unexcusedNoShow = Math.max(0, Math.round(unexcusedNoShow * ratio));
    onLeave = Math.max(1, Math.round(onLeave * ratio));
    returnTomorrow = Math.max(0, Math.round(returnTomorrow * ratio));
    earnedLeave = Math.max(1, Math.round(earnedLeave * ratio));
    casualSickLeave = Math.max(0, Math.round(casualSickLeave * ratio));
    late = Math.max(1, Math.round(late * ratio));
    lateFollowUp = Math.max(0, Math.round(lateFollowUp * ratio));
    openPositions = Math.max(0, Math.round(openPositions * 0.1));
    urgentPositions = 0;
  } else if (selectedDepartment === 'others') {
    const ratio = 0.192;
    headcount = Math.round(headcount * ratio);
    permanent = Math.round(permanent * ratio);
    contract = Math.round(contract * ratio);
    newJoiners = Math.max(1, Math.round(newJoiners * ratio));
    present = Math.round(present * ratio);
    onTime = Math.round(onTime * ratio);
    earlyCheckIn = Math.round(earlyCheckIn * ratio);
    onShift = Math.round(onShift * ratio);
    absent = Math.max(1, Math.round(absent * ratio));
    unplannedAbsent = Math.max(1, Math.round(unplannedAbsent * ratio));
    pendingRegularization = Math.max(1, Math.round(pendingRegularization * ratio));
    unexcusedNoShow = Math.max(1, Math.round(unexcusedNoShow * ratio));
    onLeave = Math.max(1, Math.round(onLeave * ratio));
    returnTomorrow = Math.max(1, Math.round(returnTomorrow * ratio));
    earnedLeave = Math.max(1, Math.round(earnedLeave * ratio));
    casualSickLeave = Math.max(1, Math.round(casualSickLeave * ratio));
    late = Math.max(1, Math.round(late * ratio));
    lateFollowUp = Math.max(1, Math.round(lateFollowUp * ratio));
    openPositions = Math.max(1, Math.round(openPositions * 0.1));
    urgentPositions = Math.max(0, Math.round(urgentPositions * 0.1));
  }

  const attendanceRate = ((present / (headcount || 1)) * 100).toFixed(1);

  return {
    headcount: headcount.toLocaleString(),
    permanent: permanent.toLocaleString(),
    contract: contract.toLocaleString(),
    trainees: trainees.toLocaleString(),
    newJoiners,
    present: present.toLocaleString(),
    attendanceRate,
    onTime: onTime.toLocaleString(),
    earlyCheckIn: earlyCheckIn.toLocaleString(),
    onShift: onShift.toLocaleString(),
    absent,
    unplannedAbsent,
    pendingRegularization,
    unexcusedNoShow,
    onLeave,
    returnTomorrow,
    earnedLeave,
    casualSickLeave,
    late,
    lateFollowUp,
    avgDelay,
    lateTrend,
    openPositions,
    urgentPositions,
    candidatesPipeline,
    interviewsToday,
    offersPending,
  };
}

export function KpiDetailsDrawer({
  type,
  onClose,
  selectedHub,
  selectedDepartment,
  selectedTimeframe,
}: KpiDetailsDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard accessibility and body scroll lock
  useEffect(() => {
    if (!type) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    setSearchTerm('');

    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      clearTimeout(timer);
    };
  }, [type, onClose]);

  // Formatted context labels
  const hubLabels: Record<string, string> = {
    all: 'All Karnataka Hubs (4 Locations)',
    davanagere: 'Davanagere Mega Store',
    belagavi: 'Belagavi Flagship',
    hubli: 'Hubli Warehouse',
    bengaluru: 'Bengaluru Store',
  };

  const deptLabels: Record<string, string> = {
    all: 'All Departments',
    sales: 'Sales & Retail',
    operations: 'Operations',
    warehouse: 'Warehouse & Logistics',
    'finance-hr': 'Finance & HR',
    others: 'Others / Merchandising',
  };

  const activeFilterSummary = `${hubLabels[selectedHub] || 'All Hubs'} • ${deptLabels[selectedDepartment] || 'All Departments'} • Today`;

  if (!mounted || !type) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kpi-drawer-title"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 dark:bg-black/60 transition-opacity backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer */}
      <div className="relative z-10 w-full sm:w-[90vw] md:w-[760px] lg:w-[820px] max-w-full h-full bg-white dark:bg-[#0e172a] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-200 ease-out">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 px-6 py-4 bg-white dark:bg-[#0e172a] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              {type === 'headcount' && (
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
                  <Users className="w-5 h-5" />
                </div>
              )}
              {type === 'present' && (
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
                  <UserCheck className="w-5 h-5" />
                </div>
              )}
              {type === 'absent' && (
                <div className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400">
                  <UserX className="w-5 h-5" />
                </div>
              )}
              {type === 'leave' && (
                <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
                  <CalendarDays className="w-5 h-5" />
                </div>
              )}
              {type === 'late' && (
                <div className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400">
                  <Clock className="w-5 h-5" />
                </div>
              )}
              {type === 'open_positions' && (
                <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                  <Briefcase className="w-5 h-5" />
                </div>
              )}

              <div>
                <h2
                  id="kpi-drawer-title"
                  className="text-lg font-black text-slate-900 dark:text-white tracking-tight"
                >
                  {type === 'headcount' && 'Total Headcount'}
                  {type === 'present' && 'Present Today'}
                  {type === 'absent' && 'Absent Today'}
                  {type === 'leave' && 'On Leave'}
                  {type === 'late' && 'Late Arrivals'}
                  {type === 'open_positions' && 'Open Positions'}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {type === 'headcount' && 'Active workforce across selected hubs and departments'}
                  {type === 'present' && 'Employees marked present for the selected date'}
                  {type === 'absent' && 'Employees not marked present and not on approved leave'}
                  {type === 'leave' && 'Employees with approved leave for the selected date'}
                  {type === 'late' && 'Employees who clocked in after their allowed shift grace period'}
                  {type === 'open_positions' && 'Active recruitment requisitions across the organization'}
                </p>
              </div>
            </div>

            {/* Filter Context Badge */}
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <Filter className="w-3 h-3 text-slate-400" />
                {activeFilterSummary}
              </span>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close details (Esc)"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Drawer Body - Scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {type === 'headcount' && (
            <HeadcountDetail
              selectedHub={selectedHub}
              selectedDepartment={selectedDepartment}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
            />
          )}

          {type === 'present' && (
            <PresentDetail
              selectedHub={selectedHub}
              selectedDepartment={selectedDepartment}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
            />
          )}

          {type === 'absent' && (
            <AbsentDetail
              selectedHub={selectedHub}
              selectedDepartment={selectedDepartment}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
            />
          )}

          {type === 'leave' && (
            <LeaveDetail
              selectedHub={selectedHub}
              selectedDepartment={selectedDepartment}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
            />
          )}

          {type === 'late' && (
            <LateDetail
              selectedHub={selectedHub}
              selectedDepartment={selectedDepartment}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
            />
          )}

          {type === 'open_positions' && (
            <OpenPositionsDetail
              selectedHub={selectedHub}
              selectedDepartment={selectedDepartment}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
            />
          )}
        </div>

        {/* Sticky Footer Action */}
        <div className="sticky bottom-0 z-20 px-6 py-3.5 bg-slate-50 dark:bg-[#0b1222] border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            BSC Textiles Karnataka Operations
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Close
            </button>

            {type === 'headcount' && (
              <Link
                href="/employees"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all"
              >
                <span>View Employee Directory</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}

            {type === 'present' && (
              <Link
                href="/attendance/register"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-all"
              >
                <span>View Attendance Register</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}

            {type === 'absent' && (
              <Link
                href="/attendance/register?status=ABSENT"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-sm transition-all"
              >
                <span>Review Attendance Exceptions</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}

            {type === 'leave' && (
              <Link
                href="/leaves"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 shadow-sm transition-all"
              >
                <span>Open Leave Management</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}

            {type === 'late' && (
              <Link
                href="/attendance/late-fines"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 shadow-sm transition-all"
              >
                <span>Review Attendance Exceptions</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}

            {type === 'open_positions' && (
              <Link
                href="/operations/kyc"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all"
              >
                <span>View Recruitment</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// A. TOTAL HEADCOUNT DETAIL COMPONENT
// ==========================================
function HeadcountDetail({
  selectedHub,
  selectedDepartment,
  searchTerm,
  setSearchTerm,
}: {
  selectedHub: string;
  selectedDepartment: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const metrics = useMemo(() => getFilteredMetrics(selectedHub, selectedDepartment), [selectedHub, selectedDepartment]);

  const hubs = [
    { key: 'davanagere', name: 'Davanagere Mega Store', count: 420, percent: 30.6, type: 'Retail Mega Store' },
    { key: 'belagavi', name: 'Belagavi Flagship', count: 360, percent: 26.2, type: 'Silk & Suiting Hub' },
    { key: 'hubli', name: 'Hubli Warehouse', count: 310, percent: 22.6, type: 'Central Logistics Depot' },
    { key: 'bengaluru', name: 'Bengaluru Store', count: 282, percent: 20.6, type: 'Commercial Showroom' },
  ];

  const departments = [
    { key: 'sales', name: 'Sales & Retail', count: 486, percent: 35.4 },
    { key: 'operations', name: 'Operations', count: 312, percent: 22.7 },
    { key: 'warehouse', name: 'Warehouse & Logistics', count: 224, percent: 16.3 },
    { key: 'finance-hr', name: 'Finance & HR', count: 86, percent: 6.3 },
    { key: 'others', name: 'Others / Merchandising', count: 264, percent: 19.2 },
  ];

  const recentJoiners = [
    { name: 'Basavaraj Hugar', id: 'BSC-DVG-0842', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Davanagere Mega Store', hubKey: 'davanagere', date: '12 Oct 2024', type: 'Permanent' },
    { name: 'Pooja Kulkarni', id: 'BSC-BLG-0841', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', date: '10 Oct 2024', type: 'Permanent' },
    { name: 'Kiran Nayak', id: 'BSC-HBL-0840', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', date: '08 Oct 2024', type: 'Contract' },
    { name: 'Suma Shetty', id: 'BSC-BLR-0839', dept: 'Operations', deptKey: 'operations', hub: 'Bengaluru Store', hubKey: 'bengaluru', date: '07 Oct 2024', type: 'Permanent' },
    { name: 'Vinay Patil', id: 'BSC-DVG-0838', dept: 'Finance & HR', deptKey: 'finance-hr', hub: 'Davanagere Mega Store', hubKey: 'davanagere', date: '04 Oct 2024', type: 'Permanent' },
    { name: 'Megha Biradar', id: 'BSC-BLG-0837', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', date: '03 Oct 2024', type: 'Trainee' },
    { name: 'Santosh Badiger', id: 'BSC-HBL-0836', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', date: '02 Oct 2024', type: 'Permanent' },
    { name: 'Radhika Deshpande', id: 'BSC-BLR-0835', dept: 'Operations', deptKey: 'operations', hub: 'Bengaluru Store', hubKey: 'bengaluru', date: '01 Oct 2024', type: 'Permanent' },
  ];

  const filteredJoiners = recentJoiners.filter((j) => {
    if (selectedHub !== 'all' && j.hubKey !== selectedHub) return false;
    if (selectedDepartment !== 'all' && j.deptKey !== selectedDepartment) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        j.name.toLowerCase().includes(q) ||
        j.id.toLowerCase().includes(q) ||
        j.dept.toLowerCase().includes(q) ||
        j.hub.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60">
          <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300">Total Active</div>
          <div className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-1">{metrics.headcount}</div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">Across Karnataka</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Permanent</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.permanent}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Core headcount</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Contract / Off-roll</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.contract}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">Retail floor & depot</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">New This Month</div>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">+{metrics.newJoiners}</div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">{metrics.trainees} Trainees active</div>
        </div>
      </div>

      {/* Hub & Department Distribution Grids */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Hub-wise Distribution */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              Hub-wise Distribution
            </span>
            <span className="text-[11px] font-semibold text-slate-400">4 Locations</span>
          </div>

          <div className="space-y-3 mt-3">
            {hubs.map((hub) => (
              <div key={hub.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${selectedHub === hub.key ? 'text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                    {hub.name}
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {hub.count} <span className="text-[10px] text-slate-400 font-normal">({hub.percent}%)</span>
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all"
                    style={{ width: `${hub.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Department Distribution */}
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              Department Distribution
            </span>
            <span className="text-[11px] font-semibold text-slate-400">5 Functions</span>
          </div>

          <div className="space-y-3 mt-3">
            {departments.map((dept) => (
              <div key={dept.key} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${selectedDepartment === dept.key ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-700 dark:text-slate-300'}`}>
                    {dept.name}
                  </span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {dept.count} <span className="text-[10px] text-slate-400 font-normal">({dept.percent}%)</span>
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${dept.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Joiners Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Recent Joiners This Month ({filteredJoiners.length})
            </h3>
            <p className="text-[11px] text-slate-500">Newly onboarded personnel across Karnataka hubs</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search recent joiners..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Emp ID</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Hub</th>
                <th className="py-2.5 px-3">Joining Date</th>
                <th className="py-2.5 px-3">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#131d36]">
              {filteredJoiners.map((j) => (
                <tr key={j.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-[10px]">
                        {j.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{j.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">{j.id}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{j.dept}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{j.hub}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{j.date}</td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      {j.type}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredJoiners.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    No joiner records found matching filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// B. PRESENT TODAY DETAIL COMPONENT
// ==========================================
function PresentDetail({
  selectedHub,
  selectedDepartment,
  searchTerm,
  setSearchTerm,
}: {
  selectedHub: string;
  selectedDepartment: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const metrics = useMemo(() => getFilteredMetrics(selectedHub, selectedDepartment), [selectedHub, selectedDepartment]);

  const presentEmployees = [
    { name: 'Anand Kulkarni', id: 'BSC-DVG-0104', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shift: 'Shift 1 (09:00 - 18:00)', clockIn: '08:48 AM', status: 'On Time' },
    { name: 'Mallikarjun Patil', id: 'BSC-DVG-0108', dept: 'Operations', deptKey: 'operations', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shift: 'Shift 1 (09:00 - 18:00)', clockIn: '08:52 AM', status: 'On Time' },
    { name: 'Priyanka Rao', id: 'BSC-BLG-0205', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', shift: 'Shift 1 (09:00 - 18:00)', clockIn: '08:45 AM', status: 'Early Check-in' },
    { name: 'Ramesh Joshi', id: 'BSC-BLG-0210', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Belagavi Flagship', hubKey: 'belagavi', shift: 'Shift 1 (09:00 - 18:00)', clockIn: '08:55 AM', status: 'On Time' },
    { name: 'Deepa Hegde', id: 'BSC-HBL-0312', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', shift: 'General (10:00 - 19:00)', clockIn: '09:42 AM', status: 'Early Check-in' },
    { name: 'Siddhesh Angadi', id: 'BSC-HBL-0320', dept: 'Operations', deptKey: 'operations', hub: 'Hubli Warehouse', hubKey: 'hubli', shift: 'Shift 1 (09:00 - 18:00)', clockIn: '08:50 AM', status: 'On Time' },
    { name: 'Ayesha Khan', id: 'BSC-BLR-0414', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Bengaluru Store', hubKey: 'bengaluru', shift: 'Shift 1 (09:00 - 18:00)', clockIn: '08:58 AM', status: 'On Time' },
    { name: 'Chetan Desai', id: 'BSC-BLR-0422', dept: 'Finance & HR', deptKey: 'finance-hr', hub: 'Bengaluru Store', hubKey: 'bengaluru', shift: 'General (10:00 - 19:00)', clockIn: '09:50 AM', status: 'On Time' },
    { name: 'Suresh Kumar', id: 'BSC-DVG-0118', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shift: 'Shift 2 (13:00 - 22:00)', clockIn: '12:45 PM', status: 'On Time' },
    { name: 'Kavitha Shenoy', id: 'BSC-BLG-0226', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', shift: 'Shift 2 (13:00 - 22:00)', clockIn: '12:50 PM', status: 'On Time' },
  ];

  const filtered = presentEmployees.filter((emp) => {
    if (selectedHub !== 'all' && emp.hubKey !== selectedHub) return false;
    if (selectedDepartment !== 'all' && emp.deptKey !== selectedDepartment) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.dept.toLowerCase().includes(q) ||
        emp.hub.toLowerCase().includes(q) ||
        emp.shift.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Present Today</div>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">{metrics.present}</div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">{metrics.attendanceRate}% attendance rate</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">On-Time Arrivals</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.onTime}</div>
          <div className="text-[10px] text-emerald-600 font-medium mt-0.5">Punctual clock-ins</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Early Check-ins</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.earlyCheckIn}</div>
          <div className="text-[10px] text-blue-600 font-medium mt-0.5">&gt;15 mins early</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60">
          <div className="text-[11px] font-bold text-blue-700 dark:text-blue-300">Currently On Shift</div>
          <div className="text-2xl font-black text-blue-900 dark:text-blue-100 mt-1">{metrics.onShift}</div>
          <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold mt-0.5">Floor coverage active</div>
        </div>
      </div>

      {/* Search & List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Verified Present Personnel ({filtered.length} shown)
            </h3>
            <p className="text-[11px] text-slate-500">Live biometric eSSL RFID timestamps recorded</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search present employees..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Emp ID</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Hub</th>
                <th className="py-2.5 px-3">Shift</th>
                <th className="py-2.5 px-3">Clock-In</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#131d36]">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold flex items-center justify-center text-[10px]">
                        {emp.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{emp.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">{emp.id}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{emp.dept}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{emp.hub}</td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{emp.shift}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-400">{emp.clockIn}</td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Present
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No present records found matching criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// C. ABSENT TODAY DETAIL COMPONENT
// ==========================================
function AbsentDetail({
  selectedHub,
  selectedDepartment,
  searchTerm,
  setSearchTerm,
}: {
  selectedHub: string;
  selectedDepartment: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const metrics = useMemo(() => getFilteredMetrics(selectedHub, selectedDepartment), [selectedHub, selectedDepartment]);

  const absentEmployees = [
    { name: 'Manjunath Gowda', id: 'BSC-DVG-0145', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shift: 'Shift 1 (09:00 - 18:00)', reason: 'Unplanned Absence', isUnplanned: true, manager: 'Rajesh Patil', followUp: 'Action Required - Call unreached' },
    { name: 'Sharanappa Nayak', id: 'BSC-DVG-0152', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shift: 'Shift 1 (09:00 - 18:00)', reason: 'Pending Regularization', isUnplanned: false, manager: 'Suresh Kumar', followUp: 'Medical certificate expected' },
    { name: 'Shruti Kamat', id: 'BSC-BLG-0240', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', shift: 'Shift 1 (09:00 - 18:00)', reason: 'Unplanned Absence', isUnplanned: true, manager: 'Priyanka Rao', followUp: 'Store lead notified' },
    { name: 'Gururaj Kulkarni', id: 'BSC-BLG-0255', dept: 'Operations', deptKey: 'operations', hub: 'Belagavi Flagship', hubKey: 'belagavi', shift: 'Shift 2 (13:00 - 22:00)', reason: 'No Call No Show', isUnplanned: true, manager: 'Ramesh Joshi', followUp: 'Escalated to HR Desk' },
    { name: 'Prashanth Bellary', id: 'BSC-HBL-0348', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', shift: 'Shift 1 (09:00 - 18:00)', reason: 'Unplanned Absence', isUnplanned: true, manager: 'Deepa Hegde', followUp: 'Follow-up pending' },
    { name: 'Laxmi Hiremath', id: 'BSC-HBL-0360', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', shift: 'General (10:00 - 19:00)', reason: 'Pending Regularization', isUnplanned: false, manager: 'Siddhesh Angadi', followUp: 'Attendance dispute filed' },
    { name: 'Naveen Kumar', id: 'BSC-BLR-0450', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Bengaluru Store', hubKey: 'bengaluru', shift: 'Shift 1 (09:00 - 18:00)', reason: 'Unplanned Absence', isUnplanned: true, manager: 'Ayesha Khan', followUp: 'Personal emergency reported' },
    { name: 'Anita Vernekar', id: 'BSC-DVG-0160', dept: 'Tailoring & Production', deptKey: 'others', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shift: 'General (10:00 - 19:00)', reason: 'Unplanned Absence', isUnplanned: true, manager: 'Rajesh Patil', followUp: 'Floor substitute assigned' },
  ];

  const filtered = absentEmployees.filter((emp) => {
    if (selectedHub !== 'all' && emp.hubKey !== selectedHub) return false;
    if (selectedDepartment !== 'all' && emp.deptKey !== selectedDepartment) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.dept.toLowerCase().includes(q) ||
        emp.hub.toLowerCase().includes(q) ||
        emp.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/60">
          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">Absent Today</div>
          <div className="text-2xl font-black text-rose-900 dark:text-rose-100 mt-1">{metrics.absent}</div>
          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">Not on approved leave</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/60">
          <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Unplanned Absences</div>
          <div className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-1">{metrics.unplannedAbsent}</div>
          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">Immediate follow-up required</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Regularization Pending</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.pendingRegularization}</div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Awaiting proof/approval</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Unexcused / No Show</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.unexcusedNoShow}</div>
          <div className="text-[10px] text-rose-600 font-medium mt-0.5">Escalated to store head</div>
        </div>
      </div>

      {/* Hub & Department Breakdown */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5">
            Hub-wise Absence Breakdown
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedHub === 'davanagere' ? 'font-bold text-blue-600' : ''}>Davanagere Mega Store</span>
              <span className="font-bold text-slate-900 dark:text-white">16 (4 unplanned)</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedHub === 'belagavi' ? 'font-bold text-blue-600' : ''}>Belagavi Flagship</span>
              <span className="font-bold text-slate-900 dark:text-white">14 (3 unplanned)</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedHub === 'hubli' ? 'font-bold text-blue-600' : ''}>Hubli Warehouse</span>
              <span className="font-bold text-slate-900 dark:text-white">10 (3 unplanned)</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedHub === 'bengaluru' ? 'font-bold text-blue-600' : ''}>Bengaluru Store</span>
              <span className="font-bold text-slate-900 dark:text-white">6 (2 unplanned)</span>
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-[#131d36] border border-slate-200/80 dark:border-slate-800">
          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-2.5">
            Department-wise Absence Breakdown
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedDepartment === 'sales' ? 'font-bold text-emerald-600' : ''}>Sales & Retail</span>
              <span className="font-bold text-slate-900 dark:text-white">20 cases</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedDepartment === 'warehouse' ? 'font-bold text-emerald-600' : ''}>Warehouse & Logistics</span>
              <span className="font-bold text-slate-900 dark:text-white">12 cases</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedDepartment === 'operations' ? 'font-bold text-emerald-600' : ''}>Operations</span>
              <span className="font-bold text-slate-900 dark:text-white">8 cases</span>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-300">
              <span className={selectedDepartment === 'others' ? 'font-bold text-emerald-600' : ''}>Tailoring & Merchandising</span>
              <span className="font-bold text-slate-900 dark:text-white">6 cases</span>
            </div>
          </div>
        </div>
      </div>

      {/* Employee List */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Absence Roster & Follow-up Actions ({filtered.length} shown)
            </h3>
            <p className="text-[11px] text-slate-500">Unplanned absences highlighted for prompt lead follow-up</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search absent records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Emp ID</th>
                <th className="py-2.5 px-3">Hub & Dept</th>
                <th className="py-2.5 px-3">Scheduled Shift</th>
                <th className="py-2.5 px-3">Reason / Type</th>
                <th className="py-2.5 px-3">Lead</th>
                <th className="py-2.5 px-3">Follow-up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#131d36]">
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  className={`transition-colors ${
                    emp.isUnplanned
                      ? 'bg-rose-50/30 dark:bg-rose-950/20 hover:bg-rose-50/60 dark:hover:bg-rose-950/40'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold flex items-center justify-center text-[10px]">
                        {emp.name.charAt(0)}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">{emp.name}</span>
                        {emp.isUnplanned && (
                          <span className="ml-1.5 px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-500 text-white uppercase tracking-wider">
                            Unplanned
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">{emp.id}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{emp.hub}</div>
                    <div className="text-[10px] text-slate-400">{emp.dept}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{emp.shift}</td>
                  <td className="py-2.5 px-3">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      {emp.reason}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{emp.manager}</td>
                  <td className="py-2.5 px-3 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    {emp.followUp}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No absent records found matching criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// D. ON LEAVE DETAIL COMPONENT
// ==========================================
function LeaveDetail({
  selectedHub,
  selectedDepartment,
  searchTerm,
  setSearchTerm,
}: {
  selectedHub: string;
  selectedDepartment: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const metrics = useMemo(() => getFilteredMetrics(selectedHub, selectedDepartment), [selectedHub, selectedDepartment]);

  const leaveEmployees = [
    { name: 'Vijaykumar Hiremath', id: 'BSC-DVG-0120', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Davanagere Mega Store', hubKey: 'davanagere', type: 'Earned Leave (EL)', start: '12 Oct 2024', end: '16 Oct 2024', returnDate: '17 Oct 2024', status: 'Approved by Store Lead' },
    { name: 'Roopa Patil', id: 'BSC-DVG-0128', dept: 'Operations', deptKey: 'operations', hub: 'Davanagere Mega Store', hubKey: 'davanagere', type: 'Casual Leave (CL)', start: '14 Oct 2024', end: '14 Oct 2024', returnDate: '15 Oct 2024 (Tomorrow)', status: 'Approved by HR' },
    { name: 'Suhas Kulkarni', id: 'BSC-BLG-0220', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', type: 'Sick Leave (SL)', start: '13 Oct 2024', end: '15 Oct 2024', returnDate: '16 Oct 2024', status: 'Approved by Store Lead' },
    { name: 'Ananya Deshpande', id: 'BSC-BLG-0224', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', type: 'Casual Leave (CL)', start: '14 Oct 2024', end: '14 Oct 2024', returnDate: '15 Oct 2024 (Tomorrow)', status: 'Approved by Store Lead' },
    { name: 'Veeresh Badiger', id: 'BSC-HBL-0330', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', type: 'Earned Leave (EL)', start: '10 Oct 2024', end: '14 Oct 2024', returnDate: '15 Oct 2024 (Tomorrow)', status: 'Approved by Manager' },
    { name: 'Sneha Shenoy', id: 'BSC-HBL-0335', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', type: 'Optional Holiday', start: '14 Oct 2024', end: '14 Oct 2024', returnDate: '15 Oct 2024 (Tomorrow)', status: 'Approved by HR' },
    { name: 'Raghavendra Bhat', id: 'BSC-BLR-0430', dept: 'Finance & HR', deptKey: 'finance-hr', hub: 'Bengaluru Store', hubKey: 'bengaluru', type: 'Earned Leave (EL)', start: '14 Oct 2024', end: '18 Oct 2024', returnDate: '21 Oct 2024', status: 'Approved by Management' },
    { name: 'Geetha Shastry', id: 'BSC-BLR-0438', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Bengaluru Store', hubKey: 'bengaluru', type: 'Casual Leave (CL)', start: '14 Oct 2024', end: '14 Oct 2024', returnDate: '15 Oct 2024 (Tomorrow)', status: 'Approved by Store Lead' },
  ];

  const filtered = leaveEmployees.filter((emp) => {
    if (selectedHub !== 'all' && emp.hubKey !== selectedHub) return false;
    if (selectedDepartment !== 'all' && emp.deptKey !== selectedDepartment) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.dept.toLowerCase().includes(q) ||
        emp.hub.toLowerCase().includes(q) ||
        emp.type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/40 border border-purple-100 dark:border-purple-900/60">
          <div className="text-[11px] font-bold text-purple-700 dark:text-purple-300">On Leave Today</div>
          <div className="text-2xl font-black text-purple-900 dark:text-purple-100 mt-1">{metrics.onLeave}</div>
          <div className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold mt-0.5">Approved leaves</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Returning Tomorrow</div>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">{metrics.returnTomorrow}</div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">15 October resumption</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Earned Leave (EL)</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.earnedLeave}</div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Planned long leave</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Casual / Sick</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.casualSickLeave}</div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">CL, SL & Optional</div>
        </div>
      </div>

      {/* Leave Conflict Warning Banner */}
      <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs">
          <span className="font-bold text-amber-900 dark:text-amber-200">
            Staffing Threshold Warning: Belagavi Flagship (Sales & Retail)
          </span>
          <p className="text-amber-700 dark:text-amber-300 mt-0.5 leading-relaxed">
            4 Floor Sales Executives are on approved leave concurrently today. Floor supervisor has implemented flex-shift coverage from Suiting section.
          </p>
        </div>
      </div>

      {/* Leave Register Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Approved Leave Records ({filtered.length} shown)
            </h3>
            <p className="text-[11px] text-slate-500">Authorized leaves with scheduled resumption dates</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search on leave records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-purple-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Emp ID</th>
                <th className="py-2.5 px-3">Hub & Dept</th>
                <th className="py-2.5 px-3">Leave Type</th>
                <th className="py-2.5 px-3">Duration</th>
                <th className="py-2.5 px-3">Return Date</th>
                <th className="py-2.5 px-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#131d36]">
              {filtered.map((emp) => (
                <tr key={emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 font-bold flex items-center justify-center text-[10px]">
                        {emp.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{emp.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">{emp.id}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{emp.hub}</div>
                    <div className="text-[10px] text-slate-400">{emp.dept}</div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                      {emp.type}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                    {emp.start} – {emp.end}
                  </td>
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100">
                    {emp.returnDate}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{emp.status}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No leave records found matching criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// E. LATE ARRIVALS DETAIL COMPONENT
// ==========================================
function LateDetail({
  selectedHub,
  selectedDepartment,
  searchTerm,
  setSearchTerm,
}: {
  selectedHub: string;
  selectedDepartment: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const metrics = useMemo(() => getFilteredMetrics(selectedHub, selectedDepartment), [selectedHub, selectedDepartment]);

  const lateEmployees = [
    { name: 'Karthik Gowda', id: 'BSC-DVG-0172', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shiftStart: '09:00 AM', clockIn: '09:42 AM', delay: '+42 mins', reason: 'Traffic congestion on PB Road', followUp: 'Action Required', needsFollowUp: true },
    { name: 'Vijaylaxmi Patil', id: 'BSC-DVG-0180', dept: 'Operations', deptKey: 'operations', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shiftStart: '09:00 AM', clockIn: '09:28 AM', delay: '+28 mins', reason: 'eSSL biometric sensor queue', followUp: 'Regularization Requested', needsFollowUp: false },
    { name: 'Sunil Naik', id: 'BSC-BLG-0268', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', shiftStart: '09:00 AM', clockIn: '09:35 AM', delay: '+35 mins', reason: 'Heavy rain delay', followUp: 'Action Required', needsFollowUp: true },
    { name: 'Shridhar Joshi', id: 'BSC-BLG-0275', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Belagavi Flagship', hubKey: 'belagavi', shiftStart: '09:00 AM', clockIn: '09:18 AM', delay: '+18 mins', reason: 'Grace period exceeded (15 min policy)', followUp: 'Acknowledged', needsFollowUp: false },
    { name: 'Ganesh Pujar', id: 'BSC-HBL-0370', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', shiftStart: '09:00 AM', clockIn: '09:45 AM', delay: '+45 mins', reason: 'Public transport breakdown', followUp: 'Action Required', needsFollowUp: true },
    { name: 'Vidya Deshpande', id: 'BSC-HBL-0382', dept: 'Operations', deptKey: 'operations', hub: 'Hubli Warehouse', hubKey: 'hubli', shiftStart: '10:00 AM', clockIn: '10:22 AM', delay: '+22 mins', reason: 'Family medical visit', followUp: 'Action Required', needsFollowUp: true },
    { name: 'Mohan Kumar', id: 'BSC-BLR-0465', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Bengaluru Store', hubKey: 'bengaluru', shiftStart: '09:00 AM', clockIn: '09:38 AM', delay: '+38 mins', reason: 'Metro line delay', followUp: 'Action Required', needsFollowUp: true },
    { name: 'Rashmi Rao', id: 'BSC-BLR-0472', dept: 'Finance & HR', deptKey: 'finance-hr', hub: 'Bengaluru Store', hubKey: 'bengaluru', shiftStart: '10:00 AM', clockIn: '10:16 AM', delay: '+16 mins', reason: 'Minor delay at entrance', followUp: 'Resolved', needsFollowUp: false },
    { name: 'Deepak Vernekar', id: 'BSC-DVG-0191', dept: 'Tailoring & Production', deptKey: 'others', hub: 'Davanagere Mega Store', hubKey: 'davanagere', shiftStart: '09:00 AM', clockIn: '09:32 AM', delay: '+32 mins', reason: 'No reason provided', followUp: 'Action Required', needsFollowUp: true },
  ];

  const filtered = lateEmployees.filter((emp) => {
    if (selectedHub !== 'all' && emp.hubKey !== selectedHub) return false;
    if (selectedDepartment !== 'all' && emp.deptKey !== selectedDepartment) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        emp.name.toLowerCase().includes(q) ||
        emp.id.toLowerCase().includes(q) ||
        emp.dept.toLowerCase().includes(q) ||
        emp.hub.toLowerCase().includes(q) ||
        emp.reason.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-amber-50/60 dark:bg-amber-950/40 border border-amber-100 dark:border-amber-900/60">
          <div className="text-[11px] font-bold text-amber-700 dark:text-amber-300">Late Arrivals</div>
          <div className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-1">{metrics.late}</div>
          <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold mt-0.5">Grace period &gt;15 mins</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/60">
          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">Need Follow-up</div>
          <div className="text-2xl font-black text-rose-900 dark:text-rose-100 mt-1">{metrics.lateFollowUp}</div>
          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">Action required</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Average Delay</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.avgDelay}</div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Across all shifts</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Late Trend</div>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">{metrics.lateTrend}</div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">vs yesterday</div>
        </div>
      </div>

      {/* Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Late Check-ins Ledger ({filtered.length} shown)
            </h3>
            <p className="text-[11px] text-slate-500">{metrics.lateFollowUp} employees require follow-up or regularization submission</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search late arrivals..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Emp ID</th>
                <th className="py-2.5 px-3">Hub & Dept</th>
                <th className="py-2.5 px-3">Shift Start</th>
                <th className="py-2.5 px-3">Clock-In</th>
                <th className="py-2.5 px-3">Delay</th>
                <th className="py-2.5 px-3">Reason / Regularization</th>
                <th className="py-2.5 px-3">Follow-up Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#131d36]">
              {filtered.map((emp) => (
                <tr
                  key={emp.id}
                  className={`transition-colors ${
                    emp.needsFollowUp
                      ? 'bg-amber-50/30 dark:bg-amber-950/20 hover:bg-amber-50/60 dark:hover:bg-amber-950/40'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 font-bold flex items-center justify-center text-[10px]">
                        {emp.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{emp.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 dark:text-slate-300">{emp.id}</td>
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200">{emp.hub}</div>
                    <div className="text-[10px] text-slate-400">{emp.dept}</div>
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{emp.shiftStart}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-amber-700 dark:text-amber-400">{emp.clockIn}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-rose-600 dark:text-rose-400">{emp.delay}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{emp.reason}</td>
                  <td className="py-2.5 px-3">
                    {emp.needsFollowUp ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <AlertCircle className="w-3 h-3 text-rose-600" />
                        Follow-up Needed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                        {emp.followUp}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No late arrivals found matching criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// F. OPEN POSITIONS DETAIL COMPONENT
// ==========================================
function OpenPositionsDetail({
  selectedHub,
  selectedDepartment,
  searchTerm,
  setSearchTerm,
}: {
  selectedHub: string;
  selectedDepartment: string;
  searchTerm: string;
  setSearchTerm: (s: string) => void;
}) {
  const metrics = useMemo(() => getFilteredMetrics(selectedHub, selectedDepartment), [selectedHub, selectedDepartment]);

  const requisitions = [
    { title: 'Senior Fabric Merchandiser', dept: 'Operations', deptKey: 'operations', hub: 'Davanagere Mega Store', hubKey: 'davanagere', vacancies: 2, priority: 'Urgent', isUrgent: true, opened: '28 Sep 2024', manager: 'Priyanka Rao', candidates: 14, status: 'Active' },
    { title: 'Retail Floor Sales Lead (Silk & Sarees)', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Belagavi Flagship', hubKey: 'belagavi', vacancies: 2, priority: 'Urgent', isUrgent: true, opened: '02 Oct 2024', manager: 'Rajesh Patil', candidates: 18, status: 'Active' },
    { title: 'Warehouse Dispatch Supervisor', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', vacancies: 1, priority: 'Urgent', isUrgent: true, opened: '04 Oct 2024', manager: 'Siddhesh Angadi', candidates: 8, status: 'Active' },
    { title: 'Master Tailor & Alterations Specialist', dept: 'Production & Tailoring', deptKey: 'others', hub: 'Bengaluru Store', hubKey: 'bengaluru', vacancies: 1, priority: 'Urgent', isUrgent: true, opened: '05 Oct 2024', manager: 'Ayesha Khan', candidates: 6, status: 'Active' },
    { title: 'Customer Relationship Associate', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Davanagere Mega Store', hubKey: 'davanagere', vacancies: 2, priority: 'Normal', isUrgent: false, opened: '08 Oct 2024', manager: 'Rajesh Patil', candidates: 22, status: 'Active' },
    { title: 'Billing & POS Cashier', dept: 'Operations', deptKey: 'operations', hub: 'Belagavi Flagship', hubKey: 'belagavi', vacancies: 1, priority: 'Normal', isUrgent: false, opened: '09 Oct 2024', manager: 'Priyanka Rao', candidates: 11, status: 'Active' },
    { title: 'Inventory Quality Auditor', dept: 'Warehouse & Logistics', deptKey: 'warehouse', hub: 'Hubli Warehouse', hubKey: 'hubli', vacancies: 2, priority: 'Normal', isUrgent: false, opened: '10 Oct 2024', manager: 'Deepa Hegde', candidates: 9, status: 'Active' },
    { title: 'Showroom Visual Merchandiser', dept: 'Sales & Retail', deptKey: 'sales', hub: 'Bengaluru Store', hubKey: 'bengaluru', vacancies: 1, priority: 'Normal', isUrgent: false, opened: '11 Oct 2024', manager: 'Ayesha Khan', candidates: 7, status: 'Active' },
  ];

  const filtered = requisitions.filter((r) => {
    if (selectedHub !== 'all' && r.hubKey !== selectedHub) return false;
    if (selectedDepartment !== 'all' && r.deptKey !== selectedDepartment) return false;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.dept.toLowerCase().includes(q) ||
        r.hub.toLowerCase().includes(q) ||
        r.manager.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60">
          <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">Open Positions</div>
          <div className="text-2xl font-black text-indigo-900 dark:text-indigo-100 mt-1">{metrics.openPositions}</div>
          <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold mt-0.5">Active requisitions</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/40 border border-rose-100 dark:border-rose-900/60">
          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-300">Urgent Vacancies</div>
          <div className="text-2xl font-black text-rose-900 dark:text-rose-100 mt-1">{metrics.urgentPositions}</div>
          <div className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold mt-0.5">Critical staffing gap</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">In Pipeline</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">{metrics.candidatesPipeline}</div>
          <div className="text-[10px] text-slate-500 font-medium mt-0.5">Candidates screened</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">Interviews & Offers</div>
          <div className="text-2xl font-black text-emerald-900 dark:text-emerald-100 mt-1">{metrics.interviewsToday} / {metrics.offersPending}</div>
          <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-0.5">{metrics.interviewsToday} today / {metrics.offersPending} offers out</div>
        </div>
      </div>

      {/* Requisitions Table */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              Job Requisition Roster ({filtered.length} shown)
            </h3>
            <p className="text-[11px] text-slate-500">Urgent roles prioritized for rapid showroom and depot staffing</p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search requisitions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-200 pl-8 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold">
                <th className="py-2.5 px-3">Job Title</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Hub</th>
                <th className="py-2.5 px-3">Vacancies</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Opened</th>
                <th className="py-2.5 px-3">Lead</th>
                <th className="py-2.5 px-3">Pipeline</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-[#131d36]">
              {filtered.map((r, i) => (
                <tr
                  key={`${r.title}-${i}`}
                  className={`transition-colors ${
                    r.isUrgent
                      ? 'bg-rose-50/20 dark:bg-rose-950/20 hover:bg-rose-50/50 dark:hover:bg-rose-950/40'
                      : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">{r.title}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.dept}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.hub}</td>
                  <td className="py-2.5 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-400">{r.vacancies}</td>
                  <td className="py-2.5 px-3">
                    {r.isUrgent ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        Urgent
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        Normal
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-slate-500">{r.opened}</td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">{r.manager}</td>
                  <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                    {r.candidates} candidates
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No open requisitions found matching criteria
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
