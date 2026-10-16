'use client';

/**
 * Organization Management — Approval Queue
 *
 * Dedicated page for reviewing and deciding organization change requests.
 * Shows pending requests the current user can act on, with full detail view,
 * approve / reject / request-changes actions, and audit trail.
 *
 * Security: all actions are re-validated server-side. The frontend only
 * shows buttons the backend would accept, but never relies on that alone.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useOrganizationSocket } from '@/hooks/useOrganizationSocket';

/* --------------------------------------------------------------------------------
 * Types
 * -------------------------------------------------------------------------------- */

interface ChangeRequest {
  id: string;
  requestNo: string;
  requestType: string;
  action: string;
  title?: string;
  reason: string;
  status: string;
  currentStage: string;
  locationId?: string;
  locationName?: string;
  requestedById: string;
  requestedByName?: string;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
  appliedAt?: string;
  canDecide?: boolean;
  payload?: any;
  decisions?: Decision[];
}

interface Decision {
  id: string;
  stageSequence: number;
  stageName: string;
  status: string;
  remarks?: string;
  decidedAt?: string;
  reviewerName?: string;
  reviewerRole?: string;
}

/* --------------------------------------------------------------------------------
 * Helpers
 * -------------------------------------------------------------------------------- */

const STATUS_STYLES: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  PENDING: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  CHANGES_REQUESTED: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400',
  REJECTED: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
  APPLIED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
  CANCELLED: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
};

const TYPE_LABELS: Record<string, string> = {
  LOCATION: 'Location',
  FLOOR: 'Floor',
  DEPARTMENT: 'Department',
  SECTION: 'Section',
  WORK_AREA: 'Work Area',
  EMPLOYEE_ALLOCATION: 'Employee Allocation',
  EMPLOYEE_TRANSFER: 'Employee Transfer',
  MANAGER_ASSIGNMENT: 'Manager Assignment',
  ADMIN_ACCOUNT: 'Admin Account',
};

const STAGE_LABELS: Record<string, string> = {
  LOCATION_MANAGER: 'Location Manager',
  FLOOR_MANAGER: 'Floor Manager',
  DEPARTMENT_MANAGER: 'Department Manager',
  HR: 'HR Final Approval',
  EMERGENCY_OVERRIDE: 'Emergency Override',
};

const fmtDate = (d?: string) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* --------------------------------------------------------------------------------
 * Detail Drawer
 * -------------------------------------------------------------------------------- */

