'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ExternalLink,
  FilterX,
  History,
  Loader2,
  MapPin,
  RefreshCw,
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
import { InactiveEmployeeDrawer } from '../inactive/InactiveEmployeeDrawer';
import { validateEmployeeCode } from '@/lib/employeeCode';
import { formatDateSafe } from '@/lib/utils';
import {
  type AccountMap,
  type ExitMap,
  fetchAccountMap,
  fetchExitMap,
  reasonFromRemarks,
} from '@/lib/inactiveEmployees';
import { ADMIN_ROLES, PAYROLL_ROUTE_ROLES, WORKFORCE_ROUTE_ROLES, roleInGroup } from '@/lib/roles';

/**
 * Employee History register.
 *
 * Historical = the record no longer belongs to the active workforce. Two real
 * sources are combined here, exactly as they are stored:
 *   1. `GET /api/employees?status=` — the employment statuses the backend classifies
 *      as inactive (`TERMINATED`, `RESIGNED`, `RETIRED`, `EX_EMPLOYEE`, `INACTIVE`);
 *   2. `GET /api/exits` — the `employee_exits` rows (exit type, resignation date,
 *      last working day, settlement state) that HR raised for those people.
 * Full & Final *settlement work* stays on `/employees/former`; this screen is the
 * historical register and links there instead of re-implementing it.
 */

/** Employee-master statuses that mean "history", per the backend enum. */
const HISTORY_STATUSES = ['TERMINATED', 'RESIGNED', 'RETIRED', 'EX_EMPLOYEE', 'INACTIVE'] as const;

const EXIT_TYPE_OPTIONS = [
  { value: '', label: 'All exit types' },
  { value: 'RESIGNATION', label: 'Resignation' },
  { value: 'TERMINATION', label: 'Termination' },
  { value: 'RETIREMENT', label: 'Retirement' },
  { value: 'ABSCONDING', label: 'Absconding' },
  { value: 'CONTRACT_END', label: 'Contract end' },
];

const PAGE_SIZES = [10, 25, 50];
/** Hard cap the API applies to `limit`; recorded here so truncation is visible. */
const API_MAX_LIMIT = 100;

type SortKey =
  | 'employeeCode'
  | 'fullName'
  | 'location'
  | 'department'
  | 'status'
  | 'exitType'
  | 'lastWorkingDay'
  | 'resignationDate';

/** Rows are keyed by employee id and merged from both sources. */
interface HistoryRow {
  key: string;
  employeeId: string | null;
  exitId: string | null;
  employee: any | null;
  exit: {
    exitId?: string | null;
    exitType?: string | null;
    reason?: string | null;
    lastWorkingDay?: string | null;
    resignationDate?: string | null;
    exitStatus?: string | null;
    settlementStatus?: string | null;
    settlementAmount?: number | string | null;
  } | null;
  sources: Array<'employee' | 'exit'>;
}

const FREE_LOCATION_ROLES = ['SUPER_ADMIN', 'ADMIN', 'HR_AUDITOR'];

function cellText(value: any): string {
  return value === null || value === undefined ? '' : String(value).toLowerCase();
}

