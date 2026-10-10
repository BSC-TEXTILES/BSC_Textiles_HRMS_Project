'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { fetchScope, empOf, ROSTER_LIMIT, type DrillFilters, type Scope } from '@/lib/dashboardScope';
import { CORRECTION_RECORDS } from '@/lib/correctionRecords';
import {
  Pill,
  EmpCell,
  fmtTime,
  fmtDate,
  prettyEnum,
  EMP_STATUS_TONE,
  INC_STATUS_TONE,
  type DrillColumn,
  type Tone,
} from './drillParts';

/**
 * Generic drill-down detail modal used by the Floor Shift Regularization and
 * Monthly Report dashboards. Each metric maps to real API data, respects the
 * active filters, and supports search, pagination, CSV export, loading / empty /
 * error states, and employee rows that open the full employee profile.
 */
export type DetailMetric =
  | 'shift-configs'
  | 'shift-roster'
  | 'shift-exceptions'
  | 'muster'
  | 'face'
  | 'qr'
  | 'incentives'
  | 'compliance';

export interface DetailFilters extends DrillFilters {
  /** Reporting month (yyyy-MM) for Monthly Report drill-downs. */
  month?: string;
}

export interface DetailChip {
  label: string;
  value: string;
}

interface DetailState {
  rows: any[];
  columns: DrillColumn[];
  summaryChips: DetailChip[];
}

const PAGE_SIZE = 10;
const QUERY_LIMIT = 500;
const GRACE_DEFAULT_MIN = 5;

const EMPTY_STATE: DetailState = { rows: [], columns: [], summaryChips: [] };
const EMPTY_SCOPE: Scope = { ready: false, employees: [], inScope: new Set(), empById: new Map() };

/** First/last instant of a yyyy-MM month, formatted for backend date filters. */
export function monthRange(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start: `${month}-01T00:00:00`,
    end: `${month}-${String(lastDay).padStart(2, '0')}T23:59:59`,
  };
}

function isWeekendish(v: string): boolean {
  return v === 'WEEKLY_OFF';
}

interface PunchException {
  text: string;
  tone: Tone;
  isException: boolean;
}

/**
 * Classify a single attendance record into a punch exception label.
 * Used by the shift roster and the grace/regularization exception views.
 */
function classifyPunch(a: any, isPastDate: boolean): PunchException {
  if (!a) {
    return isPastDate
      ? { text: 'No punch record', tone: 'red', isException: true }
      : { text: 'Not punched yet', tone: 'slate', isException: false };
  }
  if (isWeekendish(a.status)) return { text: 'Weekly Off', tone: 'slate', isException: false };
  if (a.status === 'ABSENT') return { text: 'Absent', tone: 'red', isException: true };
  if (!a.actualLogin) return { text: 'Missing IN punch', tone: 'red', isException: true };
  if (!a.actualLogout && isPastDate) return { text: 'Missing OUT punch', tone: 'red', isException: true };

  const shift: any = a.shift || {};
  const assignedShiftId = a.employee?.shiftId;
  if (assignedShiftId && shift.id && assignedShiftId !== shift.id) {
    return { text: 'Shift mismatch', tone: 'amber', isException: true };
  }

  const lateSec = Number(a.lateLoginSeconds || 0);
  const graceSec = Number(shift.gracePeriod ?? GRACE_DEFAULT_MIN) * 60;
  if (lateSec > 0) {
    return lateSec <= graceSec
      ? { text: `Within grace (${Math.round(lateSec / 60)}m)`, tone: 'blue', isException: true }
      : { text: `Late by ${Math.round(lateSec / 60)}m`, tone: 'amber', isException: true };
  }

  const earlySec = Number(a.earlyLogoutSeconds || 0);
  if (earlySec > 0) {
    return { text: `Early exit ${Math.round(earlySec / 60)}m`, tone: 'amber', isException: true };
  }

  if (a.status === 'LATE') return { text: 'Late arrival', tone: 'amber', isException: true };
  if (a.status === 'EARLY') return { text: 'Early login', tone: 'green', isException: false };
  return { text: 'On time', tone: 'green', isException: false };
}

/** Regularization request exception labels (client-side correction records). */
const CORRECTION_EXC: Record<string, { text: string; tone: Tone }> = {
  MISSED_OUT: { text: 'Missed OUT punch', tone: 'red' },
  LATE_GRACE: { text: 'Late arrival (grace)', tone: 'amber' },
  ON_DUTY: { text: 'On-duty transfer', tone: 'blue' },
  SENSOR_GLITCH: { text: 'Sensor glitch', tone: 'slate' },
};

const CORRECTION_STATUS_TONE: Record<string, Tone> = {
  PENDING: 'amber',
  SUPERVISOR_OK: 'blue',
  APPROVED: 'green',
  REJECTED: 'red',
};

