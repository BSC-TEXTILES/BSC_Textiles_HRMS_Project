'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

export default function MyDeskPage() {
  const { data: session } = useSession();
  const [currentTime, setCurrentTime] = useState('14:22:08');
  const [isClockedIn, setIsClockedIn] = useState(true);
  const [clockInTime, setClockInTime] = useState('09:28 AM');
  const [shiftHours, setShiftHours] = useState('4h 54m');
  const [shiftPercent, setShiftPercent] = useState(61.25);
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
    let interval: any;
    if (isTeaBreakActive && teaBreakSeconds > 0) {
      interval = setInterval(() => {
        setTeaBreakSeconds((prev) => prev - 1);
      }, 1000);
    } else if (teaBreakSeconds === 0) {
      setIsTeaBreakActive(false);
      toast.success('Statutory Tea Break ended. Welcome back to the floor!');
    }
    return () => clearInterval(interval);
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
    if (!leaveReason) {
      toast.error('Please specify a leave reason');
      return;
    }
    toast.success(`${leaveType} request submitted for Floor Lead approval!`);
    setIsLeaveModalOpen(false);
    setLeaveReason('');
  };

  const handleApplyPunch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!punchReason) {
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
  const userEmpCode = (session?.user as any)?.employeeCode || 'BSC-EMP-0042';

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-space-lg font-body-md text-on-surface">
        {/* Executive Header Profile Banner */}
        <section className="relative w-full rounded-2xl bg-surface-container-lowest shadow-sm border border-slate-200/80 p-space-lg overflow-hidden">
          <div className="absolute -right-16 -top-16 w-80 h-80 rounded-full bg-secondary-fixed/30 blur-3xl pointer-events-none"></div>
          <div className="relative flex flex-col xl:flex-row xl:items-center justify-between gap-space-lg">
            {/* Profile Identification */}
            <div className="flex items-start md:items-center gap-space-lg flex-1">
              <div className="relative flex-shrink-0">
                <img
                  className="w-16 h-16 md:w-20 md:h-20 rounded-xl object-cover shadow-sm bg-surface-container-low"
                  src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80"
                  alt={userDisplayName}
                />
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-secondary-container flex items-center justify-center ring-2 ring-surface-container-lowest">
                  <span className="w-2 h-2 rounded-full bg-surface-container-lowest animate-pulse"></span>
                </span>
              </div>
              <div className="flex flex-col gap-space-xs">
                <div className="flex flex-wrap items-center gap-space-xs">
                  <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                    Welcome back, {userDisplayName.split(' ')[0]}!
                  </h1>
                  <span className="inline-flex items-center px-space-sm py-0.5 rounded-lg bg-surface-container-low text-secondary font-label-sm text-label-sm uppercase tracking-wider font-bold">
                    {userEmpCode} • Permanent
                  </span>
                  <span className="inline-flex items-center px-space-sm py-0.5 rounded-lg bg-surface-container-high text-on-surface font-label-sm text-label-sm">
                    Belagavi Flagship (BEL-01)
                  </span>
                </div>
                <p className="font-body-md text-body-md text-on-surface-variant flex flex-wrap items-center gap-x-space-md gap-y-1">
                  <span className="flex items-center gap-1 text-on-surface font-semibold">
                    <span className="material-symbols-outlined text-[16px] text-secondary">styler</span>
                    Bridal &amp; Silk Atelier • Level 1 Lead
                  </span>
                  <span className="text-outline-variant">•</span>
                  <span>Reports to: <strong className="text-on-surface font-medium">Anand Kulkarni</strong> (Floor Manager)</span>
                  <span className="text-outline-variant">•</span>
                  <span>Shift: <strong className="text-on-surface font-medium">Retail A (09:30 – 18:30)</strong></span>
                  <span className="text-outline-variant">•</span>
                  <span>Weekly Off: <strong className="text-secondary font-semibold">Tuesday</strong></span>
                </p>
                <div className="flex items-center gap-space-md pt-1">
                  <div className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md">
                    <span className={`w-2 h-2 rounded-full ${isClockedIn ? 'bg-secondary' : 'bg-rose-500'}`}></span>
                    <span>Clocked In: <strong>{isClockedIn ? clockInTime : 'Not Active'}</strong> (BEL-IN-02 RFID)</span>
                  </div>
                  <span className="text-outline-variant">•</span>
                  <div className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md">
                    <span className="material-symbols-outlined text-[14px] text-secondary">wifi</span>
                    <span>Terminal Synced • {currentTime} IST</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Header Primary Quick CTA Group */}
            <div className="flex flex-wrap items-center gap-space-sm self-start xl:self-center">
              <button
                onClick={toggleClock}
                className={`px-space-md py-space-sm rounded-lg font-label-lg text-label-lg flex items-center gap-space-xs transition-all shadow-sm ${
                  isClockedIn
                    ? 'bg-primary text-on-primary hover:bg-slate-800'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">
                  {isClockedIn ? 'logout' : 'login'}
                </span>
                <span>{isClockedIn ? 'Clock Out / Shift End' : 'Clock In / Start Shift'}</span>
              </button>
              <button
                onClick={() => setIsPunchModalOpen(true)}
                className="px-space-md py-space-sm bg-surface-container-lowest text-on-surface rounded-lg font-label-lg text-label-lg flex items-center gap-space-xs hover:bg-surface-container-low transition-colors shadow-sm border border-slate-200/60"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px] text-secondary">edit_calendar</span>
                <span>Punch Regularization</span>
              </button>
              <button
                onClick={() => setIsLeaveModalOpen(true)}
                className="px-space-md py-space-sm bg-secondary text-on-secondary rounded-lg font-label-lg text-label-lg flex items-center gap-space-xs hover:bg-secondary-container transition-all shadow-sm"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                <span>Apply Leave</span>
              </button>
            </div>
          </div>
        </section>

        {/* 3 Hero Cards Bento: Attendance Pace, Break Tracker, Self-Service Hub */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Card 1: Today's Shift Velocity (4 cols) */}
          <div className="lg:col-span-4 rounded-xl bg-surface-container-lowest shadow-sm border border-slate-200/80 p-space-lg flex flex-col justify-between relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[20px]">timer</span>
                </div>
                <div>
                  <div className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Daily Floor Cadence</div>
                  <div className="font-headline-sm text-headline-sm text-on-surface font-bold">Shift A Progress</div>
                </div>
              </div>
              <span className="px-space-sm py-0.5 rounded-full bg-surface-container-low text-secondary font-label-sm text-label-sm font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span> 100% Adherence
              </span>
            </div>

            <div className="my-space-md flex flex-col gap-space-sm">
              <div className="flex items-baseline justify-between">
                <span className="font-display-lg text-display-lg text-on-surface font-bold tracking-tight">{shiftHours}</span>
                <span className="font-label-lg text-label-lg text-on-surface-variant">of 8h 00m Shift Target</span>
              </div>
              <div className="w-full bg-surface-container rounded-full h-3 overflow-hidden p-0.5 flex items-center">
                <div
                  className="bg-secondary h-full rounded-full transition-all duration-700"
                  style={{ width: `${shiftPercent}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant pt-1">
                <span>In: {clockInTime} (2m Early)</span>
                <span className="font-bold text-on-surface">{Math.round(shiftPercent)}% Elapsed</span>
                <span>Target Out: 18:30 PM</span>
              </div>
            </div>

            <div className="pt-space-sm bg-surface-container-low/60 -mx-space-lg -mb-space-lg p-space-md flex items-center justify-between border-t border-slate-100">
              <div className="flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface">
                <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
                <span>Biometric Token BEL-RFID-99</span>
              </div>
              <span className="font-label-md text-label-md text-secondary font-bold">On Schedule</span>
            </div>
          </div>

          {/* Card 2: Statutory Break Console (4 cols) */}
          <div className="lg:col-span-4 rounded-xl bg-surface-container-lowest shadow-sm border border-slate-200/80 p-space-lg flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <div className="w-9 h-9 rounded-lg bg-surface-container-high flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[20px]">restaurant</span>
                </div>
                <div>
                  <div className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Karnataka Shops Act 1961</div>
                  <div className="font-headline-sm text-headline-sm text-on-surface font-bold">Breaks &amp; Well-being</div>
                </div>
              </div>
              <span className="font-label-sm text-label-sm uppercase px-space-xs py-0.5 rounded bg-surface-container-low text-secondary font-bold">
                0 Breaches
              </span>
            </div>

            <div className="flex flex-col gap-space-sm my-space-sm">
              {/* Lunch Break Item */}
              <div className="p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-[20px] text-secondary">lunch_dining</span>
                  <div>
                    <div className="font-label-lg text-label-lg text-on-surface font-semibold">Lunch Quota (45m Statutory)</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">Logged: 13:15 – 13:57 (42 mins)</div>
                  </div>
                </div>
                <span className="px-space-xs py-0.5 rounded bg-surface-container text-secondary font-label-sm text-label-sm font-bold">
                  Completed
                </span>
              </div>

              {/* Afternoon Tea Break Item */}
              <div className="p-space-sm rounded-lg bg-surface-container-lowest shadow-sm border border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">coffee</span>
                  <div>
                    <div className="font-label-lg text-label-lg text-on-surface font-semibold">Afternoon Tea Quota (15m)</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">
                      {isTeaBreakActive
                        ? `Timer: ${formatTimer(teaBreakSeconds)} remaining`
                        : 'Scheduled: 16:30 – 16:45 IST'}
                    </div>
                  </div>
                </div>
                <button
                  onClick={toggleTeaBreak}
                  className={`px-space-sm py-1 rounded font-label-sm text-label-sm font-semibold transition-colors ${
                    isTeaBreakActive
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : 'bg-secondary-container text-on-secondary hover:opacity-90'
                  }`}
                  type="button"
                >
                  {isTeaBreakActive ? 'End Break' : 'Log Tea Break'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-space-xs text-xs text-on-surface-variant border-t border-slate-100">
              <span>Floor Coverage Lead: P. Nayak on stand-by</span>
              <span className="font-label-md text-label-md text-on-surface font-bold">3m Quota Saved</span>
            </div>
          </div>

          {/* Card 3: Quick Action Hub & Custody Assets (4 cols) */}
          <div className="lg:col-span-4 rounded-xl bg-surface-container-lowest shadow-sm border border-slate-200/80 p-space-lg flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[20px]">bolt</span>
                </div>
                <div>
                  <div className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Self-Service Hub</div>
                  <div className="font-headline-sm text-headline-sm text-on-surface font-bold">Floor Shortcuts</div>
                </div>
              </div>
              <span className="material-symbols-outlined text-outline-variant text-[18px]">verified</span>
            </div>

            <div className="grid grid-cols-2 gap-space-xs my-space-sm">
              <button
                onClick={() => toast.success('Downloaded Oct 2024 digital payslip (₹50,940)!')}
                className="p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col text-left group"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px] text-secondary group-hover:scale-110 transition-transform">receipt_long</span>
                <span className="font-label-md text-label-md text-on-surface font-semibold mt-1">Oct Payslip</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">₹50,940 Disbursed</span>
              </button>
              <button
                onClick={() => setIsPunchModalOpen(true)}
                className="p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col text-left group"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px] text-secondary group-hover:scale-110 transition-transform">fingerprint</span>
                <span className="font-label-md text-label-md text-on-surface font-semibold mt-1">Punch Correction</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Regularize Logs</span>
              </button>
              <button
                onClick={() => setIsAssetsModalOpen(true)}
                className="p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col text-left group"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px] text-secondary group-hover:scale-110 transition-transform">devices</span>
                <span className="font-label-md text-label-md text-on-surface font-semibold mt-1">Custody Assets</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Handheld • Locker</span>
              </button>
              <button
                onClick={() => setIsDossierModalOpen(true)}
                className="p-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container transition-colors flex flex-col text-left group"
                type="button"
              >
                <span className="material-symbols-outlined text-[20px] text-secondary group-hover:scale-110 transition-transform">assignment_ind</span>
                <span className="font-label-md text-label-md text-on-surface font-semibold mt-1">ID &amp; Dossier</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">Aadhaar • ESIC • PF</span>
              </button>
            </div>

            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm pt-1 border-t border-slate-100">
              <span>Store Security Keycard: #BEL-VLT-12</span>
              <span className="font-label-sm text-label-sm text-secondary font-bold uppercase tracking-wider">Active</span>
            </div>
          </div>
        </section>

        {/* Middle Section: October Attendance Ledger & Leave Quotas */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg">
          {/* Visual Attendance Strip & Velocity Bar Chart (8 cols) */}
          <div className="lg:col-span-8 rounded-xl bg-surface-container-lowest shadow-sm border border-slate-200/80 p-space-lg flex flex-col gap-space-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs">
              <div>
                <div className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Monthly Performance Dossier</div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold">October 2024 Attendance &amp; Shift Velocity</h2>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="px-space-sm py-1 rounded-lg bg-surface-container-low text-secondary font-label-md text-label-md font-bold">20 Present</span>
                <span className="px-space-sm py-1 rounded-lg bg-surface-container text-on-surface-variant font-label-md text-label-md">2 Week-Off</span>
                <span className="px-space-sm py-1 rounded-lg bg-surface-container-high text-on-surface font-label-md text-label-md">1 EL</span>
              </div>
            </div>

            {/* High-Density Monthly Calendar Strip (Days 1 - 24) */}
            <div className="overflow-x-auto pb-space-xs">
              <div className="min-w-[700px] grid grid-cols-12 gap-1.5">
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
                ].map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-2 rounded text-center flex flex-col items-center border border-slate-200/40 ${
                      item.type === 'TODAY'
                        ? 'bg-secondary text-white font-bold'
                        : item.type === 'EL'
                        ? 'bg-surface-container-high'
                        : item.type === 'WO'
                        ? 'bg-slate-100 text-slate-500'
                        : 'bg-surface-container-low'
                    }`}
                  >
                    <span className="font-label-sm text-[10px] block">{item.d}</span>
                    <span className="material-symbols-outlined text-[14px] my-0.5">
                      {item.type === 'EL' ? 'beach_access' : item.type === 'WO' ? 'bed' : 'check_circle'}
                    </span>
                    <span className="font-label-sm text-[11px] font-bold">{item.h}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Performance Accrual Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-space-xs border-t border-slate-100">
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Punctuality Score</span>
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface mt-1">99.4%</span>
                <span className="text-xs text-secondary font-medium">Rank 1 in Belagavi Flagship</span>
              </div>
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Festive Sales Bonus</span>
                <span className="font-headline-sm text-headline-sm font-bold text-secondary mt-1">₹4,250 Accrued</span>
                <span className="text-xs text-on-surface-variant">Bridal Kanjeevaram Target 112%</span>
              </div>
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Overtime Logged</span>
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface mt-1">6h 30m</span>
                <span className="text-xs text-on-surface-variant">Payable at 1.25x Statutory Rate</span>
              </div>
            </div>
          </div>

          {/* Right Column: Leave Balances & Statutory Entitlements (4 cols) */}
          <div className="lg:col-span-4 rounded-xl bg-surface-container-lowest shadow-sm border border-slate-200/80 p-space-lg flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-space-xs mb-space-sm">
                <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">Leave Balances &amp; Quota</h3>
                <span className="font-label-sm text-label-sm text-secondary font-bold">Form F Synchronized</span>
              </div>

              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-surface-container-low flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-on-surface block">Earned Leave (EL)</span>
                    <span className="text-xs text-on-surface-variant">Accumulated balance</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm font-bold text-secondary">14 / 15</span>
                </div>

                <div className="p-3 rounded-lg bg-surface-container-low flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-on-surface block">Casual Leave (CL)</span>
                    <span className="text-xs text-on-surface-variant">Non-cumulative entitlement</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm font-bold text-on-surface">8 / 12</span>
                </div>

                <div className="p-3 rounded-lg bg-surface-container-low flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-on-surface block">Medical / Sick Leave (SL)</span>
                    <span className="text-xs text-on-surface-variant">Supported by clinic prescription</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm font-bold text-on-surface">5 / 7</span>
                </div>

                <div className="p-3 rounded-lg bg-surface-container-low flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-on-surface block">Optional Festive Holiday</span>
                    <span className="text-xs text-on-surface-variant">Karnataka state list</span>
                  </div>
                  <span className="font-headline-sm text-headline-sm font-bold text-on-surface">2 / 2</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsLeaveModalOpen(true)}
              className="mt-4 w-full py-2.5 rounded-lg bg-primary text-on-primary hover:bg-slate-800 transition-colors font-label-lg text-label-lg font-bold flex items-center justify-center gap-1.5 shadow-sm"
              type="button"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              Apply for Leave
            </button>
          </div>
        </section>

        {/* Apply Leave Modal */}
        {isLeaveModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Apply for Paid Leave</h3>
                <button onClick={() => setIsLeaveModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleApplyLeave} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Leave Category</label>
                  <select
                    value={leaveType}
                    onChange={(e) => setLeaveType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  >
                    <option>Casual Leave (CL) - 8 Remaining</option>
                    <option>Earned Leave (EL) - 14 Remaining</option>
                    <option>Sick / Medical Leave (SL) - 5 Remaining</option>
                    <option>Optional Festive Holiday - 2 Remaining</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Reason for Absence</label>
                  <textarea
                    rows={3}
                    required
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder="Enter absence rationale for floor scheduling..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLeaveModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary text-on-primary hover:bg-slate-800 rounded-lg transition-colors font-bold shadow-sm"
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
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Punch Regularization Request</h3>
                <button onClick={() => setIsPunchModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleApplyPunch} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Corrected Punch Timestamp</label>
                  <input
                    type="text"
                    value={punchTime}
                    onChange={(e) => setPunchTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Reason for Discrepancy</label>
                  <textarea
                    rows={3}
                    required
                    value={punchReason}
                    onChange={(e) => setPunchReason(e.target.value)}
                    placeholder="e.g. VIP bridal customer handover extended past turnstile reader lockdown..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsPunchModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary text-on-primary hover:bg-slate-800 rounded-lg transition-colors font-bold shadow-sm"
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
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Allocated Floor Assets</h3>
                <button onClick={() => setIsAssetsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="space-y-3">
                <div className="p-3 bg-surface-container-low rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary">barcode_scanner</span>
                    <div>
                      <div className="font-bold text-sm">Zebra TC52 Touch Computer</div>
                      <div className="text-xs text-on-surface-variant">SN: #TC52-BEL-4029 • Active</div>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Custody</span>
                </div>
                <div className="p-3 bg-surface-container-low rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary">lock</span>
                    <div>
                      <div className="font-bold text-sm">Staff Locker Key #B-14</div>
                      <div className="text-xs text-on-surface-variant">Basement Locker Wing B</div>
                    </div>
                  </div>
                  <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded">Custody</span>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setIsAssetsModalOpen(false)}
                  className="px-4 py-2 text-sm bg-primary text-on-primary rounded-lg font-bold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ID & Dossier Modal */}
        {isDossierModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Statutory Identity &amp; Dossier</h3>
                <button onClick={() => setIsDossierModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between p-2.5 bg-surface-container-low rounded-lg">
                  <span className="text-on-surface-variant">Aadhaar (UIDAI):</span>
                  <span className="font-mono font-bold">•••• •••• 8821 (e-KYC Done)</span>
                </div>
                <div className="flex justify-between p-2.5 bg-surface-container-low rounded-lg">
                  <span className="text-on-surface-variant">PAN Number:</span>
                  <span className="font-mono font-bold">ABZPP4912K</span>
                </div>
                <div className="flex justify-between p-2.5 bg-surface-container-low rounded-lg">
                  <span className="text-on-surface-variant">Provident Fund (UAN):</span>
                  <span className="font-mono font-bold">101294821039</span>
                </div>
                <div className="flex justify-between p-2.5 bg-surface-container-low rounded-lg">
                  <span className="text-on-surface-variant">ESI Corporation ID:</span>
                  <span className="font-mono font-bold">3109284719</span>
                </div>
                <div className="flex justify-between p-2.5 bg-surface-container-low rounded-lg">
                  <span className="text-on-surface-variant">Salary Bank:</span>
                  <span className="font-medium">SBI Belagavi Camp (••••4912)</span>
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setIsDossierModalOpen(false)}
                  className="px-4 py-2 text-sm bg-primary text-on-primary rounded-lg font-bold"
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
