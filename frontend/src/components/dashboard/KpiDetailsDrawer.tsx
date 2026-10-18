'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Search,
  Users,
  UserCheck,
  UserX,
  CalendarDays,
  Clock,
  ScanFace,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

export type KpiDrawerType = 'headcount' | 'present' | 'absent' | 'leave' | 'late' | 'face_verified';

interface KpiDetailsDrawerProps {
  type: KpiDrawerType | null;
  onClose: () => void;
  locationId?: string;
  departmentId?: string;
  date?: string;
}

const PAGE_SIZE = 10;

const TYPE_META: Record<KpiDrawerType, { title: string; subtitle: string; icon: React.ReactNode }> = {
  headcount: {
    title: 'Total Headcount — Active Roster',
    subtitle: 'Every active employee in scope, from the employee master.',
    icon: <Users className="w-4 h-4" />,
  },
  present: {
    title: 'Present Today — Attendance Ledger',
    subtitle: 'Employees with a checked-in attendance record for the selected day.',
    icon: <UserCheck className="w-4 h-4" />,
  },
  absent: {
    title: 'Absent — No Punch, No Approved Leave',
    subtitle: 'Active employees with neither an attendance record nor approved leave for the day.',
    icon: <UserX className="w-4 h-4" />,
  },
  leave: {
    title: 'On Leave — Approved Applications',
    subtitle: 'Approved leave applications covering the selected day.',
    icon: <CalendarDays className="w-4 h-4" />,
  },
  late: {
    title: 'Late Arrivals — Attendance Ledger',
    subtitle: 'Attendance records marked LATE for the selected day.',
    icon: <Clock className="w-4 h-4" />,
  },
  face_verified: {
    title: 'Face Verified — Biometric Ledger',
    subtitle: 'Successful face verification events for the selected day.',
    icon: <ScanFace className="w-4 h-4" />,
  },
};

export function KpiDetailsDrawer({ type, onClose, locationId = 'all', departmentId = 'all', date }: KpiDetailsDrawerProps) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!type) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params: Record<string, string> = { type };
        if (locationId && locationId !== 'all') params.locationId = locationId;
        if (departmentId && departmentId !== 'all') params.departmentId = departmentId;
        if (date) params.date = date;
        const res = await api.get('/reports/kpi-details', { params });
        if (cancelled) return;
        setRows(Array.isArray(res.data?.rows) ? res.data.rows : []);
        setTotal(Number(res.data?.total || 0));
      } catch (err: any) {
        if (cancelled) return;
        setRows([]);
        setTotal(0);
        setError(err?.response?.data?.error || err?.message || 'The KPI detail could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [type, locationId, departmentId, date]);

  useEffect(() => {
    setSearch('');
    setPage(1);
  }, [type]);

  useEffect(() => {
    if (!type) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [type, onClose]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter((r) =>
      Object.values(r).some((v) => v != null && String(v).toLowerCase().includes(q))
    );
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!type) return null;
  const meta = TYPE_META[type];

  const exportCsv = () => {
    if (!filtered.length) {
      toast.error('No records to export.');
      return;
    }
    const keys = Object.keys(filtered[0]);
    const escape = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = [keys.join(','), ...filtered.map((r) => keys.map((k) => escape(r[k])).join(','))].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BSC_KPI_${type}_${date || 'latest'}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success(`Exported ${filtered.length} records.`);
  };

  const renderRow = (r: any, idx: number) => {
    const employee = (
      <div>
        <div className="font-bold text-slate-900 dark:text-white">{r.fullName || '—'}</div>
        <div className="text-[10px] text-slate-400 font-mono">{r.employeeCode || '—'}</div>
      </div>
    );
    if (type === 'headcount') {
      return (
        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="py-2.5 px-4">{employee}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.designation || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.department || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.locationName || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.joiningDate || '—'}</td>
        </tr>
      );
    }
    if (type === 'present' || type === 'late') {
      return (
        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="py-2.5 px-4">{employee}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.department || '—'}</td>
          <td className="py-2.5 px-4">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              {r.status || '—'}
            </span>
          </td>
          <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-200">{r.login || '—'}</td>
          <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-200">{r.logout || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.workedMinutes != null ? `${r.workedMinutes} min` : '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.lateMinutes != null ? `${r.lateMinutes} min` : '—'}</td>
        </tr>
      );
    }
    if (type === 'leave') {
      return (
        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="py-2.5 px-4">{employee}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.department || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.leaveType || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.startDate || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.endDate || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300 max-w-[220px] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
        </tr>
      );
    }
    if (type === 'face_verified') {
      return (
        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
          <td className="py-2.5 px-4">{employee}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.department || '—'}</td>
          <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.matchPercentage != null ? `${r.matchPercentage}%` : '—'}</td>
          <td className="py-2.5 px-4 font-mono text-slate-700 dark:text-slate-200">{r.verifiedAt || '—'}</td>
        </tr>
      );
    }
    // absent
    return (
      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
        <td className="py-2.5 px-4">{employee}</td>
        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.department || '—'}</td>
        <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{r.locationName || '—'}</td>
      </tr>
    );
  };

  const headers: string[] =
    type === 'headcount'
      ? ['Employee', 'Designation', 'Department', 'Location', 'Joining Date']
      : type === 'present' || type === 'late'
      ? ['Employee', 'Department', 'Status', 'Login', 'Logout', 'Worked', 'Late']
      : type === 'leave'
      ? ['Employee', 'Department', 'Leave Type', 'From', 'To', 'Reason']
      : type === 'face_verified'
      ? ['Employee', 'Department', 'Match', 'Verified At']
      : ['Employee', 'Department', 'Location'];

  return (
    <div className="fixed inset-0 z-[9998] flex justify-end">
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs" onClick={onClose} aria-hidden="true" />
      <div
        className="relative z-10 w-full max-w-3xl bg-white dark:bg-[#0e172a] shadow-2xl flex flex-col h-full border-l border-slate-200 dark:border-slate-800"
        role="dialog"
        aria-modal="true"
        aria-label={meta.title}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              {meta.icon}
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">{meta.title}</h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">{meta.subtitle}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 min-w-[200px] items-center gap-2 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-3 py-1.5 rounded-lg">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Filter records…"
              className="bg-transparent border-none text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none w-full"
            />
          </div>
          <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
            {loading ? 'Loading…' : `${filtered.length} of ${total} records`}
            {date ? ` • ${date}` : ''}
          </span>
          <button
            onClick={exportCsv}
            disabled={!filtered.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-bold transition-colors"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-5 space-y-3 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="h-10 bg-slate-100 dark:bg-slate-800 rounded-lg" />
              ))}
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="rounded-xl border border-rose-300 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 p-4 text-xs text-rose-900 dark:text-rose-200">
                <strong>Detail records could not be loaded.</strong> {error}
              </div>
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Search className="w-6 h-6 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-600 dark:text-slate-300">No records for this filter</p>
              <span className="text-[11px]">Nothing is shown rather than an example row.</span>
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold sticky top-0">
                <tr>
                  {headers.map((h) => (
                    <th key={h} className="py-2.5 px-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{pageRows.map(renderRow)}</tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && !error && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-200 dark:border-slate-800 text-xs">
            <span className="text-slate-500 dark:text-slate-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-500 dark:text-slate-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default KpiDetailsDrawer;
