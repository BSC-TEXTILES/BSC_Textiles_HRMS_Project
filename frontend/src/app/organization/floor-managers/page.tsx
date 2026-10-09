'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

interface Follower {
  id: string;
  name: string;
  empCode: string;
  role: string;
  station: string;
  status: 'ACTIVE' | 'LUNCH' | 'TEA' | 'LEAVE' | 'EXCEPTION';
  statusText: string;
  punchTime: string;
  terminal: string;
  directive: string;
  directiveType: 'KYC' | 'CORRECTION' | 'ASSET' | 'CLEAR';
  avatar: string;
}

const INITIAL_FOLLOWERS: Follower[] = [
  {
    id: 'FOL-01',
    name: 'Rajeshwari V. Patil',
    empCode: 'BSC-EMP-0042',
    role: 'Senior Floor Specialist',
    station: 'Bridal & Pure Silk (Counter A)',
    status: 'ACTIVE',
    statusText: 'Active on Floor',
    punchTime: '09:28 AM IN',
    terminal: 'BEL-IN-02 RFID',
    directive: 'Missed OUT Punch Flagged',
    directiveType: 'CORRECTION',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'FOL-02',
    name: 'Amit Deshpande',
    empCode: 'BSC-EMP-0089',
    role: 'Master Tailor',
    station: 'Fitting Atelier & Alterations',
    status: 'ACTIVE',
    statusText: 'Active on Floor',
    punchTime: '11:28 AM IN',
    terminal: 'BEL-IN-01 Turnstile',
    directive: 'Late Grace Waiver Pending',
    directiveType: 'CORRECTION',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'FOL-03',
    name: 'Kavita M.',
    empCode: 'BSC-EMP-0144',
    role: 'Cashier & POS Lead',
    station: 'POS Checkout Desk 01–04',
    status: 'LUNCH',
    statusText: 'Lunch Break (32m / 45m)',
    punchTime: '09:34 AM IN',
    terminal: 'BEL-POS-01',
    directive: 'Vault EOD Balance Reconciled',
    directiveType: 'CLEAR',
    avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'FOL-04',
    name: 'Priyanka Nayak',
    empCode: 'BSC-EMP-0155',
    role: 'Customer Sales Executive',
    station: 'Visual Merchandising North',
    status: 'ACTIVE',
    statusText: 'Active on Floor',
    punchTime: '09:25 AM IN',
    terminal: 'BEL-IN-02 RFID',
    directive: 'Zebra TC52 Device Assigned',
    directiveType: 'ASSET',
    avatar: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'FOL-05',
    name: 'Basavaraj Patil',
    empCode: 'BSC-EMP-0034',
    role: 'Finished Goods Depot Handler',
    station: 'Basement Storage & Vault',
    status: 'ACTIVE',
    statusText: 'Active on Floor',
    punchTime: '08:58 AM IN',
    terminal: 'BEL-LOG-01',
    directive: 'Biometric Face Enrollment Due',
    directiveType: 'KYC',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=200&q=80',
  },
  {
    id: 'FOL-06',
    name: 'Sneha Kulkarni',
    empCode: 'BSC-EMP-0118',
    role: 'Bridal Silk Consultant',
    station: 'Bridal & Pure Silk (Counter B)',
    status: 'LEAVE',
    statusText: 'On Approved Casual Leave',
    punchTime: 'Weekly Off / Approved CL',
    terminal: 'Form F Slip #LV-9921',
    directive: 'Counter Covered by Radha S.',
    directiveType: 'CLEAR',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
  },
];

