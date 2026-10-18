'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X,
  RotateCw,
  Users,
  Clock,
  Banknote,
  CheckCircle2,
  Building2,
  Calendar,
  ShieldCheck,
  FileText,
  Download,
  ArrowRight,
  ExternalLink,
  AlertCircle,
  FileCheck,
  BadgeCheck,
  Lock,
  Smartphone,
  CreditCard,
  Shirt,
  DollarSign,
} from 'lucide-react';

export type FormerDrawerType = 'TOTAL_EXITS' | 'CLEARANCES_PENDING' | 'READY_FOR_PAYOUT' | 'COMPLETED_PAID' | null;

interface FormerStaffCardDrawerProps {
  isOpen: boolean;
  type: FormerDrawerType;
  onClose: () => void;
  exits: any[];
  allExits: any[];
  stats: any;
  locations: any[];
  currentBranchId: string;
  currentExitType: string;
  searchQuery: string;
  loading: boolean;
  onRefresh: () => void;
  onShowInTable: (tabKey: 'ALL' | 'RESIGNED' | 'TERMINATED' | 'READY_FOR_PAYMENT' | 'PAID', statusFilter?: string) => void;
  onOpenClearanceModal: (item: any) => void;
  onOpenPaymentModal: (item: any) => void;
  onOpenBreakdownModal: (item: any) => void;
  onDownloadPdf: (settlementId: string, employeeCode: string) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

export function FormerStaffCardDrawer({
  isOpen,
  type,
  onClose,
  exits,
  allExits,
  stats,
  locations,
  currentBranchId,
  currentExitType,
  searchQuery,
  loading,
  onRefresh,
  onShowInTable,
  onOpenClearanceModal,
  onOpenPaymentModal,
  onOpenBreakdownModal,
  onDownloadPdf,
  triggerRef,
}: FormerStaffCardDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll and manage focus
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Focus close button on open
    setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }

