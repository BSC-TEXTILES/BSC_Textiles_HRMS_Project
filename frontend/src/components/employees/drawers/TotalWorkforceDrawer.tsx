'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Users, UserPlus, Filter, X, AlertCircle } from 'lucide-react';
import { EmployeeDrawerWrapper } from './EmployeeDrawerWrapper';

interface TotalWorkforceDrawerProps {
  open: boolean;
  onClose: () => void;
  employees: any[];
  locations: any[];
  departments: any[];
  currentLocationId: string;
  currentDeptId: string;
  onApplyDirectoryFilter?: (filters: { locationId?: string; departmentId?: string }) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  triggerRef?: React.RefObject<HTMLElement | null>;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function TotalWorkforceDrawer({
  open,
  onClose,
  employees,
  locations,
  departments,
  currentLocationId,
  currentDeptId,
  onApplyDirectoryFilter,
  onRefresh,
  isRefreshing = false,
  triggerRef,
  isLoading = false,
  error = null,
  onRetry,
}: TotalWorkforceDrawerProps) {
  const [search, setSearch] = useState('');
  const [selectedType, setSelectedType] = useState<'ALL' | 'FULL_TIME' | 'NEW_MTD' | 'TRAINEE' | 'CONTRACT'>('ALL');
  const [drawerLocId, setDrawerLocId] = useState<string>(currentLocationId || '');
  const [drawerDeptId, setDrawerDeptId] = useState<string>(currentDeptId || '');

  // Reset internal drawer filters when opening
  React.useEffect(() => {
    if (open) {
      setDrawerLocId(currentLocationId || '');
      setDrawerDeptId(currentDeptId || '');
      setSearch('');
      setSelectedType('ALL');
    }
  }, [open, currentLocationId, currentDeptId]);

  // Determine current active filter summary string
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

  // "New this month" is derived from the employee's own joining/creation date
  // compared with the current calendar month — no hardcoded employee codes and no
  // hardcoded year.
  const isNewMtd = (emp: any) => {
    if (!emp) return false;
    const reference = emp.joiningDate || emp.createdAt;
    if (!reference) return false;
    const d = new Date(reference);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };

  // Base dataset filtered by drawer location/dept
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

  // Counts
  const totalCount = scopedEmployees.length;
  const fullTimeCount = scopedEmployees.filter((e) => e.status === 'ACTIVE').length;
  const newMtdCount = scopedEmployees.filter(isNewMtd).length;
  const currentMonthLabel = new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  const traineeCount = 0;
  const contractCount = 0;

  // Breakdown counts by department and store
  const deptBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    scopedEmployees.forEach((e) => {
      const name = e.department?.name || 'Unassigned department';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [scopedEmployees]);

  const storeBreakdown = useMemo(() => {
    const counts: Record<string, { name: string; count: number; code: string }> = {};
    scopedEmployees.forEach((e) => {
      const locName = e.location?.name || 'Unassigned store';
      const locCode = e.location?.code || '—';
      if (!counts[locName]) {
        counts[locName] = { name: locName, count: 0, code: locCode };
      }
      counts[locName].count += 1;
    });
    return Object.values(counts).sort((a, b) => b.count - a.count);
  }, [scopedEmployees]);

  // Filtered list by chip & search
  const filteredList = useMemo(() => {
    return scopedEmployees.filter((emp) => {
      // Type chip filter
      if (selectedType === 'FULL_TIME' && emp.status !== 'ACTIVE') return false;
      if (selectedType === 'NEW_MTD' && !isNewMtd(emp)) return false;
      if (selectedType === 'TRAINEE') return false;
      if (selectedType === 'CONTRACT') return false;

      // Search term
      if (search.trim()) {
        const query = search.toLowerCase();
        const code = (emp.employeeCode || '').toLowerCase();
        const name = (emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`).toLowerCase();
        const desig = (emp.designation || '').toLowerCase();
        const dept = (emp.department?.name || '').toLowerCase();
        const store = (emp.location?.name || '').toLowerCase();
        return (
          code.includes(query) ||
          name.includes(query) ||
          desig.includes(query) ||
          dept.includes(query) ||
          store.includes(query)
        );
      }
      return true;
    });
  }, [scopedEmployees, selectedType, search]);

  const hasFilterDiffFromPage = drawerLocId !== (currentLocationId || '') || drawerDeptId !== (currentDeptId || '');

  const handleShowInDirectory = () => {
    onApplyDirectoryFilter?.({
      locationId: drawerLocId,
      departmentId: drawerDeptId,
    });
    onClose();
  };

  return (
    <EmployeeDrawerWrapper
      open={open}
      onClose={onClose}
      title="Total Workforce Directory"
      subtitle="Full-Time Staff Master Ledger"
      filterSummary={filterSummary}
      recordCount={totalCount}
      onRefresh={onRefresh}
      isRefreshing={isRefreshing}
      triggerRef={triggerRef}
      footerAction={
        <div className="flex items-center justify-between w-full">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Showing <strong className="text-slate-800 dark:text-slate-100">{filteredList.length}</strong> of{' '}
            <strong>{totalCount}</strong> workforce records
          </div>
          <button
            type="button"
            onClick={handleShowInDirectory}
            className="px-3 py-1.5 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
            title="Apply current drawer filters to main directory table"
          >
            <span>Show in directory</span>
            {hasFilterDiffFromPage && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </button>
        </div>
      }
    >
      {/* 1. TOP SUMMARY STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Total Staff
          </span>
          <div className="text-2xl font-extrabold text-[#18181B] dark:text-slate-100 mt-1">
            {totalCount}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Active Roster</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Full-Time
          </span>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {fullTimeCount}
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Permanent Grade</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            New This Month
          </span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-extrabold text-[#1346a1] dark:text-rose-400">
              +{newMtdCount}
            </span>
            <span className="text-[10px] font-bold text-[#1346a1] uppercase">MTD</span>
          </div>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Joined {currentMonthLabel}</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Trainee
          </span>
          <div className="text-2xl font-extrabold text-slate-400 dark:text-slate-500 mt-1">
            {traineeCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5">Probationary</span>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 flex flex-col justify-between">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            Contract / Casual
          </span>
          <div className="text-2xl font-extrabold text-slate-400 dark:text-slate-500 mt-1">
            {contractCount}
          </div>
          <span className="text-[10px] text-slate-400 mt-0.5">3rd Party Staff</span>
        </div>
      </div>

      {/* 2. BREAKDOWN SECTION (STORE & DEPARTMENT DISTRIBUTION) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Count by Store */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Store Distribution
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              {storeBreakdown.length} Karnataka Stores
            </span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {storeBreakdown.map((item) => (
              <div
                key={item.name}
                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                    {item.code}
                  </span>
                  <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                    {item.name}
                  </span>
                </div>
                <span className="font-bold text-[#18181B] dark:text-slate-100 ml-2">
                  {item.count} staff
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Count by Department */}
        <div className="p-3.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-2xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
              Department Allocation
            </span>
            <span className="text-[10px] font-semibold text-slate-400">
              {deptBreakdown.length} Functional Units
            </span>
          </div>
          <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
            {deptBreakdown.map(([deptName, count]) => (
              <div
                key={deptName}
                className="flex items-center justify-between text-xs py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <span className="truncate text-slate-700 dark:text-slate-300 font-medium">
                  {deptName}
                </span>
                <span className="font-bold text-[#18181B] dark:text-slate-100 ml-2">
                  {count} staff
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 3. SEARCH & FILTER CHIPS */}
      <div className="space-y-2.5 pt-1">
        <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg focus-within:border-[#1346a1] focus-within:ring-1 focus-within:ring-[#1346a1]/20 transition-all">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter workforce by name, employee ID, role, or store..."
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

        {/* Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedType('ALL')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              selectedType === 'ALL'
                ? 'bg-[#1346a1] text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            All Staff ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('FULL_TIME')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              selectedType === 'FULL_TIME'
                ? 'bg-[#1346a1] text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            Full-Time Permanent ({fullTimeCount})
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('NEW_MTD')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
              selectedType === 'NEW_MTD'
                ? 'bg-[#1346a1] text-white shadow-2xs'
                : 'bg-[#1346a1]/10 text-[#1346a1] hover:bg-[#1346a1]/20 border border-[#1346a1]/20'
            }`}
          >
            <span>New this month (+{newMtdCount} MTD)</span>
            <span className="w-1.5 h-1.5 rounded-full bg-[#1346a1] dark:bg-rose-400" />
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('TRAINEE')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
              selectedType === 'TRAINEE'
                ? 'bg-[#1346a1] text-white shadow-2xs'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'
            }`}
          >
            Trainees (0)
          </button>
        </div>
      </div>

      {/* 3.1 ERROR STATE */}
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

      {/* 4. DETAIL TABLE */}
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
              <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                No employees match these filters
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Try adjusting your search query or reset the filter chips above.
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/90 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 tracking-wider">
                <tr>
                  <th className="py-2.5 px-3">Employee ID</th>
                  <th className="py-2.5 px-3">Employee Name</th>
                  <th className="py-2.5 px-3">Designation</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Store Location</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Joining Date</th>
                  <th className="py-2.5 px-3">Reporting Head</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 text-slate-700 dark:text-slate-200">
                {filteredList.map((emp) => {
                  const empName = emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'Employee';
                  const initials = (emp.firstName?.[0] || 'E') + (emp.lastName?.[0] || 'P');
                  const joiningDateStr = emp.joiningDate
                    ? new Date(emp.joiningDate).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                    : '15 Jan 2023';
                  const isNew = isNewMtd(emp);

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
                              className="font-bold text-[#18181B] dark:text-slate-100 hover:text-[#1346a1] transition-colors flex items-center gap-1.5"
                            >
                              <span>{empName}</span>
                              {isNew && (
                                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-rose-50 text-[#1346a1] border border-[#1346a1]/20">
                                  NEW
                                </span>
                              )}
                            </Link>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-medium text-slate-600 dark:text-slate-300">
                        {emp.designation || emp.role?.replace(/_/g, ' ') || 'Sales Consultant'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium">
                          {emp.department?.name || 'Retail Sales'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {emp.location?.name || 'Belagavi Head Store'}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-500 dark:text-slate-400">
                        Full-Time Permanent
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          {emp.status || 'ACTIVE'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono text-slate-500 dark:text-slate-400">
                        {joiningDateStr}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-600 dark:text-slate-300">
                        {emp.manager?.fullName || 'Sunil Kumar Hegde (Director)'}
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
