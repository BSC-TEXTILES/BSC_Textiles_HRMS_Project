'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Store, Info, CheckCircle2, Clock, X, AlertCircle } from 'lucide-react';
import { EmployeeDrawerWrapper } from './EmployeeDrawerWrapper';
import { formatDateTimeSafe } from '@/lib/utils';

interface ActiveOnFloorDrawerProps {
  open: boolean;
  onClose: () => void;
  employees: any[];
  locations: any[];
  departments: any[];
  /** Today's attendance rows keyed by employee id (GET /attendance/today). */
  liveAttendance?: Record<
    string,
    {
      actualLogin?: string | null;
      actualLogout?: string | null;
      status?: string;
      /** Seconds the IN punch was after shift start; absent when the feed omits it. */
      lateLoginSeconds?: number | null;
    }
  >;
  currentLocationId: string;
  currentDeptId: string;
  onApplyDirectoryFilter?: (filters: { locationId?: string; departmentId?: string; status?: string }) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  triggerRef?: React.RefObject<HTMLElement | null>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function ActiveOnFloorDrawer({
  open,
  onClose,
  employees,
  locations,
  departments,
  liveAttendance,
  currentLocationId,
  currentDeptId,
  onApplyDirectoryFilter,
  onRefresh,
  isRefreshing = false,
  triggerRef,
  isLoading = false,
  error = null,
  onRetry,
}: ActiveOnFloorDrawerProps) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ON_FLOOR' | 'OFF_DUTY' | 'ALL'>('ON_FLOOR');
  const [drawerLocId, setDrawerLocId] = useState<string>(currentLocationId || '');
  const [drawerDeptId, setDrawerDeptId] = useState<string>(currentDeptId || '');

  React.useEffect(() => {
    if (open) {
      setDrawerLocId(currentLocationId || '');
      setDrawerDeptId(currentDeptId || '');
      setSearch('');
      setActiveTab('ON_FLOOR');
    }
  }, [open, currentLocationId, currentDeptId]);

  const activeLocationObj = locations.find((l) => l.id === drawerLocId);
  const activeDeptObj = departments.find((d) => d.id === drawerDeptId);
  const filterSummary = useMemo(() => {
    const parts = [];
    if (activeLocationObj) parts.push(`Store: ${activeLocationObj.name}`);
    else parts.push('All Karnataka Hubs');
    if (activeDeptObj) parts.push(`Dept: ${activeDeptObj.name}`);
    else parts.push('All Departments');
    return parts.join(' • ');
  }, [activeLocationObj, activeDeptObj]);

  // Scoped employees by drawer location / dept
  const scopedEmployees = useMemo(() => {
    return employees.filter((emp) => {
      if (drawerLocId && emp.locationId !== drawerLocId && emp.location?.id !== drawerLocId) {
        return false;
      }
      if (drawerDeptId && emp.departmentId !== drawerDeptId && emp.department?.id !== drawerDeptId) {
        return false;
      }
      return true;
    });
  }, [employees, drawerLocId, drawerDeptId]);

  // "On floor" is live attendance, not an estimate: the directory passes the
  // employee ids that have an attendance row for today (GET /attendance/today).
  const rosterData = useMemo(() => {
    return scopedEmployees.map((emp) => {
      const live = liveAttendance?.[String(emp.id)];
      const isOnFloor = Boolean(live);
      const clockInTime = live?.actualLogin ? formatDateTimeSafe(live.actualLogin) : '—';
      const lastPunchTime = live?.actualLogout
        ? `Out ${formatDateTimeSafe(live.actualLogout)}`
        : live?.actualLogin
          ? `In ${formatDateTimeSafe(live.actualLogin)} — no out-punch yet`
          : 'No attendance recorded today';

      return {
        ...emp,
        isOnFloor,
        floorLocation: emp.floor?.name || 'Not assigned',
        shiftName: emp.shift?.name || 'No shift mapped',
        clockInTime,
        lastPunchTime,
        attendanceStatus: live?.status || (isOnFloor ? 'Present' : 'Not present today'),
      };
    });
  }, [scopedEmployees, liveAttendance]);

  const onFloorCount = rosterData.filter((e) => e.isOnFloor).length;
  const lateLoginCount = rosterData.filter(
    (e) => Number((liveAttendance?.[String(e.id)] as any)?.lateLoginSeconds || 0) > 0
  ).length;
  const offDutyCount = rosterData.filter((e) => !e.isOnFloor).length;
  const totalCount = rosterData.length;