function RequestDetailDrawer({
  request,
  onClose,
  onDecide,
  deciding,
}: {
  request: ChangeRequest | null;
  onClose: () => void;
  onDecide: (id: string, decision: string, remarks: string) => void;
  deciding: boolean;
}) {
  const [remarks, setRemarks] = useState('');

  useEffect(() => { setRemarks(''); }, [request?.id]);

  if (!request) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end bg-black/30 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Request detail">
      {/* Backdrop */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white dark:bg-[#0e172a] w-full sm:w-[480px] h-full sm:h-auto sm:max-h-[90vh] sm:rounded-l-xl border-l border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{request.requestNo}</div>
            <h2 className="text-sm font-bold text-[#0b1c30] dark:text-white mt-0.5">
              {request.title || `${TYPE_LABELS[request.requestType] || request.requestType} — ${request.action}`}
            </h2>
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLES[request.status] || ''}`}>
                {request.status.replace('_', ' ')}
              </span>
              {request.currentStage && request.status === 'PENDING' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                  {STAGE_LABELS[request.currentStage] || request.currentStage}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0" aria-label="Close">
            <span className="material-symbols-outlined text-[18px] text-slate-400">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Meta */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400 dark:text-slate-500">Type</span>
              <div className="font-semibold text-[#0b1c30] dark:text-white mt-0.5">{TYPE_LABELS[request.requestType] || request.requestType}</div>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500">Action</span>
              <div className="font-semibold text-[#0b1c30] dark:text-white mt-0.5">{request.action}</div>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500">Requested by</span>
              <div className="font-semibold text-[#0b1c30] dark:text-white mt-0.5">{request.requestedByName || 'Unknown'}</div>
            </div>
            <div>
              <span className="text-slate-400 dark:text-slate-500">Date</span>
              <div className="font-semibold text-[#0b1c30] dark:text-white mt-0.5">{fmtDate(request.createdAt)}</div>
            </div>
          </div>

          {/* Reason */}
          {request.reason && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Reason</span>
              <p className="text-xs text-[#0b1c30] dark:text-white mt-1 leading-relaxed">{request.reason}</p>
            </div>
          )}

          {/* Payload */}
          {request.payload && Object.keys(request.payload).length > 0 && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Change Details</span>
              <div className="mt-1 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 p-3">
                {Object.entries(request.payload).map(([key, val]) => (
                  val ? (
                    <div key={key} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                      <span className="text-slate-500 dark:text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                      <span className="font-semibold text-[#0b1c30] dark:text-white text-right max-w-[60%] truncate">{String(val)}</span>
                    </div>
                  ) : null
                ))}
              </div>
            </div>
          )}

          {/* Decision timeline */}
          {request.decisions && request.decisions.length > 0 && (
            <div>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Review Timeline</span>
              <div className="mt-2 space-y-2">
                {request.decisions.map((d) => (
                  <div key={d.id} className="flex items-start gap-3 text-xs">
                    <span className={`mt-0.5 shrink-0 ${
                      d.status === 'APPROVED' ? 'text-emerald-500' :
                      d.status === 'REJECTED' ? 'text-rose-500' :
                      d.status === 'CHANGES_REQUESTED' ? 'text-orange-500' :
                      'text-slate-400'
                    }`}>
                      <span className="material-symbols-outlined text-[16px]">
                        {d.status === 'APPROVED' ? 'check_circle' : d.status === 'REJECTED' ? 'cancel' : d.status === 'CHANGES_REQUESTED' ? 'edit_note' : 'schedule'}
                      </span>
                    </span>
                    <div className="flex-1">
                      <div className="font-semibold text-[#0b1c30] dark:text-white">
                        {STAGE_LABELS[d.stageName] || d.stageName}
                        {d.reviewerName && <span className="font-normal text-slate-400"> — {d.reviewerName}</span>}
                      </div>
                      {d.remarks && <div className="text-slate-500 dark:text-slate-400 mt-0.5">{d.remarks}</div>}
                      {d.decidedAt && <div className="text-[10px] text-slate-400 mt-0.5">{fmtDate(d.decidedAt)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decision actions */}
          {request.status === 'PENDING' && request.canDecide && (
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                Remarks {request.currentStage === 'HR' ? '' : '(required for reject / request changes)'}
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
                placeholder="Add your review comments…"
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-[#0b1c30] dark:text-white placeholder-slate-400 focus:ring-2 focus:ring-[#1346a1] focus:border-transparent resize-none"
              />
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={() => onDecide(request.id, 'APPROVE', remarks)}
                  disabled={deciding}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">check</span>
                  Approve
                </button>
                <button
                  onClick={() => {
                    if (!remarks.trim()) { toast.error('Remarks are required for requesting changes'); return; }
                    onDecide(request.id, 'REQUEST_CHANGES', remarks);
                  }}
                  disabled={deciding}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">edit_note</span>
                  Request Changes
                </button>
                <button
                  onClick={() => {
                    if (!remarks.trim()) { toast.error('Remarks are required for rejection'); return; }
                    onDecide(request.id, 'REJECT', remarks);
                  }}
                  disabled={deciding}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/60 transition-colors disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">close</span>
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------------------------
 * Main page
 * -------------------------------------------------------------------------------- */

export default function OrganizationApprovalsPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRequest, setSelectedRequest] = useState<ChangeRequest | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);

  /* Filters */
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [typeFilter, setTypeFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [search, setSearch] = useState('');

  /* ---- fetch ---- */
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('requestType', typeFilter);
      if (stageFilter) params.set('stage', stageFilter);
      if (search) params.set('search', search);
      params.set('limit', '50');

      const res = await api.get(`/organization/approvals/requests?${params.toString()}`);
      setRequests(res.data?.data?.items ?? []);
      setLastSync(new Date());
    } catch (e: any) {
      console.error('Failed to load requests:', e);
      toast.error('Failed to load approval requests');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, stageFilter, search]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/organization/approvals/summary');
      setSummary(res.data?.data);
    } catch { /* non-critical */ }
  }, []);

  useEffect(() => { fetchRequests(); fetchSummary(); }, [fetchRequests, fetchSummary]);

  /* ---- socket live updates ---- */
  useOrganizationSocket({
    onChange: useCallback(() => { setLastSync(new Date()); fetchRequests(); fetchSummary(); }, [fetchRequests, fetchSummary]),
    enabled: true,
  });

  /* ---- decide ---- */
  const handleDecide = useCallback(async (id: string, decision: string, remarks: string) => {
    setDeciding(true);
    try {
      await api.post(`/organization/approvals/requests/${id}/decide`, { decision, remarks });
      toast.success(
        decision === 'APPROVE' ? 'Request approved' :
        decision === 'REJECT' ? 'Request rejected' :
        'Changes requested'
      );
      setSelectedRequest(null);
      fetchRequests();
      fetchSummary();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.error || 'Failed to process decision';
      toast.error(msg);
    } finally {
      setDeciding(false);
    }
  }, [fetchRequests, fetchSummary]);

  /* ---- filter chips ---- */
  const statusOptions = [
    { value: '', label: 'All' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'APPLIED', label: 'Applied' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'CHANGES_REQUESTED', label: 'Changes Requested' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  const typeOptions = Object.entries(TYPE_LABELS);

  const stageOptions = [
    { value: '', label: 'All Stages' },
    { value: 'LOCATION_MANAGER', label: 'Location Manager' },
    { value: 'FLOOR_MANAGER', label: 'Floor Manager' },
    { value: 'DEPARTMENT_MANAGER', label: 'Department Manager' },
    { value: 'HR', label: 'HR Final' },
  ];

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 dark:text-slate-500 text-[11px] uppercase tracking-wider font-bold">
              <span>Organization Management</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#1346a1] dark:text-[#E8DCC6]">Approval Queue</span>
            </div>
            <h1 className="text-2xl font-bold text-[#0b1c30] dark:text-white tracking-tight">
              Change Request Approvals
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-3xl">
              Review, approve, or reject organization change requests. All decisions are audited and applied transactionally.
            </p>
          </div>

          {/* Summary chips */}
          {summary && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-xs">
                <span className="font-bold text-amber-700 dark:text-amber-400">{summary.pendingForMe}</span>{' '}
                <span className="text-amber-600 dark:text-amber-500">Pending</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 text-xs">
                <span className="font-bold text-blue-700 dark:text-blue-400">{summary.awaitingHr}</span>{' '}
                <span className="text-blue-600 dark:text-blue-500">Awaiting HR</span>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">{summary.myRequests}</span>{' '}
                <span className="text-slate-500 dark:text-slate-400">My Requests</span>
              </div>
            </div>
          )}
        </div>

        {/* Last sync */}
        {lastSync && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            Last synchronized: {lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
        )}

        {/* Filters */}
        <div className="bg-white dark:bg-[#0e172a] p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          {/* Status chips */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-[#0b1c30] dark:text-white mr-1">Status:</span>
            {statusOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all border ${
                  statusFilter === opt.value
                    ? 'bg-[#1346a1] text-white border-[#1346a1]'
                    : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Type + stage + search row */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-[#0b1c30] dark:text-white"
            >
              <option value="">All Types</option>
              {typeOptions.map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>

            <select
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-[#0b1c30] dark:text-white"
            >
              {stageOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <div className="flex-1 min-w-[200px]">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by request number, title, or requester…"
                className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-[#0b1c30] dark:text-white placeholder-slate-400"
              />
            </div>

            <button
              onClick={fetchRequests}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">refresh</span>
              Refresh
            </button>
          </div>
        </div>

        {/* Requests table */}
        <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin h-6 w-6 border-2 border-[#1346a1]/30 border-t-[#1346a1] rounded-full mx-auto" />
              <p className="text-xs text-slate-400 mt-3">Loading requests…</p>
            </div>
          ) : requests.length === 0 ? (
            <div className="p-8 text-center">
              <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">inbox</span>
              <p className="text-sm text-slate-500 dark:text-slate-400">No change requests found matching your filters.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">Request</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">Type</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">Requested By</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">Stage</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">Status</th>
                    <th className="text-left px-4 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">Date</th>
                    <th className="text-right px-4 py-3 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((req) => (
                    <tr key={req.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-[#0b1c30] dark:text-white">{req.requestNo}</div>
                        {req.title && <div className="text-slate-400 dark:text-slate-500 mt-0.5 max-w-[200px] truncate">{req.title}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[#0b1c30] dark:text-white">{TYPE_LABELS[req.requestType] || req.requestType}</span>
                        <div className="text-slate-400 dark:text-slate-500 mt-0.5">{req.action}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{req.requestedByName || '—'}</td>
                      <td className="px-4 py-3">
                        {req.status === 'PENDING' ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                            {STAGE_LABELS[req.currentStage] || req.currentStage}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_STYLES[req.status] || ''}`}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{fmtDate(req.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setSelectedRequest(req)}
                          className="px-3 py-1 rounded-lg bg-[#1346a1]/10 text-[#1346a1] dark:bg-[#E8DCC6]/10 dark:text-[#E8DCC6] font-bold hover:bg-[#1346a1]/20 transition-colors text-[11px]"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Detail drawer */}
        <RequestDetailDrawer
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
          onDecide={handleDecide}
          deciding={deciding}
        />
      </div>
    </DashboardLayout>
  );
}
