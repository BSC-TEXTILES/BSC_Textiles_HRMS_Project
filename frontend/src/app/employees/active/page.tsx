'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FilterX,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  UserCog,
  UserCheck,
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
import { EmployeeQuickDetailsDrawer } from '@/components/employees/drawers/EmployeeQuickDetailsDrawer';
import { HrEmployeeEditDialog } from '@/components/employees/HrEmployeeEditDialog';
import { EmployeeStatusChangeDialog } from '@/components/employees/EmployeeStatusChangeDialog';
import { validateEmployeeCode } from '@/lib/employeeCode';
import { formatDateSafe } from '@/lib/utils';
import { ADMIN_ROLES, PAYROLL_ROUTE_ROLES, WORKFORCE_ROUTE_ROLES, roleInGroup } from '@/lib/roles';

/**
 * Active Employee roster.
 *
 * "Active" is the employment status on `employee.status`, exactly as the API
 * defines it (`GET /api/employees?status=`), never a guess derived from logins
 * or punches. The list is paginated by the server (`page` / `limit` / `total`),
 * so a page never claims to be complete when the API has more rows.
 */

/** Statuses the backend enum actually accepts for the active workforce. */
const ACTIVE_STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active (on the roster)' },
  { value: 'ON_LEAVE', label: 'On leave (still employed)' },
];

const PAGE_SIZES = [10, 25, 50, 100];

/**
 * Roles whose `locationId` the API does NOT pin — mirrors `isElevated` in
 * `backend/src/routes/employees.ts`, so the store picker is only enabled where
 * the server will actually honour it.
 */
const FREE_LOCATION_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'];

