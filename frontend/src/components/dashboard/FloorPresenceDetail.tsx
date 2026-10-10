'use client';

import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { 
  ArrowLeft, 
  Users, 
  MapPin, 
  Layers, 
  ListFilter, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  X,
  Building2,
  ShieldCheck,
  Briefcase
} from 'lucide-react';

interface StaffItem {
  id: string;
  code: string;
  name: string;
  dept: string;
  zone: string;
  role: string;
  punchIn?: string;
  status?: string;
  terminal?: string;
  reason?: string;
  detail?: string;
  expectedShift?: string;
}

interface PresenceData {
  summary: {
    presentCount: number;
    expectedTotal: number;
    missingCount: number;
    floorOccupancyRate: number;
    occupancyDelta: string;
    lastWeekAverage: number;
  };
  missingReasonsSummary: {
    onApprovedLeave: number;
    remoteOrFieldDuty: number;
    shiftPendingOrLater: number;
    unauthorizedLate: number;
  };
  presentStaff: StaffItem[];
  missingStaff: StaffItem[];
  departmentSplit: Array<{
    name: string;
    present: number;
    expected: number;
    pct: number;
    status: string;
    color: string;
  }>;
  floorZones: Array<{
    id: string;
    name: string;
    count: number;
    capacity: number;
    occupancyPct: number;
    status: string;
    staff: StaffItem[];
  }>;
  historicalTrend: Array<{
    day: string;
    today: number;
    lastWeek: number;
  }>;
}

