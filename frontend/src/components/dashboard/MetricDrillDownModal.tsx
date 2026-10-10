'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { fetchScope, empOf, ROSTER_LIMIT, type DrillFilters } from '@/lib/dashboardScope';
import {
  Pill,
  EmpCell,
  fmtTime,
  fmtDate,
  prettyEnum,
  EMP_STATUS_TONE,
  ATT_STATUS_TONE,
  INC_STATUS_TONE,
  BREAK_TYPE_TONE,
  ON_FLOOR,
  type DrillColumn,
  type Tone,
} from '@/components/dashboard/drillParts';

export type MetricKey = 'workforce' | 'adherence' | 'punches' | 'breaks' | 'incentives';

interface DrillContext {
  hub?: string;
  dept?: string;
  shift?: string;
  date?: string;
}

const PAGE_SIZE = 10;
const METRIC_LIMIT = 500;

function punchTypeFromPurpose(purpose?: string | null): string {
  if (!purpose) return 'In';
  const p = String(purpose).toUpperCase();
  if (p.includes('END') || p.includes('OUT') || p.includes('LOGOUT')) return 'Out';
  return 'In';
}

function employeeCols(): DrillColumn[] {
  return [
    { key: 'code', header: 'Employee ID', render: (r) => <span className="font-mono text-[11px] text-slate-500">{r.code}</span> },
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} /> },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-slate-600">{r.department}</span> },
    { key: 'hub', header: 'Hub / Branch', render: (r) => <span className="text-slate-600">{r.hub}</span> },
    { key: 'desig', header: 'Designation', render: (r) => <span className="text-slate-600">{r.designation}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <div className="flex items-center gap-1 flex-wrap">
          <Pill tone={EMP_STATUS_TONE[r.rawStatus] || 'slate'}>{prettyEnum(r.rawStatus)}</Pill>
          {r.onFloor && <Pill tone="blue">On Floor</Pill>}
        </div>
      ),
    },
    { key: 'shift', header: 'Shift', render: (r) => <span className="text-slate-600">{r.shift}</span> },
    {
      key: 'attendance',
      header: 'Attendance',
      render: (r) =>
        r.attendance ? (
          <Pill tone={ATT_STATUS_TONE[r.attendance] || 'slate'}>{prettyEnum(r.attendance)}</Pill>
        ) : (
          <span className="text-[11px] text-slate-400">No record</span>
        ),
    },
  ];
}

function adherenceCols(): DrillColumn[] {
  return [
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} /> },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-slate-600">{r.department}</span> },
    { key: 'expected', header: 'Expected Shift', render: (r) => <span className="font-mono text-slate-500">{r.expected}</span> },
    { key: 'actual', header: 'Actual Check-in', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{r.actual}</span> },
    { key: 'present', header: 'Present / Late', render: (r) => <Pill tone={r.presentTone}>{r.present}</Pill> },
    { key: 'off', header: 'Leave / Off', render: (r) => (r.off === '—' ? <span className="text-slate-400">—</span> : <Pill tone={r.offTone}>{r.off}</Pill>) },
    {
      key: 'adherence',
      header: 'Adherence',
      render: (r) =>
        r.adherence === null ? (
          <span className="text-slate-400">N/A</span>
        ) : (
          <div className="min-w-[70px]">
            <div className={`text-[11px] font-bold mb-1 ${r.adherence >= 90 ? 'text-emerald-600' : r.adherence >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
              {r.adherence}%
            </div>
            <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-1.5 rounded-full ${r.adherence >= 90 ? 'bg-emerald-500' : r.adherence >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${r.adherence}%` }}
              />
            </div>
          </div>
        ),
    },
    { key: 'remark', header: 'Remarks', render: (r) => <span className="text-slate-500">{r.remark}</span> },
  ];
}

function punchCols(): DrillColumn[] {
  return [
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} /> },
    { key: 'time', header: 'Punch Time', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{fmtTime(r.time)}</span> },
    { key: 'type', header: 'Type', render: (r) => <Pill tone={r.type === 'Out' ? 'amber' : 'green'}>{r.type}</Pill> },
    {
      key: 'method',
      header: 'Verification',
      render: (r) => (
        <span className="inline-flex items-center gap-1 text-[11px] text-[#0058be] font-medium bg-[#eff4ff] px-2 py-0.5 rounded border border-[#dce9ff] whitespace-nowrap">
          <span className="material-symbols-outlined text-[13px]">{r.methodIcon}</span>
          {r.method}
        </span>
      ),
    },
    { key: 'device', header: 'Terminal / Device', render: (r) => <span className="text-slate-600">{r.device}</span> },
    { key: 'result', header: 'Result', render: (r) => <Pill tone={r.ok ? 'green' : 'red'}>{r.ok ? 'Success' : 'Failed'}</Pill> },
    { key: 'hub', header: 'Location / Hub', render: (r) => <span className="text-slate-600">{r.hub}</span> },
  ];
}

