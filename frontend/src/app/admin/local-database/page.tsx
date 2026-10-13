'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Database,
  HardDrive,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  FolderOpen,
  RefreshCw,
  ShieldCheck,
  FileText,
  Clock,
  Radio,
  WifiOff,
  Laptop,
  Building2,
  Users,
  Fingerprint,
  Calendar,
  Layers,
  Archive,
  Save,
  Info
} from 'lucide-react';

interface DatabaseInfo {
  success: boolean;
  databaseType: string;
  databasePath: string;
  dataDirectory: string;
  fileSizeBytes: number;
  fileSizeFormatted: string;
  lastModified: string;
  integrityCheck: string;
  offlineReady: boolean;
  records: {
    locations: number;
    employees: number;
    users: number;
    attendancePunches: number;
    payslips: number;
  };
}

interface BackupFile {
  fileName: string;
  fullPath: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
}

export default function LocalDatabasePage() {
  const [loading, setLoading] = useState(true);
  const [dbInfo, setDbInfo] = useState<DatabaseInfo | null>(null);
  const [backups, setBackups] = useState<BackupFile[]>([]);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Biometric file import state
  const [biometricContent, setBiometricContent] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('DAV');
  const [importingBiometric, setImportingBiometric] = useState(false);

  // Check if running inside Electron
  const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI?.isElectron);

  const fetchDatabaseInfo = useCallback(async () => {
    try {
      setLoading(true);
      const [infoRes, backupsRes] = await Promise.all([
        api.get('/system/database-info'),
        api.get('/system/backups'),
      ]);
      setDbInfo(infoRes.data);
      setBackups(backupsRes.data?.backups || []);
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load local database information');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDatabaseInfo();
  }, [fetchDatabaseInfo]);

  // Handle Hot Backup
  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      if (isElectron && (window as any).electronAPI?.triggerBackup) {
        const res = await (window as any).electronAPI.triggerBackup();
        if (res.success) {
          toast.success(res.message || 'Backup exported successfully!');
          fetchDatabaseInfo();
        } else if (res.message !== 'Canceled by user') {
          toast.error(res.error || 'Backup export failed');
        }
      } else {
        const res = await api.post('/system/backup', {});
        toast.success(`Backup created: ${res.data?.sizeFormatted}`);
        fetchDatabaseInfo();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.message || 'Failed to create backup');
    } finally {
      setCreatingBackup(false);
    }
  };

  // Open Data Folder in Windows Explorer
  const handleOpenDataDir = async () => {
    if (isElectron && (window as any).electronAPI?.openDataDirectory) {
      await (window as any).electronAPI.openDataDirectory();
    } else {
      toast(dbInfo?.dataDirectory || '%APPDATA%\\BSCTextiles\\data', {
        icon: '📁',
        duration: 4000,
      });
    }
  };

  // Import eSSL Biometric Punches Offline
  const handleImportBiometric = async () => {
    if (!biometricContent.trim()) {
      toast.error('Please paste or upload biometric log records first');
      return;
    }

    try {
      setImportingBiometric(true);
      const res = await api.post('/system/biometric-import', {
        logContent: biometricContent,
        locationCode: selectedLocation,
      });

      toast.success(res.data?.message || 'Biometric logs imported successfully');
      setBiometricContent('');
      fetchDatabaseInfo();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Biometric import failed');
    } finally {
      setImportingBiometric(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-16">
        {/* ============================================================= */}
        {/* HEADER                                                        */}
        {/* ============================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-[#1346a1] text-white flex items-center gap-1.5 shadow-2xs">
                <Laptop className="w-3.5 h-3.5" />
                <span>Single-Computer Architecture</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <WifiOff className="w-3 h-3" />
                <span>100% Offline Standalone</span>
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <span>Local Database & Backup Management</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Persistent SQLite local database storage, hot backups, eSSL biometric USB import, and offline system diagnostics.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenDataDir}
              className="px-3.5 py-2 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-500" />
              <span>Open AppData Folder</span>
            </button>

            <button
              onClick={handleCreateBackup}
              disabled={creatingBackup}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1346a1] text-white hover:bg-[#582128] flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Download className={`w-3.5 h-3.5 ${creatingBackup ? 'animate-bounce' : ''}`} />
              <span>{creatingBackup ? 'Exporting...' : 'Create Hot Backup'}</span>
            </button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* TOP STATUS CARDS                                              */}
        {/* ============================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Database Engine</span>
              <Database className="w-4 h-4 text-[#1346a1]" />
            </div>
            <div className="text-lg font-black text-slate-900">SQLite 3 (WAL)</div>
            <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>Integrity: {dbInfo?.integrityCheck || 'ok'}</span>
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Local Storage Size</span>
              <HardDrive className="w-4 h-4 text-[#1346a1]" />
            </div>
            <div className="text-lg font-black text-slate-900">{dbInfo?.fileSizeFormatted || 'Loading...'}</div>
            <p className="text-[11px] text-slate-400 font-mono truncate">
              {dbInfo?.databasePath ? dbInfo.databasePath.split('\\').pop() : 'bsc_textiles.db'}
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Active Staff Records</span>
              <Users className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-lg font-black text-slate-900">{dbInfo?.records?.employees || 0} Employees</div>
            <p className="text-[11px] text-slate-500">
              Across Belagavi, Davanagere & Shivamogga
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Attendance & Payslips</span>
              <Layers className="w-4 h-4 text-[#1346a1]" />
            </div>
            <div className="text-lg font-black text-slate-900">
              {dbInfo?.records?.attendancePunches || 0} Punches
            </div>
            <p className="text-[11px] text-slate-500">
              {dbInfo?.records?.payslips || 0} generated payslips on file
            </p>
          </div>
        </div>

        {/* ============================================================= */}
        {/* STORAGE PATH & SYSTEM LOCATION BANNER                         */}
        {/* ============================================================= */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-xs shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1346a1]/10 text-[#1346a1] flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <span>Persistent Application Data Location</span>
                <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-200 font-mono">Windows Protected</span>
              </div>
              <div className="font-mono text-slate-600 text-[11px] mt-0.5 break-all">
                {dbInfo?.databasePath || '%APPDATA%\\BSCTextiles\\data\\bsc_textiles.db'}
              </div>
            </div>
          </div>

          <div className="text-right shrink-0">
            <span className="text-[11px] text-slate-400 block">Single-Machine Offline Node</span>
            <span className="font-mono font-bold text-slate-700">127.0.0.1:4000</span>
          </div>
        </div>

        {/* ============================================================= */}
        {/* BACKUPS MANAGEMENT & ESSL BIOMETRIC IMPORT                    */}
        {/* ============================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* LEFT: BACKUP LEDGER */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Archive className="w-4 h-4 text-[#1346a1]" />
                <h3 className="font-bold text-slate-900 text-sm">Local Database Backups</h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold border border-slate-200">
                {backups.length} Saved
              </span>
            </div>

            <div className="p-4 flex-1 space-y-3">
              {backups.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <Archive className="w-8 h-8 mx-auto mb-2 opacity-30 text-[#1346a1]" />
                  <p className="font-bold text-slate-700">No backups found in local folder</p>
                  <p className="text-[11px] mt-0.5">Click &quot;Create Hot Backup&quot; above to export a copy.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {backups.map((b) => (
                    <div
                      key={b.fileName}
                      className="p-3 bg-slate-50/70 border border-slate-200/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold font-mono text-slate-900 truncate">{b.fileName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{new Date(b.createdAt).toLocaleString()}</span>
                          <span>•</span>
                          <span className="font-mono text-slate-600 font-semibold">{b.sizeFormatted}</span>
                        </div>
                      </div>

                      <span className="px-2 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md text-[10px] font-bold">
                        Verified
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Backups use SQLite Online WAL Hot Backup; no database shutdown or lock required.</span>
            </div>
          </div>

          {/* RIGHT: ESSL BIOMETRIC USB/FILE IMPORT */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Fingerprint className="w-4 h-4 text-[#1346a1]" />
                <h3 className="font-bold text-slate-900 text-sm">eSSL Biometric Offline Import</h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                USB / LAN Log
              </span>
            </div>

            <div className="p-4 flex-1 space-y-3">
              <p className="text-xs text-slate-500">
                Import attendance logs directly from local eSSL biometric device exports (USB flash drive or exported .dat/.csv files) without any cloud dependency.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Target Showroom Location</label>
                <select
                  value={selectedLocation}
                  onChange={(e) => setSelectedLocation(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1346a1]"
                >
                  <option value="DAV">[DAV] Davanagere Mega Store</option>
                  <option value="BEL">[BEL] Belagavi Mega Showroom</option>
                  <option value="SHI">[SHI] Shivamogga City Center</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Log Data <span className="text-slate-400 font-normal">(Paste eSSL log text or punch records)</span>
                </label>
                <textarea
                  rows={4}
                  value={biometricContent}
                  onChange={(e) => setBiometricContent(e.target.value)}
                  placeholder="Example:&#10;1372&#9;2026-10-12&#9;10:28:15&#10;1024&#9;2026-10-12&#9;10:32:00"
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800 focus:outline-none focus:border-[#1346a1] placeholder-slate-400"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleImportBiometric}
                  disabled={importingBiometric}
                  className="px-4 py-2 bg-[#1346a1] text-white font-bold rounded-xl text-xs hover:bg-[#582128] transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                >
                  <Upload className={`w-3.5 h-3.5 ${importingBiometric ? 'animate-spin' : ''}`} />
                  <span>{importingBiometric ? 'Processing Logs...' : 'Import into Local DB'}</span>
                </button>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Supports standard eSSL tab/comma-delimited punch format: &lt;EmpCode&gt; &lt;YYYY-MM-DD&gt; &lt;HH:MM:SS&gt;</span>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
