'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { 
  ArrowLeft, 
  Router, 
  RotateCcw, 
  Camera, 
  Wrench, 
  CheckCircle2, 
  Wifi, 
  Sparkles, 
  RefreshCw, 
  X,
  Server,
  Zap,
  AlertTriangle,
  AlertCircle,
  Network
} from 'lucide-react';
import toast from 'react-hot-toast';

export type ActiveSummaryCard = 'terminals' | 'packetLoss' | 'latency' | 'topology' | null;

interface TerminalDevice {
  id: string;
  code: string;
  name: string;
  location: string;
  ipAddress: string;
  port?: number;
  serialNumber?: string;
  status: 'ONLINE' | 'OFFLINE' | 'MAINTENANCE';
  /** null when the terminal did not answer the latest probe */
  latency: number | null;
  /** null when no loss figure is available for the terminal */
  packetLoss: number | null;
  heartbeat: string;
  /**
   * Uptime is not measured anywhere in this stack — no probe keeps an online-time
   * window per terminal — so the UI never asserts a percentage for it.
   */
  uptime?: number | null;
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
    averageLatencyMs: number | null;
    averagePacketLossPct: number | null;
    packetLossGraph: Array<{ time: string; lossPct: number; latency: number }>;
    latencyDistribution: Array<{ bucket: string; count: number; color: string }>;
    hubsSummary: Array<{ hub: string; terminals: number; status: string }>;
    packetsSent?: number;
    packetsReceived?: number;
    packetsDropped?: number;
  };
}