function RegStatusCell({ status }: { status?: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  return <Pill tone={CORRECTION_STATUS_TONE[status] || 'slate'}>{prettyEnum(status)}</Pill>;
}

const EMP_STATUS_CELL = (r: any) => <Pill tone={EMP_STATUS_TONE[r.status] || 'slate'}>{prettyEnum(r.status)}</Pill>;

/* ------------------------------------------------------------------ */
/* Column layouts                                                      */
/* ------------------------------------------------------------------ */

function shiftConfigCols(): DrillColumn[] {
  return [
    {
      key: 'code',
      header: 'Shift Code',
      render: (r) => (
        <span className="font-mono text-[11px] font-bold text-[#0058be] bg-[#eff4ff] border border-[#dce9ff] px-2 py-0.5 rounded whitespace-nowrap">
          {r.code || '—'}
        </span>
      ),
    },
    { key: 'name', header: 'Shift Name', render: (r) => <span className="font-bold text-[#0b1c30]">{r.name}</span> },
    { key: 'hub', header: 'Hub / Branch', render: (r) => <span className="text-slate-600">{r.hub}</span> },
    { key: 'window', header: 'Working Window', render: (r) => <span className="font-mono text-slate-700 whitespace-nowrap">{r.window}</span> },
    { key: 'grace', header: 'Grace Period', render: (r) => <span className="text-slate-600">{r.grace}</span> },
    { key: 'late', header: 'Late Cutoff', render: (r) => <span className="font-semibold text-red-600">{r.late}</span> },
    { key: 'staff', header: 'Staff Rostered', render: (r) => <span className="font-bold text-[#0b1c30]">{r.staff}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Pill tone={r.status === 'ACTIVE' ? 'green' : 'slate'}>{prettyEnum(r.status) || '—'}</Pill>,
    },
  ];
}

function shiftRosterCols(): DrillColumn[] {
  return [
    { key: 'code', header: 'Employee ID', render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} profileId={r.employeeId} /> },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-slate-600">{r.department}</span> },
    { key: 'hub', header: 'Hub / Branch', render: (r) => <span className="text-slate-600">{r.hub}</span> },
    { key: 'desig', header: 'Designation', render: (r) => <span className="text-slate-600">{r.designation}</span> },
    { key: 'status', header: 'Status', render: EMP_STATUS_CELL },
    {
      key: 'shift',
      header: 'Scheduled Shift',
      render: (r) => (
        <div className="min-w-[130px]">
          <div className="text-slate-700 font-semibold">{r.shift}</div>
          <div className="text-[10px] font-mono text-slate-400">In: {r.scheduled}</div>
        </div>
      ),
    },
    { key: 'in', header: 'Actual Punch-in', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{r.actualIn}</span> },
    { key: 'out', header: 'Actual Punch-out', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{r.actualOut}</span> },
    { key: 'exc', header: 'Punch Exception', render: (r) => <Pill tone={r.excTone}>{r.exception}</Pill> },
    { key: 'reg', header: 'Regularization', render: (r) => <RegStatusCell status={r.reg} /> },
  ];
}

function shiftExceptionCols(): DrillColumn[] {
  return [
    { key: 'code', header: 'Employee ID', render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} profileId={r.employeeId} /> },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-slate-600">{r.department}</span> },
    { key: 'hub', header: 'Hub / Branch', render: (r) => <span className="text-slate-600">{r.hub}</span> },
    {
      key: 'shift',
      header: 'Scheduled Shift',
      render: (r) => (
        <div className="min-w-[130px]">
          <div className="text-slate-700 font-semibold">{r.shift}</div>
          <div className="text-[10px] font-mono text-slate-400">In: {r.scheduled}</div>
        </div>
      ),
    },
    { key: 'in', header: 'Actual Punch-in', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{r.actualIn}</span> },
    { key: 'out', header: 'Actual Punch-out', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{r.actualOut}</span> },
    { key: 'exc', header: 'Exception', render: (r) => <Pill tone={r.excTone}>{r.exception}</Pill> },
    { key: 'reg', header: 'Regularization Status', render: (r) => <RegStatusCell status={r.reg} /> },
    {
      key: 'reason',
      header: 'Reason for Regularization',
      render: (r) => <span className="text-slate-500 block max-w-[220px] truncate" title={r.reason}>{r.reason || '—'}</span>,
    },
    { key: 'approval', header: 'Approval / Pending With', render: (r) => <span className="text-slate-600 whitespace-nowrap">{r.approval}</span> },
    {
      key: 'remarks',
      header: 'Manager Remarks',
      render: (r) => <span className="text-slate-500 block max-w-[220px] truncate" title={r.remarks}>{r.remarks || '—'}</span>,
    },
  ];
}

