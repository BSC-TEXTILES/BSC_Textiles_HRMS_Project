'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

interface LeaveRequest {
  id: string;
  name: string;
  empCode: string;
  role: string;
  hub: string;
  hubCode: 'bel-01' | 'dav-02' | 'shi-03';
  dept: string;
  avatar: string;
  type: 'CL' | 'EL' | 'SL' | 'CO';
  typeName: string;
  days: number;
  dates: string;
  reason: string;
  hasDoc: boolean;
  docName?: string;
  floorImpact: 'CRITICAL' | 'COVERED' | 'OFF_PEAK';
  coverageBy: string;
  clRemaining: number;
  elRemaining: number;
  slRemaining: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  supervisorNotes: string;
}

const INITIAL_LEAVES: LeaveRequest[] = [
  {
    id: 'LV-9921',
    name: 'Sneha Kulkarni',
    empCode: 'BSC-EMP-0118',
    role: 'Bridal Silk Consultant',
    hub: 'Belagavi Flagship',
    hubCode: 'bel-01',
    dept: 'Bridal & Atelier',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
    type: 'CL',
    typeName: 'Casual Leave',
    days: 1.0,
    dates: '26 Oct 2024 (Full Day)',
    reason: 'Family ceremony in Tilakwadi; wedding preparation for immediate sibling.',
    hasDoc: true,
    docName: 'Wedding Invitation Card.pdf',
    floorImpact: 'COVERED',
    coverageBy: 'Radha Shinde (Floor Specialist)',
    clRemaining: 4,
    elRemaining: 12,
    slRemaining: 6,
    status: 'PENDING',
    supervisorNotes: 'Radha Shinde has formally agreed to cover Counter 03 bridal presentations for the afternoon shift.',
  },
  {
    id: 'LV-9922',
    name: 'Manjunath Hegde',
    empCode: 'BSC-EMP-0076',
    role: 'Senior Jacquard Technician',
    hub: 'Davanagere Mill',
    hubCode: 'dav-02',
    dept: 'Jacquard Loom Yard',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
    type: 'EL',
    typeName: 'Earned Leave',
    days: 4.0,
    dates: '28 Oct – 31 Oct 2024',
    reason: 'Annual ancestral village festival harvest in Sirsi district.',
    hasDoc: false,
    floorImpact: 'CRITICAL',
    coverageBy: 'Loom Operator Trainee',
    clRemaining: 2,
    elRemaining: 8,
    slRemaining: 5,
    status: 'PENDING',
    supervisorNotes: 'High festive loom quota scheduled for festive season. Minimum coverage requires shift lead signoff.',
  },
  {
    id: 'LV-9923',
    name: 'Priyanka Nayak',
    empCode: 'BSC-EMP-0155',
    role: 'Billing & POS Cashier',
    hub: 'Shivamogga Apex',
    hubCode: 'shi-03',
    dept: 'Cashiering & POS',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
    type: 'SL',
    typeName: 'Medical / Sick Leave',
    days: 2.0,
    dates: '25 Oct – 26 Oct 2024',
    reason: 'Acute seasonal viral fever & medical consultation advised bed rest.',
    hasDoc: true,
    docName: 'Dr. Rao Clinic Prescription.pdf',
    floorImpact: 'COVERED',
    coverageBy: 'Kavita M. (Dual Cashier)',
    clRemaining: 5,
    elRemaining: 14,
    slRemaining: 4,
    status: 'PENDING',
    supervisorNotes: 'Medical certificate uploaded with doctor clinic registration ID. ESI intimation dispatched.',
  },
  {
    id: 'LV-9924',
    name: 'Basavaraj Patil',
    empCode: 'BSC-EMP-0034',
    role: 'Store Logistics Incharge',
    hub: 'Belagavi Flagship',
    hubCode: 'bel-01',
    dept: 'Warehouse & Depot',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
    type: 'CO',
    typeName: 'Compensatory Off',
    days: 1.0,
    dates: '27 Oct 2024 (Sunday)',
    reason: 'Worked on state holiday (Gandhi Jayanti) during emergency silk yarn shipment dispatch.',
    hasDoc: true,
    docName: 'Overtime Dispatch Sheet #OD-104',
    floorImpact: 'OFF_PEAK',
    coverageBy: 'Assistant Dispatcher Rao',
    clRemaining: 6,
    elRemaining: 11,
    slRemaining: 7,
    status: 'PENDING',
    supervisorNotes: 'Verified against Biometric server logs for 02 Oct. 9 hours on-site documented.',
  },
  {
    id: 'LV-9925',
    name: 'Ananya Deshmukh',
    empCode: 'BSC-EMP-0201',
    role: 'Visual Merchandiser',
    hub: 'Belagavi Flagship',
    hubCode: 'bel-01',
    dept: 'Showroom Displays',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
    type: 'CL',
    typeName: 'Casual Leave',
    days: 1.0,
    dates: '29 Oct 2024',
    reason: 'University examinations (Distance Education MBA Semester exam).',
    hasDoc: true,
    docName: 'VTU Exam Hall Ticket.pdf',
    floorImpact: 'COVERED',
    coverageBy: 'Senior Lead Angadi',
    clRemaining: 3,
    elRemaining: 9,
    slRemaining: 5,
    status: 'APPROVED',
    supervisorNotes: 'Hall ticket verified. Approved under BSC Employee Career Development Assistance scheme.',
  },
];

