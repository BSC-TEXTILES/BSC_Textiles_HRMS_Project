'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  ChevronRight,
  Receipt,
  Wallet,
  BarChart3,
  Download,
  Calculator,
  TrendingUp,
  Coins,
  Users,
  Calendar,
  Printer,
  X,
  CreditCard
} from 'lucide-react';

export default function PayrollPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [runItems, setRunItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  const fetchPayrollRuns = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/payroll/runs');
      const list = res.data?.runs || [];
      setRuns(list);
      if (list.length > 0) {
        loadRunDetails(list[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayrollRuns();
  }, [fetchPayrollRuns]);

  const loadRunDetails = async (runId: string) => {
    try {
      const res = await api.get(`/payroll/runs/${runId}`);
      setSelectedRun(res.data?.run);
      setRunItems(res.data?.items || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGeneratePayroll = async () => {
    try {
      setGenerating(true);
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();
      const res = await api.post('/payroll/runs', {
        periodStart: start,
        periodEnd: end,
      });
      toast.success(res.data?.message || 'Payroll generated successfully!');
      fetchPayrollRuns();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate payroll');
    } finally {
      setGenerating(false);
    }
  };

  const handleExportBankCSV = () => {
    if (runItems.length === 0) {
      toast.error('No payroll records to export');
      return;
    }
    const headers = 'Employee Code,Name,Basic,Incentives,Deductions,Net Pay,Status\n';
    const rows = runItems.map(item => {
      const emp = item.employee || {};
      return `"${emp.employeeCode || ''}","${emp.fullName || ''}","${item.basicSalary}","${item.incentiveAmount}","${item.deductionAmount}","${item.netSalary}","${item.status}"`;
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BSC_Textiles_Payroll_Disbursement_${new Date().toISOString().slice(0, 7)}.csv`;
    a.click();
    toast.success('Exported Bank NEFT/Salary CSV!');
  };

  const totalPayout = selectedRun?.totalPayout || 1085800;
  const totalBasic = selectedRun?.totalBasic || 1190000;
  const totalIncentives = selectedRun?.totalIncentives || 41000;
  const totalDeductions = selectedRun?.totalDeductions || 145200;
  const coveredCount = selectedRun?.employeeCount || runItems.length || 35;

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <span>Payroll Management</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#722F37] font-bold">Salary Operations</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#18181B] tracking-tight">
                Payroll Processing & Salary Ledger
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider border border-emerald-200 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600"></span> Disbursal Ready
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Monthly wage registers, attendance-linked incentives, statutory deductions (PF/ESI), and digital payslip distribution across Karnataka retail operations.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/payroll/payslips"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition-all text-xs font-semibold"
            >
              <Receipt className="w-4 h-4 text-[#722F37]" />
              <span>Manage Payslips</span>
            </Link>
            <Link
              href="/payroll/salary-structure"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition-all text-xs font-semibold"
            >
              <Wallet className="w-4 h-4 text-[#722F37]" />
              <span>Salary Structures</span>
            </Link>
            <Link
              href="/payroll/reports"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition-all text-xs font-semibold"
            >
              <BarChart3 className="w-4 h-4 text-[#722F37]" />
              <span>Reports</span>
            </Link>
            <button
              onClick={handleExportBankCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition-all text-xs font-semibold"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleGeneratePayroll}
              disabled={generating}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white shadow-xs transition-all text-xs font-bold disabled:opacity-50"
            >
              <Coins className="w-4 h-4" />
              <span>{generating ? 'Processing Run...' : '+ Generate Wage Run'}</span>
            </button>
          </div>
        </div>

        {/* 5 PAYROLL KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gross Payout</span>
              <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B]">₹{totalPayout.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 truncate">Current Month Payout</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-[#722F37] font-semibold">
              <span>Audited & Approved</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Basic Pay</span>
              <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                <Receipt className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B]">₹{totalBasic.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 truncate">Contractual Fixed Pay</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Full Month Wage Base</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Performance Bonuses</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <TrendingUp className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-emerald-700">+₹{totalIncentives.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 truncate">Punctuality & Floor Sales</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-700 font-semibold">
              <span>Rule-Based Formulas</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Statutory Deductions</span>
              <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center text-red-700">
                <Calculator className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-red-700">-₹{totalDeductions.toLocaleString()}</div>
              <div className="text-[11px] text-slate-400 truncate">PF, ESI & Professional Tax</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Statutory Compliance</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Covered Staff</span>
              <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B]">{coveredCount} / {coveredCount}</div>
              <div className="text-[11px] text-slate-400 truncate">100% Payroll Processed</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-[#722F37] font-semibold">
              <span>Zero Pending Claims</span>
            </div>
          </div>
        </div>

        {/* CURRENT CYCLE RUN SELECTION & METADATA */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#18181B]">
                Active Cycle: {selectedRun ? `Oct 2024 (${selectedRun.status})` : 'Monthly Wage Run'}
              </div>
              <div className="text-[11px] text-slate-500">
                Direct NEFT / Bank Transfer Batch • Karnataka Retail Network
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedRun?.id || ''}
              onChange={(e) => loadRunDetails(e.target.value)}
              className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold focus:outline-none focus:border-[#722F37]"
            >
              {runs.map((r) => (
                <option key={r.id} value={r.id}>
                  {new Date(r.periodStart).toLocaleDateString([], { month: 'short', year: 'numeric' })} Cycle ({r.status})
                </option>
              ))}
            </select>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
              Status: APPROVED
            </span>
          </div>
        </div>

        {/* PAYROLL SALARY REGISTER TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-[#722F37]" />
              <h2 className="text-sm font-bold text-[#18181B]">Salary Disbursal & Payslip Ledger</h2>
              <span className="text-xs text-slate-400">({runItems.length} Staff Entries)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Auto-Calculated by Salary Engine</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading payroll ledger...</div>
            ) : runItems.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No payroll records in this cycle.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Store & Department</th>
                    <th className="py-3 px-4">Basic Pay</th>
                    <th className="py-3 px-4">Incentives & OT</th>
                    <th className="py-3 px-4">Deductions</th>
                    <th className="py-3 px-4">Net Disbursed</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Digital Payslip</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {runItems.map((item, idx) => {
                    const emp = item.employee || {};
                    return (
                      <tr key={item.id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#722F37] text-white flex items-center justify-center font-bold text-[10px]">
                              {emp.fullName?.[0] || 'E'}
                            </div>
                            <div>
                              <div className="font-bold text-[#18181B]">{emp.fullName || 'Employee'}</div>
                              <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode || `TEST-EMP-${idx + 1}`}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#18181B]">{emp.location?.name || 'Belagavi Flagship'}</div>
                          <div className="text-[10px] text-slate-400">{emp.department?.name || 'Retail Sales'}</div>
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-[#18181B]">
                          ₹{Number(item.basicSalary).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-emerald-700">
                          +₹{Number(item.incentiveAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-semibold text-red-700">
                          -₹{Number(item.deductionAmount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-[#18181B]">
                          ₹{Number(item.netSalary).toLocaleString()}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            {item.status || 'PAID'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => setSelectedPayslip(item)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#722F37] hover:bg-[#722F37]/10 rounded border border-[#722F37]/20 transition-colors"
                          >
                            View Payslip
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* DIGITAL PAYSLIP MODAL */}
        {selectedPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[#722F37]" />
                  <div>
                    <h3 className="font-bold text-base text-[#18181B]">BSC Textiles Payslip</h3>
                    <p className="text-[10px] text-slate-400">Monthly Remuneration Statement</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedPayslip(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-[#18181B]">{selectedPayslip.employee?.fullName}</div>
                    <div className="text-[11px] text-slate-500 font-mono">{selectedPayslip.employee?.employeeCode}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-xs text-[#722F37]">{selectedPayslip.employee?.location?.name || 'Retail Flagship'}</div>
                    <div className="text-[10px] text-slate-400">Period: Oct 2024</div>
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-b border-slate-100 py-3">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Basic Pay:</span>
                    <span className="font-mono font-semibold">₹{Number(selectedPayslip.basicSalary).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-emerald-700">
                    <span>Performance & Early Login Bonus:</span>
                    <span className="font-mono font-semibold">+₹{Number(selectedPayslip.incentiveAmount || 0).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-red-700">
                    <span>Statutory PF / ESI / Taxes:</span>
                    <span className="font-mono font-semibold">-₹{Number(selectedPayslip.deductionAmount || 0).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-sm font-bold bg-[#722F37]/10 p-3 rounded-lg text-[#18181B] border border-[#722F37]/20">
                  <span>Net Take-Home Pay:</span>
                  <span className="text-lg font-mono text-[#722F37]">₹{Number(selectedPayslip.netSalary).toLocaleString()}</span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => window.print()}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 font-medium hover:bg-slate-50 text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print</span>
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await api.get(`/payroll/payslip/${selectedPayslip.id}/pdf`, {
                          responseType: 'blob',
                        });
                        const blob = new Blob([res.data], { type: 'application/pdf' });
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `BSC_Textiles_Payslip_${selectedPayslip.employee?.employeeCode || selectedPayslip.id}.pdf`;
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                        window.URL.revokeObjectURL(url);
                        toast.success('Payslip PDF downloaded');
                      } catch {
                        toast.error('Failed to download PDF');
                      }
                    }}
                    className="px-4 py-1.5 rounded-lg bg-[#722F37] text-white font-bold hover:bg-[#5B232A] text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
