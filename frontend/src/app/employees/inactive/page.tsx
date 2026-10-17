'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  ExternalLink,
  FilterX,
  Loader2,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  UserCog,
  UserX,
} from 'lucide-react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { EmployeeCodeText } from '@/components/employees/EmployeeCodeField';
import { HrEmployeeEditDialog } from '@/components/employees/HrEmployeeEditDialog';
import { EmployeeStatusChangeDialog } from '@/components/employees/EmployeeStatusChangeDialog';
import { InactiveEmployeeDrawer } from './InactiveEmployeeDrawer';
import { validateEmployeeCode } from '@/lib/employeeCode';
import { formatDateSafe, formatDateTimeSafe } from '@/lib/utils';
import {
  INACTIVE_EMPLOYMENT_STATUSES,
  fetchAccountMap,
  fetchAttendanceSummary,
  fetchExitMap,
  reasonFromRemarks,
  type AccountMap,
  type ExitMap,
} from '@/lib/inactiveEmployees';
import { WORKFORCE_ROUTE_ROLES, ADMIN_ROLES, PAYROLL_ROUTE_ROLES, roleInGroup } from '@/lib/roles';

type SortKey =
  | 'employeeCode'
  | 'fullName'
  | 'location'
  | 'department'
  | 'designation'
  | 'status'
  | 'joiningDate'
  | 'lastWorkingDate'
  | 'lastLoginAt';

const PAGE_SIZES = [10, 25, 50];

/** Employment states that HR can move an inactive record back to. */
const INACTIVE_STATUS_OPTIONS = INACTIVE_EMPLOYMENT_STATUSES;

function cellText(value: any): string {
  return value === null || value === undefined ? '' : String(value).toLowerCase();
}

