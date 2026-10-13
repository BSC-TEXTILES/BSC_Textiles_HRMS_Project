'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  PayslipDocument,
  PayslipData,
} from '@/components/payroll/PayslipDocument';
import {
  Building2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Users,
  CreditCard,
  Download,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  FileText,
  Eye,
  X,
  Layers,
  MapPin,
  Calendar,
  Briefcase,
  UserCheck,
  Sparkles,
  ArrowUpRight,
  TrendingUp,
  Percent,
  CheckCircle2,
  Receipt
} from 'lucide-react';

interface FloorManager {
  id: string;
  fullName: string;
  employeeId: string;
  employeeCode: string;
  email: string;
}

interface SectionSummary {
  id: string;
  name: string;
  code: string;
  employeeCount: number;
  grossSalary: number;
  netPayable: number;
}

interface FloorEmployee {
  payrollItemId: string;
  employeeId: string;
  employeeCode: string;
  fullName: string;
  designation: string;
  sectionName: string;
  shiftName: string;
  daysPayable: number;
  basicSalary: number;
  grossSalary: number;
  totalDeductions: number;
  netPayable: number;
  employerPf: number;
  employerEsi: number;
  employerContrib: number;
  ctc: number;
  status: string;
}

interface FloorData {
  id: string;
  name: string;
  floorNumber: number;
  locationId: string;
  locationCode: string;
  locationName: string;
  floorManager: FloorManager | null;
  summary: {
    totalEmployees: number;
    totalGrossSalary: number;
    totalDeductions: number;
    totalNetPayable: number;
    totalEmployerPf: number;
    totalEmployerEsi: number;
    totalEmployerContrib: number;
    totalCtc: number;
  };
  sections: SectionSummary[];
  employees: FloorEmployee[];
}

interface LocationData {
  id: string;
  code: string;
  name: string;
  city: string;
  summary: {
    totalEmployees: number;
    totalGrossSalary: number;
    totalDeductions: number;
    totalNetPayable: number;
    totalEmployerPf: number;
    totalEmployerEsi: number;
    totalEmployerContrib: number;
    totalCtc: number;
  };
  floors: FloorData[];
}

interface OverallSummary {
  totalLocations: number;
  totalFloors: number;
  totalEmployees: number;
  totalGrossSalary: number;
  totalDeductions: number;
  totalNetPayable: number;
  totalEmployerPf: number;
  totalEmployerEsi: number;
  totalEmployerContrib: number;
  totalCtc: number;
}

const AUTHORIZED_ROLES = [
  'SUPER_ADMIN',
  'ADMIN',
  'HR',
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'PAYROLL_MANAGER',
];