      // Trap focus
      if (e.key === 'Tab' && drawerRef.current) {
        const focusableElements = drawerRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length > 0) {
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    const triggerElement = triggerRef?.current;
    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener('keydown', handleKeyDown);
      // Return focus to trigger
      if (triggerElement) {
        triggerElement.focus();
      }
    };
  }, [isOpen, onClose, triggerRef]);

  if (!mounted || !isOpen || !type) return null;

  // Active filter labels
  const activeBranchName = currentBranchId
    ? locations.find((l) => l.id === currentBranchId)?.name || 'Filtered Branch'
    : 'All Branches';

  const activeExitTypeName = currentExitType
    ? currentExitType === 'RESIGNATION'
      ? 'Resignation'
      : currentExitType === 'TERMINATION'
      ? 'Termination'
      : currentExitType
    : 'All Exit Types';

  // Filter records based on drawer type and module filters
  const filteredRecords = allExits.filter((item) => {
    // 1. Module Branch Filter
    if (currentBranchId && item.location_id !== currentBranchId && item.locationId !== currentBranchId) {
      return false;
    }
    // 2. Module Exit Type Filter
    if (currentExitType && item.exit_type !== currentExitType) {
      return false;
    }
    // 3. Module Search Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = (item.full_name || item.employee_name || '').toLowerCase();
      const code = (item.employee_code || item.code || '').toLowerCase();
      const email = (item.email || '').toLowerCase();
      if (!name.includes(q) && !code.includes(q) && !email.includes(q)) {
        return false;
      }
    }

    // 4. Drawer specific filtering
    if (type === 'TOTAL_EXITS') {
      return true;
    }
    if (type === 'CLEARANCES_PENDING') {
      const tasks = item.clearanceTasks || [];
      const pendingTasks = tasks.filter(
        (t: any) => t.status !== 'APPROVED' && t.status !== 'CLEARED' && t.status !== 'WAIVED'
      );
      return (
        item.exit_status === 'CLEARANCE_PENDING' ||
        item.exit_status === 'CLEARANCE_IN_PROGRESS' ||
        pendingTasks.length > 0
      );
    }
    if (type === 'READY_FOR_PAYOUT') {
      const sStatus = item.settlement_status || item.settlement?.status;
      return sStatus === 'APPROVED' || sStatus === 'PAYMENT_PENDING' || item.exit_status === 'READY_FOR_PAYMENT';
    }
    if (type === 'COMPLETED_PAID') {
      const sStatus = item.settlement_status || item.settlement?.status || item.exit_status;
      return sStatus === 'PAID' || sStatus === 'CLOSED';
    }
    return true;
  });

  // Calculate drawer header details
  const getDrawerConfig = () => {
    switch (type) {
      case 'TOTAL_EXITS':
        return {
          title: 'Total Staff Left',
          subtitle: 'All departed workforce members across departments and store branches.',
          icon: Users,
          iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400',
          badgeColor: 'bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200 dark:border-blue-800',
          targetTab: 'ALL' as const,
          targetStatus: undefined,
          targetTabLabel: 'Show all departed staff in table',
        };
      case 'CLEARANCES_PENDING':
        return {
          title: 'Handovers Pending',
          subtitle: 'Store equipment, POS terminals, security credentials, and key handovers.',
          icon: Clock,
          iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400',
          badgeColor: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
          targetTab: 'ALL' as const,
          targetStatus: 'CLEARANCE_IN_PROGRESS',
          targetTabLabel: 'Filter pending clearances in table',
        };
      case 'READY_FOR_PAYOUT':
        return {
          title: 'Ready for Payout',
          subtitle: 'Management approved final settlements prepared for bank disbursement.',
          icon: Banknote,
          iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400',
          badgeColor: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
          targetTab: 'READY_FOR_PAYMENT' as const,
          targetStatus: 'APPROVED',
          targetTabLabel: 'Show Ready to Pay records in table',
        };
      case 'COMPLETED_PAID':
        return {
          title: 'Completed & Paid',
          subtitle: 'Fully settled departures with verified bank transfer UTR references.',
          icon: CheckCircle2,
          iconBg: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
          badgeColor: 'bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border-purple-200 dark:border-purple-800',
          targetTab: 'PAID' as const,
          targetStatus: 'PAID',
          targetTabLabel: 'Show Paid & Closed records in table',
        };
    }
  };

  const config = getDrawerConfig();
  const IconComponent = config.icon;

  // Aggregate metrics for drawer summary headers
  const totalPayableReady = filteredRecords.reduce((acc, curr) => {
    const val = Number(curr.settlement_amount ?? curr.settlement?.net_payable ?? 0);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const totalPaidAmount = filteredRecords.reduce((acc, curr) => {
    const val = Number(curr.settlement_amount ?? curr.settlement?.net_payable ?? 0);
    return acc + (isNaN(val) ? 0 : val);
  }, 0);

  const resignedCount = filteredRecords.filter((r) => r.exit_type === 'RESIGNATION').length;
  const terminatedCount = filteredRecords.filter((r) => r.exit_type === 'TERMINATION').length;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ backgroundColor: 'rgba(15, 23, 42, 0.55)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="card-drawer-title"
    >
      <div
        ref={drawerRef}
        className="w-full sm:w-[85vw] lg:w-[620px] max-w-full h-full bg-white dark:bg-slate-900 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800 animate-in slide-in-from-right duration-250 ease-out"
      >
        {/* DRAWER HEADER */}
        <div className="p-5 sm:p-6 border-b border-slate-200/90 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/80">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${config.iconBg}`}>
                <IconComponent className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 id="card-drawer-title" className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                    {config.title}
                  </h2>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.badgeColor}`}>
                    {filteredRecords.length} {filteredRecords.length === 1 ? 'Record' : 'Records'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                  {config.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={onRefresh}
                disabled={loading}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                title="Refresh drawer data"
                aria-label="Refresh drawer data"
              >
                <RotateCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                ref={closeButtonRef}
                onClick={onClose}
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors"
                title="Close details (Esc)"
                aria-label="Close details"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Active Filter Strip */}
          <div className="mt-3.5 pt-3 border-t border-slate-200/60 dark:border-slate-800/80 flex items-center flex-wrap gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Active Filters:</span>
            <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium flex items-center gap-1">
              <Building2 className="w-3 h-3 text-slate-400" />
              {activeBranchName}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-medium">
              {activeExitTypeName}
            </span>
            {searchQuery && (
              <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 text-[11px] font-medium truncate max-w-[180px]">
                Search: "{searchQuery}"
              </span>
            )}
          </div>
        </div>

        {/* DRAWER BODY (Scrollable Internally) */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* TOP SUMMARY STRIP FOR SPECIFIC CARDS */}
          {type === 'TOTAL_EXITS' && (
            <div className="grid grid-cols-3 gap-2.5 p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200/80 dark:border-blue-900/60 text-xs">
              <div>
                <span className="text-slate-500 dark:text-slate-400 block font-medium">Total Departed</span>
                <span className="text-lg font-bold text-slate-900 dark:text-white mt-0.5 block">
                  {filteredRecords.length} Staff
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block font-medium">Resignations</span>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-0.5 block">
                  {resignedCount}
                </span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400 block font-medium">Terminations</span>
                <span className="text-lg font-bold text-red-600 dark:text-red-400 mt-0.5 block">
                  {terminatedCount}
                </span>
              </div>
            </div>
          )}

          {type === 'READY_FOR_PAYOUT' && (
            <div className="p-4 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-emerald-800 dark:text-emerald-300 block">
                  Total Approved for Bank Transfer
                </span>
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {filteredRecords.length} final settlement awaiting bank payment
                </span>
              </div>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 font-mono">
                ₹{totalPayableReady.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}

          {type === 'COMPLETED_PAID' && (
            <div className="p-4 bg-purple-50/80 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs uppercase tracking-wider font-bold text-purple-800 dark:text-purple-300 block">
                  Total Final Pay Disbursed
                </span>
                <span className="text-[11px] text-purple-600 dark:text-purple-400 mt-0.5 block">
                  {filteredRecords.length} accounts closed with verified UTR
                </span>
              </div>
              <div className="text-2xl font-black text-purple-700 dark:text-purple-300 font-mono">
                ₹{totalPaidAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>
          )}

          {/* LOADING SKELETON */}
          {loading ? (
            <div className="space-y-3.5 py-4">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-3 animate-pulse bg-slate-50/50 dark:bg-slate-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700"></div>
                    <div className="space-y-1.5 flex-1">
                      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3"></div>
                      <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-1/4"></div>
                    </div>
                  </div>
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                </div>
              ))}
            </div>
          ) : filteredRecords.length === 0 ? (
            /* EMPTY STATES */
            <div className="py-14 text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-3.5">
                {type === 'CLEARANCES_PENDING' ? (
                  <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                ) : (
                  <Users className="w-7 h-7 text-slate-400" />
                )}
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {type === 'CLEARANCES_PENDING'
                  ? 'Zero Pending Handovers'
                  : type === 'READY_FOR_PAYOUT'
                  ? 'No Payouts Waiting For Transfer'
                  : type === 'COMPLETED_PAID'
                  ? 'No Disbursed Settlements Found'
                  : 'No Matching Exited Staff Found'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1.5 leading-relaxed">
                {type === 'CLEARANCES_PENDING'
                  ? 'All department equipment, security access credentials, POS terminals, and locker keys have been returned and cleared across all branches.'
                  : type === 'READY_FOR_PAYOUT'
                  ? 'All calculated final salaries have either been paid or are awaiting HR sign-off.'
                  : type === 'COMPLETED_PAID'
                  ? 'No staff settlements matching the active filters have been marked paid.'
                  : 'No departed staff records found matching the current search keyword or branch filter.'}
              </p>
            </div>
          ) : (
            /* RECORD LIST */
            <div className="space-y-4">
              {filteredRecords.map((item) => {
                const empId = item.employee_id || item.employeeId || item.id;
                const empName = item.full_name || item.employee_name || 'Staff Member';
                const empCode = item.employee_code || item.code || 'EMP';
                const designation = item.designation || 'Former Staff Member';
                const branchName = item.location_name || item.location?.name || 'Belagavi Head Store';
                const deptName = item.department_name || item.department?.name || 'Retail Floor';
                const exitType = item.exit_type || 'RESIGNATION';
                const lastDay = item.last_working_day || item.last_working_date;
                const netAmount = item.settlement_amount ?? item.settlement?.net_payable ?? null;
                const settlementStatus = item.settlement_status || item.settlement?.status || item.exit_status;
                const paymentRef = item.payment_reference || item.settlement?.payment_reference || null;
                const reason = item.reason || 'Standard employment separation';

                // Clearance info
                const clearanceTasks = item.clearanceTasks || [];
                const clearedCount = clearanceTasks.filter(
                  (t: any) => t.status === 'APPROVED' || t.status === 'CLEARED' || t.status === 'WAIVED'
                ).length;
                const totalClearanceCount = clearanceTasks.length;

                return (
                  <div
                    key={item.id || item.exit_id}
                    className="p-4 sm:p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-800/50 border border-slate-200/90 dark:border-slate-700/80 hover:border-blue-300 dark:hover:border-blue-700 transition-all shadow-sm space-y-3.5"
                  >
                    {/* Top Identity Row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Link
                          href={`/employees/profile/${empId}`}
                          className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm hover:ring-2 hover:ring-blue-500 transition-all"
                          title="Open Employee Profile"
                        >
                          {empName.substring(0, 2).toUpperCase()}
                        </Link>
                        <div className="min-w-0">
                          <Link
                            href={`/employees/profile/${empId}`}
                            className="font-bold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors text-sm flex items-center gap-1.5 leading-snug group"
                          >
                            <span className="truncate">{empName}</span>
                            <ExternalLink className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 shrink-0" />
                          </Link>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{empCode}</span>
                            <span>•</span>
                            <span className="truncate">{designation}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status / Type Badge */}
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${
                          exitType === 'TERMINATION'
                            ? 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                        }`}
                      >
                        {exitType === 'RESIGNATION' ? 'Resigned' : exitType === 'TERMINATION' ? 'Terminated' : exitType}
                      </span>
                    </div>

                    {/* Meta Specs Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/60 dark:border-slate-800">
                      <div>
                        <span className="text-slate-400 uppercase text-[10px] tracking-wider font-bold block">
                          Branch & Dept
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 truncate block">
                          {branchName} • {deptName}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 uppercase text-[10px] tracking-wider font-bold block">
                          Last Working Day
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 mt-0.5 block">
                          {lastDay ? new Date(lastDay).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not available'}
                        </span>
                      </div>
                    </div>

                    {/* CARD 1 SPECIFIC DETAILS: Notice & Reason */}
                    {type === 'TOTAL_EXITS' && (
                      <div className="space-y-2 text-xs">
                        <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                          <span className="text-slate-400">Notice Period Status:</span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {item.notice_period_days || 30} Days Notice Served
                          </span>
                        </div>
                        <div className="text-slate-500 dark:text-slate-400 bg-slate-100/70 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200/50 dark:border-slate-700/50">
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-0.5">Exit Reason:</span>
                          "{reason}"
                        </div>
                        <div className="flex items-center justify-between pt-1">
                          <span className="text-slate-400">F&F Settlement Status:</span>
                          <span
                            className={`px-2 py-0.5 rounded-md font-semibold text-[11px] ${
                              settlementStatus === 'PAID'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : settlementStatus === 'APPROVED'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {settlementStatus === 'PAID'
                              ? 'Paid & Closed'
                              : settlementStatus === 'APPROVED'
                              ? 'Ready for Payout'
                              : 'Clearance In Progress'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* CARD 2 SPECIFIC DETAILS: Checklist & Asset Returns */}
                    {type === 'CLEARANCES_PENDING' && (
                      <div className="space-y-2.5 text-xs">
                        <div className="flex justify-between items-center">
                          <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[11px]">
                            Handover Items Checklist
                          </span>
                          <span className="font-semibold text-amber-600">
                            {clearedCount}/{totalClearanceCount || 5} Returned
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { name: 'POS Handheld Terminal', icon: Smartphone, returned: clearedCount > 0 },
                            { name: 'Staff Locker Key', icon: Lock, returned: clearedCount > 1 },
                            { name: 'Identity & Access Card', icon: CreditCard, returned: clearedCount > 2 },
                            { name: 'Store Security Keycard', icon: ShieldCheck, returned: clearedCount > 3 },
                            { name: 'Uniform & Inventory', icon: Shirt, returned: clearedCount > 4 },
                          ].map((itemCheck, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 text-[11px]"
                            >
                              <itemCheck.icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="truncate flex-1">{itemCheck.name}</span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  itemCheck.returned
                                    ? 'bg-emerald-100 text-emerald-700'
                                    : 'bg-amber-100 text-amber-700'
                                }`}
                              >
                                {itemCheck.returned ? 'Returned' : 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex justify-between items-center pt-1 text-slate-500">
                          <span>Responsible Approver: <strong>Store Manager / IT Admin</strong></span>
                          <span>Due: <strong>On last working day</strong></span>
                        </div>
                      </div>
                    )}

                    {/* CARD 3 SPECIFIC DETAILS: Final Pay Calculation Breakdown */}
                    {type === 'READY_FOR_PAYOUT' && (
                      <div className="space-y-2 text-xs">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                          <div className="flex justify-between">
                            <span className="text-slate-500">Unpaid Worked Days Salary:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.unpaid_salary_amount != null ? `₹${Number(item.unpaid_salary_amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Leave Encashment (Earned Leave):</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.leave_encashment_amount != null ? `₹${Number(item.leave_encashment_amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Special Floor Bonus / Allowance:</span>
                            <span className="font-semibold text-slate-800 dark:text-slate-200">
                              {item.bonus_incentive_amount != null ? `₹${Number(item.bonus_incentive_amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between text-red-600 dark:text-red-400">
                            <span>Statutory Deductions (PF / PT):</span>
                            <span>{item.total_deductions != null ? `-₹${Number(item.total_deductions).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</span>
                          </div>
                          <div className="border-t border-slate-100 dark:border-slate-800 pt-1.5 flex justify-between font-bold text-sm text-emerald-600 dark:text-emerald-400">
                            <span>Net Payable Amount:</span>
                            <span className="font-mono">
                              {netAmount != null ? `₹${Number(netAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-slate-500 pt-1">
                          <span>Bank Account: <strong className="font-mono text-slate-700 dark:text-slate-300">{item.bank_account || 'Not on file'}</strong></span>
                          <span className="text-emerald-600 font-semibold">{settlementStatus || 'Pending'}</span>
                        </div>
                      </div>
                    )}

                    {/* CARD 4 SPECIFIC DETAILS: Payment Record & Settlement Letter */}
                    {type === 'COMPLETED_PAID' && (
                      <div className="space-y-2 text-xs">
                        <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-800 space-y-1.5">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Disbursed Net Amount:</span>
                            <span className="font-bold text-slate-900 dark:text-white font-mono text-sm">
                              {netAmount != null ? `₹${Number(netAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Disbursement Date:</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {item.payment_date ? new Date(item.payment_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not recorded'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Bank UTR Reference:</span>
                            <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
                              {paymentRef || 'Not recorded'}
                            </span>
                          </div>
                          <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                            <span className="text-slate-500">Settlement Document:</span>
                            <span className="font-semibold text-emerald-600 flex items-center gap-1">
                              <BadgeCheck className="w-3.5 h-3.5" />
                              Statement PDF
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons Strip */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 dark:border-slate-800 text-xs">
                      <Link
                        href={`/employees/profile/${empId}`}
                        className="text-blue-600 dark:text-blue-400 font-semibold hover:underline flex items-center gap-1"
                      >
                        <span>View Profile 360</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>

                      <div className="flex items-center gap-2">
                        {type === 'READY_FOR_PAYOUT' && (
                          <button
                            onClick={() => {
                              onOpenPaymentModal(item);
                              onClose();
                            }}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs shadow-sm flex items-center gap-1"
                          >
                            <Banknote className="w-3.5 h-3.5" />
                            Pay Out
                          </button>
                        )}

                        {type === 'COMPLETED_PAID' && (
                          <button
                            onClick={() => item.settlement_id && onDownloadPdf(item.settlement_id, empCode)}
                            disabled={!item.settlement_id}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-xs flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Download className="w-3.5 h-3.5 text-red-500" />
                            Statement PDF
                          </button>
                        )}

                        <button
                          onClick={() => {
                            onOpenBreakdownModal(item);
                            onClose();
                          }}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-semibold text-xs"
                        >
                          F&F Breakdown
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* DRAWER FOOTER */}
        <div className="p-4 sm:p-5 border-t border-slate-200/90 dark:border-slate-800 shrink-0 bg-slate-50/50 dark:bg-slate-900/80 flex items-center justify-between gap-3">
          <button
            onClick={() => {
              onShowInTable(config.targetTab, config.targetStatus);
              onClose();
            }}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-xs shadow-sm flex items-center gap-1.5 transition-all"
          >
            <ArrowRight className="w-4 h-4" />
            <span>Show in table</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
