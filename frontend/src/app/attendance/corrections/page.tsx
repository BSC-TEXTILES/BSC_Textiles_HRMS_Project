'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

interface CorrectionRecord {
  id: string;
  empCode: string;
  name: string;
  role: string;
  hub: string;
  dept: string;
  avatar: string;
  shift: string;
  rawIn: string;
  rawOut: string;
  terminal: string;
  overrideOut: string;
  overrideIn?: string;
  totalHours: string;
  otHours: string;
  reason: string;
  evidence: string;
  invoiceOrDoc?: string;
  supervisor: string;
  pipelineStep: string;
  pipelineTotal: string;
  status: 'PENDING' | 'SUPERVISOR_OK' | 'APPROVED' | 'REJECTED';
  type: 'MISSED_OUT' | 'LATE_GRACE' | 'ON_DUTY' | 'SENSOR_GLITCH';
  notes: string;
}

const INITIAL_RECORDS: CorrectionRecord[] = [
  {
    id: 'CORR-4029',
    empCode: 'BSC-EMP-0042',
    name: 'Rajeshwari V. Patil',
    role: 'Senior Floor Specialist',
    hub: 'BEL-01 Flagship',
    dept: 'Bridal Silk & Atelier',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift A (09:30 – 18:30)',
    rawIn: '09:28 IN',
    rawOut: 'Missed OUT',
    terminal: 'BEL-IN-02',
    overrideOut: '19:15 OUT',
    totalHours: '9h 47m Total',
    otHours: '+1h 15m Overtime (1.25x)',
    reason: 'VIP Bridal Kanjeevaram Showcase extended handover for royal wedding party.',
    evidence: 'Bill #SLK-8819 (₹3.4L) & CCTV CAM-04 Bridal Vault confirmed presence.',
    invoiceOrDoc: 'Invoice #SLK-8819',
    supervisor: 'Anand Kulkarni (Store Lead)',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'PENDING',
    type: 'MISSED_OUT',
    notes: 'Rajeshwari was actively presenting heritage Kanjeevaram sarees to the royal wedding party until 19:10 IST. Card tap missed due to vault register lockdown protocol.',
  },
  {
    id: 'CORR-4030',
    empCode: 'BSC-EMP-0089',
    name: 'Amit Deshpande',
    role: 'Master Tailor',
    hub: 'SHI-03 Apex',
    dept: 'Tailoring & Alterations',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift B (11:30 – 20:30)',
    rawIn: '14:02 IN (Late 2h 32m)',
    rawOut: '20:38 OUT',
    terminal: 'SHI-GATE-01',
    overrideOut: '20:38 OUT',
    overrideIn: 'Half-Day Credit 6.5h',
    totalHours: '6.5h Credited',
    otHours: '0.5 Casual Leave applied',
    reason: 'KSRTC Shivamogga regional bus strike stranded inter-district transit.',
    evidence: 'Official KSRTC Transit Strike Press Release attached.',
    invoiceOrDoc: 'News Bulletin Ref #NB-442',
    supervisor: 'V. Hiremath (Floor Lead)',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'SUPERVISOR_OK',
    type: 'LATE_GRACE',
    notes: 'District bus depot strike confirmed by district magistrate notice. Staff communicated delay by telephone at 10:15 AM.',
  },
  {
    id: 'CORR-4031',
    empCode: 'BSC-MGR-0021',
    name: 'Veeranna Pattar',
    role: 'Jacquard Loom Master',
    hub: 'DAV-02 Hub',
    dept: 'Jacquard Loom Yard',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift C Night (20:30 – 05:30)',
    rawIn: 'Sensor Glitch IN',
    rawOut: '05:32 OUT',
    terminal: 'DAV-GATE-01',
    overrideOut: '05:32 OUT',
    overrideIn: '20:25 IN Logged',
    totalHours: '9h 07m Full Shift',
    otHours: '100% Shift Paid',
    reason: 'Terminal turnstile DAV-GATE-01 rebooted during shift transition due to power fluctuation.',
    evidence: 'Security Gate Physical Logbook Entry #318 signed by Sub-Inspector.',
    invoiceOrDoc: 'Gate Pass #GP-882',
    supervisor: 'Security Inspector Patil',
    pipelineStep: '3',
    pipelineTotal: '3',
    status: 'SUPERVISOR_OK',
    type: 'SENSOR_GLITCH',
    notes: 'Optical glass scanner cleaned & system re-initialized at 20:28. Security ledger verifies physical entry timestamp of 20:25 IST.',
  },
  {
    id: 'CORR-4032',
    empCode: 'BSC-EMP-0144',
    name: 'Kavita M.',
    role: 'Cashier & POS Lead',
    hub: 'BEL-01 Flagship',
    dept: 'Cashiering & POS',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift A (09:30 – 18:30)',
    rawIn: '09:34 IN',
    rawOut: '13:45 OUT (Premature Tag)',
    terminal: 'BEL-POS-01',
    overrideOut: '18:32 OUT',
    totalHours: '8h 58m Total Shift',
    otHours: 'Break swipe error corrected',
    reason: 'Accidentally scanned exit turnstile reader during lunch interval instead of cafeteria terminal.',
    evidence: 'Vault Cash Handover Register signed at 18:30 IST.',
    invoiceOrDoc: 'Vault Handover #V-102',
    supervisor: 'R. Deshmukh (Cash Head)',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'SUPERVISOR_OK',
    type: 'MISSED_OUT',
    notes: 'Cash counter register verifies cash drawer settlement completed at 18:25 PM with zero variance.',
  },
  {
    id: 'CORR-4033',
    empCode: 'BSC-EMP-0094',
    name: 'Rekha Naik',
    role: 'Saree Depot Associate',
    hub: 'BEL-01 Flagship',
    dept: 'Finished Goods Depot',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
    shift: 'General (09:00 – 18:00)',
    rawIn: '08:58 IN',
    rawOut: 'On-Duty Slip (15:00-19:30)',
    terminal: 'BEL-LOG-01',
    overrideOut: '19:35 OUT DAV',
    totalHours: '10h 37m Net Shift',
    otHours: 'OD Allowance + 1.5h OT',
    reason: 'Official inter-mill convoy dispatch escort to Davanagere processing hub.',
    evidence: 'Logistics Convoy Gate Pass #GP-882 signed by Logistics Manager.',
    invoiceOrDoc: 'Dispatch Manifest #DM-994',
    supervisor: 'Logistics Lead Sharma',
    pipelineStep: '2',
    pipelineTotal: '3',
    status: 'SUPERVISOR_OK',
    type: 'ON_DUTY',
    notes: 'Inter-district transit completed at Davanagere warehouse at 19:30 IST. Biometric checkout punched at DAV-GATE-02.',
  },
  {
    id: 'CORR-4034',
    empCode: 'BSC-EMP-0182',
    name: 'Darshan R.',
    role: 'Weaver Trainee',
    hub: 'DAV-02 Hub',
    dept: 'Jacquard Loom Yard',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    shift: 'Shift A (06:00 – 14:30)',
    rawIn: '06:48 IN (Late 48m)',
    rawOut: '14:35 OUT',
    terminal: 'DAV-TURN-02',
    overrideOut: '14:35 OUT',
    overrideIn: 'Late Grace Waiver',
    totalHours: '7h 47m Active',
    otHours: 'Pending Floor Endorsement',
    reason: 'Municipal water pipeline burst flooded feeder road halting shared employee auto-rickshaw.',
    evidence: 'Awaiting supporting letter from local transport union.',
    supervisor: 'Floor Supervisor Gowda',
    pipelineStep: '1',
    pipelineTotal: '3',
    status: 'PENDING',
    type: 'LATE_GRACE',
    notes: 'Trainee reported delay upon arrival. Pending supervisor signature on Form 12 late slip.',
  },
];