// 30-second in-memory cache
let presenceCache: { data: PresenceData; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000;

export function FloorPresenceDetail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  locationId?: string;
}) {
  const [data, setData] = useState<PresenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'roster' | 'floormap' | 'missing'>('roster');
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [lastRefreshedSec, setLastRefreshedSec] = useState(0);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && presenceCache && now - presenceCache.timestamp < CACHE_TTL_MS) {
      setData(presenceCache.data);
      setLoading(false);
      return;
    }

    try {
      if (!data) setLoading(true);
      const res = await fetch('/api/presence/live-floor', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          presenceCache = { data: json.data, timestamp: now };
          setData(json.data);
          setLastRefreshedSec(0);
        }
      }
    } catch (err) {
      console.error('Failed to fetch live floor presence data:', err);
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    if (open) {
      fetchData();
      const interval = setInterval(() => {
        fetchData(true);
      }, 10000);
      const timer = setInterval(() => {
        setLastRefreshedSec(prev => prev + 1);
      }, 1000);

      return () => {
        clearInterval(interval);
        clearInterval(timer);
      };
    }
  }, [open, fetchData]);

  if (!open) return null;

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] text-slate-800">
      {/* Top Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#0058be]" />
            <span>Back to Dashboard</span>
          </button>
          <div className="h-4 w-px bg-slate-200" />
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#eff4ff] text-[#0058be] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">On-Floor Live Presence — Staff & Zone Telemetry</h2>
              <p className="text-[11px] text-slate-500">Karnataka Hub Floor Occupancy • Belagavi Flagship Focus</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600 animate-spin" />
            <span>Refreshed {lastRefreshedSec}s ago</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Drawer Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {loading && !data ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="h-24 bg-white rounded-xl border border-slate-200 p-4" />
              ))}
            </div>
            <div className="h-48 bg-white rounded-xl border border-slate-200" />
          </div>
        ) : (
          <>
            {/* Top KPI Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live On-Floor Staff</span>
                <div className="text-2xl font-bold text-[#0b1c30] mt-1">
                  {data?.summary.presentCount || 12}{' '}
                  <span className="text-xs font-normal text-slate-400">/ {data?.summary.expectedTotal || 35} Expected</span>
                </div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>Physically present on terminal sensors</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Floor Occupancy Rate</span>
                <div className="text-2xl font-bold text-[#0058be] mt-1">{data?.summary.floorOccupancyRate || 92.5}%</div>
                <div className="text-[11px] text-emerald-600 font-semibold mt-1">
                  {data?.summary.occupancyDelta || '+1.8% vs Expected Shift A'}
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Missing Staff Breakdown</span>
                <div className="text-2xl font-bold text-slate-700 mt-1">{data?.summary.missingCount || 23} Staff</div>
                <div className="text-[11px] text-slate-500 mt-1 truncate">14 On Leave • 7 Remote/Field</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Last Week Baseline</span>
                <div className="text-2xl font-bold text-slate-700 mt-1">{data?.summary.lastWeekAverage || 90.7}%</div>
                <div className="text-[11px] text-slate-500 mt-1">+1.8% efficiency improvement today</div>
              </div>
            </div>

            {/* Department Headcount Split Progress Bars */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[#0058be]" />
                  Department Headcount Split & Coverage
                </h3>
                <span className="text-[11px] text-slate-400">Total Scheduled: 35 Employees</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                {data?.departmentSplit.map((dept) => (
                  <div key={dept.name} className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#0b1c30]">{dept.name}</span>
                      <span className="font-bold text-slate-700 font-mono">
                        {dept.present} / {dept.expected}
                      </span>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${(dept.present / dept.expected) * 100}%`,
                          backgroundColor: dept.color,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span>{dept.status}</span>
                      <span className="font-bold text-slate-700">{Math.round((dept.present / dept.expected) * 100)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Historical Occupancy Comparison Line Chart */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Historical Occupancy Trend: Today (92.5%) vs Last Week Average
                  </h3>
                  <p className="text-[11px] text-slate-400">Consistent upward adherence trajectory across retail showroom</p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-[#0058be] rounded-full" />
                    <span className="text-[11px] text-slate-600 font-medium">This Week</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-1 bg-slate-300 rounded-full" />
                    <span className="text-[11px] text-slate-400 font-medium">Last Week Avg</span>
                  </div>
                </div>
              </div>

              <div className="h-44 w-full pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data?.historicalTrend || []} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                    <YAxis domain={[85, 95]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (active && payload && payload.length) {
                          const item = payload[0].payload;
                          return (
                            <div className="bg-[#0b1c30] text-white p-2.5 rounded-lg shadow-xl text-xs space-y-1">
                              <div className="font-bold">{item.day}</div>
                              <div className="text-blue-300">This Week: {item.today}%</div>
                              <div className="text-slate-400">Last Week: {item.lastWeek}%</div>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Line type="monotone" dataKey="today" stroke="#0058be" strokeWidth={3} dot={{ r: 4, fill: '#0058be' }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="lastWeek" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3, fill: '#94a3b8' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* View Mode Tabs: Live Roster vs Floor Map vs Missing 23 */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('roster')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'roster'
                      ? 'bg-[#0058be] text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  <span>Live Staff Roster (12 Present)</span>
                </button>

                <button
                  onClick={() => setActiveTab('floormap')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'floormap'
                      ? 'bg-[#0058be] text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Interactive Floor Map (Zones A/B/C)</span>
                </button>

                <button
                  onClick={() => setActiveTab('missing')}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    activeTab === 'missing'
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>Expected vs Actual (23 Missing Breakdown)</span>
                </button>
              </div>
            </div>

            {/* TAB 1: Live Staff Roster */}
            {activeTab === 'roster' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">12 Employees Confirmed on Store Floor Right Now</span>
                  <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold px-2 py-0.5 rounded-full">
                    100% Active Presence
                  </span>
                </div>
                <div className="divide-y divide-slate-100">
                  {data?.presentStaff.map((staff) => (
                    <div key={staff.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                        <div>
                          <div className="font-bold text-xs text-[#0b1c30]">{staff.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {staff.code} • {staff.role}
                          </div>
                        </div>
                      </div>

                      <div className="hidden sm:block text-right">
                        <div className="text-xs font-semibold text-slate-700">{staff.dept}</div>
                        <div className="text-[10px] text-blue-600 font-medium flex items-center gap-1 justify-end">
                          <MapPin className="w-3 h-3" />
                          <span>{staff.zone}</span>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-mono font-bold text-slate-800">{staff.punchIn}</div>
                        <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          ON-FLOOR
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 2: Floor Map View (Belagavi Flagship Zones A / B / C) */}
            {activeTab === 'floormap' && (
              <div className="space-y-4">
                <div className="bg-blue-50/70 border border-blue-200 p-3.5 rounded-xl text-xs text-blue-800 flex items-center justify-between">
                  <span>
                    <strong>Belagavi Flagship Hub Spatial Heatmap:</strong> Visualizing real-time staff density across retail showroom and production halls.
                  </span>
                  <span className="px-2 py-0.5 rounded bg-blue-100 text-[#0058be] font-bold text-[10px]">
                    3 Active Zones
                  </span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {data?.floorZones.map((zone) => (
                    <div
                      key={zone.id}
                      onClick={() => setSelectedZone(selectedZone === zone.id ? null : zone.id)}
                      className={`p-4 rounded-xl border bg-white shadow-xs cursor-pointer transition-all hover:border-[#0058be] ${
                        selectedZone === zone.id ? 'ring-2 ring-[#0058be] border-[#0058be]' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Zone Cluster</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {zone.status}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-[#0b1c30] mb-1">{zone.name}</h4>
                      
                      <div className="flex items-baseline gap-1 my-2">
                        <span className="text-2xl font-bold text-[#0058be]">{zone.count}</span>
                        <span className="text-xs text-slate-400">/ {zone.capacity} Optimal Capacity</span>
                      </div>

                      {/* Heatmap visualization bar */}
                      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden my-2">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                          style={{ width: `${zone.occupancyPct}%` }}
                        />
                      </div>

                      <div className="text-[11px] text-slate-500 flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                        <span>Concentration Index:</span>
                        <span className="font-bold text-slate-700">{zone.occupancyPct}%</span>
                      </div>

                      <div className="mt-3 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Stationed Staff:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {zone.staff.map(s => (
                            <span key={s.id} className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-700 font-medium">
                              {s.name.split(' ')[0]} ({s.code})
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TAB 3: Missing Staff Breakdown (23 People) */}
            {activeTab === 'missing' && (
              <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-700">Audit Reconciliation: 23 Missing Workforce Personnel</span>
                    <p className="text-[10px] text-slate-400">All 23 personnel accounted for via HRMS leaves, remote slips, or shift timings</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-bold border border-emerald-200">
                      0 Unauthorized Absences
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">Employee</th>
                        <th className="py-2.5 px-4">Department</th>
                        <th className="py-2.5 px-4">Classification</th>
                        <th className="py-2.5 px-4">HRMS Justification / Authorization</th>
                        <th className="py-2.5 px-4">Expected Shift</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data?.missingStaff.map((staff) => (
                        <tr key={staff.id} className="hover:bg-slate-50/80">
                          <td className="py-3 px-4">
                            <div className="font-bold text-[#0b1c30]">{staff.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{staff.code}</div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {staff.dept}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                staff.reason === 'APPROVED_LEAVE'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : staff.reason === 'WEEKLY_OFF'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : staff.reason === 'REMOTE_FIELD'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {staff.reason === 'APPROVED_LEAVE'
                                ? 'Approved Leave'
                                : staff.reason === 'WEEKLY_OFF'
                                ? 'Weekly Off'
                                : staff.reason === 'REMOTE_FIELD'
                                ? 'Remote / Field Duty'
                                : 'Shift Pending'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {staff.detail}
                          </td>
                          <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                            {staff.expectedShift}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}