function breakCols(): DrillColumn[] {
  return [
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} /> },
    { key: 'type', header: 'Break Type', render: (r) => <Pill tone={r.typeTone}>{r.type}</Pill> },
    { key: 'start', header: 'Start', render: (r) => <span className="font-mono text-slate-500">{fmtTime(r.start)}</span> },
    { key: 'end', header: 'End', render: (r) => <span className="font-mono text-slate-500">{r.end ? fmtTime(r.end) : 'Ongoing'}</span> },
    { key: 'duration', header: 'Duration', render: (r) => <span className="font-mono font-bold text-[#0b1c30]">{r.duration}</span> },
    { key: 'allowed', header: 'Allowed', render: (r) => <span className="text-slate-600">{r.allowed}</span> },
    { key: 'overrun', header: 'Overrun', render: (r) => (r.overrun ? <Pill tone="red">Yes</Pill> : <Pill tone="green">No</Pill>) },
    { key: 'compliance', header: 'Policy', render: (r) => <Pill tone={r.complianceTone}>{r.compliance}</Pill> },
  ];
}

function incentiveCols(): DrillColumn[] {
  return [
    { key: 'emp', header: 'Employee', render: (r) => <EmpCell code={r.code} name={r.name} /> },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-slate-600">{r.department}</span> },
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
    { key: 'amount', header: 'Amount', render: (r) => <span className="font-bold text-emerald-600">₹{r.amount}</span> },
    { key: 'basis', header: 'Calculation Basis', render: (r) => <span className="text-slate-600">{r.basis}</span> },
    { key: 'date', header: 'Date', render: (r) => <span className="text-slate-500">{fmtDate(r.date)}</span> },
    {
      key: 'status',
      header: 'Approval / Payment',
      render: (r) => <Pill tone={r.statusTone}>{prettyEnum(r.status)}</Pill>,
    },
  ];
}

