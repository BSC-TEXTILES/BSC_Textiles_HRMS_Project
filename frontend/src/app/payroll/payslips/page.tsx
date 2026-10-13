'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { useSession } from 'next-auth/react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  PayslipDocument,
  PayslipData,
  PayslipItemDetail,
} from '@/components/payroll/PayslipDocument';
import {
  FileText,
  Search,
  Filter,
  Download,
  Printer,
  Edit3,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  AlertCircle,
  Building2,
  Calendar,
  User,
  Users,
  Eye,
  RefreshCw,
  Sparkles,
  Lock,
  Unlock,
  CreditCard,
  Briefcase,
  Layers,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  X,
  Sliders,
  DollarSign
} from 'lucide-react';

interface EmployeeSummary {
  id: string;
  employeeCode: string;
  fullName: string;
  designation?: string;
  email?: string;
  phone?: string;
  gender?: string;
  pfNo?: string;
  esiNo?: string;
  uanNo?: string;
  bankName?: string;
  bankAccount?: string;
  salesmanNo?: string;
  batch?: string;
  pfPay?: number;
  fixedGrossSalary?: number;
  perDaySalary?: number;
  daysPayable?: number;
  basicSalary?: number;
  hra?: number;
  locationName?: string;
  locationCode?: string;
  departmentName?: string;
  sectionName?: string;
  shiftName?: string;
}

