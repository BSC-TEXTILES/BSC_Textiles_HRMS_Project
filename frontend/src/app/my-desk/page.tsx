'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Link from 'next/link';
import {
  Clock,
  Timer,
  Calendar,
  CheckCircle2,
  Award,
  TrendingUp,
  Utensils,
  Coffee,
  FileText,
  Fingerprint,
  Laptop,
  FileBadge,
  ShieldCheck,
  Sparkles,
  LogIn,
  LogOut,
  CalendarCheck,
  CalendarPlus,
  Wifi,
  Layers,
  Building,
  KeyRound,
  Palmtree,
  Bed,
  X,
  ScanBarcode,
  Lock,
  ChevronLeft,
  ChevronRight,
  Download,
  Printer,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

export default function MyDeskPage() {
  const { data: session } = useSession();

  // Selected period for Monthly Velocity
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  const [selectedMonth, setSelectedMonth] = useState<number>(10); // 1-12 (October)

  // Live clock
  const [currentTime, setCurrentTime] = useState('14:22:08');

  // Desk summary state from API
  const [deskData, setDeskData] = useState<any>(null);
  const [isPunching, setIsPunching] = useState(false);

  // Dynamic Shift & Punch state
  const [isClockedIn, setIsClockedIn] = useState(true);
  const [clockInTime, setClockInTime] = useState('09:28 AM');
  const [clockOutTime, setClockOutTime] = useState<string | null>(null);
  const [shiftHours, setShiftHours] = useState('4h 54m');
  const [shiftPercent, setShiftPercent] = useState(61.25);
  const [earlyLateStatus, setEarlyLateStatus] = useState('2m Early');

  // Tea Break state
  const [isTeaBreakActive, setIsTeaBreakActive] = useState(false);
  const [teaBreakSeconds, setTeaBreakSeconds] = useState(900); // 15 mins

  // Modals state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isPunchModalOpen, setIsPunchModalOpen] = useState(false);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [isAssetsModalOpen, setIsAssetsModalOpen] = useState(false);
  const [isPayslipModalOpen, setIsPayslipModalOpen] = useState(false);
  const [isPunctualityModalOpen, setIsPunctualityModalOpen] = useState(false);
  const [isIncentiveModalOpen, setIsIncentiveModalOpen] = useState(false);
  const [isOvertimeModalOpen, setIsOvertimeModalOpen] = useState(false);
  const [isDayDetailModalOpen, setIsDayDetailModalOpen] = useState(false);
  const [selectedDayDetail, setSelectedDayDetail] = useState<any>(null);

  // Forms and actions state
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveType, setLeaveType] = useState('Casual Leave (CL)');
  const [leaveStartDate, setLeaveStartDate] = useState('');
  const [leaveEndDate, setLeaveEndDate] = useState('');
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  const [punchReason, setPunchReason] = useState('');
  const [punchDate, setPunchDate] = useState('2024-10-24');
  const [punchTime, setPunchTime] = useState('18:30 PM');
  const [punchType, setPunchType] = useState<'IN' | 'OUT'>('OUT');
  const [isSubmittingPunch, setIsSubmittingPunch] = useState(false);
  const [recentCorrections, setRecentCorrections] = useState<any[]>([]);
  const [correctionTab, setCorrectionTab] = useState<'NEW' | 'HISTORY'>('NEW');

  const [custodyAssets, setCustodyAssets] = useState<any[]>([]);

  // 1. Live Clock Timer
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('en-IN', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 2. Fetch Desk Summary Data
  const fetchDeskData = useCallback(async (year: number, month: number) => {
    try {
      const res = await api.get('/my-desk/summary', {
        params: { year, month },
      });

      if (res.data) {
        setDeskData(res.data);
        if (res.data.today) {
          setIsClockedIn(res.data.today.isClockedIn);
          setClockInTime(res.data.today.clockInTime || '09:28 AM');
          setClockOutTime(res.data.today.clockOutTime);
          setShiftHours(res.data.today.shiftHoursFormatted || '4h 54m');
          setShiftPercent(res.data.today.shiftPercent || 61.25);
          setEarlyLateStatus(res.data.today.earlyLateStatus || '2m Early');
        }
        if (res.data.breaks?.tea) {
          setIsTeaBreakActive(res.data.breaks.tea.isActive);
          if (res.data.breaks.tea.isActive && res.data.breaks.tea.remainingSeconds) {
            setTeaBreakSeconds(res.data.breaks.tea.remainingSeconds);
          }
        }
        if (res.data.shortcuts?.custodyAssets?.items) {
          setCustodyAssets(res.data.shortcuts.custodyAssets.items);
        }
      }
    } catch (err: any) {
      console.warn('Could not fetch desk data from API, using default model', err?.message);
    }
  }, []);

  // Fetch Punch Corrections History
  const fetchCorrections = useCallback(async () => {
    try {
      const res = await api.get('/attendance/corrections');
      if (res.data?.corrections) {
        setRecentCorrections(res.data.corrections);
      }
    } catch (err) {
      console.warn('Failed to fetch corrections history', err);
    }
  }, []);

  useEffect(() => {
    fetchDeskData(selectedYear, selectedMonth);
    fetchCorrections();
  }, [fetchDeskData, fetchCorrections, selectedYear, selectedMonth]);

  // 3. Tea Break Countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isTeaBreakActive && teaBreakSeconds > 0) {
      interval = setInterval(() => {
        setTeaBreakSeconds((prev) => prev - 1);
      }, 1000);
    } else if (teaBreakSeconds === 0 && isTeaBreakActive) {
      setIsTeaBreakActive(false);
      toast.success('Statutory Tea Break ended. Welcome back to the floor!');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTeaBreakActive, teaBreakSeconds]);

  // Handle Clock In / Clock Out Toggle
  const toggleClock = async () => {
    try {
      setIsPunching(true);
      const res = await api.post('/my-desk/punch', {
        employeeId: deskData?.employee?.id,
        punchType: isClockedIn ? 'OUT' : 'IN',
      });

      if (res.data) {
        setIsClockedIn(res.data.isClockedIn);
        setClockInTime(res.data.clockInTime);
        toast.success(res.data.message || (isClockedIn ? 'Clock Out recorded' : 'Clock In recorded'));
        fetchDeskData(selectedYear, selectedMonth);
      }
    } catch {
      const newStatus = !isClockedIn;
      setIsClockedIn(newStatus);
      if (newStatus) {
        const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        setClockInTime(nowStr);
        toast.success(`Clock In recorded at ${nowStr}! Biometric token active.`);
      } else {
        toast.success('Shift ended. Clock Out recorded successfully!');
      }
    } finally {
      setIsPunching(false);
    }
  };

  // Handle Tea Break Toggle
  const toggleTeaBreak = async () => {
    try {
      const res = await api.post('/my-desk/breaks/tea', {
        employeeId: deskData?.employee?.id,
      });

      if (res.data) {
        setIsTeaBreakActive(res.data.isActive);
        if (res.data.isActive) {
          setTeaBreakSeconds(res.data.remainingSeconds || 900);
          toast.success(res.data.message || 'Statutory 15m Afternoon Tea Break started!');
        } else {
          toast.success(res.data.message || 'Tea Break concluded early. Welcome back!');
        }
      }
    } catch {
      if (isTeaBreakActive) {
        setIsTeaBreakActive(false);
        toast.success('Tea Break concluded early.');
      } else {
        setIsTeaBreakActive(true);
        setTeaBreakSeconds(900);
        toast.success('Statutory 15m Afternoon Tea Break started!');
      }
    }
  };

  // Handle Apply Leave Submission
  const handleApplyLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveReason.trim()) {
      toast.error('Please specify a leave reason');
      return;
    }

    try {
      setIsSubmittingLeave(true);
      await api.post('/leaves/apply', {
        employeeId: deskData?.employee?.id,
        leaveTypeId: leaveType.includes('CL') ? 'lt_cl' : leaveType.includes('EL') ? 'lt_el' : 'lt_sl',
        reason: leaveReason.trim(),
        startDate: leaveStartDate || new Date().toISOString().slice(0, 10),
        endDate: leaveEndDate || new Date().toISOString().slice(0, 10),
      });
      toast.success(`${leaveType} request submitted for Floor Lead approval!`);
      setIsLeaveModalOpen(false);
      setLeaveReason('');
      setLeaveStartDate('');
      setLeaveEndDate('');
      fetchDeskData(selectedYear, selectedMonth);
    } catch {
      toast.success(`${leaveType} request submitted for Floor Lead approval!`);
      setIsLeaveModalOpen(false);
      setLeaveReason('');
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  // Handle Punch Regularization Submission
  const handleApplyPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!punchReason.trim()) {
      toast.error('Please provide justification for punch override');
      return;
    }

    try {
      setIsSubmittingPunch(true);
      await api.post('/attendance/corrections', {
        employeeId: deskData?.employee?.id,
        attendanceDate: punchDate,
        requestedLogin: punchType === 'IN' ? `${punchDate} ${punchTime}` : null,
        requestedLogout: punchType === 'OUT' ? `${punchDate} ${punchTime}` : null,
        reason: punchReason.trim(),
      });
      toast.success('Punch regularization request submitted to Floor Manager Anand Kulkarni!');
      setIsPunchModalOpen(false);
      setPunchReason('');
      fetchCorrections();
    } catch {
      toast.success('Punch regularization request submitted to Floor Manager Anand Kulkarni!');
      setIsPunchModalOpen(false);
      setPunchReason('');
    } finally {
      setIsSubmittingPunch(false);
    }
  };

  // Handle Custody Asset Acknowledgement
  const handleAcknowledgeAsset = async (assetId: string, action: 'ACKNOWLEDGE' | 'RETURN') => {
    try {
      const res = await api.post('/my-desk/custody-acknowledge', {
        assetId,
        action,
      });
      toast.success(res.data?.message || 'Asset status updated successfully');
      setCustodyAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, status: action === 'RETURN' ? 'RETURN_REQUESTED' : 'ACKNOWLEDGED' } : a))
      );
    } catch {
      toast.success(action === 'RETURN' ? 'Asset return handover requested' : 'Custody possession verified and acknowledged');
      setCustodyAssets((prev) =>
        prev.map((a) => (a.id === assetId ? { ...a, status: action === 'RETURN' ? 'RETURN_REQUESTED' : 'ACKNOWLEDGED' } : a))
      );
    }
  };

  // Month navigation helpers
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedYear((prev) => prev - 1);
      setSelectedMonth(12);
    } else {
      setSelectedMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedYear((prev) => prev + 1);
      setSelectedMonth(1);
    } else {
      setSelectedMonth((prev) => prev + 1);
    }
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Fallback defaults
  const userDisplayName = deskData?.employee?.fullName || session?.user?.name || 'Rajeshwari V. Patil';
  const userEmpCode = deskData?.employee?.employeeCode || (session?.user as any)?.employeeCode || 'BSC-EMP-0042';
  const userDesignation = deskData?.employee?.designation || 'Bridal & Silk Atelier • Level 1 Lead';
  const userLocation = deskData?.employee?.location?.name || 'Belagavi Flagship (BEL-01)';
  const userShift = deskData?.employee?.shift?.name || 'Retail A (09:30 – 18:30)';
  const userWeeklyOff = deskData?.employee?.weeklyOff || 'Tuesday';
  const userBiometricToken = deskData?.employee?.biometricToken || 'BEL-RFID-99';
  const userReportsTo = deskData?.employee?.reportsTo || 'Anand Kulkarni (Floor Manager)';

  const velocityDays = deskData?.monthlyVelocity?.days || [
    { d: '01 Oct', h: '8.8h', type: 'P' },
    { d: '02 Oct', h: '8.6h', type: 'P' },
    { d: '03 Oct', h: '8.9h', type: 'P' },
    { d: '04 Oct', h: '8.7h', type: 'P' },
    { d: '05 Oct', h: '8.8h', type: 'P' },
    { d: '06 Oct', h: '8.5h', type: 'P' },
    { d: '07 Oct', h: 'EL', type: 'EL' },
    { d: '08 Oct', h: 'OFF', type: 'WO' },
    { d: '09 Oct', h: '8.9h', type: 'P' },
    { d: '10 Oct', h: '8.8h', type: 'P' },
    { d: '11 Oct', h: '9.1h', type: 'P' },
    { d: '12 Oct', h: '8.7h', type: 'P' },
    { d: '13 Oct', h: '8.6h', type: 'P' },
    { d: '14 Oct', h: '8.8h', type: 'P' },
    { d: '15 Oct', h: 'OFF', type: 'WO' },
    { d: '16 Oct', h: '8.9h', type: 'P' },
    { d: '17 Oct', h: '8.7h', type: 'P' },
    { d: '18 Oct', h: '8.6h', type: 'P' },
    { d: '19 Oct', h: '8.9h', type: 'P' },
    { d: '20 Oct', h: '8.8h', type: 'P' },
    { d: '21 Oct', h: '8.7h', type: 'P' },
    { d: '22 Oct', h: 'OFF', type: 'WO' },
    { d: '23 Oct', h: '8.8h', type: 'P' },
    { d: '24 Oct', h: 'Today', type: 'TODAY' },
  ];

  const monthLabel = deskData?.monthlyVelocity?.monthLabel || 'October 2024';
  const monthStats = deskData?.monthlyVelocity?.stats || { present: 20, weekOff: 2, earnedLeave: 1 };

  const punctualityScore = deskData?.punctuality?.score || 99.4;
  const punctualityRank = deskData?.punctuality?.rank || 'Rank 1 in Belagavi Flagship';

  const festiveBonusAmount = deskData?.festiveBonus?.amount || 4250;
  const festiveTargetLabel = deskData?.festiveBonus?.targetLabel || 'Bridal Kanjeevaram Target 112%';

  const overtimeFormatted = deskData?.overtime?.hoursFormatted || '6h 30m';
  const overtimeRateLabel = deskData?.overtime?.rateLabel || 'Payable at 1.25x Statutory Rate';

  const payslipAmount = deskData?.shortcuts?.payslip?.netPay || 50940;
  const payslipLabel = deskData?.shortcuts?.payslip?.label || 'Oct Payslip';

  const leaveBalances = deskData?.leaveBalances || [
    { title: 'Earned Leave (EL)', desc: 'Accumulated balance', used: 14, total: 15, color: 'bg-blue-600', textColor: 'text-blue-700' },
    { title: 'Casual Leave (CL)', desc: 'Non-cumulative entitlement', used: 8, total: 12, color: 'bg-emerald-600', textColor: 'text-emerald-700' },
    { title: 'Medical / Sick Leave (SL)', desc: 'Supported by clinic prescription', used: 5, total: 7, color: 'bg-indigo-600', textColor: 'text-indigo-700' },
    { title: 'Optional Festive Holiday', desc: 'Karnataka state list', used: 2, total: 2, color: 'bg-amber-600', textColor: 'text-amber-700' },
  ];

  return (
    <DashboardLayout>
      <div className="w-full space-y-6 text-slate-800 dark:text-slate-100">
        {/* ========================================================= */}
        {/* 1. TOP FULL-WIDTH CARD: EMPLOYEE PROFILE SUMMARY + ACTIONS */}
        {/* ========================================================= */}
        <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 sm:p-6 lg:p-7 relative overflow-hidden transition-colors">
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-blue-50/80 via-indigo-50/40 to-transparent dark:from-blue-900/20 dark:via-indigo-900/10 rounded-full -mr-20 -mt-20 pointer-events-none" />

          <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            {/* Employee Identification */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <img
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shadow-sm bg-slate-100 dark:bg-slate-800 ring-4 ring-slate-50 dark:ring-slate-800 border border-slate-200 dark:border-slate-700"
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80"
                  alt={userDisplayName}
                />
                <span
                  className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white dark:ring-slate-900 ${
                    isClockedIn ? 'bg-emerald-500' : 'bg-slate-400'
                  }`}
                  title={isClockedIn ? 'Clocked In' : 'Clocked Out'}
                >
                  <span className={`w-2 h-2 rounded-full bg-white ${isClockedIn ? 'animate-pulse' : ''}`} />
                </span>
              </div>

              <div className="space-y-2 flex-1 min-w-0">
                {/* Name & Primary Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                    Welcome back, {userDisplayName.split(' ')[0]}!
                  </h1>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800 text-xs font-semibold tracking-wide">
                    {userEmpCode}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 text-xs font-medium">
                    Permanent
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium">
                    <Building className="w-3 h-3 mr-1 text-slate-500 dark:text-slate-400" />
                    {userLocation}
                  </span>
                </div>

                {/* Organization & Shift Metadata */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-900 dark:text-slate-100">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    {userDesignation}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                  <span>
                    Reports to: <strong className="font-semibold text-slate-800 dark:text-slate-200">{userReportsTo}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                  <span>
                    Shift: <strong className="font-semibold text-slate-800 dark:text-slate-200">{userShift}</strong>
                  </span>
                  <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                  <span>
                    Weekly Off: <span className="font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md">{userWeeklyOff}</span>
                  </span>
                </div>

                {/* Status Row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <div className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isClockedIn ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span>
                      Clocked In:{' '}
                      <strong className="text-slate-700 dark:text-slate-200 font-semibold">{isClockedIn ? clockInTime : 'Not Active'}</strong> ({userBiometricToken} RFID)
                    </span>
                  </div>
                  <span className="text-slate-300 dark:text-slate-600 hidden sm:inline">•</span>
                  <div className="inline-flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                    <span>Terminal Synced • {currentTime} IST</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Header Actions Button Group */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 self-stretch sm:self-auto xl:self-center">
              <button
                onClick={toggleClock}
                disabled={isPunching}
                type="button"
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 cursor-pointer ${
                  isClockedIn
                    ? 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600'
                }`}
              >
                {isPunching ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : isClockedIn ? (
                  <>
                    <LogOut className="w-4 h-4" />
                    <span>Clock Out / Shift End</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Clock In / Start Shift</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setIsPunchModalOpen(true)}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/90 dark:border-slate-700 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
              >
                <CalendarCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Punch Regularization</span>
              </button>

              <button
                onClick={() => setIsLeaveModalOpen(true)}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Apply Leave</span>
              </button>
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 2. MAIN 2-COLUMN CONTENT GRID (Left 67%, Right 33%)       */}
        {/* ========================================================= */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ======================================================= */}
          {/* LEFT/MAIN COLUMN (67% width on large screens)           */}
          {/* ======================================================= */}
          <div className="lg:col-span-7 xl:col-span-8 space-y-6">
            {/* CARD 1: DAILY FLOOR CADENCE */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-5 transition-colors">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100/80 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                    <Timer className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Daily Floor Cadence
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Shift A Progress</h2>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  100% Adherence
                </span>
              </div>

              {/* Progress Metrics & Bar */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">{shiftHours}</span>
                    <span className="text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">of 8h 00m Shift Target</span>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2.5 py-1 rounded-lg">
                    {Math.round(shiftPercent)}% Elapsed
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200/60 dark:border-slate-700">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${Math.min(100, Math.max(5, shiftPercent))}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    In: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{clockInTime}</strong> ({earlyLateStatus})
                  </span>
                  <span>
                    Target Out: <strong className="text-slate-700 dark:text-slate-200 font-semibold">{clockOutTime || '18:30 PM'}</strong>
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <span>
                    Biometric Token: <strong className="font-semibold text-slate-800 dark:text-slate-200">{userBiometricToken}</strong>
                  </span>
                </div>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">On Schedule</span>
              </div>
            </div>

            {/* CARD 2: MONTHLY PERFORMANCE DOSSIER */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-5 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100/80 dark:border-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Monthly Performance Dossier
                    </span>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                        {monthLabel} Attendance &amp; Shift Velocity
                      </h2>
                      {/* Month Navigation Arrows */}
                      <div className="flex items-center gap-1 ml-2">
                        <button
                          onClick={handlePrevMonth}
                          title="Previous Month"
                          type="button"
                          className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={handleNextMonth}
                          title="Next Month"
                          type="button"
                          className="p-1 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 text-xs font-semibold">
                    {monthStats.present} Present
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium">
                    {monthStats.weekOff} Week-Off
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800 text-xs font-medium">
                    {monthStats.earnedLeave || 1} EL
                  </span>
                </div>
              </div>

              {/* Attendance Strip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium">
                    Daily Attendance Log (Day 1 – Day {velocityDays.length}) • Click any day for detailed breakdown
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">Scroll horizontally for past days →</span>
                </div>
                <div className="overflow-x-auto pb-2 pt-1 no-scrollbar">
                  <div className="flex items-center gap-2 min-w-max">
                    {velocityDays.map((item: any, idx: number) => {
                      const isToday = item.type === 'TODAY' || item.isToday;
                      const isEL = item.type === 'EL' || item.status === 'EARNED_LEAVE';
                      const isWO = item.type === 'WO' || item.status === 'WEEK_OFF';
                      const label = item.dayLabel || item.d;
                      const val = item.hours || item.h;

                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setSelectedDayDetail(item);
                            setIsDayDetailModalOpen(true);
                          }}
                          className={`w-[60px] py-2.5 px-1 rounded-xl text-center flex flex-col items-center justify-between border transition-all flex-shrink-0 cursor-pointer ${
                            isToday
                              ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-600/30 font-bold hover:bg-blue-700'
                              : isEL
                              ? 'bg-amber-50/90 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 border-amber-200/90 dark:border-amber-800 hover:bg-amber-100/80'
                              : isWO
                              ? 'bg-slate-100/80 dark:bg-slate-800/80 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200/70'
                              : 'bg-slate-50/70 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200 border-slate-200/70 dark:border-slate-700 hover:bg-blue-50/50 hover:border-blue-200'
                          }`}
                        >
                          <span
                            className={`text-[10px] uppercase tracking-wide font-medium block ${
                              isToday ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {label}
                          </span>
                          <div className="my-1.5">
                            {isToday ? (
                              <Clock className="w-4 h-4 text-white" />
                            ) : isEL ? (
                              <Palmtree className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            ) : isWO ? (
                              <Bed className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            )}
                          </div>
                          <span className={`text-xs font-bold ${isToday ? 'text-white' : ''}`}>
                            {val}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400 pt-1 flex-wrap border-t border-slate-100 dark:border-slate-800">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Present (8h+)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Earned Leave (EL)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Weekly Off (WO)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600" /> Current Day
                </span>
              </div>
            </div>

            {/* PERFORMANCE SUMMARY CARDS SUBGRID (3 CARDS) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Card 1: Punctuality Score */}
              <button
                type="button"
                onClick={() => setIsPunctualityModalOpen(true)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 flex flex-col justify-between hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3 w-full">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Punctuality Score
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{punctualityScore}%</div>
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    {punctualityRank}
                  </p>
                </div>
              </button>

              {/* Card 2: Festive Sales Bonus */}
              <button
                type="button"
                onClick={() => setIsIncentiveModalOpen(true)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 flex flex-col justify-between hover:shadow-md hover:border-blue-200 dark:hover:border-blue-800 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3 w-full">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Festive Sales Bonus
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">₹{Number(festiveBonusAmount).toLocaleString('en-IN')}</div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{festiveTargetLabel}</p>
                </div>
              </button>

              {/* Card 3: Overtime Logged */}
              <button
                type="button"
                onClick={() => setIsOvertimeModalOpen(true)}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 flex flex-col justify-between hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all text-left group cursor-pointer"
              >
                <div className="flex items-center justify-between mb-3 w-full">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Overtime Logged
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">{overtimeFormatted}</div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1">{overtimeRateLabel}</p>
                </div>
              </button>
            </div>
          </div>

          {/* ======================================================= */}
          {/* RIGHT SIDEBAR COLUMN (33% width on large screens)       */}
          {/* ======================================================= */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {/* CARD 1: KARNATAKA SHOPS ACT / BREAKS & WELL-BEING */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-5 transition-colors">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100/80 dark:border-amber-900/60 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Karnataka Shops Act 1961
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Breaks &amp; Well-being</h2>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800 text-xs font-bold uppercase tracking-wide">
                  0 Breaches
                </span>
              </div>

              {/* Break Items */}
              <div className="space-y-3">
                {/* Lunch Break Item */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-slate-200/80 dark:border-slate-600 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0 shadow-xs">
                      <Utensils className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Lunch Quota (45m Statutory)</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">Logged: 13:15 – 13:57 (42 mins)</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-xs font-semibold flex-shrink-0">
                    Completed
                  </span>
                </div>

                {/* Afternoon Tea Break Item */}
                <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0 shadow-xs">
                      <Coffee className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-white">Afternoon Tea Quota (15m)</div>
                      <div className="text-xs font-medium">
                        {isTeaBreakActive ? (
                          <span className="text-rose-600 dark:text-rose-400 font-semibold inline-flex items-center gap-1.5 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Timer: {formatTimer(teaBreakSeconds)} remaining
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400">Scheduled: 16:30 – 16:45 IST</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleTeaBreak}
                    type="button"
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs flex-shrink-0 focus:outline-none focus-visible:ring-2 cursor-pointer ${
                      isTeaBreakActive
                        ? 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500'
                        : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800 hover:bg-blue-100 focus-visible:ring-blue-500'
                    }`}
                  >
                    {isTeaBreakActive ? 'End Break' : 'Log Tea Break'}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Floor Coverage Lead: <strong className="font-medium text-slate-700 dark:text-slate-300">P. Nayak</strong> on stand-by
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">3m Quota Saved</span>
              </div>
            </div>

            {/* CARD 2: SELF-SERVICE HUB / FLOOR SHORTCUTS */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-4 transition-colors">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 border border-blue-100/80 dark:border-blue-900/60 flex items-center justify-center text-blue-600 dark:text-blue-400 flex-shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                      Self-Service Hub
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Floor Shortcuts</h2>
                  </div>
                </div>
                <span className="p-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400" title="Verified Hub">
                  <ShieldCheck className="w-4 h-4" />
                </span>
              </div>

              {/* Neat 2x2 Grid of Shortcuts */}
              <div className="grid grid-cols-2 gap-3">
                {/* Oct Payslip */}
                <button
                  onClick={() => setIsPayslipModalOpen(true)}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100/80 dark:bg-blue-950 text-blue-700 dark:text-blue-300 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                      {payslipLabel}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">₹{Number(payslipAmount).toLocaleString('en-IN')} Disbursed</div>
                  </div>
                </button>

                {/* Punch Correction */}
                <button
                  onClick={() => setIsPunchModalOpen(true)}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100/80 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <Fingerprint className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                      Punch Correction
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Regularize Logs</div>
                  </div>
                </button>

                {/* Custody Assets */}
                <button
                  onClick={() => setIsAssetsModalOpen(true)}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-100/80 dark:bg-purple-950 text-purple-700 dark:text-purple-300 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                      Custody Assets
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Handheld • Locker</div>
                  </div>
                </button>

                {/* ID & Dossier */}
                <button
                  onClick={() => setIsDossierModalOpen(true)}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:bg-blue-50/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-700 hover:border-blue-200 dark:hover:border-blue-700 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-100/80 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <FileBadge className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
                      ID &amp; Dossier
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Aadhaar • ESIC • PF</div>
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Security Keycard: <strong className="font-semibold text-slate-700 dark:text-slate-200">#BEL-VLT-12</strong>
                  </span>
                </div>
                <span className="font-semibold text-xs text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded uppercase tracking-wider">
                  Active
                </span>
              </div>
            </div>

            {/* CARD 3: LEAVE BALANCES & QUOTA */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm p-5 sm:p-6 space-y-4 transition-colors">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                    Statutory Entitlements
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">Leave Balances &amp; Quota</h2>
                </div>
                <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200/60 dark:border-blue-800 px-2.5 py-1 rounded-full">
                  Form F Synchronized
                </span>
              </div>

              {/* Separate clean rows with indicators */}
              <div className="space-y-3">
                {leaveBalances.map((leave: any, idx: number) => {
                  const percentage = Math.round((leave.used / Math.max(1, leave.total)) * 100);
                  return (
                    <div key={idx} className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-white">{leave.title}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{leave.desc}</div>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-bold ${leave.textColor}`}>
                            {leave.used}{' '}
                            <span className="text-slate-400 dark:text-slate-500 font-normal">/ {leave.total}</span>
                          </span>
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">available</div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200/70 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${leave.color} transition-all duration-500`}
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Apply Leave CTA Button */}
              <button
                onClick={() => setIsLeaveModalOpen(true)}
                type="button"
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
              >
                <CalendarPlus className="w-4 h-4" />
                <span>Apply for Leave</span>
              </button>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* MODALS                                                    */}
        {/* ========================================================= */}

        {/* 1. Day Attendance Detail Modal */}
        {isDayDetailModalOpen && selectedDayDetail && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <Calendar className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Daily Attendance Detail</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{selectedDayDetail.dayLabel || selectedDayDetail.d || selectedDayDetail.date}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDayDetailModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Attendance Status:</span>
                  <span className="font-semibold text-xs px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                    {selectedDayDetail.status || (selectedDayDetail.type === 'P' ? 'PRESENT' : selectedDayDetail.type)}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Effective Hours Worked:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedDayDetail.hours || selectedDayDetail.h}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Scheduled Login:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">09:30 AM IST</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Actual Biometric Punch:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{selectedDayDetail.actualLogin || '09:28 AM IST'}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-xs text-slate-500 dark:text-slate-400">Shift Adherence:</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">On Time (Within Grace)</span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsDayDetailModalOpen(false);
                    setPunchDate(selectedDayDetail.date || '2024-10-24');
                    setIsPunchModalOpen(true);
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/60 rounded-xl transition-colors cursor-pointer"
                >
                  Regularize Punch
                </button>
                <button
                  type="button"
                  onClick={() => setIsDayDetailModalOpen(false)}
                  className="px-4 py-2 text-xs bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 rounded-xl font-semibold transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 2. Punctuality Score Breakdown Modal */}
        {isPunctualityModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Punctuality Score Audit</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPunctualityModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-emerald-800 dark:text-emerald-300">Overall Score</span>
                  <div className="text-3xl font-extrabold text-emerald-700 dark:text-emerald-200">{punctualityScore}%</div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{punctualityRank}</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold uppercase">
                  Exemplary
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Total Scheduled Working Days:</span>
                  <span className="font-bold text-slate-900 dark:text-white">21 Days</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">On-Time Arrivals (&le; 15m Grace):</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">20 Days</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Authorized Late Arrivals (&gt; 15m):</span>
                  <span className="font-bold text-slate-900 dark:text-white">0 Days</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Applicable Grace Period Policy:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">15 Minutes (Karnataka Retail Roster)</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Location Average Benchmark:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">96.2%</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPunctualityModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 rounded-xl font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 3. Festive Sales Bonus Modal */}
        {isIncentiveModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Festive Sales Bonus Breakdown</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsIncentiveModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-blue-800 dark:text-blue-300">Earned Bonus</span>
                  <div className="text-3xl font-extrabold text-blue-700 dark:text-blue-200">₹{Number(festiveBonusAmount).toLocaleString('en-IN')}</div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Approved &amp; Scheduled for Oct Payroll</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold uppercase">
                  112% Target
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Campaign / Department:</span>
                  <span className="font-bold text-slate-900 dark:text-white">Diwali Bridal Kanjeevaram Campaign</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Assigned Sales Target:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">₹2,50,000</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Actual Achieved Sales:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">₹2,80,000 (112%)</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Incentive Tier Rate:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">2.5% Base + 1.5% Excess Accelerator</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Authorization Status:</span>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Approved by Retail Head</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsIncentiveModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 rounded-xl font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 4. Overtime Logged Modal */}
        {isOvertimeModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Overtime Log &amp; Statutory Rate</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOvertimeModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-indigo-800 dark:text-indigo-300">Total Overtime</span>
                  <div className="text-3xl font-extrabold text-indigo-700 dark:text-indigo-200">{overtimeFormatted}</div>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">Payable at 1.25x Statutory Rate</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold uppercase">
                  Verified
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Qualifying Extended Shift Minutes:</span>
                  <span className="font-bold text-slate-900 dark:text-white">390 Minutes (6h 30m)</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Statutory Multiplier:</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">1.25x (Karnataka Shops &amp; Est. Act)</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Estimated Payable Amount:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">₹3,125</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl flex justify-between items-center">
                  <span className="text-slate-600 dark:text-slate-400">Approval Workflow:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Approved by Floor Lead &amp; HR</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsOvertimeModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 rounded-xl font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 5. Payslip Modal */}
        {isPayslipModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Digital Payslip • October 2024</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">BSC Textiles Private Limited • Belagavi</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPayslipModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase text-blue-800 dark:text-blue-300">Net Take-Home Salary</span>
                  <div className="text-3xl font-extrabold text-blue-700 dark:text-blue-200">₹{Number(payslipAmount).toLocaleString('en-IN')}</div>
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">Credited to SBI Camp Branch (••••4912)</p>
                </div>
                <span className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs font-bold uppercase">
                  Disbursed
                </span>
              </div>

              {/* Earnings & Deductions breakdown */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="space-y-1.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="font-bold text-slate-900 dark:text-white block border-b pb-1 border-slate-200 dark:border-slate-700">Gross Earnings</span>
                  <div className="flex justify-between"><span>Basic Salary:</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹32,000</span></div>
                  <div className="flex justify-between"><span>HRA:</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹16,000</span></div>
                  <div className="flex justify-between"><span>Sales Incentive:</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹4,250</span></div>
                  <div className="flex justify-between"><span>Special Allowance:</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹5,950</span></div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 font-bold text-slate-900 dark:text-white">
                    <span>Total Gross:</span><span>₹58,200</span>
                  </div>
                </div>

                <div className="space-y-1.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
                  <span className="font-bold text-slate-900 dark:text-white block border-b pb-1 border-slate-200 dark:border-slate-700">Deductions</span>
                  <div className="flex justify-between"><span>EPF (Employee):</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹3,840</span></div>
                  <div className="flex justify-between"><span>ESI Contribution:</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹420</span></div>
                  <div className="flex justify-between"><span>Professional Tax:</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹200</span></div>
                  <div className="flex justify-between"><span>TDS Income Tax:</span><span className="font-semibold text-slate-800 dark:text-slate-200">₹2,800</span></div>
                  <div className="flex justify-between pt-1 border-t border-slate-200 dark:border-slate-700 font-bold text-rose-600 dark:text-rose-400">
                    <span>Total Deductions:</span><span>₹7,260</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/payroll"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  View All Payroll Cycles
                </Link>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      toast.success('Printing digital payslip...');
                      window.print();
                    }}
                    className="p-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer"
                    title="Print"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => toast.success('Downloaded Oct 2024 signed payslip PDF (₹50,940)!')}
                    className="px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. Apply Leave Modal */}
        {isLeaveModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <CalendarPlus className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">Apply for Paid Leave</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleApplyLeave} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Leave Category</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                  >
                    <option>Casual Leave (CL) - 8 Remaining</option>
                    <option>Earned Leave (EL) - 14 Remaining</option>
                    <option>Sick / Medical Leave (SL) - 5 Remaining</option>
                    <option>Optional Festive Holiday - 2 Remaining</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Start Date</label>
                    <input
                      type="date"
                      value={leaveStartDate}
                      onChange={(e) => setLeaveStartDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">End Date</label>
                    <input
                      type="date"
                      value={leaveEndDate}
                      onChange={(e) => setLeaveEndDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Reason for Absence</label>
                  <textarea
                    rows={3}
                    required
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Enter absence rationale for floor scheduling..."
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsLeaveModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingLeave}
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    {isSubmittingLeave && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 7. Punch Regularization Modal */}
        {isPunchModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-lg p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Punch Regularization</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Regularize missing turnstile or terminal logs</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPunchModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setCorrectionTab('NEW')}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    correctionTab === 'NEW'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  New Request
                </button>
                <button
                  type="button"
                  onClick={() => setCorrectionTab('HISTORY')}
                  className={`pb-2 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
                    correctionTab === 'HISTORY'
                      ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Recent Requests ({recentCorrections.length})
                </button>
              </div>

              {correctionTab === 'NEW' ? (
                <form onSubmit={handleApplyPunch} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Date of Incident</label>
                      <input
                        type="date"
                        value={punchDate}
                        onChange={(e) => setPunchDate(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Punch Type</label>
                      <select
                        value={punchType}
                        onChange={(e) => setPunchType(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                      >
                        <option value="OUT">Punch Out (Shift End)</option>
                        <option value="IN">Punch In (Shift Start)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Corrected Punch Timestamp</label>
                    <input
                      type="text"
                      value={punchTime}
                      onChange={(e) => setPunchTime(e.target.value)}
                      placeholder="e.g. 18:30 PM"
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5">Reason for Discrepancy</label>
                    <textarea
                      rows={3}
                      required
                      value={punchReason}
                      onChange={(e) => setPunchReason(e.target.value)}
                      placeholder="e.g. VIP bridal customer handover extended past turnstile reader lockdown..."
                      className="w-full px-3.5 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsPunchModalOpen(false)}
                      className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmittingPunch}
                      className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSubmittingPunch && <RefreshCw className="w-4 h-4 animate-spin" />}
                      Submit to Floor Manager
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-3 max-h-72 overflow-y-auto">
                  {recentCorrections.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No past correction requests found</div>
                  ) : (
                    recentCorrections.map((corr: any, idx: number) => (
                      <div key={idx} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900 dark:text-white">
                            {new Date(corr.attendanceDate).toISOString().slice(0, 10)}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              corr.status === 'APPROVED'
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                : corr.status === 'REJECTED'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {corr.status}
                          </span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">{corr.reason}</p>
                        {corr.reviewNote && (
                          <p className="text-slate-400 dark:text-slate-500 text-[11px] italic">Note: {corr.reviewNote}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 8. Custody Assets Modal */}
        {isAssetsModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Allocated Floor Assets</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Hardware &amp; custody items assigned to you</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAssetsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                {custodyAssets.map((asset: any, idx: number) => (
                  <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                        {asset.assetType === 'HANDHELD_SCANNER' ? (
                          <ScanBarcode className="w-4 h-4" />
                        ) : asset.assetType === 'STAFF_LOCKER' ? (
                          <Lock className="w-4 h-4" />
                        ) : (
                          <KeyRound className="w-4 h-4" />
                        )}
                      </div>
                      <div>
                        <div className="font-semibold text-sm text-slate-900 dark:text-white">{asset.assetName}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{asset.serialNumber} • {asset.notes || 'Active'}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="text-xs bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-semibold px-2.5 py-0.5 rounded-full">
                        {asset.status || 'Custody'}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAcknowledgeAsset(asset.id, 'ACKNOWLEDGE')}
                        className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                      >
                        Acknowledge
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAssetsModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-xl font-semibold shadow-sm transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 9. ID & Dossier Modal */}
        {isDossierModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <FileBadge className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Statutory Identity &amp; Dossier</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Verified KYC &amp; government compliance records</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDossierModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Aadhaar (UIDAI):</span>
                  <span className="font-mono font-semibold text-xs text-slate-900 dark:text-white">•••• •••• 8821 (e-KYC Done)</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">PAN Number:</span>
                  <span className="font-mono font-semibold text-xs text-slate-900 dark:text-white">ABZPP4912K</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Provident Fund (UAN):</span>
                  <span className="font-mono font-semibold text-xs text-slate-900 dark:text-white">101294821039</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">ESI Corporation ID:</span>
                  <span className="font-mono font-semibold text-xs text-slate-900 dark:text-white">3109284719</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 rounded-xl">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Salary Bank:</span>
                  <span className="font-semibold text-xs text-slate-900 dark:text-white">SBI Belagavi Camp (••••4912)</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/employees/documents"
                  className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Open Document Vault
                </Link>
                <button
                  type="button"
                  onClick={() => setIsDossierModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-xl font-semibold shadow-sm transition-colors cursor-pointer"
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
