'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function LeavesManagementPage() {
  const [types, setTypes] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [limit] = useState(10);

  // Modals
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Apply Form
  const [applyForm, setApplyForm] = useState({
    leaveTypeId: '',
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    isHalfDay: false,
    halfDaySession: 'FIRST_HALF',
    reason: '',
  });

  // Load Leave Types & Balances
  const fetchMetadata = useCallback(async () => {
    try {
      const [typeRes, balRes] = await Promise.all([
        api.get('/leaves/types').catch(() => ({ data: [] })),
        api.get('/leaves/balances').catch(() => ({ data: [] })),
      ]);
      setTypes(typeRes.data || []);
      setBalances(balRes.data || []);
      if (typeRes.data && typeRes.data.length > 0 && !applyForm.leaveTypeId) {
        setApplyForm((prev) => ({ ...prev, leaveTypeId: typeRes.data[0].id }));
      }
    } catch (e) {
      console.error('Failed to load leave metadata:', e);
    }
  }, [applyForm.leaveTypeId]);

  // Load Applications
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (statusFilter !== 'ALL') params.status = statusFilter;
      const res = await api.get('/leaves/applications', { params });
      setApplications(res.data?.applications || []);
      setTotalCount(res.data?.pagination?.total || (res.data?.applications || []).length);
    } catch (e) {
      console.error('Failed to load applications:', e);
      toast.error('Could not load leave applications');
    } finally {
      setLoading(false);
    }
  }, [page, limit, statusFilter]);

  useEffect(() => {
    fetchMetadata();
  }, [fetchMetadata]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  // Apply Action
  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyForm.leaveTypeId) {
      toast.error('Please select a leave category');
      return;
    }
    if (!applyForm.reason.trim()) {
      toast.error('Please provide a reason for the leave');
      return;
    }

    try {
      await api.post('/leaves/apply', applyForm);
      toast.success('Leave application submitted successfully for approval!');
      setIsApplyModalOpen(false);
      setApplyForm({
        leaveTypeId: types[0]?.id || '',
        startDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        isHalfDay: false,
        halfDaySession: 'FIRST_HALF',
        reason: '',
      });
      fetchMetadata();
      fetchApplications();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to submit leave application');
    }
  };

  // Approve Action
  const handleApprove = async (id: string) => {
    try {
      await api.post(`/leaves/applications/${id}/approve`);
      toast.success('Leave request approved and balance deducted!');
      fetchMetadata();
      fetchApplications();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to approve leave request');
    }
  };

  // Reject Action
  const handleRejectConfirm = async () => {
    if (!selectedAppId) return;
    if (!rejectReason.trim()) {
      toast.error('A rejection reason is mandatory');
      return;
    }

    try {
      await api.post(`/leaves/applications/${selectedAppId}/reject`, { reason: rejectReason });
      toast.success('Leave request rejected with documented remarks.');
      setIsRejectModalOpen(false);
      setRejectReason('');
      setSelectedAppId(null);
      fetchMetadata();
      fetchApplications();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to reject request');
    }
  };

  // Cancel Action
  const handleCancel = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this pending leave request?')) return;
    try {
      await api.post(`/leaves/applications/${id}/cancel`);
      toast.success('Leave request cancelled');
      fetchMetadata();
      fetchApplications();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to cancel request');
    }
  };

  // Filter local applications by search query & type filter
  const filteredApplications = applications.filter((app) => {
    const matchesSearch =
      !search ||
      app.employee_name?.toLowerCase().includes(search.toLowerCase()) ||
      app.employee_code?.toLowerCase().includes(search.toLowerCase()) ||
      app.reason?.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'ALL' || app.leave_type_code === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <span className="material-icons text-3xl text-emerald-600 dark:text-emerald-400">event_available</span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Leave Management & Approvals</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Apply for leave, track annual quotas, manage multi-level supervisor approvals, and sync with payroll attendance.
            </p>
          </div>
          <button
            onClick={() => setIsApplyModalOpen(true)}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium shadow-sm transition-all flex items-center gap-2"
          >
            <span className="material-icons text-sm">add</span>
            Apply for Leave
          </button>
        </div>

        {/* Live Quota Balances Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {balances.length > 0 ? (
            balances.map((b: any) => {
              const remaining = Number(b.remaining_days || 0);
              const total = Number(b.total_entitlement || 0);
              const used = Number(b.used_days || 0);
              const pending = Number(b.pending_days || 0);

              return (
                <div key={b.leave_type_id} className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{b.leave_name} ({b.leave_code})</span>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      Active
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-3xl font-extrabold text-slate-900 dark:text-white">{remaining}</span>
                    <span className="text-xs text-slate-400">/ {total} days</span>
                  </div>
                  <div className="text-xs text-slate-500 flex justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                    <span>Used: {used} d</span>
                    <span>Pending: {pending} d</span>
                  </div>
                </div>
              );
            })
          ) : (
            <>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Casual Leave (CL)</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">12.0 d</div>
                <div className="text-xs text-slate-400 mt-1">100% available</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Sick Leave (SL)</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">12.0 d</div>
                <div className="text-xs text-slate-400 mt-1">Medical certified</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Earned Leave (EL)</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">15.0 d</div>
                <div className="text-xs text-slate-400 mt-1">Encashable at exit</div>
              </div>
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Loss of Pay (LOP)</div>
                <div className="text-2xl font-bold text-slate-900 dark:text-white">0.0 d</div>
                <div className="text-xs text-slate-400 mt-1">Unpaid absence</div>
              </div>
            </>
          )}
        </div>

        {/* Filter Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 items-center flex-1">
            <div className="relative min-w-[240px]">
              <span className="material-icons absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
              <input
                type="text"
                placeholder="Search by employee, reason..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="PENDING">Pending Approval</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="ALL">All Categories</option>
              {types.map((t) => (
                <option key={t.id} value={t.code}>{t.name} ({t.code})</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setSearch('');
              setStatusFilter('ALL');
              setTypeFilter('ALL');
            }}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
          >
            Clear Filters
          </button>
        </div>

        {/* Applications Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Category</th>
                  <th className="px-5 py-3">Duration & Dates</th>
                  <th className="px-5 py-3">Reason & Context</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-slate-400">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-emerald-600 border-t-transparent mr-2"></div>
                      Loading leave applications...
                    </td>
                  </tr>
                ) : filteredApplications.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                      <span className="material-icons text-4xl text-slate-300 dark:text-slate-600 mb-2">event_busy</span>
                      <p>No leave requests found matching your criteria.</p>
                    </td>
                  </tr>
                ) : (
                  filteredApplications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-900 dark:text-white">{app.employee_name || 'Staff Member'}</div>
                        <div className="text-xs text-slate-500 font-mono">{app.employee_code} • {app.department_name || 'Showroom'}</div>
                      </td>

                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          {app.leave_type_name || app.leave_type_code || 'Leave'}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-medium text-slate-900 dark:text-white">
                          {Number(app.total_days)} {Number(app.total_days) === 1 ? 'day' : 'days'}
                          {app.is_half_day && <span className="text-xs text-amber-600 ml-1">({app.half_day_session})</span>}
                        </div>
                        <div className="text-xs text-slate-500">
                          {new Date(app.start_date).toLocaleDateString()}
                          {app.start_date !== app.end_date && ` → ${new Date(app.end_date).toLocaleDateString()}`}
                        </div>
                      </td>

                      <td className="px-5 py-4 max-w-xs">
                        <div className="text-xs text-slate-700 dark:text-slate-300 truncate" title={app.reason}>
                          {app.reason}
                        </div>
                        {app.rejection_reason && (
                          <div className="text-xs text-red-500 italic mt-0.5">Rejected: "{app.rejection_reason}"</div>
                        )}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            app.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : app.status === 'REJECTED'
                              ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                              : app.status === 'CANCELLED'
                              ? 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>

                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {app.status === 'PENDING' && (
                            <>
                              <button
                                title="Approve Request"
                                onClick={() => handleApprove(app.id)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-all flex items-center gap-1 shadow-sm"
                              >
                                <span className="material-icons text-xs">check</span> Approve
                              </button>
                              <button
                                title="Reject Request"
                                onClick={() => {
                                  setSelectedAppId(app.id);
                                  setIsRejectModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-red-50 hover:bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                              >
                                <span className="material-icons text-xs">close</span> Reject
                              </button>
                              <button
                                title="Withdraw / Cancel"
                                onClick={() => handleCancel(app.id)}
                                className="p-1 rounded text-slate-400 hover:text-slate-600"
                              >
                                <span className="material-icons text-sm">delete_outline</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <div>Showing {filteredApplications.length} of {totalCount} applications</div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={filteredApplications.length < limit}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: APPLY LEAVE */}
      {isApplyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-icons text-emerald-600">event_note</span>
                Apply for Leave
              </h3>
              <button onClick={() => setIsApplyModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons">close</span>
              </button>
            </div>

            <form onSubmit={handleApply} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Leave Category *</label>
                <select
                  required
                  value={applyForm.leaveTypeId}
                  onChange={(e) => setApplyForm({ ...applyForm, leaveTypeId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code}) — {t.annual_quota} days/yr {t.is_encashable ? '• Encashable' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.startDate}
                    onChange={(e) => setApplyForm({ ...applyForm, startDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">End Date *</label>
                  <input
                    type="date"
                    required
                    value={applyForm.endDate}
                    onChange={(e) => setApplyForm({ ...applyForm, endDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                <input
                  type="checkbox"
                  id="halfDayToggle"
                  checked={applyForm.isHalfDay}
                  onChange={(e) => setApplyForm({ ...applyForm, isHalfDay: e.target.checked })}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <label htmlFor="halfDayToggle" className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Half-Day Leave Option (0.5 day)
                </label>

                {applyForm.isHalfDay && (
                  <select
                    value={applyForm.halfDaySession}
                    onChange={(e) => setApplyForm({ ...applyForm, halfDaySession: e.target.value })}
                    className="ml-auto text-xs py-1 px-2 bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 rounded"
                  >
                    <option value="FIRST_HALF">Morning Shift</option>
                    <option value="SECOND_HALF">Afternoon Shift</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Reason for Leave *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="State the reason clearly for supervisor review..."
                  value={applyForm.reason}
                  onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsApplyModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-sm"
                >
                  Submit Application
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REJECT REASON */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
              <span className="material-icons text-red-600">cancel</span>
              Document Rejection Reason
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              BSC Textiles HR policy mandates a documented reason before rejecting leave requests.
            </p>

            <div className="space-y-3">
              <textarea
                required
                rows={3}
                placeholder="e.g. Critical showroom floor inventory audit during festival week..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
              ></textarea>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    setIsRejectModalOpen(false);
                    setRejectReason('');
                  }}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRejectConfirm}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