function musterCols(): DrillColumn[] {
  return [
    { key: 'code', header: 'Employee ID', render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} profileId={r.employeeId} /> },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-slate-600">{r.department}</span> },
    { key: 'hub', header: 'Hub / Branch', render: (r) => <span className="text-slate-600">{r.hub}</span> },
    { key: 'desig', header: 'Designation', render: (r) => <span className="text-slate-600">{r.designation}</span> },
    { key: 'status', header: 'Status', render: EMP_STATUS_CELL },
    { key: 'total', header: 'Total Days', render: (r) => <span className="font-semibold text-[#0b1c30]">{r.totalDays}</span> },
    { key: 'present', header: 'Present Days', render: (r) => <span className="font-semibold text-emerald-700">{r.present}</span> },
    { key: 'absent', header: 'Absent Days', render: (r) => <span className="font-semibold text-red-600">{r.absent}</span> },
    { key: 'leave', header: 'Off / Leave Days', render: (r) => <span className="text-slate-600">{r.leave}</span> },
    { key: 'late', header: 'Late Count', render: (r) => <span className="font-semibold text-amber-600">{r.late}</span> },
    { key: 'ot', header: 'Overtime Days', render: (r) => <span className="text-slate-600">{r.overtime}</span> },
    { key: 'incentive', header: 'Incentive Amount', render: (r) => <span className="font-mono font-bold text-emerald-600 whitespace-nowrap">₹{r.incentive.toLocaleString('en-IN')}</span> },
    {
      key: 'att',
      header: 'Attendance %',
      render: (r) => (
        <div className="min-w-[70px]">
          <div className={`text-[11px] font-bold mb-1 ${r.attendance >= 90 ? 'text-emerald-600' : r.attendance >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
            {r.attendance}%
          </div>
          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full ${r.attendance >= 90 ? 'bg-emerald-500' : r.attendance >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
              style={{ width: `${r.attendance}%` }}
            />
          </div>
        </div>
      ),
    },
  ];
}

function faceCols(): DrillColumn[] {
  return [
    { key: 'code', header: 'Employee ID', render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} profileId={r.employeeId} /> },
    { key: 'hub', header: 'Hub / Branch', render: (r) => <span className="text-slate-600">{r.hub}</span> },
    { key: 'device', header: 'Terminal / Device', render: (r) => <span className="font-mono text-xs text-slate-600">{r.device}</span> },
    { key: 'match', header: 'Match Score', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{r.match}</span> },
    { key: 'result', header: 'Result', render: (r) => <Pill tone={r.result === 'Verified' ? 'green' : 'red'}>{r.result}</Pill> },
    { key: 'time', header: 'Verified At', render: (r) => <span className="text-slate-600 whitespace-nowrap">{fmtDate(r.time)} • {fmtTime(r.time)}</span> },
  ];
}

function qrCols(): DrillColumn[] {
  return [
    { key: 'code', header: 'Employee ID', render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} profileId={r.employeeId} /> },
    { key: 'purpose', header: 'Purpose', render: (r) => <span className="text-slate-600">{r.purpose}</span> },
    { key: 'device', header: 'Scanner / Point', render: (r) => <span className="text-slate-600">{r.device}</span> },
    { key: 'result', header: 'Result', render: (r) => <Pill tone={r.ok ? 'green' : 'red'}>{r.result}</Pill> },
    { key: 'time', header: 'Scanned At', render: (r) => <span className="text-slate-600 whitespace-nowrap">{fmtDate(r.time)} • {fmtTime(r.time)}</span> },
  ];
}

function incentiveCols(): DrillColumn[] {
  return [
    { key: 'code', header: 'Employee ID', render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} profileId={r.employeeId} /> },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-slate-600">{r.department}</span> },
    { key: 'rule', header: 'Incentive Rule', render: (r) => <span className="text-slate-600">{r.rule}</span> },
    {
      key: 'type',
      header: 'Incentive Type',
      render: (r) => (
        <span className="inline-flex items-center gap-1 text-[11px] text-[#0058be] font-semibold bg-[#eff4ff] px-2 py-0.5 rounded border border-[#dce9ff] whitespace-nowrap">
          <span className="material-symbols-outlined text-[13px]">price_change</span>
          {r.type}
        </span>
      ),
    },
    { key: 'amount', header: 'Amount', render: (r) => <span className="font-mono font-bold text-emerald-600">₹{r.amount}</span> },
    { key: 'basis', header: 'Calculation Basis', render: (r) => <span className="text-slate-600">{r.basis}</span> },
    { key: 'date', header: 'Date', render: (r) => <span className="text-slate-500 whitespace-nowrap">{fmtDate(r.date)}</span> },
    { key: 'status', header: 'Approval / Payment', render: (r) => <Pill tone={INC_STATUS_TONE[r.status] || 'slate'}>{prettyEnum(r.status)}</Pill> },
  ];
}

function complianceCols(): DrillColumn[] {
  return [
    { key: 'dept', header: 'Department', render: (r) => <span className="font-bold text-[#0b1c30]">{r.department}</span> },
    { key: 'employees', header: 'Employees', render: (r) => <span className="font-semibold text-[#0b1c30]">{r.employees}</span> },
    { key: 'total', header: 'Total Days', render: (r) => <span className="text-slate-600">{r.totalDays}</span> },
    { key: 'present', header: 'Present', render: (r) => <span className="font-semibold text-emerald-700">{r.present}</span> },
    { key: 'absent', header: 'Absent', render: (r) => <span className="font-semibold text-red-600">{r.absent}</span> },
    { key: 'late', header: 'Late', render: (r) => <span className="font-semibold text-amber-600">{r.late}</span> },
    { key: 'ot', header: 'Overtime Days', render: (r) => <span className="text-slate-600">{r.overtime}</span> },
    { key: 'incentive', header: 'Incentive Amount', render: (r) => <span className="font-mono font-bold text-emerald-600 whitespace-nowrap">₹{r.incentive.toLocaleString('en-IN')}</span> },
    { key: 'att', header: 'Attendance %', render: (r) => <span className={`font-bold ${r.attendance >= 90 ? 'text-emerald-600' : r.attendance >= 60 ? 'text-amber-600' : 'text-red-600'}`}>{r.attendance}%</span> },
  ];
}

/* ------------------------------------------------------------------ */
/* Modal                                                               */
/* ------------------------------------------------------------------ */

export function DetailDrillDownModal({
  metric,
  title,
  filters,
  chips,
  preloaded,
  onClose,
}: {
  metric: DetailMetric;
  title: string;
  filters: DetailFilters;
  chips: DetailChip[];
  preloaded?: { shifts?: any[]; locations?: any[] };
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<DetailState>(EMPTY_STATE);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const reqIdRef = useRef(0);

  const { locationId, departmentId, shiftId, status } = filters;
  const date = filters.date || new Date().toISOString().slice(0, 10);
  const month = filters.month || new Date().toISOString().slice(0, 7);
  const hubScoped = Boolean(locationId && locationId !== 'all');
  const isPastDate = date < new Date().toISOString().slice(0, 10);

  /** Resolve the location code (BEL/DAV/SHI…) used by client-side records. */
  const getLocationCode = useCallback(async (): Promise<string> => {
    if (!hubScoped) return '';
    const pre = preloaded?.locations?.find((l) => l.id === locationId);
    if (pre) return pre.code || '';
    try {
      const res = await api.get('/locations/all');
      const found = (res.data || []).find((l: any) => l.id === locationId);
      return found?.code || '';
    } catch {
      return '';
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubScoped, locationId]);

  const load = useCallback(async () => {
    const rid = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setState(EMPTY_STATE);
    setPage(1);
    setQuery('');
    try {
      let rows: any[] = [];
      let cols: DrillColumn[] = [];
      let summaryChips: DetailChip[] = [];
      let scope: Scope = EMPTY_SCOPE;

      // Roster scope — doubles as enrichment map and dept/shift/status filter.
      if (metric !== 'shift-configs') {
        scope = await fetchScope(filters);
      }
      const codeToEmp = new Map<string, any>();
      for (const e of scope.employees) codeToEmp.set(e.employeeCode, e);
      const corrByCode = new Map(CORRECTION_RECORDS.map((c) => [c.empCode, c]));

      if (metric === 'shift-configs') {
        let list: any[] = preloaded?.shifts && preloaded.shifts.length > 0 ? preloaded.shifts : [];
        if (list.length === 0) {
          const p = new URLSearchParams();
          if (hubScoped) p.set('locationId', String(locationId));
          const res = await api.get(`/shifts?${p.toString()}`);
          list = res.data?.shifts || [];
        }
        const locMap = new Map<string, string>();
        if (preloaded?.locations?.length) {
          for (const l of preloaded.locations) locMap.set(l.id, l.name);
        } else {
          try {
            const res = await api.get('/locations/all');
            for (const l of res.data || []) locMap.set(l.id, l.name);
          } catch {
            /* hub names fall back to — */
          }
        }
        rows = list.map((s: any) => ({
          id: s.id,
          code: s.code,
          name: s.name,
          hub: locMap.get(s.locationId) || '—',
          window: `${s.startTime ? new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} – ${
            s.endTime ? new Date(s.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'
          }`,
          grace: s.gracePeriod != null ? `${s.gracePeriod} Mins` : '—',
          late: s.lateThreshold != null ? `${s.lateThreshold} Mins` : '—',
          staff: s._count?.employees ?? 0,
          status: s.status,
        }));
        cols = shiftConfigCols();
      } else if (metric === 'shift-roster') {
        const p = new URLSearchParams();
        p.set('limit', String(ROSTER_LIMIT));
        p.set('startDate', `${date}T00:00:00`);
        p.set('endDate', `${date}T23:59:59`);
        if (hubScoped) p.set('locationId', String(locationId));
        if (shiftId && shiftId !== 'all') p.set('shiftId', String(shiftId));
        const attRes = await api.get(`/attendance?${p.toString()}`).catch(() => ({ data: null }));
        const attMap = new Map<string, any>();
        for (const a of attRes.data?.attendances || []) {
          if (scope.ready && !scope.inScope.has(a.employeeId)) continue;
          attMap.set(a.employeeId, a);
        }
        rows = scope.employees.map((e: any) => {
          const emp = empOf(scope, e.id, e);
          const a = attMap.get(e.id);
          const exc = classifyPunch(a, isPastDate);
          const corr = corrByCode.get(e.employeeCode);
          return {
            id: e.id,
            employeeId: e.id,
            code: emp.code,
            name: emp.name,
            department: emp.department,
            hub: emp.hub,
            designation: e.designation || '—',
            status: e.status,
            shift: a?.shift?.name || emp.shift,
            scheduled: a ? fmtTime(a.scheduledLogin) : '—',
            actualIn: a ? fmtTime(a.actualLogin) : '—',
            actualOut: a ? fmtTime(a.actualLogout) : '—',
            exception: exc.text,
            excTone: exc.tone,
            reg: corr?.status || null,
          };
        });
        cols = shiftRosterCols();
      } else if (metric === 'shift-exceptions') {
        const locCode = await getLocationCode();
        const p = new URLSearchParams();
        p.set('limit', String(ROSTER_LIMIT));
        p.set('startDate', `${date}T00:00:00`);
        p.set('endDate', `${date}T23:59:59`);
        if (hubScoped) p.set('locationId', String(locationId));
        if (shiftId && shiftId !== 'all') p.set('shiftId', String(shiftId));
        const attRes = await api.get(`/attendance?${p.toString()}`).catch(() => ({ data: null }));
        const attList: any[] = (attRes.data?.attendances || []).filter(
          (a: any) => !scope.ready || scope.inScope.has(a.employeeId)
        );
        const attByEmp = new Map<string, any>();
        for (const a of attList) attByEmp.set(a.employeeId, a);

        // 1) Punch exceptions recorded against the selected date.
        const seenCodes = new Set<string>();
        for (const a of attList) {
          const emp = empOf(scope, a.employeeId, a.employee);
          const exc = classifyPunch(a, isPastDate);
          if (!exc.isException) continue;
          const corr = corrByCode.get(emp.code);
          if (corr) seenCodes.add(emp.code);
          rows.push({
            id: `att-${a.id}`,
            employeeId: a.employeeId,
            code: emp.code,
            name: emp.name,
            department: emp.department,
            hub: emp.hub,
            shift: a.shift?.name || emp.shift,
            scheduled: a.scheduledLogin ? fmtTime(a.scheduledLogin) : '—',
            actualIn: a.actualLogin ? fmtTime(a.actualLogin) : '—',
            actualOut: a.actualLogout ? fmtTime(a.actualLogout) : '—',
            exception: exc.text,
            excTone: exc.tone,
            reg: corr?.status || null,
            reason: corr?.reason || '—',
            approval: corr ? `${corr.supervisor} • Step ${corr.pipelineStep}/${corr.pipelineTotal}` : '—',
            remarks: corr?.notes || a.notes || '—',
          });
        }

        // 2) Employees in scope with no attendance record at all on a past date.
        if (attList.length > 0 && isPastDate) {
          for (const e of scope.employees) {
            if (attByEmp.has(e.id)) continue;
            const emp = empOf(scope, e.id, e);
            const corr = corrByCode.get(e.employeeCode);
            if (corr) seenCodes.add(e.employeeCode);
            rows.push({
              id: `miss-${e.id}`,
              employeeId: e.id,
              code: emp.code,
              name: emp.name,
              department: emp.department,
              hub: emp.hub,
              shift: emp.shift,
              scheduled: '—',
              actualIn: '—',
              actualOut: '—',
              exception: 'No punch record',
              excTone: 'red' as Tone,
              reg: corr?.status || null,
              reason: corr?.reason || '—',
              approval: corr ? `${corr.supervisor} • Step ${corr.pipelineStep}/${corr.pipelineTotal}` : '—',
              remarks: corr?.notes || '—',
            });
          }
        }

        // 3) Regularization requests (client-side correction queue), hub scoped.
        for (const c of CORRECTION_RECORDS) {
          if (seenCodes.has(c.empCode)) continue;
          if (hubScoped && locCode && !c.hub.toUpperCase().startsWith(locCode.toUpperCase())) continue;
          const exc = CORRECTION_EXC[c.type] || { text: prettyEnum(c.type), tone: 'slate' as Tone };
          const scoped = codeToEmp.get(c.empCode);
          rows.push({
            id: `corr-${c.id}`,
            employeeId: scoped?.id || null,
            code: c.empCode,
            name: c.name,
            department: c.dept,
            hub: c.hub,
            shift: c.shift,
            scheduled: '—',
            actualIn: c.rawIn,
            actualOut: c.rawOut,
            exception: exc.text,
            excTone: exc.tone,
            reg: c.status,
            reason: c.reason,
            approval: `${c.supervisor} • Step ${c.pipelineStep}/${c.pipelineTotal}`,
            remarks: c.notes,
          });
        }
        cols = shiftExceptionCols();
      } else if (metric === 'muster' || metric === 'compliance') {
        const { start, end } = monthRange(month);
        const p = new URLSearchParams();
        p.set('startDate', start);
        p.set('endDate', end);
        if (hubScoped) p.set('locationId', String(locationId));
        if (departmentId && departmentId !== 'all') p.set('departmentId', String(departmentId));
        if (shiftId && shiftId !== 'all') p.set('shiftId', String(shiftId));
        const res = await api.get(`/reports/attendance-summary?${p.toString()}`).catch(() => ({ data: null }));
        const list: any[] = (res.data?.summary || res.data?.data || []).filter(
          (r: any) => !scope.ready || codeToEmp.has(r.employeeCode)
        );

        const enriched = list.map((r: any) => {
          const emp = codeToEmp.get(r.employeeCode);
          const totalDays = Number(r.totalDays || 0);
          const absent = Number(r.absent || 0);
          const present = Number(r.present || 0);
          const late = Number(r.late || 0);
          const overtime = Number(r.overtime || 0);
          const early = Number(r.early || 0);
          const attended = present + late + early + overtime;
          const leave = Math.max(0, totalDays - attended - absent);
          const attendance = totalDays > 0 ? Math.round(((totalDays - absent) / totalDays) * 1000) / 10 : 0;
          return {
            employeeId: emp?.id || null,
            code: r.employeeCode,
            name: r.employeeName || empOf(scope, emp?.id, emp).name,
            department: r.department || empOf(scope, emp?.id, emp).department,
            hub: empOf(scope, emp?.id, emp).hub,
            designation: emp?.designation || '—',
            status: emp?.status || '—',
            totalDays,
            present,
            absent,
            leave,
            late,
            overtime,
            incentive: Number(r.totalEarlyIncentive || 0),
            attendance,
          };
        });

        if (metric === 'muster') {
          rows = enriched;
          cols = musterCols();
        } else {
          // Department-wise compliance breakdown + regularization + payroll rollup.
          const byDept = new Map<string, any>();
          for (const r of enriched) {
            const key = r.department || 'Unassigned';
            if (!byDept.has(key)) {
              byDept.set(key, {
                id: key,
                department: key,
                employees: 0,
                totalDays: 0,
                present: 0,
                absent: 0,
                late: 0,
                overtime: 0,
                incentive: 0,
                _attNum: 0,
                _attDen: 0,
              });
            }
            const d = byDept.get(key);
            d.employees += 1;
            d.totalDays += r.totalDays;
            d.present += r.present;
            d.absent += r.absent;
            d.late += r.late;
            d.overtime += r.overtime;
            d.incentive += r.incentive;
            if (r.totalDays > 0) {
              d._attNum += r.totalDays - r.absent;
              d._attDen += r.totalDays;
            }
          }
          rows = [...byDept.values()].map((d) => ({
            ...d,
            attendance: d._attDen > 0 ? Math.round((d._attNum / d._attDen) * 1000) / 10 : 0,
          }));
          cols = complianceCols();

          // Regularization queue + latest payroll run as rollup chips.
          const locCode = await getLocationCode();
          const scopedCorrections = CORRECTION_RECORDS.filter(
            (c) => !hubScoped || !locCode || c.hub.toUpperCase().startsWith(locCode.toUpperCase())
          );
          const count = (s: string) => scopedCorrections.filter((c) => c.status === s).length;
          let payroll = 'No runs';
          try {
            const runRes = await api.get('/payroll/runs?limit=1');
            const run = runRes.data?.runs?.[0];
            if (run) {
              const period = run.periodStart
                ? new Date(run.periodStart).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                : run.monthYear || '';
              payroll = `${prettyEnum(run.status)}${period ? ` • ${period}` : ''}`;
            } else {
              payroll = 'No runs';
            }
          } catch {
            payroll = 'Unavailable';
          }
          summaryChips = [
            { label: 'Punch Corrections', value: String(scopedCorrections.length) },
            { label: 'Pending Regularizations', value: String(count('PENDING')) },
            { label: 'Supervisor Reviewed', value: String(count('SUPERVISOR_OK')) },
            { label: 'Approved', value: String(count('APPROVED')) },
            { label: 'Rejected', value: String(count('REJECTED')) },
            { label: 'Latest Payroll Run', value: payroll },
          ];
        }
      } else if (metric === 'face') {
        const { start, end } = monthRange(month);
        const p = new URLSearchParams();
        p.set('limit', String(QUERY_LIMIT));
        p.set('startDate', start);
        p.set('endDate', end);
        if (hubScoped) p.set('locationId', String(locationId));
        const res = await api.get(`/face-verification?${p.toString()}`).catch(() => ({ data: null }));
        const list: any[] = res.data?.verifications || res.data?.rows || [];
        rows = list
          .filter((v) => !scope.ready || scope.inScope.has(v.employeeId))
          .map((v) => {
            const emp = empOf(scope, v.employeeId, v);
            const ok = String(v.result).toLowerCase() === 'passed';
            return {
              id: v.id,
              employeeId: v.employeeId,
              code: v.employeeCode || emp.code,
              name: v.employeeName || emp.name,
              hub: v.locationName || emp.hub,
              device: v.deviceId || 'Face Recognition Terminal',
              match: `${Number(v.score ?? v.matchPercentage ?? 0).toFixed(1)}%`,
              result: ok ? 'Verified' : 'Failed',
              time: v.attemptedAt || v.verifiedAt,
            };
          })
          .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
        cols = faceCols();
      } else if (metric === 'qr') {
        const { start, end } = monthRange(month);
        const p = new URLSearchParams();
        p.set('limit', String(QUERY_LIMIT));
        p.set('startDate', start);
        p.set('endDate', end);
        if (hubScoped) p.set('locationId', String(locationId));
        const res = await api.get(`/qr-codes/scans?${p.toString()}`).catch(() => ({ data: null }));
        const list: any[] = res.data?.scans || [];
        rows = list
          .filter((s) => !scope.ready || scope.inScope.has(s.employeeId))
          .map((s) => {
            const emp = empOf(scope, s.employeeId, s.employee);
            return {
              id: s.id,
              employeeId: s.employeeId,
              code: s.employee?.employeeCode || emp.code,
              name: s.employee?.fullName || emp.name,
              purpose: prettyEnum(s.purpose) || 'Scan',
              device: s.sellingPoint?.name || (s.deviceInfo ? String(s.deviceInfo).slice(0, 28) : 'QR Scanner'),
              result: String(s.result).toUpperCase() === 'SUCCESS' ? 'Success' : prettyEnum(s.result),
              ok: String(s.result).toUpperCase() === 'SUCCESS',
              time: s.scannedAt || s.createdAt,
            };
          })
          .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
        cols = qrCols();
      } else if (metric === 'incentives') {
        const { start, end } = monthRange(month);
        const p = new URLSearchParams();
        p.set('limit', String(QUERY_LIMIT));
        p.set('startDate', start);
        p.set('endDate', end);
        const res = await api.get(`/incentives/transactions?${p.toString()}`).catch(() => ({ data: null }));
        const list: any[] = res.data?.transactions || [];
        rows = list
          .filter((t) => !scope.ready || scope.inScope.has(t.employeeId))
          .map((t) => {
            const emp = empOf(scope, t.employeeId, t.employee);
            return {
              id: t.id,
              employeeId: t.employeeId,
              code: emp.code,
              name: emp.name,
              department: emp.department,
              rule: t.incentiveRule?.name || 'Daily Performance',
              type: t.incentiveRule?.incentiveType ? prettyEnum(t.incentiveRule.incentiveType) : 'Incentive',
              amount: Number(t.calculatedAmount || 0).toLocaleString('en-IN'),
              basis: prettyEnum(t.calculationBasis),
              date: t.transactionDate,
              status: t.status,
            };
          });
        cols = incentiveCols();
      }

      if (rid !== reqIdRef.current) return;
      setState({ rows, columns: cols, summaryChips });
      setLoading(false);
    } catch (err) {
      if (rid !== reqIdRef.current) return;
      console.error(`Detail drill-down load failed (${metric}):`, err);
      setError('Failed to load detailed records. Please try again.');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, locationId, departmentId, shiftId, status, date, month]);

  useEffect(() => {
    load();
  }, [load]);

  const { rows, columns, summaryChips } = state;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((r) =>
        Object.entries(r)
          .filter(([k]) => !k.endsWith('Tone'))
          .some(([, v]) => String(v ?? '').toLowerCase().includes(q))
      )
    : rows;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);

  const openProfile = (row: any) => {
    if (!row?.employeeId) return;
    onClose();
    router.push(`/employees/profile/${row.employeeId}`);
  };

  const handleExportCSV = () => {
    if (filtered.length === 0) {
      toast.error('No records to export');
      return;
    }
    const keys = Object.keys(filtered[0]).filter(
      (k) => k !== 'id' && k !== 'employeeId' && !k.endsWith('Tone') && !k.startsWith('_')
    );
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [keys.join(','), ...filtered.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `BSC_Textiles_${metric}_details.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Detail records exported to CSV!');
  };

  const statusText = loading
    ? 'Loading detailed records…'
    : error
      ? 'Error loading records'
      : q
        ? `${filtered.length} of ${rows.length} record${rows.length === 1 ? '' : 's'} match your search`
        : `${rows.length} record${rows.length === 1 ? '' : 's'} found`;

  return (
    <Modal open onClose={onClose} title={title} className="max-w-6xl w-full">
      <div className="flex flex-col gap-4">
        {/* Selected filters summary */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Filters:</span>
          {chips.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#0b1c30] bg-[#eff4ff] border border-[#dce9ff] px-2.5 py-1 rounded-lg"
            >
              <span className="text-[10px] uppercase text-slate-400 font-bold">{c.label}:</span>
              {c.value}
            </span>
          ))}
        </div>

        {/* Compliance rollup chips (compliance metric only) */}
        {summaryChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {summaryChips.map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-lg"
              >
                <span className="text-[10px] uppercase text-slate-400 font-bold">{c.label}:</span>
                <span className="text-[#0b1c30]">{c.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* Toolbar: record count + search + export + refresh */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500" aria-live="polite">
            {statusText}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[15px] text-slate-400 pointer-events-none">
                search
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search records…"
                aria-label="Search detailed records"
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg w-44 focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 focus:border-[#0058be]"
              />
            </div>
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={loading || filtered.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 rounded-lg transition-colors border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[15px]">file_download</span>
              CSV
            </button>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#0058be] bg-[#eff4ff] hover:bg-[#dce9ff] rounded-lg transition-colors border border-[#dce9ff] disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[15px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Body */}
        {error ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <span className="material-symbols-outlined text-red-400 text-[36px] mb-2">error</span>
            <p className="text-sm font-semibold text-slate-600 mb-1">{error}</p>
            <button
              type="button"
              onClick={load}
              className="mt-2 px-4 py-2 text-xs font-semibold text-white bg-[#0058be] hover:bg-[#004a9e] rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col gap-2 py-2" aria-hidden="true">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <span className="material-symbols-outlined text-slate-300 text-[40px] mb-2">inbox</span>
            <p className="text-sm font-semibold text-slate-500">No records available</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the selected Hub, Department, Shift, Status or Date/Month filters.</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <span className="material-symbols-outlined text-slate-300 text-[40px] mb-2">search_off</span>
            <p className="text-sm font-semibold text-slate-500">No records match “{query}”</p>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-2 px-4 py-2 text-xs font-semibold text-[#0058be] bg-[#eff4ff] hover:bg-[#dce9ff] rounded-lg transition-colors border border-[#dce9ff]"
            >
              Clear search
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto border border-slate-200/80 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#eff4ff]/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 tracking-wider">
                  <tr>
                    {columns.map((col) => (
                      <th key={col.key} className="py-2.5 px-3 whitespace-nowrap">
                        {col.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {pageRows.map((row, idx) => {
                    const clickable = Boolean(row.employeeId);
                    return (
                      <tr
                        key={row.id ?? idx}
                        tabIndex={clickable ? 0 : undefined}
                        role={clickable ? 'button' : undefined}
                        aria-label={clickable ? `Open employee profile for ${row.name || row.code}` : undefined}
                        onClick={() => openProfile(row)}
                        onKeyDown={(e) => {
                          if (!clickable) return;
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openProfile(row);
                          }
                        }}
                        className={`transition-colors align-middle focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#0058be] ${
                          clickable
                            ? 'cursor-pointer hover:bg-[#eff4ff]/50 group'
                            : 'hover:bg-slate-50/70'
                        }`}
                      >
                        {columns.map((col) => (
                          <td key={col.key} className="py-2.5 px-3">
                            {col.render(row)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-slate-500">
                Showing {rangeStart}–{rangeEnd} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={safePage <= 1}
                  aria-label="Previous page"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Prev
                </button>
                <span className="text-[11px] font-semibold text-slate-600">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage >= totalPages}
                  aria-label="Next page"
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}

        {/* Footer close */}
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
