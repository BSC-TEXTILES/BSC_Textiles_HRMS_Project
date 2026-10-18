'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  UserMinus,
  Users,
  LogOut,
  UserX,
  CheckCircle2,
  Clock,
  Calculator,
  FileCheck,
  BadgeCheck,
  Banknote,
  AlertTriangle,
  Search,
  Building2,
  Download,
  Plus,
  RotateCw,
  FileText,
  Eye,
  Edit3,
  Check,
  X,
  ArrowRight,
  DollarSign,
  Calendar,
  Filter,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Send,
  HelpCircle,
  ExternalLink,
} from 'lucide-react';
import { FormerStaffCardDrawer, FormerDrawerType } from './FormerStaffCardDrawer';

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
  const [allExits, setAllExits] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Summary Card Detail Drawer State
  const [activeDrawer, setActiveDrawer] = useState<FormerDrawerType>(null);
  const card1Ref = useRef<HTMLDivElement>(null);
  const card2Ref = useRef<HTMLDivElement>(null);
  const card3Ref = useRef<HTMLDivElement>(null);
  const card4Ref = useRef<HTMLDivElement>(null);
  const [activeTriggerRef, setActiveTriggerRef] = useState<React.RefObject<HTMLElement | null>>(card1Ref);

  // Quick filter tab
  const [activeTab, setActiveTab] = useState<'ALL' | 'RESIGNED' | 'TERMINATED' | 'READY_FOR_PAYMENT' | 'PAID'>('ALL');

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

  const [paymentForm, setPaymentForm] = useState({
    paymentReference: '',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'BANK_TRANSFER',
  });

  // Fetch Stats & Exits
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/exits/dashboard-stats', {
        params: locationFilter ? { locationId: locationFilter } : {},
      });
      setStats(res.data?.stats || res.data || {});
    } catch (e: any) {
      console.error('Failed to load stats:', e);
    }
  }, [locationFilter]);

  // Fetch all exits for full synchronization between summary cards, drawers, and tabs
  const fetchAllExits = useCallback(async () => {
    try {
      const params: any = { page: 1, limit: 100 };
      if (search) params.search = search;
      if (locationFilter) params.locationId = locationFilter;
      if (exitTypeFilter) params.exitType = exitTypeFilter;

      const res = await api.get('/exits', { params });
      const list = res.data?.exits || res.data?.employees || [];
      setAllExits(list);
    } catch (e) {
      console.error('Failed to load all exits for card synchronization:', e);
    }
  }, [search, locationFilter, exitTypeFilter]);

  const fetchExits = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search) params.search = search;
      if (locationFilter) params.locationId = locationFilter;

      // Handle active tab or explicit filters
      if (activeTab === 'RESIGNED') {
        params.exitType = 'RESIGNATION';
      } else if (activeTab === 'TERMINATED') {
        params.exitType = 'TERMINATION';
      } else if (activeTab === 'READY_FOR_PAYMENT') {
        params.status = 'APPROVED';
      } else if (activeTab === 'PAID') {
        params.status = 'PAID';
      } else {
        if (exitTypeFilter) params.exitType = exitTypeFilter;
        if (statusFilter) params.status = statusFilter;
      }

      const res = await api.get('/exits', { params });
      const list = res.data?.exits || res.data?.employees || [];
      setExits(list);
      setTotalCount(res.data?.pagination?.total || res.data?.total || list.length);
    } catch (e: any) {
      console.error('Failed to load exits:', e);
      toast.error('Could not fetch former employees data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [page, limit, search, exitTypeFilter, statusFilter, locationFilter, activeTab]);

  const fetchMetadata = useCallback(async () => {
    try {
      const [locRes, empRes] = await Promise.all([
        api.get('/locations/all').catch(() => ({ data: [] })),
        api.get('/employees/lookup').catch(() => api.get('/employees?limit=100').then((r) => ({ data: r.data?.employees || [] }))),
      ]);
      setLocations(locRes.data || []);
      const emps = Array.isArray(empRes.data) ? empRes.data : empRes.data?.employees || [];
      setAllEmployees(emps);
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
    fetchAllExits();
  }, [fetchExits, fetchAllExits]);

  // Synchronized counts matching the current dataset
  const tabCounts = useMemo(() => {
    const dataset = allExits.length > 0 ? allExits : exits;
    const all = dataset.length;
    const resigned = dataset.filter((item) => item.exit_type === 'RESIGNATION').length;
    const terminated = dataset.filter((item) => item.exit_type === 'TERMINATION').length;
    const readyForPayment = dataset.filter((item) => {
      const s = item.settlement_status || item.settlement?.status;
      return s === 'APPROVED' || s === 'PAYMENT_PENDING' || item.exit_status === 'READY_FOR_PAYMENT';
    }).length;
    const paid = dataset.filter((item) => {
      const s = item.settlement_status || item.settlement?.status || item.exit_status;
      return s === 'PAID' || s === 'CLOSED';
    }).length;

    return {
      all,
      resigned,
      terminated,
      readyForPayment,
      paid,
    };
  }, [allExits, exits]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchStats(), fetchExits(), fetchAllExits()]);
  };

  // Actions
  const handleInitiateExit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!initiateForm.employeeId) {
      toast.error('Please select an employee');
      return;
    }
    try {
      await api.post('/exits/initiate', {
        employeeId: initiateForm.employeeId,
        exitType: initiateForm.exitType,
        resignationDate: initiateForm.resignationDate,
        noticePeriodDays: initiateForm.noticePeriodDays,
        lastWorkingDay: initiateForm.lastWorkingDate,
        reason: initiateForm.reason || 'Standard resignation process',
      });
      toast.success('Staff departure recorded! Clearance tasks created.');
      setInitiateModalOpen(false);
      setInitiateForm({
        employeeId: '',
        exitType: 'RESIGNATION',
        resignationDate: new Date().toISOString().split('T')[0],
        noticePeriodDays: 30,
        lastWorkingDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        reason: '',
      });
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to start exit process');
    }
  };

  const handleOpenClearance = async (item: any) => {
    setSelectedExit(item);
    setClearanceModalOpen(true);
    try {
      const exitId = item.exit_id || item.id;
      const res = await api.get(`/exits/${exitId}`);
      if (res.data?.clearanceTasks) {
        setSelectedExit((prev: any) => ({
          ...prev,
          clearanceTasks: res.data.clearanceTasks,
        }));
      }
    } catch (e) {
      console.error('Error loading clearance tasks:', e);
    }
  };

  const handleUpdateClearance = async (taskId: string, status: string, recoveryAmount = 0, remarks = '') => {
    try {
      await api.put(`/exits/clearance/${taskId}`, { status, recoveryAmount, remarks });
      toast.success('Clearance task updated');
      const exitId = selectedExit.exit_id || selectedExit.id;
      const res = await api.get(`/exits/${exitId}`);
      setSelectedExit(res.data?.exit || res.data);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to update clearance');
    }
  };

  const handleCalculateSettlement = async (item: any) => {
    try {
      const exitId = item.exit_id || item.id;
      // Backend contract: POST /exits/:id/calculate-fnf returns the settlement entity.
      const res = await api.post(`/exits/${exitId}/calculate-fnf`);
      toast.success('Final pay calculated successfully');
      setSelectedSettlement(res.data?.settlement || res.data);
      setCalcModalOpen(true);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to calculate final pay');
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSettlement) return;
    if (!paymentForm.paymentReference) {
      toast.error('Bank Reference / UTR Number is required');
      return;
    }
    try {
      await api.post(`/exits/settlement/${selectedSettlement.id}/pay`, paymentForm);
      toast.success('Payment recorded! Final settlement is now closed.');
      setPaymentModalOpen(false);
      fetchStats();
      fetchExits();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to record payment');
    }
  };

  const handleDownloadPdf = async (settlementId: string, employeeCode: string) => {
    try {
      const res = await api.get(`/exits/settlement/${settlementId}/pdf`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `Final_Settlement_Statement_${employeeCode || 'BSC'}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast.success('Downloaded Final Pay Statement PDF');
    } catch (e: any) {
      toast.error('Could not download Statement PDF');
    }
  };

  // Drawer Action Callbacks
  // Fetch the real settlement record; the summary row only carries a subset of
  // fields, so never fabricate a breakdown from the net amount alone.
  const openBreakdownWithRealSettlement = async (item: any, fallback: any) => {
    const exitId = item.exit_id || item.id;
    setSelectedSettlement(fallback);
    setCalcModalOpen(true);
    try {
      const res = await api.get(`/exits/${exitId}/settlement`);
      if (res.data) {
        setSelectedSettlement(res.data);
      }
    } catch {
      // Keep the summary-card fallback; the modal shows whatever is known.
    }
  };

  const handleOpenBreakdownFromDrawer = (item: any) => {
    const netAmount = item.settlement_amount ?? item.settlement?.net_payable ?? 0;
    openBreakdownWithRealSettlement(
      item,
      item.settlement || {
        id: item.settlement_id || item.id,
        net_payable: netAmount,
      }
    );
  };

  const handleOpenPaymentFromDrawer = (item: any) => {
    const netAmount = item.settlement_amount ?? item.settlement?.net_payable ?? 0;
    setSelectedSettlement(
      item.settlement || {
        id: item.settlement_id || item.id,
        net_payable: netAmount,
      }
    );
    setPaymentModalOpen(true);
  };

  const handleShowInTable = (
    tabKey: 'ALL' | 'RESIGNED' | 'TERMINATED' | 'READY_FOR_PAYMENT' | 'PAID',
    newStatusFilter?: string
  ) => {
    setActiveTab(tabKey);
    if (newStatusFilter !== undefined) {
      setStatusFilter(newStatusFilter);
    }
    setActiveDrawer(null);
  };

  // Export current list to CSV (uses filtered records)
  const handleExportCsv = () => {
    const exportDataset = allExits.length > 0 ? allExits : exits;
    if (exportDataset.length === 0) {
      toast.error('No records to export');
      return;
    }

    const headers = ['Employee Code', 'Full Name', 'Branch', 'Department', 'Exit Type', 'Last Working Day', 'Status', 'Net Amount (INR)', 'Payment Ref'];
    const rows = exportDataset.map((item) => {
      const name = item.full_name || item.employee_name || 'Staff Member';
      const code = item.employee_code || item.code || '';
      const loc = item.location_name || item.location?.name || 'All Locations';
      const dept = item.department_name || item.department?.name || 'General';
      const exitType = item.exit_type || 'RESIGNATION';
      const lastDay = item.last_working_day || item.last_working_date ? new Date(item.last_working_day || item.last_working_date).toLocaleDateString('en-IN') : 'N/A';
      const status = item.settlement_status || item.settlement?.status || item.exit_status || 'PENDING';
      const amount = item.settlement_amount ?? item.settlement?.net_payable ?? '0';
      const ref = item.payment_reference || item.settlement?.payment_reference || '';

      return [
        `"${code}"`,
        `"${name.replace(/"/g, '""')}"`,
        `"${loc.replace(/"/g, '""')}"`,
        `"${dept.replace(/"/g, '""')}"`,
        `"${exitType}"`,
        `"${lastDay}"`,
        `"${status}"`,
        `"${amount}"`,
        `"${ref}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Staff_Exits_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Staff exits exported to CSV');
  };

  // Notice Period Auto-Calculator
  const handleNoticePeriodChange = (days: number) => {
    const resDate = new Date(initiateForm.resignationDate);
    const lwd = new Date(resDate.getTime() + days * 86400000);
    setInitiateForm((prev) => ({
      ...prev,
      noticePeriodDays: days,
      lastWorkingDate: lwd.toISOString().split('T')[0],
    }));
  };

  const handleResignationDateChange = (dateStr: string) => {
    const resDate = new Date(dateStr);
    const lwd = new Date(resDate.getTime() + initiateForm.noticePeriodDays * 86400000);
    setInitiateForm((prev) => ({
      ...prev,
      resignationDate: dateStr,
      lastWorkingDate: lwd.toISOString().split('T')[0],
    }));
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
        {/* TOP HEADER */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200/80 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 shrink-0">
              <UserMinus className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  Staff Exits & Final Pay
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                  F&F Settlement
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Track staff who have left, department handovers, final salary calculations, and bank payouts.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2.5">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
              title="Refresh Data"
            >
              <RotateCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            <button
              onClick={handleExportCsv}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              title="Export to Excel / CSV"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Export CSV
            </button>

            <button
              onClick={() => setInitiateModalOpen(true)}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-semibold shadow-sm transition-all flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Staff Exit
            </button>
          </div>
        </div>

        {/* 4 HIGH-IMPACT METRIC CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Total Exits */}
          <div
            ref={card1Ref}
            role="button"
            tabIndex={0}
            aria-label="View Total Staff Left details"
            onClick={() => {
              setActiveTriggerRef(card1Ref);
              setActiveDrawer('TOTAL_EXITS');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTriggerRef(card1Ref);
                setActiveDrawer('TOTAL_EXITS');
              }
            }}
            className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-all shadow-sm hover:shadow-md hover:border-blue-400 dark:hover:border-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Total Staff Left
                </span>
                <div className="w-9 h-9 rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center transition-transform group-hover:scale-105">
                  <Users className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {tabCounts.all}
              </div>
              <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{tabCounts.resigned} Resigned</span>
                <span>•</span>
                <span className="text-slate-500">{tabCounts.terminated} Terminated</span>
              </div>
            </div>
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:text-blue-700 dark:group-hover:text-blue-300">
              <span>View Details</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </div>

          {/* Card 2: Clearances */}
          <div
            ref={card2Ref}
            role="button"
            tabIndex={0}
            aria-label="View Handovers Pending details"
            onClick={() => {
              setActiveTriggerRef(card2Ref);
              setActiveDrawer('CLEARANCES_PENDING');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTriggerRef(card2Ref);
                setActiveDrawer('CLEARANCES_PENDING');
              }
            }}
            className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-all shadow-sm hover:shadow-md hover:border-amber-400 dark:hover:border-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Handovers Pending
                </span>
                <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center transition-transform group-hover:scale-105">
                  <Clock className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {stats.awaitingClearance || 0}
              </div>
              <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
                <span>Department asset & key returns</span>
              </div>
            </div>
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-amber-600 dark:text-amber-400 group-hover:text-amber-700 dark:group-hover:text-amber-300">
              <span>View Details</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </div>

          {/* Card 3: Ready for Payment */}
          <div
            ref={card3Ref}
            role="button"
            tabIndex={0}
            aria-label="View Ready for Payout details"
            onClick={() => {
              setActiveTriggerRef(card3Ref);
              setActiveDrawer('READY_FOR_PAYOUT');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTriggerRef(card3Ref);
                setActiveDrawer('READY_FOR_PAYOUT');
              }
            }}
            className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-all shadow-sm hover:shadow-md hover:border-emerald-400 dark:hover:border-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Ready for Payout
                </span>
                <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center transition-transform group-hover:scale-105">
                  <Banknote className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {tabCounts.readyForPayment}
              </div>
              <div className="mt-2 text-xs text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 inline" />
                <span>Approved & ready for bank transfer</span>
              </div>
            </div>
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
              <span>View Details</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </div>

          {/* Card 4: Closed & Paid */}
          <div
            ref={card4Ref}
            role="button"
            tabIndex={0}
            aria-label="View Completed and Paid details"
            onClick={() => {
              setActiveTriggerRef(card4Ref);
              setActiveDrawer('COMPLETED_PAID');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveTriggerRef(card4Ref);
                setActiveDrawer('COMPLETED_PAID');
              }
            }}
            className="group cursor-pointer p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 transition-all shadow-sm hover:shadow-md hover:border-purple-400 dark:hover:border-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2 flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Completed & Paid
                </span>
                <div className="w-9 h-9 rounded-lg bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center transition-transform group-hover:scale-105">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
              </div>
              <div className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                {tabCounts.paid}
              </div>
              <div className="mt-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
                <span>Settlement fully disbursed</span>
              </div>
            </div>
            <div className="mt-3.5 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-semibold text-purple-600 dark:text-purple-400 group-hover:text-purple-700 dark:group-hover:text-purple-300">
              <span>View Details</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </div>

        {/* QUICK VIEW TABS & FILTERS */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
          {/* Quick Filter Pill Tabs */}
          <div className="flex items-center flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            {[
              { id: 'ALL', label: 'All Records', count: tabCounts.all },
              { id: 'RESIGNED', label: 'Resigned', count: tabCounts.resigned },
              { id: 'TERMINATED', label: 'Terminated', count: tabCounts.terminated },
              { id: 'READY_FOR_PAYMENT', label: 'Ready to Pay', count: tabCounts.readyForPayment },
              { id: 'PAID', label: 'Paid & Closed', count: tabCounts.paid },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setStatusFilter('');
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === tab.id
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Search and Dropdown Controls */}
          <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center flex-1">
              {/* Search with cleanly positioned SVG icon */}
              <div className="relative flex-1 min-w-[260px]">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Search className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  placeholder="Search staff name, employee code, or email..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Branch Picker */}
              <div className="relative min-w-[180px]">
                <select
                  value={locationFilter}
                  onChange={(e) => {
                    setLocationFilter(e.target.value);
                    setPage(1);
                  }}
                  className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="">All Branches</option>
                  {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                      {loc.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Exit Type Picker */}
              <div className="relative min-w-[160px]">
                <select
                  value={exitTypeFilter}
                  onChange={(e) => {
                    setExitTypeFilter(e.target.value);
                    setActiveTab('ALL');
                    setPage(1);
                  }}
                  className="w-full py-2.5 px-3 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="">All Exit Types</option>
                  <option value="RESIGNATION">Resignation</option>
                  <option value="TERMINATION">Termination</option>
                  <option value="RETIREMENT">Retirement</option>
                  <option value="CONTRACT_END">Contract End</option>
                </select>
              </div>
            </div>

            {(search || locationFilter || exitTypeFilter || statusFilter || activeTab !== 'ALL') && (
              <button
                onClick={() => {
                  setSearch('');
                  setLocationFilter('');
                  setExitTypeFilter('');
                  setStatusFilter('');
                  setActiveTab('ALL');
                  setPage(1);
                }}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 px-3 py-2 bg-blue-50 dark:bg-blue-950/40 rounded-xl transition-all self-start lg:self-auto"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>

        {/* STAFF EXITS & SETTLEMENTS TABLE */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Staff Member</th>
                  <th className="px-6 py-3.5">Branch & Department</th>
                  <th className="px-6 py-3.5">Departure Details</th>
                  <th className="px-6 py-3.5">Handover Checklist</th>
                  <th className="px-6 py-3.5">Final Pay Status</th>
                  <th className="px-6 py-3.5">Net Amount</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center text-slate-400">
                      <div className="inline-block animate-spin rounded-full h-8 w-8 border-3 border-blue-600 border-t-transparent mb-2"></div>
                      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Loading ex-employee records...</p>
                    </td>
                  </tr>
                ) : exits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="max-w-md mx-auto space-y-3">
                        <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400 mx-auto">
                          <Users className="w-7 h-7" />
                        </div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Staff Records Found</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                          We could not find any departed staff records matching your current filter. You can reset filters or start a new staff exit.
                        </p>
                        <div className="pt-2 flex justify-center gap-2">
                          <button
                            onClick={() => {
                              setSearch('');
                              setLocationFilter('');
                              setExitTypeFilter('');
                              setStatusFilter('');
                              setActiveTab('ALL');
                            }}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold"
                          >
                            Clear Filters
                          </button>
                          <button
                            onClick={() => setInitiateModalOpen(true)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            Add Staff Exit
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : (
                  exits.map((item) => {
                    const employeeName = item.full_name || item.employee_name || 'Staff Member';
                    const employeeCode = item.employee_code || item.code || '—';
                    const email = item.email || '';
                    const branch = item.location_name || item.location?.name || 'BSC Hub';
                    const department = item.department_name || item.department?.name || 'General Operations';
                    const exitType = item.exit_type || 'RESIGNATION';
                    const lastWorkingDay = item.last_working_day || item.last_working_date;
                    const settlement = item.settlement;
                    const settlementStatus = item.settlement_status || settlement?.status || (item.exit_status === 'PAID' ? 'PAID' : 'PENDING');
                    const netAmount = item.settlement_amount ?? settlement?.net_payable ?? null;
                    const paymentRef = item.payment_reference || settlement?.payment_reference || null;

                    // Clearance calculations
                    const clearanceTasks = item.clearanceTasks || [];
                    const approvedTasks = clearanceTasks.filter((t: any) => t.status === 'APPROVED' || t.status === 'WAIVED' || t.status === 'CLEARED').length;
                    const totalTasks = clearanceTasks.length;
                    const hasClearance = totalTasks > 0;
                    const isAllCleared = hasClearance && approvedTasks === totalTasks;

                    return (
                      <tr
                        key={item.id || item.exit_id}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (target.closest('button, a, input, select')) return;
                          if (netAmount !== null || item.settlement_id) {
                            openBreakdownWithRealSettlement(
                              item,
                              settlement || {
                                id: item.settlement_id || item.id,
                                net_payable: netAmount,
                              }
                            );
                          } else {
                            handleOpenClearance(item);
                          }
                        }}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                      >
                        {/* 1. Employee */}
                        <td className="px-6 py-4">
                          <Link
                            href={`/employees/profile/${item.employee_id || item.employeeId || item.id}`}
                            className="group/emp flex items-center gap-3 hover:opacity-95 transition-opacity"
                            title="View Employee Profile"
                          >
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center font-bold text-xs shadow-sm shrink-0 group-hover/emp:ring-2 group-hover/emp:ring-blue-400">
                              {employeeName.substring(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white leading-tight group-hover/emp:text-blue-600 dark:group-hover/emp:text-blue-400 transition-colors flex items-center gap-1">
                                <span>{employeeName}</span>
                                <ExternalLink className="w-3 h-3 opacity-0 group-hover/emp:opacity-100 transition-opacity text-blue-500" />
                              </div>
                              <div className="text-xs text-slate-500 font-mono mt-0.5 group-hover/emp:text-blue-500 transition-colors">{employeeCode}</div>
                              {email && <div className="text-[11px] text-slate-400 truncate max-w-[180px]">{email}</div>}
                            </div>
                          </Link>
                        </td>

                        {/* 2. Branch & Department */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[200px]">{branch}</span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{department}</div>
                        </td>

                        {/* 3. Departure Details */}
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                              exitType === 'TERMINATION'
                                ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                                : exitType === 'RETIREMENT'
                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300'
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                            }`}
                          >
                            {exitType === 'RESIGNATION' ? 'Resigned' : exitType === 'TERMINATION' ? 'Terminated' : exitType}
                          </span>
                          <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>Last Day: {lastWorkingDay ? new Date(lastWorkingDay).toLocaleDateString('en-IN') : 'N/A'}</span>
                          </div>
                        </td>

                        {/* 4. Handover Checklist */}
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleOpenClearance(item)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${
                              isAllCleared
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                                : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100'
                            }`}
                            title="Click to view department clearances"
                          >
                            {isAllCleared ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                            )}
                            <span>{hasClearance ? `${approvedTasks}/${totalTasks} Signed Off` : 'View Checklist'}</span>
                          </button>
                        </td>

                        {/* 5. Final Pay Status */}
                        <td className="px-6 py-4">
                          {settlementStatus === 'PAID' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              Paid & Closed
                            </span>
                          ) : settlementStatus === 'APPROVED' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                              <BadgeCheck className="w-3 h-3" />
                              Ready for Payment
                            </span>
                          ) : settlementStatus === 'PENDING_APPROVAL' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                              <Clock className="w-3 h-3" />
                              Pending Approval
                            </span>
                          ) : settlementStatus === 'DRAFT' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                              <Edit3 className="w-3 h-3" />
                              HR Review
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Needs Calculation
                            </span>
                          )}
                        </td>

                        {/* 6. Net Amount */}
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-900 dark:text-white text-base">
                            {netAmount !== null
                              ? `₹${Number(netAmount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                              : '—'}
                          </div>
                          {paymentRef && (
                            <div className="text-[11px] text-slate-500 font-mono mt-0.5 truncate max-w-[140px]" title={paymentRef}>
                              UTR: {paymentRef}
                            </div>
                          )}
                        </td>

                        {/* 7. Actions */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Pay Now Button (if approved) */}
                            {settlementStatus === 'APPROVED' && (
                              <button
                                onClick={() => {
                                  setSelectedSettlement(settlement || { id: item.settlement_id, net_payable: netAmount });
                                  setPaymentModalOpen(true);
                                }}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1"
                                title="Record bank payment and close"
                              >
                                <Banknote className="w-3.5 h-3.5" />
                                Pay Out
                              </button>
                            )}

                            {/* Compute Button (if not yet calculated) */}
                            {(!settlementStatus || settlementStatus === 'PENDING') && (
                              <button
                                onClick={() => handleCalculateSettlement(item)}
                                className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-xl text-xs font-semibold transition-all flex items-center gap-1"
                                title="Compute final salary and dues"
                              >
                                <Calculator className="w-3.5 h-3.5" />
                                Calculate
                              </button>
                            )}

                            {/* View Breakdown */}
                            {netAmount !== null && (
                              <button
                                onClick={() => {
                                  openBreakdownWithRealSettlement(
                                    item,
                                    settlement || {
                                      id: item.settlement_id,
                                      net_payable: netAmount,
                                    }
                                  );
                                }}
                                className="p-2 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="View detailed salary & deduction breakdown"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}

                            {/* Download PDF Statement */}
                            {item.settlement_id && (
                              <button
                                onClick={() => handleDownloadPdf(item.settlement_id, employeeCode)}
                                className="p-2 rounded-xl text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                                title="Download Official F&F Settlement Statement (PDF)"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            )}

                            {/* Clearance Checklist Button */}
                            <button
                              onClick={() => handleOpenClearance(item)}
                              className="p-2 rounded-xl text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                              title="Department Clearance Checklist"
                            >
                              <FileCheck className="w-4 h-4" />
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

          {/* Table Pagination Footer */}
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-slate-500">
            <div>
              Showing <span className="font-semibold text-slate-900 dark:text-white">{exits.length}</span> of{' '}
              <span className="font-semibold text-slate-900 dark:text-white">{totalCount}</span> staff records
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-medium"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                Previous
              </button>
              <span className="px-2 font-medium text-slate-700 dark:text-slate-300">Page {page}</span>
              <button
                disabled={exits.length < limit}
                onClick={() => setPage((p) => p + 1)}
                className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-1 font-medium"
              >
                Next
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL 1: START STAFF EXIT */}
      {initiateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <UserMinus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Start Staff Exit Process</h3>
                  <p className="text-xs text-slate-500">Creates clearance tasks and prepares final settlement.</p>
                </div>
              </div>
              <button
                onClick={() => setInitiateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleInitiateExit} className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Select Employee *
                </label>
                <select
                  required
                  value={initiateForm.employeeId}
                  onChange={(e) => setInitiateForm({ ...initiateForm, employeeId: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Choose Employee --</option>
                  {allEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName || emp.employeeCode} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Exit Reason *
                  </label>
                  <select
                    value={initiateForm.exitType}
                    onChange={(e) => setInitiateForm({ ...initiateForm, exitType: e.target.value })}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="RESIGNATION">Resignation</option>
                    <option value="TERMINATION">Termination</option>
                    <option value="RETIREMENT">Retirement</option>
                    <option value="CONTRACT_END">Contract End</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Notice Days
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="180"
                    value={initiateForm.noticePeriodDays}
                    onChange={(e) => handleNoticePeriodChange(Number(e.target.value))}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Resignation Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={initiateForm.resignationDate}
                    onChange={(e) => handleResignationDateChange(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    Last Working Day *
                  </label>
                  <input
                    type="date"
                    required
                    value={initiateForm.lastWorkingDate}
                    onChange={(e) => setInitiateForm({ ...initiateForm, lastWorkingDate: e.target.value })}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Remarks / Reason Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Career growth, relocation, or management decision notes..."
                  value={initiateForm.reason}
                  onChange={(e) => setInitiateForm({ ...initiateForm, reason: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                ></textarea>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setInitiateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-sm text-sm"
                >
                  Start Exit Process
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: DEPARTMENT CLEARANCE CHECKLIST */}
      {clearanceModalOpen && selectedExit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <FileCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Department Handover Sign-Offs</h3>
                  <p className="text-xs text-slate-500">
                    {selectedExit.full_name || selectedExit.employee_name} ({selectedExit.employee_code})
                  </p>
                </div>
              </div>
              <button onClick={() => setClearanceModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 my-4 max-h-[60vh] overflow-y-auto pr-1">
              {(selectedExit.clearanceTasks || []).length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                  All department handovers have been approved or recorded.
                </div>
              ) : (
                (selectedExit.clearanceTasks || []).map((task: any) => (
                  <div
                    key={task.id}
                    className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/60"
                  >
                    <div className="flex justify-between items-start gap-3">
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white text-sm">
                          {task.department || task.department_name} Sign-Off
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{task.task_name}</div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                          task.status === 'APPROVED' || task.status === 'CLEARED' || task.status === 'WAIVED'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {task.status === 'CLEARED' || task.status === 'APPROVED' ? 'Cleared' : task.status}
                      </span>
                    </div>

                    {task.remarks && (
                      <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900/60 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        "{task.remarks}"
                      </div>
                    )}

                    {task.status !== 'APPROVED' && task.status !== 'CLEARED' && (
                      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex gap-2 justify-end">
                        <button
                          onClick={() => handleUpdateClearance(task.id, 'APPROVED', 0, 'All assets returned in order')}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                        >
                          Mark Cleared
                        </button>
                        <button
                          onClick={() => handleUpdateClearance(task.id, 'WAIVED', 0, 'Waived by Management')}
                          className="px-3.5 py-1.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold"
                        >
                          Waive Task
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setClearanceModalOpen(false)}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: FINAL PAY BREAKDOWN */}
      {calcModalOpen && selectedSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Final Pay Calculation</h3>
                  <p className="text-xs text-slate-500">Summary of all worked days, dues, and deductions.</p>
                </div>
              </div>
              <button onClick={() => setCalcModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* Earnings Card */}
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/80 dark:border-emerald-800/60">
                <h4 className="font-bold text-emerald-800 dark:text-emerald-300 mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                  <Plus className="w-3.5 h-3.5 text-emerald-600" /> Salary & Positive Earnings
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Worked Days Salary:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{Number(selectedSettlement.unpaid_salary_amount || selectedSettlement.total_earnings || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Leave Balance Payout:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{Number(selectedSettlement.leave_encashment_amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Gratuity Bonus:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{Number(selectedSettlement.gratuity_amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="border-t border-emerald-200 dark:border-emerald-800 pt-2 flex justify-between font-bold text-emerald-800 dark:text-emerald-300 text-sm">
                    <span>Total Earnings:</span>
                    <span>₹{Number(selectedSettlement.total_earnings || selectedSettlement.net_payable || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Deductions Card */}
              <div className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-xl border border-red-200/80 dark:border-red-800/60">
                <h4 className="font-bold text-red-800 dark:text-red-300 mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                  <UserX className="w-3.5 h-3.5 text-red-600" /> Deductions & Company Recoveries
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Notice Period Shortfall:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{Number(selectedSettlement.notice_recovery_amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">Salary Advances / Dues:</span>
                    <span className="font-semibold text-slate-900 dark:text-white">
                      ₹{Number(selectedSettlement.advance_recovery_amount || 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="border-t border-red-200 dark:border-red-800 pt-2 flex justify-between font-bold text-red-800 dark:text-red-300 text-sm">
                    <span>Total Deductions:</span>
                    <span>₹{Number(selectedSettlement.total_deductions || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* Net Payable Card */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800 flex justify-between items-center">
                <div>
                  <div className="text-xs uppercase font-bold text-blue-700 dark:text-blue-300">
                    Net Take-Home Pay
                  </div>
                  <div className="text-[11px] text-slate-500">Official amount to be transferred to bank account</div>
                </div>
                <div className="text-2xl font-black text-blue-700 dark:text-blue-300">
                  ₹{Number(selectedSettlement.net_payable || 0).toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100 dark:border-slate-800 mt-5">
              <button
                onClick={() => handleDownloadPdf(selectedSettlement.id, 'Statement')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5 text-red-600" />
                Download Statement PDF
              </button>
              <button
                onClick={() => setCalcModalOpen(false)}
                className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: RECORD BANK PAYOUT */}
      {paymentModalOpen && selectedSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Record Bank Payout</h3>
                  <p className="text-xs text-slate-500">Record transaction reference to mark settlement paid.</p>
                </div>
              </div>
              <button onClick={() => setPaymentModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 mb-4 flex justify-between items-center">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">Total Disbursement:</span>
              <span className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                ₹{Number(selectedSettlement.net_payable || 0).toLocaleString('en-IN')}
              </span>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Bank UTR / Transaction Reference *
                </label>
                <input
                  required
                  placeholder="e.g. HDFC2026101000923481"
                  value={paymentForm.paymentReference}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentReference: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Date *
                </label>
                <input
                  type="date"
                  required
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Payment Method
                </label>
                <select
                  value={paymentForm.paymentMode}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="BANK_TRANSFER">Direct Bank Transfer (NEFT / RTGS / IMPS)</option>
                  <option value="CHEQUE">Corporate Cheque</option>
                  <option value="CASH">Cash Voucher</option>
                </select>
              </div>

              <div className="flex justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800 mt-4">
                <button
                  type="button"
                  onClick={() => setPaymentModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm & Close Settlement
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SUMMARY CARD DETAIL DRAWER */}
      <FormerStaffCardDrawer
        isOpen={Boolean(activeDrawer)}
        type={activeDrawer}
        onClose={() => setActiveDrawer(null)}
        exits={exits}
        allExits={allExits}
        stats={stats}
        locations={locations}
        currentBranchId={locationFilter}
        currentExitType={exitTypeFilter}
        searchQuery={search}
        loading={loading}
        onRefresh={handleRefresh}
        onShowInTable={handleShowInTable}
        onOpenClearanceModal={handleOpenClearance}
        onOpenPaymentModal={handleOpenPaymentFromDrawer}
        onOpenBreakdownModal={handleOpenBreakdownFromDrawer}
        onDownloadPdf={handleDownloadPdf}
        triggerRef={activeTriggerRef}
      />
    </DashboardLayout>
  );
}
