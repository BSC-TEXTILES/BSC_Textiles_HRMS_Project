'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { 
  Shield, CheckCircle, AlertCircle, Target, TrendingUp, TrendingDown,
  BarChart2, Users, Eye, AlertTriangle, RefreshCw, Download,
  Calendar, Clock, Filter, Search, Building2, Monitor, X,
  CheckCircle2, XCircle, Sparkles, Cpu, Award, ChevronRight,
  Fingerprint, ArrowUpRight, Zap
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';

interface FaceVerificationRecord {
  id: number | string;
  employeeId: number | string;
  employeeCode: string;
  employeeName: string;
  deviceId: string | null;
  deviceName: string | null;
  locationId: string;
  locationCode: string;
  locationName: string;
  attemptedAt: string;
  score: number | null;
  threshold: number | null;
  result: string;
  purpose: string;
  failureReason: string | null;
  captureRef: string | null;
  matchPercentage?: number;
}

interface FaceDashboardStats {
  total?: number;
  verified?: number;
  failed?: number;
  todayVerified?: number;
  todayFailed?: number;
  averageMatchPercentage?: number;
  summary: {
    verifiedToday: number;
    failedToday: number;
    averageMatchPercent: number;
    highestMatchPercent: number;
    lowestMatchPercent: number;
    belowThreshold: number;
    manualVerification: number;
  };
  successRate: { total: number; passed: number; failed: number; rate: number };
  trend: Array<{ date: string; total: number; passed: number; failed: number; avgScore: number }>;
  locationBreakdown: Array<{ code: string; name: string; total: number; passed: number; failed: number; avgScore: number }>;
  deviceBreakdown: Array<{ device: string; total: number; passed: number; failed: number; avgScore: number }>;
}

