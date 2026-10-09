'use client';

import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

import { CORRECTION_RECORDS, type CorrectionRecord } from '@/lib/correctionRecords';

export default function AttendanceCorrectionsPage() {
  const [records, setRecords] = useState<CorrectionRecord[]>(CORRECTION_RECORDS);
  const [activeTab, setActiveTab] = useState<'ALL' | 'MISSED_OUT' | 'LATE_GRACE' | 'ON_DUTY' | 'SENSOR_GLITCH'>('ALL');
  const [hubFilter, setHubFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecordId, setSelectedRecordId] = useState<string>('CORR-4029');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [newRequest, setNewRequest] = useState({
    name: '',
    empCode: '',
    hub: 'BEL-01 Flagship',
    shift: 'Shift A (09:30 â€“ 18:30)',
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
      <div className="flex flex-col w-full gap-6 pb-12">
        {/* TOP OPERATIONAL BREADCRUMB & CONTEXT HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-slate-500 font-semibold tracking-wider uppercase">
              <span>Time &amp; Attendance</span>
              <span className="material-symbols-outlined text-[14px] text-slate-400">chevron_right</span>
              <span className="text-[#0058be] font-bold">Punch Corrections &amp; Regularization Ledger</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 pt-0.5">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Punch Corrections &amp; Attendance Regularization
              </h1>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#eff4ff] text-[#0058be] text-xs font-semibold border border-[#dce9ff]">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#0058be] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#0058be]"></span>
                </span>
                Active Pay Cycle: 21 Oct â€“ 27 Oct 2024
              </div>
              <div className="inline-flex items-center gap-1.5 text-slate-600 text-xs bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-200/60 font-medium">
                <span className="material-symbols-outlined text-[15px] text-[#0058be]">verified_user</span>
                Karnataka Factories Act Form T
              </div>
            </div>
          </div>

          {/* SCREEN ACTION SUITE */}
          <div className="flex items-center gap-2.5 flex-wrap self-start lg:self-center">
            <button
              onClick={() => toast.success('Muster roll audit exported (.xlsx)')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 transition-colors rounded-xl text-xs font-semibold shadow-xs border border-slate-200"
              type="button"
            >
              <span className="material-symbols-outlined text-[17px] text-slate-500">file_download</span>
              Export Audit (XLSX)
            </button>
            <button
              onClick={() => {
                setRecords((prev) =>
                  prev.map((r) => (r.status === 'PENDING' ? { ...r, status: 'APPROVED' } : r))
                );
                toast.success('Batch approved all pending requests!');
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 transition-colors rounded-xl text-xs font-semibold shadow-xs border border-slate-200"
              type="button"
            >
              <span className="material-symbols-outlined text-[17px] text-[#0058be]">checklist_rtl</span>
              Batch Approve All Pending
            </button>
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-[#0058be] text-white hover:bg-blue-700 transition-colors rounded-xl text-xs font-semibold shadow-sm active:scale-95"
              type="button"
            >
              <span className="material-symbols-outlined text-[17px]">add_circle</span>
              Request Manual Correction
            </button>
          </div>
        </div>

        {/* STRATEGIC KPI METRIC HORIZON (5 CARDS) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[20px]">pending_actions</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                Action Required
              </span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Pending Regularizations
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tracking-tight">
                  {records.filter((r) => r.status === 'PENDING').length}
                </span>
                <span className="text-xs font-semibold text-slate-500">Requests</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#0058be]">subdirectory_arrow_right</span>
              4 Floor Approved â€¢ 2 with HR
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                <span className="material-symbols-outlined text-[20px]">warning</span>
              </div>
              <span className="text-[10px] text-slate-500 font-bold px-2 py-0.5 rounded-full bg-slate-100">Today</span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Auto-Detected Anomalies
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tracking-tight">24</span>
                <span className="text-xs font-semibold text-amber-600">Flagged</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 truncate">
              14 Single Punches â€¢ 6 Grace Breaches
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <span className="material-symbols-outlined text-[20px]">speed</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                94.2% SLA
              </span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Avg Resolution Time
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tracking-tight">2.4</span>
                <span className="text-xs font-semibold text-slate-500">Hours</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
              Target &lt; 4.0 hrs before 20:00 lock
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[20px]">fingerprint</span>
              </div>
              <span className="text-[#0058be] text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 border border-blue-200">
                -0.4% MoM
              </span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Biometric Discrepancy
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-900 tracking-tight">1.8%</span>
                <span className="text-xs font-semibold text-slate-500">Error Rate</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500 truncate">
              Across 792 daily terminal punches
            </div>
          </div>

          <div className="bg-white rounded-xl p-4 shadow-xs border border-slate-200/90 flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <span className="material-symbols-outlined text-[20px]">account_balance_wallet</span>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                Live Safeguard
              </span>
            </div>
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1">
                Payroll Impact Saved
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-emerald-600 tracking-tight">â‚¹18,420</span>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-slate-100 text-xs text-slate-500">
              Protected from wrongful LOP deductions
            </div>
          </div>
        </div>

        {/* MULTI-LEVEL FILTER, TAB STRIP & QUERY TOOLS */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200/90 flex flex-col gap-4">
          {/* Tab Strip */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                activeTab === 'ALL'
                  ? 'bg-[#eff4ff] text-[#0058be] font-bold border border-[#dce9ff]'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              type="button"
            >
              <span>All Requests</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'ALL' ? 'bg-[#0058be] text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {records.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('MISSED_OUT')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                activeTab === 'MISSED_OUT'
                  ? 'bg-[#eff4ff] text-[#0058be] font-bold border border-[#dce9ff]'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              type="button"
            >
              <span>Missed Out-Punches</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'MISSED_OUT' ? 'bg-[#0058be] text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {records.filter((r) => r.type === 'MISSED_OUT').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('LATE_GRACE')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                activeTab === 'LATE_GRACE'
                  ? 'bg-[#eff4ff] text-[#0058be] font-bold border border-[#dce9ff]'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              type="button"
            >
              <span>Late In-Punch Grace Breach</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'LATE_GRACE' ? 'bg-[#0058be] text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {records.filter((r) => r.type === 'LATE_GRACE').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('ON_DUTY')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                activeTab === 'ON_DUTY'
                  ? 'bg-[#eff4ff] text-[#0058be] font-bold border border-[#dce9ff]'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              type="button"
            >
              <span>On-Duty &amp; Mill Out-Slip</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'ON_DUTY' ? 'bg-[#0058be] text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {records.filter((r) => r.type === 'ON_DUTY').length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('SENSOR_GLITCH')}
              className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs whitespace-nowrap transition-all ${
                activeTab === 'SENSOR_GLITCH'
                  ? 'bg-[#eff4ff] text-[#0058be] font-bold border border-[#dce9ff]'
                  : 'text-slate-600 hover:bg-slate-50'
              }`}
              type="button"
            >
              <span>Biometric Optical Failure</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                activeTab === 'SENSOR_GLITCH' ? 'bg-[#0058be] text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {records.filter((r) => r.type === 'SENSOR_GLITCH').length}
              </span>
            </button>
          </div>

          {/* Filter Fields Bar */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center pt-1 border-t border-slate-100">
            <div className="md:col-span-6 relative flex items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
              <span className="material-symbols-outlined text-[18px] text-slate-400 mr-2 shrink-0">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
                placeholder="Search by Employee, ID (e.g. BSC-EMP-0042), or Supervisor..."
                type="text"
              />
            </div>
            <div className="md:col-span-3 relative flex items-center bg-slate-50 rounded-xl px-3 py-2 border border-slate-200/80">
              <span className="material-symbols-outlined text-[16px] text-[#0058be] mr-2 shrink-0">store</span>
              <select
                value={hubFilter}
                onChange={(e) => setHubFilter(e.target.value)}
                className="w-full bg-transparent text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Hubs (Karnataka)</option>
                <option value="BEL">BEL-01 Flagship Belagavi</option>
                <option value="DAV">DAV-02 Weaving Davanagere</option>
                <option value="SHI">SHI-03 Retail Apex Shivamogga</option>
              </select>
            </div>
            <div className="md:col-span-3 flex items-center gap-2 justify-end">
              <span className="text-xs font-medium text-slate-500">Showing {filteredRecords.length} records</span>
              <button
                onClick={() => toast.success('Form T flags refreshed')}
                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-slate-700 text-xs font-semibold flex items-center gap-1 transition-colors border border-slate-200/60"
                type="button"
              >
                <span className="material-symbols-outlined text-[14px] text-[#0058be]">tune</span>
                Form T Flags
              </button>
            </div>
          </div>
        </div>

        {/* MAIN WORK SURFACE: 12-COLUMN LEDGER & INSPECTOR */}
        {/* Uses xl:grid-cols-12 with min-w-0 on both columns to eliminate horizontal overflow/overlay bugs */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* LEFT COLUMN (Table Ledger): xl:col-span-7 2xl:col-span-8 */}
          <div className="xl:col-span-7 2xl:col-span-8 min-w-0 flex flex-col gap-6">
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden flex flex-col">
              {/* Table Control Top Banner */}
              <div className="px-5 py-3.5 bg-slate-50/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-900">Discrepancy Investigation Matrix</span>
                  <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0058be] text-[11px] font-semibold border border-blue-200">
                    {records.filter((r) => r.status === 'PENDING').length} Pending Signoffs
                  </span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-[11px]">
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-[#0058be]"></span> Auto-Verified Sync
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span> Missing Biometric Token
                  </span>
                </div>
              </div>

              {/* Tabular Ledger Content */}
              <div className="overflow-x-auto w-full">
                <table className="w-full text-left text-xs whitespace-normal min-w-[700px]">
                  <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-4 font-bold">Staff &amp; Unit</th>
                      <th className="py-3 px-4 font-bold">Shift &amp; Raw Punches</th>
                      <th className="py-3 px-4 font-bold">Proposed Ledger</th>
                      <th className="py-3 px-4 font-bold">Attestation &amp; Evidence</th>
                      <th className="py-3 px-4 font-bold text-center">Pipeline</th>
                      <th className="py-3 px-4 font-bold text-right">Actions</th>
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
                            isSelected ? 'bg-blue-50/60 border-l-4 border-l-[#0058be]' : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="py-3 px-4 align-top">
                            <div className="flex items-start gap-2.5">
                              <img
                                className="w-8 h-8 rounded-full object-cover shrink-0 shadow-xs border border-slate-200"
                                src={r.avatar}
                                alt={r.name}
                              />
                              <div className="flex flex-col min-w-0">
                                <span className="font-bold text-slate-900 truncate">
                                  {r.name}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {r.empCode}
                                </span>
                                <span className="inline-flex mt-1 items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-[#0058be] bg-[#eff4ff] border border-[#dce9ff] w-max">
                                  {r.hub} â€¢ {r.dept}
                                </span>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-4 align-top">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-800">
                                {r.shift}
                              </span>
                              <div className="flex items-center gap-1 text-slate-500 mt-0.5">
                                <span className="font-mono text-slate-900">{r.rawIn}</span>
                                <span>â€¢</span>
                                <span className="px-1 py-0.2 rounded bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                                  {r.rawOut}
                                </span>
                              </div>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                Terminal: {r.terminal}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 align-top">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-1">
                                <span className="font-mono font-bold text-[#0058be]">{r.overrideOut}</span>
                                <span className="text-[10px] text-slate-400">(Override)</span>
                              </div>
                              <span className="font-semibold text-slate-800 mt-0.5">
                                {r.totalHours}
                              </span>
                              <span className="text-[10px] text-amber-700 font-semibold">
                                {r.otHours}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 align-top max-w-[180px]">
                            <div className="flex flex-col">
                              <span className="text-slate-800 font-medium truncate block" title={r.reason}>
                                {r.reason}
                              </span>
                              <span className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[13px] text-[#0058be]">verified</span>
                                Sup: {r.supervisor}
                              </span>
                              {r.invoiceOrDoc && (
                                <span className="text-[11px] text-[#0058be] underline cursor-pointer mt-0.5">
                                  {r.invoiceOrDoc} attached
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="py-3 px-4 align-top text-center">
                            <div className="inline-flex flex-col items-center">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  r.status === 'APPROVED'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                    : r.status === 'REJECTED'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-200'
                                    : 'bg-blue-50 text-[#0058be] border border-blue-200'
                                }`}
                              >
                                {r.status}
                              </span>
                              <span className="text-[10px] text-slate-400 mt-0.5">
                                Step {r.pipelineStep} of {r.pipelineTotal}
                              </span>
                            </div>
                          </td>

                          <td className="py-3 px-4 align-top text-right">
                            <div className="flex items-center justify-end gap-1">
                              {r.status === 'PENDING' ? (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleApprove(r.id);
                                    }}
                                    className="p-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-xs"
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
                                    className="p-1 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                                    title="Reject or Flag"
                                    type="button"
                                  >
                                    <span className="material-symbols-outlined text-[16px]">close</span>
                                  </button>
                                </>
                              ) : (
                                <span className="text-[11px] text-slate-400 font-medium">Archived</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedRecordId(r.id);
                                }}
                                className="p-1 rounded-lg bg-blue-50 text-[#0058be] hover:bg-blue-100 transition-colors"
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
              <div className="p-4 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100">
                <div className="flex items-center gap-3">
                  <span>
                    Showing <strong>{filteredRecords.length}</strong> of <strong>{records.length}</strong> regularization requests
                  </span>
                  <span className="hidden sm:inline">â€¢</span>
                  <span className="hidden sm:inline">428 Active Floor Staff Registered</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="px-2.5 py-0.5 rounded-md bg-[#0058be] text-white text-xs font-bold">1</span>
                </div>
              </div>
            </div>

            {/* REAL-TIME OPTICAL SENSOR DIAGNOSTICS */}
            <div className="bg-white rounded-2xl p-5 shadow-xs border border-slate-200/90 flex flex-col gap-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0058be] text-[20px]">find_replace</span>
                  <span className="text-xs font-bold text-slate-900">
                    Live Biometric Ingestion &amp; Optical Sensor Diagnostics
                  </span>
                </div>
                <span className="font-mono text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-bold">
                  SHA-256 HASH VERIFIED
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col">
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="text-slate-800">Terminal BEL-GATE-04</span>
                    <span className="text-[#0058be]">OK 99.8%</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">Synced: 14:22:01 IST</span>
                  <span className="text-slate-500 text-[11px] mt-1">Optical scan match: 0.18s latency</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col">
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="text-slate-800">Terminal DAV-GATE-01</span>
                    <span className="text-amber-600">RECALIBRATED</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">Last event: 20:28:11 IST</span>
                  <span className="text-slate-500 text-[11px] mt-1">Optical glass cleaned &amp; rebooted</span>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col">
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span className="text-slate-800">Terminal SHI-RETAIL-01</span>
                    <span className="text-[#0058be]">OK 100%</span>
                  </div>
                  <span className="text-slate-400 font-mono text-[10px]">Synced: 14:21:49 IST</span>
                  <span className="text-slate-500 text-[11px] mt-1">Direct LAN sync to HQ Cloud</span>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN (Detailed Inspection Drawer): xl:col-span-5 2xl:col-span-4 */}
          <div className="xl:col-span-5 2xl:col-span-4 min-w-0 flex flex-col gap-6 xl:sticky xl:top-6">
            {/* Detailed Inspection Card (Pinned for Selected Record) */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-5 flex flex-col gap-4">
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      className="w-12 h-12 rounded-xl object-cover shadow-xs border border-slate-200"
                      src={selectedRecord.avatar}
                      alt={selectedRecord.name}
                    />
                    <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-white"></span>
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-bold text-slate-900">
                        {selectedRecord.name}
                      </span>
                      <span className="material-symbols-outlined text-[#0058be] text-[16px]">verified</span>
                    </div>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {selectedRecord.empCode} â€¢ {selectedRecord.role}
                    </span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      {selectedRecord.hub} â€¢ {selectedRecord.dept}
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-[#0058be] text-xs font-bold border border-blue-200">
                  {selectedRecord.id}
                </span>
              </div>

              {/* Punch Visual Comparison Box */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/70 flex flex-col gap-3">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Punch Override Comparison
                </span>
                
                <div className="p-3 rounded-xl bg-white flex items-center justify-between border border-slate-200/60 shadow-2xs">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Raw Ingestion</span>
                    <span className="font-mono text-xs text-slate-800 font-bold mt-0.5">
                      {selectedRecord.rawIn} â†’ <span className="text-rose-600 font-bold">{selectedRecord.rawOut}</span>
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-[10px] font-bold border border-rose-200">
                    Anomaly
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-[#eff4ff] flex items-center justify-between border border-[#dce9ff]">
                  <div className="flex flex-col">
                    <span className="text-[10px] font-bold text-[#0058be] uppercase">Proposed Approved Ledger</span>
                    <span className="font-mono text-xs text-slate-900 font-bold mt-0.5">
                      {selectedRecord.rawIn} â†’ <span className="text-[#0058be] font-bold">{selectedRecord.overrideOut}</span>
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-[#0058be] text-white text-[10px] font-bold">
                    Verified
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                  <div className="flex flex-col p-2.5 bg-white rounded-lg border border-slate-200/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Payable Net Hours</span>
                    <span className="text-sm font-bold text-slate-900 mt-0.5">
                      {selectedRecord.totalHours}
                    </span>
                  </div>
                  <div className="flex flex-col p-2.5 bg-white rounded-lg border border-slate-200/60">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Overtime / Grace</span>
                    <span className="text-sm font-bold text-amber-600 mt-0.5">
                      {selectedRecord.otHours}
                    </span>
                  </div>
                </div>
              </div>

              {/* Supervisor Attestation Evidence */}
              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  Supervisor Endorsement &amp; Evidence
                </span>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col gap-1.5">
                  <p className="text-xs text-slate-700 italic leading-relaxed">
                    â€œ{selectedRecord.notes}â€
                  </p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                    <span className="font-bold text-slate-800">â€” {selectedRecord.supervisor}</span>
                    <span className="font-mono">24 Oct 19:40 IST</span>
                  </div>
                </div>
                {selectedRecord.invoiceOrDoc && (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex-1 p-2 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0058be]">
                      <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                      {selectedRecord.invoiceOrDoc}
                    </div>
                  </div>
                )}
              </div>

              {/* Action Execution Strip */}
              {selectedRecord.status === 'PENDING' ? (
                <div className="flex flex-col gap-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => handleApprove(selectedRecord.id)}
                    className="w-full py-2.5 px-4 rounded-xl bg-[#0058be] text-white hover:bg-blue-700 transition-colors text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-98"
                    type="button"
                  >
                    <span className="material-symbols-outlined text-[18px]">verified</span>
                    Approve &amp; Commit to Payroll Ledger
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => toast.success(`Clarification ping sent to ${selectedRecord.supervisor}`)}
                      className="py-2 px-3 rounded-xl bg-white text-slate-700 hover:bg-slate-50 transition-colors text-xs font-semibold flex items-center justify-center gap-1 border border-slate-200"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px] text-slate-400">contact_support</span>
                      Request Info
                    </button>
                    <button
                      onClick={() => handleReject(selectedRecord.id)}
                      className="py-2 px-3 rounded-xl bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors text-xs font-semibold flex items-center justify-center gap-1 border border-rose-200"
                      type="button"
                    >
                      <span className="material-symbols-outlined text-[16px]">cancel</span>
                      Reject &amp; LOP
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 text-emerald-800 rounded-xl text-xs font-semibold flex items-center gap-2 border border-emerald-200">
                  <span className="material-symbols-outlined text-[18px] text-emerald-600">check_circle</span>
                  Resolution Audited &amp; Synchronized with Karnataka Factories Act Form T
                </div>
              )}
            </div>

            {/* Karnataka Statutory Compliance Box */}
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center text-[#0058be]">
                  <span className="material-symbols-outlined text-[18px]">gavel</span>
                </div>
                <span className="text-xs font-bold text-slate-900">Karnataka Statutory Compliance</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                <strong className="text-slate-900">Section 62 - Register of Adult Workers:</strong> Every manual attendance adjustment requires dual attestation (Floor Manager + HR Director) before monthly muster roll seal.
              </p>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/60 flex flex-col gap-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-800 font-bold">Muster Roll Lockdown</span>
                  <span className="text-[#0058be] font-bold font-mono">422 / 428 Staff (98.6%)</span>
                </div>
                <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-[#0058be] h-full rounded-full" style={{ width: '98.6%' }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* EXECUTIVE AUDIT TRAIL CRYPTOGRAPHIC SEAL */}
        <div className="p-4 bg-slate-50 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 border border-slate-200/70">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-[#0058be] text-[20px]">encrypted</span>
            <span>
              All punch overrides are cryptographically committed to the BSC Immutable HRMS AuditLog with dual supervisor keys &amp; SHA-256 fingerprint.
            </span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span>Terminal: <strong>Synced 14:22:08 IST</strong></span>
            <span>Ledger: <strong>4.8.2-PROD</strong></span>
          </div>
        </div>

        {/* MANUAL CORRECTION REQUEST MODAL */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b pb-3 border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#0058be]">add_circle</span>
                  <h3 className="text-base font-bold text-slate-900">Request Manual Correction</h3>
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
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Store Hub</label>
                    <select
                      value={newRequest.hub}
                      onChange={(e) => setNewRequest({ ...newRequest, hub: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Requested OUT Punch</label>
                    <input
                      type="text"
                      value={newRequest.overrideOut}
                      onChange={(e) => setNewRequest({ ...newRequest, overrideOut: e.target.value })}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs text-slate-600 hover:bg-slate-100 rounded-xl transition-colors font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 text-xs bg-[#0058be] text-white hover:bg-blue-700 rounded-xl transition-colors font-bold shadow-xs"
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
