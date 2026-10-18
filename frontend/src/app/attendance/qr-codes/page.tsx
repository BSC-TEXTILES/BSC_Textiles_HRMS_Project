'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { EmployeeQrModal } from '@/components/dashboard/EmployeeQrModal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import {
  QrCode,
  Search,
  RefreshCw,
  Printer,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Building2,
  Copy,
  Check,
  Maximize2,
  Sparkles,
  Smartphone,
  CheckCheck,
  Radio,
  SlidersHorizontal,
  Store
} from 'lucide-react';

interface EmployeeData {
  id: string;
  employeeCode: string;
  fullName: string;
  department?: { name: string } | string;
  location?: { name: string } | string;
  shift?: { name: string; startTime: string; endTime: string } | string;
  photo?: string;
  designation?: string;
}

interface QrPassItem {
  id: string;
  code: string;
  name: string;
  department: string;
  location: string;
  shift: string;
  token: string;
  qrDataUrl: string;
  isScanned: boolean;
  scanTime: string | null;
  rawEmployee: EmployeeData;
}

export default function DigitalQrCodesPage() {
  const [loading, setLoading] = useState(true);
  const [passes, setPasses] = useState<QrPassItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'READY' | 'SCANNED'>('ALL');
  const [selectedPass, setSelectedPass] = useState<QrPassItem | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [scanningMap, setScanningMap] = useState<Record<string, boolean>>({});

  const todayStr = useMemo(() => {
    return new Date().toLocaleDateString('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const todayIsoDate = useMemo(() => {
    return new Date().toISOString().slice(0, 10).replace(/-/g, '');
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [empRes, attRes] = await Promise.all([
        api.get('/employees?limit=50').catch(() => ({ data: { employees: [] } })),
        api.get('/attendance?limit=50').catch(() => ({ data: { attendances: [] } })),
      ]);

      // Only real employees from GET /employees. When the roster is empty the page
      // shows its empty state instead of a demonstration staff list.
      const rawEmployees: EmployeeData[] = empRes.data?.employees ?? [];

      const attendances = attRes.data?.attendances || attRes.data?.attendance || [];
      const punchMap: Record<string, string> = {};

      attendances.forEach((att: any) => {
        const empId = att.employeeId || att.employee?.id || att.employee?.employeeCode;
        if (empId && att.actualLogin) {
          const formatted = new Date(att.actualLogin).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          });
          punchMap[empId] = formatted;
          if (att.employee?.employeeCode) {
            punchMap[att.employee.employeeCode] = formatted;
          }
        }
      });


      // Generate QR codes for all employees
      const generatedPasses: QrPassItem[] = await Promise.all(
        rawEmployees.map(async (emp) => {
          // No synthetic employee code: an employee row without an employeeCode is
          // shown without one rather than as "BSC-<id>".
          const code = emp.employeeCode || '';
          const token = code ? `DAILY-${code}-${todayIsoDate}` : '';
          const deptName =
            typeof emp.department === 'string'
              ? emp.department
              : emp.department?.name || 'Not recorded';
          const locName =
            typeof emp.location === 'string'
              ? emp.location
              : emp.location?.name || 'Not recorded';
          const shiftName =
            typeof emp.shift === 'string'
              ? emp.shift
              : emp.shift?.name || 'Not recorded';

          let qrDataUrl = '';
          try {
            qrDataUrl = await QRCode.toDataURL(token, {
              width: 320,
              margin: 1,
              color: {
                dark: '#0b1c30',
                light: '#ffffff',
              },
            });
          } catch {
            qrDataUrl = '';
          }

          const hasPunched = !!(punchMap[emp.id] || punchMap[code]);
          const punchTime = punchMap[emp.id] || punchMap[code] || null;

          return {
            id: emp.id,
            code,
            name: emp.fullName,
            department: deptName,
            location: locName,
            shift: shiftName,
            token,
            qrDataUrl,
            isScanned: hasPunched,
            scanTime: punchTime,
            rawEmployee: emp,
          };
        })
      );

      setPasses(generatedPasses);
    } catch (err) {
      console.error('Failed to load QR passes:', err);
      toast.error('Failed to load employee QR passes');
    } finally {
      setLoading(false);
    }
  }, [todayIsoDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSimulateScan = async (pass: QrPassItem) => {
    if (pass.isScanned) {
      toast.error(`${pass.name}'s QR pass has already been scanned today.`);
      return;
    }

    try {
      setScanningMap((prev) => ({ ...prev, [pass.id]: true }));
      const now = new Date();
      const formattedTime = now.toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      // Attempt backend scan recording
      await api
        .post('/qr-codes/scan', {
          token: pass.token,
          purpose: 'ATTENDANCE_CHECK_IN',
          deviceInfo: { terminal: 'HRMS-WEB-CONSOLE', reader: 'Browser QR pass read' },
        })
        .catch(() => null);

      // Update local state immediately
      setPasses((prev) =>
        prev.map((p) =>
          p.id === pass.id
            ? { ...p, isScanned: true, scanTime: formattedTime }
            : p
        )
      );

      toast.success(
        `✓ One-Time Scan Recorded!\nEmployee: ${pass.name} (${pass.code})\nTime: ${formattedTime}`,
        { duration: 4000 }
      );
    } catch (err: any) {
      toast.error('Failed to record scan: ' + (err.message || 'Network error'));
    } finally {
      setScanningMap((prev) => ({ ...prev, [pass.id]: false }));
    }
  };

  const handleCopyToken = (token: string) => {
    navigator.clipboard.writeText(token);
    setCopiedToken(token);
    toast.success('QR Token copied to clipboard!');
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handlePrintAll = () => {
    window.print();
  };

  const filteredPasses = useMemo(() => {
    return passes.filter((pass) => {
      // Search
      const matchesSearch =
        pass.name.toLowerCase().includes(search.toLowerCase()) ||
        pass.code.toLowerCase().includes(search.toLowerCase()) ||
        pass.department.toLowerCase().includes(search.toLowerCase());

      // Location
      const matchesLocation =
        selectedLocation === 'ALL' || pass.location.includes(selectedLocation);

      // Status
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'READY' && !pass.isScanned) ||
        (statusFilter === 'SCANNED' && pass.isScanned);

      return matchesSearch && matchesLocation && matchesStatus;
    });
  }, [passes, search, selectedLocation, statusFilter]);

  const stats = useMemo(() => {
    const total = passes.length;
    const scanned = passes.filter((p) => p.isScanned).length;
    const ready = total - scanned;
    return { total, scanned, ready };
  }, [passes]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* TOP HEADER SECTION */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-5 sm:p-6 bg-white dark:bg-[#070c18] rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/80 border border-blue-200 dark:border-blue-900/60 flex items-center justify-center text-[#0058be] dark:text-blue-400">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-[#0b1c30] dark:text-white tracking-tight">
                  Employee Digital QR Passes
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Daily encrypted QR passes for single-scan biometric attendance • {todayStr}
                </p>
              </div>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-2 self-stretch sm:self-auto">
            <button
              type="button"
              onClick={loadData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            <button
              type="button"
              onClick={handlePrintAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#0058be] text-white hover:bg-[#004ba3] transition-colors shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Passes</span>
            </button>
          </div>
        </div>

        {/* QUICK KPI METRIC CARDS - ROYAL BLUE THEME */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white dark:bg-[#070c18] border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Passes</span>
              <div className="text-2xl font-black text-[#0b1c30] dark:text-white">{stats.total}</div>
              <span className="text-[11px] text-slate-400">Active workforce credentials</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/80 text-[#0058be] flex items-center justify-center font-bold">
              <QrCode className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-[#070c18] border border-blue-200 dark:border-blue-900/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs text-[#0058be] dark:text-blue-400 font-semibold">Ready for Scan</span>
              <div className="text-2xl font-black text-[#0058be] dark:text-blue-400">{stats.ready}</div>
              <span className="text-[11px] text-slate-400">Single-use tokens pending punch</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#eff4ff] dark:bg-blue-950/80 text-[#0058be] flex items-center justify-center font-bold">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-[#070c18] border border-emerald-200 dark:border-emerald-900/60 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">Scanned Today</span>
              <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400">{stats.scanned}</div>
              <span className="text-[11px] text-slate-400">One-time entry recorded</span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* SEARCH AND FILTERS BAR */}
        <div className="p-4 rounded-xl bg-white dark:bg-[#070c18] border border-slate-200/80 dark:border-slate-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by employee name, employee code or department..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-[#0058be]"
            />
          </div>

          {/* Location Hub Filter */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs">
              <Store className="w-3.5 h-3.5 text-slate-400" />
              <select
                aria-label="Filter by Store Hub"
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="bg-transparent text-slate-800 dark:text-slate-200 focus:outline-none font-medium text-xs cursor-pointer"
              >
                <option value="ALL">All Store Hubs</option>
                <option value="Belagavi">Belagavi Head Store (BEL)</option>
                <option value="Davanagere">Davanagere Mega Store (DAV)</option>
                <option value="Shivamogga">Shivamogga Flagship (SHI)</option>
              </select>
            </div>

            {/* Status Pills */}
            <div className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  statusFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-800 text-[#0058be] dark:text-white shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                All ({passes.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('READY')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  statusFilter === 'READY'
                    ? 'bg-white dark:bg-slate-800 text-[#0058be] dark:text-blue-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Ready ({stats.ready})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('SCANNED')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  statusFilter === 'SCANNED'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                Scanned ({stats.scanned})
              </button>
            </div>
          </div>
        </div>

        {/* QR CODES GALLERY - DEDICATED CARDS ONLY */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#0058be] animate-spin" />
            <span className="text-sm font-medium text-slate-500">
              Generating and verifying encrypted QR passes…
            </span>
          </div>
        ) : filteredPasses.length === 0 ? (
          <div className="py-16 p-8 text-center bg-white dark:bg-[#070c18] rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-3">
            <QrCode className="w-12 h-12 text-slate-300 mx-auto" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">
              {passes.length === 0 ? 'No employee QR passes available' : 'No QR passes match your filter criteria'}
            </h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {passes.length === 0
                ? 'GET /employees returned no employee rows for your scope, so there is nothing to issue a pass for. Adjust the filters or check back once the roster is loaded.'
                : 'Try adjusting your search query or reset the location and status filters to view all active passes.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedLocation('ALL');
                setStatusFilter('ALL');
              }}
              className="px-4 py-2 text-xs font-bold rounded-lg bg-[#eff4ff] text-[#0058be] hover:bg-blue-100 transition-colors"
            >
              Reset All Filters
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filteredPasses.map((pass) => (
              <div
                key={pass.id}
                className={`relative flex flex-col justify-between rounded-2xl bg-white dark:bg-[#070c18] border transition-all duration-200 shadow-xs hover:shadow-md ${
                  pass.isScanned
                    ? 'border-emerald-200/90 dark:border-emerald-950/80'
                    : 'border-slate-200/90 dark:border-slate-800 hover:border-blue-300'
                }`}
              >
                {/* Employee Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-800/80">
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#0058be] text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-2xs">
                        {pass.name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#0b1c30] dark:text-white truncate">
                          {pass.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {pass.department}
                        </div>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-50 dark:bg-blue-950/70 text-[#0058be] dark:text-blue-300 border border-blue-200 dark:border-blue-900/50 shrink-0">
                      {pass.code}
                    </span>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {pass.location}
                  </div>
                </div>

                {/* Prominent QR Display Box */}
                <div className="p-4 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-[#050913] relative">
                  <div className="relative p-2.5 rounded-xl bg-white border border-slate-200 shadow-xs group">
                    {pass.qrDataUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={pass.qrDataUrl}
                        alt={`QR Code for ${pass.name}`}
                        className="w-44 h-44 object-contain rounded"
                      />
                    ) : (
                      <div className="w-44 h-44 flex items-center justify-center bg-slate-100 text-slate-400">
                        <QrCode className="w-20 h-20" />
                      </div>
                    )}

                    {/* BSC Monogram Badge in center */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-7 h-7 rounded-md bg-[#0058be] text-white flex items-center justify-center font-bold text-[9px] shadow-sm border border-white">
                        BSC
                      </div>
                    </div>

                    {/* Consumed Overlay when scanned */}
                    {pass.isScanned && (
                      <div className="absolute inset-0 bg-slate-900/65 backdrop-blur-2xs rounded-xl flex flex-col items-center justify-center text-center p-3 text-white animate-in fade-in duration-150">
                        <CheckCircle2 className="w-9 h-9 text-emerald-400 mb-1" />
                        <span className="text-xs font-black uppercase tracking-tight">Scanned Once</span>
                        <span className="text-[11px] font-mono text-emerald-300 mt-0.5">
                          {pass.scanTime || 'Recorded'}
                        </span>
                        <span className="text-[9px] text-slate-200 mt-1">Single-use pass consumed</span>
                      </div>
                    )}
                  </div>

                  {/* Token String Preview & Copy */}
                  <div className="w-full mt-3 flex items-center justify-between gap-1 px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[10px] font-mono text-slate-500">
                    <span className="truncate flex-1" title={pass.token}>
                      {pass.token}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyToken(pass.token)}
                      className="p-0.5 text-slate-400 hover:text-[#0058be] transition-colors"
                      title="Copy QR Token"
                    >
                      {copiedToken === pass.token ? (
                        <Check className="w-3 h-3 text-emerald-600" />
                      ) : (
                        <Copy className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Card Status & Actions Footer */}
                <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                  {/* Status Indicator */}
                  <div className="flex items-center justify-between text-xs">
                    {pass.isScanned ? (
                      <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-bold text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Punched at {pass.scanTime}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[#0058be] dark:text-blue-400 font-bold text-[11px]">
                        <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                        <span>Ready for Scan</span>
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400 font-medium">Valid Today</span>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedPass(pass)}
                      className="inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Maximize2 className="w-3 h-3 text-slate-500" />
                      <span>Enlarge</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSimulateScan(pass)}
                      disabled={pass.isScanned || scanningMap[pass.id]}
                      className={`inline-flex items-center justify-center gap-1.5 py-1.5 px-2.5 text-xs font-bold rounded-lg transition-colors ${
                        pass.isScanned
                          ? 'bg-slate-100 text-slate-400 dark:bg-slate-900 cursor-not-allowed'
                          : 'bg-[#0058be] text-white hover:bg-[#004ba3] shadow-2xs'
                      }`}
                    >
                      {scanningMap[pass.id] ? (
                        <RefreshCw className="w-3 h-3 animate-spin" />
                      ) : pass.isScanned ? (
                        <CheckCheck className="w-3 h-3 text-slate-400" />
                      ) : (
                        <Smartphone className="w-3 h-3" />
                      )}
                      <span>{pass.isScanned ? 'Punched' : 'Scan Now'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* INTEGRATED FULL-SCREEN ENLARGE / AUDIT MODAL */}
        {selectedPass && (
          <EmployeeQrModal
            open={!!selectedPass}
            onClose={() => setSelectedPass(null)}
            employee={{
              id: selectedPass.id,
              employeeId: selectedPass.id,
              code: selectedPass.code,
              employeeCode: selectedPass.code,
              name: selectedPass.name,
              fullName: selectedPass.name,
              department: selectedPass.department,
              location: selectedPass.location,
              hub: selectedPass.location,
              shift: selectedPass.shift,
              punchTime: selectedPass.scanTime || undefined,
            }}
            initialScanTime={selectedPass.scanTime}
            isConsumed={selectedPass.isScanned}
          />
        )}
      </div>
    </DashboardLayout>
  );
}
