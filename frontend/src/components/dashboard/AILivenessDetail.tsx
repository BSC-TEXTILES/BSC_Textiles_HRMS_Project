'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  ArrowLeft, 
  ShieldCheck, 
  ScanFace, 
  Sparkles, 
  Sliders, 
  Sun, 
  Camera, 
  CheckCircle2, 
  AlertTriangle, 
  RefreshCw, 
  X,
  Lock,
  Zap,
  Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

interface VerificationLogItem {
  id: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  terminal: string;
  /** null whenever the terminal stored no score for the attempt */
  livenessScore: number | null;
  method: string;
  timestamp: string | null;
  result: string;
  spoofDetected: boolean | null;
  antiSpoofMetrics: {
    skinTextureScore: number;
    depthParallaxScore: number;
    infraredIrisScore: number;
  } | null;
}

interface LivenessData {
  summary: {
    livenessRatePct: number | null;
    spoofingAttemptsToday: number | null;
    totalVerificationsToday: number;
    avgMatchConfidence: number | null;
    currentThreshold: number | null;
    hardwareIntegrityStatus: string;
  };
  recentLogs: VerificationLogItem[];
  deviceCameraHealth: Array<{
    terminal: string;
    cameraScore: number;
    lightingLux: number;
    lightingStatus: string;
    lensCondition: string;
  }>;
  securityAlerts: Array<{
    id: string;
    type: string;
    title: string;
    description: string;
    timestamp: string;
  }>;
}

let livenessCache: { data: LivenessData; timestamp: number } | null = null;
const CACHE_TTL_MS = 30000;

function verdictStyle(result: string) {
  const r = (result || '').toUpperCase();
  if (r.includes('VERIF') || r.includes('PASS') || r.includes('SUCCESS')) {
    return { label: result, cls: 'bg-emerald-100 text-emerald-800', ok: true as const, bad: false as const };
  }
  if (r.includes('FAIL') || r.includes('REJECT') || r.includes('DENIED')) {
    return { label: result, cls: 'bg-red-100 text-red-800', ok: false as const, bad: true as const };
  }
  return { label: result, cls: 'bg-slate-100 text-slate-700', ok: false as const, bad: false as const };
}