export default function PayslipsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const rawRole = session?.user?.role || 'EMPLOYEE';
  const isHrOrAdmin = [
    'SUPER_ADMIN',
    'ADMIN',
    'HR',
    'HR_MANAGER',
    'HR_EXECUTIVE',
    'PAYROLL_MANAGER',
  ].includes(rawRole);

  // Active view: 'MANAGER' (HR Interactive Editor) | 'LEDGER' (List of Slips) | 'PREVIEW'
  const [activeTab, setActiveTab] = useState<'MANAGER' | 'LEDGER' | 'PREVIEW'>('MANAGER');

  // Searchable Roster State
  const [employees, setEmployees] = useState<EmployeeSummary[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [employeeSearchInput, setEmployeeSearchInput] = useState<string>('');
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Period Selector
  const currentYear = new Date().getFullYear();
  const [selectedMonth, setSelectedMonth] = useState<string>('Aug');
  const [selectedYear, setSelectedYear] = useState<string>('2026');

  // HR Editor Form State (Initially null - no payslip loaded before explicit selection & Load)
  const [activePayslip, setActivePayslip] = useState<PayslipData | null>(null);
  const [loadingSalaryDetails, setLoadingSalaryDetails] = useState(false);
  const [savingPayslip, setSavingPayslip] = useState(false);

  // Editable Components in Editor
  const [editableEarnings, setEditableEarnings] = useState<PayslipItemDetail[]>([]);
  const [editableDeductions, setEditableDeductions] = useState<PayslipItemDetail[]>([]);
  const [daysPayable, setDaysPayable] = useState<number>(31);
  const [perDaySalary, setPerDaySalary] = useState<number>(516.13);
  const [pfPay, setPfPay] = useState<number>(12000);
  const [fixedGrossSalary, setFixedGrossSalary] = useState<number>(16000);
  const [remarks, setRemarks] = useState<string>('');
  const [statusVal, setStatusVal] = useState<string>('APPROVED');

  // Modals
  const [viewingPayslip, setViewingPayslip] = useState<PayslipData | null>(null);

  // Payslips Ledger State
  const [ledgerSlips, setLedgerSlips] = useState<any[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [ledgerMonthFilter, setLedgerMonthFilter] = useState('Aug');
  const [ledgerYearFilter, setLedgerYearFilter] = useState('2026');

  // Month list
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const years = ['2024', '2025', '2026', '2027'];

  // Fetch Employees for searchable selector
  const fetchEmployees = useCallback(async () => {
    try {
      setLoadingEmployees(true);
      const res = await api.get('/payroll/employees');
      const list: EmployeeSummary[] = res.data?.employees || [];
      setEmployees(list);
      // NOTE: Do NOT automatically select any employee! Roster starts unselected.
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load employee list');
    } finally {
      setLoadingEmployees(false);
    }
  }, []);

  // Fetch Ledger Payslips
  const fetchLedger = useCallback(async () => {
    try {
      setLoadingLedger(true);
      const params: any = {};
      if (searchFilter) params.search = searchFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (ledgerMonthFilter) params.month = ledgerMonthFilter;
      if (ledgerYearFilter) params.year = ledgerYearFilter;

      const endpoint = isHrOrAdmin ? '/payroll/payslips' : '/payroll/payslips/my-slips';
      const res = await api.get(endpoint, { params });
      setLedgerSlips(res.data?.payslips || []);
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoadingLedger(false);
    }
  }, [isHrOrAdmin, searchFilter, statusFilter, ledgerMonthFilter, ledgerYearFilter]);

  // Load Salary Details for Selected Employee & Period
  const loadSalaryDetails = useCallback(
    async (empId: string, month: string, year: string) => {
      if (!empId) return;
      try {
        setLoadingSalaryDetails(true);
        const res = await api.get('/payroll/load-or-calculate', {
          params: { employeeId: empId, month, year },
        });

        const data: PayslipData = res.data?.payslip;
        if (!data) throw new Error('No payslip data returned');

        setActivePayslip(data);
        setEditableEarnings(data.earningsConfig || []);
        setEditableDeductions(data.deductionsConfig || []);
        setDaysPayable(Number(data.daysPayable || 31));
        setPerDaySalary(Number(data.perDaySalary || 516.13));
        setPfPay(Number(data.pfPay || data.basicSalary || 12000));
        setFixedGrossSalary(Number(data.fixedGrossSalary || 16000));
        setRemarks(data.remarks || '');
        setStatusVal(data.status || 'APPROVED');

        if (res.data?.mode === 'EXISTING') {
          toast.success(`Loaded existing payslip for ${data.fullName} (${month}-${year})`);
        } else {
          toast.success(`Computed draft wage calculation for ${data.fullName}`);
        }
      } catch (err: any) {
        console.error(err);
        toast.error(err.response?.data?.error || 'Failed to compute salary details');
      } finally {
        setLoadingSalaryDetails(false);
      }
    },
    []
  );

  useEffect(() => {
    if (sessionStatus === 'loading') return;
    if (isHrOrAdmin) {
      fetchEmployees();
    }
    fetchLedger();
  }, [fetchEmployees, fetchLedger, isHrOrAdmin, sessionStatus]);

  // Filtered and deduplicated employees for search combobox
  const filteredEmployees = useMemo(() => {
    const seen = new Set<string>();
    const uniqueList = employees.filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    if (!employeeSearchInput.trim()) {
      return uniqueList.slice(0, 50);
    }

    const q = employeeSearchInput.toLowerCase().trim();
    return uniqueList.filter(
      (e) =>
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        (e.locationName && e.locationName.toLowerCase().includes(q)) ||
        (e.locationCode && e.locationCode.toLowerCase().includes(q)) ||
        (e.sectionName && e.sectionName.toLowerCase().includes(q)) ||
        (e.designation && e.designation.toLowerCase().includes(q))
    );
  }, [employees, employeeSearchInput]);

  // Selected Employee Object
  const currentEmployee = useMemo(() => {
    return employees.find((e) => e.id === selectedEmployeeId);
  }, [employees, selectedEmployeeId]);

  // Live Recalculations
  const computedGross = useMemo(() => {
    return editableEarnings
      .filter((e) => e.enabled !== false)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [editableEarnings]);

  const computedDeductions = useMemo(() => {
    return editableDeductions
      .filter((d) => d.enabled !== false)
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);
  }, [editableDeductions]);

  const computedNetPayable = Math.max(0, computedGross - computedDeductions);

  const computedEmployerPf = Math.round(Number(pfPay || 12000) * 0.12);
  const computedEmployerEsi = computedGross <= 21000 ? Math.round(computedGross * 0.0325) : 0;
  const computedCtc = Math.round(computedGross + computedEmployerPf + computedEmployerEsi);

  // Auto-recalculate Per Day Salary when fixedGrossSalary or daysPayable changes
  const handleDaysPayableChange = (newDays: number) => {
    setDaysPayable(newDays);
    if (newDays > 0 && fixedGrossSalary > 0) {
      const perDay = Math.round((fixedGrossSalary / newDays) * 100) / 100;
      setPerDaySalary(perDay);
    }
  };

  const handleFixedGrossChange = (newGross: number) => {
    setFixedGrossSalary(newGross);
    if (daysPayable > 0 && newGross > 0) {
      const perDay = Math.round((newGross / daysPayable) * 100) / 100;
      setPerDaySalary(perDay);
    }
  };

  // Add Earning Component
  const handleAddEarning = () => {
    const label = prompt('Enter Component Label (e.g., FESTIVAL BONUS, SPECIAL ALLOWANCE):');
    if (!label || !label.trim()) return;
    const amountStr = prompt('Enter Amount (₹):', '1000');
    const amount = Number(amountStr) || 0;

    const newId = `custom_earn_${Date.now()}`;
    setEditableEarnings((prev) => [...prev, { id: newId, label: label.trim().toUpperCase(), amount, enabled: true }]);
    toast.success(`Added ${label.toUpperCase()} component`);
  };

  // Add Deduction Component
  const handleAddDeduction = () => {
    const label = prompt('Enter Deduction Label (e.g., ADVANCE RECOVERY, MESS FEE):');
    if (!label || !label.trim()) return;
    const amountStr = prompt('Enter Amount (₹):', '500');
    const amount = Number(amountStr) || 0;

    const newId = `custom_ded_${Date.now()}`;
    setEditableDeductions((prev) => [...prev, { id: newId, label: label.trim().toUpperCase(), amount, enabled: true }]);
    toast.success(`Added ${label.toUpperCase()} deduction`);
  };

  // Move Earning Up / Down
  const handleMoveEarning = (index: number, direction: 'UP' | 'DOWN') => {
    setEditableEarnings((prev) => {
      const copy = [...prev];
      const targetIdx = direction === 'UP' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Move Deduction Up / Down
  const handleMoveDeduction = (index: number, direction: 'UP' | 'DOWN') => {
    setEditableDeductions((prev) => {
      const copy = [...prev];
      const targetIdx = direction === 'UP' ? index - 1 : index + 1;
      if (targetIdx < 0 || targetIdx >= copy.length) return prev;
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Save Payslip
  const handleSavePayslip = async () => {
    if (!selectedEmployeeId || !activePayslip) {
      toast.error('No employee or payslip selected');
      return;
    }

    try {
      setSavingPayslip(true);
      const payload = {
        employeeId: selectedEmployeeId,
        salaryMonth: selectedMonth,
        salaryYear: Number(selectedYear),
        daysPayable,
        perDaySalary,
        pfPay,
        fixedGrossSalary,
        earningsConfig: editableEarnings,
        deductionsConfig: editableDeductions,
        remarks,
        status: statusVal,
        salesmanNo: currentEmployee?.salesmanNo || currentEmployee?.employeeCode,
        batch: currentEmployee?.batch || 'SHIFT II',
        section: currentEmployee?.sectionName || 'KIDS',
        shift: currentEmployee?.shiftName || 'SHIFT II',
        locationCode: currentEmployee?.locationCode || 'BSCTEX',
        pfNo: currentEmployee?.pfNo,
        esiNo: currentEmployee?.esiNo,
        uanNo: currentEmployee?.uanNo,
        bankName: currentEmployee?.bankName,
        bankAccount: currentEmployee?.bankAccount,
      };

      const res = await api.post('/payroll/save-payslip', payload);
      toast.success(res.data?.message || 'Payslip saved successfully!');

      // Update active payslip live
      setActivePayslip((prev) =>
        prev
          ? {
              ...prev,
              grossSalary: computedGross,
              totalEarnings: computedGross,
              totalDeductions: computedDeductions,
              totalPayable: computedNetPayable,
              netPayable: computedNetPayable,
              netPay: computedNetPayable,
              employerPf: computedEmployerPf,
              employerEsi: computedEmployerEsi,
              ctc: computedCtc,
              daysPayable,
              perDaySalary,
              pfPay,
              fixedGrossSalary,
              earningsConfig: editableEarnings,
              deductionsConfig: editableDeductions,
              remarks,
              status: statusVal,
            }
          : null
      );

      // Refresh Ledger
      fetchLedger();
    } catch (err: any) {
      console.error(err);
      toast.error(err.response?.data?.error || 'Failed to save payslip');
    } finally {
      setSavingPayslip(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async (slip: PayslipData | any) => {
    try {
      const id = slip.id;
      const res = await api.get(`/payroll/payslip/${id}/pdf`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BSC_Textiles_Payslip_${slip.employeeCode || 'EMP'}_${slip.salaryMonth || 'Aug'}_${slip.salaryYear || 2026}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('Certified Payslip PDF downloaded!');
    } catch {
      toast.error('Failed to download PDF');
    }
  };

  // Preset Selection for Sadashiva Lingarajappa Hadimani (1372) Reference Sample
  const handleLoadSadashivaSample = () => {
    const s = employees.find((e) => e.employeeCode === '1372');
    if (s) {
      setSelectedEmployeeId(s.id);
      setSelectedMonth('Aug');
      setSelectedYear('2026');
      setActivePayslip(null); // Strictly do not show payslip before Load is clicked
      setIsSearchOpen(false);
      setEmployeeSearchInput('');
      toast.success('Selected Sadashiva (1372) for Aug-2026. Click "Load" to fetch payslip details.');
    } else {
      toast.error('Employee 1372 not found in roster');
    }
  };

  // Construct PayslipData for live preview
  const livePreviewData: PayslipData | null = useMemo(() => {
    if (!currentEmployee || !activePayslip) return null;
    return {
      ...activePayslip,
      fullName: currentEmployee.fullName,
      employeeCode: currentEmployee.employeeCode,
      designation: currentEmployee.designation,
      departmentName: currentEmployee.departmentName || 'Atelier',
      section: currentEmployee.sectionName || 'KIDS',
      shift: currentEmployee.shiftName || 'SHIFT II',
      batch: currentEmployee.batch || 'SHIFT II',
      locationName: currentEmployee.locationName || 'Davanagere Mega Store',
      locationCode: currentEmployee.locationCode || 'BSCTEX',
      pfNo: currentEmployee.pfNo || '10653',
      esiNo: currentEmployee.esiNo || '5858975468',
      uanNo: currentEmployee.uanNo || '101278107174',
      bankName: currentEmployee.bankName || 'HDFC',
      bankAccount: currentEmployee.bankAccount || '50100374312528',
      salesmanNo: currentEmployee.salesmanNo || currentEmployee.employeeCode,
      salaryMonth: selectedMonth,
      salaryYear: selectedYear,
      daysPayable,
      perDaySalary,
      pfPay,
      fixedGrossSalary,
      grossSalary: computedGross,
      totalEarnings: computedGross,
      totalDeductions: computedDeductions,
      totalPayable: computedNetPayable,
      netPayable: computedNetPayable,
      netPay: computedNetPayable,
      employerPf: computedEmployerPf,
      employerEsi: computedEmployerEsi,
      ctc: computedCtc,
      earningsConfig: editableEarnings,
      deductionsConfig: editableDeductions,
      remarks,
      status: statusVal,
    };
  }, [
    currentEmployee,
    activePayslip,
    selectedMonth,
    selectedYear,
    daysPayable,
    perDaySalary,
    pfPay,
    fixedGrossSalary,
    computedGross,
    computedDeductions,
    computedNetPayable,
    computedEmployerPf,
    computedEmployerEsi,
    computedCtc,
    editableEarnings,
    editableDeductions,
    remarks,
    statusVal,
  ]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-16">
        {/* ============================================================= */}
        {/* MODULE HEADER                                                 */}
        {/* ============================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-[#1346a1] text-white">
                Statutory Payroll
              </span>
              <span className="text-xs text-slate-400 font-mono">Form T / Karnataka Rule 29(2)</span>
            </div>
            <h1 className="text-2xl font-black text-[#18181B] tracking-tight mt-1 flex items-center gap-2">
              <span>BSC Textiles Payslip Management</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                Live Engine
              </span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Recreation of Davangere showroom printed payslip with live HR component editing, instant A4 printing, and certified PDF dispatch.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleLoadSadashivaSample}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F8F4F1] border border-[#E5D5D7] text-[#1346a1] hover:bg-[#E5D5D7] flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#1346a1]" />
              <span>Reference Sample (Sadashiva 1372)</span>
            </button>

            <button
              onClick={() => setActiveTab(activeTab === 'LEDGER' ? 'MANAGER' : 'LEDGER')}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>{activeTab === 'LEDGER' ? 'Open HR Editor' : 'Payslips Ledger'}</span>
            </button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* TABS SELECTOR                                                 */}
        {/* ============================================================= */}
        <div className="flex items-center gap-2 border-b border-slate-200 text-xs font-bold">
          <button
            onClick={() => setActiveTab('MANAGER')}
            className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'MANAGER'
                ? 'border-[#1346a1] text-[#1346a1]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>HR Payslip Management & Editor</span>
          </button>

          <button
            onClick={() => setActiveTab('LEDGER')}
            className={`pb-3 px-3 flex items-center gap-2 border-b-2 transition-all ${
              activeTab === 'LEDGER'
                ? 'border-[#1346a1] text-[#1346a1]'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Disbursed Slips Ledger ({ledgerSlips.length})</span>
          </button>

          <Link
            href="/payroll/floor-overview"
            className="pb-3 px-3 flex items-center gap-2 border-b-2 border-transparent text-slate-500 hover:text-slate-900 transition-all hover:border-slate-300"
          >
            <Building2 className="w-4 h-4 text-[#1346a1]" />
            <span>Floor-Wise Salary Overview</span>
            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-bold">
              New
            </span>
          </Link>
        </div>

        {/* ============================================================= */}
        {/* TAB 1: HR PAYSLIP MANAGEMENT & COMPONENT EDITOR                */}
        {/* ============================================================= */}
        {activeTab === 'MANAGER' && (
          <div className="space-y-6">
            {/* STEP 1: SELECTOR BAR */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#1346a1]/10 text-[#1346a1] flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Search & Select Employee</h3>
                    <p className="text-[11px] text-slate-500">
                      Search showroom staff by full name or employee ID to configure and view payslips
                    </p>
                  </div>
                </div>

                {loadingSalaryDetails && (
                  <div className="flex items-center gap-1.5 text-xs text-[#1346a1] font-semibold animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Loading payroll records...</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                {/* Searchable Employee Field */}
                <div className="md:col-span-2 space-y-1 relative">
                  <label className="block font-bold text-slate-700">
                    Showroom Employee <span className="text-slate-400 font-normal">(Search Name or Employee ID)</span>
                  </label>

                  {!currentEmployee ? (
                    <div className="relative">
                      <div className="relative flex items-center">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" />
                        <input
                          type="text"
                          value={employeeSearchInput}
                          onChange={(e) => {
                            setEmployeeSearchInput(e.target.value);
                            setIsSearchOpen(true);
                          }}
                          onFocus={() => setIsSearchOpen(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') setIsSearchOpen(false);
                          }}
                          placeholder="Type name (e.g. Sadashiva) or employee ID (e.g. 1372)..."
                          className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#1346a1] focus:bg-white transition-all shadow-2xs"
                        />
                        {employeeSearchInput && (
                          <button
                            type="button"
                            onClick={() => {
                              setEmployeeSearchInput('');
                            }}
                            className="absolute right-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                            title="Clear search"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Backdrop to close dropdown on click outside */}
                      {isSearchOpen && (
                        <div
                          className="fixed inset-0 z-30"
                          onClick={() => setIsSearchOpen(false)}
                        />
                      )}

                      {/* Search Results Dropdown */}
                      {isSearchOpen && (
                        <div className="absolute z-40 left-0 right-0 mt-1.5 max-h-64 overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-2xl divide-y divide-slate-100">
                          {filteredEmployees.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-500">
                              <p className="font-semibold text-slate-700">No employees found</p>
                              <p className="text-[11px] text-slate-400 mt-0.5">
                                No active showroom staff matches &quot;{employeeSearchInput}&quot;
                              </p>
                            </div>
                          ) : (
                            filteredEmployees.map((emp) => (
                              <button
                                key={emp.id}
                                type="button"
                                onClick={() => {
                                  setSelectedEmployeeId(emp.id);
                                  setActivePayslip(null); // CRITICAL: hide any payslip until Load is clicked
                                  setIsSearchOpen(false);
                                  setEmployeeSearchInput('');
                                }}
                                className="w-full text-left p-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 group"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-7 h-7 rounded-lg bg-[#1346a1]/10 text-[#1346a1] font-bold text-xs flex items-center justify-center shrink-0">
                                    {emp.fullName.charAt(0)}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="font-bold text-slate-900 group-hover:text-[#1346a1] transition-colors truncate">
                                      {emp.fullName}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate flex items-center gap-1.5">
                                      <span>{emp.designation || 'Staff'}</span>
                                      {emp.sectionName && <span>• {emp.sectionName}</span>}
                                    </div>
                                  </div>
                                </div>

                                <div className="text-right shrink-0">
                                  <span className="font-mono font-bold text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded-md border border-slate-200">
                                    ID: {emp.employeeCode}
                                  </span>
                                  <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                    [{emp.locationCode || 'BSC'}] {emp.locationName || 'Showroom'}
                                  </div>
                                </div>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Selected Employee Display Card */
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-lg bg-[#1346a1] text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {currentEmployee.fullName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 text-xs truncate flex items-center gap-1.5">
                            <span>{currentEmployee.fullName}</span>
                            <span className="font-mono text-[11px] px-1.5 py-0.2 bg-slate-200/80 text-slate-800 rounded font-bold">
                              ID: {currentEmployee.employeeCode}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {currentEmployee.designation || 'Staff'} • {currentEmployee.sectionName || 'KIDS'} • [{currentEmployee.locationCode || 'BSCTEX'}] {currentEmployee.locationName || 'Davangere Store'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedEmployeeId('');
                          setActivePayslip(null); // CRITICAL: hide payslip immediately
                          setEmployeeSearchInput('');
                          setIsSearchOpen(true);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:text-[#1346a1] bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 shrink-0 shadow-2xs"
                        title="Change selected employee"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Change</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Month Selector */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Salary Month</label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      if (activePayslip && activePayslip.salaryMonth !== e.target.value) {
                        setActivePayslip(null);
                      }
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-[#1346a1]"
                  >
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Year Selector */}
                <div className="space-y-1">
                  <label className="block font-bold text-slate-700">Salary Year</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedYear}
                      onChange={(e) => {
                        setSelectedYear(e.target.value);
                        if (activePayslip && String(activePayslip.salaryYear) !== e.target.value) {
                          setActivePayslip(null);
                        }
                      }}
                      className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:border-[#1346a1]"
                    >
                      {years.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => {
                        if (!selectedEmployeeId) {
                          toast.error('Please search and select an employee first');
                          return;
                        }
                        loadSalaryDetails(selectedEmployeeId, selectedMonth, selectedYear);
                      }}
                      disabled={!selectedEmployeeId || loadingSalaryDetails}
                      className="px-4 py-2.5 bg-[#1346a1] text-white font-bold rounded-xl hover:bg-[#0e3882] transition-colors flex items-center gap-1.5 shrink-0 shadow-xs disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Load actual payslip records for selected employee and period"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${loadingSalaryDetails ? 'animate-spin' : ''}`} />
                      <span>Load</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Selected Employee Detailed Particulars Banner */}
              {currentEmployee && (
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4 text-[11px] text-slate-600">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1346a1]/10 text-[#1346a1] flex items-center justify-center font-bold">
                      {currentEmployee.fullName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        <span>{currentEmployee.fullName}</span>
                        <span className="font-mono text-slate-500 font-normal">
                          (Emp ID: {currentEmployee.employeeCode} | Salesman: {currentEmployee.salesmanNo || currentEmployee.employeeCode})
                        </span>
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Location: <span className="font-semibold text-slate-800">{currentEmployee.locationName || 'Davangere Store'}</span> | Section: <span className="font-semibold text-slate-800">{currentEmployee.sectionName || 'KIDS'}</span> | Designation: <span className="font-semibold text-slate-800">{currentEmployee.designation || 'Staff'}</span> | Shift: <span className="font-semibold text-slate-800">{currentEmployee.shiftName || 'SHIFT II'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-slate-500 font-mono">
                    <div>
                      PF No: <span className="font-bold text-slate-800">{currentEmployee.pfNo || 'N/A'}</span>
                    </div>
                    <div>
                      ESI No: <span className="font-bold text-slate-800">{currentEmployee.esiNo || 'N/A'}</span>
                    </div>
                    <div>
                      Bank: <span className="font-bold text-slate-800">{currentEmployee.bankName || 'HDFC'}</span>
                    </div>
                    <div>
                      Account: <span className="font-bold text-slate-800">{currentEmployee.bankAccount ? `•••• ${currentEmployee.bankAccount.slice(-4)}` : 'On File'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CONDITIONAL RENDERING: DISPLAY PAYSLIP ONLY AFTER SELECTION AND EXPLICIT LOAD */}
            {!activePayslip ? (
              <div className="bg-white rounded-2xl border border-slate-200/90 p-12 text-center shadow-xs flex flex-col items-center justify-center space-y-3">
                <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center text-[#1346a1]">
                  <FileText className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">
                  No Payslip Loaded
                </h3>
                <p className="text-xs text-slate-500 max-w-md">
                  {selectedEmployeeId ? (
                    <span>
                      Employee <strong className="text-slate-900">{currentEmployee?.fullName} ({currentEmployee?.employeeCode})</strong> is selected. Choose the salary month and year above and click <strong className="text-[#1346a1]">Load</strong> to display their payslip details.
                    </span>
                  ) : (
                    <span>
                      Search and select a showroom employee above, choose the salary month and year, then click <strong className="text-[#1346a1]">Load</strong> to display their actual salary details, editable components, and print preview.
                    </span>
                  )}
                </p>
                <div className="px-3.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-medium flex items-center gap-1.5 mt-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Confidential salary and deduction details remain hidden until explicitly loaded by authorized HR personnel.</span>
                </div>
              </div>
            ) : (
              <>
                {/* STEP 2: INTERACTIVE COMPONENT EDITOR */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-[#1346a1]/10 text-[#1346a1] flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Configure Earnings, Deductions & Payable Days</h3>
                    <p className="text-[11px] text-slate-500">
                      Enable, disable, reorder, or add custom salary components with real-time recalculation
                    </p>
                  </div>
                </div>

                {/* Status Switcher */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Status:</span>
                  <select
                    value={statusVal}
                    onChange={(e) => setStatusVal(e.target.value)}
                    className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                  >
                    <option value="DRAFT">DRAFT</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="FINALIZED">FINALIZED</option>
                  </select>
                </div>
              </div>

              {/* Attendance & Wage Structure Strip */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Days Payable</label>
                  <input
                    type="number"
                    step="0.5"
                    value={daysPayable}
                    onChange={(e) => handleDaysPayableChange(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-900 focus:border-[#1346a1] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Standard 31 or 30 days</span>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Per-Day Salary (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={perDaySalary}
                    onChange={(e) => setPerDaySalary(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-900 focus:border-[#1346a1] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Auto = Gross / Days</span>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-bold">Structure Gross (₹)</label>
                  <input
                    type="number"
                    value={fixedGrossSalary}
                    onChange={(e) => handleFixedGrossChange(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-900 focus:border-[#1346a1] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Fixed monthly base</span>
                </div>

                <div>
                  <label className="block text-slate-600 mb-1 font-bold">PF Wages / Pay (₹)</label>
                  <input
                    type="number"
                    value={pfPay}
                    onChange={(e) => setPfPay(Number(e.target.value))}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-900 focus:border-[#1346a1] focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Statutory PF basis</span>
                </div>
              </div>

              {/* DUAL COMPONENT EDITING TABLES */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* 1. EARNINGS TABLE */}
                <div className="border border-emerald-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                        Earnings Components
                      </h4>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddEarning}
                      className="px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Earning</span>
                    </button>
                  </div>

                  <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                    {editableEarnings.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                          item.enabled !== false
                            ? 'bg-emerald-50/40 border-emerald-100'
                            : 'bg-slate-50 border-slate-200 opacity-60'
                        }`}
                      >
                        {/* Checkbox toggle */}
                        <input
                          type="checkbox"
                          checked={item.enabled !== false}
                          onChange={(e) => {
                            const updated = [...editableEarnings];
                            updated[idx].enabled = e.target.checked;
                            setEditableEarnings(updated);
                          }}
                          className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                        />

                        {/* Component label */}
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => {
                            const updated = [...editableEarnings];
                            updated[idx].label = e.target.value.toUpperCase();
                            setEditableEarnings(updated);
                          }}
                          className="flex-1 p-1.5 text-xs font-bold uppercase bg-white border border-slate-200 rounded focus:border-emerald-600 focus:outline-none"
                        />

                        {/* Amount */}
                        <div className="flex items-center gap-1 w-28">
                          <span className="text-xs text-slate-400 font-mono">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) => {
                              const updated = [...editableEarnings];
                              updated[idx].amount = Number(e.target.value);
                              setEditableEarnings(updated);
                            }}
                            className="w-full p-1.5 text-xs font-mono font-bold text-right bg-white border border-slate-200 rounded focus:border-emerald-600 focus:outline-none"
                          />
                        </div>

                        {/* Reorder & Delete */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveEarning(idx, 'UP')}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveEarning(idx, 'DOWN')}
                            disabled={idx === editableEarnings.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditableEarnings(editableEarnings.filter((_, i) => i !== idx));
                            }}
                            className="p-1 text-red-400 hover:text-red-700"
                            title="Delete Component"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-emerald-50/80 border-t border-emerald-100 flex items-center justify-between text-xs font-bold text-emerald-950">
                    <span>TOTAL GROSS EARNINGS</span>
                    <span className="font-mono text-sm">₹{computedGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* 2. DEDUCTIONS TABLE */}
                <div className="border border-rose-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                  <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <h4 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                        Deductions Components
                      </h4>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100/80 text-rose-800 font-semibold border border-rose-200">
                        Late Fine: ₹1.0/sec
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddDeduction}
                      className="px-2.5 py-1 text-xs font-bold bg-rose-600 text-white rounded-lg hover:bg-rose-700 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Deduction</span>
                    </button>
                  </div>

                  <div className="p-3 space-y-2 max-h-96 overflow-y-auto">
                    {editableDeductions.map((item, idx) => (
                      <div
                        key={item.id || idx}
                        className={`flex items-center gap-2 p-2 rounded-lg border transition-all ${
                          item.enabled !== false
                            ? 'bg-rose-50/40 border-rose-100'
                            : 'bg-slate-50 border-slate-200 opacity-60'
                        }`}
                      >
                        {/* Checkbox toggle */}
                        <input
                          type="checkbox"
                          checked={item.enabled !== false}
                          onChange={(e) => {
                            const updated = [...editableDeductions];
                            updated[idx].enabled = e.target.checked;
                            setEditableDeductions(updated);
                          }}
                          className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500"
                        />

                        {/* Component label */}
                        <input
                          type="text"
                          value={item.label}
                          onChange={(e) => {
                            const updated = [...editableDeductions];
                            updated[idx].label = e.target.value.toUpperCase();
                            setEditableDeductions(updated);
                          }}
                          className="flex-1 p-1.5 text-xs font-bold uppercase bg-white border border-slate-200 rounded focus:border-rose-600 focus:outline-none"
                        />

                        {/* Amount */}
                        <div className="flex items-center gap-1 w-28">
                          <span className="text-xs text-slate-400 font-mono">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.amount}
                            onChange={(e) => {
                              const updated = [...editableDeductions];
                              updated[idx].amount = Number(e.target.value);
                              setEditableDeductions(updated);
                            }}
                            className="w-full p-1.5 text-xs font-mono font-bold text-right bg-white border border-slate-200 rounded focus:border-rose-600 focus:outline-none"
                          />
                        </div>

                        {/* Reorder & Delete */}
                        <div className="flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => handleMoveDeduction(idx, 'UP')}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move Up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveDeduction(idx, 'DOWN')}
                            disabled={idx === editableDeductions.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                            title="Move Down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditableDeductions(editableDeductions.filter((_, i) => i !== idx));
                            }}
                            className="p-1 text-red-400 hover:text-red-700"
                            title="Delete Component"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-rose-50/80 border-t border-rose-100 flex items-center justify-between text-xs font-bold text-rose-950">
                    <span>TOTAL DEDUCTIONS</span>
                    <span className="font-mono text-sm">₹{computedDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>

              {/* Remarks Input */}
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">Authorized HR Audit Remarks</label>
                <input
                  type="text"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g., Approved Overtime adherence, Festival Advance adjustment, Karnataka statutory wage check"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:border-[#1346a1] focus:outline-none"
                />
              </div>

              {/* LIVE KPI SUMMARY STRIP */}
              <div className="p-4 bg-gradient-to-r from-slate-900 to-[#1346a1] text-white rounded-2xl shadow-md grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 block">Gross Earnings</span>
                  <span className="text-base font-mono font-bold text-emerald-400">
                    ₹{computedGross.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 block">Total Deductions</span>
                  <span className="text-base font-mono font-bold text-rose-300">
                    ₹{computedDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-amber-200 block font-bold">Net Take-Home Pay</span>
                  <span className="text-xl font-mono font-extrabold text-white">
                    ₹{computedNetPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 block">Employer PF (12%)</span>
                  <span className="text-base font-mono font-bold text-slate-200">
                    ₹{computedEmployerPf.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-slate-300 block">Cost to Company (CTC)</span>
                  <span className="text-base font-mono font-bold text-amber-300">
                    ₹{computedCtc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* ACTION BUTTONS BAR */}
              <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById('printable-payslip');
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 text-xs flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-4 h-4 text-slate-500" />
                  <span>Scroll to Live A4 Preview</span>
                </button>

                {livePreviewData && (
                  <button
                    type="button"
                    onClick={() => handleDownloadPdf(livePreviewData)}
                    className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50 text-xs flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-4 h-4 text-slate-500" />
                    <span>Download PDF</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSavePayslip}
                  disabled={savingPayslip}
                  className="px-6 py-2.5 rounded-xl bg-[#1346a1] hover:bg-[#0e3882] text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
                >
                  {savingPayslip ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Save & Update Payslip Record</span>
                </button>
              </div>
            </div>

            {/* STEP 3: LIVE A4 DOCUMENT PREVIEW */}
            {livePreviewData && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-[#1346a1]/10 text-[#1346a1] flex items-center justify-center font-bold text-xs">
                      3
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Live Print-Ready Payslip Preview</h3>
                      <p className="text-[11px] text-slate-500">
                        Exact recreation of Davangere printed slip — supports masking, instant printing, and Form T download
                      </p>
                    </div>
                  </div>
                </div>

                <PayslipDocument
                  payslip={livePreviewData}
                  onDownloadPdf={() => handleDownloadPdf(livePreviewData)}
                  onEdit={() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </div>
            )}
              </>
            )}
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 2: PAYSLIPS LEDGER & HISTORY                              */}
        {/* ============================================================= */}
        {activeTab === 'LEDGER' && (
          <div className="space-y-5">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Search by employee name or code..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-[#1346a1]"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Month:</span>
                  <select
                    value={ledgerMonthFilter}
                    onChange={(e) => setLedgerMonthFilter(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
                  >
                    <option value="">All Months</option>
                    {months.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Year:</span>
                  <select
                    value={ledgerYearFilter}
                    onChange={(e) => setLedgerYearFilter(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
                  >
                    {years.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="p-2 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700"
                  >
                    <option value="all">All Status</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="DRAFT">DRAFT</option>
                  </select>
                </div>
              </div>

              <button
                onClick={fetchLedger}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh Ledger</span>
              </button>
            </div>

            {/* Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              {loadingLedger ? (
                <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-[#1346a1]" />
                  <span>Loading ledger records...</span>
                </div>
              ) : ledgerSlips.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs">
                  <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="font-bold text-slate-600">No payslips found for selected filters</p>
                  <p className="mt-1">Try switching month or generating a payslip using the HR Manager.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50/70 border-b border-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <tr>
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Period</th>
                        <th className="py-3 px-4">Days</th>
                        <th className="py-3 px-4 text-right">Basic Pay</th>
                        <th className="py-3 px-4 text-right">Gross Earnings</th>
                        <th className="py-3 px-4 text-right">Deductions</th>
                        <th className="py-3 px-4 text-right">Net Payable</th>
                        <th className="py-3 px-4 text-center">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {ledgerSlips.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{item.employeeName || item.fullName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {item.employeeCode} • {item.locationCode || 'BSCTEX'} • {item.section || 'KIDS'}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-800">
                              {item.salaryMonth || 'Aug'}-{item.salaryYear || 2026}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-slate-800">
                            {Number(item.daysPayable || 31).toFixed(0)}d
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            ₹{Number(item.basicSalary || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                            ₹{Number(item.grossSalary || item.totalEarnings || item.basicSalary).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-700">
                            ₹{Number(item.totalDeductions || item.deductions || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-[#1346a1] text-sm">
                            ₹{Number(item.netPay || item.totalPayable || 0).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                item.status === 'APPROVED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {item.status || 'APPROVED'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setViewingPayslip(item)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1346a1] hover:bg-[#1346a1]/10 transition-colors"
                                title="View A4 Payslip"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedEmployeeId(item.employeeId);
                                  setSelectedMonth(item.salaryMonth || 'Aug');
                                  setSelectedYear(String(item.salaryYear || 2026));
                                  setActiveTab('MANAGER');
                                  loadSalaryDetails(item.employeeId, item.salaryMonth || 'Aug', String(item.salaryYear || 2026));
                                }}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1346a1] hover:bg-[#1346a1]/10 transition-colors"
                                title="Open in HR Editor"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDownloadPdf(item)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-[#1346a1] hover:bg-[#1346a1]/10 transition-colors"
                                title="Download PDF"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* VIEWING MODAL                                                 */}
        {/* ============================================================= */}
        {viewingPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 no-print">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#1346a1]" />
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Payslip Document — {viewingPayslip.fullName || viewingPayslip.employeeName}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Period: {viewingPayslip.salaryMonth || 'Aug'}-{viewingPayslip.salaryYear || 2026}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingPayslip(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <PayslipDocument
                payslip={viewingPayslip}
                onDownloadPdf={() => handleDownloadPdf(viewingPayslip)}
                onEdit={() => {
                  setSelectedEmployeeId(viewingPayslip.employeeId || '');
                  setSelectedMonth(viewingPayslip.salaryMonth || 'Aug');
                  setSelectedYear(String(viewingPayslip.salaryYear || 2026));
                  setViewingPayslip(null);
                  setActiveTab('MANAGER');
                  loadSalaryDetails(viewingPayslip.employeeId || '', viewingPayslip.salaryMonth || 'Aug', String(viewingPayslip.salaryYear || 2026));
                }}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
