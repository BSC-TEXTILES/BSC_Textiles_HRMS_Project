'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import {
  GovernanceReportDrawer,
  type GovernanceMetric,
  type GovernanceDrawerFilters,
} from './drawers/GovernanceReportDrawer';
import { monthRange } from '@/components/dashboard/DetailDrillDownModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'attendance' | 'face' | 'qr' | 'incentives' | 'payroll'>('attendance');
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [empIdByCode, setEmpIdByCode] = useState<Record<string, string>>({});
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedShift, setSelectedShift] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerMetric, setDrawerMetric] = useState<GovernanceMetric | null>(null);
  const cardTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t && ['attendance', 'face', 'qr', 'incentives', 'payroll'].includes(t)) {
        setActiveTab(t as any);
      }
    }
  }, []);

  const fetchLocations = useCallback(async () => {
    try {
      const res = await api.get('/locations/all');
      setLocations(res.data || []);
    } catch (e) {
      console.error(e);
    }
  }, []);

  /** Filter options + roster map used to resolve employee codes to profile ids. */
  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await api.get('/departments');
      setDepartments(res.data?.departments || []);
    } catch (e) {
      console.error(e);
    }
    try {
      const res = await api.get('/shifts');
      setShifts(res.data?.shifts || []);
    } catch (e) {
      console.error(e);
    }
    try {
      const res = await api.get('/employees/lookup').catch(() => api.get('/employees?limit=100'));
      const list = Array.isArray(res.data) ? res.data : (res.data?.employees || []);
      const map: Record<string, string> = {};
      for (const e of list) if (e.employeeCode) map[e.employeeCode] = e.id;
      setEmpIdByCode(map);
    } catch (e) {
      console.error(e);
    }
  }, []);

  /** Map the hub filter code (BEL/DAV/SHI) to its real location id for API calls. */
  const resolvedLocationId = useMemo(() => {
    if (selectedLocation === 'ALL') return null;
    return locations.find((l) => l.code === selectedLocation)?.id || null;
  }, [locations, selectedLocation]);

  /** Shift options scoped to the selected hub (deduped by shift code). */
  const shiftOptions = useMemo(() => {
    const scoped = resolvedLocationId ? shifts.filter((s) => s.locationId === resolvedLocationId) : shifts;
    const seen = new Set<string>();
    return scoped.filter((s) => {
      const key = String(s.code || s.name);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [shifts, resolvedLocationId]);

  /** Last 12 months for the Monthly Report month filter. */
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      opts.push({
        value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      });
    }
    return opts;
  }, []);

  // Hub change invalidates an explicit shift selection.
  useEffect(() => {
    setSelectedShift('all');
  }, [selectedLocation]);

  const fetchReportData = useCallback(async () => {
    try {
      setLoading(true);
      let rows: any[] = [];
      const { start, end } = monthRange(selectedMonth);
      const base = new URLSearchParams();
      if (resolvedLocationId) base.set('locationId', resolvedLocationId);
      base.set('startDate', start);
      base.set('endDate', end);
      if (selectedDept !== 'all') base.set('departmentId', selectedDept);
      if (selectedShift !== 'all') base.set('shiftId', selectedShift);
      const baseQ = `?${base.toString()}`;

      // Every tab reads a real endpoint. When it returns no rows the table shows
      // its empty state — nothing is synthesised to fill the screen.
      if (activeTab === 'attendance') {
        const res = await api.get(`/reports/attendance-summary${baseQ}`).catch(() => null);
        rows = Array.isArray(res?.data) ? res.data : (res?.data?.summary || res?.data?.data || []);
      } else if (activeTab === 'face') {
        const res = await api.get(`/face-verification${baseQ}`).catch(() => null);
        rows = res?.data?.verifications || res?.data?.rows || (Array.isArray(res?.data) ? res.data : []);
      } else if (activeTab === 'qr') {
        const res = await api.get(`/qr-codes/scans${baseQ}`).catch(() => null);
        rows = res?.data?.scans || (Array.isArray(res?.data) ? res.data : []);
      } else if (activeTab === 'incentives') {
        const res = await api.get(`/incentives/transactions${baseQ}`).catch(() => null);
        rows = res?.data?.transactions || (Array.isArray(res?.data) ? res.data : []);
      } else if (activeTab === 'payroll') {
        const res = await api.get('/payroll/runs').catch(() => null);
        rows = res?.data?.runs || (Array.isArray(res?.data) ? res.data : []);
      }
      setData(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.error('Fetch report error:', e);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, resolvedLocationId, selectedMonth, selectedDept, selectedShift]);

  useEffect(() => {
    fetchLocations();
    fetchFilterOptions();
  }, [fetchLocations, fetchFilterOptions]);

  useEffect(() => {
    fetchReportData();
  }, [fetchReportData]);

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.error('No report data to export');
      return;
    }
    const cell = (value: unknown): string => {
      let text: string;
      if (value === null || value === undefined) text = '';
      else if (value instanceof Date) text = value.toISOString();
      else if (typeof value === 'object') text = JSON.stringify(value);
      else text = String(value);
      return `"${text.replace(/"/g, '""')}"`;
    };
    // Columns are the union of the keys the loaded rows actually carry.
    const columns = Array.from(new Set(data.flatMap((d) => Object.keys(d || {}))));
    const headers = columns.map(cell).join(',');
    const rows = data.map((d) => columns.map((c) => cell(d?.[c])).join(','));
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Textiles_${activeTab}_statutory_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Statutory report exported to CSV!');
  };

  /** Resolve an employee profile id from a report row (employee code based). */
  const resolveEmployeeId = (row: any): string | null => {
    if (row.employeeId) return row.employeeId;
    const code = row.employeeCode || row.code;
    return code && empIdByCode[code] ? empIdByCode[code] : null;
  };

  const isEmployeeRow = (row: any) => Boolean(resolveEmployeeId(row));

  const openEmployeeProfile = (row: any) => {
    const id = resolveEmployeeId(row);
    if (id) router.push(`/employees/profile/${id}`);
  };

  const openDrawer = (m: GovernanceMetric) => {
    setDrawerMetric(m);
  };

  const closeDrawer = () => {
    const prev = drawerMetric;
    setDrawerMetric(null);
    if (prev && cardTriggerRefs.current[prev]) {
      cardTriggerRefs.current[prev]?.focus();
    }
  };

  /** Filter context passed to the Governance Report Drawer */
  const drawerFilters: GovernanceDrawerFilters = useMemo(() => {
    return {
      locationId: resolvedLocationId || selectedLocation,
      locationName:
        selectedLocation === 'ALL'
          ? 'All Hubs (Karnataka)'
          : locations.find((l) => l.code === selectedLocation)?.name || selectedLocation,
      month: selectedMonth,
      monthLabel: monthOptions.find((m) => m.value === selectedMonth)?.label || selectedMonth,
      departmentId: selectedDept,
      departmentName:
        selectedDept === 'all'
          ? 'All Departments'
          : departments.find((d) => d.id === selectedDept)?.name || selectedDept,
      shiftId: selectedShift,
      shiftName:
        selectedShift === 'all'
          ? 'All Shifts'
          : shifts.find((s) => s.id === selectedShift)?.name || selectedShift,
      status: selectedStatus,
    };
  }, [
    resolvedLocationId,
    selectedLocation,
    locations,
    selectedMonth,
    monthOptions,
    selectedDept,
    departments,
    selectedShift,
    shifts,
    selectedStatus,
  ]);

  /**
   * Card metrics counted from the rows the active tab actually loaded. A card
   * whose dataset is not on screen (or returned no rows) shows '—' — the page
   * never quotes an attendance rate, match score, latency or rupee total that the
   * server did not send.
   */
  const cardMetrics = useMemo(() => {
    const hubLabel =
      selectedLocation === 'ALL'
        ? 'All Karnataka hubs'
        : locations.find((l) => l.code === selectedLocation)?.name || selectedLocation;
    const rows = data;
    const notLoaded = (tab: string) => ({ value: '—', sub: `Open the ${tab} tab to load rows` });

    const num = (v: unknown) => {
      const n = Number(v ?? 0);
      return Number.isFinite(n) ? n : 0;
    };

    let muster = notLoaded('Attendance Muster Roll');
    if (activeTab === 'attendance' && rows.length > 0) {
      const totalDays = rows.reduce((acc, r) => acc + num(r.totalDays), 0);
      const absent = rows.reduce((acc, r) => acc + num(r.absent), 0);
      if (totalDays > 0) {
        muster = {
          value: `${Math.round(((totalDays - absent) / totalDays) * 1000) / 10}%`,
          sub: `${rows.length} employee row(s) • ${hubLabel}`,
        };
      }
    }

    let face = notLoaded('Biometric Face Telemetry');
    if (activeTab === 'face' && rows.length > 0) {
      const verified = rows.filter((r) => String(r.status || r.result || '').toUpperCase() === 'VERIFIED').length;
      const scores = rows.map((r) => Number(r.score ?? r.matchPercentage)).filter((n) => Number.isFinite(n));
      face = {
        value: `${Math.round((verified / rows.length) * 1000) / 10}% Verified`,
        sub: scores.length > 0
          ? `Mean stored score ${Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10}%`
          : 'No score stored on these transactions',
      };
    }

    let qr = notLoaded('Canteen & QR Scan Passes');
    if (activeTab === 'qr' && rows.length > 0) {
      const ok = rows.filter((r) => String(r.result || '').toUpperCase() === 'SUCCESS').length;
      qr = {
        value: `${Math.round((ok / rows.length) * 1000) / 10}% Successful`,
        sub: `${ok} of ${rows.length} scan row(s) succeeded`,
      };
    }

    let incentive = notLoaded('Festive Incentives Ledger');
    if (activeTab === 'incentives' && rows.length > 0) {
      const total = rows.reduce((acc, r) => acc + num(r.calculatedAmount), 0);
      incentive = {
        value: '₹' + Math.round(total).toLocaleString('en-IN'),
        sub: `${rows.length} transaction(s) loaded`,
      };
    }

    let compliance = notLoaded('Statutory Payroll Summary');
    if (activeTab === 'payroll' && rows.length > 0) {
      const latest = rows[0];
      compliance = {
        value: String(latest.status || '—'),
        sub: latest.periodStart
          ? `Latest run ${new Date(latest.periodStart).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`
          : `${rows.length} payroll run(s) loaded`,
      };
    }

    return {
      musterVal: muster.value,
      musterSub: muster.sub,
      faceVal: face.value,
      faceSub: face.sub,
      qrVal: qr.value,
      qrSub: qr.sub,
      incentiveVal: incentive.value,
      incentiveSub: incentive.sub,
      complianceVal: compliance.value,
      complianceSub: compliance.sub,
    };
  }, [selectedLocation, locations, data, activeTab]);

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full font-body-md text-on-surface">
        {/* Top Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-space-lg mb-space-lg">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant tracking-wider uppercase">
              <span>Governance &amp; Operations</span>
              <span className="material-symbols-outlined text-[12px] text-outline">chevron_right</span>
              <span className="text-secondary font-bold">Authoritative Statutory Reporting</span>
            </div>
            <div className="flex flex-wrap items-center gap-space-md mt-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                Governance, Workforce &amp; Statutory Reports
              </h1>
              <div className="inline-flex items-center gap-space-xs px-space-sm py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-md text-label-md font-semibold">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
                </span>
                Karnataka Factories Act Certified
              </div>
            </div>
          </div>

          <div className="flex items-center gap-space-sm mt-space-md md:mt-0 flex-wrap">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors rounded-lg font-label-lg text-label-lg shadow-sm border border-slate-200/60"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">print</span>
              Print Muster Roll
            </button>
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-primary text-on-primary hover:bg-slate-800 transition-colors rounded-lg font-label-lg text-label-lg shadow-sm font-bold"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">file_download</span>
              Export Report (CSV)
            </button>
          </div>
        </div>

        {/* 5 KPI Metric Horizon */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md mb-space-lg">
          <button
            ref={(el) => {
              cardTriggerRefs.current['muster'] = el;
            }}
            type="button"
            onClick={() => openDrawer('muster')}
            aria-label="View details for Muster Attendance"
            className="group bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/40 hover:bg-[#F8F4F1]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Muster Attendance</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">rule</span>
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-on-surface">{cardMetrics.musterVal}</div>
            <span className="text-xs text-secondary font-medium mt-1">{cardMetrics.musterSub}</span>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-secondary transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            ref={(el) => {
              cardTriggerRefs.current['face'] = el;
            }}
            type="button"
            onClick={() => openDrawer('face')}
            aria-label="View details for Biometric Optical SLA"
            className="group bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/40 hover:bg-[#F8F4F1]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Biometric Optical SLA</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">fingerprint</span>
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-on-surface">{cardMetrics.faceVal}</div>
            <span className="text-xs text-on-surface-variant mt-1">{cardMetrics.faceSub}</span>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-secondary transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            ref={(el) => {
              cardTriggerRefs.current['qr'] = el;
            }}
            type="button"
            onClick={() => openDrawer('qr')}
            aria-label="View details for Canteen QR Tokens"
            className="group bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/40 hover:bg-[#F8F4F1]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Canteen QR Tokens</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">qr_code_scanner</span>
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-on-surface">{cardMetrics.qrVal}</div>
            <span className="text-xs text-on-surface-variant mt-1">{cardMetrics.qrSub}</span>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-secondary transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            ref={(el) => {
              cardTriggerRefs.current['incentives'] = el;
            }}
            type="button"
            onClick={() => openDrawer('incentives')}
            aria-label="View details for Festive Incentives"
            className="group bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/40 hover:bg-[#F8F4F1]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Festive Incentives</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">military_tech</span>
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-secondary">{cardMetrics.incentiveVal}</div>
            <span className="text-xs text-on-surface-variant mt-1">{cardMetrics.incentiveSub}</span>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-secondary transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>

          <button
            ref={(el) => {
              cardTriggerRefs.current['compliance'] = el;
            }}
            type="button"
            onClick={() => openDrawer('compliance')}
            aria-label="View details for Statutory Form F/T"
            className="group bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/40 hover:bg-[#F8F4F1]/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Statutory Form F/T</span>
              <div className="w-8 h-8 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="text-2xl font-bold font-mono text-on-surface">{cardMetrics.complianceVal}</div>
            <span className="text-xs text-emerald-600 font-medium mt-1">{cardMetrics.complianceSub}</span>
            <div className="mt-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-secondary transition-colors">
              <span>View Details</span>
              <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
            </div>
          </button>
        </div>

        {/* Tab Strip and Filters */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 mb-space-lg flex flex-col gap-space-md">
          <div className="flex items-center gap-space-xs overflow-x-auto pb-space-xs scrollbar-none">
            {[
              { id: 'attendance', label: 'Attendance Muster Roll (Form T)', icon: 'calendar_month' },
              { id: 'face', label: 'Biometric Face Telemetry', icon: 'face' },
              { id: 'qr', label: 'Canteen & QR Scan Passes', icon: 'lunch_dining' },
              { id: 'incentives', label: 'Festive Incentives Ledger', icon: 'payments' },
              { id: 'payroll', label: 'Statutory Payroll Summary', icon: 'account_balance' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-label-lg text-label-lg whitespace-nowrap flex-shrink-0 transition-colors ${
                  activeTab === tab.id
                    ? 'bg-surface-container text-secondary font-bold'
                    : 'text-on-surface-variant hover:bg-surface-container-low'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs border-t border-slate-100">
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                Filter by Store Hub:
              </span>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                aria-label="Filter by Store Hub"
                className="bg-surface-container-low rounded-lg px-space-md py-1.5 font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer border border-slate-200/50"
              >
                <option value="ALL">All Hubs (Karnataka)</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.code}>
                    {`${l.name}${l.code ? ` (${l.code})` : ''}`}
                  </option>
                ))}
              </select>

              <label
                htmlFor="rep-month"
                className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold"
              >
                Month:
              </label>
              <select
                id="rep-month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-surface-container-low rounded-lg px-space-md py-1.5 font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer border border-slate-200/50"
              >
                {monthOptions.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>

              <label
                htmlFor="rep-dept"
                className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold"
              >
                Dept:
              </label>
              <select
                id="rep-dept"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="bg-surface-container-low rounded-lg px-space-md py-1.5 font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer border border-slate-200/50"
              >
                <option value="all">All Departments</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>

              <label
                htmlFor="rep-shift"
                className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold"
              >
                Shift:
              </label>
              <select
                id="rep-shift"
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="bg-surface-container-low rounded-lg px-space-md py-1.5 font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer border border-slate-200/50"
              >
                <option value="all">All Shifts</option>
                {shiftOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <label
                htmlFor="rep-status"
                className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold"
              >
                Status:
              </label>
              <select
                id="rep-status"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="bg-surface-container-low rounded-lg px-space-md py-1.5 font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer border border-slate-200/50"
              >
                <option value="all">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="PROBATION">Probation</option>
                <option value="ON_LEAVE">On Leave</option>
                <option value="INACTIVE">Inactive</option>
                <option value="TERMINATED">Terminated</option>
              </select>
            </div>
            <span className="text-xs text-on-surface-variant font-mono">
              Displaying authoritative operational records
            </span>
          </div>
        </div>

        {/* Dynamic Report Matrix Table */}
        <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body-sm text-body-sm">
              <thead className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  {data.length > 0 &&
                    Object.keys(data[0])
                      .filter((k) => k !== 'id')
                      .map((key) => (
                        <th key={key} className="py-space-sm px-space-md">
                          {key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase())}
                        </th>
                      ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                      Compiling statutory report data...
                    </td>
                  </tr>
                ) : data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-on-surface-variant">
                      No report records available for selected criteria.
                    </td>
                  </tr>
                ) : (
                  data.map((row, idx) => {
                    const clickable = isEmployeeRow(row);
                    const rowName = row.employeeName || row.employee || row.code || '';
                    return (
                      <tr
                        key={idx}
                        tabIndex={clickable ? 0 : undefined}
                        role={clickable ? 'button' : undefined}
                        aria-label={clickable ? `Open employee profile for ${rowName}` : undefined}
                        onClick={() => clickable && openEmployeeProfile(row)}
                        onKeyDown={(e) => {
                          if (clickable && (e.key === 'Enter' || e.key === ' ')) {
                            e.preventDefault();
                            openEmployeeProfile(row);
                          }
                        }}
                        className={`transition-colors ${
                          clickable
                            ? 'cursor-pointer group hover:bg-[#F8F4F1]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1346a1]'
                            : 'hover:bg-surface-container-low/50'
                        }`}
                      >
                        {Object.entries(row)
                          .filter(([k]) => k !== 'id')
                          .map(([k, val], vIdx) => (
                            <td key={vIdx} className="py-space-sm px-space-md font-medium text-on-surface">
                              {typeof val === 'string' && val.includes('%') ? (
                                <span className="font-mono font-bold text-secondary">{val}</span>
                              ) : typeof val === 'string' && val.startsWith('₹') ? (
                                <span className="font-mono font-bold text-on-surface">{val}</span>
                              ) : typeof val === 'string' && (val === 'AUDITED' || val === 'COMMITTED') ? (
                                <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                                  {val}
                                </span>
                              ) : (k === 'employeeName' || k === 'employee' || k === 'employeeCode' || k === 'code') && clickable ? (
                                <span className="group-hover:text-secondary group-hover:underline font-semibold">
                                  {String(val)}
                                </span>
                              ) : (
                                String(val)
                              )}
                            </td>
                          ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* GOVERNANCE REPORT RIGHT-SIDE DETAIL DRAWER */}
        {drawerMetric && (
          <GovernanceReportDrawer
            metric={drawerMetric}
            filters={drawerFilters}
            empIdByCode={empIdByCode}
            onClose={closeDrawer}
            onSwitchTab={(tabId) => setActiveTab(tabId)}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