export default function FloorOverviewPage() {
  const { data: session, status } = useSession();

  // Filters State
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [selectedFloorId, setSelectedFloorId] = useState<string>('ALL');
  const [selectedSectionId, setSelectedSectionId] = useState<string>('ALL');
  const [selectedMonth, setSelectedMonth] = useState<string>('Aug');
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Data State
  const [loading, setLoading] = useState<boolean>(true);
  const [overallSummary, setOverallSummary] = useState<OverallSummary | null>(null);
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [availableFilters, setAvailableFilters] = useState<{
    locations: any[];
    floors: any[];
    sections: any[];
    months: string[];
    years: number[];
  }>({
    locations: [],
    floors: [],
    sections: [],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    years: [2025, 2026, 2027],
  });

  // Accordion State: which floor IDs are expanded
  const [expandedFloors, setExpandedFloors] = useState<Record<string, boolean>>({});

  // Payslip Preview Modal State
  const [viewingPayslip, setViewingPayslip] = useState<PayslipData | null>(null);
  const [loadingPayslip, setLoadingPayslip] = useState<boolean>(false);

  // Check RBAC
  const userRole = (session?.user as any)?.role || '';
  const isAuthorized = AUTHORIZED_ROLES.includes(userRole);

  const fetchFloorOverview = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/payroll/floor-salary-overview', {
        params: {
          locationCode: selectedLocation,
          floorId: selectedFloorId,
          sectionId: selectedSectionId,
          month: selectedMonth,
          year: selectedYear,
        },
      });

      if (res.data?.success) {
        setOverallSummary(res.data.overallSummary);
        setLocations(res.data.locations || []);
        if (res.data.availableFilters) {
          setAvailableFilters(res.data.availableFilters);
        }
        // Auto-expand floors with employees
        const initialExpand: Record<string, boolean> = {};
        res.data.locations?.forEach((loc: LocationData) => {
          loc.floors.forEach((fl: FloorData) => {
            if (fl.summary.totalEmployees > 0) {
              initialExpand[fl.id] = true;
            }
          });
        });
        setExpandedFloors(initialExpand);
      }
    } catch (err: any) {
      if (err.response?.status === 403) {
        toast.error(
          err.response?.data?.error ||
            'Access Denied: Only authorized HR and Admin roles can access the Floor-Wise Salary Overview.'
        );
      } else {
        toast.error('Failed to load Floor-Wise Salary Overview');
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedFloorId, selectedSectionId, selectedMonth, selectedYear]);

  useEffect(() => {
    fetchFloorOverview();
  }, [fetchFloorOverview]);

  const toggleFloor = (floorId: string) => {
    setExpandedFloors(prev => ({
      ...prev,
      [floorId]: !prev[floorId],
    }));
  };

  const expandAll = () => {
    const all: Record<string, boolean> = {};
    locations.forEach(loc => {
      loc.floors.forEach(fl => {
        all[fl.id] = true;
      });
    });
    setExpandedFloors(all);
  };

  const collapseAll = () => {
    setExpandedFloors({});
  };

  // Open individual employee payslip in modal
  const handleViewPayslip = async (emp: FloorEmployee) => {
    try {
      setLoadingPayslip(true);
      const res = await api.get('/payroll/load-or-calculate', {
        params: {
          employeeId: emp.employeeId,
          month: selectedMonth,
          year: selectedYear,
        },
      });
      const data = res.data?.data || res.data?.payslip;
      if (data) {
        setViewingPayslip(data);
      } else {
        toast.error('Payslip record not found');
      }
    } catch (err: any) {
      toast.error('Failed to load payslip preview');
      console.error(err);
    } finally {
      setLoadingPayslip(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = (payrollItemId: string, empName: string) => {
    const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/payroll/payslip/${payrollItemId}/pdf`;
    window.open(url, '_blank');
    toast.success(`Opening print-ready PDF for ${empName}`);
  };

  // Export Floor-Wise CSV
  const handleExportFloorCSV = () => {
    if (locations.length === 0) {
      toast.error('No floor data to export');
      return;
    }

    const headers = [
      'Showroom Code',
      'Showroom Name',
      'City',
      'Floor Number',
      'Floor Name',
      'Floor Manager Name',
      'Floor Manager Emp ID',
      'Employee Code',
      'Employee Name',
      'Designation',
      'Section',
      'Shift',
      'Days Payable',
      'Basic Salary',
      'Gross Salary',
      'Total Deductions',
      'Net Payable',
      'Employer PF',
      'Employer ESI',
      'Employer Contributions',
      'CTC',
    ].join(',');

    const rows: string[] = [];

    locations.forEach(loc => {
      loc.floors.forEach(fl => {
        const mgr = fl.floorManager ? fl.floorManager.fullName : 'Unassigned';
        const mgrId = fl.floorManager ? fl.floorManager.employeeCode : 'N/A';

        fl.employees.forEach(emp => {
          rows.push(
            [
              `"${loc.code}"`,
              `"${loc.name}"`,
              `"${loc.city}"`,
              fl.floorNumber,
              `"${fl.name}"`,
              `"${mgr}"`,
              `"${mgrId}"`,
              `"${emp.employeeCode}"`,
              `"${emp.fullName}"`,
              `"${emp.designation}"`,
              `"${emp.sectionName}"`,
              `"${emp.shiftName}"`,
              emp.daysPayable,
              emp.basicSalary,
              emp.grossSalary,
              emp.totalDeductions,
              emp.netPayable,
              emp.employerPf,
              emp.employerEsi,
              emp.employerContrib,
              emp.ctc,
            ].join(',')
          );
        });
      });
    });

    const blob = new Blob([headers + '\n' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `BSC_Floor_Wise_Salary_Overview_${selectedMonth}_${selectedYear}.csv`;
    link.click();
    toast.success('Floor-wise salary CSV downloaded successfully!');
  };

  // Filtered Floors by search query
  const filteredLocations = useMemo(() => {
    if (!searchQuery.trim()) return locations;
    const query = searchQuery.toLowerCase();

    return locations
      .map(loc => {
        const matchingFloors = loc.floors.filter(fl => {
          const matchFloor = fl.name.toLowerCase().includes(query);
          const matchMgr =
            fl.floorManager?.fullName.toLowerCase().includes(query) ||
            fl.floorManager?.employeeCode.toLowerCase().includes(query);
          const matchEmp = fl.employees.some(
            e =>
              e.fullName.toLowerCase().includes(query) ||
              e.employeeCode.toLowerCase().includes(query) ||
              e.sectionName.toLowerCase().includes(query)
          );
          return matchFloor || matchMgr || matchEmp;
        });

        return {
          ...loc,
          floors: matchingFloors,
        };
      })
      .filter(loc => loc.floors.length > 0);
  }, [locations, searchQuery]);

  // If unauthorized role, render access-denied state
  if (status !== 'loading' && !isAuthorized) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[70vh] p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4 shadow-sm">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            Restricted Access — Floor-Wise Salary Overview
          </h2>
          <p className="text-sm text-slate-500 max-w-md mt-2">
            Access to confidential floor-wise wage registers, gross payroll totals, and statutory contributions is strictly reserved for authorized HR Administrators and Senior Management.
          </p>
          <div className="mt-4 px-3.5 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
            Role requirement: <span className="font-bold">HR_MANAGER</span>, <span className="font-bold">ADMIN</span>, or <span className="font-bold">SUPER_ADMIN</span>.
            Floor Managers and general staff are restricted.
          </div>
          <Link
            href="/payroll"
            className="mt-6 px-4 py-2 rounded-xl bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold transition-all shadow-sm"
          >
            Return to Payroll Dashboard
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5 pb-12">
        {/* ============================================================= */}
        {/* TOP HEADER & BREADCRUMB                                       */}
        {/* ============================================================= */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between pb-1 gap-4 border-b border-slate-200/80">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <Link href="/payroll" className="hover:text-slate-600 transition-colors">
                Payroll
              </Link>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#1346a1] font-bold">Floor-Wise Salary Overview</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1346a1] to-[#8B263E] text-white flex items-center justify-center shadow-sm">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[#18181B] tracking-tight flex items-center gap-2">
                  Floor-Wise Salary Overview
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase tracking-wider border border-emerald-200 flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" /> HR & Admin Authorized
                  </span>
                </h1>
                <p className="text-xs text-slate-500">
                  Total salary, headcount, and statutory contributions across every floor, section, and showroom location with Floor Manager oversight.
                </p>
              </div>
            </div>
          </div>

          {/* Module Switcher & Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/payroll/payslips"
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-xs transition-all"
            >
              <Receipt className="w-4 h-4 text-[#1346a1]" />
              <span>HR Payslip Management</span>
            </Link>
            <button
              onClick={handleExportFloorCSV}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-xs transition-all"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export Floor CSV</span>
            </button>
            <button
              onClick={() => fetchFloorOverview()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold shadow-xs transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh Totals</span>
            </button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* FILTERS TOOLBAR                                               */}
        {/* ============================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-1">
            {/* Location Filter */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Showroom Location
              </label>
              <select
                value={selectedLocation}
                onChange={e => {
                  setSelectedLocation(e.target.value);
                  setSelectedFloorId('ALL');
                }}
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="ALL">All Showrooms (BEL, DAV, SHI, HUB)</option>
                {availableFilters.locations.map(loc => (
                  <option key={loc.id} value={loc.code}>
                    [{loc.code}] {loc.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Floor Filter */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Floor
              </label>
              <select
                value={selectedFloorId}
                onChange={e => setSelectedFloorId(e.target.value)}
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="ALL">All Floors</option>
                {availableFilters.floors
                  .filter(f => selectedLocation === 'ALL' || f.locationCode === selectedLocation)
                  .map(fl => (
                    <option key={fl.id} value={fl.id}>
                      [{fl.locationCode}] Floor {fl.floorNumber} — {fl.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Section Filter */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Section / Department
              </label>
              <select
                value={selectedSectionId}
                onChange={e => setSelectedSectionId(e.target.value)}
                className="w-full text-xs font-semibold rounded-lg border border-slate-200 px-2.5 py-1.5 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="ALL">All Sections</option>
                {availableFilters.sections.map(s => (
                  <option key={s.id} value={s.id}>
                    [{s.locationCode}] {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Month & Year Filter */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block mb-1">
                Salary Period
              </label>
              <div className="flex gap-1.5">
                <select
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                  className="w-1/2 text-xs font-semibold rounded-lg border border-slate-200 px-2 py-1.5 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
                >
                  {availableFilters.months.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={e => setSelectedYear(Number(e.target.value))}
                  className="w-1/2 text-xs font-semibold rounded-lg border border-slate-200 px-2 py-1.5 bg-slate-50/50 text-slate-800 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
                >
                  {availableFilters.years.map(y => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative md:w-64">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search floor, manager, staff..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-[#1346a1] text-slate-800 placeholder-slate-400"
            />
          </div>
        </div>

        {/* ============================================================= */}
        {/* EXECUTIVE KPI SUMMARY RIBBON                                  */}
        {/* ============================================================= */}
        {overallSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Total On-Floor Staff */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Staff Count</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div className="mt-2">
                <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {overallSummary.totalEmployees}
                </span>
                <span className="text-[11px] text-slate-500 block">Across active floors</span>
              </div>
            </div>

            {/* Total Gross Salary */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Total Gross</span>
                <CreditCard className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="mt-2">
                <span className="text-xl font-extrabold text-indigo-900 tracking-tight">
                  ₹{overallSummary.totalGrossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-500 block">Wages + Incentives</span>
              </div>
            </div>

            {/* Total Deductions */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Total Deductions</span>
                <TrendingUp className="w-4 h-4 text-amber-600 rotate-180" />
              </div>
              <div className="mt-2">
                <span className="text-xl font-extrabold text-amber-900 tracking-tight">
                  ₹{overallSummary.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-500 block">PF, ESI & Advances</span>
              </div>
            </div>

            {/* Total Net Payable */}
            <div className="bg-gradient-to-br from-[#1346a1] to-[#0e3882] rounded-2xl p-4 text-white shadow-md flex flex-col justify-between">
              <div className="flex items-center justify-between text-rose-200 text-xs font-semibold">
                <span>Net Payable</span>
                <Sparkles className="w-4 h-4 text-amber-300" />
              </div>
              <div className="mt-2">
                <span className="text-xl font-extrabold text-white tracking-tight">
                  ₹{overallSummary.totalNetPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-rose-200/90 block">Disbursal Amount</span>
              </div>
            </div>

            {/* Total Employer Contributions */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Employer Contrib.</span>
                <Percent className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="mt-2">
                <span className="text-xl font-extrabold text-emerald-900 tracking-tight">
                  ₹{overallSummary.totalEmployerContrib.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-500 block">PF (12%) + ESI (3.25%)</span>
              </div>
            </div>

            {/* Total CTC */}
            <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
                <span>Total CTC</span>
                <Layers className="w-4 h-4 text-purple-600" />
              </div>
              <div className="mt-2">
                <span className="text-xl font-extrabold text-purple-900 tracking-tight">
                  ₹{overallSummary.totalCtc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-500 block">Company Expenditure</span>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* VIEW CONTROLS & EXPAND/COLLAPSE TOGGLES                       */}
        {/* ============================================================= */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <span>Viewing:</span>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 border border-slate-200 font-bold">
              {filteredLocations.reduce((sum, l) => sum + l.floors.length, 0)} Floors across {filteredLocations.length} Showroom(s)
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Expand All
            </button>
            <span className="text-slate-300">|</span>
            <button
              onClick={collapseAll}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded-lg hover:bg-slate-100 transition-colors"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* FLOOR CARDS BY SHOWROOM LOCATION                              */}
        {/* ============================================================= */}
        {loading ? (
          <div className="flex flex-col items-center justify-center p-16 bg-white rounded-2xl border border-slate-200 shadow-xs">
            <RefreshCw className="w-8 h-8 text-[#1346a1] animate-spin mb-3" />
            <p className="text-sm font-semibold text-slate-700">Computing floor-wise salary registers...</p>
            <p className="text-xs text-slate-400 mt-1">Fetching live attendance, incentives, and PF/ESI contributions</p>
          </div>
        ) : filteredLocations.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mb-2" />
            <p className="text-sm font-bold text-slate-700">No floors match the current filter selection</p>
            <p className="text-xs text-slate-400 mt-1">Try resetting the location, floor, or search filter.</p>
          </div>
        ) : (
          filteredLocations.map(location => (
            <div
              key={location.id}
              className="bg-white rounded-3xl border border-slate-200/90 shadow-sm overflow-hidden"
            >
              {/* Showroom Location Banner */}
              <div className="bg-slate-50/90 border-b border-slate-200/80 px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 shadow-xs flex items-center justify-center text-[#1346a1] font-bold text-sm">
                    {location.code}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-slate-900 tracking-tight">
                        {location.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                        {location.city}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {location.floors.length} Floor(s) • Total Staff: {location.summary.totalEmployees}
                    </p>
                  </div>
                </div>

                {/* Location Summary Badges */}
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Gross</span>
                    <span className="font-bold text-slate-800">
                      ₹{location.summary.totalGrossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Net Payable</span>
                    <span className="font-bold text-[#1346a1]">
                      ₹{location.summary.totalNetPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="h-6 w-px bg-slate-200" />
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Employer Contrib</span>
                    <span className="font-bold text-emerald-700">
                      ₹{location.summary.totalEmployerContrib.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>

              {/* Floors Container */}
              <div className="p-4 sm:p-5 space-y-4">
                {location.floors.map(floor => {
                  const isExpanded = !!expandedFloors[floor.id];

                  return (
                    <div
                      key={floor.id}
                      className="rounded-2xl border border-slate-200 bg-white hover:border-slate-300 transition-all shadow-xs overflow-hidden"
                    >
                      {/* Floor Header & Floor Manager Bar */}
                      <div className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-50/50 to-white">
                        {/* Floor Particulars & Floor Manager */}
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-lg bg-[#1346a1]/10 text-[#1346a1] font-bold text-xs flex items-center justify-center">
                              F{floor.floorNumber}
                            </span>
                            <div>
                              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                {floor.name}
                                <span className="text-[11px] font-normal text-slate-500">
                                  (Floor {floor.floorNumber})
                                </span>
                              </h3>
                              <p className="text-[11px] text-slate-500">
                                Location: [{floor.locationCode}] {floor.locationName}
                              </p>
                            </div>
                          </div>

                          {/* Floor Manager Card */}
                          <div className="sm:ml-4 px-3 py-1.5 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-center gap-2 text-xs">
                            <UserCheck className="w-4 h-4 text-amber-700 shrink-0" />
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-amber-950">
                                  {floor.floorManager ? floor.floorManager.fullName : 'Unassigned Floor Lead'}
                                </span>
                                {floor.floorManager && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-200/60 text-amber-900 text-[10px] font-mono font-bold">
                                    {floor.floorManager.employeeCode}
                                  </span>
                                )}
                              </div>
                              <span className="text-[10px] text-amber-700 uppercase tracking-wider font-semibold block">
                                Assigned Floor Manager
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Floor Key Metrics */}
                        <div className="flex items-center gap-3 sm:gap-5 text-xs font-semibold flex-wrap">
                          <div className="text-center sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Staff</span>
                            <span className="font-bold text-slate-900 text-sm">{floor.summary.totalEmployees}</span>
                          </div>
                          <div className="text-center sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Gross Salary</span>
                            <span className="font-bold text-slate-800 text-sm">
                              ₹{floor.summary.totalGrossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="text-center sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Deductions</span>
                            <span className="font-bold text-amber-700 text-sm">
                              ₹{floor.summary.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="text-center sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Net Payable</span>
                            <span className="font-bold text-[#1346a1] text-sm">
                              ₹{floor.summary.totalNetPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="text-center sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider block">Employer Contrib</span>
                            <span className="font-bold text-emerald-700 text-sm">
                              ₹{floor.summary.totalEmployerContrib.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>

                          {/* Accordion Toggle */}
                          <button
                            onClick={() => toggleFloor(floor.id)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors ml-2"
                            title={isExpanded ? 'Collapse Floor Employees' : 'Expand Floor Employees'}
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {/* Section Chips */}
                      {floor.sections.length > 0 && (
                        <div className="px-5 py-2.5 bg-slate-50/50 border-t border-slate-100 flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                            Sections on this Floor:
                          </span>
                          {floor.sections.map(sec => (
                            <span
                              key={sec.id}
                              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1.5 shadow-2xs"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-[#1346a1]" />
                              <span>{sec.name}</span>
                              <span className="text-slate-400 font-normal">({sec.employeeCount} staff)</span>
                              <span className="text-emerald-700 font-bold ml-1">
                                ₹{sec.netPayable.toLocaleString('en-IN')}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Expandable Employee Drill-Down Table */}
                      {isExpanded && (
                        <div className="border-t border-slate-200 bg-white p-4 overflow-x-auto">
                          {floor.employees.length === 0 ? (
                            <p className="text-xs text-slate-400 py-3 text-center">
                              No active employees recorded on this floor for {selectedMonth}-{selectedYear}.
                            </p>
                          ) : (
                            <table className="w-full text-left border-collapse min-w-[800px]">
                              <thead>
                                <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wider font-bold text-slate-400 bg-slate-50/50">
                                  <th className="py-2.5 px-3">Emp ID</th>
                                  <th className="py-2.5 px-3">Employee Name</th>
                                  <th className="py-2.5 px-3">Designation</th>
                                  <th className="py-2.5 px-3">Section</th>
                                  <th className="py-2.5 px-3 text-center">Days</th>
                                  <th className="py-2.5 px-3 text-right">Basic</th>
                                  <th className="py-2.5 px-3 text-right">Gross Salary</th>
                                  <th className="py-2.5 px-3 text-right">Deductions</th>
                                  <th className="py-2.5 px-3 text-right text-[#1346a1]">Net Payable</th>
                                  <th className="py-2.5 px-3 text-right">Employer Contrib</th>
                                  <th className="py-2.5 px-3 text-right">CTC</th>
                                  <th className="py-2.5 px-3 text-center">Actions</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                                {floor.employees.map(emp => {
                                  const isReference = emp.employeeCode === '1372';

                                  return (
                                    <tr
                                      key={emp.employeeId}
                                      className={`hover:bg-slate-50/80 transition-colors ${
                                        isReference ? 'bg-amber-50/40 font-semibold' : ''
                                      }`}
                                    >
                                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                                        {emp.employeeCode}
                                        {isReference && (
                                          <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-amber-200 text-amber-900 font-bold">
                                            Reference Sample
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-2.5 px-3 font-medium text-slate-900">
                                        {emp.fullName}
                                      </td>
                                      <td className="py-2.5 px-3 text-slate-600">{emp.designation}</td>
                                      <td className="py-2.5 px-3">
                                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[11px]">
                                          {emp.sectionName}
                                        </span>
                                      </td>
                                      <td className="py-2.5 px-3 text-center font-mono">{emp.daysPayable}</td>
                                      <td className="py-2.5 px-3 text-right font-mono">
                                        ₹{emp.basicSalary.toLocaleString('en-IN')}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900">
                                        ₹{emp.grossSalary.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-mono text-amber-700">
                                        ₹{emp.totalDeductions.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-mono font-bold text-[#1346a1]">
                                        ₹{emp.netPayable.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                                        ₹{emp.employerContrib.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-3 text-right font-mono text-purple-900">
                                        ₹{emp.ctc.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                      </td>
                                      <td className="py-2.5 px-3 text-center">
                                        <div className="flex items-center justify-center gap-1.5">
                                          <button
                                            onClick={() => handleViewPayslip(emp)}
                                            className="p-1 rounded-md text-slate-600 hover:text-[#1346a1] hover:bg-slate-100 transition-colors"
                                            title="View Full Payslip Document"
                                          >
                                            <Eye className="w-4 h-4" />
                                          </button>
                                          <button
                                            onClick={() => handleDownloadPdf(emp.payrollItemId, emp.fullName)}
                                            className="p-1 rounded-md text-slate-600 hover:text-emerald-700 hover:bg-slate-100 transition-colors"
                                            title="Download Print-Ready PDF"
                                          >
                                            <Download className="w-4 h-4" />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* ============================================================= */}
        {/* VIEWING PAYSLIP MODAL (AUTHENTIC BSC FORMAT)                  */}
        {/* ============================================================= */}
        {viewingPayslip && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-4 sm:p-6 space-y-4 max-h-[95vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#1346a1]" />
                  <div>
                    <h3 className="font-bold text-sm text-slate-900">
                      Authentic Payslip Document — {viewingPayslip.fullName}
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Period: {viewingPayslip.salaryMonth || 'Aug'}-{viewingPayslip.salaryYear || 2026} • EMP: {viewingPayslip.employeeCode}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setViewingPayslip(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Render reusable PayslipDocument */}
              <PayslipDocument
                payslip={viewingPayslip}
              />
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
