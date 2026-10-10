'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function FormerEmployeesPage() {
  const [stats, setStats] = useState<any>({
    totalExits: 0,
    resigned: 0,
    terminated: 0,
    retired: 0,
    awaitingClearance: 0,
    awaitingCalculation: 0,
    pendingHrReview: 0,
    pendingApproval: 0,
    readyForPayment: 0,
    closedPaid: 0,
    overdueSettlements: 0,
  });

  const [exits, setExits] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [exitTypeFilter, setExitTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [locations, setLocations] = useState<any[]>([]);
  const [allEmployees, setAllEmployees] = useState<any[]>([]);

  // Modals
  const [initiateModalOpen, setInitiateModalOpen] = useState(false);
  const [clearanceModalOpen, setClearanceModalOpen] = useState(false);
  const [calcModalOpen, setCalcModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [approvalModalOpen, setApprovalModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  // Selected item states
  const [selectedExit, setSelectedExit] = useState<any>(null);
  const [selectedSettlement, setSelectedSettlement] = useState<any>(null);

  // Form states
  const [initiateForm, setInitiateForm] = useState({
    employeeId: '',
    exitType: 'RESIGNATION',
    resignationDate: new Date().toISOString().split('T')[0],
    noticePeriodDays: 30,
    lastWorkingDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    reason: '',
  });

  const [editForm, setEditForm] = useState({
    unpaidSalaryDays: 0,
    noticeRecoveryDays: 0,
    leaveEncashmentDays: 0,
    gratuityAmount: 0,
    otherEarnings: 0,
    otherDeductions: 0,
    remarks: '',
  });

  const [approvalRemarks, setApprovalRemarks] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    paymentReference: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'BANK_TRANSFER',
  });

  // Fetch Stats & Exits
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/exits/dashboard-stats');
      setStats(res.data?.stats || res.data || {});
    } catch (e: any) {
      console.error('Failed to load stats:', e);
    }
  }, []);

  const fetchExits = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      if (exitTypeFilter) params.exitType = exitTypeFilter;
      if (statusFilter) params.status = statusFilter;
      if (locationFilter) params.locationId = locationFilter;

      const res = await api.get('/exits', { params });
      setExits(res.data?.exits || []);
      setTotalCount(res.data?.pagination?.total || (res.data?.exits || []).length);
    } catch (e: any) {
      console.error('Failed to load exits:', e);
      toast.error('Could not fetch former employees data');
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, exitTypeFilter, statusFilter, locationFilter]);

  const fetchMetadata = useCallback(async () => {
    try {
      const [locRes, empRes] = await Promise.all([
        api.get('/locations/all').catch(() => ({ data: [] })),
        api.get('/employees?limit=200').catch(() => ({ data: { employees: [] } })),
      ]);
      setLocations(locRes.data || []);
      setAllEmployees(empRes.data?.employees || []);
    } catch (e) {
      console.error('Error fetching metadata:', e);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchMetadata();
  }, [fetchStats, fetchMetadata]);

  useEffect(() => {
    fetchExits();
  }, [fetchExits]);

  // Actions
  const handleInitiateExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initiateForm.employeeId) {
      toast.error('Please select an employee');
      return;
    }
    try {
      await api.post('/exits/initiate', initiateForm);
      toast.success('Exit initiated successfully with department clearance workflow');
      setInitiateModalOpen(false);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to initiate exit');
    }
  };

  const handleUpdateClearance = async (taskId: string, status: string, recoveryAmount = 0, remarks = '') => {
    try {
      await api.put(`/exits/clearance/${taskId}`, { status, recoveryAmount, remarks });
      toast.success('Clearance task updated');
      // Refresh exit data
      const res = await api.get(`/exits/${selectedExit.id}`);
      setSelectedExit(res.data?.exit || res.data);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to update clearance');
    }
  };

  const handleCalculateSettlement = async (exitId: string) => {
    try {
      const res = await api.post(`/exits/${exitId}/calculate-settlement`);
      toast.success('F&F Settlement calculated successfully');
      setSelectedSettlement(res.data?.settlement);
      setCalcModalOpen(true);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to calculate settlement');
    }
  };

  const handleOpenEdit = (settlement: any) => {
    setSelectedSettlement(settlement);
    setEditForm({
      unpaidSalaryDays: settlement.unpaid_salary_days || 0,
      noticeRecoveryDays: settlement.notice_recovery_days || 0,
      leaveEncashmentDays: settlement.leave_encashment_days || 0,
      gratuityAmount: Number(settlement.gratuity_amount || 0),
      otherEarnings: Number(settlement.other_earnings || 0),
      otherDeductions: Number(settlement.other_deductions || 0),
      remarks: '',
    });
    setEditModalOpen(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSettlement) return;
    try {
      await api.put(`/exits/settlement/${selectedSettlement.id}/review`, editForm);
      toast.success('Settlement adjusted and audit logged successfully');
      setEditModalOpen(false);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to update settlement');
    }
  };

  const handleSubmitApproval = async (settlementId: string) => {
    try {
      await api.post(`/exits/settlement/${settlementId}/submit-approval`);
      toast.success('Settlement submitted for management approval');
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to submit for approval');
    }
  };

  const handleApprove = async (action: 'APPROVED' | 'REJECTED') => {
    if (!selectedSettlement) return;
    try {
      await api.put(`/exits/settlement/${selectedSettlement.id}/approve`, {
        action,
        remarks: approvalRemarks,
      });
      toast.success(`Settlement ${action === 'APPROVED' ? 'Approved' : 'Rejected'}`);
      setApprovalModalOpen(false);
      setApprovalRemarks('');
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Approval action failed');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSettlement) return;
    if (!paymentForm.paymentReference) {
      toast.error('Payment reference / UTR is required');
      return;
    }
    try {
      await api.post(`/exits/settlement/${selectedSettlement.id}/record-payment`, paymentForm);
      toast.success('Payment recorded and settlement marked closed!');
      setPaymentModalOpen(false);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to record payment');
    }
  };

  const handleDownloadPdf = async (settlementId: string, employeeCode: string) => {
    try {
      const res = await api.get(`/exits/settlement/${settlementId}/statement-pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BSC_Settlement_${employeeCode}_${settlementId}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success('F&F Statement PDF downloaded');
    } catch (e: any) {
      toast.error('Could not download F&F Statement PDF');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header Title & CTA */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-3">
              <span className="material-icons text-3xl text-blue-600 dark:text-blue-400">person_off</span>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Former Employees & Full & Final Settlement</h1>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Complete ex-employee lifecycle management, department clearances, F&F transparent calculations, audit trails, and bank disbursement tracking.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setInitiateModalOpen(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium shadow-sm transition-all flex items-center gap-2"
            >
              <span className="material-icons text-sm">person_remove</span>
              Initiate Employee Exit
            </button>
          </div>
        </div>

        {/* 10 KPI Dashboard Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div
            onClick={() => setStatusFilter('')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Total Exits</span>
              <span className="material-icons text-blue-600 text-lg">people_outline</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.totalExits || 0}</div>
          </div>

          <div
            onClick={() => setExitTypeFilter('RESIGNATION')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-blue-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Resigned</span>
              <span className="material-icons text-amber-500 text-lg">exit_to_app</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.resigned || 0}</div>
          </div>

          <div
            onClick={() => setExitTypeFilter('TERMINATION')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-red-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Terminated</span>
              <span className="material-icons text-red-500 text-lg">cancel</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.terminated || 0}</div>
          </div>

          <div
            onClick={() => setStatusFilter('CLEARANCE_IN_PROGRESS')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-yellow-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Clearance</span>
              <span className="material-icons text-yellow-500 text-lg">checklist</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.awaitingClearance || 0}</div>
          </div>

          <div
            onClick={() => setStatusFilter('CLEARANCE_COMPLETED')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-indigo-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Awaiting Calc</span>
              <span className="material-icons text-indigo-500 text-lg">calculate</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.awaitingCalculation || 0}</div>
          </div>

          <div
            onClick={() => setStatusFilter('DRAFT')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-purple-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending HR Review</span>
              <span className="material-icons text-purple-500 text-lg">rate_review</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.pendingHrReview || 0}</div>
          </div>

          <div
            onClick={() => setStatusFilter('PENDING_APPROVAL')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-orange-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Pending Approval</span>
              <span className="material-icons text-orange-500 text-lg">verified</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.pendingApproval || 0}</div>
          </div>

          <div
            onClick={() => setStatusFilter('APPROVED')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Ready for Payment</span>
              <span className="material-icons text-emerald-500 text-lg">payments</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.readyForPayment || 0}</div>
          </div>

          <div
            onClick={() => setStatusFilter('PAID')}
            className="cursor-pointer bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-green-600 transition-all"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Closed & Paid</span>
              <span className="material-icons text-green-600 text-lg">check_circle</span>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stats.closedPaid || 0}</div>
          </div>

          <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Overdue (&gt;45d)</span>
              <span className="material-icons text-red-600 text-lg">warning</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.overdueSettlements || 0}</div>
          </div>
        </div>

        {/* Filters & Search Bar */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-wrap gap-3 items-center justify-between">
          <div className="flex flex-wrap gap-3 items-center flex-1">
            <div className="relative min-w-[240px]">
              <span className="material-icons absolute left-3 top-2.5 text-slate-400 text-lg">search</span>
              <input
                type="text"
                placeholder="Search employee name, code..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>

            <select
              value={exitTypeFilter}
              onChange={(e) => setExitTypeFilter(e.target.value)}
              className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Exit Types</option>
              <option value="RESIGNATION">Resignation</option>
              <option value="TERMINATION">Termination</option>
              <option value="RETIREMENT">Retirement</option>
              <option value="CONTRACT_END">Contract End</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="py-2 px-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="CLEARANCE_IN_PROGRESS">Clearance In Progress</option>
              <option value="CLEARANCE_COMPLETED">Clearance Completed</option>
              <option value="SETTLED">Settled / Closed</option>
            </select>
          </div>

          <button
            onClick={() => {
              setSearch('');
              setExitTypeFilter('');
              setStatusFilter('');
              setLocationFilter('');
            }}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 underline"
          >
            Clear Filters
          </button>
        </div>

        {/* Former Employees & Settlements Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3">Former Employee</th>
                  <th className="px-5 py-3">Department & Location</th>
                  <th className="px-5 py-3">Exit Details</th>
                  <th className="px-5 py-3">Clearance Tasks</th>
                  <th className="px-5 py-3">Settlement Status</th>
                  <th className="px-5 py-3">Net F&F Payable</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                      <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-blue-600 border-t-transparent mr-2"></div>
                      Loading ex-employee records...
                    </td>
                  </tr>
                ) : exits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                      <span className="material-icons text-4xl text-slate-300 dark:text-slate-600 mb-2">folder_off</span>
                      <p>No ex-employees or settlements found matching your criteria.</p>
                    </td>
                  </tr>
                ) : (
                  exits.map((item) => {
                    const settlement = item.settlement;
                    const clearanceTasks = item.clearanceTasks || [];
                    const approvedTasks = clearanceTasks.filter((t: any) => t.status === 'APPROVED' || t.status === 'WAIVED').length;
                    const totalTasks = clearanceTasks.length;
                    const clearanceDone = totalTasks > 0 && approvedTasks === totalTasks;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-700 dark:text-slate-200 text-xs">
                              {item.employee_name ? item.employee_name.substring(0, 2).toUpperCase() : 'EX'}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white">{item.employee_name || 'Ex-Employee'}</div>
                              <div className="text-xs text-slate-500 font-mono">{item.employee_code}</div>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="text-slate-900 dark:text-slate-200">{item.department_name || 'General'}</div>
                          <div className="text-xs text-slate-500">{item.location_name || 'BSC Hub'}</div>
                        </td>

                        <td className="px-5 py-4">
                          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {item.exit_type}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            LWD: {item.last_working_date ? new Date(item.last_working_date).toLocaleDateString() : 'N/A'}
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <button
                            onClick={() => {
                              setSelectedExit(item);
                              setClearanceModalOpen(true);
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
                              clearanceDone
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <span className="material-icons text-xs">{clearanceDone ? 'check_circle' : 'pending_actions'}</span>
                            {approvedTasks}/{totalTasks} Cleared
                          </button>
                        </td>

                        <td className="px-5 py-4">
                          {!settlement ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Not Calculated
                            </span>
                          ) : (
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                                settlement.status === 'PAID'
                                  ? 'bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300'
                                  : settlement.status === 'APPROVED'
                                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300'
                                  : settlement.status === 'PENDING_APPROVAL'
                                  ? 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300'
                                  : 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300'
                              }`}
                            >
                              {settlement.status.replace('_', ' ')}
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {settlement ? `₹${Number(settlement.net_payable || 0).toLocaleString('en-IN')}` : '—'}
                          </div>
                          {settlement?.payment_reference && (
                            <div className="text-xs text-slate-500 font-mono">Ref: {settlement.payment_reference}</div>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Clearance View */}
                            <button
                              title="Department Clearance"
                              onClick={() => {
                                setSelectedExit(item);
                                setClearanceModalOpen(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <span className="material-icons text-lg">checklist</span>
                            </button>

                            {/* Settlement Calculation or View */}
                            {!settlement ? (
                              <button
                                title="Compute F&F Settlement"
                                onClick={() => handleCalculateSettlement(item.id)}
                                className="px-2.5 py-1 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-semibold hover:bg-indigo-100 transition-all flex items-center gap-1"
                              >
                                <span className="material-icons text-xs">calculate</span> Compute
                              </button>
                            ) : (
                              <>
                                <button
                                  title="View F&F Breakdown"
                                  onClick={() => {
                                    setSelectedSettlement(settlement);
                                    setCalcModalOpen(true);
                                  }}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <span className="material-icons text-lg">visibility</span>
                                </button>

                                {settlement.status === 'DRAFT' && (
                                  <>
                                    <button
                                      title="HR Review & Edit"
                                      onClick={() => handleOpenEdit(settlement)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                      <span className="material-icons text-lg">edit</span>
                                    </button>
                                    <button
                                      title="Submit for Approval"
                                      onClick={() => handleSubmitApproval(settlement.id)}
                                      className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    >
                                      <span className="material-icons text-lg">send</span>
                                    </button>
                                  </>
                                )}

                                {settlement.status === 'PENDING_APPROVAL' && (
                                  <button
                                    title="Approve / Reject Settlement"
                                    onClick={() => {
                                      setSelectedSettlement(settlement);
                                      setApprovalModalOpen(true);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  >
                                    <span className="material-icons text-lg">verified</span>
                                  </button>
                                )}

                                {settlement.status === 'APPROVED' && (
                                  <button
                                    title="Record Bank Payment"
                                    onClick={() => {
                                      setSelectedSettlement(settlement);
                                      setPaymentModalOpen(true);
                                    }}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1"
                                  >
                                    <span className="material-icons text-xs">payments</span> Pay
                                  </button>
                                )}

                                {/* PDF Download Statement */}
                                <button
                                  title="Download Settlement Statement PDF"
                                  onClick={() => handleDownloadPdf(settlement.id, item.employee_code)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                >
                                  <span className="material-icons text-lg">picture_as_pdf</span>
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-xs text-slate-500">
            <div>Showing {exits.length} of {totalCount} records</div>
            <div className="flex gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                disabled={exits.length < limit}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: INITIATE EXIT */}
      {initiateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-icons text-blue-600">person_remove</span>
                Initiate Employee Exit
              </h3>
              <button onClick={() => setInitiateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons">close</span>
              </button>
            </div>

            <form onSubmit={handleInitiateExit} className="space-y-4 text-sm">
              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Select Employee *</label>
                <select
                  required
                  value={initiateForm.employeeId}
                  onChange={(e) => setInitiateForm({ ...initiateForm, employeeId: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="">-- Choose Employee --</option>
                  {allEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName || emp.employeeCode} ({emp.employeeCode}) - {emp.designation || 'Staff'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Exit Type *</label>
                  <select
                    value={initiateForm.exitType}
                    onChange={(e) => setInitiateForm({ ...initiateForm, exitType: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="RESIGNATION">Resignation</option>
                    <option value="TERMINATION">Termination</option>
                    <option value="RETIREMENT">Retirement</option>
                    <option value="CONTRACT_END">Contract End</option>
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Notice Period (Days)</label>
                  <input
                    type="number"
                    value={initiateForm.noticePeriodDays}
                    onChange={(e) => setInitiateForm({ ...initiateForm, noticePeriodDays: Number(e.target.value) })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Resignation Date *</label>
                  <input
                    type="date"
                    required
                    value={initiateForm.resignationDate}
                    onChange={(e) => setInitiateForm({ ...initiateForm, resignationDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Approved Last Working Day *</label>
                  <input
                    type="date"
                    required
                    value={initiateForm.lastWorkingDate}
                    onChange={(e) => setInitiateForm({ ...initiateForm, lastWorkingDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 dark:text-slate-300 mb-1">Reason / Remarks</label>
                <textarea
                  rows={3}
                  placeholder="Reason for separation, career transition, or administrative decision..."
                  value={initiateForm.reason}
                  onChange={(e) => setInitiateForm({ ...initiateForm, reason: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInitiateModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl shadow-sm"
                >
                  Confirm Exit Initiation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CLEARANCE CHECKLIST */}
      {clearanceModalOpen && selectedExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-icons text-blue-600">checklist</span>
                  Department Exit Clearance Checklist
                </h3>
                <p className="text-xs text-slate-500">
                  {selectedExit.employee_name} ({selectedExit.employee_code}) — {selectedExit.department_name}
                </p>
              </div>
              <button onClick={() => setClearanceModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="space-y-4 my-4 max-h-[60vh] overflow-y-auto pr-1">
              {(selectedExit.clearanceTasks || []).map((task: any) => (
                <div key={task.id} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white text-sm">{task.department_name} Clearance</div>
                      <div className="text-xs text-slate-500 mt-0.5">{task.task_name}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-semibold ${
                        task.status === 'APPROVED' || task.status === 'WAIVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : task.status === 'REJECTED'
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}
                    >
                      {task.status}
                    </span>
                  </div>

                  {task.recovery_amount > 0 && (
                    <div className="mt-2 text-xs font-semibold text-red-600 dark:text-red-400">
                      Recovery Dues: ₹{Number(task.recovery_amount).toLocaleString('en-IN')}
                    </div>
                  )}

                  {task.remarks && (
                    <div className="mt-1 text-xs text-slate-500 italic">"{task.remarks}"</div>
                  )}

                  {task.status === 'PENDING' && (
                    <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex gap-2 justify-end">
                      <button
                        onClick={() => handleUpdateClearance(task.id, 'APPROVED', 0, 'All company assets cleared')}
                        className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
                      >
                        Approve Clearance
                      </button>
                      <button
                        onClick={() => handleUpdateClearance(task.id, 'WAIVED', 0, 'Waived by Management')}
                        className="px-3 py-1 bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-lg text-xs font-medium"
                      >
                        Waive
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setClearanceModalOpen(false)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-sm font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: F&F CALCULATION & BREAKDOWN */}
      {calcModalOpen && selectedSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <span className="material-icons text-indigo-600">calculate</span>
                  Full & Final Settlement Breakdown
                </h3>
                <p className="text-xs text-slate-500 font-mono">Settlement ID: {selectedSettlement.id}</p>
              </div>
              <button onClick={() => setCalcModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* Earnings Table */}
              <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
                <h4 className="font-bold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-1.5">
                  <span className="material-icons text-sm">add_circle</span> Gross Eligible Earnings
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Unpaid Final Month Salary ({selectedSettlement.unpaid_salary_days || 0} days):</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.unpaid_salary_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Earned Leave Encashment ({selectedSettlement.leave_encashment_days || 0} days):</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.leave_encashment_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Gratuity Entitlement:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.gratuity_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Incentives / Bonus:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.bonus_incentive_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Other Approved Earnings:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.other_earnings || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="border-t border-emerald-200 dark:border-emerald-800 pt-1.5 flex justify-between font-bold text-emerald-700 dark:text-emerald-300">
                    <span>Total Earnings (A):</span>
                    <span>₹{Number(selectedSettlement.total_earnings || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Deductions Table */}
              <div className="p-4 bg-red-50/50 dark:bg-red-950/20 rounded-xl border border-red-200 dark:border-red-800/60">
                <h4 className="font-bold text-red-800 dark:text-red-300 mb-2 flex items-center gap-1.5">
                  <span className="material-icons text-sm">remove_circle</span> Authorized Deductions & Dues
                </h4>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Notice Period Shortfall ({selectedSettlement.notice_recovery_days || 0} days):</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.notice_recovery_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Outstanding Salary Advances:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.advance_recovery_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Clearance Asset Dues:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.asset_recovery_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Statutory Deductions (PF / TDS):</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.statutory_deductions || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Other Deductions:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">₹{Number(selectedSettlement.other_deductions || 0).toLocaleString('en-IN')}</span>
                  </div>
                  <div className="border-t border-red-200 dark:border-red-800 pt-1.5 flex justify-between font-bold text-red-700 dark:text-red-300">
                    <span>Total Deductions (B):</span>
                    <span>₹{Number(selectedSettlement.total_deductions || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Net Result */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 flex justify-between items-center">
                <div>
                  <div className="text-xs uppercase font-bold text-blue-600 dark:text-blue-400">Net Full & Final Payable (A − B)</div>
                  <div className="text-xs text-slate-500">Subject to management approval and audit verification</div>
                </div>
                <div className="text-2xl font-black text-blue-700 dark:text-blue-300">
                  ₹{Number(selectedSettlement.net_payable || 0).toLocaleString('en-IN')}
                </div>
              </div>

              {selectedSettlement.auditHistory && selectedSettlement.auditHistory.length > 0 && (
                <div className="pt-2">
                  <h5 className="font-semibold text-xs text-slate-500 uppercase mb-2">Audit Adjustments</h5>
                  <div className="space-y-1 text-xs">
                    {selectedSettlement.auditHistory.map((adj: any) => (
                      <div key={adj.id} className="p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex justify-between">
                        <span>{adj.field_name}: ₹{adj.old_value} → ₹{adj.new_value} ({adj.reason})</span>
                        <span className="text-slate-400">{new Date(adj.created_at).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-200 dark:border-slate-800 mt-4">
              <button
                onClick={() => handleDownloadPdf(selectedSettlement.id, 'EX')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <span className="material-icons text-sm text-red-600">picture_as_pdf</span> Download Statement
              </button>
              <button
                onClick={() => setCalcModalOpen(false)}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: HR EDIT SETTLEMENT */}
      {editModalOpen && selectedSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span className="material-icons text-amber-500">edit_note</span>
                HR Settlement Adjustment
              </h3>
              <button onClick={() => setEditModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <span className="material-icons">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Unpaid Days</label>
                  <input
                    type="number"
                    value={editForm.unpaidSalaryDays}
                    onChange={(e) => setEditForm({ ...editForm, unpaidSalaryDays: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Notice Recovery Days</label>
                  <input
                    type="number"
                    value={editForm.noticeRecoveryDays}
                    onChange={(e) => setEditForm({ ...editForm, noticeRecoveryDays: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Leave Encashment Days</label>
                  <input
                    type="number"
                    value={editForm.leaveEncashmentDays}
                    onChange={(e) => setEditForm({ ...editForm, leaveEncashmentDays: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Gratuity (₹)</label>
                  <input
                    type="number"
                    value={editForm.gratuityAmount}
                    onChange={(e) => setEditForm({ ...editForm, gratuityAmount: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Other Earnings (₹)</label>
                  <input
                    type="number"
                    value={editForm.otherEarnings}
                    onChange={(e) => setEditForm({ ...editForm, otherEarnings: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Other Deductions (₹)</label>
                  <input
                    type="number"
                    value={editForm.otherDeductions}
                    onChange={(e) => setEditForm({ ...editForm, otherDeductions: Number(e.target.value) })}
                    className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Audit Justification / Remarks *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="Reason for adjustment as mandated by HR policy..."
                  value={editForm.remarks}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  className="w-full p-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-xl shadow-sm"
                >
                  Save & Log Audit
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: APPROVAL / REJECTION */}
      {approvalModalOpen && selectedSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
              <span className="material-icons text-blue-600">verified</span>
              Management Settlement Approval
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Net Payable: <span className="font-bold text-slate-900 dark:text-white">₹{Number(selectedSettlement.net_payable || 0).toLocaleString('en-IN')}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Approval / Rejection Remarks</label>
                <textarea
                  rows={3}
                  placeholder="Approved after statutory verification and asset sign-off..."
                  value={approvalRemarks}
                  onChange={(e) => setApprovalRemarks(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-sm"
                ></textarea>
              </div>

              <div className="flex gap-2 justify-end pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => handleApprove('REJECTED')}
                  className="px-4 py-2 bg-red-50 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 rounded-xl text-xs font-semibold"
                >
                  Reject Back to Draft
                </button>
                <button
                  onClick={() => handleApprove('APPROVED')}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm"
                >
                  Approve for Payment
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: RECORD PAYMENT */}
      {paymentModalOpen && selectedSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
              <span className="material-icons text-emerald-600">payments</span>
              Record Disbursement & Close F&F
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Disbursing Net Settlement of <span className="font-bold text-slate-900 dark:text-white">₹{Number(selectedSettlement.net_payable || 0).toLocaleString('en-IN')}</span>
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Bank UTR / Transaction Reference *</label>
                <input
                  required
                  placeholder="e.g. HDFC2026101000923481"
                  value={paymentForm.paymentReference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Payment Date *</label>
                <input
                  type="date"
                  required
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Disbursement Mode</label>
                <select
                  value={paymentForm.paymentMode}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                  className="w-full p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                >
                  <option value="BANK_TRANSFER">NEFT / RTGS / IMPS Bank Transfer</option>
                  <option value="CHEQUE">Corporate Cheque</option>
                  <option value="CASH">Cash Voucher</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl shadow-sm"
                >
                  Record & Close Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
