'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import api from '@/lib/api';

import {
  mapCorrectionRow,
  correctionInputValue,
  correctionStampText,
  type CorrectionRecord,
  type CorrectionStatus,
} from '@/lib/correctionRecords';

/**
 * Punch Corrections & Attendance Regularization.
 *
 * The queue is the server's attendancecorrection table and nothing else
 * (GET /attendance/corrections). Every name, code, store, department, date and
 * punch rendered here comes from that response; a value the API does not return
 * shows as 'Not recorded' instead of a plausible stand-in.
 */

interface EditFormState {
  id: string;
  employeeName: string;
  empCode: string;
  hub: string;
  attendanceDate: string;
  requestedLogin: string;
  requestedLogout: string;
  reason: string;
  status: CorrectionStatus;
  reviewNote: string;
}

interface NewRequestState {
  employeeId: string;
  attendanceDate: string;
  requestedLogin: string;
  requestedLogout: string;
  reason: string;
}

const EMPTY_EDIT_FORM: EditFormState = {
  id: '',
  employeeName: '',
  empCode: '',
  hub: '',
  attendanceDate: '',
  requestedLogin: '',
  requestedLogout: '',
  reason: '',
  status: 'PENDING',
  reviewNote: '',
};

const EMPTY_NEW_REQUEST: NewRequestState = {
  employeeId: '',
  attendanceDate: new Date().toISOString().slice(0, 10),
  requestedLogin: '',
  requestedLogout: '',
  reason: '',
};

const statusPillClass = (status: CorrectionStatus) =>
  status === 'APPROVED'
    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
    : status === 'REJECTED'
    ? 'bg-rose-100 text-rose-800 border border-rose-200'
    : 'bg-blue-50 text-[#1346a1] border border-blue-200';

const TAB_KEYS = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const;

const tabLabel = (key: (typeof TAB_KEYS)[number]) =>
  key === 'ALL' ? 'All Requests' : key.charAt(0) + key.slice(1).toLowerCase();