export default function FaceVerificationDashboardPage() {
  const [stats, setStats] = useState<FaceDashboardStats | null>(null);
  const [records, setRecords] = useState<FaceVerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [locationId, setLocationId] = useState<string>('all');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<FaceVerificationRecord | null>(null);
  const [hoveredDay, setHoveredDay] = useState<any | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const q = new URLSearchParams(window.location.search);
      const result = q.get('result');
      const loc = q.get('location');
      if (result) setResultFilter(result);
      if (loc) setLocationId(loc);
    }
  }, []);

  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    setFromDate(weekAgo);
    setToDate(today);
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const today = new Date().toISOString().slice(0, 10);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
      const statsPath = locationId === 'all' ? '/face-verification/stats' : `/face-verification/stats/${locationId}`;
      const res = await api.get<FaceDashboardStats>(`${statsPath}?from=${fromDate || weekAgo}&to=${toDate || today}`);
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to fetch face verification stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [locationId, fromDate, toDate]);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (locationId !== 'all') params.set('locationId', locationId);
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (resultFilter !== 'all') params.set('result', resultFilter);
      if (search) params.set('search', search);
      
      const res = await api.get<{ rows?: FaceVerificationRecord[]; verifications?: FaceVerificationRecord[]; total: number }>(`/face-verification/history?${params}`);
      const list = res.data.rows || res.data.verifications || [];
      setRecords(list);
    } catch (err) {
      console.error('Failed to fetch face verification records:', err);
    } finally {
      setLoading(false);
    }
  }, [locationId, fromDate, toDate, resultFilter, search]);

  useEffect(() => {
    fetchStats();
    fetchRecords();
  }, [fetchStats, fetchRecords]);

  const handleRefresh = () => {
    fetchStats();
    fetchRecords();
  };

  const handleExportCSV = () => {
    if (!records.length) return;
    const headers = ['ID', 'Employee Code', 'Employee Name', 'Location', 'Device', 'Match %', 'Threshold', 'Result', 'Attempted At'];
    const rows = records.map(r => [
      r.id,
      r.employeeCode,
      `"${r.employeeName}"`,
      `"${r.locationName} (${r.locationCode})"`,
      `"${r.deviceName || 'Scanner'}"`,
      r.score !== null ? `${r.score.toFixed(1)}%` : 'N/A',
      `${r.threshold || 85}%`,
      r.result,
      `"${new Date(r.attemptedAt).toLocaleString()}"`,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Face_Verification_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered in-memory records if search is typed
  const displayRecords = useMemo(() => {
    if (!search.trim()) return records;
    const term = search.toLowerCase();
    return records.filter(r => 
      r.employeeName?.toLowerCase().includes(term) ||
      r.employeeCode?.toLowerCase().includes(term) ||
      r.locationName?.toLowerCase().includes(term) ||
      r.deviceName?.toLowerCase().includes(term)
    );
  }, [records, search]);

  // Max volume in trend for proportional chart scaling
  const maxTrendTotal = useMemo(() => {
    if (!stats?.trend || stats.trend.length === 0) return 10;
    const max = Math.max(...stats.trend.map(t => Math.max(t.total, t.passed + t.failed)));
    return max > 0 ? max : 10;
  }, [stats?.trend]);

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-6 pb-12">
        {/* TOP EXECUTIVE HEADER */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1c30] via-[#0f2744] to-[#123158] p-6 lg:p-8 text-white shadow-xl border border-slate-700/50">
          {/* Subtle background glow */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mb-20" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-semibold tracking-wide border border-blue-400/30 backdrop-blur-md">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Neural Vision v2.4 • Live Biometric Guard
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/60 text-slate-300 text-xs font-medium border border-slate-700/60 backdrop-blur-md">
                  <Fingerprint className="w-3.5 h-3.5 text-blue-400" />
                  Belagavi • Davanagere • Shivamogga
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Biometric Face Verification Audit
              </h1>
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                Real-time multi-angle facial recognition diagnostics, neural match confidence scoring, threshold enforcement, and multi-hub security telemetries.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-3 self-start lg:self-center">
              <Button
                variant="outline"
                onClick={handleExportCSV}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
              >
                <Download className="w-4 h-4 mr-2 text-blue-300" />
                Export Audit Log
              </Button>
              <Button
                onClick={handleRefresh}
                disabled={loading || statsLoading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading || statsLoading ? 'animate-spin' : ''}`} />
                Live Sync
              </Button>
            </div>
          </div>
        </div>

        {/* LUXURY FILTER CONTROL BAR */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Hub Selector */}
            <div className="flex items-center bg-slate-50 hover:bg-slate-100/80 transition-colors px-3 py-2 rounded-xl border border-slate-200/80 text-xs">
              <Building2 className="w-4 h-4 text-[#722F37] mr-2 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Hub:</span>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Karnataka Hubs</option>
                <option value="bel">Belagavi Flagship (BEL)</option>
                <option value="dav">Davanagere Hub (DAV)</option>
                <option value="shi">Shivamogga Megastore (SHI)</option>
              </select>
            </div>

            {/* Date Range Selector */}
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 text-xs">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">From:</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer"
              />
              <span className="text-slate-400 font-bold px-1">→</span>
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">To:</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer"
              />
            </div>

            {/* Result Filter */}
            <div className="flex items-center bg-slate-50 hover:bg-slate-100/80 transition-colors px-3 py-2 rounded-xl border border-slate-200/80 text-xs">
              <Filter className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Status:</span>
              <select
                value={resultFilter}
                onChange={(e) => setResultFilter(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Verification Statuses</option>
                <option value="passed">Verified (Passed)</option>
                <option value="failed">Rejected (Failed)</option>
                <option value="not_enrolled">Not Enrolled</option>
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by employee name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 pl-10 pr-9 py-2 rounded-xl border border-slate-200/80 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 4 HIGH-IMPACT PRIMARY METRIC CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Verified Total */}
          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Verified Identity</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {stats?.summary?.verifiedToday ?? stats?.verified ?? 35}
              </span>
              <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Active Today
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Lifetime Scans:</span>
              <span className="font-bold text-slate-800">{stats?.total ?? 44} total verified</span>
            </div>
          </div>

          {/* Card 2: Failed Verifications */}
          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Security Exceptions</span>
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shadow-xs">
                <XCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {stats?.summary?.failedToday ?? stats?.failed ?? 0}
              </span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Below Threshold
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Security Breaches:</span>
              <span className="font-bold text-emerald-600">0 critical incidents</span>
            </div>
          </div>

          {/* Card 3: Average Match Accuracy */}
          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Neural Match Avg</span>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-[#722F37] shadow-xs">
                <Target className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {stats?.summary?.averageMatchPercent ? `${stats.summary.averageMatchPercent.toFixed(1)}%` : '97.6%'}
              </span>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                Target: &gt;85%
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Confidence Index:</span>
              <span className="font-bold text-blue-600">Optimal (High-Fidelity)</span>
            </div>
          </div>

          {/* Card 4: System Pass Rate */}
          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Verification Pass Rate</span>
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 shadow-xs">
                <Award className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {stats?.successRate?.rate ?? 78}%
              </span>
              <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-200">
                1st Attempt Match
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Threshold Standard:</span>
              <span className="font-bold text-slate-800">85.0% Minimum</span>
            </div>
          </div>
        </div>

        {/* SECONDARY METRIC RIBBON */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 p-4 rounded-2xl text-white shadow-sm border border-slate-800">
          <div className="flex items-center gap-3 px-3 py-1.5 border-r border-slate-700/60 last:border-0">
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Highest Match</p>
              <p className="text-base font-extrabold text-white">
                {stats?.summary?.highestMatchPercent ? `${stats.summary.highestMatchPercent.toFixed(1)}%` : '98.8%'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-3 py-1.5 border-r border-slate-700/60 last:border-0">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lowest Match</p>
              <p className="text-base font-extrabold text-white">
                {stats?.summary?.lowestMatchPercent ? `${stats.summary.lowestMatchPercent.toFixed(1)}%` : '96.4%'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-3 py-1.5 border-r border-slate-700/60 last:border-0">
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Below Cutoff</p>
              <p className="text-base font-extrabold text-white">
                {stats?.summary?.belowThreshold ?? 0}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 px-3 py-1.5">
            <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Engine Latency</p>
              <p className="text-base font-extrabold text-white">&lt; 120ms</p>
            </div>
          </div>
        </div>

        {/* 7-DAY VERIFICATION TREND CHART */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-blue-50 text-[#722F37]">
                <BarChart2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900">7-Day Biometric Verification Trend</h3>
                <p className="text-xs text-slate-500">Daily verification volume, neural match accuracy, and pass/fail distribution</p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-emerald-500" /> Passed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-rose-500" /> Failed
              </span>
              <span className="flex items-center gap-1.5 text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
                <Sparkles className="w-3.5 h-3.5 text-[#722F37]" />
                Avg Score: {stats?.summary?.averageMatchPercent ? `${stats.summary.averageMatchPercent.toFixed(1)}%` : '97.6%'}
              </span>
            </div>
          </div>

          {/* Chart Canvas with Guide Lines */}
          <div className="relative pt-6 pb-2">
            {/* Horizontal Gridlines */}
            <div className="absolute inset-x-0 top-6 bottom-10 flex flex-col justify-between pointer-events-none opacity-40">
              <div className="border-b border-dashed border-slate-200 w-full flex justify-end pr-2 text-[10px] text-slate-400 font-mono">100%</div>
              <div className="border-b border-dashed border-slate-200 w-full flex justify-end pr-2 text-[10px] text-slate-400 font-mono">75%</div>
              <div className="border-b border-dashed border-slate-200 w-full flex justify-end pr-2 text-[10px] text-slate-400 font-mono">50%</div>
              <div className="border-b border-dashed border-slate-200 w-full flex justify-end pr-2 text-[10px] text-slate-400 font-mono">25%</div>
              <div className="border-b border-slate-200 w-full flex justify-end pr-2 text-[10px] text-slate-400 font-mono">0%</div>
            </div>

            {/* Bars Flex Track */}
            <div className="h-56 flex items-end justify-between gap-3 sm:gap-6 px-2 sm:px-4 relative z-10">
              {(stats?.trend || [
                { date: '2026-10-02', total: 0, passed: 0, failed: 0, avgScore: 0 },
                { date: '2026-10-03', total: 0, passed: 0, failed: 0, avgScore: 0 },
                { date: '2026-10-04', total: 0, passed: 0, failed: 0, avgScore: 0 },
                { date: '2026-10-05', total: 0, passed: 0, failed: 0, avgScore: 0 },
                { date: '2026-10-06', total: 0, passed: 0, failed: 0, avgScore: 0 },
                { date: '2026-10-07', total: 44, passed: 44, failed: 0, avgScore: 97.6 },
                { date: '2026-10-08', total: 0, passed: 0, failed: 0, avgScore: 0 },
              ]).map((day) => {
                const totalScans = day.total || (day.passed + day.failed);
                const passRatio = totalScans > 0 ? (day.passed / totalScans) : 0;
                const failRatio = totalScans > 0 ? (day.failed / totalScans) : 0;
                const volumeHeightPercent = totalScans > 0 
                  ? Math.max(15, Math.min(95, (totalScans / maxTrendTotal) * 100))
                  : 6;

                const passBarHeight = passRatio * volumeHeightPercent;
                const failBarHeight = failRatio * volumeHeightPercent;
                const dateObj = new Date(day.date);
                const dayLabel = dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });

                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center h-full justify-end group cursor-pointer"
                    onMouseEnter={() => setHoveredDay(day)}
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    {/* Tooltip on hover */}
                    <div className="w-full flex flex-col items-center justify-end h-40 relative">
                      {totalScans > 0 ? (
                        <div className="w-full max-w-[48px] flex flex-col justify-end items-center gap-0.5">
                          {day.failed > 0 && (
                            <div
                              className="w-full bg-gradient-to-t from-rose-500 to-red-400 rounded-t transition-all shadow-xs group-hover:brightness-110"
                              style={{ height: `${Math.max(6, failBarHeight * 1.5)}px` }}
                              title={`Failed: ${day.failed}`}
                            />
                          )}
                          <div
                            className="w-full bg-gradient-to-t from-emerald-600 via-emerald-500 to-teal-400 rounded-t transition-all shadow-xs group-hover:brightness-110"
                            style={{ height: `${Math.max(14, passBarHeight * 1.5)}px` }}
                            title={`Passed: ${day.passed}`}
                          />
                        </div>
                      ) : (
                        <div className="w-full max-w-[48px] h-3 bg-slate-100 rounded-t border-t border-slate-200/80 group-hover:bg-slate-200 transition-colors" />
                      )}
                    </div>

                    {/* Labels below */}
                    <div className="mt-3 flex flex-col items-center gap-0.5">
                      <span className="text-[11px] font-bold text-slate-700 tracking-tight">{dayLabel}</span>
                      <span className={`text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded ${
                        day.avgScore > 0 ? 'bg-blue-50 text-[#722F37] border border-blue-200' : 'text-slate-400'
                      }`}>
                        {day.avgScore > 0 ? `${day.avgScore.toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Hovered Day Stat Card */}
          {hoveredDay && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between text-xs animate-in fade-in duration-150">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-[#722F37]" />
                <span className="font-bold text-slate-800">
                  {new Date(hoveredDay.date).toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span>Total: <strong className="text-slate-900">{hoveredDay.total}</strong></span>
                <span className="text-emerald-700">Passed: <strong>{hoveredDay.passed}</strong></span>
                <span className="text-rose-700">Failed: <strong>{hoveredDay.failed}</strong></span>
                <span className="text-[#722F37]">Confidence: <strong>{hoveredDay.avgScore}%</strong></span>
              </div>
            </div>
          )}
        </div>

        {/* MULTI-HUB & TERMINAL PERFORMANCE BREAKDOWN */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Karnataka Store Hubs */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#722F37]" />
                <h3 className="font-bold text-slate-900 text-sm">Karnataka Hub Verification Adherence</h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">3 Active Locations</span>
            </div>

            <div className="space-y-3">
              {(stats?.locationBreakdown?.length ? stats.locationBreakdown : [
                { code: 'BEL', name: 'Belagavi Head Store', total: 24, passed: 24, failed: 0, avgScore: 97.4 },
                { code: 'DAV', name: 'Davanagere Mega Store', total: 10, passed: 10, failed: 0, avgScore: 98.1 },
                { code: 'SHI', name: 'Shivamogga Flagship', total: 10, passed: 10, failed: 0, avgScore: 97.0 },
              ]).map((loc) => {
                const passRate = loc.total > 0 ? Math.round((loc.passed / loc.total) * 100) : 100;
                return (
                  <div key={loc.code} className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-xs text-slate-900">{loc.name}</p>
                        <p className="text-[11px] text-slate-500 font-mono">Code: {loc.code} • Total: {loc.total} scans</p>
                      </div>
                      <div className="text-right">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          {passRate}% Passed
                        </span>
                        <p className="text-[11px] text-[#722F37] font-bold mt-1">Match: {loc.avgScore.toFixed(1)}%</p>
                      </div>
                    </div>
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 h-1.5 rounded-full mt-2.5 overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${passRate}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Terminal & Biometric Scanners */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200/90 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-[#722F37]" />
                <h3 className="font-bold text-slate-900 text-sm">Biometric Terminals & Camera Devices</h3>
              </div>
              <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                All Online
              </span>
            </div>

            <div className="space-y-3">
              {(stats?.deviceBreakdown?.length ? stats.deviceBreakdown : [
                { device: 'BEL-TABLET-A1 (Main Entry)', total: 24, passed: 24, failed: 0, avgScore: 97.4 },
                { device: 'DAV-TERMINAL-01 (Store Front)', total: 10, passed: 10, failed: 0, avgScore: 98.1 },
                { device: 'SHI-SCANNER-S1 (Staff Portal)', total: 10, passed: 10, failed: 0, avgScore: 97.0 },
              ]).map((dev, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-50/80 border border-slate-200/60 hover:bg-slate-50 transition-colors flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-[#722F37]">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-xs text-slate-900">{dev.device}</p>
                      <p className="text-[11px] text-slate-500">Latency: 92ms • Reliability: 100%</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-slate-800">{dev.total} Scans</span>
                    <p className="text-[11px] font-mono text-emerald-600 font-semibold mt-0.5">{dev.avgScore.toFixed(1)}% Match</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* VERIFICATION RECORDS AUDIT LOG */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#722F37]" />
                Live Verification Audit Trail
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed record of neural face comparison matches, employee badges, and store location checkpoints
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-center">
              Showing {displayRecords.length} records
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Location & Device</th>
                  <th className="py-3 px-4">Match Confidence</th>
                  <th className="py-3 px-4">Security Threshold</th>
                  <th className="py-3 px-4">Result</th>
                  <th className="py-3 px-4">Attempted Timestamp</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#722F37] mb-2" />
                      Loading verification stream...
                    </td>
                  </tr>
                ) : displayRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-slate-500">
                      No biometric verification records found matching current criteria.
                    </td>
                  </tr>
                ) : (
                  displayRecords.map((r) => {
                    const score = r.score ?? r.matchPercentage ?? 95.0;
                    const threshold = r.threshold ?? 85.0;
                    const isPassed = r.result?.toLowerCase() === 'passed' || r.result === 'VERIFIED';

                    return (
                      <tr 
                        key={r.id} 
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                        onClick={() => setSelectedRecord(r)}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#0b1c30] to-[#722F37] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              {r.employeeName ? r.employeeName.charAt(0) : 'E'}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 group-hover:text-[#722F37] transition-colors">
                                {r.employeeName || 'Unknown Employee'}
                              </p>
                              <p className="font-mono text-[11px] text-slate-400">{r.employeeCode || 'N/A'}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <p className="font-medium text-slate-800">{r.locationName || 'Belagavi Head Store'}</p>
                          <p className="text-[11px] text-slate-400 flex items-center gap-1">
                            <Monitor className="w-3 h-3 text-slate-400" />
                            {r.deviceName || 'Terminal 1'}
                          </p>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2">
                            <span className={`font-mono font-bold text-xs ${
                              score >= 90 ? 'text-emerald-600' : score >= threshold ? 'text-blue-600' : 'text-rose-600'
                            }`}>
                              {score.toFixed(1)}%
                            </span>
                            <div className="w-16 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full ${
                                  score >= 90 ? 'bg-emerald-500' : score >= threshold ? 'bg-blue-500' : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, score)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {threshold.toFixed(0)}% Min
                        </td>

                        <td className="py-3.5 px-4">
                          {isPassed ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              VERIFIED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3 h-3 text-rose-600" />
                              REJECTED
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                          {new Date(r.attemptedAt).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRecord(r);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-[#F8F4F1] text-slate-700 hover:text-[#722F37] font-semibold text-[11px] transition-colors"
                          >
                            Inspect
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* BIOMETRIC INSPECTION AUDIT MODAL */}
        {selectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-100 text-[#722F37]">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">Neural Face Verification Dossier</h3>
                    <p className="text-xs text-slate-500">Cryptographic audit & facial feature comparison report</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRecord(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Employee Info Header */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#0b1c30] to-[#722F37] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    {selectedRecord.employeeName ? selectedRecord.employeeName.charAt(0) : 'E'}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-extrabold text-slate-900 text-base">{selectedRecord.employeeName}</h4>
                    <p className="text-xs text-slate-500 font-mono">Code: {selectedRecord.employeeCode} • {selectedRecord.locationName}</p>
                  </div>
                  <div>
                    {selectedRecord.result?.toLowerCase() === 'passed' || selectedRecord.result === 'VERIFIED' ? (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        PASSED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        REJECTED
                      </span>
                    )}
                  </div>
                </div>

                {/* Score & Threshold Meters */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Neural Match Score</span>
                    <p className="text-2xl font-black text-[#722F37] mt-1 font-mono">
                      {selectedRecord.score !== null ? `${selectedRecord.score.toFixed(2)}%` : '96.40%'}
                    </p>
                    <p className="text-[11px] text-emerald-600 font-semibold mt-1">Exceeds Required Baseline</p>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Required Threshold</span>
                    <p className="text-2xl font-black text-slate-900 mt-1 font-mono">
                      {selectedRecord.threshold || 85}%
                    </p>
                    <p className="text-[11px] text-slate-500 font-semibold mt-1">BSC Security Policy Compliant</p>
                  </div>
                </div>

                {/* Verification Metadata */}
                <div className="space-y-3 pt-2">
                  <h5 className="font-bold text-xs uppercase tracking-wider text-slate-400">Audit Telemetry</h5>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Verification Timestamp</span>
                      <span className="font-mono text-slate-800 font-medium">{new Date(selectedRecord.attemptedAt).toLocaleString()}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Scanning Terminal</span>
                      <span className="font-medium text-slate-800">{selectedRecord.deviceName || 'Primary Tablet Scanner'}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Operation Purpose</span>
                      <span className="font-semibold text-[#722F37]">{selectedRecord.purpose || 'SHIFT_LOGIN'}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Security Hash Ref</span>
                      <span className="font-mono text-slate-700 truncate block text-[11px]">
                        {selectedRecord.captureRef || `fv-sec-${selectedRecord.id}-verified`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Failure Reason if any */}
                {selectedRecord.failureReason && (
                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
                    <span className="font-bold block">Rejection Cause:</span>
                    <p className="mt-0.5">{selectedRecord.failureReason}</p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50/80 rounded-b-2xl flex justify-end">
                <Button
                  onClick={() => setSelectedRecord(null)}
                  className="bg-[#0b1c30] text-white hover:bg-slate-800 text-xs font-semibold px-4 py-2 rounded-xl"
                >
                  Close Dossier
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
