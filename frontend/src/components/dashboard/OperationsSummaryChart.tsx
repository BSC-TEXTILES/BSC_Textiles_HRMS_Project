'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '@/lib/api';
import { fetchScope, ROSTER_LIMIT, type DrillFilters } from '@/lib/dashboardScope';
import type { MetricKey } from './MetricDrillDownModal';

/**
 * "Overall Operations Summary" — a filter-aware horizontal bar chart that sits
 * below the 5 KPI cards and mirrors their metrics. Each bar is normalised to a
 * 0–100 width for visual comparison, but the real value is always printed next
 * to it. Clicking a bar opens the same drill-down modal as its KPI card.
 */

const ON_FLOOR = new Set(['PRESENT', 'EARLY', 'ON_TIME', 'OVERTIME']);

/** Reference used only to scale the Incentives bar width (value itself is exact). */
const INCENTIVE_REF = 25000;

interface SummaryRow {
  key: MetricKey;
  label: string;
  display: string;
  secondary: string;
  percent: number;
  color: string;
  textColor: string;
  tooltip: Array<{ label: string; value: string }>;
}

function fmtCurrency(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/** Fetch the summarised metric values for the current filter set. */
async function fetchSummary(filters: DrillFilters): Promise<SummaryRow[]> {
  const { locationId, departmentId, shiftId } = filters;
  const date = filters.date || new Date().toISOString().slice(0, 10);
  const dayStart = `${date}T00:00:00`;
  const dayEnd = `${date}T23:59:59`;
  const hubScoped = Boolean(locationId && locationId !== 'all');

  // Roster scope — respects Hub, Department and Shift.
  const scope = await fetchScope(filters);
  const employees: any[] = scope.employees;
  const totalEmp = employees.length;
  const onFloorCount = employees.filter((e) => e.status === 'ACTIVE').length;
  const probation = employees.filter((e) => e.status === 'PROBATION').length;
  const offCount = employees.filter((e) => e.status === 'INACTIVE' || e.status === 'TERMINATED').length;

  // Attendance for the selected date.
  const attP = new URLSearchParams();
  attP.set('limit', String(ROSTER_LIMIT));
  if (hubScoped) attP.set('locationId', String(locationId));
  if (shiftId && shiftId !== 'all') attP.set('shiftId', String(shiftId));
  attP.set('startDate', dayStart);
  attP.set('endDate', dayEnd);
  const attRes = await api.get(`/attendance?${attP.toString()}`).catch(() => ({ data: null }));
  const attList: any[] = ((attRes.data?.attendances || attRes.data?.attendance || []) as any[]).filter(
    (a) => !scope.ready || scope.inScope.has(a.employeeId)
  );
  const present = attList.filter((a) => ON_FLOOR.has(a.status)).length;
  const late = attList.filter((a) => a.status === 'LATE').length;
  const adherencePct = totalEmp > 0 ? Math.round((present / totalEmp) * 1000) / 10 : 0;

  // Biometric punches (face verifications + QR scans) for the selected date.
  const punchParams = () => {
    const p = new URLSearchParams();
    p.set('limit', String(ROSTER_LIMIT));
    if (hubScoped) p.set('locationId', String(locationId));
    p.set('startDate', dayStart);
    p.set('endDate', dayEnd);
    return p.toString();
  };
  const [fvRes, qrRes] = await Promise.all([
    api.get(`/face-verification?${punchParams()}`).catch(() => ({ data: null })),
    api.get(`/qr-codes/scans?${punchParams()}`).catch(() => ({ data: null })),
  ]);
  const fvList: any[] = ((fvRes.data?.verifications || fvRes.data?.rows || []) as any[]).filter(
    (v) => !scope.ready || scope.inScope.has(v.employeeId)
  );
  const qrList: any[] = ((qrRes.data?.scans || []) as any[]).filter(
    (s) => !scope.ready || scope.inScope.has(s.employeeId)
  );
  const faceVerified = fvList.filter((v) => String(v.result).toLowerCase() === 'passed').length;
  const faceFailed = fvList.length - faceVerified;
  const faceAvg =
    fvList.length > 0
      ? Math.round((fvList.reduce((s, v) => s + Number(v.score ?? v.matchPercentage ?? 0), 0) / fvList.length) * 10) / 10
      : 0;
  const qrScans = qrList.length;

  // Active floor breaks for the selected date.
  const brkP = new URLSearchParams();
  brkP.set('limit', String(ROSTER_LIMIT));
  brkP.set('startDate', dayStart);
  brkP.set('endDate', dayEnd);
  const brkRes = await api.get(`/breaks?${brkP.toString()}`).catch(() => ({ data: null }));
  const brkList: any[] = ((brkRes.data?.breaks || []) as any[]).filter(
    (b) => !scope.ready || scope.inScope.has(b.employeeId)
  );
  const activeBreaks = brkList.filter((b) => b.status === 'ACTIVE').length;
  const brkLunch = brkList.filter((b) => b.status === 'ACTIVE' && b.breakType === 'LUNCH').length;
  const brkTea = brkList.filter((b) => b.status === 'ACTIVE' && b.breakType === 'TEA').length;
  const overruns = brkList.filter((b) => b.status === 'EXCEEDED' || Number(b.excessDuration) > 0).length;

  // Incentives for the selected date.
  const incP = new URLSearchParams();
  incP.set('limit', String(ROSTER_LIMIT));
  incP.set('startDate', dayStart);
  incP.set('endDate', dayEnd);
  const incRes = await api.get(`/incentives/transactions?${incP.toString()}`).catch(() => ({ data: null }));
  const incList: any[] = ((incRes.data?.transactions || []) as any[]).filter(
    (t) => !scope.ready || scope.inScope.has(t.employeeId)
  );
  const totalIncentive = incList.reduce((s, t) => s + Number(t.calculatedAmount || 0), 0);
  const earlyLogin = incList
    .filter((t) => String(t.incentiveRule?.incentiveType || '').toUpperCase().includes('EARLY'))
    .reduce((s, t) => s + Number(t.calculatedAmount || 0), 0);
  const salesOvertime = totalIncentive - earlyLogin;

  const clamp = (n: number) => Math.max(0, Math.min(100, n));

  const rows: SummaryRow[] = [
    {
      key: 'workforce',
      label: 'Workforce Register',
      display: `${present} Active`,
      secondary: `${present} Active On Floor • ${probation} Probation • ${offCount} Off`,
      percent: totalEmp > 0 ? clamp((present / totalEmp) * 100) : 0,
      color: '#2563eb',
      textColor: '#1d4ed8',
      tooltip: [
        { label: 'Total employees in scope', value: String(totalEmp) },
        { label: 'Active on floor', value: String(present) },
        { label: 'Probation', value: String(probation) },
        { label: 'Off / Inactive', value: String(offCount) },
      ],
    },
    {
      key: 'adherence',
      label: 'Floor Adherence',
      display: `${adherencePct.toFixed(1)}%`,
      secondary: `${present} / ${totalEmp} Present • ${late} Late`,
      percent: clamp(adherencePct),
      color: '#16a34a',
      textColor: '#15803d',
      tooltip: [
        { label: 'Present', value: `${present} of ${totalEmp}` },
        { label: 'Late', value: String(late) },
        { label: 'Adherence', value: `${adherencePct.toFixed(1)}%` },
        { label: 'Records evaluated', value: String(attList.length) },
      ],
    },
    {
      key: 'punches',
      label: 'Biometric Punches',
      display: `${faceAvg.toFixed(1)}%`,
      secondary: `Face Verified Avg • ${qrScans} RFID/QR scans`,
      percent: clamp(faceAvg),
      color: '#4f46e5',
      textColor: '#4338ca',
      tooltip: [
        { label: 'Face verified', value: String(faceVerified) },
        { label: 'Face failed', value: String(faceFailed) },
        { label: 'Average match score', value: `${faceAvg.toFixed(1)}%` },
        { label: 'QR / RFID scans', value: String(qrScans) },
      ],
    },
    {
      key: 'breaks',
      label: 'Active Floor Breaks',
      display: `${activeBreaks} Active`,
      secondary: `Lunch: ${brkLunch} • Tea: ${brkTea} • ${overruns} Overruns`,
      percent: totalEmp > 0 ? clamp((activeBreaks / totalEmp) * 100) : 0,
      color: '#ea580c',
      textColor: '#c2410c',
      tooltip: [
        { label: 'Active breaks', value: String(activeBreaks) },
        { label: 'Lunch', value: String(brkLunch) },
        { label: 'Tea', value: String(brkTea) },
        { label: 'Policy overruns', value: String(overruns) },
      ],
    },
    {
      key: 'incentives',
      label: 'Incentives Today',
      display: fmtCurrency(totalIncentive),
      secondary: `Early Login: ${fmtCurrency(earlyLogin)} • Sales & Overtime: ${fmtCurrency(salesOvertime)}`,
      percent: clamp((totalIncentive / INCENTIVE_REF) * 100),
      color: '#059669',
      textColor: '#047857',
      tooltip: [
        { label: 'Total today', value: fmtCurrency(totalIncentive) },
        { label: 'Early login', value: fmtCurrency(earlyLogin) },
        { label: 'Sales & overtime', value: fmtCurrency(salesOvertime) },
        { label: 'Transactions', value: String(incList.length) },
      ],
    },
  ];

  // All-clear: no roster and no records at all → treat as empty.
  const hasAnyData = totalEmp > 0 || attList.length > 0 || incList.length > 0 || fvList.length > 0 || brkList.length > 0;
  if (!hasAnyData) return [];

  return rows;
}

export function OperationsSummaryChart({
  filters,
  onSelectMetric,
}: {
  filters: DrillFilters;
  onSelectMetric: (metric: MetricKey) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<SummaryRow[]>([]);
  const reqIdRef = useRef(0);

  const { locationId, departmentId, shiftId } = filters;
  const date = filters.date;

  const load = useCallback(async () => {
    const rid = ++reqIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchSummary(filters);
      if (rid !== reqIdRef.current) return;
      setRows(data);
      setLoading(false);
    } catch (err) {
      if (rid !== reqIdRef.current) return;
      console.error('Operations summary load failed:', err);
      setError('Failed to load operations summary.');
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationId, departmentId, shiftId, date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <section
      aria-label="Overall Operations Summary horizontal bar chart"
      className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-xs"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-5">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#0058be] text-[20px]">bar_chart</span>
          <h2 className="text-base font-bold text-[#0b1c30]">Overall Operations Summary</h2>
        </div>
        <p className="text-xs text-slate-400 sm:text-right">
          Real-time summarized view based on selected Hub, Department, Date, and Shift
        </p>
      </div>

      {/* Body */}
      {error ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="material-symbols-outlined text-red-400 text-[34px] mb-2">error</span>
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
        <div className="flex flex-col gap-4" aria-hidden="true">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="h-3 w-36 bg-slate-100 rounded animate-pulse" />
                <div className="h-3 w-16 bg-slate-100 rounded animate-pulse" />
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full animate-pulse" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <span className="material-symbols-outlined text-slate-300 text-[38px] mb-2">bar_chart</span>
          <p className="text-sm font-semibold text-slate-500">No summary data available</p>
          <p className="text-xs text-slate-400 mt-1">Try adjusting the Hub, Department, Shift or Date filters.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {rows.map((row) => (
            <button
              key={row.key}
              type="button"
              onClick={() => onSelectMetric(row.key)}
              aria-label={`View ${row.label} details. ${row.display}. ${row.secondary}`}
              className="group relative w-full text-left rounded-lg p-2 -mx-2 cursor-pointer transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0058be] focus-visible:ring-offset-2"
            >
              {/* Label + value */}
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0b1c30] group-hover:text-[#0058be] transition-colors">
                    {row.label}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{row.secondary}</div>
                </div>
                <div
                  className="text-sm font-bold whitespace-nowrap"
                  style={{ color: row.textColor }}
                >
                  {row.display}
                </div>
              </div>

              {/* Bar track + fill */}
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500 ease-out"
                  style={{ width: `${row.percent}%`, backgroundColor: row.color }}
                />
              </div>

              {/* Tooltip */}
              <div
                role="tooltip"
                className="pointer-events-none invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 transition-opacity absolute z-20 top-full mt-2 left-1/2 -translate-x-1/2 w-[min(20rem,80vw)] rounded-lg bg-[#0b1c30] text-white text-[11px] p-3 shadow-lg"
              >
                <div className="font-bold mb-1.5">{row.label}</div>
                <ul className="flex flex-col gap-0.5">
                  {row.tooltip.map((item) => (
                    <li key={item.label} className="flex justify-between gap-3">
                      <span className="text-slate-300">{item.label}</span>
                      <span className="font-semibold">{item.value}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
