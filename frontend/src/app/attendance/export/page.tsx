'use client';

/**
 * Attendance Excel Download.
 *
 * One screen, three server-generated workbooks:
 *   Monthly attendance   — every employee-day in the period plus a month summary;
 *   Annual attendance    — month-by-month breakdown plus year totals;
 *   Detailed punches     — the raw terminal transaction ledger.
 *
 * The buttons download real files: each request asks the backend for a blob, and
 * the browser saves it under the name the server sent in `Content-Disposition`.
 * Nothing is assembled in the browser and nothing is simulated — if the period
 * has no records the workbook says so on its first row.
 *
 * Which module may export what is decided by the backend (`ATTENDANCE` +
 * `export`); this page only reflects that by hiding itself when the caller has no
 * export grant.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import api from '@/lib/api';
import { describeExportError, downloadAttendanceExport } from '@/lib/exportDownload';
import toast from 'react-hot-toast';
import { canAction, useAccessSnapshot } from '@/lib/rbac';
import {
  AlertTriangle,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Fingerprint,
  Loader2,
  Table2,
} from 'lucide-react';

type ExportKind = 'monthly' | 'annual' | 'punches';

interface LocationOption {
  id: string;
  code: string;
  name: string;
}

interface DepartmentOption {
  id: string;
  name: string;
}

const KIND_META: Record<ExportKind, { label: string; blurb: string; icon: typeof Table2 }> = {
  monthly: {
    label: 'Monthly attendance',
    blurb: 'One row per employee per recorded day, plus a per-employee month summary sheet.',
    icon: Table2,
  },
  annual: {
    label: 'Annual attendance',
    blurb: 'Month-by-month present, absent, weekly-off, leave, hours and exception counts with year totals.',
    icon: CalendarRange,
  },
  punches: {
    label: 'Detailed punch transactions',
    blurb: 'The raw device ledger: terminal, serial, punch time in the store timezone, verification method as reported.',
    icon: Fingerprint,
  },
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function daysBetween(from: string, to: string): number {
  const start = new Date(`${from}T12:00:00`).getTime();
  const end = new Date(`${to}T12:00:00`).getTime();
  return Math.round((end - start) / 86400000) + 1;
}

export default function AttendanceExportPage() {
  const access = useAccessSnapshot();
  const canExport = canAction(access, 'ATTENDANCE', 'export');

  const now = useMemo(() => new Date(), []);
  const [kind, setKind] = useState<ExportKind>('monthly');
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [from, setFrom] = useState(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)));
  const [to, setTo] = useState(isoDay(now));
  const [locationId, setLocationId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [busy, setBusy] = useState<ExportKind | null>(null);

  useEffect(() => {
    let ignore = false;
    api
      .get('/locations/all')
      .then((res) => {
        if (ignore) return;
        const list = Array.isArray(res.data) ? res.data : res.data?.locations || [];
        setLocations(list.map((l: any) => ({ id: l.id, code: l.code || l.id, name: `${l.name} (${l.code})` })));
      })
      .catch(() => setLocations([]));
    return () => {
      ignore = true;
    };
  }, []);

  // Locations first: a department list is scoped to the chosen showroom, so an
  // empty store means every department in the estate.
  useEffect(() => {
    let ignore = false;
    const params: Record<string, string | number> = { limit: 200 };
    if (locationId) params.locationId = locationId;
    api
      .get('/departments', { params })
      .then((res) => {
        if (ignore) return;
        const list = res.data?.departments || [];
        setDepartments(list.map((d: any) => ({ id: d.id, name: d.name })));
      })
      .catch(() => setDepartments([]));
    return () => {
      ignore = true;
    };
  }, [locationId]);

  const period = useMemo(() => {
    if (useCustomRange) return { from, to };
    if (kind === 'annual') return { from: `${year}-01-01`, to: `${year}-12-31` };
    const monthNumber = Number(month);
    const lastDay = new Date(Number(year), monthNumber, 0).getDate();
    return {
      from: `${year}-${String(monthNumber).padStart(2, '0')}-01`,
      to: `${year}-${String(monthNumber).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    };
  }, [kind, month, useCustomRange, year, from, to]);

  const validation = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period.from) || !/^\d{4}-\d{2}-\d{2}$/.test(period.to)) {
      return 'Pick a valid start and end date.';
    }
    if (period.from > period.to) return 'The start date must be on or before the end date.';
    const days = daysBetween(period.from, period.to);
    if (days > 380) return `That window is ${days} days. Exports are limited to 380 days per file.`;
    return null;
  }, [period]);

  const scopeSummary = useMemo(() => {
    const parts = [`${period.from} → ${period.to}`];
    parts.push(locationId ? locations.find((l) => l.id === locationId)?.name || locationId : 'All stores');
    parts.push(departmentId ? departments.find((d) => d.id === departmentId)?.name || departmentId : 'All departments');
    parts.push(employeeId.trim() ? `Employee ${employeeId.trim()}` : 'All employees');
    return parts.join(' · ');
  }, [departmentId, departments, employeeId, locationId, locations, period]);

  const download = useCallback(async () => {
    if (validation) {
      toast.error(validation);
      return;
    }
    setBusy(kind);
    try {
      const filename = await downloadAttendanceExport(
        kind,
        {
          from: period.from,
          to: period.to,
          locationId,
          departmentId,
          employeeId: employeeId.trim(),
          format: kind === 'punches' ? format : undefined,
        },
        `attendance-${kind}.${format}`
      );
      toast.success(`Downloaded ${filename}`);
    } catch (err: any) {
      toast.error(await describeExportError(err));
    } finally {
      setBusy(null);
    }
  }, [departmentId, employeeId, format, kind, locationId, period, validation]);

  if (!canExport) {
    return (
      <DashboardLayout>
        <Card className="p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h2 className="text-base font-bold text-[#0b1c30] dark:text-slate-100">Attendance export is not available for your role</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Exporting attendance requires the <span className="font-semibold">Export</span> permission on the Attendance
            module. Ask an administrator if you need it.
          </p>
        </Card>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#0b1c30] dark:text-slate-100">Attendance Excel Download</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Monthly registers, annual summaries and raw punch transactions, generated on the server from the records
              the terminals actually reported.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <FileSpreadsheet className="h-4 w-4 text-[#0058be] dark:text-blue-400" />
            {scopeSummary}
          </span>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(Object.keys(KIND_META) as ExportKind[]).map((option) => {
              const meta = KIND_META[option];
              const Icon = meta.icon;
              const active = kind === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setKind(option)}
                  aria-pressed={active}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    active
                      ? 'border-[#0058be] bg-[#eff4ff] dark:border-blue-500 dark:bg-blue-950/50'
                      : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-[#0b1c30] dark:text-slate-100">
                    <Icon className={`h-4 w-4 ${active ? 'text-[#0058be] dark:text-blue-400' : 'text-slate-400'}`} />
                    {meta.label}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-slate-500 dark:text-slate-400">{meta.blurb}</span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Store</span>
              <select
                value={locationId}
                onChange={(e) => {
                  setLocationId(e.target.value);
                  setDepartmentId('');
                }}
                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All stores</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Department</span>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                <option value="">All departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
              {departments.length === 0 && (
                <span className="mt-1 block text-[11px] text-slate-400">
                  No department records exist{locationId ? ' for this store' : ' yet'}.
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Employee</span>
              <Input
                value={employeeId}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmployeeId(e.target.value)}
                placeholder="Employee code, e.g. 1601 (blank = all)"
                className="h-9 text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Year</span>
              <Input
                type="number"
                min={2000}
                max={2100}
                value={year}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setYear(e.target.value)}
                disabled={useCustomRange}
                className="h-9 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
            {kind !== 'annual' && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Month</span>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                  disabled={useCustomRange}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {MONTHS.map((name, index) => (
                    <option key={name} value={String(index + 1)}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block">
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">Custom range</span>
              <div className="flex items-center gap-2">
                <input
                  id="custom-range"
                  type="checkbox"
                  checked={useCustomRange}
                  onChange={(e) => setUseCustomRange(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                <span className="text-xs text-slate-600 dark:text-slate-300">Use my own dates</span>
              </div>
            </label>

            {useCustomRange && (
              <>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">From</span>
                  <Input type="date" value={from} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)} className="h-9 text-sm" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">To</span>
                  <Input type="date" value={to} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)} className="h-9 text-sm" />
                </label>
              </>
            )}

            {kind === 'punches' && (
              <label className="block">
                <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-500">File format</span>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as 'xlsx' | 'csv')}
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  <option value="xlsx">Excel workbook (.xlsx)</option>
                  <option value="csv">Comma separated (.csv)</option>
                </select>
              </label>
            )}
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {validation ? (
                <span className="inline-flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {validation}
                </span>
              ) : (
                `${daysBetween(period.from, period.to)} days · ${KIND_META[kind].label}`
              )}
            </p>
            <Button onClick={download} disabled={!!validation || busy !== null} className="min-w-[190px]">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
              {busy ? 'Generating…' : `Download ${kind === 'punches' ? (format === 'csv' ? 'CSV' : 'Excel') : 'Excel'}`}
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-bold text-[#0b1c30] dark:text-slate-100">What each file contains</h3>
          <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <li>
              <span className="font-semibold">Monthly</span> — employee ID, name, store, department, designation, shift,
              date, day, first and last punch, punch count, total/break/net/overtime hours, late and early-departure
              minutes, status, approved-leave reason, missing-punch flag, incentive and penalty in rupees, source
              terminals and the verification method reported by the device. A second sheet totals the same columns per
              employee for the month.
            </li>
            <li>
              <span className="font-semibold">Annual</span> — present, late, absent, weekly-off, holiday and approved-leave
              days, working days, hours, overtime, missing punches, incentive and penalty for each month of the year,
              with annual totals per employee. Weekly offs and holidays are counted from their own configured rules, not
              assumed from the weekday.
            </li>
            <li>
              <span className="font-semibold">Detailed punches</span> — one row per terminal event: serial number, terminal,
              floor, section, store, employee mapping, device user ID, punch time in the store timezone and in UTC,
              direction, verification-method label, reconciliation status and photo availability.
            </li>
          </ul>
          <p className="mt-3 text-[11px] text-slate-400">
            Every download is written to the audit trail with the filters used; downloads above 5,000 rows also raise a
            mass-export security event.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}