export default function LeavesManagementPage() {
  const [leaves, setLeaves] = useState<LeaveRequest[]>(INITIAL_LEAVES);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string>(INITIAL_LEAVES[0].id);
  const [hubFilter, setHubFilter] = useState<'all' | 'bel-01' | 'dav-02' | 'shi-03'>('all');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'EL' | 'CL' | 'SL' | 'CO'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({
    name: '',
    empCode: '',
    type: 'CL',
    dates: '',
    days: '1.0',
    reason: '',
    hubCode: 'bel-01' as const,
  });

  const selectedLeave = leaves.find((l) => l.id === selectedLeaveId) || leaves[0];

  const filteredLeaves = leaves.filter((l) => {
    const matchesHub = hubFilter === 'all' || l.hubCode === hubFilter;
    const matchesType = typeFilter === 'ALL' || l.type === typeFilter;
    const matchesSearch =
      searchQuery === '' ||
      l.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.empCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.dept.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesHub && matchesType && matchesSearch;
  });

  const handleApprove = (id: string) => {
    setLeaves((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: 'APPROVED' } : l))
    );
    toast.success(`Leave request #${id} approved under Karnataka Form F!`);
  };

  const handleReject = (id: string) => {
    setLeaves((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: 'REJECTED' } : l))
    );
    toast.error(`Leave request #${id} rejected. Employee notified.`);
  };

  const handleBulkApprove = () => {
    setLeaves((prev) =>
      prev.map((l) => (l.status === 'PENDING' ? { ...l, status: 'APPROVED' } : l))
    );
    toast.success('Bulk approved all eligible leave requests!');
  };

  const handleApplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!applyForm.name || !applyForm.empCode || !applyForm.reason) {
      toast.error('Please enter all required fields');
      return;
    }
    const newReq: LeaveRequest = {
      id: `LV-${9926 + leaves.length}`,
      name: applyForm.name,
      empCode: applyForm.empCode,
      role: 'Staff Associate',
      hub: applyForm.hubCode === 'bel-01' ? 'Belagavi Flagship' : applyForm.hubCode === 'dav-02' ? 'Davanagere Mill' : 'Shivamogga Apex',
      hubCode: applyForm.hubCode,
      dept: 'Customer Operations',
      avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
      type: applyForm.type as any,
      typeName: applyForm.type === 'CL' ? 'Casual Leave' : applyForm.type === 'EL' ? 'Earned Leave' : applyForm.type === 'SL' ? 'Medical Leave' : 'Comp-Off',
      days: parseFloat(applyForm.days) || 1,
      dates: applyForm.dates || 'Upcoming Week',
      reason: applyForm.reason,
      hasDoc: false,
      floorImpact: 'COVERED',
      coverageBy: 'Peer Associate',
      clRemaining: 5,
      elRemaining: 10,
      slRemaining: 6,
      status: 'PENDING',
      supervisorNotes: 'Applied on behalf via Web HRMS Console.',
    };
    setLeaves([newReq, ...leaves]);
    setSelectedLeaveId(newReq.id);
    setIsApplyModalOpen(false);
    toast.success('Leave applied on behalf of associate!');
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full font-body-md text-on-surface">
        {/* Top Institutional Header & Operations Meta */}
        <div className="flex flex-col gap-space-sm mb-space-lg">
          <div className="flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                <span>Time &amp; Attendance</span>
                <span className="material-symbols-outlined text-[13px]">chevron_right</span>
                <span>Leave &amp; Payroll</span>
                <span className="material-symbols-outlined text-[13px]">chevron_right</span>
                <span className="font-bold text-secondary">Leave Approvals &amp; Statutory Quota</span>
              </div>
              <div className="flex flex-wrap items-center gap-space-md">
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface tracking-tight">
                  Leave Approvals &amp; Absence Governance
                </h1>
                <div className="flex items-center gap-space-xs px-space-sm py-0.5 rounded-full bg-surface-container-high text-on-surface">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse"></span>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider font-bold">Deepavali Q3 Peak Cycle</span>
                  <span className="text-outline-variant">•</span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">Karnataka Factories Act Form F</span>
                </div>
              </div>
            </div>

            {/* Action Cluster */}
            <div className="flex items-center gap-space-sm flex-wrap">
              <button
                onClick={() => toast.success('Form F Leave Ledger exported (.xlsx)')}
                className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-lowest text-on-surface shadow-sm hover:bg-surface-container-low transition-colors border border-slate-200/60"
              >
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">download</span>
                <span className="font-label-lg text-label-lg font-semibold">Export Ledger (.xlsx)</span>
              </button>
              <button
                onClick={handleBulkApprove}
                className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-surface-container-low text-secondary hover:bg-surface-container-high transition-colors font-semibold"
              >
                <span className="material-symbols-outlined text-[16px]">done_all</span>
                <span className="font-label-lg text-label-lg">Bulk Approve Pending</span>
              </button>
              <button
                onClick={() => setIsApplyModalOpen(true)}
                className="flex items-center gap-space-xs px-space-md py-space-sm rounded-lg bg-primary text-on-primary shadow-sm hover:bg-primary-container transition-colors font-semibold"
              >
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                <span className="font-label-lg text-label-lg text-on-primary">Apply Leave on Behalf</span>
              </button>
            </div>
          </div>
        </div>

        {/* Executive Telemetry Row (5 KPI Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-space-md mb-space-lg">
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Pending Approvals</span>
              <div className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">pending_actions</span>
              </div>
            </div>
            <div className="my-space-xs flex items-baseline gap-space-sm">
              <span className="font-display-lg text-display-lg font-bold text-on-surface tracking-tight">
                {leaves.filter((l) => l.status === 'PENDING').length}
              </span>
              <span className="px-1.5 py-0.5 rounded-DEFAULT bg-surface-container-high text-secondary font-label-sm text-label-sm font-bold">1 Urgent</span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
              <span>3 Floor Cleared</span>
              <span className="font-semibold text-on-surface">1 Escalated</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">On Leave Today</span>
              <div className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">person_off</span>
              </div>
            </div>
            <div className="my-space-xs flex items-baseline gap-space-sm">
              <span className="font-display-lg text-display-lg font-bold text-on-surface tracking-tight">18</span>
              <span className="font-body-md text-body-md text-on-surface-variant">/ 428 Staff</span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                <span>4.2% Rate</span>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant">&lt; 7.0% Ceiling</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Festive Leave Cap</span>
              <div className="w-7 h-7 rounded-lg bg-surface-container-high flex items-center justify-center text-on-surface">
                <span className="material-symbols-outlined text-[18px]">crisis_alert</span>
              </div>
            </div>
            <div className="my-space-xs flex items-baseline gap-space-sm">
              <span className="font-display-lg text-display-lg font-bold text-on-surface tracking-tight">88.4%</span>
              <span className="px-1.5 py-0.5 rounded-DEFAULT bg-surface-container text-on-surface font-label-sm text-label-sm font-bold">Diwali Peak</span>
            </div>
            <div className="w-full bg-surface-container-low h-1.5 rounded-full overflow-hidden">
              <div className="bg-secondary h-full rounded-full" style={{ width: '88.4%' }}></div>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Avg Decision SLA</span>
              <div className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">timer</span>
              </div>
            </div>
            <div className="my-space-xs flex items-baseline gap-space-sm">
              <span className="font-display-lg text-display-lg font-bold text-on-surface tracking-tight">3.2</span>
              <span className="font-body-md text-body-md text-on-surface-variant">Hours</span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
              <span>Target: &lt; 24h</span>
              <span className="font-semibold text-secondary">96.8% In-Spec</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">Form F Statutory</span>
              <div className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="my-space-xs flex items-baseline gap-space-sm">
              <span className="font-display-lg text-display-lg font-bold text-on-surface tracking-tight">100%</span>
              <span className="px-1.5 py-0.5 rounded-DEFAULT bg-surface-container-high text-on-surface font-label-sm text-label-sm font-bold">Audited</span>
            </div>
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-body-sm">
              <span>ESI &amp; Shops Act</span>
              <span className="font-semibold text-on-surface">Zero Leakage</span>
            </div>
          </div>
        </div>

        {/* Operational Filter & Hub Selector Bar */}
        <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 mb-space-lg flex flex-col gap-space-md">
          {/* Upper Filter Level: Hub Tabs & Search */}
          <div className="flex flex-wrap items-center justify-between gap-space-md">
            <div className="flex items-center gap-space-xs bg-surface-container-low p-1 rounded-lg">
              <button
                onClick={() => setHubFilter('all')}
                className={`px-space-md py-1 rounded-lg font-label-lg text-label-lg transition-colors ${
                  hubFilter === 'all'
                    ? 'bg-surface-container-lowest shadow-sm text-on-surface font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                All Hubs <span className="ml-1 text-on-surface-variant font-normal">{leaves.length}</span>
              </button>
              <button
                onClick={() => setHubFilter('bel-01')}
                className={`px-space-md py-1 rounded-lg font-label-lg text-label-lg transition-colors ${
                  hubFilter === 'bel-01'
                    ? 'bg-surface-container-lowest shadow-sm text-on-surface font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Belagavi Flagship BEL-01 <span className="ml-1 opacity-70">
                  {leaves.filter((l) => l.hubCode === 'bel-01').length}
                </span>
              </button>
              <button
                onClick={() => setHubFilter('dav-02')}
                className={`px-space-md py-1 rounded-lg font-label-lg text-label-lg transition-colors ${
                  hubFilter === 'dav-02'
                    ? 'bg-surface-container-lowest shadow-sm text-on-surface font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Davanagere Mill DAV-02 <span className="ml-1 opacity-70">
                  {leaves.filter((l) => l.hubCode === 'dav-02').length}
                </span>
              </button>
              <button
                onClick={() => setHubFilter('shi-03')}
                className={`px-space-md py-1 rounded-lg font-label-lg text-label-lg transition-colors ${
                  hubFilter === 'shi-03'
                    ? 'bg-surface-container-lowest shadow-sm text-on-surface font-bold'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Shivamogga Apex SHI-03 <span className="ml-1 opacity-70">
                  {leaves.filter((l) => l.hubCode === 'shi-03').length}
                </span>
              </button>
            </div>

            <div className="flex items-center gap-space-sm">
              <div className="relative flex items-center bg-surface-container-low rounded-lg px-space-sm py-1.5 w-72">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant mr-space-xs">search</span>
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-transparent w-full font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
                  placeholder="Search BSC-ID, employee, department..."
                  type="text"
                />
              </div>
            </div>
          </div>

          {/* Lower Filter Segment: Leave Types & Severity Flags */}
          <div className="flex flex-wrap items-center justify-between gap-space-sm pt-space-xs">
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant mr-1 font-bold">
                Leave Class:
              </span>
              <button
                onClick={() => setTypeFilter('ALL')}
                className={`px-space-sm py-1 rounded-full font-label-sm text-label-sm font-semibold transition-colors ${
                  typeFilter === 'ALL'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                All ({leaves.length})
              </button>
              <button
                onClick={() => setTypeFilter('EL')}
                className={`px-space-sm py-1 rounded-full font-label-sm text-label-sm font-semibold transition-colors ${
                  typeFilter === 'EL'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                Earned Leave (EL - {leaves.filter((l) => l.type === 'EL').length})
              </button>
              <button
                onClick={() => setTypeFilter('CL')}
                className={`px-space-sm py-1 rounded-full font-label-sm text-label-sm font-semibold transition-colors ${
                  typeFilter === 'CL'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                Casual Leave (CL - {leaves.filter((l) => l.type === 'CL').length})
              </button>
              <button
                onClick={() => setTypeFilter('SL')}
                className={`px-space-sm py-1 rounded-full font-label-sm text-label-sm font-semibold transition-colors ${
                  typeFilter === 'SL'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                Sick / Medical (SL - {leaves.filter((l) => l.type === 'SL').length})
              </button>
              <button
                onClick={() => setTypeFilter('CO')}
                className={`px-space-sm py-1 rounded-full font-label-sm text-label-sm font-semibold transition-colors ${
                  typeFilter === 'CO'
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                Comp-Off (CO - {leaves.filter((l) => l.type === 'CO').length})
              </button>
            </div>

            <div className="flex items-center gap-space-md text-on-surface-variant font-label-sm text-label-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                <span>Critical Floor Impact (1)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-secondary"></span>
                <span>Coverage Arranged (3)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Master-Detail 2-Column Working Canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-start">
          {/* LEFT 65% (Cols 1-8): High-Density Leave Requests Stream */}
          <div className="lg:col-span-8 flex flex-col gap-space-md">
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
              <div className="p-space-md bg-surface-container-low flex items-center justify-between">
                <div className="flex items-center gap-space-sm">
                  <span className="font-label-lg text-label-lg font-bold text-on-surface">Queue Ledger</span>
                  <span className="px-2 py-0.5 rounded-full bg-surface-container-highest text-secondary font-label-sm text-label-sm font-bold">
                    {filteredLeaves.length} Records
                  </span>
                </div>
                <div className="flex items-center gap-space-sm text-on-surface-variant font-body-sm text-body-sm">
                  <span>Karnataka Statutory Form F Active</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse font-body-sm text-body-sm">
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant font-label-sm text-label-sm uppercase tracking-wider">
                      <th className="py-space-sm px-space-md">Associate &amp; Unit</th>
                      <th className="py-space-sm px-space-md">Type &amp; Period</th>
                      <th className="py-space-sm px-space-md">Reason &amp; Documentation</th>
                      <th className="py-space-sm px-space-md">Floor Impact</th>
                      <th className="py-space-sm px-space-md text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredLeaves.map((l) => {
                      const isSelected = l.id === selectedLeaveId;
                      return (
                        <tr
                          key={l.id}
                          onClick={() => setSelectedLeaveId(l.id)}
                          className={`cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-surface-container-high/40 border-l-4 border-l-secondary'
                              : 'hover:bg-surface-container-low/50'
                          }`}
                        >
                          <td className="py-space-sm px-space-md">
                            <div className="flex items-center gap-space-sm">
                              <img
                                className="w-9 h-9 rounded-full object-cover shrink-0 shadow-sm"
                                src={l.avatar}
                                alt={l.name}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-label-lg text-label-lg font-bold text-on-surface truncate">
                                  {l.name}
                                </span>
                                <span className="font-label-sm text-label-sm text-on-surface-variant">
                                  {l.empCode} • {l.hub}
                                </span>
                                <span className="font-label-sm text-label-sm text-secondary font-semibold">
                                  {l.role}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-surface-container-highest text-on-surface font-label-sm text-label-sm font-bold">
                                  {l.type}
                                </span>
                                <span className="font-label-lg text-label-lg font-bold text-on-surface">
                                  {l.days} Day{l.days > 1 ? 's' : ''}
                                </span>
                              </div>
                              <span className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">
                                {l.dates}
                              </span>
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md max-w-[200px]">
                            <div className="flex flex-col">
                              <span className="font-body-sm text-body-sm text-on-surface truncate" title={l.reason}>
                                {l.reason}
                              </span>
                              {l.hasDoc && l.docName && (
                                <span className="font-label-sm text-label-sm text-secondary underline cursor-pointer mt-0.5 flex items-center gap-1">
                                  <span className="material-symbols-outlined text-[13px]">attachment</span>
                                  {l.docName}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md">
                            <span
                              className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-bold ${
                                l.floorImpact === 'CRITICAL'
                                  ? 'bg-rose-100 text-rose-800'
                                  : l.floorImpact === 'COVERED'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {l.floorImpact === 'CRITICAL' ? 'Critical' : l.floorImpact === 'COVERED' ? 'Covered' : 'Off-Peak'}
                            </span>
                            <div className="text-[11px] text-on-surface-variant mt-0.5 truncate">
                              Peer: {l.coverageBy}
                            </div>
                          </td>
                          <td className="py-space-sm px-space-md text-right">
                            <div className="flex items-center justify-end gap-1">
                              {l.status === 'PENDING' ? (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleApprove(l.id);
                                    }}
                                    className="p-1 rounded bg-primary text-on-primary hover:bg-primary-container transition-colors shadow-sm"
                                    title="Approve"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">check</span>
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleReject(l.id);
                                    }}
                                    className="p-1 rounded bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
                                    title="Reject"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                  </button>
                                </>
                              ) : (
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                                    l.status === 'APPROVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                                  }`}
                                >
                                  {l.status}
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedLeaveId(l.id);
                                }}
                                className="p-1 rounded bg-secondary-fixed text-on-secondary-fixed-variant hover:bg-secondary-fixed-dim transition-colors"
                                title="Inspect Record"
                                type="button"
                              >
                                <span className="material-symbols-outlined text-[16px]">visibility</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT 35% (Cols 9-12): Detailed Absence Dossier / Inspector */}
          <div className="lg:col-span-4 flex flex-col gap-space-md">
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-md flex flex-col gap-space-md">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-space-sm">
                  <img
                    className="w-12 h-12 rounded-full object-cover shadow-sm"
                    src={selectedLeave.avatar}
                    alt={selectedLeave.name}
                  />
                  <div className="flex flex-col">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {selectedLeave.name}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                      {selectedLeave.empCode} • {selectedLeave.role}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant">
                      {selectedLeave.hub} • {selectedLeave.dept}
                    </span>
                  </div>
                </div>
                <span className="px-space-xs py-0.5 rounded bg-surface-container-high text-secondary font-label-sm text-label-sm font-bold">
                  {selectedLeave.id}
                </span>
              </div>

              {/* Leave Balances Cards */}
              <div className="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-sm">
                <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">
                  Statutory Form F Leave Ledger
                </span>
                <div className="grid grid-cols-3 gap-space-xs text-center">
                  <div className="p-2 bg-surface-container-lowest rounded-lg border border-slate-200/40">
                    <span className="font-label-sm text-label-sm text-on-surface-variant block">Casual (CL)</span>
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {selectedLeave.clRemaining} / 12
                    </span>
                  </div>
                  <div className="p-2 bg-surface-container-lowest rounded-lg border border-slate-200/40">
                    <span className="font-label-sm text-label-sm text-on-surface-variant block">Earned (EL)</span>
                    <span className="font-headline-sm text-headline-sm font-bold text-secondary">
                      {selectedLeave.elRemaining} / 15
                    </span>
                  </div>
                  <div className="p-2 bg-surface-container-lowest rounded-lg border border-slate-200/40">
                    <span className="font-label-sm text-label-sm text-on-surface-variant block">Sick (SL)</span>
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      {selectedLeave.slRemaining} / 7
                    </span>
                  </div>
                </div>
              </div>

              {/* Justification & Floor Handoff */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">
                  Reason &amp; Handover Protocol
                </span>
                <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1">
                  <p className="font-body-sm text-body-sm text-on-surface">
                    "{selectedLeave.reason}"
                  </p>
                  <div className="pt-2 border-t border-slate-200/40 text-xs text-on-surface-variant">
                    <strong className="text-on-surface">Floor Coverage:</strong> {selectedLeave.coverageBy}
                  </div>
                </div>
              </div>

              {/* Supervisor Notes */}
              <div className="flex flex-col gap-space-xs">
                <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">
                  Supervisor Endorsement
                </span>
                <p className="font-body-sm text-body-sm text-on-surface italic bg-slate-50 p-3 rounded-lg border border-slate-200/50">
                  “{selectedLeave.supervisorNotes}”
                </p>
              </div>

              {/* Action Buttons */}
              {selectedLeave.status === 'PENDING' ? (
                <div className="flex flex-col gap-space-xs pt-space-xs">
                  <button
                    onClick={() => handleApprove(selectedLeave.id)}
                    className="w-full py-space-sm px-space-md rounded-lg bg-primary text-on-primary hover:bg-primary-container transition-colors font-label-lg text-label-lg font-bold flex items-center justify-center gap-space-xs shadow-sm"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    Approve Leave &amp; Notify Staff
                  </button>
                  <button
                    onClick={() => handleReject(selectedLeave.id)}
                    className="w-full py-space-xs px-space-sm rounded-lg bg-error-container text-on-error-container hover:bg-rose-600 hover:text-white transition-colors font-label-sm text-label-sm font-semibold flex items-center justify-center gap-1"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                    Decline Request
                  </button>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg text-xs font-semibold flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px]">check_circle</span>
                  Leave Decision Recorded in Karnataka Factories Act Form F
                </div>
              )}
            </div>

            {/* Statutory Compliance Note */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-md flex flex-col gap-space-sm">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary text-[18px]">gavel</span>
                <span className="font-label-lg text-label-lg font-bold text-on-surface">Statutory Absence Quota</span>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                Karnataka Shops &amp; Commercial Establishments Act mandates 1 day paid leave per 20 working days. Unavailed Earned Leave can be carried over up to 30 days.
              </p>
            </div>
          </div>
        </div>

        {/* Apply Leave on Behalf Modal */}
        {isApplyModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">add_circle</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Apply Leave on Behalf of Employee</h3>
                </div>
                <button onClick={() => setIsApplyModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <form onSubmit={handleApplySubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Employee Full Name</label>
                  <input
                    type="text"
                    required
                    value={applyForm.name}
                    onChange={(e) => setApplyForm({ ...applyForm, name: e.target.value })}
                    placeholder="e.g. Rajeshwari V. Patil"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Employee Code</label>
                    <input
                      type="text"
                      required
                      value={applyForm.empCode}
                      onChange={(e) => setApplyForm({ ...applyForm, empCode: e.target.value })}
                      placeholder="e.g. BSC-EMP-0042"
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Location Hub</label>
                    <select
                      value={applyForm.hubCode}
                      onChange={(e) => setApplyForm({ ...applyForm, hubCode: e.target.value as any })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    >
                      <option value="bel-01">Belagavi Flagship BEL-01</option>
                      <option value="dav-02">Davanagere Mill DAV-02</option>
                      <option value="shi-03">Shivamogga Apex SHI-03</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Leave Category</label>
                    <select
                      value={applyForm.type}
                      onChange={(e) => setApplyForm({ ...applyForm, type: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    >
                      <option value="CL">Casual Leave (CL)</option>
                      <option value="EL">Earned Leave (EL)</option>
                      <option value="SL">Sick / Medical Leave (SL)</option>
                      <option value="CO">Compensatory Off (CO)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Duration (Days)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      value={applyForm.days}
                      onChange={(e) => setApplyForm({ ...applyForm, days: e.target.value })}
                      className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Dates Required</label>
                  <input
                    type="text"
                    value={applyForm.dates}
                    onChange={(e) => setApplyForm({ ...applyForm, dates: e.target.value })}
                    placeholder="e.g. 28 Oct – 30 Oct 2024"
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Absence Reason</label>
                  <textarea
                    rows={3}
                    required
                    value={applyForm.reason}
                    onChange={(e) => setApplyForm({ ...applyForm, reason: e.target.value })}
                    placeholder="Specify absence rationale for statutory muster roll..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsApplyModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary text-on-primary hover:bg-primary-container rounded-lg transition-colors font-bold shadow-sm"
                  >
                    Submit for Approval
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