export default function ActiveEmployeesPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role || 'EMPLOYEE';
  const isHrWorkforce = roleInGroup(role, WORKFORCE_ROUTE_ROLES) || roleInGroup(role, ADMIN_ROLES);
  const canViewPayroll =
    roleInGroup(role, ADMIN_ROLES) ||
    roleInGroup(role, PAYROLL_ROUTE_ROLES) ||
    ['HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'].includes(role);
  const canManageRoster = isHrWorkforce;
  const canPickAnyStore = FREE_LOCATION_ROLES.includes(role);

  // ── source data ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [onLeaveTotal, setOnLeaveTotal] = useState<number | null>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [codeSearch, setCodeSearch] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [committedCode, setCommittedCode] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ACTIVE');

  // ── table state (server-side pagination) ──────────────────────────────────
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // ── dialogs ───────────────────────────────────────────────────────────────
  const [drawerEmployee, setDrawerEmployee] = useState<any | null>(null);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ employee: any; intent: 'ACTIVATE' | 'DEACTIVATE' } | null>(null);

  // Debounce the free-text filters so typing does not fire one request per key.
  useEffect(() => {
    const t = setTimeout(() => setCommittedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const t = setTimeout(() => setCommittedCode(codeSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [codeSearch]);

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
   * `GET /api/employees` — one employment status per request (that is the real
   * contract), so the status picker offers exactly the statuses the API accepts.
   */
  const loadRows = useCallback(async () => {
    setError(null);
    try {
      const params: Record<string, any> = { page, limit: pageSize, status: statusFilter };
      const text = committedCode || committedSearch;
      if (text) params.search = text;
      if (locationFilter && canPickAnyStore) params.locationId = locationFilter;
      if (departmentFilter) params.departmentId = departmentFilter;

      const res = await api.get('/employees', { params });
      const list: any[] = res.data?.employees;
      if (!Array.isArray(list)) {
        throw new Error('The employee roster response did not contain a list of records.');
      }
      setRows(list);
      setTotalCount(Number(res.data?.total ?? list.length));
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMessage =
        err?.response?.data?.error || err?.response?.data?.message || err?.message;
      setError(
        status === 403
          ? `Your role (${role.replace(/_/g, ' ')}) is not allowed to read the employee roster — the server replied 403.`
          : serverMessage || 'Employee records could not be loaded from the HRMS API.'
      );
      setRows([]);
      setTotalCount(0);
    }
  }, [page, pageSize, statusFilter, committedSearch, committedCode, locationFilter, departmentFilter, canPickAnyStore, role]);

  /** Companion count so "on leave" is visible without pretending it is absent. */
  const loadOnLeaveCount = useCallback(async () => {
    try {
      const res = await api.get('/employees', { params: { page: 1, limit: 1, status: 'ON_LEAVE' } });
      setOnLeaveTotal(Number(res.data?.total ?? 0));
    } catch {
      // Honest unknown — the KPI renders "—" instead of a made-up number.
      setOnLeaveTotal(null);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadRows(), loadOnLeaveCount(), loadReferenceData()]);
    setLoading(false);
  }, [loadRows, loadOnLeaveCount, loadReferenceData]);

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    loadAll();
  }, [authStatus, loadAll]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, committedSearch, committedCode, locationFilter, departmentFilter, pageSize]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const shownFrom = totalCount === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const shownTo = Math.min(safePage * pageSize, totalCount);

  const departmentOptions = useMemo(
    () => [
      { value: '', label: 'All departments' },
      ...departments
        .filter((d) => !locationFilter || !canPickAnyStore || d.locationId === locationFilter)
        .map((d) => ({ value: d.id, label: d.name })),
    ],
    [departments, locationFilter, canPickAnyStore]
  );

  const activeFilters = Boolean(
    committedSearch || committedCode || locationFilter || departmentFilter || statusFilter !== 'ACTIVE'
  );

  const resetFilters = () => {
    setSearch('');
    setCodeSearch('');
    setCodeError(null);
    setLocationFilter('');
    setDepartmentFilter('');
    setStatusFilter('ACTIVE');
  };

  const handleCodeSearch = (value: string) => {
    setCodeSearch(value);
    if (!value) {
      setCodeError(null);
      return;
    }
    const check = validateEmployeeCode(value, true);
    setCodeError(check.valid ? null : 'Employee number filters accept digits only (e.g. 100201).');
  };

  const exportCsv = () => {
    if (rows.length === 0) {
      toast.error('Nothing to export — this page has no active records.');
      return;
    }
    const headers = [
      'Employee Number',
      'Name',
      'Store',
      'Department',
      'Designation',
      'Employment Status',
      'Joining Date',
      'Floor',
      'Counter',
      'Shift',
      'Phone',
      'Email',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map((e) =>
      [
        e.employeeCode,
        e.fullName || `${e.firstName || ''} ${e.lastName || ''}`,
        e.location?.name,
        e.department?.name,
        e.designation,
        e.status,
        e.joiningDate || e.dateOfJoining,
        e.floor?.name,
        e.section?.name || e.sellingPoints?.find((s: any) => s.isPrimary)?.sellingPoint?.name,
        e.shift?.name,
        e.phone,
        e.email,
      ]
        .map(esc)
        .join(',')
    );
    const blob = new Blob([`\uFEFF${headers.map(esc).join(',')}\n${lines.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BSC_Active_Employees_page_${safePage}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success(`Exported the ${rows.length} active records on this page (UTF-8).`);
  };

  const onStatusSaved = async () => {
    setStatusTarget(null);
    setDrawerEmployee(null);
    await Promise.all([loadRows(), loadOnLeaveCount()]);
    toast.success('Employment status reloaded from the HRMS API.');
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
              <span className="text-[#1346a1] font-bold">Active employees</span>
            </div>
            <h1 className="text-2xl font-bold text-[#18181B] tracking-tight mt-1">Active Employees</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              The live workforce: every record whose employment status on the HRMS employee table is{' '}
              <strong>{statusFilter}</strong>, read from <code>GET /api/employees</code>. Records are counted active by
              HR status only — signing in or punching is never used to decide employment.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRefreshing(true);
                Promise.all([loadRows(), loadOnLeaveCount(), loadReferenceData()]).finally(() => setRefreshing(false));
              }}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <Download className="w-4 h-4 mr-1" /> Export this page
            </Button>
          </div>
        </div>

        {/* Scope notice for location-pinned roles */}
        {!canPickAnyStore && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 p-3 flex gap-2">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-sky-700" />
            <p className="text-[11.5px] text-sky-900 dark:text-sky-200">
              <strong>Store-scoped view.</strong> The API pins every roster query for a{' '}
              {role.replace(/_/g, ' ')} to your own store, so this list can never include another store&apos;s
              employees. The store filter below is disabled because the server ignores it.
            </p>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Active employees', value: loading && error === null ? '—' : error ? '—' : totalCount },
            { label: 'On the current page', value: loading ? '—' : rows.length },
            { label: 'On leave (still employed)', value: loading ? '—' : onLeaveTotal === null ? '—' : onLeaveTotal },
            {
              label: 'Pages available',
              value: loading ? '—' : error ? '—' : `${safePage} / ${totalPages}`,
            },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="bg-white dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-3"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{kpi.label}</p>
              <p className="text-2xl font-bold mt-1 text-[#1346a1]">{kpi.value}</p>
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
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, code, email, designation"
                className="w-full bg-transparent text-xs focus:outline-none placeholder:text-slate-400"
                aria-label="Search active employees"
              />
            </div>
            <Input
              label="Employee number (digits only)"
              type="text"
              inputMode="numeric"
              placeholder="e.g. 100201"
              value={codeSearch}
              onChange={(e) => handleCodeSearch(e.target.value)}
              error={codeError ?? undefined}
            />
            <Select
              label="Store / location"
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              disabled={!canPickAnyStore}
              options={[
                { value: '', label: canPickAnyStore ? 'All locations' : 'My store (fixed by role)' },
                ...locations.map((l) => ({
                  value: l.id,
                  label: l.code ? `${l.name} (${l.code})` : l.name,
                })),
              ]}
            />
            <Select
              label="Department"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
              options={departmentOptions}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select
              label="Employment status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={ACTIVE_STATUS_OPTIONS}
            />
            <Select
              label="Rows per page"
              value={String(pageSize)}
              onChange={(e) => setPageSize(Number(e.target.value))}
              options={PAGE_SIZES.map((s) => ({ value: String(s), label: `${s} per page` }))}
            />
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
              Active employee roster
              <span className="text-slate-400 font-medium ml-1.5">
                ({error ? 'unavailable' : `${totalCount} records`})
              </span>
            </h2>
            <span className="text-[11px] text-slate-500">
              {totalCount === 0 ? 'No rows' : `Showing ${shownFrom}–${shownTo} of ${totalCount}`}
            </span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">Loading the active roster from the HRMS API…</p>
            </div>
          ) : error ? (
            <div className="p-10 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                The employee list was not loaded
              </p>
              <p className="text-xs text-slate-500 max-w-lg">{error}</p>
              <Button size="sm" variant="outline" onClick={loadAll}>
                <RefreshCw className="w-4 h-4 mr-1" /> Retry
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <UserCheck className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No employees currently hold the status “{statusFilter}”
              </p>
              <p className="text-xs text-slate-500">
                {activeFilters
                  ? 'The filters exclude every active record. Clear them to see the full roster.'
                  : 'The HRMS API returned an empty roster for this status. Inactive and departed records live on the Inactive Employees and Employee History screens.'}
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {activeFilters && (
                  <Button size="sm" variant="outline" onClick={resetFilters}>
                    <FilterX className="w-4 h-4 mr-1" /> Clear filters
                  </Button>
                )}
                <Link
                  href="/employees/inactive"
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#1346a1] border border-[#1346a1]/30 hover:bg-[#1346a1]/10"
                >
                  Inactive employees
                </Link>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1080px]">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800 tracking-wider">
                  <tr>
                    <th className="py-2.5 px-3">Emp. no.</th>
                    <th className="py-2.5 px-3">Name</th>
                    <th className="py-2.5 px-3">Store</th>
                    <th className="py-2.5 px-3">Department</th>
                    <th className="py-2.5 px-3">Designation</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Joining date</th>
                    <th className="py-2.5 px-3">Floor / counter</th>
                    <th className="py-2.5 px-3">Shift</th>
                    <th className="py-2.5 px-3">Contact</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rows.map((emp) => (
                    <tr
                      key={emp.id}
                      onClick={() => setDrawerEmployee(emp)}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer transition-colors align-top"
                    >
                      <td className="py-3 px-3">
                        <EmployeeCodeText code={emp.employeeCode} />
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-bold text-[#18181B] dark:text-white">
                          {emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || '—'}
                        </div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                          {emp.role ? emp.role.replace(/_/g, ' ') : '—'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        {emp.location?.name || '—'}
                        {emp.location?.code && <span className="text-slate-400 ml-1">({emp.location.code})</span>}
                      </td>
                      <td className="py-3 px-3">{emp.department?.name || '—'}</td>
                      <td className="py-3 px-3">{emp.designation || '—'}</td>
                      <td className="py-3 px-3">
                        <Badge variant={String(emp.status).toUpperCase() === 'ACTIVE' ? 'success' : 'warning'} dot>
                          {emp.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 font-mono">{formatDateSafe(emp.joiningDate || emp.dateOfJoining)}</td>
                      <td className="py-3 px-3">
                        <div>{emp.floor?.name || '—'}</div>
                        <div className="text-[10px] text-slate-400">
                          {emp.section?.name ||
                            emp.sellingPoints?.find((s: any) => s.isPrimary)?.sellingPoint?.name ||
                            'No counter'}
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <div>{emp.shift?.name || 'No shift linked'}</div>
                        {emp.shift?.startTime && (
                          <div className="text-[10px] text-slate-400">
                            {String(emp.shift.startTime).slice(11, 16)} – {String(emp.shift.endTime).slice(11, 16)}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <div className="font-mono">{emp.phone || '—'}</div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[160px]">{emp.email || '—'}</div>
                      </td>
                      <td className="py-3 px-3">
                        <div
                          className="flex items-center justify-end gap-1.5 whitespace-nowrap"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                          {canManageRoster && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditEmployee(emp)}
                                title="Edit master record"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1346a1] hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <UserCog className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setStatusTarget({ employee: emp, intent: 'DEACTIVATE' })}
                                title="Mark inactive"
                                className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40"
                              >
                                <UserX className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination (server-side) */}
          {!loading && !error && totalCount > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                <span>
                  {totalCount > rows.length
                    ? `${totalCount} records match — ${rows.length} shown for page ${safePage}.`
                    : `All ${totalCount} matching records are on this page.`}
                </span>
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

      <EmployeeQuickDetailsDrawer
        open={Boolean(drawerEmployee)}
        onClose={() => setDrawerEmployee(null)}
        employee={drawerEmployee}
      />

      {editEmployee && (
        <HrEmployeeEditDialog
          open={Boolean(editEmployee)}
          employee={editEmployee}
          onClose={() => setEditEmployee(null)}
          mode="hr"
          canManageStatus={canManageRoster}
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
