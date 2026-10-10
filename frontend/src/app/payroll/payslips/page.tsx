'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useSession } from 'next-auth/react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface CustomSectionItem {
  name: string;
  amount: number;
  type: 'EARNING' | 'DEDUCTION';
}

interface CustomSection {
  title: string;
  items: CustomSectionItem[];
  showOnPdf: boolean;
}

interface Payslip {
  id: string;
  payrollRunId: string;
  employeeId: string;
  basicSalary: number;
  hra: number;
  allowances: number;
  bonus: number;
  earlyIncentive: number;
  attendanceIncentive: number;
  performanceIncentive: number;
  salesIncentive: number;
  overtime: number;
  deductions: number;
  pfDeduction: number;
  taxDeduction: number;
  lopDeduction: number;
  penalties: number;
  netPay: number;
  status: string;
  remarks?: string;
  customSections?: CustomSection[];
  calculationDetails?: any;
  emailStatus: 'NOT_SENT' | 'SENT' | 'FAILED';
  emailSentAt?: string;
  emailError?: string;
  finalizedBy?: string;
  finalizedAt?: string;
  periodStart: string;
  periodEnd: string;
  employeeName: string;
  employeeCode: string;
  designation?: string;
  employeeEmail?: string;
  locationName?: string;
  departmentName?: string;
}

