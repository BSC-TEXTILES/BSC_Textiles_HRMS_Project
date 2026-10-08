'use client';

import { useState, useEffect } from 'react';
import { 
  CreditCard, DollarSign, Download, Printer, 
  CheckCircle, Lock, Eye, Plus, Calendar, Building2 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function PayrollPage() {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [runItems, setRunItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchPayrollRuns();
  }, []);

  const fetchPayrollRuns = async () => {
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
  };

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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payroll Integration & Payslips</h1>
            <p className="text-sm text-gray-500 mt-1">
              Monthly salary calculations, attendance incentives, deductions, and compliant payslip generation
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGeneratePayroll}
              disabled={generating}
              className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {generating ? 'Processing Calculations...' : 'Run Monthly Payroll'}
            </button>
          </div>
        </div>

        {/* Selected Run Summary Banner */}
        {selectedRun && (
          <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase">Payroll Cycle</span>
              <div className="text-lg font-bold text-gray-900 mt-0.5">
                {new Date(selectedRun.periodStart).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Status: <span className="text-emerald-700 font-semibold">{selectedRun.status}</span>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase">Total Employees</span>
              <div className="text-2xl font-bold text-gray-900 mt-0.5">
                {runItems.length} Staff
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-gray-500 uppercase">Total Disbursed</span>
              <div className="text-2xl font-bold text-emerald-600 mt-0.5">
                {formatCurrency(runItems.reduce((acc, i) => acc + Number(i.netPay), 0))}
              </div>
            </div>

            <div className="flex items-center justify-end">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                <CheckCircle className="w-4 h-4 text-emerald-600" />
                Audit Locked & Approved
              </span>
            </div>
          </div>
        )}

        {/* Payroll Items Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-gray-900">Disbursement Register</h3>
            <span className="text-xs text-gray-500">Every wage deduction & incentive is explainable</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Basic Pay</th>
                  <th className="py-3 px-4">Early Incentive</th>
                  <th className="py-3 px-4">Attendance Bonus</th>
                  <th className="py-3 px-4">PF Deductions</th>
                  <th className="py-3 px-4">Late Penalties</th>
                  <th className="py-3 px-4 font-bold text-gray-900">Net Pay</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {runItems.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-medium text-gray-900">
                      <div>{item.employee?.fullName}</div>
                      <div className="text-xs text-gray-400 font-mono">{item.employee?.employeeCode}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">{formatCurrency(item.basicSalary)}</td>
                    <td className="py-3 px-4 text-xs font-mono text-emerald-600 font-semibold">
                      +{formatCurrency(item.earlyIncentive)}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-emerald-600">
                      +{formatCurrency(item.attendanceIncentive)}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-gray-600">
                      -{formatCurrency(item.deductions)}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono text-red-600 font-semibold">
                      {Number(item.penalties) > 0 ? `-${formatCurrency(item.penalties)}` : '₹0'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono font-bold text-emerald-800 text-sm">
                      {formatCurrency(item.netPay)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedPayslip(item)}
                        className="inline-flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 font-medium bg-primary-50 px-2.5 py-1 rounded"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payslip Modal */}
        {selectedPayslip && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-8 shadow-2xl relative border border-gray-200">
              {/* Header */}
              <div className="text-center pb-4 border-b border-gray-200">
                <div className="font-extrabold text-xl tracking-tight text-primary-900">BSC TEXTILES PVT LTD</div>
                <div className="text-[11px] text-gray-500 uppercase tracking-widest mt-0.5">Weaving Dreams, Building Futures</div>
                <div className="text-xs font-bold text-gray-800 mt-2 bg-gray-100 py-1 rounded inline-block px-3">
                  PAYSLIP FOR {new Date(selectedRun?.periodStart || Date.now()).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
                </div>
              </div>

              {/* Employee Details */}
              <div className="py-4 grid grid-cols-2 gap-3 text-xs border-b border-gray-100">
                <div>
                  <span className="text-gray-400 block">Employee Name:</span>
                  <span className="font-bold text-gray-900">{selectedPayslip.employee?.fullName}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Employee ID:</span>
                  <span className="font-mono font-bold text-gray-900">{selectedPayslip.employee?.employeeCode}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Designation:</span>
                  <span className="font-semibold text-gray-800">{selectedPayslip.employee?.designation || 'Retail Staff'}</span>
                </div>
                <div>
                  <span className="text-gray-400 block">Location Branch:</span>
                  <span className="font-semibold text-gray-800">{selectedPayslip.employee?.location?.name || 'Head Office'}</span>
                </div>
              </div>

              {/* Salary Breakdown */}
              <div className="py-4 space-y-2 text-xs">
                <div className="flex justify-between text-gray-700">
                  <span>Basic Wage:</span>
                  <span className="font-mono font-medium">{formatCurrency(selectedPayslip.basicSalary)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Early Login Incentive (@ ₹1/sec):</span>
                  <span className="font-mono">+{formatCurrency(selectedPayslip.earlyIncentive)}</span>
                </div>
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Attendance Bonus:</span>
                  <span className="font-mono">+{formatCurrency(selectedPayslip.attendanceIncentive)}</span>
                </div>
                <div className="flex justify-between text-gray-600">
                  <span>Provident Fund (PF Deduction):</span>
                  <span className="font-mono">-{formatCurrency(selectedPayslip.deductions)}</span>
                </div>
                {Number(selectedPayslip.penalties) > 0 && (
                  <div className="flex justify-between text-red-600 font-medium">
                    <span>Approved Late Deductions:</span>
                    <span className="font-mono">-{formatCurrency(selectedPayslip.penalties)}</span>
                  </div>
                )}
                <div className="pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
                  <span className="font-bold text-gray-900">Net Take-Home Pay:</span>
                  <span className="font-mono font-extrabold text-emerald-700 text-lg">
                    {formatCurrency(selectedPayslip.netPay)}
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 flex justify-between items-center border-t border-gray-100">
                <button
                  onClick={() => window.print()}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Payslip
                </button>
                <button
                  onClick={() => setSelectedPayslip(null)}
                  className="bg-primary-600 hover:bg-primary-700 text-white text-xs px-4 py-2 rounded-lg font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