export default function FloorManagersPage() {
  const [followers, setFollowers] = useState<Follower[]>(INITIAL_FOLLOWERS);
  const [activeTab, setActiveTab] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'LUNCH' | 'EXCEPTION'>('ALL');
  const [stationFilter, setStationFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isObservationModalOpen, setIsObservationModalOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Follower | null>(null);
  const [observationText, setObservationText] = useState('');

  const filteredFollowers = followers.filter((f) => {
    let matchesTab = true;
    if (activeTab === 'PENDING') matchesTab = f.directiveType !== 'CLEAR';
    else if (activeTab === 'ACTIVE') matchesTab = f.status === 'ACTIVE';
    else if (activeTab === 'LUNCH') matchesTab = f.status === 'LUNCH' || f.status === 'TEA';
    else if (activeTab === 'EXCEPTION') matchesTab = f.directiveType === 'CORRECTION';

    const matchesStation = stationFilter === 'ALL' || f.station.includes(stationFilter);
    const matchesSearch =
      searchQuery === '' ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.empCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.station.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesTab && matchesStation && matchesSearch;
  });

  const handleVerifyBatch = () => {
    setFollowers((prev) =>
      prev.map((f) => ({ ...f, directiveType: 'CLEAR', directive: 'Verified by Floor Lead' }))
    );
    toast.success('Batch verified all pending floor directives (4 records)!');
  };

  const handleOpenObservation = (staff: Follower) => {
    setSelectedStaff(staff);
    setIsObservationModalOpen(true);
  };

  const handleSubmitObservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!observationText) return;
    toast.success(`Observation logged for ${selectedStaff?.name}: "${observationText}"`);
    setIsObservationModalOpen(false);
    setObservationText('');
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full font-body-md text-on-surface">
        {/* Executive Context & Scoped Floor Header */}
        <div className="bg-surface-container-lowest rounded-xl p-space-lg shadow-sm border border-slate-200/80 mb-space-lg">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md">
            <div className="flex flex-col gap-space-xs">
              <div className="flex flex-wrap items-center gap-space-sm">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm uppercase tracking-wider text-secondary font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary"></span>
                  Scoped Role: Floor Manager / Lead
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-low font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                  <span className="material-symbols-outlined text-[14px]">groups</span>
                  28 Direct Followers
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-container-high font-label-sm text-label-sm uppercase tracking-wider text-on-surface font-semibold">
                  <span className="material-symbols-outlined text-[14px] text-secondary">storefront</span>
                  Belagavi Flagship (BEL-01) • Level 1 &amp; Silk Atelier
                </span>
              </div>
              <div className="flex items-baseline gap-space-md mt-1">
                <h1 className="font-headline-lg text-headline-lg font-bold text-on-surface">
                  Anand Kulkarni
                </h1>
                <span className="font-body-md text-body-md text-on-surface-variant">
                  Store Ops &amp; Retail Floor Lead • Terminal Station BEL-MGR-01
                </span>
              </div>
              <div className="flex items-center gap-space-md text-on-surface-variant font-body-sm text-body-sm">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-secondary">timelapse</span>
                  <span>Shift A (09:30 AM – 18:30 PM)</span>
                </div>
                <span className="text-outline-variant">•</span>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[16px] text-secondary">verified</span>
                  <span className="font-label-md text-label-md text-secondary font-bold">Live Floor Adherence: 96.4%</span>
                </div>
                <span className="text-outline-variant">•</span>
                <div className="flex items-center gap-1 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[16px]">devices</span>
                  <span>Terminal BEL-IN-02 Synced</span>
                </div>
              </div>
            </div>

            {/* Quick Floor Actions */}
            <div className="flex flex-wrap items-center gap-space-sm">
              <button
                onClick={() => toast.success('Punch regularization shortcut opened')}
                className="inline-flex items-center gap-1.5 px-space-md py-space-sm rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-label-lg text-label-lg transition-colors border border-slate-200/40"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">rule</span>
                <span>+ Regularize Punch</span>
              </button>
              <button
                onClick={handleVerifyBatch}
                className="inline-flex items-center gap-1.5 px-space-md py-space-sm rounded-lg bg-surface-container-high hover:bg-surface-variant text-secondary font-label-lg text-label-lg transition-colors font-bold"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">fact_check</span>
                <span>Verify Batch (4)</span>
              </button>
              <button
                onClick={() => toast.success('Daily Floor Attendance Report exported (.pdf)')}
                className="inline-flex items-center gap-1.5 px-space-md py-space-sm rounded-lg bg-primary hover:bg-slate-800 text-on-primary font-label-lg text-label-lg shadow-sm transition-colors font-bold"
                type="button"
              >
                <span className="material-symbols-outlined text-[18px]">ios_share</span>
                <span>Export Daily Floor Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* Row of 4 Scoped KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-lg">
          {/* Card 1: Direct Followers */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Assigned Team</span>
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">badge</span>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display-lg text-display-lg text-on-surface font-bold">28</span>
                <span className="font-headline-sm text-headline-sm text-on-surface-variant">/ 28</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 font-body-sm text-body-sm text-on-surface">
                <span className="inline-block w-2 h-2 rounded-full bg-secondary"></span>
                <span>27 Active on Floor</span>
                <span className="text-outline-variant">•</span>
                <span className="text-on-surface-variant">1 Approved CL</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs bg-surface-container-lowest flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm border-t border-slate-100">
              <span>+2 Trainees Under Mentorship</span>
              <span className="font-semibold text-secondary">0 Absent</span>
            </div>
          </div>

          {/* Card 2: Live Floor Presence */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Live Floor Presence</span>
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display-lg text-display-lg text-secondary font-bold">96.4%</span>
                <span className="px-2 py-0.5 rounded-full bg-surface-container font-label-sm text-label-sm text-secondary font-bold">+1.8% vs Wk Avg</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 font-body-sm text-body-sm text-on-surface-variant">
                <span>2 Early Check-ins (09:12 AM)</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm border-t border-slate-100">
              <span>Gate Terminal BEL-IN-02</span>
              <span className="text-on-surface font-semibold">100% In-Sync</span>
            </div>
          </div>

          {/* Card 3: Pending Directives / Verification */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Pending Verifications</span>
              <div className="w-9 h-9 rounded-lg bg-error-container/40 flex items-center justify-center text-error">
                <span className="material-symbols-outlined text-[20px]">pending_actions</span>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display-lg text-display-lg text-on-surface font-bold">
                  {followers.filter((f) => f.directiveType !== 'CLEAR').length}
                </span>
                <span className="font-headline-sm text-headline-sm text-error font-semibold">Directives</span>
              </div>
              <div className="flex items-center gap-1 mt-1 font-body-sm text-body-sm text-on-surface-variant">
                <span>1 KYC</span>
                <span className="text-outline-variant">•</span>
                <span>2 Corrections</span>
                <span className="text-outline-variant">•</span>
                <span>1 Asset</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs flex items-center justify-between font-label-sm text-label-sm border-t border-slate-100">
              <span className="text-error font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse"></span>
                Action Required Today
              </span>
              <span onClick={() => setActiveTab('PENDING')} className="text-secondary font-semibold cursor-pointer">Review All</span>
            </div>
          </div>

          {/* Card 4: Lunch & Break Tracker */}
          <div className="bg-surface-container-lowest rounded-xl p-space-md shadow-sm border border-slate-200/80 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-space-sm">
              <span className="font-label-md text-label-md uppercase tracking-wider text-on-surface-variant font-bold">Lunch &amp; Break Compliance</span>
              <div className="w-9 h-9 rounded-lg bg-surface-container-low flex items-center justify-center text-secondary">
                <span className="material-symbols-outlined text-[20px]">coffee</span>
              </div>
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display-lg text-display-lg text-on-surface font-bold">25</span>
                <span className="font-headline-sm text-headline-sm text-on-surface-variant">/ 28 Done</span>
              </div>
              <div className="flex items-center gap-1.5 mt-1 font-body-sm text-body-sm text-on-surface">
                <span className="font-semibold text-secondary">1 Currently at Lunch</span>
                <span className="text-outline-variant">•</span>
                <span className="text-on-surface-variant">0 Breaches</span>
              </div>
            </div>
            <div className="mt-space-md pt-space-xs flex items-center justify-between text-on-surface-variant font-label-sm text-label-sm border-t border-slate-100">
              <span>Floor Avg: 38 min / 45m cap</span>
              <span className="text-secondary font-semibold">In Legal Band</span>
            </div>
          </div>
        </div>

        {/* Primary Layout: Central Queue & Side Support Rails */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
          {/* Central Queue: Scoped Follower Roster & Verification (Span 8) */}
          <div className="xl:col-span-8 flex flex-col gap-space-md">
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 overflow-hidden">
              {/* Tab Bar & Header Actions */}
              <div className="p-space-md bg-surface-container-lowest flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-slate-100">
                <div>
                  <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant font-bold">
                    BEL-01 Silk Atelier &amp; Floor 1
                  </span>
                  <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    Team Verification Queue &amp; Followers Roster
                  </h2>
                </div>
                <div className="flex items-center gap-space-xs">
                  <span className="font-label-md text-label-md px-2.5 py-1 rounded bg-surface-container font-semibold text-on-surface">
                    Auto-Refresh: 30s
                  </span>
                  <button
                    onClick={() => toast.success('Roster refreshed from Biometric Server')}
                    className="p-1.5 rounded-lg hover:bg-surface-container-low text-on-surface-variant transition-colors"
                    title="Sync Roster"
                  >
                    <span className="material-symbols-outlined text-[18px]">sync</span>
                  </button>
                </div>
              </div>

              {/* Filter Segmented Tabs */}
              <div className="px-space-md flex flex-wrap items-center gap-space-xs bg-surface-container-low/50 py-space-xs border-b border-slate-100">
                <button
                  onClick={() => setActiveTab('ALL')}
                  className={`px-space-md py-1.5 rounded font-label-lg text-label-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === 'ALL'
                      ? 'bg-surface-container-lowest text-secondary shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>All Followers</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-secondary-fixed text-on-secondary-fixed font-label-sm text-label-sm">
                    {followers.length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('PENDING')}
                  className={`px-space-md py-1.5 rounded font-label-lg text-label-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === 'PENDING'
                      ? 'bg-surface-container-lowest text-secondary shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>Pending Verification</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-error-container text-on-error-container font-label-sm text-label-sm font-bold">
                    {followers.filter((f) => f.directiveType !== 'CLEAR').length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('ACTIVE')}
                  className={`px-space-md py-1.5 rounded font-label-lg text-label-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === 'ACTIVE'
                      ? 'bg-surface-container-lowest text-secondary shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>Active on Floor</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface font-label-sm text-label-sm">
                    {followers.filter((f) => f.status === 'ACTIVE').length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('LUNCH')}
                  className={`px-space-md py-1.5 rounded font-label-lg text-label-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === 'LUNCH'
                      ? 'bg-surface-container-lowest text-secondary shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>On Lunch / Break</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-surface-container-high text-secondary font-label-sm text-label-sm">
                    {followers.filter((f) => f.status === 'LUNCH').length}
                  </span>
                </button>
                <button
                  onClick={() => setActiveTab('EXCEPTION')}
                  className={`px-space-md py-1.5 rounded font-label-lg text-label-lg transition-colors flex items-center gap-1.5 ${
                    activeTab === 'EXCEPTION'
                      ? 'bg-surface-container-lowest text-secondary shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span>Exceptions</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-surface-container text-on-surface-variant font-label-sm text-label-sm">
                    {followers.filter((f) => f.directiveType === 'CORRECTION').length}
                  </span>
                </button>
              </div>

              {/* Filter Search & Micro Controls */}
              <div className="p-space-md bg-surface-container-lowest flex flex-col md:flex-row items-center justify-between gap-space-sm border-b border-slate-100">
                <div className="relative w-full md:w-96 flex items-center bg-surface-container-low rounded-lg px-space-md py-space-xs">
                  <span className="material-symbols-outlined text-on-surface-variant text-[18px] mr-2">search</span>
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-transparent font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant focus:outline-none"
                    placeholder="Filter followers by ID, Name, Station, or Asset..."
                    type="text"
                  />
                </div>
                <div className="flex items-center gap-space-xs w-full md:w-auto justify-end">
                  <select
                    value={stationFilter}
                    onChange={(e) => setStationFilter(e.target.value)}
                    className="bg-surface-container-low rounded-lg px-space-md py-space-xs font-label-md text-label-md text-on-surface focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">All Floor Stations</option>
                    <option value="Bridal">Bridal &amp; Pure Silk (Counter A/B)</option>
                    <option value="POS Checkout">POS Checkout Desk 01–04</option>
                    <option value="Visual Merchandising">Visual Merchandising North</option>
                    <option value="Fitting Atelier">Fitting Atelier &amp; Alterations</option>
                    <option value="Basement">Basement Storage &amp; Vault</option>
                  </select>
                </div>
              </div>

              {/* High Density Data Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left font-body-md text-body-md">
                  <thead>
                    <tr className="bg-surface-container-low font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                      <th className="py-space-sm px-space-md">Follower Employee</th>
                      <th className="py-space-sm px-space-md">Station / Counter</th>
                      <th className="py-space-sm px-space-md">Live Floor Status</th>
                      <th className="py-space-sm px-space-md">Punch &amp; Terminal</th>
                      <th className="py-space-sm px-space-md">Directives / Verification</th>
                      <th className="py-space-sm px-space-md text-right">Floor Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredFollowers.map((f) => (
                      <tr key={f.id} className="hover:bg-surface-container-low/60 transition-colors">
                        <td className="py-space-sm px-space-md">
                          <div className="flex items-center gap-space-sm">
                            <img
                              className="w-9 h-9 rounded-full object-cover shrink-0 shadow-sm"
                              src={f.avatar}
                              alt={f.name}
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="font-label-lg text-label-lg font-bold text-on-surface truncate">
                                {f.name}
                              </span>
                              <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">
                                {f.empCode} • {f.role}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-space-sm px-space-md font-body-sm text-body-sm text-on-surface">
                          {f.station}
                        </td>
                        <td className="py-space-sm px-space-md">
                          <span
                            className={`px-2 py-0.5 rounded-full font-label-sm text-label-sm font-bold ${
                              f.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : f.status === 'LUNCH'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {f.statusText}
                          </span>
                        </td>
                        <td className="py-space-sm px-space-md text-xs">
                          <div className="font-mono font-bold text-on-surface">{f.punchTime}</div>
                          <div className="text-[11px] text-on-surface-variant">{f.terminal}</div>
                        </td>
                        <td className="py-space-sm px-space-md">
                          <span
                            className={`px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold ${
                              f.directiveType === 'CORRECTION'
                                ? 'bg-error-container text-on-error-container'
                                : f.directiveType === 'KYC'
                                ? 'bg-blue-100 text-blue-800'
                                : f.directiveType === 'ASSET'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {f.directive}
                          </span>
                        </td>
                        <td className="py-space-sm px-space-md text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setFollowers((prev) =>
                                  prev.map((item) =>
                                    item.id === f.id
                                      ? { ...item, directiveType: 'CLEAR', directive: 'Verified OK' }
                                      : item
                                  )
                                );
                                toast.success(`Directives verified for ${f.name}!`);
                              }}
                              className="p-1 rounded bg-surface-container hover:bg-secondary hover:text-white transition-colors"
                              title="Verify Directives"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[16px]">check</span>
                            </button>
                            <button
                              onClick={() => handleOpenObservation(f)}
                              className="p-1 rounded bg-surface-container hover:bg-surface-container-high transition-colors text-on-surface-variant"
                              title="Add Floor Observation"
                              type="button"
                            >
                              <span className="material-symbols-outlined text-[16px]">visibility</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Side Support Rails: Real-Time Floor Scanner / Exceptions (Span 4) */}
          <div className="xl:col-span-4 flex flex-col gap-space-md">
            {/* Real-Time Optical Observation Stream */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-md flex flex-col gap-space-sm">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary">videocam</span>
                  <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Floor Telemetry &amp; Camera Stream</h3>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              </div>
              <div className="space-y-2.5 pt-1 text-xs">
                <div className="p-2.5 bg-surface-container-low rounded-lg flex items-center justify-between">
                  <div>
                    <strong className="block text-slate-800">CAM-04 Bridal Vault</strong>
                    <span className="text-slate-500">Live Face Verification 99.4% Match</span>
                  </div>
                  <span className="text-emerald-700 font-bold">14:22:01 IST</span>
                </div>
                <div className="p-2.5 bg-surface-container-low rounded-lg flex items-center justify-between">
                  <div>
                    <strong className="block text-slate-800">POS Cashier Turnstile</strong>
                    <span className="text-slate-500">Kavita M. returned from Cafeteria</span>
                  </div>
                  <span className="text-slate-600 font-medium">14:20:15 IST</span>
                </div>
                <div className="p-2.5 bg-surface-container-low rounded-lg flex items-center justify-between">
                  <div>
                    <strong className="block text-slate-800">Fitting Atelier Sensor</strong>
                    <span className="text-slate-500">Tailoring zone occupied by 4 specialists</span>
                  </div>
                  <span className="text-slate-600 font-medium">14:18:40 IST</span>
                </div>
              </div>
            </div>

            {/* Floor Manager Attestation Notice */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm border border-slate-200/80 p-space-md flex flex-col gap-space-sm">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">gavel</span>
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">Floor Manager Governance</h3>
              </div>
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                As Store Ops Floor Lead, you are authorized under Section 62 of Karnataka Factories Act to verify floor rosters and certify shift completion before daily EOD ledger closure.
              </p>
            </div>
          </div>
        </div>

        {/* Observation Modal */}
        {isObservationModalOpen && selectedStaff && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-surface-container-lowest rounded-2xl shadow-xl border border-slate-200 w-full max-w-md p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Log Observation for {selectedStaff.name}
                </h3>
                <button onClick={() => setIsObservationModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
              <form onSubmit={handleSubmitObservation} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Observation Note</label>
                  <textarea
                    rows={4}
                    required
                    value={observationText}
                    onChange={(e) => setObservationText(e.target.value)}
                    placeholder="Enter floor conduct, customer presentation, or uniform observation..."
                    className="w-full px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-secondary"
                  />
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setIsObservationModalOpen(false)}
                    className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-sm bg-primary text-on-primary hover:bg-slate-800 rounded-lg font-bold shadow-sm"
                  >
                    Save Observation
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