export function AILivenessDetail({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
  locationId?: string;
}) {
  const [data, setData] = useState<LivenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [threshold, setThreshold] = useState(95);
  const [configuredThreshold, setConfiguredThreshold] = useState<number | null>(null);
  const [isUpdatingThreshold, setIsUpdatingThreshold] = useState(false);
  const [lastRefreshedSec, setLastRefreshedSec] = useState(0);

  const fetchData = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && livenessCache && now - livenessCache.timestamp < CACHE_TTL_MS) {
      setData(livenessCache.data);
      setThreshold(livenessCache.data.summary.currentThreshold ?? 95);
      setConfiguredThreshold(livenessCache.data.summary.currentThreshold ?? null);
      setLoading(false);
      return;
    }

    try {
      if (!data) setLoading(true);
      const res = await fetch('/api/biometric/liveness-logs', { credentials: 'include' }).catch(() => null);
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
          livenessCache = { data: json.data, timestamp: now };
          setData(json.data);
          setThreshold(json.data.summary.currentThreshold ?? 95);
          setConfiguredThreshold(json.data.summary.currentThreshold ?? null);
          setLastRefreshedSec(0);
        }
      }
    } catch {
      // Gracefully maintain existing cache or state
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

  const handleUpdateThreshold = async () => {
    setIsUpdatingThreshold(true);
    try {
      const res = await fetch('/api/biometric/liveness-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ threshold }),
      });
      const text = await res.text().catch(() => '');
      let json: any = {};
      try {
        if (text && text.trim().length > 0) {
          json = JSON.parse(text);
        }
      } catch {
        json = {};
      }
      if (json.success) {
        setConfiguredThreshold(threshold);
        toast.success(`Face verification threshold stored for this location (${threshold}%).`);
      } else {
        toast.error(json.message || 'Failed to update threshold');
      }
    } catch (e) {
      toast.error('Network error updating threshold');
    } finally {
      setIsUpdatingThreshold(false);
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
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30]">AI Facial Liveness & Anti-Spoofing Telemetry</h2>
              <p className="text-[11px] text-slate-500">
                {data
                  ? `${data.summary.totalVerificationsToday} verification attempt(s) recorded from terminal logs today • anti-spoof verdicts are decided on-device and not reported here`
                  : 'Verification attempts recorded from terminal logs'}
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
            <div className="h-64 bg-white rounded-xl border border-slate-200" />
          </div>
        ) : (
          <>
            {/* Top KPI Metrics Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Liveness Rate</span>
                <div className="text-2xl font-bold text-emerald-600 mt-1">
                  {data?.summary.livenessRatePct != null ? `${data.summary.livenessRatePct}% Verified` : 'Not measured'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>
                    {data?.summary.livenessRatePct != null
                      ? "Share of today's recorded attempts verified by devices"
                      : 'No verification attempts recorded today'}
                  </span>
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Spoofing Attempts Blocked</span>
                <div className="text-2xl font-bold text-[#0b1c30] mt-1">
                  {data?.summary.spoofingAttemptsToday != null
                    ? `${data.summary.spoofingAttemptsToday} Attempt(s)`
                    : 'Not reported'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Devices do not report an anti-spoof verdict</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Neural Confidence</span>
                <div className="text-2xl font-bold text-[#0058be] mt-1">
                  {data?.summary.avgMatchConfidence != null ? `${data.summary.avgMatchConfidence}%` : 'Not measured'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Average stored match percentage, where reported</div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sensitivity Threshold</span>
                <div className="text-2xl font-bold text-slate-700 mt-1">
                  {configuredThreshold != null ? `${configuredThreshold}% Match` : 'Not configured'}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Stored face-verification threshold for this location</div>
              </div>
            </div>

            {/* Security Alerts & Engine Status */}
            <div
              className={`p-4 rounded-xl flex items-center justify-between text-xs shadow-xs border ${
                data?.summary.spoofingAttemptsToday != null
                  ? data.summary.spoofingAttemptsToday > 0
                    ? 'bg-red-50 border-red-200 text-red-900'
                    : 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    data?.summary.spoofingAttemptsToday != null
                      ? data.summary.spoofingAttemptsToday > 0
                        ? 'bg-red-100 text-red-700'
                        : 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-sm">
                    {data?.summary.spoofingAttemptsToday != null
                      ? data.summary.spoofingAttemptsToday > 0
                        ? `${data.summary.spoofingAttemptsToday} Spoofing Attempt(s) Recorded Today`
                        : 'No Spoofing Attempts Reported Today'
                      : 'Anti-Spoof Verdicts Not Reported by Devices'}
                  </h4>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    Terminals log match percentages only — liveness and anti-spoof judgements are made
                    on-device and are not streamed to this application.
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-full font-bold text-[10px] shadow-xs ${
                  data?.summary.spoofingAttemptsToday != null
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {data?.summary.spoofingAttemptsToday != null ? 'Reported' : 'Device-side only'}
              </span>
            </div>

            {/* Settings Shortcut: Adjust Sensitivity Threshold */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#0058be]" />
                    Biometric Sensitivity Threshold Configuration
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Controls facial landmark alignment tolerance for this location.
                    {configuredThreshold != null
                      ? ` Currently stored at ${configuredThreshold}% match.`
                      : ' No threshold is configured yet.'}
                  </p>
                </div>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-blue-50 text-[#0058be] border border-blue-200">
                  Selected: {threshold}% • Stored: {configuredThreshold != null ? `${configuredThreshold}%` : 'not configured'}
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
                <div className="flex-1 w-full space-y-1">
                  <div className="flex justify-between text-[10px] font-bold text-slate-400">
                    <span>75% (Lenient)</span>
                    <span className="text-[#0058be]">95% (Recommended Default)</span>
                    <span>99% (Ultra-Strict)</span>
                  </div>
                  <input
                    type="range"
                    min={75}
                    max={99}
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    className="w-full accent-[#0058be] cursor-pointer h-2 bg-slate-200 rounded-lg"
                  />
                </div>

                <button
                  onClick={handleUpdateThreshold}
                  disabled={isUpdatingThreshold}
                  className="w-full sm:w-auto px-4 py-2 bg-[#0058be] hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs disabled:opacity-50 shrink-0"
                >
                  {isUpdatingThreshold ? 'Deploying...' : 'Save Sensitivity Threshold'}
                </button>
              </div>
            </div>

            {/* Device Camera Health & Ambient Lighting Conditions */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#0058be]" />
                  Terminal Optical Sensor Health & Showroom Lighting (Lux)
                </h3>
                <span className="text-[11px] text-slate-400">Ambient Lighting Standard: 400 - 700 Lux</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-1">
                {(data?.deviceCameraHealth?.length ?? 0) === 0 ? (
                  <div className="col-span-full bg-slate-50 border border-slate-200 rounded-lg p-4 text-[11px] text-slate-500 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>
                      Terminals do not report optical scores, lux readings or lens condition to this
                      application — no camera health data is available.
                    </span>
                  </div>
                ) : (
                  data?.deviceCameraHealth.map((dev) => (
                  <div key={dev.terminal} className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    <div className="font-bold text-xs text-[#0b1c30] truncate">{dev.terminal}</div>
                    
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400">Optical Score:</span>
                      <span className="font-bold text-emerald-700">{dev.cameraScore}%</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1">
                        <Sun className="w-3 h-3 text-amber-500" />
                        Lux:
                      </span>
                      <span className="font-mono font-bold text-slate-700">{dev.lightingLux} Lux</span>
                    </div>

                    <div className="text-[10px] text-emerald-600 font-semibold pt-1 border-t border-slate-200 flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>{dev.lensCondition} Lens</span>
                    </div>
                  </div>
                  ))
                )}
              </div>
            </div>

            {/* Verification Log: Recent 20 Facial Recognition Attempts */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ScanFace className="w-4 h-4 text-[#0058be]" />
                    Facial Recognition Telemetry Log (Recent 20 Attempts)
                  </h4>
                  <p className="text-[10px] text-slate-400">
                    Stored verification attempts — anti-spoof verdicts are decided on-device and not streamed here
                  </p>
                </div>
                <span className="px-2.5 py-0.5 rounded-full bg-slate-50 text-slate-600 border border-slate-200 text-[10px] font-bold">
                  {data?.recentLogs?.length ?? 0} Recorded
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-4">Employee</th>
                      <th className="py-2.5 px-4">Terminal Device</th>
                      <th className="py-2.5 px-4">Verification Method</th>
                      <th className="py-2.5 px-4">Liveness Score</th>
                      <th className="py-2.5 px-4">Attempt Timestamp</th>
                      <th className="py-2.5 px-4">Verdict</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data?.recentLogs.map((log, idx) => (
                      <tr key={`${log.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-blue-100 text-[#0058be] font-bold flex items-center justify-center text-[10px]">
                              {log.employeeName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                            </div>
                            <div>
                              <div className="font-bold text-[#0b1c30]">{log.employeeName}</div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {log.employeeCode} • {log.department}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 font-medium text-slate-700">
                          {log.terminal}
                        </td>

                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                            <ScanFace className="w-3.5 h-3.5 text-[#0058be]" />
                            {log.method}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-mono">
                          {log.livenessScore != null ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-bold text-[11px] border border-emerald-200">
                              {log.livenessScore}% Score
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-50 text-slate-500 font-bold text-[11px] border border-slate-200">
                              Not reported
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono text-slate-600">
                          {log.timestamp ?? '—'}
                        </td>

                        <td className="py-3 px-4">
                          {(() => {
                            const verdict = verdictStyle(log.result);
                            return (
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold text-[10px] ${verdict.cls}`}>
                                {verdict.ok && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                                {verdict.bad && <AlertTriangle className="w-3 h-3 text-red-600" />}
                                {verdict.label}
                              </span>
                            );
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}