export default function InactiveEmployeesPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role || 'EMPLOYEE';
  const isHrWorkforce = roleInGroup(role, WORKFORCE_ROUTE_ROLES) || roleInGroup(role, ADMIN_ROLES);
  const canManageStatus = isHrWorkforce;
  const canViewPayroll =
    roleInGroup(role, ADMIN_ROLES) ||
    roleInGroup(role, PAYROLL_ROUTE_ROLES) ||
    ['HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'].includes(role);

  // ── source data ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<AccountMap>({});
  const [exits, setExits] = useState<ExitMap>({});
  const [attendanceTotals, setAttendanceTotals] = useState<Record<string, { total: number; latest: string | null }>>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // ── filters ───────────────────────────────────────────────────────────────
  const [nameSearch, setNameSearch] = useState('');
  const [codeSearch, setCodeSearch] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [locationFilter, setLocationFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL_INACTIVE');
  const [joiningFrom, setJoiningFrom] = useState('');
  const [joiningTo, setJoiningTo] = useState('');
  const [workingFrom, setWorkingFrom] = useState('');
  const [workingTo, setWorkingTo] = useState('');

  // ── table state ───────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('lastWorkingDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── dialogs ───────────────────────────────────────────────────────────────
  const [drawerEmployee, setDrawerEmployee] = useState<any | null>(null);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ employee: any; intent: 'ACTIVATE' | 'DEACTIVATE' } | null>(null);

  const loadReferenceData = useCallback(async () => {
    const [loc, dept, flr, sec, shf] = await Promise.all([
      api.get('/locations/all').catch(() => ({ data: [] })),
      api.get('/departments?limit=200').catch(() => ({ data: {} })),
      api.get('/floors?limit=200').catch(() => ({ data: {} })),
      api.get('/sections?limit=200').catch(() => ({ data: {} })),
      api.get('/shifts?limit=200').catch(() => ({ data: {} })),
    ]);
    setLocations(Array.isArray(loc.data) ? loc.data : loc.data?.locations || []);
    setDepartments(dept.data?.departments || (Array.isArray(dept.data) ? dept.data : []));
    setFloors(flr.data?.floors || []);
    setSections(sec.data?.sections || []);
    setShifts(shf.data?.shifts || []);
  }, []);

  /**
   * Employment status is the only definition of "inactive". The API filters by
   * a single status at a time, so when the user asks for every inactive state
   * we read the roster once and keep the records whose status is not part of
   * the active workforce.
   */
  const loadRows = useCallback(async () => {
    setError(null);
    try {
      const params: Record<string, any> = { limit: 100, page: 1 };
      if (statusFilter && statusFilter !== 'ALL_INACTIVE') params.status = statusFilter;
      const search = codeSearch.trim() || nameSearch.trim();
      if (search) params.search = search;
      if (locationFilter) params.locationId = locationFilter;
      if (departmentFilter) params.departmentId = departmentFilter;
      // Documented contract for the backend; harmless while it ignores them.
      if (joiningFrom) params.joiningDateFrom = joiningFrom;
      if (joiningTo) params.joiningDateTo = joiningTo;
      if (workingFrom) params.lastWorkingDateFrom = workingFrom;
      if (workingTo) params.lastWorkingDateTo = workingTo;

      const res = await api.get('/employees', { params });
      const list: any[] = res.data?.employees || [];
      const filtered =
        statusFilter === 'ALL_INACTIVE'
          ? list.filter((e) => INACTIVE_EMPLOYMENT_STATUSES.includes(String(e.status).toUpperCase()))
          : list;
      setRows(filtered);
    } catch (err: any) {
      const message =
        err?.response?.data?.error || err?.message || 'Employee records could not be loaded from the HRMS API.';
      setError(String(message));
      setRows([]);
    }
  }, [statusFilter, codeSearch, nameSearch, locationFilter, departmentFilter, joiningFrom, joiningTo, workingFrom, workingTo]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadRows(), loadReferenceData()]);
    setLoading(false);
  }, [loadRows, loadReferenceData]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    loadAll();
    fetchAccountMap().then(setAccounts);
    fetchExitMap().then(setExits);
  }, [authStatus, loadAll]);

  // Lazily fetch the attendance totals for the rows currently on screen.
  const visibleRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const pick = (e: any): any => {
        switch (sortKey) {
          case 'employeeCode':
            return e.employeeCode;
          case 'fullName':
            return e.fullName || `${e.firstName || ''} ${e.lastName || ''}`;
          case 'location':
            return e.location?.name;
          case 'department':
            return e.department?.name;
          case 'designation':
            return e.designation;
          case 'status':
            return e.status;
          case 'joiningDate':
            return e.joiningDate || e.dateOfJoining;
          case 'lastWorkingDate':
            return exits[String(e.employeeId || e.id)]?.lastWorkingDay || e.exitDate;
          case 'lastLoginAt':
            return accounts[String(e.id)]?.lastLoginAt || null;
          default:
            return null;
        }
      };
      const va = pick(a);
      const vb = pick(b);
      const na = new Date(va).getTime();
      const nb = new Date(vb).getTime();
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return dir * (na - nb);
      return dir * cellText(va).localeCompare(cellText(vb));
    });

    return sorted;
  }, [rows, sortKey, sortDir, accounts, exits]);

  useEffect(() => {
    const from = (page - 1) * pageSize;
    const slice = visibleRows.slice(from, from + pageSize);
    const pending = slice.filter((e) => e?.id && attendanceTotals[e.id] === undefined);
    if (pending.length === 0) return;
    let cancelled = false;
    Promise.all(
      pending.map(async (e) => [e.id as string, await fetchAttendanceSummary(e.id)] as const)
    ).then((pairs) => {
      if (cancelled) return;
      setAttendanceTotals((prev) => {
        const next = { ...prev };
        for (const [id, value] of pairs) next[id] = value ?? { total: 0, latest: null };
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, page, pageSize]);

  // Date-range narrowing happens locally so it works even while the API has no
  // date filters; when the server does filter, this is simply a no-op.
  const filteredRows = useMemo(() => {
    return visibleRows.filter((e) => {
      const joining = e.joiningDate || e.dateOfJoining;
      if (joiningFrom && !(joining && new Date(joining) >= new Date(joiningFrom))) return false;
      if (joiningTo && !(joining && new Date(joining) <= new Date(`${joiningTo}T23:59:59`))) return false;
      const lastWorking = exits[String(e.employeeId || e.id)]?.lastWorkingDay || e.exitDate;
      if (workingFrom && !(lastWorking && new Date(lastWorking) >= new Date(workingFrom))) return false;
      if (workingTo && !(lastWorking && new Date(lastWorking) <= new Date(`${workingTo}T23:59:59`))) return false;
      return true;
    });
  }, [visibleRows, joiningFrom, joiningTo, workingFrom, workingTo, exits]);

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => setPage(1), [nameSearch, codeSearch, locationFilter, departmentFilter, statusFilter, pageSize, joiningFrom, joiningTo, workingFrom, workingTo]);

  const kpis = useMemo(() => {
    const accountOpen = filteredRows.filter((e) => accounts[String(e.id)]?.accountActive === true).length;
    const neverLoggedIn = filteredRows.filter((e) => !accounts[String(e.id)]?.lastLoginAt).length;
    return { accountOpen, neverLoggedIn };
  }, [filteredRows, accounts]);

  const activeFilters =
    Boolean(nameSearch || codeSearch || locationFilter || departmentFilter || statusFilter !== 'ALL_INACTIVE' || joiningFrom || joiningTo || workingFrom || workingTo);

  const resetFilters = () => {
    setNameSearch('');
    setCodeSearch('');
    setCodeError(null);
    setLocationFilter('');
    setDepartmentFilter('');
    setStatusFilter('ALL_INACTIVE');
    setJoiningFrom('');
    setJoiningTo('');
    setWorkingFrom('');
    setWorkingTo('');
  };

  const handleCodeSearch = (value: string) => {
    setCodeSearch(value);
    if (!value) {
      setCodeError(null);
      return;
    }
    const check = validateEmployeeCode(value, true);
    setCodeError(check.valid ? null : 'Employee number filters accept digits only (e.g. 1372).');
  };

  const exportCsv = () => {
    if (filteredRows.length === 0) {
      toast.error('Nothing to export for the current filters.');
      return;
    }
    const headers = [
      'Employee Number',
      'Name',
      'Store',
      'Department',
      'Designation',
      'Employment Status',
      'Account Status',
      'Joining Date',
      'Last Working Date',
      'Last Login',
      'Attendance Days',
      'Floor',
      'Counter',
      'Phone',
      'Email',
      'Exit/Deactivation Reason',
      'HR Remarks',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filteredRows.map((e) => {
      const account = accounts[String(e.id)];
      const exit = exits[String(e.employeeId || e.id)];
      return [
        e.employeeCode,
        e.fullName || `${e.firstName || ''} ${e.lastName || ''}`,
        e.location?.name,
        e.department?.name,
        e.designation,
        e.status,
        account?.accountActive === undefined || account === null ? 'unknown' : account.accountActive ? 'active' : 'closed',
        e.joiningDate || e.dateOfJoining,
        exit?.lastWorkingDay || e.exitDate,
        account?.lastLoginAt,
        attendanceTotals[e.id]?.total ?? '',
        e.floor?.name,
        e.section?.name,
        e.phone,
        e.email,
        exit?.reason || e.deactivationReason || e.exitReason || '',
        e.remarks,
      ].map(esc).join(',');
    });
    const blob = new Blob([`\uFEFF${headers.map(esc).join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BSC_Inactive_Employees_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRows.length} inactive employee records (UTF-8).`);
  };

  const onStatusSaved = async (updated: any) => {
    setStatusTarget(null);
    setDrawerEmployee(null);
    setAttendanceTotals({});
    await Promise.all([loadRows(), (async () => setAccounts(await fetchAccountMap()))()]);
    toast.success('Employment status reloaded from the HRMS API.');
  };

  const SortHeader = ({ label, column, className = '' }: { label: string; column: SortKey; className?: string }) => {
    const isActive = sortKey === column;
    return (
      <th
        className={`py-2.5 px-3 font-bold whitespace-nowrap ${className}`}
        aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        <button
          type="button"
          onClick={() => {
            if (isActive) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
            else {
              setSortKey(column);
              setSortDir('asc');
            }
          }}
          className={`inline-flex items-center gap-1 hover:text-[#1346a1] ${isActive ? 'text-[#1346a1] dark:text-sky-300' : ''}`}
        >
          {label}
          {isActive ? (
            sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 opacity-30" />
          )}
        </button>
      </th>
    );
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5 min-w-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <Link href="/employees" className="hover:text-[#1346a1]">Employee records</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[#1346a1] font-bold">Inactive employees</span>
            </div>
            <h1 className="text-2xl font-bold text-[#18181B] tracking-tight mt-1">Inactive Employees</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Employees whose <strong>employment status</strong> was set to an inactive state by HR, with their exit
              reason, last working date, retained attendance and payroll history, and their separate login-account
              activity. These records stay in every historical report and are excluded from active workforce counts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => { setRefreshing(true); Promise.all([loadRows(), loadReferenceData(), fetchAccountMap().then(setAccounts), fetchExitMap().then(setExits)]).finally(() => setRefreshing(false)); }}>
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-1" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Distinction banner */}
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 flex gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
          <p className="text-[11.5px] text-amber-900 dark:text-amber-200">
            <strong>Not signed in ≠ inactive.</strong> Last login is shown in its own column and in the dossier for
            information only; it never decides employment status. A person who has not logged in for months remains an
            active employee until HR changes the record, and a deactivated employee keeps all attendance, payroll and
            document history — deactivation never deletes anything.
          </p>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Inactive records', value: totalCount, tone: 'text-[#1346a1]' },
            { label: 'Login account still open', value: kpis.accountOpen, tone: 'text-amber-600' },
            { label: 'No last login recorded', value: kpis.neverLoggedIn, tone: 'text-slate-600' },
            { label: 'Excluded from active roster', value: totalCount, tone: 'text-emerald-600' },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</p>
              <p className={`text-2xl font-bold mt-1 ${kpi.tone}`}>{loading ? '—' : kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                type="text"
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Search by name"
                className="w-full bg-transparent text-xs focus:outline-none placeholder:text-slate-400"
                aria-label="Search inactive employees by name"
              />
            </div>
            <Input
              label="Employee number (digits only)"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 1372"
              value={codeSearch}
              onChange={(e) => handleCodeSearch(e.target.value)}
              error={codeError ?? undefined}
            />
            <Select
              label="Store / location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              options={[{ value: '', label: 'All locations' }, ...locations.map((l) => ({ value: l.id, label: l.code ? `${l.name} (${l.code})` : l.name }))]}
            />
            <Select
              label="Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              options={[
                { value: '', label: 'All departments' },
                ...departments
                  .filter((d) => !locationFilter || d.locationId === locationFilter)
                  .map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Select
              label="Employment status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL_INACTIVE', label: 'All inactive states' },
                ...INACTIVE_STATUS_OPTIONS.map((s) => ({ value: s, label: s })),
              ]}
            />
            <Input label="Joining from" type="date" value={joiningFrom} onChange={(e) => setJoiningFrom(e.target.value)} />
            <Input label="Joining to" type="date" value={joiningTo} onChange={(e) => setJoiningTo(e.target.value)} />
            <Input label="Last working from" type="date" value={workingFrom} onChange={(e) => setWorkingFrom(e.target.value)} />
            <Input label="Last working to" type="date" value={workingTo} onChange={(e) => setWorkingTo(e.target.value)} />
          </div>

          {activeFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#1346a1] hover:underline"
            >
              <FilterX className="w-3.5 h-3.5" /> Clear all filters
            </button>
          )}
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#18181B]">
              Inactive employee register
              <span className="text-slate-400 font-medium ml-1.5">({totalCount} records)</span>
            </h2>
            <span className="text-[11px] text-slate-500">
              Page {safePage} of {totalPages}
            </span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">Loading inactive employee records…</p>
            </div>
          ) : error ? (
            <div className="p-10 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Could not load employee records</p>
              <p className="text-xs text-slate-500 max-w-lg">{error}</p>
              <Button size="sm" variant="outline" onClick={loadAll}>
                <RefreshCw className="w-4 h-4 mr-1" /> Retry
              </Button>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <UserX className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No inactive employees match these filters
              </p>
              <p className="text-xs text-slate-500">
                Every record is currently active, or the filters are too narrow.
              </p>
              {activeFilters && (
                <Button size="sm" variant="outline" onClick={resetFilters} className="mt-1">
                  <RotateCcw className="w-4 h-4 mr-1" /> Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1180px]">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800 tracking-wider">
                  <tr>
                    <SortHeader label="Emp. no." column="employeeCode" />
                    <SortHeader label="Name" column="fullName" />
                    <SortHeader label="Store" column="location" />
                    <SortHeader label="Department" column="department" />
                    <SortHeader label="Designation" column="designation" />
                    <SortHeader label="Employment status" column="status" />
                    <SortHeader label="Joining date" column="joiningDate" />
                    <SortHeader label="Last working date" column="lastWorkingDate" />
                    <SortHeader label="Last login (info only)" column="lastLoginAt" />
                    <th className="py-2.5 px-3">Attendance history</th>
                    <th className="py-2.5 px-3">Floor / counter</th>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3">Exit / deactivation reason</th>
                    <th className="py-2.5 px-3">HR remarks</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((emp) => {
                    const account = accounts[String(emp.id)];
                    const exit = exits[String(emp.employeeId || emp.id)];
                    const att = attendanceTotals[emp.id];
                    const reason = exit?.reason || emp.deactivationReason || emp.exitReason || reasonFromRemarks(emp.remarks);
                    return (
                      <tr
                        key={emp.id}
                        onClick={() => setDrawerEmployee(emp)}
                        className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors align-top"
                      >
                        <td className="py-3 px-3"><EmployeeCodeText code={emp.employeeCode} /></td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#18181B] dark:text-white">{emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`}</div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wide">{emp.role?.replace(/_/g, ' ')}</div>
                        </td>
                        <td className="py-3 px-3">
                          {emp.location?.name || '—'}
                          {emp.location?.code && <span className="text-slate-400 ml-1">({emp.location.code})</span>}
                        </td>
                        <td className="py-3 px-3">{emp.department?.name || '—'}</td>
                        <td className="py-3 px-3">{emp.designation || '—'}</td>
                        <td className="py-3 px-3">
                          <Badge variant={String(emp.status).toUpperCase() === 'ACTIVE' ? 'success' : 'danger'} dot>
                            {emp.status}
                          </Badge>
                          <div className="text-[10px] text-slate-400 mt-1">
                            {account?.accountActive === undefined || account === null
                              ? 'No login account linked'
                              : account.accountActive
                                ? 'Login: enabled'
                                : 'Login: closed'}
                          </div>
                        </td>
                        <td className="py-3 px-3 font-mono">{formatDateSafe(emp.joiningDate || emp.dateOfJoining)}</td>
                        <td className="py-3 px-3 font-mono">{formatDateSafe(exit?.lastWorkingDay || emp.exitDate)}</td>
                        <td className="py-3 px-3 font-mono text-slate-500">
                          {account?.lastLoginAt ? formatDateTimeSafe(account.lastLoginAt) : 'Not recorded'}
                        </td>
                        <td className="py-3 px-3 whitespace-nowrap">
                          {att === undefined ? (
                            <span className="text-slate-400">loading…</span>
                          ) : (
                            <>
                              <span className="font-bold text-slate-700 dark:text-slate-200">{att.total}</span>
                              <span className="text-slate-400"> day{att.total === 1 ? '' : 's'}</span>
                              {att.latest && <div className="text-[10px] text-slate-400">last {formatDateSafe(att.latest)}</div>}
                            </>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div>{emp.floor?.name || '—'}</div>
                          <div className="text-[10px] text-slate-400">{emp.section?.name || emp.sellingPoints?.find((s: any) => s.isPrimary)?.sellingPoint?.name || 'No counter'}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono">{emp.phone || '—'}</div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{emp.email || '—'}</div>
                        </td>
                        <td className="py-3 px-3 max-w-[220px]">
                          {reason ? (
                            <span className="text-slate-700 dark:text-slate-200">{reason}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3" /> Reason missing
                            </span>
                          )}
                          {exit?.exitType && <div className="text-[10px] text-slate-400 mt-0.5 uppercase">{exit.exitType}</div>}
                        </td>
                        <td className="py-3 px-3 max-w-[200px] text-slate-600 dark:text-slate-300">
                          {emp.remarks ? <span className="line-clamp-3">{emp.remarks}</span> : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex items-center justify-end gap-1.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => setDrawerEmployee(emp)}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                            >
                              Open profile
                            </button>
                            <Link
                              href={`/employees/profile/${emp.id}`}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#1346a1] dark:text-sky-300 border border-[#1346a1]/30 dark:border-sky-500/40 hover:bg-[#1346a1]/10 inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" /> 360°
                            </Link>
                            {canManageStatus && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => setEditEmployee(emp)}
                                  title="Edit master record"
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-[#1346a1] hover:bg-slate-100 dark:hover:bg-slate-800"
                                >
                                  <UserCog className="w-4 h-4" />
                                </button>
                                {String(emp.status).toUpperCase() === 'ACTIVE' ? (
                                  <button
                                    type="button"
                                    onClick={() => setStatusTarget({ employee: emp, intent: 'DEACTIVATE' })}
                                    title="Mark inactive"
                                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                                  >
                                    <UserX className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setStatusTarget({ employee: emp, intent: 'ACTIVATE' })}
                                    title="Reactivate employee"
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                                  >
                                    <RotateCcw className="w-4 h-4" />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {!loading && !error && totalCount > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <span>Rows per page</span>
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1 bg-white dark:bg-slate-800 text-xs"
                  aria-label="Rows per page"
                >
                  {PAGE_SIZES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="xs" variant="outline" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  <ChevronLeft className="w-3.5 h-3.5" /> Prev
                </Button>
                <span className="text-[11px] font-semibold px-2">
                  {safePage} / {totalPages}
                </span>
                <Button size="xs" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <InactiveEmployeeDrawer
        open={Boolean(drawerEmployee)}
        onClose={() => setDrawerEmployee(null)}
        employee={drawerEmployee}
        account={drawerEmployee ? accounts[String(drawerEmployee.id)] : null}
        exit={drawerEmployee ? exits[String(drawerEmployee.employeeId || drawerEmployee.id)] : null}
        canViewPayroll={canViewPayroll}
        canViewDocuments={isHrWorkforce}
        canChangeStatus={canManageStatus}
        onReactivate={(emp) => {
          setDrawerEmployee(null);
          setStatusTarget({ employee: emp, intent: 'ACTIVATE' });
        }}
        onDeactivate={(emp) => {
          setDrawerEmployee(null);
          setStatusTarget({ employee: emp, intent: 'DEACTIVATE' });
        }}
        onEdit={(emp) => {
          setDrawerEmployee(null);
          setEditEmployee(emp);
        }}
      />

      {editEmployee && (
        <HrEmployeeEditDialog
          open={Boolean(editEmployee)}
          employee={editEmployee}
          onClose={() => setEditEmployee(null)}
          mode="hr"
          canManageStatus={canManageStatus}
          canManageSalary={canViewPayroll}
          locations={locations}
          departments={departments.filter((d) => !editEmployee.locationId || d.locationId === editEmployee.locationId)}
          floors={floors}
          sections={sections}
          shifts={shifts}
          onSaved={() => {
            setEditEmployee(null);
            loadRows();
          }}
        />
      )}

      {statusTarget && (
        <EmployeeStatusChangeDialog
          open
          employee={statusTarget.employee}
          intent={statusTarget.intent}
          onClose={() => setStatusTarget(null)}
          onSaved={onStatusSaved}
        />
      )}
    </DashboardLayout>
  );
}