export function MetricDrillDownModal({
  metric,
  title,
  filters,
  context,
  onClose,
}: {
  metric: MetricKey;
  title: string;
  filters: DrillFilters;
  context?: DrillContext;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [columns, setColumns] = useState<DrillColumn[]>([]);
  const [page, setPage] = useState(1);
  const reqIdRef = useRef(0);

  const { locationId, departmentId, shiftId } = filters;
  const date = filters.date || new Date().toISOString().slice(0, 10);
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;
  const hubScoped = locationId && locationId !== 'all';

  const load = useCallback(async () => {
    const rid = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    setRows([]);
    setColumns([]);
    setPage(1);
    try {
      // Roster doubles as the workforce dataset and as a scope/enrichment map.
      const scope = await fetchScope(filters);

      let cols: DrillColumn[] = [];
      let data: any[] = [];

      if (metric === 'workforce') {
        let attMap = new Map<string, string>();
        try {
          const ap = new URLSearchParams();
          ap.set('limit', String(ROSTER_LIMIT));
          if (hubScoped) ap.set('locationId', String(locationId));
          const attRes = await api.get(`/attendance/today?${ap.toString()}`);
          for (const a of attRes.data?.attendances || []) attMap.set(a.employeeId, a.status);
        } catch {
          /* attendance enrichment is optional */
        }
        data = scope.employees.map((e) => {
          const emp = empOf(scope, e.id, e);
          const att = attMap.get(e.id);
          return {
            id: e.id,
            code: emp.code,
            name: emp.name,
            department: emp.department,
            hub: emp.hub,
            shift: emp.shift,
            designation: e.designation || '—',
            rawStatus: e.status,
            attendance: att,
            onFloor: att ? ON_FLOOR.has(att) : false,
          };
        });
        cols = employeeCols();
      } else if (metric === 'adherence') {
        const p = new URLSearchParams();
        p.set('limit', String(METRIC_LIMIT));
        if (hubScoped) p.set('locationId', String(locationId));
        if (shiftId && shiftId !== 'all') p.set('shiftId', String(shiftId));
        p.set('startDate', dayStart);
        p.set('endDate', dayEnd);
        const res = await api.get(`/attendance?${p.toString()}`);
        const list: any[] = res.data?.attendances || res.data?.attendance || [];
        data = list
          .filter((a) => !scope.ready || scope.inScope.has(a.employeeId))
          .map((a) => {
            const emp = empOf(scope, a.employeeId, a.employee);
            const sched = a.scheduledLogin ? new Date(a.scheduledLogin) : null;
            const act = a.actualLogin ? new Date(a.actualLogin) : null;
            const st = a.status;
            let adherence: number | null = null;
            let present = 'Present';
            let presentTone: Tone = 'green';
            let off = '—';
            let offTone: Tone = 'slate';
            let remark = 'On time';
            if (st === 'WEEKLY_OFF') {
              present = 'Weekly Off';
              presentTone = 'slate';
              off = 'Weekly Off';
              offTone = 'slate';
              remark = 'Weekly off';
              adherence = null;
            } else if (st === 'ABSENT' || !act) {
              present = 'Absent';
              presentTone = 'red';
              off = 'Absent';
              offTone = 'red';
              remark = 'No check-in recorded';
              adherence = 0;
            } else {
              const lateMins = sched ? Math.round((act.getTime() - sched.getTime()) / 60000) : 0;
              if (lateMins > 0) {
                adherence = Math.max(0, 100 - lateMins);
                present = 'Late';
                presentTone = 'amber';
                remark = `Late by ${lateMins} min`;
              } else {
                adherence = 100;
                present = st === 'EARLY' ? 'Early' : 'Present';
                presentTone = 'green';
                remark = st === 'EARLY' ? `Early by ${Math.abs(lateMins)} min` : 'On time';
              }
              if (st === 'ON_LUNCH') {
                off = 'On Lunch';
                offTone = 'blue';
              } else if (st === 'ON_TEA_BREAK') {
                off = 'On Tea Break';
                offTone = 'blue';
              }
            }
            return {
              id: a.id,
              code: emp.code,
              name: emp.name,
              department: emp.department,
              expected: a.scheduledLogin ? fmtTime(a.scheduledLogin) : emp.shift,
              actual: act ? fmtTime(a.actualLogin) : '—',
              present,
              presentTone,
              off,
              offTone,
              adherence,
              remark,
            };
          });
        cols = adherenceCols();
      } else if (metric === 'punches') {
        const mk = () => {
          const p = new URLSearchParams();
          p.set('limit', String(METRIC_LIMIT));
          if (hubScoped) p.set('locationId', String(locationId));
          p.set('startDate', dayStart);
          p.set('endDate', dayEnd);
          return p.toString();
        };
        const [fvRes, qrRes] = await Promise.all([
          api.get(`/face-verification?${mk()}`).catch(() => ({ data: null })),
          api.get(`/qr-codes/scans?${mk()}`).catch(() => ({ data: null })),
        ]);
        const fvRows: any[] = (fvRes.data?.verifications || fvRes.data?.rows || []).map((v: any) => {
          const emp = empOf(scope, v.employeeId, v);
          return {
            id: `fv-${v.id}`,
            employeeId: v.employeeId,
            code: v.employeeCode || emp.code,
            name: v.employeeName || emp.name,
            time: v.attemptedAt || v.verifiedAt,
            type: punchTypeFromPurpose(v.purpose),
            method: 'Face',
            methodIcon: 'face',
            device: v.deviceId || 'Face Recognition Terminal',
            ok: String(v.result).toLowerCase() === 'passed',
            hub: v.locationName || emp.hub,
          };
        });
        const qrRows: any[] = (qrRes.data?.scans || []).map((s: any) => {
          const emp = empOf(scope, s.employeeId, s.employee);
          return {
            id: `qr-${s.id}`,
            employeeId: s.employeeId,
            code: s.employee?.employeeCode || emp.code,
            name: s.employee?.fullName || emp.name,
            time: s.scannedAt || s.createdAt,
            type: punchTypeFromPurpose(s.purpose),
            method: 'QR',
            methodIcon: 'qr_code_scanner',
            device: s.sellingPoint?.name || (s.deviceInfo ? String(s.deviceInfo).slice(0, 28) : 'QR Scanner'),
            ok: String(s.result).toUpperCase() === 'SUCCESS',
            hub: emp.hub,
          };
        });
        data = [...fvRows, ...qrRows]
          .filter((r) => !scope.ready || scope.inScope.has(r.employeeId))
          .sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
        cols = punchCols();
      } else if (metric === 'breaks') {
        const p = new URLSearchParams();
        p.set('limit', String(METRIC_LIMIT));
        p.set('startDate', dayStart);
        p.set('endDate', dayEnd);
        const res = await api.get(`/breaks?${p.toString()}`);
        const list: any[] = res.data?.breaks || [];
        data = list
          .filter((b) => !scope.ready || scope.inScope.has(b.employeeId))
          .map((b) => {
            const emp = empOf(scope, b.employeeId, b.employee);
            const start = b.startTime ? new Date(b.startTime) : null;
            const end = b.endTime ? new Date(b.endTime) : null;
            const mins = start ? Math.max(0, Math.floor(((end || new Date()).getTime() - start.getTime()) / 60000)) : null;
            const overrun = Number(b.excessDuration) > 0 || b.status === 'EXCEEDED';
            const compliance = b.status === 'EXCEEDED' ? 'Non-compliant' : b.status === 'ACTIVE' ? 'In progress' : 'Compliant';
            const complianceTone: Tone = b.status === 'EXCEEDED' ? 'red' : b.status === 'ACTIVE' ? 'amber' : 'green';
            return {
              id: b.id,
              code: emp.code,
              name: emp.name,
              type: prettyEnum(b.breakType),
              typeTone: BREAK_TYPE_TONE[b.breakType] || 'slate',
              start: b.startTime,
              end: b.endTime,
              duration: mins === null ? '—' : `${mins}m`,
              allowed: b.allowedDuration != null ? `${b.allowedDuration}m` : '—',
              overrun,
              compliance,
              complianceTone,
            };
          });
        cols = breakCols();
      } else if (metric === 'incentives') {
        const p = new URLSearchParams();
        p.set('limit', String(METRIC_LIMIT));
        p.set('startDate', dayStart);
        p.set('endDate', dayEnd);
        const res = await api.get(`/incentives/transactions?${p.toString()}`);
        const list: any[] = res.data?.transactions || [];
        data = list
          .filter((t) => !scope.ready || scope.inScope.has(t.employeeId))
          .map((t) => {
            const emp = empOf(scope, t.employeeId, t.employee);
            return {
              id: t.id,
              code: emp.code,
              name: emp.name,
              department: emp.department,
              type: t.incentiveRule?.incentiveType ? prettyEnum(t.incentiveRule.incentiveType) : t.incentiveRule?.name || 'Incentive',
              amount: Number(t.calculatedAmount || 0).toLocaleString('en-IN'),
              basis: prettyEnum(t.calculationBasis),
              date: t.transactionDate,
              status: t.status,
              statusTone: INC_STATUS_TONE[t.status] || 'slate',
            };
          });
        cols = incentiveCols();
      }

      if (rid !== reqIdRef.current) return;
      setColumns(cols);
      setRows(data);
      setLoading(false);
    } catch (err) {
      if (rid !== reqIdRef.current) return;
      console.error(`Drill-down load failed (${metric}):`, err);
      setError('Failed to load detailed records. Please try again.');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric, locationId, departmentId, shiftId, date]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const rangeStart = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, rows.length);

  const chips = [
    { label: 'Hub', value: context?.hub || 'All Hubs' },
    { label: 'Dept', value: context?.dept || 'All Departments' },
    { label: 'Shift', value: context?.shift || 'All Shifts' },
    { label: 'Date', value: context?.date || date },
  ];

  return (
    <Modal open onClose={onClose} title={title} className="max-w-5xl w-full">
      <div className="flex flex-col gap-4">
        {/* Filter context */}
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

        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500" aria-live="polite">
            {loading ? 'Loading detailed records…' : error ? 'Error loading records' : `${rows.length} record${rows.length === 1 ? '' : 's'} found`}
          </p>
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
          <div className="flex flex-col gap-2 py-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 animate-pulse rounded-lg" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <span className="material-symbols-outlined text-slate-300 text-[40px] mb-2">inbox</span>
            <p className="text-sm font-semibold text-slate-500">No records available</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting the Hub, Department, Shift or Date filters.</p>
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
                  {pageRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/70 transition-colors align-middle">
                      {columns.map((col) => (
                        <td key={col.key} className="py-2.5 px-3">
                          {col.render(row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 pt-1">
              <span className="text-[11px] text-slate-500">
                Showing {rangeStart}–{rangeEnd} of {rows.length}
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
      </div>
    </Modal>
  );
}
