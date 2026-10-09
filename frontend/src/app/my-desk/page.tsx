'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';
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
} from 'lucide-react';

export default function MyDeskPage() {
  const { data: session } = useSession();
  const [currentTime, setCurrentTime] = useState('14:22:08');
  const [isClockedIn, setIsClockedIn] = useState(true);
  const [clockInTime, setClockInTime] = useState('09:28 AM');
  const [shiftHours] = useState('4h 54m');
  const [shiftPercent] = useState(61.25);
  const [isTeaBreakActive, setIsTeaBreakActive] = useState(false);
  const [teaBreakSeconds, setTeaBreakSeconds] = useState(900); // 15 mins
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [isPunchModalOpen, setIsPunchModalOpen] = useState(false);
  const [isDossierModalOpen, setIsDossierModalOpen] = useState(false);
  const [isAssetsModalOpen, setIsAssetsModalOpen] = useState(false);

  // Form states
  const [leaveReason, setLeaveReason] = useState('');
  const [leaveType, setLeaveType] = useState('Casual Leave (CL)');
  const [punchReason, setPunchReason] = useState('');
  const [punchTime, setPunchTime] = useState('18:30 PM');

  // Live timer
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

  // Tea break countdown
  useEffect(() => {
    let interval: NodeJS.Timeout | undefined;
    if (isTeaBreakActive && teaBreakSeconds > 0) {
      interval = setInterval(() => {
        setTeaBreakSeconds((prev) => prev - 1);
      }, 1000);
    } else if (teaBreakSeconds === 0) {
      setIsTeaBreakActive(false);
      toast.success('Statutory Tea Break ended. Welcome back to the floor!');
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTeaBreakActive, teaBreakSeconds]);

  const toggleClock = () => {
    if (isClockedIn) {
      setIsClockedIn(false);
      toast.success('Shift ended. Clock Out recorded successfully!');
    } else {
      setIsClockedIn(true);
      const nowStr = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      setClockInTime(nowStr);
      toast.success(`Clock In recorded at ${nowStr}! Biometric token active.`);
    }
  };

  const toggleTeaBreak = () => {
    if (isTeaBreakActive) {
      setIsTeaBreakActive(false);
      toast.success('Tea Break concluded early.');
    } else {
      setIsTeaBreakActive(true);
      setTeaBreakSeconds(900);
      toast.success('Statutory 15m Afternoon Tea Break started!');
    }
  };

  const handleApplyLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveReason.trim()) {
      toast.error('Please specify a leave reason');
      return;
    }
    toast.success(`${leaveType} request submitted for Floor Lead approval!`);
    setIsLeaveModalOpen(false);
    setLeaveReason('');
  };

  const handleApplyPunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!punchReason.trim()) {
      toast.error('Please provide justification for punch override');
      return;
    }
    toast.success('Punch regularization request submitted to Floor Manager Anand Kulkarni!');
    setIsPunchModalOpen(false);
    setPunchReason('');
  };

  const formatTimer = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const userDisplayName = session?.user?.name || 'Rajeshwari V. Patil';
  const userEmpCode = (session?.user as { employeeCode?: string })?.employeeCode || 'BSC-EMP-0042';

  return (
    <DashboardLayout>
      <div className="w-full space-y-6 text-slate-800">
        {/* ========================================================= */}
        {/* 1. TOP FULL-WIDTH CARD: EMPLOYEE PROFILE SUMMARY + ACTIONS */}
        {/* ========================================================= */}
        <section className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 lg:p-7 relative overflow-hidden">
          {/* Subtle gradient decorative glow */}
          <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-blue-50/80 via-indigo-50/40 to-transparent rounded-full -mr-20 -mt-20 pointer-events-none" />

          <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-6">
            {/* Employee Identification */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 flex-1 min-w-0">
              <div className="relative flex-shrink-0">
                <img
                  className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover shadow-sm bg-slate-100 ring-4 ring-slate-50 border border-slate-200"
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80"
                  alt={userDisplayName}
                />
                <span
                  className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white ${
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
                  <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                    Welcome back, {userDisplayName.split(' ')[0]}!
                  </h1>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/60 text-xs font-semibold tracking-wide">
                    {userEmpCode}
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-medium">
                    Permanent
                  </span>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-medium">
                    <Building className="w-3 h-3 mr-1 text-slate-500" />
                    Belagavi Flagship (BEL-01)
                  </span>
                </div>

                {/* Organization & Shift Metadata */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs sm:text-sm text-slate-600">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    Bridal &amp; Silk Atelier • Level 1 Lead
                  </span>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <span>
                    Reports to: <strong className="font-semibold text-slate-800">Anand Kulkarni</strong> (Floor Manager)
                  </span>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <span>
                    Shift: <strong className="font-semibold text-slate-800">Retail A (09:30 – 18:30)</strong>
                  </span>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <span>
                    Weekly Off: <span className="font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md">Tuesday</span>
                  </span>
                </div>

                {/* Status Row */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-0.5 text-xs text-slate-500">
                  <div className="inline-flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${isClockedIn ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <span>
                      Clocked In:{' '}
                      <strong className="text-slate-700 font-semibold">{isClockedIn ? clockInTime : 'Not Active'}</strong> (BEL-IN-02 RFID)
                    </span>
                  </div>
                  <span className="text-slate-300 hidden sm:inline">•</span>
                  <div className="inline-flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-blue-600" />
                    <span>Terminal Synced • {currentTime} IST</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Header Actions Button Group */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 self-stretch sm:self-auto xl:self-center">
              <button
                onClick={toggleClock}
                type="button"
                className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                  isClockedIn
                    ? 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-600'
                }`}
              >
                {isClockedIn ? (
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
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/90 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
              >
                <CalendarCheck className="w-4 h-4 text-blue-600" />
                <span>Punch Regularization</span>
              </button>

              <button
                onClick={() => setIsLeaveModalOpen(true)}
                type="button"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
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
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-blue-600 flex-shrink-0">
                    <Timer className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                      Daily Floor Cadence
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">Shift A Progress</h2>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  100% Adherence
                </span>
              </div>

              {/* Progress Metrics & Bar */}
              <div className="space-y-3">
                <div className="flex items-baseline justify-between flex-wrap gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">{shiftHours}</span>
                    <span className="text-xs sm:text-sm font-medium text-slate-500">of 8h 00m Shift Target</span>
                  </div>
                  <span className="text-xs sm:text-sm font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-lg">
                    {Math.round(shiftPercent)}% Elapsed
                  </span>
                </div>

                {/* Clean Progress Bar */}
                <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden p-0.5 border border-slate-200/60">
                  <div
                    className="bg-gradient-to-r from-blue-600 to-indigo-600 h-full rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${shiftPercent}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    In: <strong className="text-slate-700 font-semibold">{clockInTime}</strong> (2m Early)
                  </span>
                  <span>
                    Target Out: <strong className="text-slate-700 font-semibold">18:30 PM</strong>
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                <div className="flex items-center gap-1.5 font-medium">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <span>
                    Biometric Token: <strong className="font-semibold text-slate-800">BEL-RFID-99</strong>
                  </span>
                </div>
                <span className="font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">On Schedule</span>
              </div>
            </div>

            {/* CARD 2: MONTHLY PERFORMANCE DOSSIER */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-indigo-600 flex-shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                      Monthly Performance Dossier
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">
                      October 2024 Attendance &amp; Shift Velocity
                    </h2>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-semibold">
                    20 Present
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                    2 Week-Off
                  </span>
                  <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 border border-amber-200/60 text-xs font-medium">
                    1 EL
                  </span>
                </div>
              </div>

              {/* Attendance Strip */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span className="font-medium">Daily Attendance Log (Oct 1 – Oct 24)</span>
                  <span className="text-[11px] text-slate-400">Scroll horizontally for past days →</span>
                </div>
                <div className="overflow-x-auto pb-2 pt-1 no-scrollbar">
                  <div className="flex items-center gap-2 min-w-max">
                    {[
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
                    ].map((item, idx) => {
                      const isToday = item.type === 'TODAY';
                      const isEL = item.type === 'EL';
                      const isWO = item.type === 'WO';

                      return (
                        <div
                          key={idx}
                          className={`w-[60px] py-2.5 px-1 rounded-xl text-center flex flex-col items-center justify-between border transition-all flex-shrink-0 ${
                            isToday
                              ? 'bg-blue-600 text-white border-blue-700 shadow-md ring-2 ring-blue-600/30 font-bold'
                              : isEL
                              ? 'bg-amber-50/90 text-amber-900 border-amber-200/90 hover:bg-amber-100/80'
                              : isWO
                              ? 'bg-slate-100/80 text-slate-600 border-slate-200 hover:bg-slate-200/70'
                              : 'bg-slate-50/70 text-slate-800 border-slate-200/70 hover:bg-blue-50/50 hover:border-blue-200'
                          }`}
                        >
                          <span
                            className={`text-[10px] uppercase tracking-wide font-medium block ${
                              isToday ? 'text-blue-100' : 'text-slate-500'
                            }`}
                          >
                            {item.d}
                          </span>
                          <div className="my-1.5">
                            {isToday ? (
                              <Clock className="w-4 h-4 text-white" />
                            ) : isEL ? (
                              <Palmtree className="w-4 h-4 text-amber-600" />
                            ) : isWO ? (
                              <Bed className="w-4 h-4 text-slate-500" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                          <span className={`text-xs font-bold ${isToday ? 'text-white' : ''}`}>
                            {item.h}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs text-slate-500 pt-1 flex-wrap border-t border-slate-100">
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
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Punctuality Score
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle2 className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">99.4%</div>
                  <p className="text-xs font-medium text-emerald-600 mt-1 flex items-center gap-1">
                    <Award className="w-3.5 h-3.5" />
                    Rank 1 in Belagavi Flagship
                  </p>
                </div>
              </div>

              {/* Card 2: Festive Sales Bonus */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Festive Sales Bonus
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Sparkles className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-blue-600 tracking-tight">₹4,250</div>
                  <p className="text-xs font-medium text-slate-500 mt-1">Bridal Kanjeevaram Target 112%</p>
                </div>
              </div>

              {/* Card 3: Overtime Logged */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 flex flex-col justify-between hover:shadow-md transition-shadow">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Overtime Logged
                  </span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">6h 30m</div>
                  <p className="text-xs font-medium text-slate-500 mt-1">Payable at 1.25x Statutory Rate</p>
                </div>
              </div>
            </div>
          </div>

          {/* ======================================================= */}
          {/* RIGHT SIDEBAR COLUMN (33% width on large screens)       */}
          {/* ======================================================= */}
          <div className="lg:col-span-5 xl:col-span-4 space-y-6">
            {/* CARD 1: KARNATAKA SHOPS ACT / BREAKS & WELL-BEING */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100/80 flex items-center justify-center text-amber-600 flex-shrink-0">
                    <Utensils className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                      Karnataka Shops Act 1961
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">Breaks &amp; Well-being</h2>
                  </div>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 text-xs font-bold uppercase tracking-wide">
                  0 Breaches
                </span>
              </div>

              {/* Break Items */}
              <div className="space-y-3">
                {/* Lunch Break Item */}
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-blue-600 flex-shrink-0 shadow-xs">
                      <Utensils className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Lunch Quota (45m Statutory)</div>
                      <div className="text-xs text-slate-500">Logged: 13:15 – 13:57 (42 mins)</div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-semibold flex-shrink-0">
                    Completed
                  </span>
                </div>

                {/* Afternoon Tea Break Item */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 flex-shrink-0 shadow-xs">
                      <Coffee className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Afternoon Tea Quota (15m)</div>
                      <div className="text-xs font-medium">
                        {isTeaBreakActive ? (
                          <span className="text-rose-600 font-semibold inline-flex items-center gap-1.5 animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                            Timer: {formatTimer(teaBreakSeconds)} remaining
                          </span>
                        ) : (
                          <span className="text-slate-500">Scheduled: 16:30 – 16:45 IST</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={toggleTeaBreak}
                    type="button"
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-xs flex-shrink-0 focus:outline-none focus-visible:ring-2 ${
                      isTeaBreakActive
                        ? 'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500'
                        : 'bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 focus-visible:ring-blue-500'
                    }`}
                  >
                    {isTeaBreakActive ? 'End Break' : 'Log Tea Break'}
                  </button>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Floor Coverage Lead: <strong className="font-medium text-slate-700">P. Nayak</strong> on stand-by
                </span>
                <span className="font-semibold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">3m Quota Saved</span>
              </div>
            </div>

            {/* CARD 2: SELF-SERVICE HUB / FLOOR SHORTCUTS */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100/80 flex items-center justify-center text-blue-600 flex-shrink-0">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                      Self-Service Hub
                    </span>
                    <h2 className="text-base sm:text-lg font-bold text-slate-900">Floor Shortcuts</h2>
                  </div>
                </div>
                <span className="p-1.5 rounded-full bg-blue-50 text-blue-600" title="Verified Hub">
                  <ShieldCheck className="w-4 h-4" />
                </span>
              </div>

              {/* Neat 2x2 Grid of Shortcuts */}
              <div className="grid grid-cols-2 gap-3">
                {/* Oct Payslip */}
                <button
                  onClick={() => toast.success('Downloaded Oct 2024 digital payslip (₹50,940)!')}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/70 hover:border-blue-200 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100/80 text-blue-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                      Oct Payslip
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">₹50,940 Disbursed</div>
                  </div>
                </button>

                {/* Punch Correction */}
                <button
                  onClick={() => setIsPunchModalOpen(true)}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/70 hover:border-blue-200 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="w-8 h-8 rounded-lg bg-indigo-100/80 text-indigo-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <Fingerprint className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                      Punch Correction
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Regularize Logs</div>
                  </div>
                </button>

                {/* Custody Assets */}
                <button
                  onClick={() => setIsAssetsModalOpen(true)}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/70 hover:border-blue-200 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-100/80 text-purple-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                      Custody Assets
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Handheld • Locker</div>
                  </div>
                </button>

                {/* ID & Dossier */}
                <button
                  onClick={() => setIsDossierModalOpen(true)}
                  type="button"
                  className="p-3.5 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/70 hover:border-blue-200 transition-all text-left group flex flex-col justify-between focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-100/80 text-emerald-700 flex items-center justify-center mb-2.5 group-hover:scale-105 transition-transform">
                    <FileBadge className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
                      ID &amp; Dossier
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">Aadhaar • ESIC • PF</div>
                  </div>
                </button>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Security Keycard: <strong className="font-semibold text-slate-700">#BEL-VLT-12</strong>
                  </span>
                </div>
                <span className="font-semibold text-xs text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded uppercase tracking-wider">
                  Active
                </span>
              </div>
            </div>

            {/* CARD 3: LEAVE BALANCES & QUOTA */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 block">
                    Statutory Entitlements
                  </span>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">Leave Balances &amp; Quota</h2>
                </div>
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-2.5 py-1 rounded-full">
                  Form F Synchronized
                </span>
              </div>

              {/* Separate clean rows with indicators */}
              <div className="space-y-3">
                {[
                  {
                    title: 'Earned Leave (EL)',
                    desc: 'Accumulated balance',
                    used: 14,
                    total: 15,
                    color: 'bg-blue-600',
                    textColor: 'text-blue-700',
                  },
                  {
                    title: 'Casual Leave (CL)',
                    desc: 'Non-cumulative entitlement',
                    used: 8,
                    total: 12,
                    color: 'bg-emerald-600',
                    textColor: 'text-emerald-700',
                  },
                  {
                    title: 'Medical / Sick Leave (SL)',
                    desc: 'Supported by clinic prescription',
                    used: 5,
                    total: 7,
                    color: 'bg-indigo-600',
                    textColor: 'text-indigo-700',
                  },
                  {
                    title: 'Optional Festive Holiday',
                    desc: 'Karnataka state list',
                    used: 2,
                    total: 2,
                    color: 'bg-amber-600',
                    textColor: 'text-amber-700',
                  },
                ].map((leave, idx) => {
                  const percentage = Math.round((leave.used / leave.total) * 100);
                  return (
                    <div key={idx} className="p-3.5 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{leave.title}</div>
                          <div className="text-xs text-slate-500">{leave.desc}</div>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-bold ${leave.textColor}`}>
                            {leave.used}{' '}
                            <span className="text-slate-400 font-normal">/ {leave.total}</span>
                          </span>
                          <div className="text-[10px] text-slate-400 font-medium">available</div>
                        </div>
                      </div>
                      <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${leave.color} transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
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
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm shadow-sm flex items-center justify-center gap-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
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

        {/* Apply Leave Modal */}
        {isLeaveModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <CalendarPlus className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Apply for Paid Leave</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLeaveModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleApplyLeave} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Leave Category</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                  >
                    <option>Casual Leave (CL) - 8 Remaining</option>
                    <option>Earned Leave (EL) - 14 Remaining</option>
                    <option>Sick / Medical Leave (SL) - 5 Remaining</option>
                    <option>Optional Festive Holiday - 2 Remaining</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Reason for Absence</label>
                  <textarea
                    rows={3}
                    required
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Enter absence rationale for floor scheduling..."
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsLeaveModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-sm"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Punch Regularization Modal */}
        {isPunchModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <CalendarCheck className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Punch Regularization</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPunchModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleApplyPunch} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Corrected Punch Timestamp</label>
                  <input
                    type="text"
                    value={punchTime}
                    onChange={(e) => setPunchTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1.5">Reason for Discrepancy</label>
                  <textarea
                    rows={3}
                    required
                    value={punchReason}
                    onChange={(e) => setPunchReason(e.target.value)}
                    placeholder="e.g. VIP bridal customer handover extended past turnstile reader lockdown..."
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-slate-800 resize-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsPunchModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors font-semibold shadow-sm"
                  >
                    Submit to Floor Manager
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Custody Assets Modal */}
        {isAssetsModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Allocated Floor Assets</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAssetsModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-3">
                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                      <ScanBarcode className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-900">Zebra TC52 Touch Computer</div>
                      <div className="text-xs text-slate-500">SN: #TC52-BEL-4029 • Active</div>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">
                    Custody
                  </span>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-slate-900">Staff Locker Key #B-14</div>
                      <div className="text-xs text-slate-500">Basement Locker Wing B</div>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-semibold px-2.5 py-0.5 rounded-full">
                    Custody
                  </span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAssetsModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-sm transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ID & Dossier Modal */}
        {isDossierModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 space-y-5 animate-scale-in">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <FileBadge className="w-4 h-4" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">Statutory Identity &amp; Dossier</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsDossierModalOpen(false)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-medium text-slate-500">Aadhaar (UIDAI):</span>
                  <span className="font-mono font-semibold text-xs text-slate-900">•••• •••• 8821 (e-KYC Done)</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-medium text-slate-500">PAN Number:</span>
                  <span className="font-mono font-semibold text-xs text-slate-900">ABZPP4912K</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-medium text-slate-500">Provident Fund (UAN):</span>
                  <span className="font-mono font-semibold text-xs text-slate-900">101294821039</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-medium text-slate-500">ESI Corporation ID:</span>
                  <span className="font-mono font-semibold text-xs text-slate-900">3109284719</span>
                </div>
                <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <span className="text-xs font-medium text-slate-500">Salary Bank:</span>
                  <span className="font-semibold text-xs text-slate-900">SBI Belagavi Camp (••••4912)</span>
                </div>
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDossierModalOpen(false)}
                  className="px-4 py-2 text-sm bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold shadow-sm transition-colors"
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
