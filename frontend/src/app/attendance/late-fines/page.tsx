'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import { safeJsonParse } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  FileText,
  Download,
  Filter,
  Search,
  Sliders,
  DollarSign,
  TrendingDown,
  UserCheck,
  AlertCircle,
  ArrowRight,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Coins,
  History,
  Layers,
  ArrowUpDown,
  Calendar,
  Sparkles,
  Info
} from 'lucide-react';

interface MetricItem {
  id: string;
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  iconBg: string;
  iconColor: string;
  borderColor?: string;
  drillMetric: string;
}

export default function LateFinesPage() {
  // Filters State
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedApproval, setSelectedApproval] = useState<string>('all');
  const [selectedPayroll, setSelectedPayroll] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('2026-10-11');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'register' | 'repeated' | 'early' | 'summary'>('register');

  // Metadata
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);

  // Dashboard Metrics & Records
  const [loading, setLoading] = useState<boolean>(true);
  const [metrics, setMetrics] = useState<any>({
    totalEmployeesScheduled: 0,
    employeesPresent: 0,
    employeesArrivedLate: 0,
    employeesWithinGracePeriod: 0,
    employeesWithMissingPunches: 0,
    totalLateMinutes: 0,
    totalFineCalculated: 0,
    totalFinePendingApproval: 0,
    totalFineApproved: 0,
    totalFineAppliedToPayroll: 0,
    totalFineWaived: 0,
    employeesWithRepeatedLateArrivals: 0,
    earlyLoginsCount: 0,
    totalEarlyIncentives: 0
  });

  const [records, setRecords] = useState<any[]>([]);
  const [earlyRecords, setEarlyRecords] = useState<any[]>([]);
  const [repeatedRecords, setRepeatedRecords] = useState<any[]>([]);
  const [repeatedLoading, setRepeatedLoading] = useState<boolean>(false);
  const [earlyLoading, setEarlyLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [sortField, setSortField] = useState('lar.scheduledLogin');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');

  // Policy Settings
  const [policy, setPolicy] = useState<any>({
    gracePeriodMinutes: 5,
    latePenaltyRatePerMinute: 1.0,
    latePenaltyRatePerSecond: 1.0,
    earlyLoginRatePerMinute: 1.0,
    earlyLoginRatePerSecond: 1.0,
    maxFinePerDay: 500,
    maxFinePerMonth: 3000,
    calculationMethod: 'PER_MINUTE',
    roundingRule: 'NEAREST_RUPEE'
  });

  // Modals
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [drillDownModal, setDrillDownModal] = useState<{ isOpen: boolean; title: string; metric: string; records: any[] }>({
    isOpen: false,
    title: '',
    metric: '',
    records: []
  });
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState<boolean>(false);
  const [waiveModal, setWaiveModal] = useState<{ isOpen: boolean; record: any | null; reason: string }>({
    isOpen: false,
    record: null,
    reason: ''
  });
  const [adjustModal, setAdjustModal] = useState<{ isOpen: boolean; record: any | null; amount: string; reason: string }>({
    isOpen: false,
    record: null,
    amount: '',
    reason: ''
  });
  const [employeeHistoryModal, setEmployeeHistoryModal] = useState<{ isOpen: boolean; data: any | null }>({
    isOpen: false,
    data: null
  });

  // Fetch policy rules
  const fetchPolicy = useCallback(async () => {
    try {
      const polRes = await api.get('/late-fines/policy');
      if (polRes.data?.data) {
        setPolicy(polRes.data.data);
      }
    } catch (err) {
      console.error('Failed to load late fine policy:', err);
    }
  }, []);

  // Fetch filter options
  useEffect(() => {
    const loadFilterData = async () => {
      try {
        const [locRes, deptRes, shiftRes] = await Promise.all([
          api.get('/locations/all').catch(() => ({ data: [] })),
          api.get('/departments').catch(() => ({ data: { departments: [] } })),
          api.get('/shifts').catch(() => ({ data: { shifts: [] } }))
        ]);
        setLocations(locRes.data || []);
        setDepartments(deptRes.data?.departments || []);
        setShifts(shiftRes.data?.shifts || []);
        await fetchPolicy();
      } catch (err) {
        console.error('Error loading filter data:', err);
      }
    };
    loadFilterData();
  }, [fetchPolicy]);

  // Fetch dashboard summary cards
  const fetchDashboardMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      if (selectedShift && selectedShift !== 'all') params.append('shiftId', selectedShift);
      if (selectedStatus && selectedStatus !== 'all') params.append('fineStatus', selectedStatus);
      if (selectedApproval && selectedApproval !== 'all') params.append('approvalStatus', selectedApproval);
      if (selectedPayroll && selectedPayroll !== 'all') params.append('payrollStatus', selectedPayroll);
      if (selectedDate) params.append('date', selectedDate);

      const res = await api.get(`/late-fines/dashboard?${params.toString()}`);
      if (res.data?.success) {
        setMetrics(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    }
  }, [selectedLocation, selectedDept, selectedShift, selectedStatus, selectedApproval, selectedPayroll, selectedDate]);

  // Fetch records
  const fetchRecords = useCallback(async (drillMetric?: string) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      if (selectedShift && selectedShift !== 'all') params.append('shiftId', selectedShift);
      if (selectedStatus && selectedStatus !== 'all') params.append('fineStatus', selectedStatus);
      if (selectedApproval && selectedApproval !== 'all') params.append('approvalStatus', selectedApproval);
      if (selectedPayroll && selectedPayroll !== 'all') params.append('payrollStatus', selectedPayroll);
      if (selectedDate) params.append('date', selectedDate);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      if (drillMetric) params.append('drillDownMetric', drillMetric);

      params.append('page', String(pagination.page));
      params.append('limit', String(pagination.limit));
      params.append('sortBy', sortField);
      params.append('sortOrder', sortOrder);

      const res = await api.get(`/late-fines/records?${params.toString()}`);
      if (res.data?.success) {
        setRecords(res.data.data || []);
        if (res.data.pagination) {
          setPagination(prev => ({
            ...prev,
            total: res.data.pagination.total,
            totalPages: res.data.pagination.totalPages
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load late fine records:', err);
      toast.error('Failed to load late fine records');
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedDept, selectedShift, selectedStatus, selectedApproval, selectedPayroll, selectedDate, searchQuery, pagination.page, pagination.limit, sortField, sortOrder]);

  // Fetch early logins
  const fetchEarlyLogins = useCallback(async () => {
    try {
      setEarlyLoading(true);
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      if (selectedShift && selectedShift !== 'all') params.append('shiftId', selectedShift);
      if (selectedDate) params.append('date', selectedDate);
      const res = await api.get(`/late-fines/early-logins?${params.toString()}`);
      if (res.data?.success) {
        setEarlyRecords(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch early logins:', err);
    } finally {
      setEarlyLoading(false);
    }
  }, [selectedLocation, selectedDept, selectedShift, selectedDate]);

  // Fetch repeated late offenders
  const fetchRepeatedOffenders = useCallback(async () => {
    try {
      setRepeatedLoading(true);
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      if (selectedShift && selectedShift !== 'all') params.append('shiftId', selectedShift);
      if (selectedApproval && selectedApproval !== 'all') params.append('approvalStatus', selectedApproval);
      if (selectedPayroll && selectedPayroll !== 'all') params.append('payrollStatus', selectedPayroll);
      if (selectedDate) params.append('date', selectedDate);
      params.append('drillDownMetric', 'REPEATED_LATE');
      params.append('limit', '50');

      const res = await api.get(`/late-fines/records?${params.toString()}`);
      if (res.data?.success) {
        setRepeatedRecords(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch repeated late offenders:', err);
    } finally {
      setRepeatedLoading(false);
    }
  }, [selectedLocation, selectedDept, selectedShift, selectedApproval, selectedPayroll, selectedDate]);

  // Master refresh action triggered by the "Refresh Records" button
  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await Promise.all([
        fetchDashboardMetrics(),
        fetchRecords(),
        fetchEarlyLogins(),
        fetchRepeatedOffenders(),
        fetchPolicy()
      ]);
      toast.success('Dashboard records and metrics refreshed successfully');
    } catch (err) {
      console.error('Failed to refresh records:', err);
      toast.error('Failed to refresh records');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchDashboardMetrics();
    fetchRecords();
    if (activeTab === 'early') {
      fetchEarlyLogins();
    }
    if (activeTab === 'repeated') {
      fetchRepeatedOffenders();
    }
  }, [fetchDashboardMetrics, fetchRecords, fetchEarlyLogins, fetchRepeatedOffenders, activeTab]);

  // Card click: Drill-down handler
  const handleCardClick = async (metricKey: string, cardTitle: string) => {
    try {
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      if (selectedShift && selectedShift !== 'all') params.append('shiftId', selectedShift);
      if (selectedDate) params.append('date', selectedDate);
      params.append('drillDownMetric', metricKey);
      params.append('limit', '100');

      const res = await api.get(`/late-fines/records?${params.toString()}`);
      if (res.data?.success) {
        setDrillDownModal({
          isOpen: true,
          title: cardTitle,
          metric: metricKey,
          records: res.data.data || []
        });
      }
    } catch (err) {
      console.error('Error fetching drill-down:', err);
      toast.error('Failed to load drill-down records');
    }
  };

  // Actions: Approve
  const handleApproveFine = async (recordId: string) => {
    try {
      const res = await api.post(`/late-fines/approve/${recordId}`, { remarks: 'Approved by HR Manager' });
      if (res.data?.success) {
        toast.success('Late fine approved successfully');
        fetchDashboardMetrics();
        fetchRecords();
        if (selectedRecord?.id === recordId) {
          setSelectedRecord(null);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to approve fine');
    }
  };

  // Actions: Waive
  const handleWaiveSubmit = async () => {
    if (!waiveModal.record || !waiveModal.reason.trim()) {
      toast.error('Please enter a mandatory justification reason to waive this fine');
      return;
    }
    try {
      const res = await api.post(`/late-fines/waive/${waiveModal.record.id}`, { reason: waiveModal.reason.trim() });
      if (res.data?.success) {
        toast.success('Late fine waived with audit log');
        setWaiveModal({ isOpen: false, record: null, reason: '' });
        fetchDashboardMetrics();
        fetchRecords();
        if (selectedRecord?.id === waiveModal.record.id) {
          setSelectedRecord(null);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to waive fine');
    }
  };

  // Actions: Adjust
  const handleAdjustSubmit = async () => {
    if (!adjustModal.record || isNaN(Number(adjustModal.amount)) || !adjustModal.reason.trim()) {
      toast.error('Please enter a valid adjusted amount and reason');
      return;
    }
    try {
      const res = await api.post(`/late-fines/adjust/${adjustModal.record.id}`, {
        adjustedAmount: Number(adjustModal.amount),
        reason: adjustModal.reason.trim()
      });
      if (res.data?.success) {
        toast.success('Fine adjusted and approved');
        setAdjustModal({ isOpen: false, record: null, amount: '', reason: '' });
        fetchDashboardMetrics();
        fetchRecords();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to adjust fine');
    }
  };

  // Actions: Apply to Payroll
  const handleApplyToPayroll = async (record: any) => {
    if (record.approvalStatus !== 'APPROVED') {
      toast.error('Financial Safety: Only APPROVED fines can be applied to payroll');
      return;
    }
    try {
      const res = await api.post(`/late-fines/apply-payroll/${record.id}`, { payrollRunId: 'PAYROLL-2026-10' });
      if (res.data?.success) {
        toast.success('Fine marked as APPLIED TO PAYROLL');
        fetchDashboardMetrics();
        fetchRecords();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to apply fine to payroll');
    }
  };

  // Actions: Reverse
  const handleReverseFine = async (recordId: string) => {
    const reason = prompt('Please enter the mandatory reason for reversing this fine:');
    if (!reason || !reason.trim()) {
      if (reason !== null) toast.error('Reversal reason is required');
      return;
    }
    try {
      const res = await api.post(`/late-fines/reverse/${recordId}`, { reason: reason.trim() });
      if (res.data?.success) {
        toast.success('Fine reversed with audit note');
        fetchDashboardMetrics();
        fetchRecords();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reverse fine');
    }
  };

  // Open Employee History
  const handleOpenEmployeeHistory = async (employeeId: string) => {
    try {
      const res = await api.get(`/late-fines/employee-history/${employeeId}`);
      if (res.data?.success) {
        setEmployeeHistoryModal({ isOpen: true, data: res.data });
      }
    } catch (err) {
      console.error('Failed to load employee history:', err);
      toast.error('Failed to load employee history');
    }
  };

  // CSV Export for Early Logins
  const handleExportEarlyCSV = () => {
    if (earlyRecords.length === 0) {
      toast.error('No early login records available to export');
      return;
    }
    const headers = [
      'Employee Code', 'Employee Name', 'Department', 'Location', 'Shift',
      'Scheduled Login', 'Actual Punch In', 'Early Duration (Mins)', 'Early (Sec)',
      'Incentive Rate (₹/min)', 'Calculated Incentive (₹)', 'Status'
    ];
    const rows = earlyRecords.map(e => [
      `"${e.employeeCode || ''}"`,
      `"${e.employeeName || ''}"`,
      `"${e.departmentName || ''}"`,
      `"${e.locationName || ''}"`,
      `"${e.shiftName || ''}"`,
      `"${e.scheduledLogin ? new Date(e.scheduledLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}"`,
      `"${e.actualPunchIn ? new Date(e.actualPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}"`,
      Math.round(e.earlySeconds / 60),
      e.earlySeconds,
      '₹1.0/min',
      e.earlyIncentive,
      'ELIGIBLE'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Early_Login_Incentives_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Early Login Incentives exported successfully');
  };

  // CSV Export
  const handleExportCSV = () => {
    if (activeTab === 'early') {
      handleExportEarlyCSV();
      return;
    }
    if (records.length === 0) {
      toast.error('No records available to export');
      return;
    }
    const headers = [
      'Employee Code', 'Employee Name', 'Department', 'Location', 'Shift',
      'Scheduled Login', 'Actual Punch In', 'Grace Period (Mins)', 'Late (Sec)',
      'Chargeable Late (Sec)', 'Rate (₹/min)', 'Calculated Fine (₹)',
      'Approved Fine (₹)', 'Waived Fine (₹)', 'Final Fine (₹)',
      'Fine Status', 'Approval Status', 'Payroll Status', 'Date', 'Remarks'
    ];
    const rows = records.map(r => [
      `"${r.employeeCode || ''}"`,
      `"${r.employeeName || ''}"`,
      `"${r.departmentName || ''}"`,
      `"${r.locationName || ''}"`,
      `"${r.shiftName || ''}"`,
      `"${r.scheduledLogin ? new Date(r.scheduledLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}"`,
      `"${r.actualPunchIn ? new Date(r.actualPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'MISSING'}"`,
      r.gracePeriodMinutes ?? 5,
      r.lateSeconds ?? 0,
      r.chargeableLateSeconds ?? 0,
      r.fineRate ?? 1.0,
      r.calculatedFine ?? 0,
      r.approvedFine ?? 0,
      r.waivedFine ?? 0,
      r.finalFine ?? 0,
      `"${r.fineStatus || ''}"`,
      `"${r.approvalStatus || ''}"`,
      `"${r.payrollStatus || ''}"`,
      `"${r.recordDate ? String(r.recordDate).split('T')[0] : ''}"`,
      `"${(r.managerRemarks || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Late_Fine_Report_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Late & Fine report exported successfully');
  };

  // 12 Summary Metrics Cards Configuration
  const metricCards: MetricItem[] = useMemo(() => [
    {
      id: 'scheduled',
      title: 'Total Scheduled',
      value: metrics.totalEmployeesScheduled,
      subtitle: 'Assigned floor shifts',
      icon: Layers,
      iconBg: 'bg-blue-50 dark:bg-blue-950/40',
      iconColor: 'text-blue-600 dark:text-blue-400',
      drillMetric: 'ALL'
    },
    {
      id: 'present',
      title: 'Employees Present',
      value: metrics.employeesPresent,
      subtitle: 'Logged biometric punch',
      icon: UserCheck,
      iconBg: 'bg-emerald-50 dark:bg-emerald-950/40',
      iconColor: 'text-emerald-600 dark:text-emerald-400',
      drillMetric: 'PRESENT'
    },
    {
      id: 'late',
      title: 'Arrived Late',
      value: metrics.employeesArrivedLate,
      subtitle: 'Crossed grace window',
      icon: Clock,
      iconBg: 'bg-rose-50 dark:bg-rose-950/40',
      iconColor: 'text-rose-600 dark:text-rose-400',
      borderColor: 'border-rose-200 dark:border-rose-900/40',
      drillMetric: 'LATE'
    },
    {
      id: 'grace',
      title: 'Within Grace Period',
      value: metrics.employeesWithinGracePeriod,
      subtitle: 'Within 5 min tolerance (₹0)',
      icon: CheckCircle,
      iconBg: 'bg-teal-50 dark:bg-teal-950/40',
      iconColor: 'text-teal-600 dark:text-teal-400',
      drillMetric: 'GRACE_PERIOD'
    },
    {
      id: 'missing',
      title: 'Missing Punches',
      value: metrics.employeesWithMissingPunches,
      subtitle: 'Requires punch correction',
      icon: AlertCircle,
      iconBg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-200 dark:border-amber-900/40',
      drillMetric: 'MISSING_PUNCH'
    },
    {
      id: 'lateMinutes',
      title: 'Total Late Minutes',
      value: `${metrics.totalLateMinutes} m`,
      subtitle: 'Chargeable delay time',
      icon: Clock,
      iconBg: 'bg-orange-50 dark:bg-orange-950/40',
      iconColor: 'text-orange-600 dark:text-orange-400',
      drillMetric: 'LATE'
    },
    {
      id: 'fineCalculated',
      title: 'Fine Calculated',
      value: `₹${metrics.totalFineCalculated.toLocaleString('en-IN')}`,
      subtitle: 'At ₹1/min baseline rule',
      icon: DollarSign,
      iconBg: 'bg-purple-50 dark:bg-purple-950/40',
      iconColor: 'text-purple-600 dark:text-purple-400',
      drillMetric: 'LATE'
    },
    {
      id: 'pendingApproval',
      title: 'Pending Approval',
      value: `₹${metrics.totalFinePendingApproval.toLocaleString('en-IN')}`,
      subtitle: 'Awaiting manager sign-off',
      icon: AlertTriangle,
      iconBg: 'bg-amber-50 dark:bg-amber-950/40',
      iconColor: 'text-amber-600 dark:text-amber-400',
      borderColor: 'border-amber-200 dark:border-amber-900/40',
      drillMetric: 'PENDING_APPROVAL'
    },
    {
      id: 'fineApproved',
      title: 'Fine Approved',
      value: `₹${metrics.totalFineApproved.toLocaleString('en-IN')}`,
      subtitle: 'Authorized by management',
      icon: CheckCircle,
      iconBg: 'bg-green-50 dark:bg-green-950/40',
      iconColor: 'text-green-600 dark:text-green-400',
      drillMetric: 'APPROVED'
    },
    {
      id: 'appliedPayroll',
      title: 'Applied to Payroll',
      value: `₹${metrics.totalFineAppliedToPayroll.toLocaleString('en-IN')}`,
      subtitle: 'Deducted in salary run',
      icon: Coins,
      iconBg: 'bg-indigo-50 dark:bg-indigo-950/40',
      iconColor: 'text-indigo-600 dark:text-indigo-400',
      drillMetric: 'PAYROLL_APPLIED'
    },
    {
      id: 'fineWaived',
      title: 'Fine Waived',
      value: `₹${metrics.totalFineWaived.toLocaleString('en-IN')}`,
      subtitle: 'Excused with reason note',
      icon: TrendingDown,
      iconBg: 'bg-slate-100 dark:bg-slate-800',
      iconColor: 'text-slate-600 dark:text-slate-400',
      drillMetric: 'WAIVED'
    },
    {
      id: 'repeatedLate',
      title: 'Repeated Late Arrivals',
      value: metrics.employeesWithRepeatedLateArrivals,
      subtitle: '2+ late days in period',
      icon: ShieldAlert,
      iconBg: 'bg-red-50 dark:bg-red-950/40',
      iconColor: 'text-red-600 dark:text-red-400',
      borderColor: 'border-red-200 dark:border-red-900/40',
      drillMetric: 'REPEATED_LATE'
    }
  ], [metrics]);

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-6 pb-12">
        {/* TOP HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-2 gap-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold tracking-wider uppercase">
              <span>Time & Attendance</span>
              <span>/</span>
              <span className="text-[#1346a1] dark:text-[#E8DCC6]">Late Attendance & Fine Management</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-extrabold text-[#0b1c30] dark:text-white tracking-tight">
                Late Attendance & Fine Management
              </h1>
              <span className="px-3 py-1 rounded-full bg-[#1346a1]/10 dark:bg-[#1346a1]/30 text-[#1346a1] dark:text-[#E8DCC6] text-xs font-bold border border-[#1346a1]/20 flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${policy?.isActive !== false ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`}></span>
                Policy {policy?.isActive !== false ? 'Active' : 'Inactive'}: ₹{policy?.latePenaltyRatePerMinute ?? 1}/min • {policy?.gracePeriodMinutes ?? 5}m Grace
              </span>
            </div>
            <p className="text-xs lg:text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
              Configurable biometric late arrival audit, ₹{policy?.latePenaltyRatePerMinute ?? 1}/min policy deductions, manager approvals, penalty waivers, and synchronized payroll handoff.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsPolicyModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold shadow-xs transition-all"
            >
              <Sliders className="w-3.5 h-3.5 text-[#1346a1] dark:text-[#E8DCC6]" />
              <span>Policy Rules Settings</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/60 text-xs font-semibold shadow-xs transition-all"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Export CSV</span>
            </button>
            <button
              id="refresh-records-btn"
              onClick={handleRefresh}
              disabled={isRefreshing || loading}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold shadow-md shadow-[#1346a1]/20 transition-all ${
                isRefreshing ? 'opacity-80 cursor-wait' : ''
              }`}
              title="Reload and update all dashboard metrics, registers, and policy rules"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Refreshing Records...' : 'Refresh Records'}</span>
            </button>
          </div>
        </div>

        {/* CONTROLS & FILTER BAR */}
        <div className="bg-white dark:bg-[#1A1D24] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Hub Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Store Hub / Location
              </label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="all">All Karnataka Hubs</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
                ))}
              </select>
            </div>

            {/* Department Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Department
              </label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>

            {/* Shift Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Shift Allocation
              </label>
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="all">All Floor Shifts</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.startTime} - {s.endTime})</option>
                ))}
              </select>
            </div>

            {/* Approval Status Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Approval Status
              </label>
              <select
                value={selectedApproval}
                onChange={(e) => setSelectedApproval(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="all">All Approvals</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="APPROVED">Approved</option>
                <option value="WAIVED">Waived</option>
                <option value="REJECTED">Rejected</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </div>

            {/* Payroll Status Selector */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Payroll Status
              </label>
              <select
                value={selectedPayroll}
                onChange={(e) => setSelectedPayroll(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="all">All Payroll States</option>
                <option value="NOT_APPLIED">Not Applied</option>
                <option value="READY_FOR_PAYROLL">Ready for Payroll</option>
                <option value="APPLIED_TO_PAYROLL">Applied to Payroll</option>
                <option value="REVERSED">Reversed</option>
              </select>
            </div>

            {/* Date Selection */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Historical Record Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
                />
              </div>
            </div>
          </div>

          {/* Quick Date Presets & Search */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
              <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mr-1">Quick Select:</span>
              <button
                onClick={() => setSelectedDate('2026-10-11')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  selectedDate === '2026-10-11'
                    ? 'bg-[#1346a1] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                Oct 11, 2026
              </button>
              <button
                onClick={() => setSelectedDate('2026-10-10')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  selectedDate === '2026-10-10'
                    ? 'bg-[#1346a1] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                Oct 10, 2026
              </button>
              <button
                onClick={() => setSelectedDate('2026-10-05')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  selectedDate === '2026-10-05'
                    ? 'bg-[#1346a1] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                Oct 05, 2026
              </button>
              <button
                onClick={() => setSelectedDate('2026-10-01')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  selectedDate === '2026-10-01'
                    ? 'bg-[#1346a1] text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                Oct 01, 2026
              </button>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Employee ID, Name, Role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              />
            </div>
          </div>
        </div>

        {/* 12 SUMMARY KPI CARDS WITH DRILL-DOWN */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {metricCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                onClick={() => handleCardClick(card.drillMetric, card.title)}
                className={`group bg-white dark:bg-[#1A1D24] p-3.5 rounded-xl border border-slate-200/90 dark:border-slate-800 text-left cursor-pointer transition-all hover:shadow-md hover:border-[#1346a1]/50 hover:bg-[#F8F4F1]/30 dark:hover:bg-slate-800/40 relative flex flex-col justify-between ${card.borderColor || ''}`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider line-clamp-1">
                    {card.title}
                  </span>
                  <div className={`w-7 h-7 rounded-lg ${card.iconBg} flex items-center justify-center ${card.iconColor}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div>
                  <div className="text-xl font-black text-[#0b1c30] dark:text-white group-hover:text-[#1346a1] dark:group-hover:text-[#E8DCC6] transition-colors">
                    {card.value}
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-400 font-medium line-clamp-1 mt-0.5">
                    {card.subtitle}
                  </div>
                </div>
                <div className="text-[9px] font-bold text-[#1346a1] dark:text-[#E8DCC6] opacity-0 group-hover:opacity-100 transition-opacity mt-1 flex items-center gap-1">
                  <span>Drill down</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </div>
              </button>
            );
          })}
        </div>

        {/* TABS NAVIGATION */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab('register')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'register'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-[#E8DCC6]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            <span>Late Attendance & Fine Register ({pagination.total})</span>
          </button>
          <button
            onClick={() => setActiveTab('repeated')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'repeated'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-[#E8DCC6]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <span>Repeated Late Offenders ({metrics.employeesWithRepeatedLateArrivals})</span>
          </button>
          <button
            onClick={() => setActiveTab('early')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'early'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-[#E8DCC6]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Early Login & Incentives ({metrics.earlyLoginsCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('summary')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'summary'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-[#E8DCC6]'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Audit Trail & Policy Calculation Logic</span>
          </button>
        </div>

        {/* TAB 1: MAIN LATE ATTENDANCE TABLE */}
        {activeTab === 'register' && (
          <div className="bg-white dark:bg-[#1A1D24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">
                    <th className="py-3 px-3">Emp ID</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3">Hub / Branch</th>
                    <th className="py-3 px-3">Shift</th>
                    <th className="py-3 px-3">Scheduled</th>
                    <th className="py-3 px-3">Actual Punch</th>
                    <th className="py-3 px-3">Grace</th>
                    <th className="py-3 px-3">Late Duration</th>
                    <th className="py-3 px-3">Fine Rate</th>
                    <th className="py-3 px-3">Calculated Fine</th>
                    <th className="py-3 px-3">Approved</th>
                    <th className="py-3 px-3">Waived</th>
                    <th className="py-3 px-3 font-extrabold text-[#1346a1] dark:text-[#E8DCC6]">Final Fine</th>
                    <th className="py-3 px-3">Approval Status</th>
                    <th className="py-3 px-3">Payroll Status</th>
                    <th className="py-3 px-3">Remarks</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={18} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-[#1346a1]" />
                          <span>Loading late attendance & fine records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={18} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        No late attendance records found for this date and filter criteria.
                      </td>
                    </tr>
                  ) : (
                    records.map((r) => {
                      const isLate = r.chargeableLateSeconds > 0;
                      const isGrace = r.lateSeconds > 0 && r.chargeableLateSeconds === 0;
                      const isMissing = !r.actualPunchIn;

                      return (
                        <tr
                          key={r.id}
                          className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors whitespace-nowrap"
                        >
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                            {r.employeeCode}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              onClick={() => handleOpenEmployeeHistory(r.employeeId)}
                              className="font-bold text-[#0b1c30] dark:text-white hover:text-[#1346a1] hover:underline text-left"
                            >
                              {r.employeeName}
                            </button>
                            <div className="text-[10px] text-slate-400 dark:text-slate-500">
                              {r.designation}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                            {r.departmentName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                            {r.locationName}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {r.shiftName || 'Standard'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                            {r.scheduledLogin ? new Date(r.scheduledLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {isMissing ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40">
                                MISSING PUNCH
                              </span>
                            ) : (
                              <span className={`font-semibold ${isLate ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {new Date(r.actualPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 font-semibold">
                            {r.gracePeriodMinutes || 5} min
                          </td>
                          <td className="py-2.5 px-3 font-mono">
                            {isGrace ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-200 dark:border-teal-900/40">
                                Within Grace ({Math.round(r.lateSeconds / 60)}m)
                              </span>
                            ) : isLate ? (
                              <span className="font-bold text-rose-600 dark:text-rose-400">
                                +{Math.round(r.chargeableLateSeconds / 60)} min ({r.chargeableLateSeconds}s)
                              </span>
                            ) : (
                              <span className="text-slate-400 dark:text-slate-500">On time / Early</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                            ₹{r.fineRate || 1.0}/min
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-700 dark:text-slate-300">
                            ₹{r.calculatedFine}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-600 dark:text-emerald-400">
                            {r.approvedFine > 0 ? `₹${r.approvedFine}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500 dark:text-slate-400">
                            {r.waivedFine > 0 ? `₹${r.waivedFine}` : '-'}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-extrabold text-[#1346a1] dark:text-[#E8DCC6]">
                            ₹{r.finalFine}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                r.approvalStatus === 'APPROVED'
                                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/40'
                                  : r.approvalStatus === 'WAIVED'
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                  : r.approvalStatus === 'REJECTED'
                                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40'
                                  : r.approvalStatus === 'REVERSED'
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40'
                                  : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-900/40'
                              }`}
                            >
                              {r.approvalStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                r.payrollStatus === 'APPLIED_TO_PAYROLL'
                                  ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40'
                                  : r.payrollStatus === 'READY_FOR_PAYROLL'
                                  ? 'bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/40'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {r.payrollStatus === 'APPLIED_TO_PAYROLL' ? 'Deducted' : r.payrollStatus}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 dark:text-slate-400 max-w-xs truncate">
                            {r.managerRemarks || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => setSelectedRecord(r)}
                                className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition-colors"
                              >
                                View Details
                              </button>

                              {r.approvalStatus === 'PENDING' || r.approvalStatus === 'PENDING_APPROVAL' ? (
                                <>
                                  <button
                                    onClick={() => handleApproveFine(r.id)}
                                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px] transition-colors"
                                  >
                                    Approve
                                  </button>
                                  <button
                                    onClick={() => setWaiveModal({ isOpen: true, record: r, reason: '' })}
                                    className="px-2 py-1 rounded bg-slate-600 hover:bg-slate-700 text-white font-semibold text-[11px] transition-colors"
                                  >
                                    Waive
                                  </button>
                                </>
                              ) : r.approvalStatus === 'APPROVED' && r.payrollStatus !== 'APPLIED_TO_PAYROLL' ? (
                                <button
                                  onClick={() => handleApplyToPayroll(r)}
                                  className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-[11px] transition-colors"
                                >
                                  Apply Payroll
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* PAGINATION */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Showing {records.length} of {pagination.total} records (Page {pagination.page} of {pagination.totalPages || 1})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 hover:bg-white dark:hover:bg-slate-800 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: REPEATED LATE OFFENDERS */}
        {activeTab === 'repeated' && (
          <div className="bg-white dark:bg-[#1A1D24] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#0b1c30] dark:text-white flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-500" />
                  <span>Repeated Late Arrivals Oversight (2+ Late Days in Oct 2026)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Employees with persistent punctuality exceptions requiring supervisor counseling or HR intervention.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 font-bold text-xs">
                  Offenders Identified: {repeatedRecords.length || metrics.employeesWithRepeatedLateArrivals}
                </span>
              </div>
            </div>

            {repeatedLoading ? (
              <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin text-[#1346a1] mb-2" />
                <span className="text-xs">Loading repeated late offenders...</span>
              </div>
            ) : (() => {
              const displayRepeated = repeatedRecords.length > 0 
                ? repeatedRecords 
                : records.filter(r => r.chargeableLateSeconds > 0);

              if (displayRepeated.length === 0) {
                return (
                  <div className="py-12 text-center text-slate-400 dark:text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs">
                    No repeated late offenders detected for the selected filters.
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  {displayRepeated.map((r) => (
                    <div
                      key={r.id}
                      className="p-4 rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/10 flex flex-col justify-between gap-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[10px] font-mono font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-2 py-0.5 rounded">
                            {r.employeeCode}
                          </span>
                          <h4 className="font-bold text-slate-900 dark:text-white mt-1">{r.employeeName}</h4>
                          <p className="text-[11px] text-slate-500">{r.designation} • {r.departmentName}</p>
                        </div>
                        <span className="px-2 py-1 rounded bg-red-600 text-white font-extrabold text-[10px]">
                          HIGH RISK
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] bg-white dark:bg-slate-800/80 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div>
                          <span className="text-slate-400">Delay:</span>
                          <span className="font-bold text-rose-600 block">+{Math.round(r.chargeableLateSeconds / 60)} min</span>
                        </div>
                        <div>
                          <span className="text-slate-400">Calculated:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 block">₹{r.calculatedFine}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleOpenEmployeeHistory(r.employeeId)}
                        className="w-full py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>View Complete Punctuality Log</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* TAB 3: EARLY LOGIN & INCENTIVES */}
        {activeTab === 'early' && (
          <div className="bg-white dark:bg-[#1A1D24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/20 dark:bg-amber-950/10">
              <div>
                <h3 className="text-sm font-bold text-[#0b1c30] dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <span>Early Login Incentive Register (₹{policy?.earlyLoginRatePerMinute ?? 1.0}/min Incentive)</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Biometric arrivals ahead of scheduled shift start calculated at authorized ₹{policy?.earlyLoginRatePerMinute ?? 1.0}/min incentive rate. Kept strictly independent from late fine records.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-xs">
                  Total Incentives: ₹{metrics.totalEarlyIncentives.toLocaleString('en-IN')} (₹{policy?.earlyLoginRatePerMinute ?? 1.0}/min)
                </span>
                <button
                  onClick={handleExportEarlyCSV}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold shadow-xs transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Export Early CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">
                    <th className="py-3 px-3">Emp ID</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3">Shift</th>
                    <th className="py-3 px-3">Scheduled</th>
                    <th className="py-3 px-3">Actual Punch</th>
                    <th className="py-3 px-3">Early Duration</th>
                    <th className="py-3 px-3">Incentive Rate (₹/min)</th>
                    <th className="py-3 px-3 font-extrabold text-emerald-600">Calculated Incentive</th>
                    <th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {earlyLoading ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin inline-block mr-2 text-[#1346a1]" />
                        Loading early punch incentive records...
                      </td>
                    </tr>
                  ) : earlyRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        No early punch incentive records found for the selected date.
                      </td>
                    </tr>
                  ) : (
                    earlyRecords.map((e, idx) => (
                      <tr key={`${e.id || idx}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 whitespace-nowrap">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {e.employeeCode}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-slate-900 dark:text-white">
                          {e.employeeName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {e.departmentName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {e.shiftName}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-600 dark:text-slate-400">
                          {e.scheduledLogin ? new Date(e.scheduledLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                          {e.actualPunchIn ? new Date(e.actualPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'}
                        </td>
                        <td className="py-2.5 px-3 font-bold text-emerald-600">
                          {Math.round(e.earlySeconds / 60)} min early ({e.earlySeconds}s)
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-semibold">
                          ₹{policy?.earlyLoginRatePerMinute ?? 1.0}/min
                        </td>
                        <td className="py-2.5 px-3 font-mono font-extrabold text-emerald-600 dark:text-emerald-400">
                          +₹{e.earlyIncentive}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            ELIGIBLE
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: AUDIT TRAIL & POLICY EXPLAINABILITY */}
        {activeTab === 'summary' && (
          <div className="bg-white dark:bg-[#1A1D24] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-6">
            <div>
              <h3 className="text-lg font-bold text-[#0b1c30] dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-[#1346a1]" />
                <span>BSC Textiles Authorized Attendance & Late Fine Policy Manual</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Transparent statutory calculation formula, grace period threshold parameters, and multi-tier approval policies.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col gap-2">
                <span className="text-xs font-bold text-[#1346a1] dark:text-[#E8DCC6] uppercase tracking-wider">
                  Rule 1: Grace Period Window
                </span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">{policy?.gracePeriodMinutes ?? 5}-Minute Buffer Window</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Any employee punching within {policy?.gracePeriodMinutes ?? 5} minutes ({(policy?.gracePeriodMinutes ?? 5) * 60} seconds) after their scheduled shift start time is granted tolerance.
                  Chargeable late seconds remain exactly <strong>0</strong> and no late fine is triggered.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col gap-2">
                <span className="text-xs font-bold text-[#1346a1] dark:text-[#E8DCC6] uppercase tracking-wider">
                  Rule 2: Calculation Formula
                </span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Late Duration Formula ({policy?.calculationMethod || 'PER_MINUTE'})</h4>
                <div className="p-2.5 rounded bg-white dark:bg-slate-900 font-mono text-xs text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-800">
                  Late Duration = Actual Punch - Shift Start - Grace Window ({policy?.gracePeriodMinutes ?? 5}m)
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  At ₹{policy?.latePenaltyRatePerMinute ?? 1.0} per minute, arriving {(policy?.gracePeriodMinutes ?? 5) + 3} minutes late (3 mins beyond grace) produces exactly <strong>3 minutes = ₹{Math.round(3 * Number(policy?.latePenaltyRatePerMinute ?? 1.0))}</strong> fine.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col gap-2">
                <span className="text-xs font-bold text-[#1346a1] dark:text-[#E8DCC6] uppercase tracking-wider">
                  Rule 3: Financial Safety & Approval Workflow
                </span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Multi-stage Lifecycle & Caps</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Status transitions from <code>CALCULATED</code> → <code>PENDING_APPROVAL</code> → <code>APPROVED</code> / <code>WAIVED</code>.
                  Fines are strictly capped at max ₹{policy?.maxFinePerDay ?? 500}/day and ₹{policy?.maxFinePerMonth ?? 3000}/month, requiring authorized manager sign-off prior to payroll sync.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col gap-2">
                <span className="text-xs font-bold text-[#1346a1] dark:text-[#E8DCC6] uppercase tracking-wider">
                  Rule 4: Auditable Waivers & Early Incentives
                </span>
                <h4 className="font-bold text-sm text-slate-800 dark:text-slate-200">Mandatory Justifications & ₹{policy?.earlyLoginRatePerMinute ?? 1.0}/min Incentive</h4>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Every waiver, rejection, amount adjustment, or payroll reversal requires a non-empty reason recorded in the immutable audit history. Early punch-ins receive an independent ₹{policy?.earlyLoginRatePerMinute ?? 1.0}/min incentive.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: VIEW DETAILS & BREAKDOWN */}
        {selectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Late Attendance Calculation Breakdown
                    </h3>
                    <p className="text-xs text-slate-500">
                      {selectedRecord.employeeName} ({selectedRecord.employeeCode}) • {selectedRecord.departmentName}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 overflow-y-auto flex flex-col gap-5 text-xs">
                {/* Punch Comparison */}
                <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Scheduled Login</span>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                      {selectedRecord.scheduledLogin ? new Date(selectedRecord.scheduledLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Actual Biometric Punch</span>
                    <div className="text-sm font-bold text-rose-600 dark:text-rose-400 mt-0.5">
                      {selectedRecord.actualPunchIn ? new Date(selectedRecord.actualPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'MISSING'}
                    </div>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Grace Period</span>
                    <div className="text-sm font-bold text-teal-600 dark:text-teal-400 mt-0.5">
                      {selectedRecord.gracePeriodMinutes || 5} Minutes
                    </div>
                  </div>
                </div>

                {/* Calculation Breakdown Step by Step */}
                <div className="flex flex-col gap-2 p-4 rounded-xl border border-[#1346a1]/20 bg-[#1346a1]/5">
                  <span className="text-xs font-bold text-[#1346a1] uppercase tracking-wider flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    <span>Transparent Policy Calculation Math</span>
                  </span>
                  <div className="space-y-1.5 text-slate-700 dark:text-slate-300 font-mono text-[11px] pt-1">
                    <p>• Total delay from shift start: <strong>{selectedRecord.lateSeconds} seconds</strong> ({Math.round(selectedRecord.lateSeconds / 60)} mins)</p>
                    <p>• Grace tolerance applied: <strong>- {selectedRecord.gracePeriodMinutes * 60} seconds</strong> (5 mins)</p>
                    <p>• Net Chargeable late duration: <strong>{Math.round(selectedRecord.chargeableLateSeconds / 60)} minutes</strong> ({selectedRecord.chargeableLateSeconds} seconds)</p>
                    <p>• Fine Rate: <strong>₹{selectedRecord.fineRate || 1.0} per minute</strong></p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white pt-1">
                      = Total Calculated Fine: ₹{selectedRecord.calculatedFine}
                    </p>
                  </div>
                </div>

                {/* Status Snapshot */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400">Approval Status</span>
                    <div className="font-bold text-slate-800 dark:text-slate-100 mt-1">{selectedRecord.approvalStatus}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400">Payroll Status</span>
                    <div className="font-bold text-slate-800 dark:text-slate-100 mt-1">{selectedRecord.payrollStatus}</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                    <span className="text-[10px] font-bold text-slate-400">Final Deductible Fine</span>
                    <div className="font-extrabold text-[#1346a1] dark:text-[#E8DCC6] text-sm mt-1">₹{selectedRecord.finalFine}</div>
                  </div>
                </div>

                {/* Audit Trail */}
                {selectedRecord.historyJson && (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Action History & Audit Log:</span>
                    <div className="space-y-1.5 max-h-36 overflow-y-auto">
                      {safeJsonParse<any[]>(selectedRecord.historyJson, []).map((h: any, idx: number) => (
                        <div key={idx} className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                          <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-200">
                            <span>{h.action} by {h.byUser}</span>
                            <span className="text-[10px] font-normal text-slate-400">{new Date(h.timestamp).toLocaleString('en-IN')}</span>
                          </div>
                          <p className="text-slate-500 mt-0.5">{h.reason || h.note || 'No notes'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/40">
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  Close
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setWaiveModal({ isOpen: true, record: selectedRecord, reason: '' });
                      setSelectedRecord(null);
                    }}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 text-white font-semibold"
                  >
                    Waive Fine
                  </button>
                  <button
                    onClick={() => {
                      handleApproveFine(selectedRecord.id);
                    }}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                  >
                    Approve Fine
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 2: DRILL-DOWN MODAL */}
        {drillDownModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-[#1346a1]" />
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      Drill-down: {drillDownModal.title}
                    </h3>
                    <p className="text-xs text-slate-500">
                      Showing {drillDownModal.records.length} records matching this calculation KPI
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDrillDownModal({ isOpen: false, title: '', metric: '', records: [] })}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                      <th className="py-2.5 px-3">Emp ID</th>
                      <th className="py-2.5 px-3">Name</th>
                      <th className="py-2.5 px-3">Department</th>
                      <th className="py-2.5 px-3">Scheduled</th>
                      <th className="py-2.5 px-3">Punch In</th>
                      <th className="py-2.5 px-3">Delay (min)</th>
                      <th className="py-2.5 px-3">Fine (₹)</th>
                      <th className="py-2.5 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {drillDownModal.records.map((r, idx) => (
                      <tr key={`${r.id || idx}-${idx}`} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-mono font-bold">{r.employeeCode}</td>
                        <td className="py-2 px-3 font-bold">{r.employeeName}</td>
                        <td className="py-2 px-3">{r.departmentName}</td>
                        <td className="py-2 px-3 font-mono">
                          {r.scheduledLogin ? new Date(r.scheduledLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                        </td>
                        <td className="py-2 px-3 font-mono">
                          {r.actualPunchIn ? new Date(r.actualPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'MISSING'}
                        </td>
                        <td className="py-2 px-3 font-bold text-rose-600">
                          {r.chargeableLateSeconds > 0 ? `+${Math.round(r.chargeableLateSeconds / 60)}m` : '0m'}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-[#1346a1] dark:text-[#E8DCC6]">
                          ₹{r.finalFine}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                            {r.approvalStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setDrillDownModal({ isOpen: false, title: '', metric: '', records: [] })}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 text-white font-semibold text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: WAIVE FINE MODAL (MANDATORY REASON) */}
        {waiveModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-slate-700" />
                  <span>Waive Late Fine</span>
                </h3>
                <button
                  onClick={() => setWaiveModal({ isOpen: false, record: null, reason: '' })}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Waiving fine of <strong>₹{waiveModal.record?.calculatedFine}</strong> for{' '}
                <strong>{waiveModal.record?.employeeName}</strong>. A mandatory reason is required for compliance and audit trail.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Waiver Justification Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  value={waiveModal.reason}
                  onChange={(e) => setWaiveModal(prev => ({ ...prev, reason: e.target.value }))}
                  placeholder="e.g. Heavy rainfall in Belagavi hub causing public transport gridlock approved by Floor Manager"
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => setWaiveModal({ isOpen: false, record: null, reason: '' })}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleWaiveSubmit}
                  className="px-4 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold"
                >
                  Confirm & Waive Fine
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: POLICY RULES SETTINGS */}
        {isPolicyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#1346a1]" />
                  <span>Late & Fine Rules Settings</span>
                </h3>
                <button
                  onClick={() => setIsPolicyModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Grace Period (Minutes)</label>
                  <input
                    type="number"
                    value={policy.gracePeriodMinutes}
                    onChange={(e) => setPolicy({ ...policy, gracePeriodMinutes: Number(e.target.value) })}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Late Fine Rate (₹/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={policy.latePenaltyRatePerMinute ?? policy.latePenaltyRatePerSecond ?? 1.0}
                    onChange={(e) => setPolicy({
                      ...policy,
                      latePenaltyRatePerMinute: Number(e.target.value),
                      latePenaltyRatePerSecond: Number(e.target.value)
                    })}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Early Incentive Rate (₹/min)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={policy.earlyLoginRatePerMinute ?? policy.earlyLoginRatePerSecond ?? 1.0}
                    onChange={(e) => setPolicy({
                      ...policy,
                      earlyLoginRatePerMinute: Number(e.target.value),
                      earlyLoginRatePerSecond: Number(e.target.value)
                    })}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Max Fine Per Day (₹)</label>
                  <input
                    type="number"
                    value={policy.maxFinePerDay}
                    onChange={(e) => setPolicy({ ...policy, maxFinePerDay: Number(e.target.value) })}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">Max Fine Per Month (₹)</label>
                  <input
                    type="number"
                    value={policy.maxFinePerMonth}
                    onChange={(e) => setPolicy({ ...policy, maxFinePerMonth: Number(e.target.value) })}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setIsPolicyModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    try {
                      await api.put('/late-fines/policy', policy);
                      toast.success('Fine policy updated successfully');
                      setIsPolicyModalOpen(false);
                      await fetchPolicy();
                      fetchDashboardMetrics();
                      fetchRecords();
                    } catch (err: any) {
                      toast.error('Failed to update policy');
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-[#1346a1] text-white text-xs font-bold"
                >
                  Save Policy Configuration
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 5: EMPLOYEE COMPLETE HISTORY */}
        {employeeHistoryModal.isOpen && employeeHistoryModal.data && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Employee Punctuality & Fine Ledger
                  </h3>
                  <p className="text-xs text-slate-500">
                    {employeeHistoryModal.data.employee.fullName} ({employeeHistoryModal.data.employee.employeeCode}) • {employeeHistoryModal.data.employee.departmentName}
                  </p>
                </div>
                <button
                  onClick={() => setEmployeeHistoryModal({ isOpen: false, data: null })}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              {/* Summary Badges */}
              <div className="grid grid-cols-4 gap-3 p-4 bg-slate-50/50 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Late Shifts</span>
                  <div className="text-base font-bold text-rose-600">
                    {employeeHistoryModal.data.summary.totalLateCount} Days
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Total Delay</span>
                  <div className="text-base font-bold text-slate-800 dark:text-slate-100">
                    {employeeHistoryModal.data.summary.totalLateMinutes} Mins
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Calculated Fines</span>
                  <div className="text-base font-bold text-[#1346a1] dark:text-[#E8DCC6]">
                    ₹{employeeHistoryModal.data.summary.totalCalculatedFine}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Deducted in Payroll</span>
                  <div className="text-base font-bold text-indigo-600">
                    ₹{employeeHistoryModal.data.summary.totalPayrollAppliedFine}
                  </div>
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex-1">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase text-[10px] font-bold">
                      <th className="py-2 px-3">Date</th>
                      <th className="py-2 px-3">Punch In</th>
                      <th className="py-2 px-3">Delay</th>
                      <th className="py-2 px-3">Fine (₹)</th>
                      <th className="py-2 px-3">Approval</th>
                      <th className="py-2 px-3">Payroll</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {employeeHistoryModal.data.records.map((r: any, idx: number) => (
                      <tr key={`${r.id || idx}-${idx}`}>
                        <td className="py-2 px-3 font-mono">{String(r.recordDate).split('T')[0]}</td>
                        <td className="py-2 px-3 font-mono">
                          {r.actualPunchIn ? new Date(r.actualPunchIn).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : 'MISSING'}
                        </td>
                        <td className="py-2 px-3 font-bold text-rose-600">
                          {r.chargeableLateSeconds > 0 ? `+${Math.round(r.chargeableLateSeconds / 60)}m` : 'Grace / On time'}
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-[#1346a1] dark:text-[#E8DCC6]">
                          ₹{r.finalFine}
                        </td>
                        <td className="py-2 px-3 font-semibold">{r.approvalStatus}</td>
                        <td className="py-2 px-3 font-semibold">{r.payrollStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-3 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  onClick={() => setEmployeeHistoryModal({ isOpen: false, data: null })}
                  className="px-4 py-1.5 rounded-lg bg-slate-800 text-white font-semibold text-xs"
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
