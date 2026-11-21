'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  Receipt, 
  Search, 
  RefreshCw, 
  Download, 
  Printer, 
  Lock, 
  Building2, 
  Calendar,
  CheckCircle2,
  FileText
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EmployeeSalarySlipsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [locations, setLocations] = useState<any[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const fetchEmployees = async () => {
    setLoading(true);
    try {
      const res = await api.get('/employees?limit=100');
      const list = res.data?.employees || (Array.isArray(res.data) ? res.data : []);
      setEmployees(list);
    } catch (err: any) {
      console.warn('Failed to load employee roster:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
    api.get('/locations/all').then((res) => {
      const list = Array.isArray(res.data) ? res.data : res.data?.locations || [];
      setLocations(list);
    }).catch(() => {});
  }, []);

  const handleDownloadPdf = async (employeeId: string, fullName: string, empCode: string) => {
    setDownloadingId(employeeId);
    try {
      // First ensure payslip calculation exists
      const calcRes = await api.get('/payroll/load-or-calculate', {
        params: { employeeId, year, month },
      });

      const payslipId = calcRes.data?.payslip?.id || calcRes.data?.data?.id;

      if (!payslipId) {
        toast.error('Could not compute payslip draft for this period');
        return;
      }

      // Download PDF
      const pdfRes = await api.get(`/payroll/payslip/${payslipId}/pdf`, {
        responseType: 'blob',
      });

      const blob = new Blob([pdfRes.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `BSC_Payslip_${empCode}_${month}_${year}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success(`Salary slip downloaded for ${fullName}`);
    } catch (err: any) {
      console.error('Payslip download error:', err);
      toast.error(err.response?.data?.error || 'Failed to download salary slip');
    } finally {
      setDownloadingId(null);
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const filteredEmployees = employees.filter((e) => {
    const matchesSearch =
      e.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeCode?.includes(search) ||
      e.designation?.toLowerCase().includes(search.toLowerCase());
    const matchesLoc =
      selectedLocation === 'ALL' || e.locationId === selectedLocation || e.location?.code === selectedLocation;
    return matchesSearch && matchesLoc;
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Receipt className="w-7 h-7 text-indigo-600" />
              Employee Salary Slips & Monthly PDF Generation
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Download and issue authentic BSC Textiles monthly salary slips complete with holiday pay, incentives, and PF/ESI deductions.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Period select */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold">
              <Calendar className="w-4 h-4 text-slate-400" />
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="bg-transparent text-slate-900 dark:text-white"
              >
                {monthNames.map((m, idx) => (
                  <option key={idx + 1} value={idx + 1} className="dark:bg-slate-900">
                    {m}
                  </option>
                ))}
              </select>
              <select
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                className="bg-transparent text-slate-900 dark:text-white"
              >
                {[2025, 2026, 2027].map((y) => (
                  <option key={y} value={y} className="dark:bg-slate-900">
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Hubs & Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search employee by name, code or designation..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-5 py-3.5">Showroom</th>
                  <th className="px-5 py-3.5">Period</th>
                  <th className="px-5 py-3.5">Fixed Gross</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEmployees.map((emp) => {
                  const gross = Number(emp.fixedGrossSalary || 16000);
                  const isDownloading = downloadingId === emp.id;
                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{emp.fullName}</div>
                        <div className="text-xs text-slate-500 font-mono">{emp.employeeCode} • {emp.designation || 'Staff'}</div>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                        {emp.location?.name || emp.location?.code || 'BSC Davangere'}
                      </td>
                      <td className="px-5 py-3.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {monthNames[month - 1]} {year}
                      </td>
                      <td className="px-5 py-3.5 font-bold text-slate-900 dark:text-white font-mono">
                        ₹{gross.toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Ready for Print
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleDownloadPdf(emp.id, emp.fullName, emp.employeeCode)}
                          disabled={isDownloading}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#092B69] hover:bg-[#07204f] text-white shadow-sm inline-flex items-center gap-1.5 disabled:opacity-50"
                        >
                          {isDownloading ? (
                            <>
                              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Generating PDF...
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" /> Download Payslip PDF
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
