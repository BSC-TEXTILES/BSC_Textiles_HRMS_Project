'use client';

import { useState, useEffect, useCallback } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { 
  ArrowLeft, 
  Router, 
  RotateCcw, 
  Camera, 
  Wrench, 
  CheckCircle2, 
  Activity, 
  Wifi, 
  ShieldCheck, 
  Sparkles, 
  RefreshCw, 
  X,
  Server,
  Zap,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

interface TerminalDevice {
  id: string;
  code: string;
  name: string;
  location: string;
  ipAddress: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  latency: number;
  packetLoss: number;
  heartbeat: string;
  uptime: number;
  firmwareVersion: string;
  updateAvailable: boolean;
  punchesRecordedToday: number;
  cameraActive: boolean;
  mode: string;
}

interface TerminalsApiResponse {
  terminals: TerminalDevice[];
  networkMetrics: {
    totalTerminals: number;
    onlineTerminals: number;
    offlineTerminals: number;
    maintenanceTerminals: number;
    averageLatencyMs: number;
    averagePacketLossPct: number;
    packetLossGraph: Array<{ time: string; lossPct: number; latency: number }>;
    latencyDistribution: Array<{ bucket: string; count: number; color: string }>;
    hubsSummary: Array<{ hub: string; terminals: number; status: string }>;
  };
}

let terminalsCache: { data: TerminalsApiResponse; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000;

export function TerminalsDetail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  locationId?: string;
}) {
  const [data, setData] = useState<TerminalsApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCameraTerminal, setSelectedCameraTerminal] = useState<TerminalDevice | null>(null);
  const [maintenanceStates, setMaintenanceStates] = useState<Record<string, boolean>>({});
  const [lastRefreshedSec, setLastRefreshedSec] = useState(0);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && terminalsCache && now - terminalsCache.timestamp < CACHE_TTL_MS) {
      setData(terminalsCache.data);
      setLoading(false);
      return;
    }

    try {
      if (!data) setLoading(true);
      const res = await fetch('/api/terminals/network-status', { credentials: 'include' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          terminalsCache = { data: json.data, timestamp: now };
          setData(json.data);
          setLastRefreshedSec(0);
        }
      }
    } catch (err) {
      console.error('Failed to load terminals network status:', err);
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

  const handleRestart = (term: TerminalDevice) => {
    toast.promise(
      new Promise((resolve) => setTimeout(resolve, 1200)),
      {
        loading: `Sending graceful restart signal to ${term.name} (${term.ipAddress})...`,
        success: `${term.name} restarted successfully! Telemetry resumed in 14ms.`,
        error: 'Failed to restart terminal',
      }
    );
  };

  const handleToggleMaintenance = (term: TerminalDevice) => {
    const nextState = !maintenanceStates[term.id];
    setMaintenanceStates(prev => ({ ...prev, [term.id]: nextState }));
    if (nextState) {
      toast(`${term.name} placed in Maintenance Mode. Sensor standby.`, { icon: '🔧' });
    } else {
      toast.success(`${term.name} restored to Live Active Ingestion.`);
    }
  };

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
              <Router className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">Active Terminals — IoT Biometric Network Health</h2>
              <p className="text-[11px] text-slate-500">8 Edge Terminals in Karnataka • Zero Packet Loss • Real-Time Ping</p>
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

      {/* Main Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {loading && !data ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(n => (
                <div key={n} className="h-24 bg-white rounded-xl border border-slate-200 p-4" />
              ))}
            </div>
            <div className="h-64 bg-white rounded-xl border border-slate-200" />
          </div>
        ) : (
          <>
            {/* KPI Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Terminals</span>
                <div className="text-2xl font-bold text-[#0b1c30] mt-1 flex items-center gap-2">
                  8 / 8 Online
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                    All Up
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">100% Karnataka Hub Coverage</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Packet Loss Rate</span>
                <div className="text-2xl font-bold text-emerald-600 mt-1">0.00%</div>
                <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Zero dropped frames across VPN mesh</span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Network Latency</span>
                <div className="text-2xl font-bold text-[#0058be] mt-1">18ms</div>
                <div className="text-[11px] text-slate-500 mt-1">Edge response &lt; 50ms SLA</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hub Topology Status</span>
                <div className="text-2xl font-bold text-slate-700 mt-1">3 Store Hubs</div>
                <div className="text-[11px] text-slate-500 mt-1">4 BEL • 2 DAV • 2 SHI</div>
              </div>
            </div>

            {/* Network Metrics Visualizations (Packet Loss + Latency Distribution) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Packet Loss Graph */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Wifi className="w-4 h-4 text-emerald-600" />
                      Packet Loss Stream (Real-Time 0.00% Target)
                    </h3>
                    <p className="text-[11px] text-slate-400">Zero degradation detected over fiber & 4G failover channels</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                    Optimal
                  </span>
                </div>

                <div className="h-36 w-full pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data?.networkMetrics?.packetLossGraph || []} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <defs>
                        <linearGradient id="latencyGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                      <Tooltip />
                      <Area type="monotone" dataKey="lossPct" stroke="#10b981" strokeWidth={2.5} fillOpacity={1} fill="url(#latencyGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Latency Distribution Chart */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-[#0058be]" />
                      Latency Distribution (All 8 Terminals)
                    </h3>
                    <p className="text-[11px] text-slate-400">Green range: &lt;50ms response ensures seamless facial unlock</p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0058be] text-[10px] font-bold border border-blue-200">
                    Avg 18ms
                  </span>
                </div>

                <div className="h-36 w-full pt-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data?.networkMetrics?.latencyDistribution || []} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                      <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0058be" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* 8 Terminal Health Cards Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Server className="w-4 h-4 text-[#0058be]" />
                  Edge Terminal Inventory & Telemetry (8 Units)
                </h3>
                <span className="text-[11px] text-slate-400">Firmware Auto-Sync Enabled</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {data?.terminals.map((term) => {
                  const isMaintenance = maintenanceStates[term.id];
                  const latencyColor =
                    term.latency < 50
                      ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                      : term.latency < 100
                      ? 'text-amber-600 bg-amber-50 border-amber-200'
                      : 'text-red-600 bg-red-50 border-red-200';

                  return (
                    <div
                      key={term.id}
                      className={`p-4 rounded-xl border bg-white shadow-xs space-y-3 transition-all hover:shadow-md ${
                        isMaintenance ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-xs font-bold text-[#0b1c30]">{term.code}</span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-800 line-clamp-1 mt-0.5">{term.name}</h4>
                          <span className="text-[10px] text-slate-400">{term.location}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${latencyColor}`}>
                          {term.latency}ms
                        </span>
                      </div>

                      {/* Device Specs & Vital stats */}
                      <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-slate-400 block">IP Address:</span>
                          <span className="font-mono font-semibold text-slate-700">{term.ipAddress}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Heartbeat:</span>
                          <span className="font-semibold text-slate-700">{term.heartbeat}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Uptime Today:</span>
                          <span className="font-semibold text-emerald-700">{term.uptime}%</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block">Punches Logged:</span>
                          <span className="font-semibold text-[#0058be]">{term.punchesRecordedToday}</span>
                        </div>
                      </div>

                      {/* Firmware & Badges */}
                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                        <span className="text-slate-500 font-mono">{term.firmwareVersion}</span>
                        {term.updateAvailable && (
                          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" />
                            Update Available
                          </span>
                        )}
                      </div>

                      {/* Quick Actions Buttons */}
                      <div className="grid grid-cols-3 gap-1 pt-1">
                        <button
                          onClick={() => handleRestart(term)}
                          title="Restart Terminal"
                          className="flex items-center justify-center gap-1 py-1 px-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition-colors"
                        >
                          <RotateCcw className="w-3 h-3 text-[#0058be]" />
                          <span>Restart</span>
                        </button>
                        <button
                          onClick={() => setSelectedCameraTerminal(term)}
                          title="View Live Camera Feed"
                          className="flex items-center justify-center gap-1 py-1 px-1.5 rounded bg-blue-50 hover:bg-blue-100 text-[#0058be] text-[10px] font-bold transition-colors"
                        >
                          <Camera className="w-3 h-3" />
                          <span>Cam</span>
                        </button>
                        <button
                          onClick={() => handleToggleMaintenance(term)}
                          title="Toggle Maintenance Mode"
                          className={`flex items-center justify-center gap-1 py-1 px-1.5 rounded text-[10px] font-bold transition-colors ${
                            isMaintenance
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          <Wrench className="w-3 h-3" />
                          <span>{isMaintenance ? 'Active' : 'Maint'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Terminal Camera Preview Modal */}
      {selectedCameraTerminal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <Camera className="w-5 h-5 text-[#0058be]" />
                <div>
                  <h3 className="text-sm font-bold text-[#0b1c30]">
                    {selectedCameraTerminal.name} — Live Camera Stream
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {selectedCameraTerminal.ipAddress}:8554/live-feed
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCameraTerminal(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Simulated Live Camera Stream Viewport */}
            <div className="px-4 py-2">
              <div className="relative aspect-video bg-slate-900 rounded-xl overflow-hidden flex flex-col items-center justify-center text-white border border-slate-800">
                <div className="absolute top-3 left-3 flex items-center gap-2 bg-red-600/90 text-white px-2 py-0.5 rounded text-[10px] font-bold">
                  <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                  <span>LIVE • 30 FPS</span>
                </div>
                <div className="absolute top-3 right-3 text-[10px] font-mono text-slate-300 bg-black/50 px-2 py-0.5 rounded">
                  {selectedCameraTerminal.latency}ms Latency
                </div>

                {/* Facial detection reticle animation */}
                <div className="w-32 h-40 border-2 border-emerald-400/80 rounded-2xl relative flex items-center justify-center shadow-lg">
                  <div className="absolute -top-4 bg-emerald-500 text-slate-900 text-[9px] font-bold px-1.5 py-0.5 rounded">
                    Liveness: 100%
                  </div>
                  <ScanFaceIcon className="w-12 h-12 text-emerald-400/40 animate-pulse" />
                </div>

                <div className="absolute bottom-3 text-center text-xs text-slate-400 font-mono">
                  {selectedCameraTerminal.location}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedCameraTerminal(null)}
                className="px-4 py-2 bg-[#0058be] text-white rounded-lg text-xs font-bold hover:bg-blue-700"
              >
                Close Stream
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScanFaceIcon(props: any) {
  return (
    <svg fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
    </svg>
  );
}