  const filteredList = useMemo(() => {
    return rosterData.filter((emp) => {
      if (activeTab === 'ON_FLOOR' && !emp.isOnFloor) return false;
      if (activeTab === 'OFF_DUTY' && emp.isOnFloor) return false;

      if (search.trim()) {
        const query = search.toLowerCase();
        const code = (emp.employeeCode || '').toLowerCase();
        const name = (emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`).toLowerCase();
        const store = (emp.location?.name || '').toLowerCase();
        const shift = (emp.shiftName || '').toLowerCase();
        return code.includes(query) || name.includes(query) || store.includes(query) || shift.includes(query);
      }
      return true;
    });
  }, [rosterData, activeTab, search]);

  const handleShowInDirectory = () => {
    onApplyDirectoryFilter?.({
      locationId: drawerLocId,
      departmentId: drawerDeptId,
      status: 'ACTIVE',
    });
    onClose();
  };

  return (
    <EmployeeDrawerWrapper
      open={open}
      onClose={onClose}
      title="Active On-Floor Staff Roster"
      subtitle="Shift A Core Retail Presence"
      filterSummary={filterSummary}
      recordCount={filteredList.length}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      triggerRef={triggerRef}
      footerAction={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing <strong className="text-slate-800 dark:text-slate-100">{filteredList.length}</strong> of{' '}
            <strong>{totalCount}</strong> rostered employees
          </div>
          <button
            type="button"
            onClick={handleShowInDirectory}
            className="px-3 py-1.5 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
            title="Filter main directory by Active Workforce"
          >
            Show in directory
          </button>
        </div>
      }
    >
      {/* DEFINITION & COMPARISON BANNER */}
      <div className="p-3.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 flex items-start gap-2.5">
        <Info className="w-4 h-4 text-[#0058be] dark:text-blue-400 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 dark:text-slate-300 space-y-1">
          <div className="font-bold text-[#0058be] dark:text-blue-300">
            Data Definition: Active On-Floor (12 / 35 Staff)
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
            <strong>Active On-Floor</strong> specifically tracks personnel currently clocked in and verified at retail terminals for <strong>Shift A (09:30 - 18:30)</strong> without an active checkout.
            In contrast, the <strong>Executive Dashboard</strong> tracks total 24-hr daily biometric punches across all general, flexible, and split shifts (10 present at last audit mark).
          </p>
        </div>
      </div>

      {/* 1. TOP SUMMARY STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="p-3 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">
            On Floor Now
          </span>
          <div className="text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
            {onFloorCount}
          </div>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">Shift A Active</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Present
          </span>
          <div className="text-2xl font-extrabold text-[#18181B] dark:text-slate-100 mt-1">
            {onFloorCount}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">Biometric Verified</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Late Logins Today
          </span>
          <div className="text-2xl font-extrabold text-slate-400 dark:text-slate-500 mt-1">
            {lateLoginCount}
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold mt-0.5">
            {onFloorCount === 0 ? 'No attendance recorded today' : `${Math.round(((onFloorCount - lateLoginCount) / onFloorCount) * 100)}% on time`}
          </span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Off-Duty / Roster
          </span>
          <div className="text-2xl font-extrabold text-slate-700 dark:text-slate-200 mt-1">
            {offDutyCount}
          </div>
          <span className="text-[10px] text-slate-500 mt-0.5">Shift B / Rest</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            On Leave
          </span>
          <div className="text-2xl font-extrabold text-slate-400 dark:text-slate-500 mt-1">
            0
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5">Approved Sanction</span>
        </div>
      </div>

      {/* 2. TABS & SEARCH */}
      <div className="space-y-2.5 pt-1">
        <div className="flex border-b border-slate-200 dark:border-slate-800 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('ON_FLOOR')}
            className={`pb-2 text-xs font-bold transition-all relative ${
              activeTab === 'ON_FLOOR'
                ? 'text-[#1346a1] border-b-2 border-[#1346a1]'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            On Floor ({onFloorCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('OFF_DUTY')}
            className={`pb-2 text-xs font-bold transition-all relative ${
              activeTab === 'OFF_DUTY'
                ? 'text-[#1346a1] border-b-2 border-[#1346a1]'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            Off-Duty / Roster ({offDutyCount})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`pb-2 text-xs font-bold transition-all relative ${
              activeTab === 'ALL'
                ? 'text-[#1346a1] border-b-2 border-[#1346a1]'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            All Staff ({totalCount})
          </button>
        </div>

        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg focus-within:border-[#1346a1] focus-within:ring-1 focus-within:ring-[#1346a1]/20 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search on-floor roster by name, ID, shift, or store..."
            className="w-full bg-transparent text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="p-0.5 text-slate-400 hover:text-slate-600 rounded-full"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2.1 ERROR STATE */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* 3. DETAIL TABLE */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[460px]">
          {isLoading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="animate-pulse flex items-center justify-between p-3 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <div className="space-y-1 w-1/3">
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded w-1/2" />
                  </div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-20" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-24" />
                </div>
              ))}
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 px-4 text-center">
              <Store className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {activeTab === 'ON_FLOOR'
                  ? 'No employees are on the floor right now'
                  : 'No employees match these filters'}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                All staff might be off-duty or scheduled on alternate rosters.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Employee ID</th>
                  <th className="py-2.5 px-3">Staff Name</th>
                  <th className="py-2.5 px-3">Store Location</th>
                  <th className="py-2.5 px-3">Floor / Zone</th>
                  <th className="py-2.5 px-3">Shift Roster</th>
                  <th className="py-2.5 px-3">Clock-In Time</th>
                  <th className="py-2.5 px-3">Attendance Status</th>
                  <th className="py-2.5 px-3">Last Punch Record</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
                {filteredList.map((emp) => {
                  const empName = emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee';
                  const initials = (emp.firstName?.[0] || 'E') + (emp.lastName?.[0] || 'P');

                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-mono font-bold text-[#18181B] dark:text-slate-100 whitespace-nowrap">
                        <Link
                          href={`/employees/profile/${emp.id}`}
                          aria-label={`Open complete profile for ${empName}`}
                          className="text-[#1346a1] hover:underline"
                        >
                          {emp.employeeCode}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-[#1346a1] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                            {initials}
                          </div>
                          <div>
                            <Link
                              href={`/employees/profile/${emp.id}`}
                              aria-label={`Open complete profile for ${empName}`}
                              className="font-bold text-[#18181B] dark:text-slate-100 hover:text-[#1346a1] transition-colors"
                            >
                              {empName}
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {emp.location?.name || 'Belagavi Head Store'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {emp.floorLocation}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                        {emp.shiftName}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono font-bold text-[#18181B] dark:text-slate-100">
                        {emp.clockInTime}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            emp.attendanceStatus === 'Present'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {emp.attendanceStatus}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-500 dark:text-slate-400">
                        {emp.lastPunchTime}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </EmployeeDrawerWrapper>
  );
}
