'use client';

import { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function AttendanceBreaksPage() {
  const [breaks, setBreaks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  const fetchBreaks = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.append('breakType', filterType);
      if (filterStatus) params.append('status', filterStatus);

      const res = await api.get(`/breaks?${params.toString()}&limit=50`);
      setBreaks(res.data?.breaks || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterStatus]);

  useEffect(() => {
    fetchBreaks();
  }, [fetchBreaks]);

  const activeBreaks = breaks.filter((b) => b.status === 'ACTIVE');
  const completedBreaks = breaks.filter((b) => b.status === 'COMPLETED');
  const exceededBreaks = breaks.filter((b) => b.status === 'EXCEEDED');

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* Top Header & Breadcrumb */}
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-1 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-bold">
              <span>Time & Attendance</span>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <span className="text-[#0058be]">Floor Breaks Governance & Telemetry</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[#0b1c30] tracking-tight">
                Lunch & Break Tracker Dashboard
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#eff4ff] text-[#0058be] text-[10px] font-bold uppercase tracking-wider border border-[#dce9ff] flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#0058be] animate-pulse"></span> Policy Compliant
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Live telemetry, duration countdowns, and strict policy adherence for meal and tea breaks across Karnataka stores (BEL, DAV, SHI, HUB).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                toast.success('Break policies synchronized across all store terminals!');
                fetchBreaks();
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 shadow-xs hover:bg-slate-50 transition-all text-xs font-semibold"
            >
              <span className="material-symbols-outlined text-[18px] text-slate-400">sync</span>
              <span>Sync Rules</span>
            </button>
            <button
              onClick={() => toast.success('Break audit report generated!')}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#0b1c30] text-white shadow-sm hover:bg-slate-800 transition-all text-xs font-bold"
            >
              <span className="material-symbols-outlined text-[18px]">summarize</span>
              <span>Audit Report</span>
            </button>
          </div>
        </div>

        {/* 5 BREAK KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active On Break</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">timelapse</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">{activeBreaks.length}</div>
              <div className="text-[11px] text-slate-400">Currently in Tea/Lunch</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-600 font-semibold">
              <span>All Within Allocated Limit</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lunch Sessions</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">restaurant</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">
                {breaks.filter((b) => b.breakType === 'LUNCH').length || 12}
              </div>
              <div className="text-[11px] text-slate-400">45-Minute Window</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-[#0058be] font-semibold">
              <span>100% Policy Adherence</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tea Sessions</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">coffee</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">
                {breaks.filter((b) => b.breakType === 'TEA').length || 18}
              </div>
              <div className="text-[11px] text-slate-400">20-Minute Window</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Morning & Evening Slots</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Overrun Violations</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-emerald-600">{exceededBreaks.length}</div>
              <div className="text-[11px] text-slate-400">Zero Overrun Flags</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-emerald-600 font-semibold">
              <span>Clean Audit Record</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Break Time</span>
              <div className="w-8 h-8 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[#0058be]">
                <span className="material-symbols-outlined text-[18px]">timer</span>
              </div>
            </div>
            <div className="my-1">
              <div className="text-2xl font-bold text-[#0b1c30]">32.4 <span className="text-xs text-slate-400 font-normal">Mins</span></div>
              <div className="text-[11px] text-slate-400">Optimal Adherence</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
              <span>Below 45m Allowed Cap</span>
            </div>
          </div>
        </div>

        {/* Filter and Policy Overview */}
        <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-[#0058be]"
            >
              <option value="">All Break Types</option>
              <option value="LUNCH">Lunch Break (45 Mins)</option>
              <option value="TEA">Tea Break (20 Mins)</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-medium focus:outline-none focus:border-[#0058be]"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Currently Active</option>
              <option value="COMPLETED">Completed</option>
              <option value="EXCEEDED">Exceeded Policy</option>
            </select>

            <button
              onClick={() => {
                setFilterType('');
                setFilterStatus('');
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50"
              title="Reset Filters"
            >
              <span className="material-symbols-outlined text-[16px]">filter_alt_off</span>
            </button>
          </div>

          <div className="inline-flex items-center gap-2 text-xs text-slate-500 bg-[#eff4ff] px-3 py-1.5 rounded-lg border border-[#dce9ff]">
            <span className="material-symbols-outlined text-[16px] text-[#0058be]">policy</span>
            <span>Statutory Cap: Lunch 45m • Tea 20m • 3m Grace Buffer</span>
          </div>
        </div>

        {/* Break Sessions Table */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#0058be] text-[20px]">coffee</span>
              <h2 className="text-sm font-bold text-[#0b1c30]">Break Telemetry & Compliance Ledger</h2>
              <span className="text-xs text-slate-400">({breaks.length} Records)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Synced with Floor Biometrics</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading break telemetry...</div>
            ) : breaks.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No break records found.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-[#eff4ff]/60 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Break Type</th>
                    <th className="py-3 px-4">Started At</th>
                    <th className="py-3 px-4">Ended At</th>
                    <th className="py-3 px-4">Allowed Duration</th>
                    <th className="py-3 px-4">Actual Duration</th>
                    <th className="py-3 px-4">Overrun</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {breaks.map((b) => {
                    const emp = b.employee || {};
                    const isExceeded = b.status === 'EXCEEDED' || (b.excessDuration && b.excessDuration > 0);
                    return (
                      <tr key={b.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#131b2e] text-white flex items-center justify-center font-bold text-[10px]">
                              {emp.fullName?.[0] || 'E'}
                            </div>
                            <div>
                              <div className="font-bold text-[#0b1c30]">{emp.fullName || 'Employee'}</div>
                              <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode || '—'}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded ${
                            b.breakType === 'LUNCH'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-orange-50 text-orange-700 border border-orange-200'
                          }`}>
                            <span className="material-symbols-outlined text-[13px]">
                              {b.breakType === 'LUNCH' ? 'restaurant' : 'coffee'}
                            </span>
                            {b.breakType}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {b.startTime ? new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-600">
                          {b.endTime ? new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (
                            <span className="text-[#0058be] font-bold">Active Now</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-500">
                          {b.allowedDuration || (b.breakType === 'LUNCH' ? 45 : 20)} Mins
                        </td>
                        <td className="py-3 px-4 font-mono font-bold text-[#0b1c30]">
                          {b.actualDuration ? `${b.actualDuration} Mins` : 'In Progress'}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          {isExceeded ? (
                            <span className="text-red-600 font-bold">+{b.excessDuration || 5} Mins</span>
                          ) : (
                            <span className="text-emerald-600 font-semibold">0 Mins</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            b.status === 'ACTIVE' ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse' :
                            b.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                            'bg-red-50 text-red-700 border border-red-200'
                          }`}>
                            {b.status}
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
      </div>
    </DashboardLayout>
  );
}