export default function EmployeeHistoryPage() {
  const { data: session, status: authStatus } = useSession();
  const role = (session?.user as any)?.role || 'EMPLOYEE';
  const isHrWorkforce = roleInGroup(role, WORKFORCE_ROUTE_ROLES) || roleInGroup(role, ADMIN_ROLES);
  const canViewPayroll =
    roleInGroup(role, ADMIN_ROLES) ||
    roleInGroup(role, PAYROLL_ROUTE_ROLES) ||
    ['HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'].includes(role);
  const canPickAnyStore = FREE_LOCATION_ROLES.includes(role);

  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [accounts, setAccounts] = useState<AccountMap>({});
  const [exits, setExits] = useState<ExitMap>({});
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [floors, setFloors] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  /** The employee master is the spine of this screen; without it there is no list. */
  const [error, setError] = useState<string | null>(null);
  /** Exit records are a second source: when they fail we say so, we do not hide it. */
  const [exitWarning, setExitWarning] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<string[]>([]);

  // ── filters ───────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [committedSearch, setCommittedSearch] = useState('');
  const [codeSearch, setCodeSearch] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [committedCode, setCommittedCode] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL_HISTORY');
  const [exitTypeFilter, setExitTypeFilter] = useState('');
  const [workingFrom, setWorkingFrom] = useState('');
  const [workingTo, setWorkingTo] = useState('');

  // ── table state ───────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('lastWorkingDay');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // ── dialogs ───────────────────────────────────────────────────────────────
  /** Carries the enriched row (employee master + exit data) into the dossier drawer. */
  const [drawerRow, setDrawerRow] = useState<any | null>(null);
  const [editEmployee, setEditEmployee] = useState<any | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ employee: any; intent: 'ACTIVATE' | 'DEACTIVATE' } | null>(null);

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
   * Load the register. `GET /api/employees` accepts one `status` at a time, so
   * "all history" fans out over the historical statuses (this is what the
   * Inactive Employees screen already does for its single window) and the totals
   * are kept so a truncated read is reported instead of silently shortened.
   */
  const loadRows = useCallback(async () => {
    setError(null);
    setExitWarning(null);
    const statuses = statusFilter === 'ALL_HISTORY' ? [...HISTORY_STATUSES] : [statusFilter];
    const text = committedCode || committedSearch;

    const baseParams: Record<string, any> = { page: 1, limit: API_MAX_LIMIT };
    if (text) baseParams.search = text;
    if (locationFilter && canPickAnyStore) baseParams.locationId = locationFilter;

    try {
      const employeeResults = await Promise.all(
        statuses.map((status) =>
          api
            .get('/employees', { params: { ...baseParams, status } })
            .then((res) => ({ status, ok: true as const, data: res.data }))
            .catch((err: any) => ({
              status,
              ok: false as const,
              message:
                err?.response?.data?.error ||
                err?.response?.data?.message ||
                err?.message ||
                'the employee request failed',
            }))
        )
      );

      const failures = employeeResults.filter((r) => !r.ok);
      if (failures.length === employeeResults.length) {
        const first: any = failures[0];
        throw Object.assign(new Error(first.message || 'Employee records could not be loaded.'), {
          status: (first as any).status,
        });
      }
      if (failures.length > 0) {
        setExitWarning(
          `Part of the roster could not be read (${failures.map((f: any) => f.status).join(', ')}): ${
            (failures[0] as any).message
          }`
        );
      }

      const employeeRows = employeeResults
        .filter((r) => r.ok)
        .flatMap((r: any) => (Array.isArray(r.data?.employees) ? r.data.employees : []));

      const byEmployee = new Map<string, HistoryRow>();
      for (const emp of employeeRows) {
        const id = String(emp?.id ?? '');
        if (!id) continue;
        byEmployee.set(id, {
          key: `emp:${id}`,
          employeeId: id,
          exitId: null,
          employee: emp,
          exit: null,
          sources: ['employee'],
        });
      }

      const truncation: string[] = [];
      for (const r of employeeResults) {
        if (!r.ok) continue;
        const total = Number((r as any).data?.total ?? 0);
        const fetched = ((r as any).data?.employees || []).length;
        if (total > fetched) truncation.push(`${r.status}: ${fetched} of ${total}`);
      }

      // Exit records (`employee_exits`) — the documented reason, dates and F&F state.
      let exitRows: any[] = [];
      try {
        const exitParams: Record<string, any> = { page: 1, limit: API_MAX_LIMIT };
        if (text) exitParams.search = text;
        if (locationFilter && canPickAnyStore) exitParams.locationId = locationFilter;
        const exitRes = await api.get('/exits', { params: exitParams });
        exitRows = exitRes.data?.exits || exitRes.data?.employees || [];
        const exitTotal = Number(exitRes.data?.pagination?.total ?? exitRes.data?.total ?? exitRows.length);
        if (exitTotal > exitRows.length) truncation.push(`Exit records: ${exitRows.length} of ${exitTotal}`);
      } catch (err: any) {
        setExitWarning(
          `Exit records (${err?.response?.status || 'network'}) — ${
            err?.response?.data?.error || err?.message || 'the exits request failed'
          }. Reasons and last working days from the exit workflow are unavailable for this load.`
        );
      }

      for (const exit of exitRows) {
        const empId = String(exit?.employee_id ?? exit?.employeeId ?? '');
        if (!empId) continue;
        const exitInfo = {
          exitId: String(exit.exit_id ?? exit.id ?? '') || null,
          exitType: exit.exit_type ?? null,
          reason: exit.reason ?? null,
          lastWorkingDay: exit.last_working_day ?? null,
          resignationDate: exit.resignation_date ?? null,
          exitStatus: exit.exit_status ?? null,
          settlementStatus: exit.settlement_status ?? null,
          settlementAmount: exit.settlement_amount ?? null,
        };
        const existing = byEmployee.get(empId);
        if (existing) {
          existing.exit = exitInfo;
          existing.exitId = String(exit.exit_id ?? exit.id ?? '') || null;
          existing.sources.push('exit');
        } else if (statusFilter === 'ALL_HISTORY') {
          // An exit without a matching historical master row in this window is
          // still a historical record — show it from the exit data itself.
          byEmployee.set(empId, {
            key: `exit:${empId}`,
            employeeId: empId,
            exitId: String(exit.exit_id ?? exit.id ?? '') || null,
            employee: {
              id: empId,
              employeeCode: exit.employee_code ?? exit.employeeCode ?? null,
              fullName: exit.full_name ?? exit.fullName ?? null,
              location: exit.location_name ? { name: exit.location_name } : null,
              department: exit.department_name ? { name: exit.department_name } : null,
              designation: exit.designation ?? null,
              status: exit.status ?? null,
              joiningDate: exit.joiningDate ?? exit.joining_date ?? null,
            },
            exit: exitInfo,
            sources: ['exit'],
          });
        }
      }

      setTruncated(truncation);
      setRows([...byEmployee.values()]);
    } catch (err: any) {
      const status = err?.response?.status ?? err?.status;
      const serverMessage = err?.response?.data?.error || err?.response?.data?.message || err?.message;
      setError(
        status === 403
          ? `Your role (${role.replace(/_/g, ' ')}) is not allowed to read the historical employee register — the server replied 403.`
          : serverMessage || 'Employee records could not be loaded from the HRMS API.'
      );
      setRows([]);
      setTruncated([]);
    }
  }, [statusFilter, committedSearch, committedCode, locationFilter, canPickAnyStore, role]);

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

  useEffect(() => {
    setPage(1);
  }, [
    committedSearch,
    committedCode,
    locationFilter,
    statusFilter,
    exitTypeFilter,
    workingFrom,
    workingTo,
    pageSize,
  ]);

  const enriched = useMemo(() => {
    return rows.map((row) => {
      const empId = String(row.employeeId ?? '');
      const exitFromMap = exits[empId] || exits[String(row.employee?.employeeId ?? '')];
      const exit = row.exit || exitFromMap || null;
      const reason =
        (exit as any)?.reason ||
        row.employee?.employmentStatusReason ||
        row.employee?.deactivationReason ||
        reasonFromRemarks(row.employee?.remarks);
      const lastWorkingDay = (exit as any)?.lastWorkingDay || row.employee?.exitDate || null;
      return { ...row, exit, reason, lastWorkingDay };
    });
  }, [rows, exits]);

  const filteredRows = useMemo(() => {
    return enriched.filter((row) => {
      if (exitTypeFilter && String(row.exit?.exitType || '').toUpperCase() !== exitTypeFilter) return false;
      const working = row.lastWorkingDay;
      if (workingFrom && !(working && new Date(working) >= new Date(workingFrom))) return false;
      if (workingTo && !(working && new Date(working) <= new Date(`${workingTo}T23:59:59`))) return false;
      return true;
    });
  }, [enriched, exitTypeFilter, workingFrom, workingTo]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const pick = (row: any): any => {
      const emp = row.employee || {};
      switch (sortKey) {
        case 'employeeCode':
          return emp.employeeCode;
        case 'fullName':
          return emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`;
        case 'location':
          return emp.location?.name;
        case 'department':
          return emp.department?.name;
        case 'status':
          return emp.status;
        case 'exitType':
          return row.exit?.exitType;
        case 'lastWorkingDay':
          return row.lastWorkingDay;
        case 'resignationDate':
          return row.exit?.resignationDate;
        default:
          return null;
      }
    };
    return [...filteredRows].sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      const na = new Date(va).getTime();
      const nb = new Date(vb).getTime();
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return dir * (na - nb);
      return dir * cellText(va).localeCompare(cellText(vb));
    });
  }, [filteredRows, sortKey, sortDir]);

  const totalCount = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sortedRows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const activeFilters = Boolean(
    committedSearch ||
      committedCode ||
      locationFilter ||
      statusFilter !== 'ALL_HISTORY' ||
      exitTypeFilter ||
      workingFrom ||
      workingTo
  );

  const resetFilters = () => {
    setSearch('');
    setCodeSearch('');
    setCodeError(null);
    setLocationFilter('');
    setStatusFilter('ALL_HISTORY');
    setExitTypeFilter('');
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
    setCodeError(check.valid ? null : 'Employee number filters accept digits only (e.g. 100201).');
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
      'Employment Status',
      'Exit Type',
      'Resignation Date',
      'Last Working Day',
      'Exit Status',
      'Settlement Status',
      'Reason',
      'Sources',
    ];
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filteredRows.map((row) => {
      const emp = row.employee || {};
      return [
        emp.employeeCode,
        emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`,
        emp.location?.name,
        emp.department?.name,
        emp.status,
        row.exit?.exitType,
        row.exit?.resignationDate,
        row.lastWorkingDay,
        row.exit?.exitStatus,
        row.exit?.settlementStatus,
        row.reason,
        row.sources.join('+'),
      ]
        .map(esc)
        .join(',');
    });
    const blob = new Blob([`\uFEFF${headers.map(esc).join(',')}\n${lines.join('\n')}`], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BSC_Employee_History_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success(`Exported ${filteredRows.length} historical records (UTF-8).`);
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
          className={`inline-flex items-center gap-1 hover:text-[#1346a1] ${
            isActive ? 'text-[#1346a1] dark:text-sky-300' : ''
          }`}
        >
          {label}
          {isActive ? (
            sortDir === 'asc' ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )
          ) : (
            <ChevronDown className="w-3.5 h-3.5 opacity-30" />
          )}
        </button>
      </th>
    );
  };

  const drawerEmployee = drawerRow?.employee || null;
  const drawerAccount = drawerEmployee ? accounts[String(drawerEmployee.id)] || null : null;
  const drawerExit = drawerRow
    ? {
        exitId: drawerRow.exit?.exitId ?? drawerRow.exitId,
        exitType: drawerRow.exit?.exitType ?? null,
        reason: drawerRow.reason ?? null,
        lastWorkingDay: drawerRow.lastWorkingDay ?? null,
        resignationDate: drawerRow.exit?.resignationDate ?? null,
        exitStatus: drawerRow.exit?.exitStatus ?? null,
        settlementStatus: drawerRow.exit?.settlementStatus ?? null,
      }
    : null;

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5 min-w-0">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <Link href="/employees" className="hover:text-[#1346a1]">Employee records</Link>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="text-[#1346a1] font-bold">Employee history</span>
            </div>
            <h1 className="text-2xl font-bold text-[#18181B] tracking-tight mt-1">Employee History</h1>
            <p className="text-xs text-slate-500 mt-1 max-w-3xl">
              Every departed or withdrawn record — employment status{' '}
              <strong>{HISTORY_STATUSES.join(', ')}</strong> from the employee table, joined with the{' '}
              <strong>employee_exits</strong> rows (exit type, resignation date, last working day, settlement state).
              History is never deleted: attendance, payroll and documents stay attached to the record.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setRefreshing(true);
                Promise.all([loadRows(), loadReferenceData(), fetchAccountMap().then(setAccounts), fetchExitMap().then(setExits)]).finally(
                  () => setRefreshing(false)
                );
              }}
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button size="sm" variant="secondary" onClick={exportCsv}>
              <History className="w-4 h-4 mr-1" /> Export CSV
            </Button>
            <Link
              href="/employees/former"
              className="px-3 py-1.5 rounded-lg text-[11px] font-semibold text-[#1346a1] border border-[#1346a1]/30 hover:bg-[#1346a1]/10 inline-flex items-center gap-1"
            >
              <ExternalLink className="w-3 h-3" /> Full &amp; Final settlement
            </Link>
          </div>
        </div>

        {/* Scope + integrity notices */}
        {!canPickAnyStore && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 dark:bg-sky-950/30 dark:border-sky-800 p-3 flex gap-2">
            <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-sky-700" />
            <p className="text-[11.5px] text-sky-900 dark:text-sky-200">
              <strong>Store-scoped view.</strong> The API limits a {role.replace(/_/g, ' ')} to their own store for both
              the employee table and the exit register, so other stores&apos; history is never returned. The store filter
              is disabled because the server ignores it.
            </p>
          </div>
        )}

        {exitWarning && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-700" />
            <p className="text-[11.5px] text-amber-900 dark:text-amber-200">
              <strong>Partial data.</strong> {exitWarning}
            </p>
          </div>
        )}

        {truncated.length > 0 && (
          <div className="rounded-xl border border-slate-300 bg-slate-50 dark:bg-slate-800/60 dark:border-slate-700 p-3 flex gap-2">
            <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0 text-slate-600" />
            <p className="text-[11.5px] text-slate-700 dark:text-slate-200">
              <strong>Read window.</strong> The API returns at most {API_MAX_LIMIT} rows per request, so this pass
              covered {truncated.join('; ')}. Narrow the status or search filter to reach the rest.
            </p>
          </div>
        )}

        {/* KPI strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Historical records', value: loading ? '—' : error ? '—' : totalCount },
            { label: 'With an exit record', value: loading ? '—' : error ? '—' : enriched.filter((r) => r.exit).length },
            {
              label: 'Reason not documented',
              value: loading ? '—' : error ? '—' : enriched.filter((r) => !r.reason).length,
            },
            {
              label: 'Settled (paid / closed)',
              value: loading
                ? '—'
                : error
                ? '—'
                : enriched.filter((r) => ['PAID', 'CLOSED'].includes(String(r.exit?.settlementStatus || '').toUpperCase()))
                    .length,
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
                placeholder="Search name, employee number, email"
                className="w-full bg-transparent text-xs focus:outline-none placeholder:text-slate-400"
                aria-label="Search historical employees"
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
                ...locations.map((l) => ({ value: l.id, label: l.code ? `${l.name} (${l.code})` : l.name })),
              ]}
            />
            <Select
              label="Employment status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'ALL_HISTORY', label: 'All historical statuses' },
                ...HISTORY_STATUSES.map((s) => ({ value: s, label: s })),
              ]}
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Select
              label="Exit type"
              value={exitTypeFilter}
              onChange={(e) => setExitTypeFilter(e.target.value)}
              options={EXIT_TYPE_OPTIONS}
            />
            <Input label="Last working from" type="date" value={workingFrom} onChange={(e) => setWorkingFrom(e.target.value)} />
            <Input label="Last working to" type="date" value={workingTo} onChange={(e) => setWorkingTo(e.target.value)} />
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
              Historical employee register
              <span className="text-slate-400 font-medium ml-1.5">
                ({error ? 'unavailable' : `${totalCount} records`})
              </span>
            </h2>
            <span className="text-[11px] text-slate-500">Page {safePage} of {totalPages}</span>
          </div>

          {loading ? (
            <div className="p-12 flex flex-col items-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="text-xs">Loading historical records and exit documentation…</p>
            </div>
          ) : error ? (
            <div className="p-10 flex flex-col items-center gap-3 text-center">
              <AlertTriangle className="w-7 h-7 text-amber-500" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">The history could not be loaded</p>
              <p className="text-xs text-slate-500 max-w-lg">{error}</p>
              <Button size="sm" variant="outline" onClick={loadAll}>
                <RefreshCw className="w-4 h-4 mr-1" /> Retry
              </Button>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <UserX className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                No historical records match these filters
              </p>
              <p className="text-xs text-slate-500">
                {activeFilters
                  ? 'Every record in the loaded window is filtered out. Clear the filters to see the full register.'
                  : 'The HRMS API has no terminated, resigned, retired or ex-employee records, and no exit rows, yet. This is a real empty result — not a failed request.'}
              </p>
              {activeFilters && (
                <Button size="sm" variant="outline" onClick={resetFilters} className="mt-1">
                  <FilterX className="w-4 h-4 mr-1" /> Clear filters
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[1120px]">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 dark:border-slate-800 tracking-wider">
                  <tr>
                    <SortHeader label="Emp. no." column="employeeCode" />
                    <SortHeader label="Name" column="fullName" />
                    <SortHeader label="Store" column="location" />
                    <SortHeader label="Department" column="department" />
                    <SortHeader label="Employment status" column="status" />
                    <SortHeader label="Exit type" column="exitType" />
                    <SortHeader label="Resignation date" column="resignationDate" />
                    <SortHeader label="Last working day" column="lastWorkingDay" />
                    <th className="py-2.5 px-3">Exit status</th>
                    <th className="py-2.5 px-3">Settlement</th>
                    <th className="py-2.5 px-3">Documented reason</th>
                    <th className="py-2.5 px-3">Source</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pageRows.map((row: any) => {
                    const emp = row.employee || {};
                    const account = accounts[String(emp.id || '')] || null;
                    const hasMaster = row.sources.includes('employee');
                    return (
                      <tr
                        key={row.key}
                        onClick={() => hasMaster && setDrawerRow(row)}
                        className={`transition-colors align-top ${
                          hasMaster
                            ? 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40 cursor-pointer'
                            : 'hover:bg-slate-50/60 dark:hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-3 px-3">
                          <EmployeeCodeText code={emp.employeeCode} />
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold text-[#18181B] dark:text-white">
                            {emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || '—'}
                          </div>
                          <div className="text-[10px] text-slate-400 uppercase tracking-wide">
                            {emp.designation || (emp.role ? emp.role.replace(/_/g, ' ') : '—')}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          {emp.location?.name || '—'}
                          {emp.location?.code && <span className="text-slate-400 ml-1">({emp.location.code})</span>}
                        </td>
                        <td className="py-3 px-3">{emp.department?.name || '—'}</td>
                        <td className="py-3 px-3">
                          {emp.status ? (
                            <Badge variant="danger" dot>
                              {emp.status}
                            </Badge>
                          ) : (
                            <span className="text-slate-400">Not in employee master</span>
                          )}
                          {account && (
                            <div className="text-[10px] text-slate-400 mt-1">
                              {account.accountActive ? 'Login: enabled' : 'Login: closed'}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {row.exit?.exitType ? (
                            <span className="text-slate-700 dark:text-slate-200">
                              {String(row.exit.exitType).replace(/_/g, ' ')}
                            </span>
                          ) : (
                            <span className="text-slate-400">No exit record</span>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono">{formatDateSafe(row.exit?.resignationDate)}</td>
                        <td className="py-3 px-3 font-mono">{formatDateSafe(row.lastWorkingDay)}</td>
                        <td className="py-3 px-3">{row.exit?.exitStatus || '—'}</td>
                        <td className="py-3 px-3">{row.exit?.settlementStatus || '—'}</td>
                        <td className="py-3 px-3 max-w-[240px]">
                          {row.reason ? (
                            <span className="text-slate-700 dark:text-slate-200 line-clamp-3">{row.reason}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 text-[10px] font-bold">
                              <AlertTriangle className="w-3 h-3" /> Reason missing
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="flex flex-wrap gap-1">
                            {row.sources.includes('employee') && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                                Employee master
                              </span>
                            )}
                            {row.sources.includes('exit') && (
                              <span className="px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/50 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                                Exit record
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div
                            className="flex items-center justify-end gap-1.5 whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {hasMaster ? (
                              <button
                                type="button"
                                onClick={() => setDrawerRow(row)}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"
                              >
                                Open profile
                              </button>
                            ) : (
                              <span
                                title="This row comes from the exit register only — there is no employee master record to open."
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-400 bg-slate-50 dark:bg-slate-800/60 cursor-not-allowed"
                              >
                                No master record
                              </span>
                            )}
                            <Link
                              href={`/employees/profile/${emp.id}`}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-[#1346a1] dark:text-sky-300 border border-[#1346a1]/30 dark:border-sky-500/40 hover:bg-[#1346a1]/10 inline-flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" /> 360°
                            </Link>
                            {row.exit?.exitId && (
                              <Link
                                href="/employees/former"
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1"
                              >
                                F&amp;F
                              </Link>
                            )}
                            {isHrWorkforce && hasMaster && (
                              <button
                                type="button"
                                onClick={() => setEditEmployee(emp)}
                                title="Edit master record"
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1346a1] hover:bg-slate-100 dark:hover:bg-slate-800"
                              >
                                <UserCog className="w-4 h-4" />
                              </button>
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

      {hasDrawerValue(drawerRow) && (
        <InactiveEmployeeDrawer
          open={Boolean(drawerRow)}
          onClose={() => setDrawerRow(null)}
          employee={drawerEmployee}
          account={drawerAccount}
          exit={drawerExit as any}
          canViewPayroll={canViewPayroll}
          canViewDocuments={isHrWorkforce}
          canChangeStatus={isHrWorkforce}
          onReactivate={(emp) => {
            setDrawerRow(null);
            setStatusTarget({ employee: emp, intent: 'ACTIVATE' });
          }}
          onDeactivate={(emp) => {
            setDrawerRow(null);
            setStatusTarget({ employee: emp, intent: 'DEACTIVATE' });
          }}
          onEdit={(emp) => {
            setDrawerRow(null);
            setEditEmployee(emp);
          }}
        />
      )}

      {editEmployee && (
        <HrEmployeeEditDialog
          open={Boolean(editEmployee)}
          employee={editEmployee}
          onClose={() => setEditEmployee(null)}
          mode="hr"
          canManageStatus={isHrWorkforce}
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
          onSaved={async () => {
            setStatusTarget(null);
            await loadRows();
            toast.success('Employment status reloaded from the HRMS API.');
          }}
        />
      )}
    </DashboardLayout>
  );
}

/** The dossier drawer needs an employee master row; exit-only rows are read in-table. */
function hasDrawerValue(row: HistoryRow | null): boolean {
  return Boolean(row && row.sources.includes('employee') && row.employee);
}