export default function AttendanceCorrectionsPage() {
  const [records, setRecords] = useState<CorrectionRecord[]>([]);
  const [rawRowsById, setRawRowsById] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'ALL' | CorrectionStatus>('ALL');
  const [hubFilter, setHubFilter] = useState('ALL');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState('');

  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [staffOptions, setStaffOptions] = useState<Array<{ id: string; code: string; name: string }>>([]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState>(EMPTY_EDIT_FORM);
  const [newRequest, setNewRequest] = useState<NewRequestState>(EMPTY_NEW_REQUEST);
  const [busyId, setBusyId] = useState<string | null>(null);

  /** The queue itself: GET /attendance/corrections, mapped field for field. */
  const fetchCorrections = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/corrections');
      const rows: any[] = res.data?.corrections || [];
      const mapped = rows.map((row) => mapCorrectionRow(row));
      const raw: Record<string, any> = {};
      rows.forEach((row) => {
        if (row?.id) raw[String(row.id)] = row;
      });
      setRecords(mapped);
      setRawRowsById(raw);
      setLoadError(null);
      setLastLoadedAt(new Date().toLocaleString('en-IN', { hour12: true }));
      setSelectedRecordId((prev) => (mapped.some((m) => m.id === prev) ? prev : mapped[0]?.id || ''));
    } catch (err: any) {
      setRecords([]);
      setRawRowsById({});
      setLoadError(
        err?.response?.data?.error ||
          err?.response?.data?.message ||
          'Could not load the punch correction queue from the server.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  /** Real store hubs, departments and employee options behind the filters and forms. */
  const fetchFilterOptions = useCallback(async () => {
    try {
      const res = await api.get('/locations/all');
      setLocations(Array.isArray(res.data) ? res.data : []);
    } catch {
      setLocations([]);
    }
    try {
      const res = await api.get('/departments');
      setDepartments(res.data?.departments || []);
    } catch {
      setDepartments([]);
    }
    try {
      const res = await api.get('/employees/lookup');
      const list: any[] = Array.isArray(res.data) ? res.data : res.data?.employees || [];
      setStaffOptions(
        list
          .filter((e) => e && e.id)
          .map((e) => ({ id: String(e.id), code: String(e.employeeCode || ''), name: String(e.fullName || '') }))
      );
    } catch {
      setStaffOptions([]);
    }
  }, []);

  useEffect(() => {
    fetchCorrections();
    fetchFilterOptions();
  }, [fetchCorrections, fetchFilterOptions]);

  const counts = useMemo(() => {
    const byStatus: Record<CorrectionStatus, number> = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    for (const r of records) byStatus[r.status] += 1;
    return byStatus;
  }, [records]);

  /** Average hours from request to approval, over the loaded rows that carry both stamps. */
  const resolution = useMemo(() => {
    let total = 0;
    let sampleSize = 0;
    for (const r of records) {
      const applied = rawRowsById[r.id]?.appliedAt;
      if (!applied || !r.createdAt) continue;
      const from = new Date(r.createdAt).getTime();
      const to = new Date(applied).getTime();
      if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) continue;
      total += (to - from) / 3600000;
      sampleSize += 1;
    }
    return sampleSize > 0 ? { avg: total / sampleSize, sampleSize } : null;
  }, [records, rawRowsById]);

  const filteredRecords = useMemo(
    () =>
      records.filter((r) => {
        const matchesTab = activeTab === 'ALL' || r.status === activeTab;
        const matchesHub = hubFilter === 'ALL' || r.hub === hubFilter;
        const matchesDept = deptFilter === 'ALL' || r.dept === deptFilter;
        const q = searchQuery.trim().toLowerCase();
        const matchesSearch =
          q === '' ||
          r.name.toLowerCase().includes(q) ||
          r.empCode.toLowerCase().includes(q) ||
          r.dept.toLowerCase().includes(q) ||
          r.hub.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q);
        return matchesTab && matchesHub && matchesDept && matchesSearch;
      }),
    [records, activeTab, hubFilter, deptFilter, searchQuery]
  );

  const selectedRecord = useMemo(
    () => records.find((r) => r.id === selectedRecordId) || filteredRecords[0] || records[0] || null,
    [records, filteredRecords, selectedRecordId]
  );

  const approveOne = useCallback(async (id: string) => {
    await api.post(`/attendance/corrections/${id}/approve`, { reviewNote: 'Approved via HRMS console' });
  }, []);

  const handleApprove = async (id: string) => {
    setBusyId(id);
    try {
      await approveOne(id);
      toast.success(`Correction ${id} approved and the attendance row regularized.`);
      await fetchCorrections();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'The server rejected the approval.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/attendance/corrections/${id}/reject`, { reviewNote: 'Rejected per policy' });
      toast.success(`Correction ${id} rejected.`);
      await fetchCorrections();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'The server rejected the refusal.');
    } finally {
      setBusyId(null);
    }
  };

  const handleBatchApprovePending = async () => {
    const pending = records.filter((r) => r.status === 'PENDING');
    if (pending.length === 0) {
      toast('There are no pending requests in the loaded queue.');
      return;
    }
    setBusyId('batch');
    let ok = 0;
    let failed = 0;
    for (const r of pending) {
      try {
        await approveOne(r.id);
        ok += 1;
      } catch {
        failed += 1;
      }
    }
    toast.success(`${ok} of ${pending.length} request(s) approved${failed ? `, ${failed} rejected by the server` : ''}.`);
    await fetchCorrections();
    setBusyId(null);
  };

  const handleOpenEdit = (record: CorrectionRecord) => {
    const raw = rawRowsById[record.id] || {};
    setEditForm({
      id: record.id,
      employeeName: record.name,
      empCode: record.empCode,
      hub: record.hub,
      attendanceDate: record.attendanceDate,
      requestedLogin: correctionInputValue(raw.requestedLogin),
      requestedLogout: correctionInputValue(raw.requestedLogout),
      reason: record.reason,
      status: record.status,
      reviewNote: record.reviewNote,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editForm.id) {
      toast.error('No correction request is selected.');
      return;
    }
    if (!editForm.reason.trim()) {
      toast.error('The justification is mandatory.');
      return;
    }
    try {
      await api.put(`/attendance/corrections/${editForm.id}`, {
        requestedLogin: editForm.requestedLogin ? new Date(editForm.requestedLogin).toISOString() : null,
        requestedLogout: editForm.requestedLogout ? new Date(editForm.requestedLogout).toISOString() : null,
        reason: editForm.reason.trim(),
        status: editForm.status,
        reviewNote: editForm.reviewNote.trim() || null,
      });
      setIsEditModalOpen(false);
      toast.success(`Correction ${editForm.id} updated on the server.`);
      await fetchCorrections();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'The server rejected the update.');
    }
  };

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.employeeId) {
      toast.error('Select the employee this correction belongs to.');
      return;
    }
    if (!newRequest.reason.trim()) {
      toast.error('A reason for the punch correction is mandatory.');
      return;
    }
    try {
      await api.post('/attendance/corrections', {
        employeeId: newRequest.employeeId,
        attendanceDate: newRequest.attendanceDate,
        requestedLogin: newRequest.requestedLogin ? new Date(newRequest.requestedLogin).toISOString() : null,
        requestedLogout: newRequest.requestedLogout ? new Date(newRequest.requestedLogout).toISOString() : null,
        reason: newRequest.reason.trim(),
      });
      setIsModalOpen(false);
      setNewRequest({ ...EMPTY_NEW_REQUEST, attendanceDate: new Date().toISOString().slice(0, 10) });
      toast.success('Correction request submitted to the queue.');
      await fetchCorrections();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'The server rejected the request.');
    }
  };

  /** Downloads the rows actually loaded from GET /attendance/corrections. */
  const handleExportCSV = () => {
    if (records.length === 0) {
      toast.error('No correction requests loaded, so there is nothing to export.');
      return;
    }
    const header =
      'Request ID,Employee Code,Employee Name,Designation,Department,Store Hub,Attendance Date,Recorded IN,Recorded OUT,Requested IN,Requested OUT,Status,Reason,Review Note,Applied At,Requested At\n';
    const esc = (val: unknown) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const body = records
      .map((r) =>
        [
          r.id,
          r.empCode,
          r.name,
          r.role,
          r.dept,
          r.hub,
          r.attendanceDate,
          r.originalLogin || '',
          r.originalLogout || '',
          r.requestedLogin || '',
          r.requestedLogout || '',
          r.status,
          r.reason,
          r.reviewNote,
          r.appliedAt || '',
          correctionStampText(rawRowsById[r.id]?.createdAt) || '',
        ]
          .map(esc)
          .join(',')
      )
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BSC_Punch_Corrections_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    toast.success(`Exported ${records.length} correction request(s) to CSV.`);
  };

  const hubNames = useMemo(() => Array.from(new Set(records.map((r) => r.hub).filter(Boolean))), [records]);
  const deptNames = useMemo(() => Array.from(new Set(records.map((r) => r.dept).filter(Boolean))), [records]);
  const hubOptions = locations.length ? locations.map((l) => l.name).filter(Boolean) : hubNames;
  const deptOptions = departments.length ? departments.map((d) => d.name).filter(Boolean) : deptNames;

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-6 pb-12">
        {/* TOP BREADCRUMB & CONTEXT HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold tracking-wider uppercase">
              <span>Time &amp; Attendance</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">chevron_right</span>
              <span className="text-[#1346a1] font-bold">Punch Corrections &amp; Regularization Ledger</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-0.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Punch Corrections &amp; Attendance Regularization
              </h1>
              <div className="inline-flex items-center gap-1.5 text-slate-600 text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/60 font-medium">
                <span className="material-symbols-outlined text-[15px] text-[#1346a1]">verified_user</span>
                Karnataka Factories Act Form T
              </div>
              <div className="inline-flex items-center gap-1.5 text-slate-600 text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/60 font-medium">
                <span className="material-symbols-outlined text-[15px] text-[#1346a1]">sync</span>
                {lastLoadedAt ? `Queue loaded ${lastLoadedAt}` : 'Queue not loaded yet'}
              </div>
            </div>
          </div>

          {/* SCREEN ACTION SUITE */}
          <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 hover:bg-slate-50 transition-colors rounded-xl text-xs font-semibold shadow-xs border border-slate-200"
              type="button"
              title="Download the loaded correction requests as a CSV file"
            >
              <span className="material-symbols-outlined text-[17px] text-slate-500">file_download</span>
              Export Queue (CSV)
            </button>
            <button
              onClick={handleBatchApprovePending}
              disabled={busyId !== null || counts.PENDING === 0}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-white text-slate-700 hover:bg-slate-50 transition-colors rounded-xl text-xs font-semibold shadow-xs border border-slate-200 disabled:opacity-50"
              type="button"
            >
              <span className="material-symbols-outlined text-[17px] text-[#1346a1]">checklist_rtl</span>
              Approve {counts.PENDING} Pending
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#1346a1] text-white hover:bg-[#0e3882] transition-colors rounded-xl text-xs font-bold shadow-xs active:scale-95"
              type="button"
            >
              <span className="material-symbols-outlined text-[17px]">add_circle</span>
              Request Manual Correction
            </button>
          </div>
        </div>

        {/* QUEUE METRICS — every figure counted from the loaded rows */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#1346a1]">
                <span className="material-symbols-outlined text-[20px]">assignment</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-100">Server queue</span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Requests Loaded
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tracking-tight">{records.length}</span>
                <span className="text-xs font-semibold text-slate-500">Rows</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
              GET /attendance/corrections keeps the latest 100
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                <span className="material-symbols-outlined text-[20px]">pending_actions</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                Action Required
              </span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Pending Regularizations
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tracking-tight">{counts.PENDING}</span>
                <span className="text-xs font-semibold text-slate-500">Requests</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
              status = PENDING in attendancecorrection
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-100">Loaded rows</span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Approved</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-700 tracking-tight">{counts.APPROVED}</span>
                <span className="text-xs font-semibold text-slate-500">Written back to attendance</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
              Approval applies the requested punches
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
                <span className="material-symbols-outlined text-[20px]">block</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-100">Loaded rows</span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">Rejected</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-rose-600 tracking-tight">{counts.REJECTED}</span>
                <span className="text-xs font-semibold text-slate-500">Declined requests</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">Each keeps its review note</div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                <span className="material-symbols-outlined text-[20px]">speed</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-100">
                Sample: {resolution ? resolution.sampleSize : 0}
              </span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Avg Time To Approval
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {resolution ? resolution.avg.toFixed(1) : '—'}
                </span>
                <span className="text-xs font-semibold text-slate-500">{resolution ? 'Hours' : 'No approved rows'}</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
              createdAt → appliedAt of the loaded requests
            </div>
          </div>
        </div>

        {/* STATUS TABS & FILTERS */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/90 flex flex-col gap-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {TAB_KEYS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                  activeTab === tab
                    ? 'bg-[#F8F4F1] text-[#1346a1] font-bold border border-[#E5D5D7]'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span>{tabLabel(tab)}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === tab ? 'bg-[#1346a1] text-white' : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab === 'ALL' ? records.length : counts[tab]}
                </span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-1 border-t border-slate-100">
            <div className="md:col-span-4 relative flex items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
              <span className="material-symbols-outlined text-[18px] text-slate-400 mr-2 shrink-0">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                placeholder="Search employee name, code, store, request ID or reason..."
                type="text"
              />
            </div>

            <div className="md:col-span-4 relative flex items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
              <span className="material-symbols-outlined text-[16px] text-[#1346a1] mr-2 shrink-0">store</span>
              <select
                value={hubFilter}
                onChange={(e) => setHubFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All store hubs</option>
                {hubOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="md:col-span-4 relative flex items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
              <span className="material-symbols-outlined text-[16px] text-slate-500 mr-2 shrink-0">category</span>
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer truncate"
              >
                <option value="ALL">All departments</option>
                {deptOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {loadError && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">error</span>
              {loadError}
            </span>
            <button
              type="button"
              onClick={fetchCorrections}
              className="px-3 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-bold"
            >
              Retry
            </button>
          </div>
        )}

        {/* MAIN WORK SURFACE: LEDGER & INSPECTOR */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 2xl:col-span-8 min-w-0 flex flex-col gap-6">
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden flex flex-col">
              <div className="px-5 py-3.5 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900">Regularization Request Ledger</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1346a1] text-[11px] font-semibold border border-blue-200">
                    {counts.PENDING} Awaiting Review
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#1346a1]"></span> PENDING
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span> APPROVED
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span> REJECTED
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs whitespace-normal min-w-[720px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-bold">Staff &amp; Unit</th>
                      <th className="py-3 px-4 font-bold">Attendance Date &amp; Recorded Punches</th>
                      <th className="py-3 px-4 font-bold">Requested Regularization</th>
                      <th className="py-3 px-4 font-bold">Justification &amp; Review</th>
                      <th className="py-3 px-4 font-bold text-center">Status</th>
                      <th className="py-3 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading && records.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Loading the correction queue…
                        </td>
                      </tr>
                    ) : filteredRecords.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          <p className="font-semibold text-slate-600">
                            {records.length === 0 ? 'No punch correction requests exist' : 'No correction requests match these filters'}
                          </p>
                          <p className="text-[11px] mt-1">
                            {records.length === 0
                              ? 'The attendancecorrection table returned no rows for your scope.'
                              : 'Try adjusting the store hub, department, status or search filter.'}
                          </p>
                        </td>
                      </tr>
                    ) : (
                      filteredRecords.map((r) => {
                        const isSelected = r.id === selectedRecord?.id;
                        return (
                          <tr
                            key={r.id}
                            onClick={() => setSelectedRecordId(r.id)}
                            className={`cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50/60 border-l-4 border-l-[#1346a1]' : 'hover:bg-slate-50/70'
                            }`}
                          >
                            <td className="py-3 px-4 align-top">
                              <div className="flex items-start gap-2.5">
                                <div className="w-8 h-8 rounded-full bg-[#1346a1] text-white flex items-center justify-center font-bold text-[10px] shrink-0">
                                  {(r.name || '?').slice(0, 1).toUpperCase()}
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="font-bold text-slate-900 truncate">
                                    {r.name || 'Employee not returned by the API'}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">{r.empCode || 'No employee code'}</span>
                                  <span className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-[#1346a1] bg-[#F8F4F1] border border-[#E5D5D7] w-max truncate">
                                    {r.hub || 'Store not recorded'}
                                    {r.dept ? ` • ${r.dept}` : ''}
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-800">{r.attendanceDate || 'Date not recorded'}</span>
                                <div className="flex items-center gap-1 text-slate-500 mt-0.5">
                                  <span className="font-mono text-slate-900">{r.originalLogin || 'No IN punch'}</span>
                                  <span>•</span>
                                  <span className="px-1 py-0.2 rounded bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                                    {r.originalLogout || 'No OUT punch'}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 mt-0.5">Designation: {r.role || 'Not recorded'}</span>
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top">
                              <div className="flex flex-col">
                                <span className="font-mono font-bold text-[#1346a1]">
                                  {r.requestedLogin || '—'} → {r.requestedLogout || '—'}
                                </span>
                                <span className="text-[10px] text-slate-500 mt-0.5">Requested IN / OUT on this row</span>
                                <span className="text-[10px] text-slate-400 mt-0.5">
                                  {r.appliedAt ? `Applied ${r.appliedAt}` : 'Not applied yet'}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top max-w-[220px]">
                              <div className="flex flex-col">
                                <span className="text-slate-800 font-medium" title={r.reason}>
                                  {r.reason || 'No reason stored on the request'}
                                </span>
                                <span className="text-[11px] text-slate-500 mt-0.5">
                                  Review note: {r.reviewNote || 'None recorded'}
                                </span>
                              </div>
                            </td>

                            <td className="py-3 px-4 align-top text-center">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusPillClass(r.status)}`}>
                                {r.status}
                              </span>
                            </td>

                            <td className="py-3 px-4 align-top text-right">
                              <div className="flex items-center justify-end gap-1">
                                {r.status === 'PENDING' && (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleApprove(r.id);
                                      }}
                                      disabled={busyId !== null}
                                      className="p-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
                                      title="Approve this request"
                                      type="button"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">check</span>
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleReject(r.id);
                                      }}
                                      disabled={busyId !== null}
                                      className="p-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors disabled:opacity-50"
                                      title="Reject this request"
                                      type="button"
                                    >
                                      <span className="material-symbols-outlined text-[16px]">close</span>
                                    </button>
                                  </>
                                )}

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenEdit(r);
                                  }}
                                  className="p-1 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 transition-colors"
                                  title="Edit requested punches, reason, status and review note"
                                  type="button"
                                >
                                  <span className="material-symbols-outlined text-[16px]">edit</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedRecordId(r.id);
                                  }}
                                  className="p-1 rounded-lg bg-blue-50 text-[#1346a1] hover:bg-blue-100 transition-colors"
                                  title="Inspect request"
                                  type="button"
                                >
                                  <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100">
                <span>
                  Showing <strong>{filteredRecords.length}</strong> of <strong>{records.length}</strong> regularization requests
                </span>
                <button
                  type="button"
                  onClick={fetchCorrections}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  <span className={`material-symbols-outlined text-[15px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
                  Reload queue
                </button>
              </div>
            </div>

            {/* QUEUE SHAPE — counted from the loaded rows only */}
            <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1346a1] text-[20px]">find_in_page</span>
                  <span className="text-xs font-bold text-slate-900">Loaded Requests by Store Hub</span>
                </div>
                <span className="font-mono text-[10px] text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                  {records.length} row(s)
                </span>
              </div>
              {hubNames.length === 0 ? (
                <p className="text-xs text-slate-400">No correction requests are loaded, so there is nothing to break down yet.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {hubNames.map((hub) => {
                    const inHub = records.filter((r) => r.hub === hub);
                    return (
                      <div key={hub} className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col">
                        <div className="flex items-center justify-between font-bold mb-1">
                          <span className="text-slate-800 truncate">{hub}</span>
                          <span className="text-[#1346a1]">{inHub.length}</span>
                        </div>
                        <span className="text-slate-500 text-[11px]">
                          {inHub.filter((r) => r.status === 'PENDING').length} pending •{' '}
                          {inHub.filter((r) => r.status === 'APPROVED').length} approved •{' '}
                          {inHub.filter((r) => r.status === 'REJECTED').length} rejected
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: SELECTED REQUEST INSPECTOR */}
          <div className="xl:col-span-5 2xl:col-span-4 min-w-0 flex flex-col gap-6 xl:sticky xl:top-6">
            {selectedRecord ? (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-5 flex flex-col gap-4">
                <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#1346a1] text-white flex items-center justify-center font-bold text-base shadow-xs">
                      {(selectedRecord.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">
                        {selectedRecord.name || 'Employee not returned by the API'}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {selectedRecord.empCode || 'No code'} • {selectedRecord.role || 'Designation not recorded'}
                      </span>
                      <span className="text-[11px] text-slate-400 mt-0.5">
                        {selectedRecord.hub || 'Store not recorded'}
                        {selectedRecord.dept ? ` • ${selectedRecord.dept}` : ''}
                      </span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#1346a1] text-xs font-bold border border-blue-200">
                    {selectedRecord.id}
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 flex flex-col gap-3">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Punch Comparison</span>

                  <div className="p-3 rounded-xl bg-white flex items-center justify-between border border-slate-200/60">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Recorded Punches</span>
                      <span className="font-mono text-xs text-slate-800 font-bold mt-0.5">
                        {selectedRecord.originalLogin || 'No IN'} →{' '}
                        <span className="text-rose-600 font-bold">{selectedRecord.originalLogout || 'No OUT'}</span>
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      {selectedRecord.attendanceDate || 'Date not recorded'}
                    </span>
                  </div>

                  <div className="p-3 rounded-xl bg-[#F8F4F1] flex items-center justify-between border border-[#E5D5D7]">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-[#1346a1] uppercase">Requested Regularization</span>
                      <span className="font-mono text-xs text-slate-900 font-bold mt-0.5">
                        {selectedRecord.requestedLogin || '—'} → {selectedRecord.requestedLogout || '—'}
                      </span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusPillClass(selectedRecord.status)}`}>
                      {selectedRecord.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                    <div className="flex flex-col p-2.5 bg-white rounded-lg border border-slate-200/60">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Applied At</span>
                      <span className="text-sm font-bold text-slate-900 mt-0.5">{selectedRecord.appliedAt || 'Not applied yet'}</span>
                    </div>
                    <div className="flex flex-col p-2.5 bg-white rounded-lg border border-slate-200/60">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Reviewed By</span>
                      <span className="text-sm font-bold text-slate-900 mt-0.5 break-all">
                        {selectedRecord.reviewedById || 'No reviewer recorded'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Shift timing, terminal ID, overtime hours and payroll impact are not returned by
                    /attendance/corrections, so they are not shown here.
                  </p>
                </div>

                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Justification &amp; Review Note
                  </span>
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col gap-1.5">
                    <p className="text-xs text-slate-700 italic leading-relaxed">
                      &ldquo;{selectedRecord.reason || 'No justification stored on this request.'}&rdquo;
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px] text-slate-500 gap-2">
                      <span className="font-bold text-slate-800 truncate">
                        Note: {selectedRecord.reviewNote || 'None recorded'}
                      </span>
                      <span className="font-mono shrink-0">
                        {correctionStampText(rawRowsById[selectedRecord.id]?.createdAt) || 'Requested date unavailable'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                  {selectedRecord.status === 'PENDING' ? (
                    <>
                      <button
                        onClick={() => handleApprove(selectedRecord.id)}
                        disabled={busyId !== null}
                        className="w-full py-2.5 px-4 rounded-xl bg-[#1346a1] text-white hover:bg-[#0e3882] transition-colors text-xs font-bold flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[18px]">verified</span>
                        Approve &amp; Regularize Attendance
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => handleOpenEdit(selectedRecord)}
                          className="py-2 px-3 rounded-xl bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors text-xs font-bold flex items-center justify-center gap-1.5 border border-amber-200"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[16px]">edit</span>
                          Edit Request
                        </button>
                        <button
                          onClick={() => handleReject(selectedRecord.id)}
                          disabled={busyId !== null}
                          className="py-2 px-3 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors text-xs font-semibold flex items-center justify-center gap-1 border border-rose-200 disabled:opacity-60"
                          type="button"
                        >
                          <span className="material-symbols-outlined text-[16px]">cancel</span>
                          Reject
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-200">
                        <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
                        {selectedRecord.appliedAt
                          ? `Resolved ${selectedRecord.appliedAt}`
                          : `Closed as ${selectedRecord.status}`}
                      </div>
                      <button
                        onClick={() => handleOpenEdit(selectedRecord)}
                        className="py-2 px-3 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-200"
                        type="button"
                      >
                        <span className="material-symbols-outlined text-[16px]">edit</span>
                        Edit Regularization Details
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-6 text-center text-xs text-slate-400">
                <span className="material-symbols-outlined text-[28px] text-slate-300">receipt_long</span>
                <p className="font-semibold text-slate-600 mt-2">No request selected</p>
                <p className="mt-1">{loading ? 'Loading the correction queue…' : 'No rows were returned for your scope.'}</p>
              </div>
            )}

            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-[#1346a1]">
                  <span className="material-symbols-outlined text-[18px]">gavel</span>
                </div>
                <span className="text-xs font-bold text-slate-900">Karnataka Statutory Compliance</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-900">Section 62 - Register of Adult Workers:</strong> every manual attendance
                adjustment keeps its reason, reviewer and applied timestamp on the request row, and writes to the attendance
                record only when the request is approved.
              </p>
            </div>
          </div>
        </div>

        {/* EDIT REGULARIZATION MODAL */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
                    <span className="material-symbols-outlined text-[22px]">edit_calendar</span>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900">Edit Punch Regularization Request</h3>
                    <p className="text-[11px] text-slate-500">
                      Saves requested punches, reason, status and review note through PUT /attendance/corrections/:id
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100"
                  type="button"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleSaveEditSubmit} className="space-y-3.5 text-xs">
                <div className="p-3 bg-[#F8F4F1] border border-[#E5D5D7] rounded-xl">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900 text-sm">{editForm.employeeName || 'Employee'}</span>
                    <span className="px-1.5 py-0.2 rounded font-mono text-[10px] font-bold bg-[#1346a1] text-white">
                      {editForm.empCode || 'No code'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {editForm.hub || 'Store not recorded'} • Attendance date {editForm.attendanceDate || 'not recorded'} •
                    Request {editForm.id}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="space-y-2">
                    <span className="font-bold text-[#1346a1] uppercase tracking-wider text-[10px] block">
                      Requested Punches
                    </span>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-0.5" htmlFor="corr-edit-in">
                        Requested IN
                      </label>
                      <input
                        id="corr-edit-in"
                        type="datetime-local"
                        value={editForm.requestedLogin}
                        onChange={(e) => setEditForm({ ...editForm, requestedLogin: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-[#1346a1]"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-0.5" htmlFor="corr-edit-out">
                        Requested OUT
                      </label>
                      <input
                        id="corr-edit-out"
                        type="datetime-local"
                        value={editForm.requestedLogout}
                        onChange={(e) => setEditForm({ ...editForm, requestedLogout: e.target.value })}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-[#1346a1]"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px] block">
                      Recorded Punches (read-only)
                    </span>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-0.5">Original IN</label>
                      <div className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700">
                        {correctionInputValue(rawRowsById[editForm.id]?.originalLogin) || 'Not recorded'}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-500 block mb-0.5">Original OUT</label>
                      <div className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono text-slate-700">
                        {correctionInputValue(rawRowsById[editForm.id]?.originalLogout) || 'Not recorded'}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1" htmlFor="corr-edit-status">
                      Status
                    </label>
                    <select
                      id="corr-edit-status"
                      value={editForm.status}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value as CorrectionStatus })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none"
                    >
                      <option value="PENDING">PENDING (awaiting review)</option>
                      <option value="APPROVED">APPROVED (regularize punches)</option>
                      <option value="REJECTED">REJECTED (decline request)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1" htmlFor="corr-edit-review">
                      Review Note
                    </label>
                    <input
                      id="corr-edit-review"
                      type="text"
                      value={editForm.reviewNote}
                      onChange={(e) => setEditForm({ ...editForm, reviewNote: e.target.value })}
                      placeholder="Stored in the reviewNote column"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1" htmlFor="corr-edit-reason">
                    Operational Justification / Reason
                  </label>
                  <textarea
                    id="corr-edit-reason"
                    rows={2}
                    required
                    value={editForm.reason}
                    onChange={(e) => setEditForm({ ...editForm, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#1346a1] text-white hover:bg-[#0e3882] rounded-xl font-bold flex items-center gap-1.5 shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    Save Regularization Changes
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* NEW CORRECTION REQUEST MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1346a1]">add_circle</span>
                  <h3 className="text-base font-bold text-slate-900">Request Manual Correction</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700" type="button">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateRequest} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="corr-new-emp">
                    Employee (real roster from GET /employees/lookup)
                  </label>
                  <select
                    id="corr-new-emp"
                    required
                    value={newRequest.employeeId}
                    onChange={(e) => setNewRequest({ ...newRequest, employeeId: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  >
                    <option value="">
                      {staffOptions.length === 0 ? 'No employees loaded for your scope' : 'Select an employee'}
                    </option>
                    {staffOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                        {s.code ? ` (${s.code})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="corr-new-date">
                    Attendance Date
                  </label>
                  <input
                    id="corr-new-date"
                    type="date"
                    required
                    value={newRequest.attendanceDate}
                    onChange={(e) => setNewRequest({ ...newRequest, attendanceDate: e.target.value })}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="corr-new-in">
                      Requested IN Punch
                    </label>
                    <input
                      id="corr-new-in"
                      type="datetime-local"
                      value={newRequest.requestedLogin}
                      onChange={(e) => setNewRequest({ ...newRequest, requestedLogin: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="corr-new-out">
                      Requested OUT Punch
                    </label>
                    <input
                      id="corr-new-out"
                      type="datetime-local"
                      value={newRequest.requestedLogout}
                      onChange={(e) => setNewRequest({ ...newRequest, requestedLogout: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1" htmlFor="corr-new-reason">
                    Operational Justification / Reason
                  </label>
                  <textarea
                    id="corr-new-reason"
                    rows={3}
                    required
                    value={newRequest.reason}
                    onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                    placeholder="Explain the missing or incorrect punch for this attendance date..."
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs bg-[#1346a1] text-white hover:bg-[#0e3882] rounded-xl transition-colors font-bold shadow-xs"
                  >
                    Submit Correction Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
