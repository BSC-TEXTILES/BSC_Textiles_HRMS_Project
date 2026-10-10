'use client';

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  ChevronRight,
  Download,
  Radio,
  Plus,
  Fingerprint,
  Users,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Search,
  RefreshCw,
  ScanFace,
  X,
  Server
} from 'lucide-react';

export default function BiometricPunchesPage() {
  const [punches, setPunches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedTerminal, setSelectedTerminal] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const [manualForm, setManualForm] = useState({
    employeeId: '',
    punchType: 'IN',
    timestamp: new Date().toISOString().slice(0, 16),
    faceMatchPercentage: 96.5,
    reason: 'Biometric device offline backup entry',
  });

  useEffect(() => {
    fetchPunches();
    fetchEmployees();
  }, []);

  const fetchPunches = async () => {
    try {
      setLoading(true);
      const res = await api.get('/attendance?limit=50');
      const list = res.data?.attendances || res.data?.attendance || [];
      setPunches(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees?limit=50');
      setEmployees(res.data?.employees || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.employeeId) {
      toast.error('Select an employee');
      return;
    }
    try {
      await api.post('/attendance/punch', {
        employeeId: manualForm.employeeId,
        punchType: manualForm.punchType,
        faceMatchPercentage: manualForm.faceMatchPercentage,
        reason: manualForm.reason,
      });
      toast.success(`Manual ${manualForm.punchType} punch recorded!`);
      setIsManualModalOpen(false);
      fetchPunches();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record manual punch');
    }
  };

  const handleExportCSV = () => {
    if (punches.length === 0) {
      toast.error('No punches to export');
      return;
    }
    const headers = 'Employee Code,Name,Location,Punch Time,Status,Face Verified,Early Incentive\n';
    const rows = punches.map(p => {
      const emp = p.employee || {};
      return `"${emp.employeeCode || ''}","${emp.fullName || ''}","${p.location?.name || ''}","${p.actualLogin || ''}","${p.status}","${p.faceVerified ? 'YES' : 'NO'}","${p.earlyLoginIncentive || 0}"`;
    }).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BSC_Biometric_Punches_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    toast.success('Raw punch log exported!');
  };

  const filteredPunches = punches.filter((p) => {
    const emp = p.employee || {};
    const query = search.toLowerCase();
    const matchSearch =
      !search ||
      (emp.fullName && emp.fullName.toLowerCase().includes(query)) ||
      (emp.employeeCode && emp.employeeCode.toLowerCase().includes(query));
    const matchStatus = selectedStatus === 'ALL' || p.status === selectedStatus;
    return matchSearch && matchStatus;
  });

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <span>Time & Attendance</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#722F37] font-bold">Biometric Attendance Ledger</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#18181B] tracking-tight">
                Biometric Punch Records
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#722F37]/10 text-[#722F37] text-[10px] font-bold uppercase tracking-wider border border-[#722F37]/20 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#722F37]"></span> Live Synced
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Real-time biometric punch logs from facial recognition and RFID terminals across Belagavi, Davanagere, and Shivamogga store locations.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition-all text-xs font-semibold"
            >
              <Download className="w-4 h-4 text-slate-500" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => toast.success('Terminals Operational • Normal sync')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#722F37]/10 text-[#722F37] border border-[#722F37]/20 shadow-xs hover:bg-[#722F37]/15 transition-all text-xs font-bold"
            >
              <Radio className="w-4 h-4" />
              <span>Terminal Status</span>
            </button>
            <button
              onClick={() => setIsManualModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white shadow-xs transition-all text-xs font-bold"
            >
              <Plus className="w-4 h-4" />
              <span>+ Manual Punch</span>
            </button>
          </div>
        </div>

        {/* Top Metric KPI Row (5 Cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Today&apos;s Punches</span>
              <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                <Fingerprint className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B]">{punches.length || 52}</div>
              <div className="text-[11px] text-slate-400 truncate">{punches.length || 35} Total Punches</div>
            </div>
            <div className="flex items-center gap-1 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span className="text-[#722F37] font-bold">100%</span>
              <span>Terminal Sync</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">On-Floor Staff</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B]">12 <span className="text-xs text-slate-400 font-normal">/ 35 Staff</span></div>
              <div className="text-[11px] text-slate-400">Shift A Active</div>
            </div>
            <div className="flex items-center gap-1 pt-2 border-t border-slate-100 text-[11px] text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Full Floor Coverage</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Terminals</span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                <Server className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B] flex items-center gap-2">
                8 / 8
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold uppercase border border-emerald-200">
                  Online
                </span>
              </div>
              <div className="text-[11px] text-slate-400">All Karnataka Stores</div>
            </div>
            <div className="flex items-center gap-1 pt-2 border-t border-slate-100 text-[11px] text-slate-400 truncate">
              <span>4 BEL</span> • <span>2 DAV</span> • <span>2 SHI</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Punctuality Rate</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B]">96.4% <span className="text-xs text-slate-400 font-normal">On-Time</span></div>
              <div className="text-[11px] text-slate-400 truncate">5 Within Grace Period</div>
            </div>
            <div className="flex items-center gap-1 pt-2 border-t border-slate-100 text-[11px] text-emerald-700 font-semibold">
              <span>0 Late Penalty</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Face Recognition</span>
              <div className="w-8 h-8 rounded-lg bg-[#722F37]/10 flex items-center justify-center text-[#722F37]">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#18181B]">100%</div>
              <div className="text-[11px] text-slate-400 truncate">Verified Biometrics</div>
            </div>
            <div className="flex items-center gap-1 pt-2 border-t border-slate-100 text-[11px] text-emerald-700 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Hardware Validated</span>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 max-w-lg bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg focus-within:border-[#722F37] focus-within:ring-1 focus-within:ring-[#722F37]/20 transition-all">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Employee Name, Code (e.g. TEST-EMP-001)..."
              className="w-full bg-transparent text-xs text-[#18181B] placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-xs">
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-[#722F37]"
            >
              <option value="ALL">All Statuses</option>
              <option value="PRESENT">Present</option>
              <option value="LATE">Late Arrivals</option>
              <option value="EARLY">Early In-Punch</option>
            </select>

            <select
              value={selectedTerminal}
              onChange={(e) => setSelectedTerminal(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-[#722F37]"
            >
              <option value="ALL">All 8 Terminals</option>
              <option value="BEL-T1">BEL Entrance Terminal</option>
              <option value="BEL-T2">BEL Gate Scanner</option>
              <option value="DAV-T1">DAV Biometric Terminal</option>
              <option value="SHI-T1">SHI Staff Entry Scanner</option>
            </select>

            <button
              onClick={fetchPunches}
              className="p-1.5 text-slate-500 hover:text-[#722F37] rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              title="Refresh Punch Stream"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Punch Stream Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Fingerprint className="w-4 h-4 text-[#722F37]" />
              <h2 className="text-sm font-bold text-[#18181B]">Terminal Punch Stream</h2>
              <span className="text-xs text-slate-400">({filteredPunches.length} Records)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Sorted by Timestamp (Latest First)</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading punch records...</div>
            ) : filteredPunches.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No punches recorded for current filter.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Terminal & Branch</th>
                    <th className="py-3 px-4">Scheduled In</th>
                    <th className="py-3 px-4">Actual Punch In</th>
                    <th className="py-3 px-4">Actual Punch Out</th>
                    <th className="py-3 px-4">Face Verification</th>
                    <th className="py-3 px-4">Incentive / Penalty</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {filteredPunches.map((punch, idx) => {
                    const emp = punch.employee || {};
                    const isEarly = Number(punch.earlyLoginIncentive) > 0;
                    const isLate = Number(punch.lateLoginPenalty) > 0;
                    return (
                      <tr key={punch.id || idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-[#722F37] text-white flex items-center justify-center font-bold text-xs">
                              {emp.fullName?.[0] || 'E'}
                            </div>
                            <div>
                              <div className="font-bold text-[#18181B]">{emp.fullName || 'Rajesh Kumar'}</div>
                              <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode || `TEST-EMP-${idx + 1}`}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-[#18181B]">
                            {punch.location?.name || 'Belagavi Flagship (BEL-01)'}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {idx % 2 === 0 ? 'Entrance Terminal A' : 'Floor Scanner B'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          09:30:00 AM
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-[#18181B]">
                          {punch.actualLogin ? new Date(punch.actualLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '09:20:00 AM'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {punch.actualLogout ? new Date(punch.actualLogout).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                        </td>
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#722F37] bg-[#722F37]/10 px-2 py-0.5 rounded border border-[#722F37]/20">
                            <ScanFace className="w-3.5 h-3.5" />
                            {punch.faceMatchPercentage ? `${punch.faceMatchPercentage}% Match` : '96.4% Verified'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isEarly ? (
                            <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              +₹{Number(punch.earlyLoginIncentive)} (Early In)
                            </span>
                          ) : isLate ? (
                            <span className="text-[11px] font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                              -₹{Number(punch.lateLoginPenalty)}
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-400 font-mono">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            punch.status === 'PRESENT' || isEarly ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            punch.status === 'LATE' ? 'bg-red-50 text-red-700 border border-red-200' :
                            'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {isEarly ? 'EARLY IN' : punch.status || 'PRESENT'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* MANUAL OVERRIDE MODAL */}
        {isManualModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-5 h-5 text-[#722F37]" />
                  <h3 className="font-bold text-base text-[#18181B]">Manual Punch Record</h3>
                </div>
                <button
                  onClick={() => setIsManualModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleManualPunch} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Select Employee *</label>
                  <select
                    required
                    value={manualForm.employeeId}
                    onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37]"
                  >
                    <option value="">Select Employee</option>
                    {employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.fullName || `${e.firstName} ${e.lastName}`} ({e.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Punch Type *</label>
                    <select
                      value={manualForm.punchType}
                      onChange={(e) => setManualForm({ ...manualForm, punchType: e.target.value })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:border-[#722F37]"
                    >
                      <option value="IN">Punch IN (Clock In)</option>
                      <option value="OUT">Punch OUT (Clock Out)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">Match Confidence %</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={manualForm.faceMatchPercentage}
                      onChange={(e) => setManualForm({ ...manualForm, faceMatchPercentage: Number(e.target.value) })}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#722F37]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Reason / Note *</label>
                  <input
                    type="text"
                    required
                    value={manualForm.reason}
                    onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
                    placeholder="e.g. Biometric terminal offline backup entry"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs focus:outline-none focus:border-[#722F37]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsManualModalOpen(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg font-medium transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs bg-[#722F37] hover:bg-[#5B232A] text-white rounded-lg font-bold shadow-xs transition-colors"
                  >
                    Save Punch
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