export default function PunchCorrectionsPage() {
  const [records, setRecords] = useState<CorrectionRecord[]>(INITIAL_RECORDS);
  const [selectedRecordId, setSelectedRecordId] = useState<string>(INITIAL_RECORDS[0].id);
  const [activeTab, setActiveTab] = useState<'ALL' | 'MISSED_OUT' | 'LATE_GRACE' | 'ON_DUTY' | 'SENSOR_GLITCH'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [hubFilter, setHubFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newRequest, setNewRequest] = useState({
    name: '',
    empCode: '',
    hub: 'BEL-01 Flagship',
    shift: 'Shift A (09:30 – 18:30)',
    overrideIn: '09:30 AM',
    overrideOut: '18:30 PM',
    reason: '',
  });

  const selectedRecord = records.find((r) => r.id === selectedRecordId) || records[0];

  const filteredRecords = records.filter((r) => {
    const matchesTab = activeTab === 'ALL' || r.type === activeTab;
    const matchesHub = hubFilter === 'ALL' || r.hub.toLowerCase().includes(hubFilter.toLowerCase());
    const matchesSearch =
      searchQuery === '' ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.empCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.dept.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesHub && matchesSearch;
  });

  const handleApprove = (id: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'APPROVED', pipelineStep: '3' } : r))
    );
    toast.success(`Punch correction #${id} approved & cryptographically committed to payroll!`);
  };

  const handleReject = (id: string) => {
    setRecords((prev) =>
      prev.map((r) => (r.id === id ? { ...r, status: 'REJECTED' } : r))
    );
    toast.error(`Punch correction #${id} rejected. LOP applied per policy.`);
  };

  const handleCreateRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequest.name || !newRequest.empCode || !newRequest.reason) {
      toast.error('Please fill in all mandatory fields');
      return;
    }
    const newRec: CorrectionRecord = {
      id: `CORR-${4035 + records.length}`,
      empCode: newRequest.empCode,
      name: newRequest.name,
      role: 'Floor Associate',
      hub: newRequest.hub,
      dept: 'Customer Retail',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      shift: newRequest.shift,
      rawIn: newRequest.overrideIn,
      rawOut: 'Manual Correction',
      terminal: 'MANUAL-OVERRIDE',
      overrideOut: newRequest.overrideOut,
      totalHours: '8h 00m Shift',
      otHours: 'Standard Rate',
      reason: newRequest.reason,
      evidence: 'Submitted via Web HRMS Console',
      supervisor: 'Current HR Admin',
      pipelineStep: '2',
      pipelineTotal: '3',
      status: 'PENDING',
      type: 'MISSED_OUT',
      notes: newRequest.reason,
    };
    setRecords([newRec, ...records]);
    setSelectedRecordId(newRec.id);
    setIsModalOpen(false);
    toast.success('Manual punch correction request logged!');
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full font-body-md text-on-surface">
        {/* Top Operational Breadcrumb & Context Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-space-lg mb-space-lg">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs font-label-sm text-label-sm text-on-surface-variant tracking-wider uppercase">
              <span>Time &amp; Attendance</span>
              <span className="material-symbols-outlined text-[12px] text-outline">chevron_right</span>
              <span className="text-secondary font-bold">Punch Corrections &amp; Regularization Ledger</span>
            </div>
            <div className="flex flex-wrap items-center gap-space-md mt-space-xs">
              <h1 className="font-headline-lg text-headline-lg text-on-surface font-bold tracking-tight">
                Punch Corrections &amp; Attendance Regularization
              </h1>
              <div className="inline-flex items-center gap-space-xs px-space-sm py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed-variant font-label-md text-label-md font-semibold">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary"></span>
                </span>
                Active Pay Cycle: 21 Oct – 27 Oct 2024
              </div>
              <div className="inline-flex items-center gap-1 text-on-surface-variant font-label-sm text-label-sm bg-surface-container-low px-space-xs py-0.5 rounded-lg">
                <span className="material-symbols-outlined text-[14px] text-secondary">verified_user</span>
                Karnataka Factories Act Form T
              </div>
            </div>
          </div>

          {/* Screen Action Suite */}
          <div className="flex items-center gap-space-sm mt-space-md md:mt-0 flex-wrap">
            <button
              onClick={() => toast.success('Muster roll audit exported (.xlsx)')}
              className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors rounded-lg font-label-lg text-label-lg shadow-sm border border-slate-200/60"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">file_download</span>
              Export Audit (XLSX)
            </button>
            <button
              onClick={() => {
                setRecords((prev) =>
                  prev.map((r) => (r.status === 'PENDING' ? { ...r, status: 'APPROVED' } : r))
                );
                toast.success('Batch approved all pending requests!');
              }}
              className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors rounded-lg font-label-lg text-label-lg shadow-sm border border-slate-200/60"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px] text-secondary">checklist_rtl</span>
              Batch Approve All Pending
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-primary text-on-primary hover:bg-primary-container transition-colors rounded-lg font-label-lg text-label-lg shadow-sm"
              type="button"
            >
              <span className="material-symbols-outlined text-[16px]">add_circle</span>
              Request Manual Correction
            </button>
          </div>
        </div>

        {/* Strategic KPI Metric Horizon (5 Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md mb-space-xl">
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">pending_actions</span>
              </div>
              <span className="px-space-xs py-0.5 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">Action Required</span>
            </div>
            <div>
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant block mb-1">Pending Regularizations</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-bold">
                  {records.filter((r) => r.status === 'PENDING').length}
                </span>
                <span className="font-label-lg text-label-lg text-on-surface-variant">Requests</span>
              </div>
            </div>
            <div className="mt-space-sm pt-space-xs font-body-sm text-body-sm text-on-surface-variant flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-secondary">subdirectory_arrow_right</span>
              4 Floor Approved • 2 with HR
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">warning</span>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant font-bold">Today</span>
            </div>
            <div>
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant block mb-1">Auto-Detected Anomalies</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-bold">24</span>
                <span className="font-label-lg text-label-lg text-on-surface-variant">Flagged</span>
              </div>
            </div>
            <div className="mt-space-sm pt-space-xs font-body-sm text-body-sm text-on-surface-variant truncate">
              14 Single Punches • 6 Grace Breaches
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">speed</span>
              </div>
              <span className="px-space-xs py-0.5 rounded bg-surface-container text-secondary font-label-sm text-label-sm font-bold">94.2% SLA</span>
            </div>
            <div>
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant block mb-1">Avg Resolution Time</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-bold">2.4</span>
                <span className="font-label-lg text-label-lg text-on-surface-variant">Hours</span>
              </div>
            </div>
            <div className="mt-space-sm pt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              Target &lt; 4.0 hrs before 20:00 lock
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">fingerprint</span>
              </div>
              <span className="text-secondary font-label-sm text-label-sm font-bold">-0.4% MoM</span>
            </div>
            <div>
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant block mb-1">Biometric Discrepancy</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-bold">1.8%</span>
                <span className="font-label-lg text-label-lg text-on-surface-variant">Error Rate</span>
              </div>
            </div>
            <div className="mt-space-sm pt-space-xs font-body-sm text-body-sm text-on-surface-variant truncate">
              Across 792 daily terminal punches
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
              </div>
              <span className="px-space-xs py-0.5 rounded bg-surface-container-highest text-secondary font-label-sm text-label-sm font-bold">Live Safeguard</span>
            </div>
            <div>
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant block mb-1">Payroll Impact Saved</span>
              <div className="flex items-baseline gap-space-xs">
                <span className="font-headline-lg text-headline-lg text-on-surface font-bold">₹18,420</span>
              </div>
            </div>
            <div className="mt-space-sm pt-space-xs font-body-sm text-body-sm text-on-surface-variant">
              Protected from wrongful LOP deductions
            </div>
          </div>
        </div>

        {/* Multi-Level Filter, Tab Strip & Query Tools */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 mb-space-lg flex flex-col gap-space-md">
          {/* Tab Strip */}
          <div className="flex items-center gap-space-xs overflow-x-auto pb-space-xs">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-label-lg text-label-lg whitespace-nowrap transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-surface-container text-secondary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
              type="button"
            >
              <span>All Requests</span>
              <span className="px-1.5 py-0.5 bg-secondary text-on-secondary rounded-full font-label-sm text-label-sm">{records.length}</span>
            </button>
            <button
              onClick={() => setActiveTab('MISSED_OUT')}
              className={`inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-label-lg text-label-lg whitespace-nowrap transition-colors ${
                activeTab === 'MISSED_OUT'
                  ? 'bg-surface-container text-secondary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
              type="button"
            >
              <span>Missed Out-Punches</span>
              <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded-full font-label-sm text-label-sm">
                {records.filter((r) => r.type === 'MISSED_OUT').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('LATE_GRACE')}
              className={`inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-label-lg text-label-lg whitespace-nowrap transition-colors ${
                activeTab === 'LATE_GRACE'
                  ? 'bg-surface-container text-secondary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
              type="button"
            >
              <span>Late In-Punch Grace Breach</span>
              <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded-full font-label-sm text-label-sm">
                {records.filter((r) => r.type === 'LATE_GRACE').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('ON_DUTY')}
              className={`inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-label-lg text-label-lg whitespace-nowrap transition-colors ${
                activeTab === 'ON_DUTY'
                  ? 'bg-surface-container text-secondary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
              type="button"
            >
              <span>On-Duty &amp; Mill Out-Slip</span>
              <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded-full font-label-sm text-label-sm">
                {records.filter((r) => r.type === 'ON_DUTY').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('SENSOR_GLITCH')}
              className={`inline-flex items-center gap-space-xs px-space-md py-space-xs rounded-lg font-label-lg text-label-lg whitespace-nowrap transition-colors ${
                activeTab === 'SENSOR_GLITCH'
                  ? 'bg-surface-container text-secondary font-bold'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
              type="button"
            >
              <span>Biometric Optical Failure</span>
              <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface-variant rounded-full font-label-sm text-label-sm">
                {records.filter((r) => r.type === 'SENSOR_GLITCH').length}
              </span>
            </button>
          </div>

          {/* Filter Fields Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-space-sm items-center">
            <div className="md:col-span-5 relative flex items-center bg-surface-container-low rounded-lg px-space-sm py-1.5">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-space-xs">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none"
                placeholder="Search by Employee, ID (e.g. BSC-EMP-0042), or Supervisor..."
                type="text"
              />
            </div>
            <div className="md:col-span-3 relative flex items-center bg-surface-container-low rounded-lg px-space-sm py-1.5">
              <span className="material-symbols-outlined text-[16px] text-secondary mr-space-xs">store</span>
              <select
                value={hubFilter}
                onChange={(e) => setHubFilter(e.target.value)}
                className="w-full bg-transparent font-label-sm text-label-sm text-on-surface focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Hubs (Karnataka)</option>
                <option value="BEL">BEL-01 Flagship Belagavi</option>
                <option value="DAV">DAV-02 Weaving Davanagere</option>
                <option value="SHI">SHI-03 Retail Apex Shivamogga</option>
              </select>
            </div>
            <div className="md:col-span-4 flex items-center gap-space-xs justify-end">
              <span className="text-xs text-on-surface-variant">Showing {filteredRecords.length} records</span>
              <button
                onClick={() => toast.success('Form T flags refreshed')}
                className="px-space-sm py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-sm text-label-sm flex items-center gap-1 transition-colors"
                type="button"
              >
                <span className="material-symbols-outlined text-[14px] text-secondary">tune</span>
                Form T Flags
              </button>
            </div>
          </div>
        </div>

        {/* Main Work Surface: 12-Column Ledger & Inspector Splitting */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
          {/* LEFT 65% (8 Cols): High-Density Tabular Corrections Ledger */}
          <div className="lg:col-span-8 flex flex-col gap-space-md">
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 overflow-hidden flex flex-col">
              {/* Table Control Top Banner */}
              <div className="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="font-label-lg text-label-lg text-on-surface font-bold">Discrepancy Investigation Matrix</span>
                  <span className="px-space-xs py-0.5 rounded bg-surface-container text-on-surface-variant font-label-sm text-label-sm font-semibold">
                    {records.filter((r) => r.status === 'PENDING').length} Pending Signoffs
                  </span>
                </div>
                <div className="flex items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-secondary"></span> Auto-Verified Punch Sync
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-error"></span> Missing Biometric Token
                  </span>
                </div>
              </div>

              {/* Tabular Ledger Content */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-sm text-body-sm">
                  <thead className="bg-surface-container-low/60 font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                    <tr>
                      <th className="py-space-sm px-space-md font-semibold">Staff &amp; Unit</th>
                      <th className="py-space-sm px-space-md font-semibold">Shift &amp; Raw Punches</th>
                      <th className="py-space-sm px-space-md font-semibold">Proposed Ledger</th>
                      <th className="py-space-sm px-space-md font-semibold">Attestation &amp; Evidence</th>
                      <th className="py-space-sm px-space-md font-semibold text-center">Pipeline</th>
                      <th className="py-space-sm px-space-md font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map((r) => {
                      const isSelected = r.id === selectedRecordId;
                      return (
                        <tr
                          key={r.id}
                          onClick={() => setSelectedRecordId(r.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? 'bg-surface-container-low/80 border-l-4 border-l-secondary' : 'hover:bg-surface-container-low/40'
                          }`}
                        >
                          <td className="py-space-sm px-space-md align-top">
                            <div className="flex items-start gap-space-sm">
                              <img
                                className="w-8 h-8 rounded-full object-cover shrink-0 shadow-sm"
                                src={r.avatar}
                                alt={r.name}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-label-lg text-label-lg text-on-surface font-bold truncate">
                                  {r.name}
                                </span>
                                <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                                  {r.empCode}
                                </span>
                                <span className="inline-flex mt-1 items-center gap-1 font-label-sm text-label-sm text-secondary bg-surface-container px-1.5 py-0.5 rounded w-max">
                                  {r.hub} • {r.dept}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md align-top">
                            <div className="flex flex-col">
                              <span className="font-label-sm text-label-sm font-semibold text-on-surface">
                                {r.shift}
                              </span>
                              <div className="flex items-center gap-1 text-on-surface-variant mt-0.5">
                                <span className="font-mono text-on-surface">{r.rawIn}</span>
                                <span>•</span>
                                <span className="px-1 py-0.5 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">
                                  {r.rawOut}
                                </span>
                              </div>
                              <span className="text-[11px] text-on-surface-variant mt-0.5">
                                Terminal: {r.terminal}
                              </span>
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md align-top">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1">
                                <span className="font-mono font-bold text-secondary">{r.overrideOut}</span>
                                <span className="text-[11px] text-on-surface-variant">(Override)</span>
                              </div>
                              <span className="font-label-sm text-label-sm font-semibold text-on-surface mt-0.5">
                                {r.totalHours}
                              </span>
                              <span className="text-[11px] text-on-tertiary-container font-semibold">
                                {r.otHours}
                              </span>
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md align-top max-w-[200px]">
                            <div className="flex flex-col">
                              <span className="font-body-sm text-body-sm text-on-surface font-medium truncate" title={r.reason}>
                                {r.reason}
                              </span>
                              <span className="font-label-sm text-label-sm text-on-surface-variant mt-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px] text-secondary">verified</span>
                                Sup: {r.supervisor}
                              </span>
                              {r.invoiceOrDoc && (
                                <span className="font-label-sm text-label-sm text-secondary underline cursor-pointer mt-0.5">
                                  {r.invoiceOrDoc} attached
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md align-top text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`px-space-xs py-0.5 rounded font-label-sm text-label-sm font-bold ${
                                  r.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : r.status === 'REJECTED'
                                    ? 'bg-rose-100 text-rose-800'
                                    : 'bg-surface-container-highest text-secondary'
                                }`}
                              >
                                {r.status}
                              </span>
                              <span className="text-[10px] text-on-surface-variant mt-0.5">
                                Step {r.pipelineStep} of {r.pipelineTotal}
                              </span>
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md align-top text-right">
                            <div className="flex items-center justify-end gap-1">
                              {r.status === 'PENDING' ? (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleApprove(r.id);
                                    }}
                                    className="p-1 rounded bg-primary text-on-primary hover:bg-primary-container transition-colors shadow-sm"
                                    title="Quick Approve"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">check</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReject(r.id);
                                    }}
                                    className="p-1 rounded bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
                                    title="Reject or Flag"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-xs text-on-surface-variant">Archived</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecordId(r.id);
                                }}
                                className="p-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant hover:bg-secondary-fixed-dim transition-colors"
                                title="Inspect Record"
                                type="button"
                              >
                                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table Footer Pagination & Ledger Health */}
              <div className="p-space-md bg-surface-container-low/50 flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm font-body-sm text-body-sm text-on-surface-variant border-t border-slate-100">
                <div className="flex items-center gap-space-md">
                  <span>
                    Showing <strong>{filteredRecords.length}</strong> of <strong>{records.length}</strong> regularization requests
                  </span>
                  <span className="hidden sm:inline">•</span>
                  <span className="hidden sm:inline">428 Active Floor Staff Registered</span>
                </div>
                <div className="flex items-center gap-space-xs">
                  <span className="px-2 py-1 rounded bg-secondary text-on-secondary font-label-sm text-label-sm font-bold">1</span>
                </div>
              </div>
            </div>

            {/* Real-Time Optical Sensor Diagnostics */}
            <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col gap-space-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary text-[20px]">find_replace</span>
                  <span className="font-label-lg text-label-lg text-on-surface font-bold">
                    Live Biometric Ingestion &amp; Optical Sensor Diagnostics
                  </span>
                </div>
                <span className="font-mono text-label-sm text-label-sm text-on-surface-variant">SHA-256 HASH VERIFIED</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-space-sm font-body-sm text-body-sm">
                <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                  <div className="flex items-center justify-between text-label-sm font-bold mb-1">
                    <span className="text-on-surface">Terminal BEL-GATE-04</span>
                    <span className="text-secondary font-bold">OK 99.8%</span>
                  </div>
                  <span className="text-on-surface-variant font-mono text-[11px]">Synced: 14:22:01 IST</span>
                  <span className="text-on-surface-variant text-[11px] mt-1">Optical scan match: 0.18s latency</span>
                </div>
                <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                  <div className="flex items-center justify-between text-label-sm font-bold mb-1">
                    <span className="text-on-surface">Terminal DAV-GATE-01</span>
                    <span className="text-rose-600 font-bold">SENSOR RECALIBRATED</span>
                  </div>
                  <span className="text-on-surface-variant font-mono text-[11px]">Last event: 20:28:11 IST</span>
                  <span className="text-on-surface-variant text-[11px] mt-1">Optical glass cleaned &amp; rebooted</span>
                </div>
                <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col">
                  <div className="flex items-center justify-between text-label-sm font-bold mb-1">
                    <span className="text-on-surface">Terminal SHI-RETAIL-01</span>
                    <span className="text-secondary font-bold">OK 100%</span>
                  </div>
                  <span className="text-on-surface-variant font-mono text-[11px]">Synced: 14:21:49 IST</span>
                  <span className="text-on-surface-variant text-[11px] mt-1">Direct LAN sync to HQ Master Cloud</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT 35% (4 Cols): High-Fidelity Inspection & Approval Drawer Panel */}
          <div className="lg:col-span-4 flex flex-col gap-space-md">
            {/* Detailed Inspection Card (Pinned for Selected Record) */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-md flex flex-col gap-space-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-space-sm">
                  <div className="relative">
                    <img
                      className="w-12 h-12 rounded-full object-cover shadow-sm"
                      src={selectedRecord.avatar}
                      alt={selectedRecord.name}
                    />
                    <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-secondary border-2 border-surface-container-lowest"></span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                        {selectedRecord.name}
                      </span>
                      <span className="material-symbols-outlined text-secondary text-[16px]">verified</span>
                    </div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                      {selectedRecord.empCode} • {selectedRecord.role}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                      {selectedRecord.hub} • {selectedRecord.dept}
                    </span>
                  </div>
                </div>
                <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-secondary font-label-sm text-label-sm font-bold">
                  {selectedRecord.id}
                </span>
              </div>

              {/* Punch Visual Comparison Box */}
              <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-sm">
                <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">
                  Punch Override Comparison
                </span>
                <div className="p-space-xs rounded-lg bg-surface-container-lowest flex items-center justify-between border border-slate-200/40">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">Raw Ingestion</span>
                    <span className="font-mono text-label-lg text-label-lg text-on-surface font-bold">
                      {selectedRecord.rawIn} → <span className="text-rose-600 font-bold">{selectedRecord.rawOut}</span>
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">
                    Anomaly
                  </span>
                </div>

                <div className="p-space-xs rounded-lg bg-surface-container-highest flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="font-label-sm text-label-sm text-secondary uppercase font-bold">Proposed Approved Ledger</span>
                    <span className="font-mono text-label-lg text-label-lg text-on-surface font-bold">
                      {selectedRecord.rawIn} → <span className="text-secondary font-bold">{selectedRecord.overrideOut}</span>
                    </span>
                  </div>
                  <span className="px-1.5 py-0.5 rounded bg-secondary text-on-secondary font-label-sm text-label-sm font-bold">
                    Verified
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-space-xs pt-space-xs text-body-sm">
                  <div className="flex flex-col p-space-xs bg-surface-container-lowest rounded-lg border border-slate-200/40">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Payable Net Hours</span>
                    <span className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      {selectedRecord.totalHours}
                    </span>
                  </div>
                  <div className="flex flex-col p-space-xs bg-surface-container-lowest rounded-lg border border-slate-200/40">
                    <span className="font-label-sm text-label-sm text-on-surface-variant">Overtime / Grace</span>
                    <span className="font-headline-sm text-headline-sm text-secondary font-bold">
                      {selectedRecord.otHours}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supervisor Attestation Evidence */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">
                  Supervisor Endorsement &amp; Evidence
                </span>
                <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1">
                  <p className="font-body-sm text-body-sm text-on-surface italic">
                    “{selectedRecord.notes}”
                  </p>
                  <div className="flex items-center justify-between pt-space-xs text-on-surface-variant font-label-sm text-label-sm">
                    <span className="font-bold text-on-surface">— {selectedRecord.supervisor}</span>
                    <span>24 Oct 19:40 IST</span>
                  </div>
                </div>
                {selectedRecord.invoiceOrDoc && (
                  <div className="flex items-center gap-space-xs mt-1">
                    <div className="flex-1 p-space-xs rounded-lg bg-surface-container flex items-center justify-center gap-1 font-label-sm text-label-sm text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-secondary">receipt_long</span>
                      {selectedRecord.invoiceOrDoc}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Execution Strip */}
              {selectedRecord.status === 'PENDING' ? (
                <div className="flex flex-col gap-space-xs pt-space-xs">
                  <button
                    onClick={() => handleApprove(selectedRecord.id)}
                    className="w-full py-space-sm px-space-md rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-colors font-label-lg text-label-lg font-bold flex items-center justify-center gap-space-xs shadow-sm"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    Approve &amp; Commit to Payroll Ledger
                  </button>
                  <div className="grid grid-cols-2 gap-space-xs">
                    <button
                      onClick={() => toast.success(`Clarification ping sent to ${selectedRecord.supervisor}`)}
                      className="py-space-xs px-space-sm rounded-lg bg-surface-container-lowest text-on-surface hover:bg-surface-container-low transition-colors font-label-sm text-label-sm font-semibold flex items-center justify-center gap-1 shadow-sm border border-slate-200/60"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">contact_support</span>
                      Request Info
                    </button>
                    <button
                      onClick={() => handleReject(selectedRecord.id)}
                      className="py-space-xs px-space-sm rounded-lg bg-error-container text-on-error-container hover:bg-rose-600 hover:text-white transition-colors font-label-sm text-label-sm font-semibold flex items-center justify-center gap-1"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                      Reject &amp; LOP
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  Resolution Audited &amp; Synchronized with Karnataka Factories Act Form T
                </div>
              )}
            </div>

            {/* Karnataka Statutory Compliance Box */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-md flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-xs">
                <div className="w-7 h-7 rounded bg-surface-container flex items-center justify-center text-secondary">
                  <span className="material-symbols-outlined text-[18px]">gavel</span>
                </div>
                <span className="font-label-lg text-label-lg text-on-surface font-bold">Karnataka Statutory Compliance</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                <strong className="text-on-surface">Section 62 - Register of Adult Workers:</strong> Every manual attendance adjustment requires dual attestation (Floor Manager + HR Director) before monthly muster roll seal.
              </p>
              <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1">
                <div className="flex items-center justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface font-bold">Muster Roll Lockdown</span>
                  <span className="text-secondary font-bold font-mono">422 / 428 Staff (98.6%)</span>
                </div>
                <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                  <div className="bg-secondary h-full rounded-full" style={{ width: '98.6%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Executive Audit Trail Cryptographic Seal */}
        <div className="mt-space-xl p-space-md bg-surface-container-low rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm text-on-surface-variant font-label-sm text-label-sm border border-slate-200/50">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-secondary text-[20px]">encrypted</span>
            <span>
              All punch overrides are cryptographically committed to the BSC Immutable HRMS AuditLog with dual supervisor keys &amp; SHA-256 fingerprint.
            </span>
          </div>
          <div className="flex items-center gap-space-md">
            <span>Terminal Server: <strong>Synced 14:22:08 IST</strong></span>
            <span>Ledger Version: <strong>4.8.2-PROD</strong></span>
          </div>
        </div>

        {/* Manual Correction Request Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">add_circle</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Request Manual Correction</h3>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleCreateRequest} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Employee Full Name</label>
                  <input
                    type="text"
                    required
                    value={newRequest.name}
                    onChange={(e) => setNewRequest({ ...newRequest, name: e.target.value })}
                    placeholder="e.g. Anand R. Kulkarni"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Employee ID</label>
                    <input
                      type="text"
                      required
                      value={newRequest.empCode}
                      onChange={(e) => setNewRequest({ ...newRequest, empCode: e.target.value })}
                      placeholder="e.g. BSC-EMP-0055"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Store Hub</label>
                    <select
                      value={newRequest.hub}
                      onChange={(e) => setNewRequest({ ...newRequest, hub: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    >
                      <option value="BEL-01 Flagship">BEL-01 Flagship Belagavi</option>
                      <option value="DAV-02 Hub">DAV-02 Weaving Davanagere</option>
                      <option value="SHI-03 Apex">SHI-03 Retail Apex Shivamogga</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Requested IN Punch</label>
                    <input
                      type="text"
                      value={newRequest.overrideIn}
                      onChange={(e) => setNewRequest({ ...newRequest, overrideIn: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Requested OUT Punch</label>
                    <input
                      type="text"
                      value={newRequest.overrideOut}
                      onChange={(e) => setNewRequest({ ...newRequest, overrideOut: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Operational Justification / Reason</label>
                  <textarea
                    rows={3}
                    required
                    value={newRequest.reason}
                    onChange={(e) => setNewRequest({ ...newRequest, reason: e.target.value })}
                    placeholder="Provide specific floor justification (e.g. VIP client presentation, power failure, logistics dispatch)..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary text-on-primary hover:bg-primary-container rounded-lg transition-colors font-bold shadow-sm"
                  >
                    Submit for Dual Attestation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