export default function PayslipsPage() {
  const { data: session } = useSession();
  const rawRole = session?.user?.role || 'EMPLOYEE';
  const isHrOrAdmin = ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'].includes(rawRole);

  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState<string>('');
  const [yearFilter, setYearFilter] = useState<string>('2024');

  // Modals
  const [viewingPayslip, setViewingPayslip] = useState<Payslip | null>(null);
  const [editingPayslip, setEditingPayslip] = useState<Payslip | null>(null);
  const [editForm, setEditForm] = useState<{
    basicSalary: number;
    hra: number;
    allowances: number;
    bonus: number;
    earlyIncentive: number;
    attendanceIncentive: number;
    overtime: number;
    pfDeduction: number;
    taxDeduction: number;
    lopDeduction: number;
    penalties: number;
    remarks: string;
    customSections: CustomSection[];
  }>({
    basicSalary: 0,
    hra: 0,
    allowances: 0,
    bonus: 0,
    earlyIncentive: 0,
    attendanceIncentive: 0,
    overtime: 0,
    pfDeduction: 0,
    taxDeduction: 0,
    lopDeduction: 0,
    penalties: 0,
    remarks: '',
    customSections: [],
  });

  const [savingEdit, setSavingEdit] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchPayslips = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (monthFilter) params.month = monthFilter;
      if (yearFilter) params.year = yearFilter;

      const endpoint = isHrOrAdmin ? '/payroll/payslips' : '/payroll/payslips/my-slips';
      const res = await api.get(endpoint, { params });
      setPayslips(res.data?.payslips || []);
      setTotal(res.data?.total || (res.data?.payslips || []).length);
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to fetch payslips');
    } finally {
      setLoading(false);
    }
  }, [isHrOrAdmin, search, statusFilter, monthFilter, yearFilter]);

  useEffect(() => {
    fetchPayslips();
  }, [fetchPayslips]);

  // HR Edit init
  const handleOpenEdit = (p: Payslip) => {
    setEditingPayslip(p);
    setEditForm({
      basicSalary: Number(p.basicSalary) || 0,
      hra: Number(p.hra) || 0,
      allowances: Number(p.allowances) || 0,
      bonus: Number(p.bonus) || 0,
      earlyIncentive: Number(p.earlyIncentive) || 0,
      attendanceIncentive: Number(p.attendanceIncentive) || 0,
      overtime: Number(p.overtime) || 0,
      pfDeduction: Number(p.pfDeduction) || 0,
      taxDeduction: Number(p.taxDeduction) || 0,
      lopDeduction: Number(p.lopDeduction) || 0,
      penalties: Number(p.penalties) || 0,
      remarks: p.remarks || '',
      customSections: Array.isArray(p.customSections) ? JSON.parse(JSON.stringify(p.customSections)) : [],
    });
  };

  // Calculate live net pay in edit form
  const computedGross =
    Number(editForm.basicSalary) +
    Number(editForm.hra) +
    Number(editForm.allowances) +
    Number(editForm.bonus) +
    Number(editForm.earlyIncentive) +
    Number(editForm.attendanceIncentive) +
    Number(editForm.overtime) +
    editForm.customSections.reduce(
      (acc, sec) =>
        acc +
        sec.items
          .filter((i) => i.type === 'EARNING')
          .reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      0
    );

  const computedDeductions =
    Number(editForm.pfDeduction) +
    Number(editForm.taxDeduction) +
    Number(editForm.lopDeduction) +
    Number(editForm.penalties) +
    editForm.customSections.reduce(
      (acc, sec) =>
        acc +
        sec.items
          .filter((i) => i.type === 'DEDUCTION')
          .reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
      0
    );

  const computedNet = computedGross - computedDeductions;

  // Custom section modifiers
  const handleAddCustomSection = () => {
    setEditForm((prev) => ({
      ...prev,
      customSections: [
        ...prev.customSections,
        {
          title: 'Special Allowances / Adjustments',
          items: [{ name: 'Adjustment Component', amount: 1000, type: 'EARNING' }],
          showOnPdf: true,
        },
      ],
    }));
  };

  const handleRemoveCustomSection = (secIndex: number) => {
    setEditForm((prev) => ({
      ...prev,
      customSections: prev.customSections.filter((_, idx) => idx !== secIndex),
    }));
  };

  const handleAddItemToSection = (secIndex: number) => {
    setEditForm((prev) => {
      const updated = [...prev.customSections];
      updated[secIndex].items.push({ name: 'New Component', amount: 500, type: 'EARNING' });
      return { ...prev, customSections: updated };
    });
  };

  const handleRemoveItemFromSection = (secIndex: number, itemIndex: number) => {
    setEditForm((prev) => {
      const updated = [...prev.customSections];
      updated[secIndex].items = updated[secIndex].items.filter((_, idx) => idx !== itemIndex);
      return { ...prev, customSections: updated };
    });
  };

  const handleSaveEdit = async () => {
    if (!editingPayslip) return;
    if (computedNet < 0) {
      if (!window.confirm('Warning: Net Pay is negative (₹' + computedNet + '). Are you sure you wish to save this?')) {
        return;
      }
    }

    try {
      setSavingEdit(true);
      const res = await api.put(`/payroll/payslip/${editingPayslip.id}`, {
        ...editForm,
        netPay: computedNet,
      });
      toast.success(res.data?.message || 'Payslip updated successfully!');
      setEditingPayslip(null);
      fetchPayslips();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update payslip');
    } finally {
      setSavingEdit(false);
    }
  };

  // Finalize & Auto-Email
  const handleFinalize = async (payslip: Payslip) => {
    if (!window.confirm(`Finalize payslip for ${payslip.employeeName}? This will lock the payslip and automatically send an email with the PDF attached.`)) {
      return;
    }

    try {
      setActionInProgress(payslip.id);
      const res = await api.post(`/payroll/payslip/${payslip.id}/finalize`);
      toast.success(res.data?.message || 'Payslip finalized and email dispatched!');
      fetchPayslips();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to finalize payslip');
    } finally {
      setActionInProgress(null);
    }
  };

  // Send / Resend Email
  const handleSendEmail = async (payslip: Payslip) => {
    try {
      setActionInProgress(payslip.id);
      const res = await api.post(`/payroll/payslip/${payslip.id}/email`);
      toast.success(res.data?.message || 'Email sent successfully!');
      fetchPayslips();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to dispatch email');
    } finally {
      setActionInProgress(null);
    }
  };

  // Download PDF
  const handleDownloadPdf = async (payslip: Payslip) => {
    try {
      setActionInProgress(`pdf-${payslip.id}`);
      const res = await api.get(`/payroll/payslip/${payslip.id}/pdf`, {
        responseType: 'blob',
      });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BSC_Textiles_Payslip_${payslip.employeeCode || payslip.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded payslip PDF');
    } catch (err: any) {
      toast.error('Failed to download PDF. Please check server logs.');
    } finally {
      setActionInProgress(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <span>Payroll Management</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#722F37]">
                {isHrOrAdmin ? 'Employee Payslips Ledger' : 'My Personal Payslips'}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight">
                {isHrOrAdmin ? 'Employee Payslips & Statutory Disbursals' : 'My Monthly Payslips & Earnings'}
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#722F37] text-[10px] font-bold uppercase tracking-wider border border-blue-200 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#722F37]"></span>
                Karnataka Form T
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              {isHrOrAdmin
                ? 'Review, edit, finalize, and auto-dispatch digital payslips with dynamic custom sections, tax deductions, and verified email delivery.'
                : 'View and download your official BSC Textiles monthly salary statements with breakdown of earnings, PF, and take-home pay.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchPayslips()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition-all text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-[18px] text-slate-400">refresh</span>
              <span>Refresh Ledger</span>
            </button>
          </div>
        </div>

        {/* FILTERS TOOLBAR */}
        <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative min-w-[220px]">
              <span className="material-symbols-outlined absolute left-2.5 top-2.5 text-slate-400 text-[18px]">
                search
              </span>
              <input
                type="text"
                placeholder={isHrOrAdmin ? "Search by employee name or code..." : "Search..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#722F37]"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
            >
              <option value="all">All Approval States</option>
              <option value="PENDING">Draft / Pending</option>
              <option value="APPROVED">Approved / Finalized</option>
              <option value="PAID">Paid / Disbursed</option>
            </select>

            {/* Month Filter */}
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
            >
              <option value="">All Months</option>
              <option value="1">January</option>
              <option value="2">February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11">November</option>
              <option value="12">December</option>
            </select>

            {/* Year Filter */}
            <select
              value={yearFilter}
              onChange={(e) => setYearFilter(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none"
            >
              <option value="">All Years</option>
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          </div>

          <div className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            Showing <span className="text-[#722F37] font-bold">{payslips.length}</span> of {total} records
          </div>
        </div>

        {/* PAYSLIPS DATA TABLE */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading payslips ledger...</div>
            ) : payslips.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <span className="material-symbols-outlined text-[36px] text-slate-300 block mb-2">
                  receipt_long
                </span>
                No payslips found matching the selected filters.
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F4F1]/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Pay Period</th>
                    <th className="py-3 px-4">Basic Pay</th>
                    <th className="py-3 px-4">Earnings / HRA</th>
                    <th className="py-3 px-4">Deductions</th>
                    <th className="py-3 px-4">Net Take-Home</th>
                    <th className="py-3 px-4">Status</th>
                    {isHrOrAdmin && <th className="py-3 px-4">Email Status</th>}
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {payslips.map((p) => {
                    const gross =
                      Number(p.basicSalary) +
                      Number(p.hra || 0) +
                      Number(p.allowances || 0) +
                      Number(p.bonus || 0) +
                      Number(p.earlyIncentive || 0) +
                      Number(p.attendanceIncentive || 0) +
                      Number(p.overtime || 0);

                    const totalDeductions =
                      Number(p.pfDeduction || 0) +
                      Number(p.taxDeduction || 0) +
                      Number(p.lopDeduction || 0) +
                      Number(p.penalties || 0);

                    const isFinalized = p.status === 'APPROVED' || p.status === 'PAID';

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                        {/* Employee */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#131b2e] text-white flex items-center justify-center font-bold text-[10px]">
                              {p.employeeName?.[0] || 'E'}
                            </div>
                            <div>
                              <div className="font-bold text-[#0b1c30]">{p.employeeName || 'Staff Member'}</div>
                              <div className="text-[10px] font-mono text-slate-400">
                                {p.employeeCode} • {p.designation || 'Associate'}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Pay Period */}
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0b1c30]">
                            {new Date(p.periodEnd).toLocaleDateString([], { month: 'short', year: 'numeric' })}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {new Date(p.periodStart).toLocaleDateString([], { day: '2-digit', month: 'short' })} -{' '}
                            {new Date(p.periodEnd).toLocaleDateString([], { day: '2-digit', month: 'short' })}
                          </div>
                        </td>

                        {/* Basic Pay */}
                        <td className="py-3 px-4 font-mono font-semibold text-[#0b1c30]">
                          ₹{Number(p.basicSalary).toLocaleString()}
                        </td>

                        {/* Gross */}
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-600">
                          ₹{gross.toLocaleString()}
                        </td>

                        {/* Deductions */}
                        <td className="py-3 px-4 font-mono font-semibold text-red-600">
                          -₹{totalDeductions.toLocaleString()}
                        </td>

                        {/* Net Pay */}
                        <td className="py-3 px-4 font-mono font-bold text-[#722F37] text-[13px]">
                          ₹{Number(p.netPay).toLocaleString()}
                        </td>

                        {/* Approval Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              isFinalized
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {isFinalized ? 'FINALIZED' : 'DRAFT'}
                          </span>
                        </td>

                        {/* Email Status (HR/Admin) */}
                        {isHrOrAdmin && (
                          <td className="py-3 px-4">
                            {p.emailStatus === 'SENT' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <span className="material-symbols-outlined text-[12px]">mark_email_read</span>
                                SENT
                              </span>
                            ) : p.emailStatus === 'FAILED' ? (
                              <div className="flex items-center gap-1">
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 border border-red-200"
                                  title={p.emailError || 'Email delivery failed'}
                                >
                                  <span className="material-symbols-outlined text-[12px]">error</span>
                                  FAILED
                                </span>
                                <button
                                  onClick={() => handleSendEmail(p)}
                                  disabled={actionInProgress === p.id}
                                  className="p-1 hover:bg-slate-100 rounded text-slate-500"
                                  title="Retry Sending Email"
                                >
                                  <span className="material-symbols-outlined text-[14px]">sync</span>
                                </button>
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-50 text-slate-500 border border-slate-200">
                                NOT SENT
                              </span>
                            )}
                          </td>
                        )}

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* View Button */}
                            <button
                              onClick={() => setViewingPayslip(p)}
                              className="px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded border border-slate-200 transition-colors"
                              title="Preview Payslip"
                            >
                              View
                            </button>

                            {/* HR Edit Button */}
                            {isHrOrAdmin && (
                              <button
                                onClick={() => handleOpenEdit(p)}
                                className="px-2 py-1 text-xs font-semibold text-[#722F37] hover:bg-[#F8F4F1] rounded border border-[#E5D5D7] transition-colors"
                                title="Edit Payslip Amounts & Custom Sections"
                              >
                                Edit
                              </button>
                            )}

                            {/* Finalize Button (HR only, if not finalized) */}
                            {isHrOrAdmin && !isFinalized && (
                              <button
                                onClick={() => handleFinalize(p)}
                                disabled={actionInProgress === p.id}
                                className="px-2 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded border border-emerald-200 transition-colors flex items-center gap-1 disabled:opacity-50"
                                title="Finalize and Auto-send Email with PDF"
                              >
                                <span className="material-symbols-outlined text-[14px]">verified</span>
                                <span>Finalize</span>
                              </button>
                            )}

                            {/* Download PDF Button */}
                            <button
                              onClick={() => handleDownloadPdf(p)}
                              disabled={actionInProgress === `pdf-${p.id}`}
                              className="p-1 text-slate-600 hover:text-[#722F37] hover:bg-[#F8F4F1] rounded border border-slate-200 transition-colors"
                              title="Download Karnataka Form T PDF"
                            >
                              <span className="material-symbols-outlined text-[16px]">download</span>
                            </button>

                            {/* Resend Email Button (HR only, if finalized) */}
                            {isHrOrAdmin && isFinalized && (
                              <button
                                onClick={() => handleSendEmail(p)}
                                disabled={actionInProgress === p.id}
                                className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded border border-slate-200 transition-colors"
                                title="Send / Resend Email with PDF"
                              >
                                <span className="material-symbols-outlined text-[16px]">mail</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* VIEW PAYSLIP MODAL                                                 */}
        {/* ------------------------------------------------------------------ */}
        {viewingPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[#722F37] text-[24px]">receipt_long</span>
                  <div>
                    <h3 className="font-bold text-base text-[#0b1c30]">BSC Textiles • Form T Payslip</h3>
                    <p className="text-[11px] text-slate-500">
                      Period: {new Date(viewingPayslip.periodStart).toLocaleDateString()} to{' '}
                      {new Date(viewingPayslip.periodEnd).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingPayslip(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Employee Summary Card */}
              <div className="bg-[#F8F4F1] p-4 rounded-xl border border-[#E5D5D7] flex flex-col sm:flex-row justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-sm text-[#0b1c30]">{viewingPayslip.employeeName}</div>
                  <div className="text-slate-500 font-mono text-[11px]">Emp Code: {viewingPayslip.employeeCode}</div>
                  <div className="text-slate-500 text-[11px]">Designation: {viewingPayslip.designation || 'Staff'}</div>
                </div>
                <div className="sm:text-right">
                  <div className="font-bold text-[#722F37]">{viewingPayslip.locationName || 'Belagavi Flagship'}</div>
                  <div className="text-slate-500 text-[11px]">{viewingPayslip.departmentName || 'Retail Operations'}</div>
                  <div className="text-slate-500 text-[11px] font-mono">{viewingPayslip.employeeEmail}</div>
                </div>
              </div>

              {/* Earnings & Deductions Breakdown Tables */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                {/* Earnings Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-emerald-50 px-3 py-2 font-bold text-emerald-800 border-b border-emerald-100 flex justify-between">
                    <span>Earnings</span>
                    <span>Amount (₹)</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Basic Salary</span>
                      <span className="font-mono font-semibold">₹{Number(viewingPayslip.basicSalary).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">House Rent Allowance (HRA)</span>
                      <span className="font-mono font-semibold">₹{Number(viewingPayslip.hra || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Special Allowances</span>
                      <span className="font-mono font-semibold">₹{Number(viewingPayslip.allowances || 0).toLocaleString()}</span>
                    </div>
                    {Number(viewingPayslip.bonus || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Performance Bonus</span>
                        <span className="font-mono font-semibold">+₹{Number(viewingPayslip.bonus).toLocaleString()}</span>
                      </div>
                    )}
                    {Number(viewingPayslip.earlyIncentive || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Early Login Incentive</span>
                        <span className="font-mono font-semibold">+₹{Number(viewingPayslip.earlyIncentive).toLocaleString()}</span>
                      </div>
                    )}
                    {Number(viewingPayslip.overtime || 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Overtime (OT) Pay</span>
                        <span className="font-mono font-semibold">+₹{Number(viewingPayslip.overtime).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deductions Table */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-red-50 px-3 py-2 font-bold text-red-800 border-b border-red-100 flex justify-between">
                    <span>Deductions</span>
                    <span>Amount (₹)</span>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Provident Fund (PF)</span>
                      <span className="font-mono font-semibold">₹{Number(viewingPayslip.pfDeduction || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">Income Tax (TDS)</span>
                      <span className="font-mono font-semibold">₹{Number(viewingPayslip.taxDeduction || 0).toLocaleString()}</span>
                    </div>
                    {Number(viewingPayslip.lopDeduction || 0) > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Loss of Pay (LOP)</span>
                        <span className="font-mono font-semibold">₹{Number(viewingPayslip.lopDeduction).toLocaleString()}</span>
                      </div>
                    )}
                    {Number(viewingPayslip.penalties || 0) > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Late Penalties</span>
                        <span className="font-mono font-semibold">₹{Number(viewingPayslip.penalties).toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Custom Sections (if present) */}
              {Array.isArray(viewingPayslip.customSections) && viewingPayslip.customSections.length > 0 && (
                <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 text-xs">
                  <div className="font-bold text-[#0b1c30]">Custom HR Sections</div>
                  {viewingPayslip.customSections.map((sec, sIdx) => (
                    <div key={sIdx} className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <div className="font-bold text-slate-700 mb-1">{sec.title}</div>
                      {sec.items.map((it, iIdx) => (
                        <div key={iIdx} className="flex justify-between text-slate-600 text-[11px]">
                          <span>{it.name} ({it.type})</span>
                          <span className="font-mono font-semibold">₹{Number(it.amount).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              {/* Net Pay Callout */}
              <div className="flex items-center justify-between p-3.5 bg-[#F8F4F1] rounded-xl border border-[#E5D5D7]">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Net Take-Home Pay</div>
                  <div className="text-xs text-slate-500">Auto-calculated after statutory deductions</div>
                </div>
                <div className="text-xl font-mono font-bold text-[#722F37]">
                  ₹{Number(viewingPayslip.netPay).toLocaleString()}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-medium hover:bg-slate-50 text-xs flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  <span>Print View</span>
                </button>
                <button
                  onClick={() => handleDownloadPdf(viewingPayslip)}
                  className="px-4 py-1.5 rounded-lg bg-[#722F37] text-white font-bold hover:bg-[#5B232A] text-xs flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[16px]">download</span>
                  <span>Download Form T PDF</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* HR EDIT PAYSLIP & DYNAMIC SECTIONS DRAWER/MODAL                   */}
        {/* ------------------------------------------------------------------ */}
        {editingPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] overflow-y-auto p-6 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-lg text-[#0b1c30]">HR Payslip Editor & Custom Sections</h3>
                  <p className="text-xs text-slate-500">
                    Editing payslip for <span className="font-bold text-[#722F37]">{editingPayslip.employeeName}</span> ({editingPayslip.employeeCode})
                  </p>
                </div>
                <button
                  onClick={() => setEditingPayslip(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <span className="material-symbols-outlined text-[20px]">close</span>
                </button>
              </div>

              {/* Warning if Negative Net */}
              {computedNet < 0 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                  <span className="material-symbols-outlined text-[20px]">warning</span>
                  <span>
                    <strong>Warning:</strong> Deductions exceed earnings! Net pay is negative (₹{computedNet.toLocaleString()}).
                  </span>
                </div>
              )}

              {/* Earnings Inputs */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">add_circle</span>
                  <span>Earnings Breakdown (₹)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Basic Pay</label>
                    <input
                      type="number"
                      value={editForm.basicSalary}
                      onChange={(e) => setEditForm({ ...editForm, basicSalary: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">House Rent Allowance (HRA)</label>
                    <input
                      type="number"
                      value={editForm.hra}
                      onChange={(e) => setEditForm({ ...editForm, hra: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Special Allowances</label>
                    <input
                      type="number"
                      value={editForm.allowances}
                      onChange={(e) => setEditForm({ ...editForm, allowances: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Performance Bonus</label>
                    <input
                      type="number"
                      value={editForm.bonus}
                      onChange={(e) => setEditForm({ ...editForm, bonus: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Early Login Incentive</label>
                    <input
                      type="number"
                      value={editForm.earlyIncentive}
                      onChange={(e) => setEditForm({ ...editForm, earlyIncentive: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Overtime (OT) Pay</label>
                    <input
                      type="number"
                      value={editForm.overtime}
                      onChange={(e) => setEditForm({ ...editForm, overtime: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Deductions Inputs */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <h4 className="text-xs font-bold uppercase tracking-wider text-red-700 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">remove_circle</span>
                  <span>Deductions & Statutory Compliance (₹)</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Provident Fund (PF)</label>
                    <input
                      type="number"
                      value={editForm.pfDeduction}
                      onChange={(e) => setEditForm({ ...editForm, pfDeduction: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Income Tax (TDS)</label>
                    <input
                      type="number"
                      value={editForm.taxDeduction}
                      onChange={(e) => setEditForm({ ...editForm, taxDeduction: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Loss of Pay (LOP)</label>
                    <input
                      type="number"
                      value={editForm.lopDeduction}
                      onChange={(e) => setEditForm({ ...editForm, lopDeduction: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 mb-1 font-medium">Late Penalties</label>
                    <input
                      type="number"
                      value={editForm.penalties}
                      onChange={(e) => setEditForm({ ...editForm, penalties: Number(e.target.value) })}
                      className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg font-mono focus:border-[#722F37] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Custom Sections Manager */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#722F37] flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px]">library_add</span>
                      <span>Dynamic Custom Sections & Blocks</span>
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Add custom allowances, advances, or deduction blocks that appear dynamically on the payslip and PDF.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddCustomSection}
                    className="px-2.5 py-1 text-xs font-bold text-[#722F37] bg-[#F8F4F1] hover:bg-[#E5D5D7] rounded-lg border border-[#E5D5D7] flex items-center gap-1 transition-colors"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>+ Add Section</span>
                  </button>
                </div>

                {editForm.customSections.map((sec, secIdx) => (
                  <div key={secIdx} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <input
                        type="text"
                        value={sec.title}
                        onChange={(e) => {
                          const updated = [...editForm.customSections];
                          updated[secIdx].title = e.target.value;
                          setEditForm({ ...editForm, customSections: updated });
                        }}
                        className="font-bold text-xs bg-white px-2.5 py-1 rounded border border-slate-200 flex-1"
                        placeholder="Section Title (e.g. Festival Advance, Reimbursements)"
                      />
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={sec.showOnPdf}
                            onChange={(e) => {
                              const updated = [...editForm.customSections];
                              updated[secIdx].showOnPdf = e.target.checked;
                              setEditForm({ ...editForm, customSections: updated });
                            }}
                          />
                          <span>Show on PDF</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomSection(secIdx)}
                          className="text-red-500 hover:text-red-700 p-1"
                          title="Delete Section"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>

                    {/* Items within section */}
                    <div className="space-y-2">
                      {sec.items.map((item, itemIdx) => (
                        <div key={itemIdx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const updated = [...editForm.customSections];
                              updated[secIdx].items[itemIdx].name = e.target.value;
                              setEditForm({ ...editForm, customSections: updated });
                            }}
                            className="text-xs bg-white px-2 py-1 rounded border border-slate-200 flex-1"
                            placeholder="Line item name"
                          />
                          <select
                            value={item.type}
                            onChange={(e) => {
                              const updated = [...editForm.customSections];
                              updated[secIdx].items[itemIdx].type = e.target.value as any;
                              setEditForm({ ...editForm, customSections: updated });
                            }}
                            className="text-xs bg-white px-2 py-1 rounded border border-slate-200"
                          >
                            <option value="EARNING">+ Earning</option>
                            <option value="DEDUCTION">- Deduction</option>
                          </select>
                          <input
                            type="number"
                            value={item.amount}
                            onChange={(e) => {
                              const updated = [...editForm.customSections];
                              updated[secIdx].items[itemIdx].amount = Number(e.target.value);
                              setEditForm({ ...editForm, customSections: updated });
                            }}
                            className="text-xs font-mono bg-white px-2 py-1 rounded border border-slate-200 w-28"
                            placeholder="Amount"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveItemFromSection(secIdx, itemIdx)}
                            className="text-slate-400 hover:text-red-600 p-1"
                          >
                            <span className="material-symbols-outlined text-[16px]">close</span>
                          </button>
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() => handleAddItemToSection(secIdx)}
                        className="text-[11px] font-semibold text-[#722F37] hover:underline flex items-center gap-1 pt-1"
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>
                        <span>Add item to this section</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Remarks */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-medium text-slate-600 mb-1">HR Remarks & Audit Notes</label>
                <textarea
                  value={editForm.remarks}
                  onChange={(e) => setEditForm({ ...editForm, remarks: e.target.value })}
                  placeholder="e.g. Adjusted overtime pay as approved by floor manager..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:border-[#722F37] focus:outline-none"
                  rows={2}
                />
              </div>

              {/* Calculation Summary Footer */}
              <div className="bg-[#F8F4F1] p-4 rounded-xl border border-[#E5D5D7] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                <div>
                  <div className="font-bold text-[#0b1c30]">
                    Gross: ₹{computedGross.toLocaleString()} • Deductions: ₹{computedDeductions.toLocaleString()}
                  </div>
                  <div className="text-slate-500 text-[11px]">Calculated Live Before Persisting</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] uppercase font-bold text-slate-500">New Net Pay</div>
                  <div className={`text-xl font-mono font-bold ${computedNet >= 0 ? 'text-[#722F37]' : 'text-red-600'}`}>
                    ₹{computedNet.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Footer buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingPayslip(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-medium hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="px-5 py-2 rounded-lg bg-[#722F37] text-white text-xs font-bold hover:bg-[#5B232A] flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[16px]">save</span>
                  <span>{savingEdit ? 'Saving...' : 'Save Payslip Changes'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