// Nothing is displayed when the network-status probe is unavailable: the empty
// shape below carries no demonstration terminals, latency or packet-loss figures.
const EMPTY_TERMINALS_DATA: TerminalsApiResponse = {
  terminals: [],
  networkMetrics: {
    totalTerminals: 0,
    onlineTerminals: 0,
    offlineTerminals: 0,
    maintenanceTerminals: 0,
    averageLatencyMs: null,
    averagePacketLossPct: null,
    packetLossGraph: [],
    latencyDistribution: [],
    hubsSummary: [],
  },
};

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
  const [data, setData] = useState<TerminalsApiResponse | null>(terminalsCache?.data || null);
  const [loading, setLoading] = useState(true);
  const [selectedCameraTerminal, setSelectedCameraTerminal] = useState<TerminalDevice | null>(null);
  const [maintenanceStates, setMaintenanceStates] = useState<Record<string, boolean>>({});
  const [lastRefreshedSec, setLastRefreshedSec] = useState(0);
  const [isMounted, setIsMounted] = useState(false);
  const [selectedCard, setSelectedCard] = useState<ActiveSummaryCard>(null);
  const dataRef = useRef<TerminalsApiResponse | null>(data);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && terminalsCache && now - terminalsCache.timestamp < CACHE_TTL_MS) {
      setData(terminalsCache.data);
      setLoading(false);
      return;
    }

    try {
      if (!dataRef.current) setLoading(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/terminals/network-status', {
        signal: controller.signal,
      }).catch(() => null);

      clearTimeout(timeoutId);

      if (res && res.ok) {
        const text = await res.text().catch(() => '');
        let json: any = null;
        try {
          if (text && text.trim().length > 0) {
            json = JSON.parse(text);
          }
        } catch {
          json = null;
        }
        if (json?.success && json?.data) {
          terminalsCache = { data: json.data, timestamp: now };
          setData(json.data);
          setLastRefreshedSec(0);
          return;
        }
      }

      // No probe result: keep any cached snapshot, otherwise show the empty shape.
      if (!dataRef.current) {
        const fallback = terminalsCache?.data || EMPTY_TERMINALS_DATA;
        terminalsCache = { data: fallback, timestamp: now };
        setData(fallback);
      }
    } catch {
      // Network failure — same behaviour, never a synthetic terminal fleet.
      if (!dataRef.current) {
        const fallback = terminalsCache?.data || EMPTY_TERMINALS_DATA;
        terminalsCache = { data: fallback, timestamp: now };
        setData(fallback);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
    // There is no remote-restart endpoint in this deployment; the terminal
    // firmware is managed on-device. Report that instead of faking a restart.
    toast(`${term.name}: remote restart is not supported by this deployment.`);
  };

  const handleToggleMaintenance = (term: TerminalDevice) => {
    const nextState = !maintenanceStates[term.id];
    setMaintenanceStates(prev => ({ ...prev, [term.id]: nextState }));
    if (nextState) {
      toast(`${term.name} marked for maintenance in this view. The device itself is not changed.`);
    } else {
      toast.success(`${term.name} unmarked in this view.`);
    }
  };

  const handleCardClick = (card: ActiveSummaryCard) => {
    setSelectedCard(prev => (prev === card ? null : card));
  };

  const handleCardKeyDown = (e: React.KeyboardEvent, card: ActiveSummaryCard) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleCardClick(card);
    }
  };

  if (!open) return null;

  // Derived metrics for synchronized details
  const terminalsList = data?.terminals || [];
  const latencies = terminalsList.map(t => t.latency).filter(l => typeof l === 'number');
  const minLatency = latencies.length > 0 ? Math.min(...latencies) : null;
  const maxLatency = latencies.length > 0 ? Math.max(...latencies) : null;
  const reportedLatencies = terminalsList
    .map((t) => (typeof t.latency === 'number' ? t.latency : null))
    .filter((v): v is number => v !== null);
  const avgLatency =
    data?.networkMetrics?.averageLatencyMs ??
    (reportedLatencies.length > 0
      ? Math.round(reportedLatencies.reduce((a, b) => a + b, 0) / reportedLatencies.length)
      : null);
  const avgPacketLoss = data?.networkMetrics?.averagePacketLossPct ?? null;
  const measuredLossTerminals = terminalsList.filter(t => typeof t.packetLoss === 'number');

  const acceptableLossThreshold = 1.0;
  const exceedingLossTerminals = terminalsList.filter(
    t => typeof t.packetLoss === 'number' && t.packetLoss > acceptableLossThreshold
  );

  const slaStatus =
    avgLatency === null
      ? 'Unknown'
      : avgLatency < 50
      ? 'Healthy'
      : avgLatency <= 100
      ? 'Warning'
      : 'Degraded';

  const degradedOrDisconnected = terminalsList.filter(
    t => t.status === 'OFFLINE' || (typeof t.latency === 'number' && t.latency > 100)
  );

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
              <p className="text-[11px] text-slate-500">
                {terminalsList.length === 0
                  ? 'No terminals reported by the network probe yet'
                  : `${terminalsList.length} terminal(s) probed • ${data?.networkMetrics?.onlineTerminals ?? 0} reachable`}
              </p>
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
            aria-label="Close modal"
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
            {/* KPI Metrics Strip - Interactive Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Card 1: Active Terminals */}
              <button
                type="button"
                onClick={() => handleCardClick('terminals')}
                onKeyDown={(e) => handleCardKeyDown(e, 'terminals')}
                aria-pressed={selectedCard === 'terminals'}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 ${
                  selectedCard === 'terminals'
                    ? 'bg-blue-50/40 border-[#0058be] ring-2 ring-[#0058be] shadow-sm'
                    : 'bg-white border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Terminals</span>
                  {selectedCard === 'terminals' && (
                    <span className="text-[9px] font-bold text-[#0058be] bg-blue-100/70 px-1.5 py-0.5 rounded">Selected</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-[#0b1c30] mt-1 flex items-center gap-2">
                  {data?.networkMetrics?.onlineTerminals ?? 0} / {data?.networkMetrics?.totalTerminals ?? 0} Online
                  <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                    {terminalsList.length === 0
                      ? 'No probe data'
                      : (data?.networkMetrics?.offlineTerminals ?? 0) === 0
                      ? 'All reachable'
                      : 'Partial'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {terminalsList.length === 0
                    ? 'No registered terminals to probe'
                    : `Live TCP probe of ${terminalsList.length} registered terminal(s)`}
                </div>
              </button>

              {/* Card 2: Packet Loss Rate */}
              <button
                type="button"
                onClick={() => handleCardClick('packetLoss')}
                onKeyDown={(e) => handleCardKeyDown(e, 'packetLoss')}
                aria-pressed={selectedCard === 'packetLoss'}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 ${
                  selectedCard === 'packetLoss'
                    ? 'bg-blue-50/40 border-[#0058be] ring-2 ring-[#0058be] shadow-sm'
                    : 'bg-white border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Packet Loss Rate</span>
                  {selectedCard === 'packetLoss' && (
                    <span className="text-[9px] font-bold text-[#0058be] bg-blue-100/70 px-1.5 py-0.5 rounded">Selected</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-emerald-600 mt-1">
                  {data?.networkMetrics?.averagePacketLossPct != null ? `${data.networkMetrics.averagePacketLossPct.toFixed(2)}%` : 'Not measured'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {data?.networkMetrics?.averagePacketLossPct != null
                      ? `${data.networkMetrics.averagePacketLossPct.toFixed(2)}% measured fleet average`
                      : 'Packet loss is not measured by the current probe'}
                  </span>
                </div>
              </button>

              {/* Card 3: Average Network Latency */}
              <button
                type="button"
                onClick={() => handleCardClick('latency')}
                onKeyDown={(e) => handleCardKeyDown(e, 'latency')}
                aria-pressed={selectedCard === 'latency'}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 ${
                  selectedCard === 'latency'
                    ? 'bg-blue-50/40 border-[#0058be] ring-2 ring-[#0058be] shadow-sm'
                    : 'bg-white border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Average Network Latency</span>
                  {selectedCard === 'latency' && (
                    <span className="text-[9px] font-bold text-[#0058be] bg-blue-100/70 px-1.5 py-0.5 rounded">Selected</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-[#0058be] mt-1">
                  {data?.networkMetrics?.averageLatencyMs != null ? `${data.networkMetrics.averageLatencyMs}ms` : 'Not measured'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Ping measured by the network probe</div>
              </button>

              {/* Card 4: Hub Topology Status */}
              <button
                type="button"
                onClick={() => handleCardClick('topology')}
                onKeyDown={(e) => handleCardKeyDown(e, 'topology')}
                aria-pressed={selectedCard === 'topology'}
                className={`p-4 rounded-xl border text-left cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-[#0058be]/40 ${
                  selectedCard === 'topology'
                    ? 'bg-blue-50/40 border-[#0058be] ring-2 ring-[#0058be] shadow-sm'
                    : 'bg-white border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Hub Topology Status</span>
                  {selectedCard === 'topology' && (
                    <span className="text-[9px] font-bold text-[#0058be] bg-blue-100/70 px-1.5 py-0.5 rounded">Selected</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-slate-700 mt-1">
                  {data?.networkMetrics?.hubsSummary?.length ?? 0} Store Hubs
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {(data?.networkMetrics?.hubsSummary || []).length > 0
                    ? (data?.networkMetrics?.hubsSummary || []).map((h) => `${h.hub}: ${h.terminals}`).join(' • ')
                    : 'No hub topology reported'}
                </div>
              </button>
            </div>

            {/* If a card is selected: Focused Detail View */}
            {selectedCard !== null ? (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Navigation bar to return to default Network Health overview */}
                <div className="flex items-center justify-between bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-xs">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400 font-medium">Focused View:</span>
                    <span className="font-bold text-[#0058be]">
                      {selectedCard === 'terminals' && 'Active Terminals Status & Inventory'}
                      {selectedCard === 'packetLoss' && 'Packet Loss Rate & Stream Diagnostics'}
                      {selectedCard === 'latency' && 'Average Network Latency & SLA Distribution'}
                      {selectedCard === 'topology' && 'Hub Topology & Mesh Connection Status'}
                    </span>
                    <span className="text-slate-300 hidden sm:inline">•</span>
                    <span className="text-[11px] text-slate-500 hidden sm:inline">
                      Click the card again or use the button to return
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedCard(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-[#0058be] bg-blue-50 hover:bg-blue-100 border border-blue-200/60 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Back to Overview</span>
                  </button>
                </div>

                {/* DETAIL 1: ACTIVE TERMINALS */}
                {selectedCard === 'terminals' && (
                  <div className="space-y-4">
                    {/* Summary Strip */}
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div>
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <Server className="w-4 h-4 text-[#0058be]" />
                          Terminal-Level Hardware Telemetry
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Real-time probe latency, IP addresses, and daily punch ingestion per terminal
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-bold border border-emerald-200 text-[11px]">
                          {data?.networkMetrics?.onlineTerminals ?? 0} Online
                        </span>
                        <span className="px-2.5 py-1 rounded-md bg-slate-50 text-slate-600 font-semibold border border-slate-200 text-[11px]">
                          {data?.networkMetrics?.offlineTerminals ?? 0} Offline
                        </span>
                        <span className="px-2.5 py-1 rounded-md bg-amber-50 text-amber-700 font-semibold border border-amber-200 text-[11px]">
                          {data?.networkMetrics?.maintenanceTerminals ?? 0} Maintenance
                        </span>
                      </div>
                    </div>

                    {/* Terminal List Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {terminalsList.map((term, idx) => {
                        const isMaintenance = maintenanceStates[term.id];
                        const isOnline = term.status === 'ONLINE';
                        const latencyColor =
                          typeof term.latency !== 'number'
                            ? 'text-slate-500 bg-slate-50 border-slate-200'
                            : term.latency < 50
                            ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                            : term.latency < 100
                            ? 'text-amber-600 bg-amber-50 border-amber-200'
                            : 'text-red-600 bg-red-50 border-red-200';

                        return (
                          <div
                            key={`${term.id || idx}-${idx}`}
                            className={`p-4 rounded-xl border bg-white shadow-xs space-y-3 transition-all hover:shadow-md ${
                              isMaintenance ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                            }`}
                          >
                            {/* Card Header with ID, Name, and Status */}
                            <div className="flex items-start justify-between">
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span
                                    className={`w-2 h-2 rounded-full ${
                                      isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
                                    }`}
                                  />
                                  <span className="text-xs font-bold text-[#0b1c30]">{term.code}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">({term.id || 'Not available'})</span>
                                </div>
                                <h4 className="text-xs font-bold text-slate-800 line-clamp-1 mt-0.5">{term.name}</h4>
                                <span className="text-[10px] text-slate-500 block">{term.location || 'Not available'}</span>
                              </div>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${latencyColor}`}>
                                {term.latency != null ? `${term.latency}ms` : 'Not available'}
                              </span>
                            </div>

                            {/* Detailed Specs Grid */}
                            <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <div>
                                <span className="text-slate-400 block">Status:</span>
                                <span
                                  className={`font-semibold ${
                                    isOnline ? 'text-emerald-700' : 'text-red-600'
                                  }`}
                                >
                                  {isMaintenance ? 'MAINTENANCE' : term.status || 'Not available'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Network Link:</span>
                                <span className="font-mono font-semibold text-slate-700">
                                  {term.ipAddress || 'Not available'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Last Heartbeat:</span>
                                <span className="font-semibold text-slate-700">
                                  {term.heartbeat || 'Not available'}
                                </span>
                              </div>
                              <div>
                                <span className="text-slate-400 block">Uptime:</span>
                                <span className="font-semibold text-emerald-700">
                                  {/* No uptime measurement exists — never asserted. */}
                                  Not measured
                                </span>
                              </div>
                              <div className="col-span-2">
                                <span className="text-slate-400 block">Punches Logged Today:</span>
                                <span className="font-semibold text-[#0058be]">
                                  {term.punchesRecordedToday != null
                                    ? `${term.punchesRecordedToday} events`
                                    : 'Not available'}
                                </span>
                              </div>
                            </div>

                            {/* Firmware & Badges */}
                            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                              <span className="text-slate-500 font-mono">
                                {term.firmwareVersion || 'Not available'}
                              </span>
                              {term.updateAvailable && (
                                <span className="px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 font-bold border border-purple-200 flex items-center gap-1">
                                  <Sparkles className="w-2.5 h-2.5" />
                                  Update Available
                                </span>
                              )}
                            </div>

                            {/* Action Buttons */}
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
                                title="View Terminal Details"
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
                )}

                {/* DETAIL 2: PACKET LOSS RATE */}
                {selectedCard === 'packetLoss' && (
                  <div className="space-y-4">
                    {/* Threshold Alert / SLA Status Banner */}
                    <div
                      className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
                        exceedingLossTerminals.length === 0
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {exceedingLossTerminals.length === 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
                        )}
                        <div>
                          <span className="font-bold text-sm block">
                            {exceedingLossTerminals.length === 0
                              ? 'No Packet Loss Above Threshold Detected'
                              : `${exceedingLossTerminals.length} Terminal(s) Exceeding Packet Loss Threshold`}
                          </span>
                          <span className="text-[11px] opacity-80">
                            {exceedingLossTerminals.length === 0
                              ? measuredLossTerminals.length > 0
                                ? `${measuredLossTerminals.length} of ${terminalsList.length} terminal(s) reported packet loss on the latest probe (SLA limit 1.00%).`
                                : 'Packet loss is not reported by the current probe.'
                              : `Degraded terminals: ${exceedingLossTerminals.map(t => `${t.code} (${t.packetLoss}%)`).join(', ')}`}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full font-bold text-xs border ${
                          exceedingLossTerminals.length === 0
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {exceedingLossTerminals.length === 0 ? 'SLA Compliant' : 'Threshold Exceeded'}
                      </span>
                    </div>

                    {/* Packet Transmission Metrics Strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Overall Packet Loss
                        </span>
                        <div className="text-2xl font-bold text-emerald-600 mt-1">
                          {avgPacketLoss != null ? `${avgPacketLoss.toFixed(2)}%` : 'Not measured'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Fleet average loss</div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Packets Sent
                        </span>
                        <div className="text-2xl font-bold text-[#0b1c30] mt-1">
                          {data?.networkMetrics?.packetsSent != null
                            ? data.networkMetrics.packetsSent.toLocaleString()
                            : 'Not available'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Total ping packets transmitted</div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Packets Received
                        </span>
                        <div className="text-2xl font-bold text-emerald-600 mt-1">
                          {data?.networkMetrics?.packetsReceived != null
                            ? data.networkMetrics.packetsReceived.toLocaleString()
                            : 'Not available'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Telemetry responses acknowledged</div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Packets Dropped
                        </span>
                        <div className="text-2xl font-bold text-slate-700 mt-1">
                          {data?.networkMetrics?.packetsDropped != null
                            ? data.networkMetrics.packetsDropped.toLocaleString()
                            : 'Not available'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Acceptable SLA limit: 0</div>
                      </div>
                    </div>

                    {/* Packet Loss Trend Graph */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-emerald-600" />
                            Packet Loss Trend &amp; Telemetry Stream
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Time-series packet loss percentage sampled across VPN mesh
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200">
                          Target: 0.00%
                        </span>
                      </div>

                      <div className="h-44 w-full pt-3">
                        {isMounted && (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                              data={data?.networkMetrics?.packetLossGraph || []}
                              margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                            >
                              <defs>
                                <linearGradient id="packetLossDetailGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                                </linearGradient>
                              </defs>
                              <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                              <YAxis domain={[0, 5]} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} unit="%" />
                              <Tooltip />
                              <Area
                                type="monotone"
                                dataKey="lossPct"
                                stroke="#10b981"
                                strokeWidth={2.5}
                                fillOpacity={1}
                                fill="url(#packetLossDetailGradient)"
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      {/* Time points strip */}
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-xs">
                        {(data?.networkMetrics?.packetLossGraph || []).map((pt, i) => (
                          <div key={i} className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="text-[10px] text-slate-400 block">{pt.time}</span>
                            <span className="font-bold text-emerald-700 text-xs">{pt.lossPct.toFixed(2)}% loss</span>
                            <span className="text-[10px] text-slate-500 block">{pt.latency}ms</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-Terminal Packet Loss Table */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Network className="w-4 h-4 text-[#0058be]" />
                          Per-Terminal Packet Loss Diagnostics ({terminalsList.length} Units)
                        </h3>
                        <span className="text-[11px] text-slate-400">Acceptable SLA Threshold: &le; 1.00%</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-3">Terminal</th>
                              <th className="px-4 py-3">Location &amp; IP</th>
                              <th className="px-4 py-3">Packet Loss</th>
                              <th className="px-4 py-3">Threshold Status</th>
                              <th className="px-4 py-3">Latency</th>
                              <th className="px-4 py-3">Heartbeat</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {terminalsList.map((term, i) => {
                              const exceeds = typeof term.packetLoss === 'number' && term.packetLoss > acceptableLossThreshold;
                              return (
                                <tr key={term.id || i} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-slate-800">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-[#0058be]">{term.code}</span>
                                      <span className="text-slate-500 font-normal">— {term.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">
                                    <div>{term.location || 'Not available'}</div>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                      <span className="font-mono text-[10px] text-slate-400">{term.ipAddress || 'Not available'}</span>
                                      {term.serialNumber && (
                                        <span className="font-mono text-[9px] px-1.5 py-0.2 rounded bg-blue-50 text-blue-700 border border-blue-100 font-semibold" title="Device Serial Number">
                                          SN: {term.serialNumber}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 font-mono font-bold text-slate-800">
                                    {term.packetLoss != null ? `${term.packetLoss.toFixed(2)}%` : 'Not available'}
                                  </td>
                                  <td className="px-4 py-3">
                                    {exceeds ? (
                                      <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 text-[10px] font-bold border border-red-200 inline-flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3" />
                                        Exceeds Threshold (&gt; 1.0%)
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-bold border border-emerald-200 inline-flex items-center gap-1">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Within SLA (&le; 1.0%)
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 font-mono text-slate-700">
                                    {term.latency != null ? `${term.latency}ms` : 'Not available'}
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">
                                    {term.heartbeat || 'Not available'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* DETAIL 3: AVERAGE NETWORK LATENCY */}
                {selectedCard === 'latency' && (
                  <div className="space-y-4">
                    {/* SLA Status Banner */}
                    <div
                      className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
                        slaStatus === 'Healthy'
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : slaStatus === 'Warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-red-50 border-red-200 text-red-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {slaStatus === 'Healthy' ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : slaStatus === 'Warning' ? (
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        ) : (
                          <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                        )}
                        <div>
                          <span className="font-bold text-sm block">
                            Network Latency SLA Status: {slaStatus}
                          </span>
                          <span className="text-[11px] opacity-80">
                            {slaStatus === 'Healthy'
                              ? `Measured average latency across probed terminals is ${avgLatency}ms (target < 50ms).`
                              : slaStatus === 'Warning'
                              ? 'Fleet latency is approaching warning threshold (50ms - 100ms).'
                              : slaStatus === 'Unknown'
                              ? 'No latency measurement returned by the network probe yet.'
                              : 'Network latency degraded beyond 100ms SLA target.'}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full font-bold text-xs border ${
                          slaStatus === 'Healthy'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : slaStatus === 'Warning'
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                        }`}
                      >
                        {slaStatus === 'Healthy' ? '< 50ms Compliant' : avgLatency === null ? 'No measurement' : `${avgLatency}ms Status`}
                      </span>
                    </div>

                    {/* Latency Stats Strip */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Overall Average Latency
                        </span>
                        <div className="text-2xl font-bold text-[#0058be] mt-1">
                          {avgLatency != null ? `${avgLatency}ms` : '—'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Across {reportedLatencies.length} probed terminal(s)</div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Minimum Latency
                        </span>
                        <div className="text-2xl font-bold text-emerald-600 mt-1">
                          {minLatency != null ? `${minLatency}ms` : 'Not available'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Fastest terminal response</div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          Maximum Latency
                        </span>
                        <div className="text-2xl font-bold text-slate-700 mt-1">
                          {maxLatency != null ? `${maxLatency}ms` : 'Not available'}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1">Highest terminal response</div>
                      </div>

                      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          SLA Threshold
                        </span>
                        <div className="text-2xl font-bold text-slate-700 mt-1">&lt; 50ms</div>
                        <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                          Sub-second face unlock SLA
                        </div>
                      </div>
                    </div>

                    {/* Latency Distribution Visualization */}
                    <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                        <div>
                          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-[#0058be]" />
                            Latency Distribution &amp; Trend Histogram
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Breakdown of terminals by response latency bucket
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0058be] text-[10px] font-bold border border-blue-200">
                          Avg {avgLatency}ms
                        </span>
                      </div>

                      <div className="h-44 w-full pt-3">
                        {isMounted && (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                              data={data?.networkMetrics?.latencyDistribution || []}
                              margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
                            >
                              <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                              <Tooltip />
                              <Bar dataKey="count" fill="#0058be" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        )}
                      </div>

                      {/* Bucket summary pills */}
                      <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-5 gap-2 text-center text-xs">
                        {(data?.networkMetrics?.latencyDistribution || []).map((b, i) => (
                          <div key={i} className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                            <span className="text-[10px] text-slate-400 block truncate">{b.bucket}</span>
                            <span className="font-bold text-slate-800 text-sm">{b.count} Terminals</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Per-Terminal Current Latency List */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Server className="w-4 h-4 text-[#0058be]" />
                          Per-Terminal Current Latency ({terminalsList.length} Units)
                        </h3>
                        <span className="text-[11px] text-slate-400">Target: &lt; 50ms Edge Response</span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                            <tr>
                              <th className="px-4 py-3">Terminal</th>
                              <th className="px-4 py-3">Location &amp; IP</th>
                              <th className="px-4 py-3">Current Latency</th>
                              <th className="px-4 py-3">SLA Health Category</th>
                              <th className="px-4 py-3">
                                Variance vs Avg{avgLatency === null ? ' (no measurement)' : ` (${avgLatency}ms)`}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {terminalsList.map((term, i) => {
                              const diff =
                                avgLatency === null || typeof term.latency !== 'number'
                                  ? null
                                  : term.latency - avgLatency;
                              const diffText =
                                diff === null ? 'No average' : diff > 0 ? `+${diff}ms` : `${diff}ms`;
                              const category =
                                typeof term.latency !== 'number'
                                  ? { label: 'No measurement', cls: 'bg-slate-50 text-slate-600 border-slate-200' }
                                  : term.latency < 50
                                  ? { label: 'Optimal (< 50ms)', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
                                  : term.latency <= 100
                                  ? { label: 'Warning (50-100ms)', cls: 'bg-amber-50 text-amber-700 border-amber-200' }
                                  : { label: 'Degraded (> 100ms)', cls: 'bg-red-50 text-red-700 border-red-200' };

                              return (
                                <tr key={term.id || i} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="px-4 py-3 font-semibold text-slate-800">
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono font-bold text-[#0058be]">{term.code}</span>
                                      <span className="text-slate-500 font-normal">— {term.name}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-slate-500">
                                    <div>{term.location || 'Not available'}</div>
                                    <span className="font-mono text-[10px] text-slate-400">{term.ipAddress || 'Not available'}</span>
                                  </td>
                                  <td className="px-4 py-3 font-mono font-bold text-slate-800">
                                    {term.latency != null ? `${term.latency}ms` : 'Not available'}
                                  </td>
                                  <td className="px-4 py-3">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${category.cls}`}>
                                      {category.label}
                                    </span>
                                  </td>
                                  <td className="px-4 py-3 font-mono text-[11px] text-slate-500">
                                    {term.latency != null ? diffText : 'Not available'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {/* DETAIL 4: HUB TOPOLOGY STATUS */}
                {selectedCard === 'topology' && (
                  <div className="space-y-4">
                    {/* Topology Overview & Mesh Connection Diagnostics */}
                    <div
                      className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
                        degradedOrDisconnected.length === 0
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        {degradedOrDisconnected.length === 0 ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                        )}
                        <div>
                          <span className="font-bold text-sm block">
                            {terminalsList.length === 0
                              ? 'No Terminal Topology Reported'
                              : degradedOrDisconnected.length === 0
                              ? `All ${data?.networkMetrics?.hubsSummary?.length ?? 0} Regional Hub(s) & Mesh Links Healthy`
                              : `${degradedOrDisconnected.length} Degraded or Disconnected Link(s) Detected`}
                          </span>
                          <span className="text-[11px] opacity-80">
                            {terminalsList.length === 0
                              ? 'The network probe returned no terminals to map yet.'
                              : degradedOrDisconnected.length === 0
                              ? 'No disconnected or degraded connections detected on the latest probe.'
                              : `Degraded connection points: ${degradedOrDisconnected.map(t => `${t.code} (${t.location})`).join(', ')}`}
                          </span>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full font-bold text-xs bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {data?.networkMetrics?.hubsSummary?.length ?? 0} Hubs Active
                      </span>
                    </div>

                    {/* Hub Topology Cards with Terminal-to-Hub Relationships */}
                    <div className="space-y-4">
                      {(data?.networkMetrics?.hubsSummary || []).map((hub, hubIdx) => {
                        // Match terminals connected to this hub based on code prefix or hub name
                        const hubTerminals = terminalsList.filter(t => {
                          if (hub.hub.includes('BEL') || hub.hub.toLowerCase().includes('belagavi')) {
                            return t.code.startsWith('BEL');
                          }
                          if (hub.hub.includes('DAV') || hub.hub.toLowerCase().includes('davanagere')) {
                            return t.code.startsWith('DAV');
                          }
                          if (hub.hub.includes('SHI') || hub.hub.toLowerCase().includes('shivamogga')) {
                            return t.code.startsWith('SHI');
                          }
                          return t.location.toLowerCase().includes(hub.hub.toLowerCase().slice(0, 4));
                        });

                        const onlineCount = hubTerminals.filter(t => t.status === 'ONLINE').length;
                        const offlineCount = hubTerminals.filter(t => t.status === 'OFFLINE').length;
                        const maintCount = hubTerminals.filter(t => maintenanceStates[t.id]).length;

                        return (
                          <div key={hubIdx} className="bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
                            {/* Hub Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-xl bg-[#eff4ff] text-[#0058be] flex items-center justify-center font-bold">
                                  <Router className="w-5 h-5" />
                                </div>
                                <div>
                                  <h4 className="text-sm font-bold text-[#0b1c30]">{hub.hub}</h4>
                                  <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                    <span>{hubTerminals.length} Connected Terminals</span>
                                    <span>•</span>
                                    <span className="text-emerald-700 font-semibold">{onlineCount} Online</span>
                                    <span>•</span>
                                    <span>{offlineCount} Offline</span>
                                    {maintCount > 0 && (
                                      <>
                                        <span>•</span>
                                        <span className="text-amber-700 font-semibold">{maintCount} Maintenance</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>{hub.status || 'Status not reported'}</span>
                                </span>
                              </div>
                            </div>

                            {/* Terminal-to-Hub Relationships */}
                            <div>
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2.5">
                                Connected Edge Terminal Nodes ({hubTerminals.length})
                              </span>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {hubTerminals.map((term, tIdx) => {
                                  const isMaint = maintenanceStates[term.id];
                                  const isDisconnected = term.status === 'OFFLINE';
                                  const isDegraded = typeof term.latency === 'number' && term.latency > 50;

                                  const linkState = isDisconnected
                                    ? { label: 'Disconnected Link', cls: 'text-red-700 bg-red-50 border-red-200' }
                                    : isDegraded
                                    ? { label: 'Degraded Link', cls: 'text-amber-700 bg-amber-50 border-amber-200' }
                                    : { label: 'Active Link (Optimal)', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' };

                                  return (
                                    <div
                                      key={term.id || tIdx}
                                      className={`p-3 rounded-lg border text-xs space-y-2 bg-slate-50/60 ${
                                        isMaint ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                                      }`}
                                    >
                                      <div className="flex items-start justify-between">
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <span
                                              className={`w-2 h-2 rounded-full ${
                                                term.status === 'ONLINE' ? 'bg-emerald-500' : 'bg-red-500'
                                              }`}
                                            />
                                            <span className="font-bold text-[#0b1c30]">{term.code}</span>
                                            <span className="text-[10px] font-mono text-slate-400">({term.id || 'Not available'})</span>
                                          </div>
                                          <h5 className="font-medium text-slate-700 mt-0.5 line-clamp-1">{term.name}</h5>
                                          <span className="text-[10px] text-slate-400">{term.location || 'Not available'}</span>
                                        </div>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${linkState.cls}`}>
                                          {linkState.label}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-3 gap-2 text-[10px] bg-white p-2 rounded border border-slate-100">
                                        <div>
                                          <span className="text-slate-400 block">Network:</span>
                                          <span className="font-mono font-semibold text-slate-700">{term.ipAddress || 'Not available'}</span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 block">Latency:</span>
                                          <span className="font-mono font-semibold text-[#0058be]">
                                            {term.latency != null ? `${term.latency}ms` : 'Not available'}
                                          </span>
                                        </div>
                                        <div>
                                          <span className="text-slate-400 block">Punches:</span>
                                          <span className="font-semibold text-slate-700">
                                            {term.punchesRecordedToday != null ? term.punchesRecordedToday : 'Not available'}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Quick Actions */}
                                      <div className="flex items-center justify-end gap-1 pt-1">
                                        <button
                                          onClick={() => handleRestart(term)}
                                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold transition-colors"
                                        >
                                          Restart
                                        </button>
                                        <button
                                          onClick={() => setSelectedCameraTerminal(term)}
                                          className="px-2 py-0.5 rounded bg-blue-50 hover:bg-blue-100 text-[#0058be] text-[10px] font-bold transition-colors"
                                        >
                                          Cam
                                        </button>
                                        <button
                                          onClick={() => handleToggleMaintenance(term)}
                                          className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                                            isMaint ? 'bg-amber-600 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                          }`}
                                        >
                                          {isMaint ? 'Active' : 'Maint'}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* DEFAULT OVERVIEW (Network Visualizations + 8 Terminal Inventory Cards) */
              <>
                {/* Network Metrics Visualizations (Packet Loss + Latency Distribution) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Packet Loss Graph */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Wifi className="w-4 h-4 text-emerald-600" />
                          Packet Loss Stream (SLA Target 0.00%)
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          {avgPacketLoss != null
                            ? `${avgPacketLoss.toFixed(2)}% fleet-average loss on the latest probe`
                            : 'Packet loss is not measured by the current probe — no time series is stored'}
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          avgPacketLoss == null
                            ? 'bg-slate-50 text-slate-600 border-slate-200'
                            : avgPacketLoss <= 1
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-red-50 text-red-700 border-red-200'
                        }`}
                      >
                        {avgPacketLoss == null ? 'Not measured' : avgPacketLoss <= 1 ? 'Optimal' : 'Review'}
                      </span>
                    </div>

                    <div className="h-36 w-full pt-3">
                      {isMounted && (
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
                      )}
                    </div>
                  </div>

                  {/* Latency Distribution Chart */}
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                      <div>
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-[#0058be]" />
                          Latency Distribution ({reportedLatencies.length} Probed)
                        </h3>
                        <p className="text-[11px] text-slate-400">Green range: &lt;50ms response ensures seamless facial unlock</p>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-[#0058be] text-[10px] font-bold border border-blue-200">
                        {avgLatency != null ? `Avg ${avgLatency}ms` : 'No measurement'}
                      </span>
                    </div>

                    <div className="h-36 w-full pt-3">
                      {isMounted && (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={data?.networkMetrics?.latencyDistribution || []} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                            <XAxis dataKey="bucket" tick={{ fontSize: 9, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Bar dataKey="count" fill="#0058be" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                </div>

                {/* 8 Terminal Health Cards Grid */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                      <Server className="w-4 h-4 text-[#0058be]" />
                      Edge Terminal Inventory &amp; Telemetry ({data?.terminals?.length ?? 0} Units)
                    </h3>
                    <span className="text-[11px] text-slate-400">Firmware versions as last reported by the device registry</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {data?.terminals.map((term, idx) => {
                      const isMaintenance = maintenanceStates[term.id];
                      const latencyColor =
                        typeof term.latency !== 'number'
                          ? 'text-slate-500 bg-slate-50 border-slate-200'
                          : term.latency < 50
                          ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                          : term.latency < 100
                          ? 'text-amber-600 bg-amber-50 border-amber-200'
                          : 'text-red-600 bg-red-50 border-red-200';

                      return (
                        <div
                          key={`${term.id || idx}-${idx}`}
                          className={`p-4 rounded-xl border bg-white shadow-xs space-y-3 transition-all hover:shadow-md ${
                            isMaintenance ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                          }`}
                        >
                          {/* Card Header */}
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full ${
                                    term.status === 'ONLINE'
                                      ? 'bg-emerald-500 animate-pulse'
                                      : term.status === 'MAINTENANCE'
                                      ? 'bg-amber-500'
                                      : 'bg-red-500'
                                  }`}
                                />
                                <span className="text-xs font-bold text-[#0b1c30]">{term.code}</span>
                              </div>
                              <h4 className="text-xs font-bold text-slate-800 line-clamp-1 mt-0.5">{term.name}</h4>
                              <span className="text-[10px] text-slate-400">{term.location || 'Not available'}</span>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${latencyColor}`}>
                              {term.latency != null ? `${term.latency}ms` : 'Not available'}
                            </span>
                          </div>

                          {/* Device Specs & Vital stats */}
                          <div className="grid grid-cols-2 gap-2 text-[10px] bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                            <div>
                              <span className="text-slate-400 block">Network Link:</span>
                              <span className="font-mono font-semibold text-slate-700">{term.ipAddress || 'Not available'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Heartbeat:</span>
                              <span className="font-semibold text-slate-700">{term.heartbeat || 'Not available'}</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Uptime Today:</span>
                              <span className="font-semibold text-slate-500">Not measured</span>
                            </div>
                            <div>
                              <span className="text-slate-400 block">Punches Logged:</span>
                              <span className="font-semibold text-[#0058be]">
                                {term.punchesRecordedToday != null ? term.punchesRecordedToday : 'Not available'}
                              </span>
                            </div>
                          </div>

                          {/* Firmware & Badges */}
                          <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-100">
                            <span className="text-slate-500 font-mono">{term.firmwareVersion || 'Not available'}</span>
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
                              title="View Terminal Details"
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
                    {selectedCameraTerminal.name} — Terminal Details
                  </h3>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Registry record &amp; latest probe result
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCameraTerminal(null)}
                aria-label="Close terminal details"
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Terminal facts panel — terminals do not stream video to the HRMS */}
            <div className="px-4 py-2 space-y-3">
              <div className="flex items-center gap-2 text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-[11px] font-medium">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                <span>
                  Live video is not available — biometric terminals record punches on-device and do
                  not stream camera feeds to this application.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <span className="text-slate-400 block text-[10px]">Status</span>
                  <span
                    className={`font-semibold ${
                      selectedCameraTerminal.status === 'ONLINE'
                        ? 'text-emerald-700'
                        : selectedCameraTerminal.status === 'MAINTENANCE'
                        ? 'text-amber-700'
                        : 'text-red-600'
                    }`}
                  >
                    {selectedCameraTerminal.status}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <span className="text-slate-400 block text-[10px]">Last Heartbeat</span>
                  <span className="font-semibold text-slate-700">{selectedCameraTerminal.heartbeat || 'Not available'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <span className="text-slate-400 block text-[10px]">IP Address</span>
                  <span className="font-mono font-semibold text-slate-700">{selectedCameraTerminal.ipAddress || 'Not available'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <span className="text-slate-400 block text-[10px]">Firmware</span>
                  <span className="font-mono font-semibold text-slate-700">{selectedCameraTerminal.firmwareVersion || 'Not available'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <span className="text-slate-400 block text-[10px]">Punches Today</span>
                  <span className="font-semibold text-[#0058be]">
                    {selectedCameraTerminal.punchesRecordedToday != null
                      ? selectedCameraTerminal.punchesRecordedToday
                      : 'Not available'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-2.5">
                  <span className="text-slate-400 block text-[10px]">Probe Latency</span>
                  <span className="font-semibold text-slate-700">
                    {selectedCameraTerminal.latency != null ? `${selectedCameraTerminal.latency}ms` : 'Not available'}
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-slate-400 font-mono">
                {selectedCameraTerminal.code}
                {selectedCameraTerminal.serialNumber ? ` • SN: ${selectedCameraTerminal.serialNumber}` : ''}
                {` • ${selectedCameraTerminal.location || 'Location not reported'}`}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedCameraTerminal(null)}
                className="px-4 py-2 bg-[#0058be] text-white rounded-lg text-xs font-bold hover:bg-blue-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}