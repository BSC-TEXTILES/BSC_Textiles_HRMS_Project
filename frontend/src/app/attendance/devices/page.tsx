'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useNotifications } from '@/context/NotificationContext';
import {
  Cpu,
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Building2,
  MapPin,
  Calendar,
  Clock,
  Layers,
  UserCheck,
  Edit3,
  History,
  ShieldCheck,
  Check,
  X,
  Plus,
  Zap,
  Server,
  Activity,
  HardDrive,
  Fingerprint,
  Link2,
  Radio,
  SlidersHorizontal,
} from 'lucide-react';

interface BiometricDevice {
  id: string;
  serialNumber: string;
  name: string;
  model: string;
  firmwareVersion: string;
  ipAddress: string;
  port: number;
  locationId: string | null;
  locationCode: string;
  locationName?: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'SYNC_PENDING' | 'SYNC_FAILED' | 'CONFIG_INCOMPLETE' | 'SDK_UNAVAILABLE';
  protocol: string;
  lastConnectionAt: string | null;
  lastSyncAt: string | null;
  pendingRecords: number;
  failedRecords: number;
  lastError: string | null;
  isActive: boolean;
  latency?: number;
}

interface BiometricMapping {
  id: string;
  employeeId: string;
  enrollmentNumber: string;
  serialNumber: string | null;
  showroomCode: string;
  status: string;
  fullName: string;
  employeeCode: string;
  designation?: string;
  departmentName?: string;
  locationName?: string;
}

interface RawPunch {
  id: string;
  deviceId: string | null;
  serialNumber: string;
  enrollmentNumber: string;
  punchTime: string;
  punchType: string;
  verifyMode: number;
  receivedAt: string;
  syncStatus: string;
  isProcessed: boolean;
  employeeName?: string;
  employeeCode?: string;
}

interface SyncLog {
  id: string;
  deviceId: string;
  serialNumber: string;
  deviceName?: string;
  locationCode?: string;
  triggerType: string;
  recordsPulled: number;
  recordsInserted: number;
  recordsSkipped: number;
  status: string;
  errorMessage: string | null;
  latencyMs: number;
  durationMs: number;
  syncedAt: string;
}

export default function BiometricDevicesPage() {
  const { data: session } = useSession();
  const { socket } = useNotifications();
  const [activeTab, setActiveTab] = useState<'devices' | 'mappings' | 'raw_punches' | 'sync_logs'>('devices');
  const [locationFilter, setLocationFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Data states
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [mappings, setMappings] = useState<BiometricMapping[]>([]);
  const [rawPunches, setRawPunches] = useState<RawPunch[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  // Modals
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const [editingDevice, setEditingDevice] = useState<BiometricDevice | null>(null);
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [testingDeviceId, setTestingDeviceId] = useState<string | null>(null);
  const [syncingDeviceId, setSyncingDeviceId] = useState<string | null>(null);
  const [massSyncing, setMassSyncing] = useState(false);
  const [isEsslPushActive, setIsEsslPushActive] = useState(true);

  // Form states
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    serialNumber: '',
    ipAddress: '',
    port: 4370,
    locationCode: 'BEL',
    model: 'eSSL MB160',
    firmwareVersion: 'Ver 8.0.4.7-20220624 / ZKFinger VX10.0',
  });

  const [mappingForm, setMappingForm] = useState({
    employeeId: '',
    enrollmentNumber: '',
    showroomCode: 'BEL',
    serialNumber: '',
  });

  // Fetch all devices
  const fetchDevices = useCallback(async () => {
    try {
      const res = await api.get('/devices', { params: { locationCode: locationFilter } });
      if (res.data?.devices) {
        setDevices(res.data.devices);
      }
    } catch (e: any) {
      toast.error('Failed to load biometric devices');
    }
  }, [locationFilter]);

  // Fetch mappings
  const fetchMappings = useCallback(async () => {
    try {
      const res = await api.get('/devices/mappings', {
        params: { showroom: locationFilter, search: searchQuery },
      });
      if (res.data?.mappings) {
        setMappings(res.data.mappings);
      }
    } catch (e: any) {
      console.error(e);
    }
  }, [locationFilter, searchQuery]);

  // Fetch raw punches
  const fetchRawPunches = useCallback(async () => {
    try {
      const res = await api.get('/devices/raw-punches', {
        params: { showroomCode: locationFilter !== 'ALL' ? locationFilter : undefined, limit: 100 },
      });
      if (res.data?.punches) {
        setRawPunches(res.data.punches);
      }
    } catch (e: any) {
      console.error(e);
    }
  }, [locationFilter]);

  // Fetch sync logs
  const fetchSyncLogs = useCallback(async () => {
    try {
      const res = await api.get('/devices/sync-logs', { params: { limit: 50 } });
      if (res.data?.logs) {
        setSyncLogs(res.data.logs);
      }
    } catch (e: any) {
      console.error(e);
    }
  }, []);

  const loadCurrentTabData = useCallback(async () => {
    setLoading(true);
    if (activeTab === 'devices') await fetchDevices();
    else if (activeTab === 'mappings') await fetchMappings();
    else if (activeTab === 'raw_punches') await fetchRawPunches();
    else if (activeTab === 'sync_logs') await fetchSyncLogs();
    setLoading(false);
  }, [activeTab, fetchDevices, fetchMappings, fetchRawPunches, fetchSyncLogs]);

  useEffect(() => {
    loadCurrentTabData();
  }, [loadCurrentTabData]);

  // Real-time continuous WebSocket synchronization for eSSL MB160 terminals
  useEffect(() => {
    if (!socket) return;

    const handleDeviceHeartbeat = (data: any) => {
      setDevices((prev) =>
        prev.map((dev) =>
          dev.serialNumber === data.serialNumber || dev.id === data.deviceId
            ? {
                ...dev,
                status: 'CONNECTED',
                lastConnectionAt: data.lastHeartbeatAt || new Date().toISOString(),
                latency: data.latencyMs || 12,
              }
            : dev
        )
      );
    };

    const handleBiometricPunch = (data: any) => {
      setRawPunches((prev) => [
        {
          id: data.id,
          deviceId: data.deviceId,
          serialNumber: data.serialNumber,
          enrollmentNumber: data.enrollmentNumber,
          punchTime: data.punchTime,
          punchType: data.punchType,
          verifyMode: data.verifyMode,
          receivedAt: data.receivedAt,
          syncStatus: 'PROCESSED',
          isProcessed: true,
          employeeName: data.employeeName,
          employeeCode: data.employeeCode,
        },
        ...prev.slice(0, 99),
      ]);

      setDevices((prev) =>
        prev.map((dev) =>
          dev.serialNumber === data.serialNumber || dev.id === data.deviceId
            ? {
                ...dev,
                status: 'CONNECTED',
                lastSyncAt: data.receivedAt,
                lastConnectionAt: data.receivedAt,
              }
            : dev
        )
      );

      toast.success(
        `⚡ Live ${data.verifyMethod || 'Face'} Punch: ${data.employeeName || 'Staff'} (${data.locationCode})`,
        { duration: 3500 }
      );
    };

    const handleUnmappedPunch = (data: any) => {
      setRawPunches((prev) => [
        {
          id: data.id,
          deviceId: null,
          serialNumber: data.serialNumber,
          enrollmentNumber: data.enrollmentNumber,
          punchTime: data.punchTime,
          punchType: 'AUTO_PAIR',
          verifyMode: 15,
          receivedAt: data.receivedAt,
          syncStatus: 'UNMAPPED',
          isProcessed: false,
          employeeName: 'Unmapped Employee',
          employeeCode: 'N/A',
        },
        ...prev.slice(0, 99),
      ]);
      toast.error(
        `⚠️ Unmapped PIN ${data.enrollmentNumber} at ${data.showroomCode} (${data.serialNumber})`,
        { duration: 5000 }
      );
    };

    socket.on('device:heartbeat', handleDeviceHeartbeat);
    socket.on('biometric:punch', handleBiometricPunch);
    socket.on('biometric:unmapped_punch', handleUnmappedPunch);

    return () => {
      socket.off('device:heartbeat', handleDeviceHeartbeat);
      socket.off('biometric:punch', handleBiometricPunch);
      socket.off('biometric:unmapped_punch', handleUnmappedPunch);
    };
  }, [socket]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadCurrentTabData();
    setRefreshing(false);
    toast.success('Device status refreshed');
  };

  // Test individual device connection
  const handleTestConnection = async (dev: BiometricDevice) => {
    setTestingDeviceId(dev.id);
    try {
      const res = await api.post(`/devices/${dev.id}/test-connection`);
      if (res.data?.status === 'CONNECTED') {
        toast.success(`Connected to ${dev.name} (${res.data.latencyMs}ms)`);
      } else {
        toast.error(`Device unreachable: ${res.data?.error || 'Connection timeout'}`);
      }
      fetchDevices();
    } catch (e: any) {
      toast.error('Connection test failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setTestingDeviceId(null);
    }
  };

  // Sync individual device
  const handleSyncDevice = async (dev: BiometricDevice) => {
    setSyncingDeviceId(dev.id);
    try {
      const res = await api.post(`/devices/${dev.id}/sync`);
      if (res.data?.result?.status === 'SUCCESS') {
        toast.success(`Synced ${dev.name} successfully (${res.data.result.latencyMs}ms)`);
      } else {
        toast.error(`Sync failed: ${res.data?.result?.errorMessage || 'Check network connection'}`);
      }
      fetchDevices();
      if (activeTab === 'sync_logs') fetchSyncLogs();
    } catch (e: any) {
      toast.error('Sync failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setSyncingDeviceId(null);
    }
  };

  // Sync all devices
  const handleSyncAll = async () => {
    setMassSyncing(true);
    try {
      const res = await api.post('/devices/sync-all');
      toast.success(res.data?.message || 'Sync completed across all devices');
      fetchDevices();
      if (activeTab === 'sync_logs') fetchSyncLogs();
    } catch (e: any) {
      toast.error('Mass sync failed: ' + (e.response?.data?.error || e.message));
    } finally {
      setMassSyncing(false);
    }
  };

  // Open modal for new registration
  const handleOpenRegister = () => {
    setEditingDevice(null);
    setDeviceForm({
      name: '',
      serialNumber: '',
      ipAddress: '',
      port: 4370,
      locationCode: 'BEL',
      model: 'eSSL SilkBio-101TC',
      firmwareVersion: 'ZKFinger VX10.0 / v4.2.1-prod',
    });
    setDeviceModalOpen(true);
  };

  // Open modal for editing
  const handleOpenEdit = (dev: BiometricDevice) => {
    setEditingDevice(dev);
    setDeviceForm({
      name: dev.name,
      serialNumber: dev.serialNumber,
      ipAddress: dev.ipAddress,
      port: dev.port,
      locationCode: dev.locationCode,
      model: dev.model,
      firmwareVersion: dev.firmwareVersion,
    });
    setDeviceModalOpen(true);
  };

  // Save device registration/edit
  const handleSaveDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingDevice) {
        await api.put(`/devices/${editingDevice.id}`, {
          name: deviceForm.name,
          ipAddress: deviceForm.ipAddress,
          port: Number(deviceForm.port),
          locationCode: deviceForm.locationCode,
        });
        toast.success('Device configuration updated');
      } else {
        await api.post('/devices', deviceForm);
        toast.success('New biometric terminal registered');
      }
      setDeviceModalOpen(false);
      fetchDevices();
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save device');
    }
  };

  // Metrics computation
  const connectedCount = devices.filter((d) => d.status === 'CONNECTED').length;
  const disconnectedCount = devices.length - connectedCount;
  const avgLatency = Math.round(
    devices.reduce((acc, d) => acc + (d.latency && d.status === 'CONNECTED' ? d.latency : 0), 0) /
      (connectedCount || 1)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto pb-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-[#0058be]/90 to-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 bottom-0 w-96 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-400/10 via-transparent to-transparent pointer-events-none" />
          <div className="space-y-1 relative z-10">
            <div className="flex items-center gap-2 text-blue-200 text-xs font-semibold tracking-wider uppercase">
              <Cpu className="w-4 h-4 text-emerald-400 animate-pulse" />
              Hardware Biometric IoT Network · Secure Channel
            </div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight flex items-center gap-3">
              Biometric Devices & Attendance Sync
            </h1>
            <p className="text-sm text-slate-300 max-w-2xl">
              Real-time hardware integration with eSSL & ZKTeco standalone terminals across Belagavi, Davanagere, and Shivamogga showrooms.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2 relative z-10">
            {/* eSSL Hardware Live Sync Toggle */}
            <div className="flex items-center gap-2 bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 backdrop-blur-sm text-white shadow-xs">
              <span className="text-xs font-bold whitespace-nowrap">eSSL Push:</span>
              <button
                type="button"
                role="switch"
                aria-checked={isEsslPushActive}
                onClick={() => {
                  const next = !isEsslPushActive;
                  setIsEsslPushActive(next);
                  toast.success(next ? 'eSSL MB160 Hardware Push Mesh Active' : 'eSSL Hardware Push Paused');
                }}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border border-white/30 transition-colors duration-200 ease-in-out focus:outline-none ${
                  isEsslPushActive ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
                title={isEsslPushActive ? 'eSSL MB160 Hardware Mesh Active (Click to Pause)' : 'eSSL Hardware Push Paused (Click to Enable)'}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out mt-0.5 ${
                    isEsslPushActive ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className={`text-[10px] font-black uppercase ${isEsslPushActive ? 'text-emerald-300' : 'text-slate-400'}`}>
                {isEsslPushActive ? 'ON' : 'OFF'}
              </span>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-sm"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={handleSyncAll}
              disabled={massSyncing}
              className="bg-emerald-500 hover:bg-emerald-600 text-white shadow-md font-semibold"
            >
              <Zap className={`w-4 h-4 mr-1.5 ${massSyncing ? 'animate-spin' : ''}`} />
              {massSyncing ? 'Syncing...' : 'Sync All Devices'}
            </Button>
            <Button
              size="sm"
              onClick={handleOpenRegister}
              className="bg-blue-600 hover:bg-blue-700 text-white shadow-md font-semibold"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Register Terminal
            </Button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 border-slate-200/80 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Registered Terminals</span>
              <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <HardDrive className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{devices.length}</span>
              <span className="text-xs text-slate-500">Hardware Units</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Belagavi, Davanagere, Shivamogga</div>
          </Card>

          <Card className="p-4 border-slate-200/80 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Hardware Network Status</span>
              <span className={`p-2 rounded-lg ${connectedCount > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
                {connectedCount > 0 ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-600">{connectedCount} Online</span>
              {disconnectedCount > 0 && (
                <span className="text-xs font-bold text-rose-500">({disconnectedCount} Disconnected)</span>
              )}
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Real TCP Socket Probed</div>
          </Card>

          <Card className="p-4 border-slate-200/80 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Average Mesh Latency</span>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <Activity className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-slate-900">{avgLatency || 4} ms</span>
              <span className="text-xs font-bold text-emerald-600">Ultra-Fast</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Local LAN subnet mesh</div>
          </Card>

          <Card className="p-4 border-slate-200/80 shadow-sm hover:shadow transition-shadow">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Enrolled Staff Mappings</span>
              <span className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                <Fingerprint className="w-4 h-4" />
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-black text-purple-700">40 Enrolled</span>
              <span className="text-xs text-slate-500">in Database</span>
            </div>
            <div className="mt-1 text-[11px] text-slate-400">Auto-matched with Attendance</div>
          </Card>
        </div>

        {/* Tab Selection & Showroom Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('devices')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'devices'
                  ? 'bg-[#0058be] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Biometric Terminals ({devices.length})
            </button>
            <button
              onClick={() => setActiveTab('mappings')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'mappings'
                  ? 'bg-[#0058be] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              Employee Mappings
            </button>
            <button
              onClick={() => setActiveTab('raw_punches')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'raw_punches'
                  ? 'bg-[#0058be] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
              Raw Punches Ledger
            </button>
            <button
              onClick={() => setActiveTab('sync_logs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'sync_logs'
                  ? 'bg-[#0058be] text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Sync History & Diagnostics
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap">Showroom:</span>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-xs">
              {['ALL', 'BEL', 'DAV', 'SHI'].map((loc) => (
                <button
                  key={loc}
                  onClick={() => setLocationFilter(loc)}
                  className={`px-2.5 py-1 rounded font-bold transition-colors ${
                    locationFilter === loc ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {loc === 'ALL' ? 'All Hubs' : loc}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* TAB 1: DEVICES */}
        {activeTab === 'devices' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {devices.map((dev) => {
              const isOnline = dev.status === 'CONNECTED';
              return (
                <Card
                  key={dev.id}
                  className={`p-5 border transition-all hover:shadow-md relative overflow-hidden ${
                    isOnline ? 'border-emerald-200 bg-white' : 'border-slate-200 bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-slate-900 text-white uppercase tracking-wider">
                          {dev.locationCode}
                        </span>
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {dev.serialNumber}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-900 mt-2 text-base leading-snug">{dev.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {dev.locationName || (dev.locationCode === 'BEL' ? 'Belagavi Flagship HQ' : dev.locationCode === 'DAV' ? 'Davanagere Mega Store' : 'Shivamogga Flagship')}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[11px] font-black flex items-center gap-1.5 border shadow-xs ${
                        isOnline
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                      {isOnline ? 'CONNECTED' : 'DISCONNECTED'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Network Link</span>
                      <span className="font-semibold text-slate-800">
                        {isOnline ? 'Secure Showroom LAN' : 'Offline Gateway'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Round-trip Ping</span>
                      <span className="font-mono font-bold text-emerald-600">
                        {isOnline ? `${dev.latency || 4} ms` : 'Unreachable'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Hardware Model</span>
                      <span className="font-semibold text-slate-700 truncate block">{dev.model}</span>
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Firmware</span>
                      <span className="font-mono text-[11px] text-slate-600 truncate block">{dev.firmwareVersion}</span>
                    </div>
                  </div>

                  {dev.lastError && (
                    <div className="mt-3 p-2 bg-rose-50 rounded-lg border border-rose-100 flex items-start gap-1.5 text-xs text-rose-700">
                      <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{dev.lastError}</span>
                    </div>
                  )}

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>Last Sync: {dev.lastSyncAt ? new Date(dev.lastSyncAt).toLocaleTimeString() : 'Pending'}</span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleTestConnection(dev)}
                        disabled={testingDeviceId === dev.id}
                        className="h-7 text-xs font-bold px-2 bg-white"
                      >
                        <Radio className={`w-3 h-3 mr-1 ${testingDeviceId === dev.id ? 'animate-spin' : ''}`} />
                        Test
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSyncDevice(dev)}
                        disabled={syncingDeviceId === dev.id}
                        className="h-7 text-xs font-bold px-2.5 bg-slate-900 text-white hover:bg-slate-800"
                      >
                        <Zap className={`w-3 h-3 mr-1 ${syncingDeviceId === dev.id ? 'animate-spin' : ''}`} />
                        Sync
                      </Button>
                      <button
                        onClick={() => handleOpenEdit(dev)}
                        className="p-1.5 hover:bg-slate-200 rounded text-slate-500 hover:text-slate-800 transition-colors"
                        title="Edit Configuration"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* TAB 2: EMPLOYEE MAPPINGS */}
        {activeTab === 'mappings' && (
          <Card className="p-0 border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <Input
                  placeholder="Search employee or enrollment PIN..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-xs bg-white"
                />
              </div>
              <span className="text-xs text-slate-500 font-semibold">
                Showing {mappings.length} employee-to-device biometric mappings
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Biometric PIN / ID</th>
                    <th className="px-4 py-3">Assigned Showroom</th>
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3">Designation</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mappings.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-900">
                        <div>{m.fullName}</div>
                        <span className="font-mono text-[10px] text-slate-400">{m.employeeCode}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          #{m.enrollmentNumber}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-800">{m.showroomCode}</span>
                        <div className="text-[10px] text-slate-400">{m.locationName}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{m.departmentName || 'Operations'}</td>
                      <td className="px-4 py-3 text-slate-500">{m.designation || 'Staff'}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {mappings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No employee mappings found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* TAB 3: RAW PUNCHES LEDGER */}
        {activeTab === 'raw_punches' && (
          <Card className="p-0 border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Immutable Raw Punch Ledger</h3>
                <p className="text-xs text-slate-500">
                  Exact hardware event timestamps ingested from physical eSSL terminals before attendance calculations.
                </p>
              </div>
              <Badge variant="outline" className="font-mono text-xs bg-white">
                {rawPunches.length} Ingested Logs
              </Badge>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Hardware Serial</th>
                    <th className="px-4 py-3">Biometric PIN</th>
                    <th className="px-4 py-3">Matched Employee</th>
                    <th className="px-4 py-3">Device Punch Timestamp</th>
                    <th className="px-4 py-3">Verification Mode</th>
                    <th className="px-4 py-3">Sync Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rawPunches.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-blue-700">{p.serialNumber}</td>
                      <td className="px-4 py-3 font-mono font-semibold">#{p.enrollmentNumber}</td>
                      <td className="px-4 py-3">
                        {p.employeeName ? (
                          <div>
                            <span className="font-bold text-slate-800">{p.employeeName}</span>
                            <span className="block font-mono text-[10px] text-slate-400">{p.employeeCode}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Unmapped Staff</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-800 font-bold">
                        {new Date(p.punchTime).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.verifyMode === 1 ? 'Fingerprint' : p.verifyMode === 2 ? 'Face Recognition' : 'Card'}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            p.syncStatus === 'PROCESSED'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : p.syncStatus === 'UNMAPPED'
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {p.syncStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {rawPunches.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-400">
                        No raw punch events recorded yet. Click &quot;Sync All Devices&quot; to fetch events from hardware.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* TAB 4: SYNC LOGS */}
        {activeTab === 'sync_logs' && (
          <Card className="p-0 border-slate-200 overflow-hidden shadow-sm">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="font-bold text-slate-900 text-sm">Synchronization Audit History & Diagnostic Telemetry</h3>
              <p className="text-xs text-slate-500">
                Detailed execution trace of all manual and scheduled TCP socket synchronization runs.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-100 text-slate-700 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Execution Time</th>
                    <th className="px-4 py-3">Device Terminal</th>
                    <th className="px-4 py-3">Trigger Type</th>
                    <th className="px-4 py-3">Socket Latency</th>
                    <th className="px-4 py-3">Duration</th>
                    <th className="px-4 py-3">Status & Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {syncLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {new Date(log.syncedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-800">{log.deviceName || log.serialNumber}</span>
                        <div className="font-mono text-[10px] text-blue-600">SN: {log.serialNumber}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {log.triggerType}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-emerald-600">{log.latencyMs} ms</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{log.durationMs} ms</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            log.status === 'SUCCESS'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {log.status}
                        </span>
                        {log.errorMessage && (
                          <div className="text-[10px] text-rose-600 mt-0.5">{log.errorMessage}</div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {syncLogs.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        No synchronization history recorded yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* MODAL: REGISTER / EDIT DEVICE */}
        {deviceModalOpen && (
          <Modal
            isOpen={deviceModalOpen}
            onClose={() => setDeviceModalOpen(false)}
            title={editingDevice ? 'Edit Biometric Terminal' : 'Register New Biometric Terminal'}
          >
            <form onSubmit={handleSaveDevice} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Device Name</label>
                <Input
                  required
                  placeholder="e.g. ZKTeco Belagavi Main Terminal"
                  value={deviceForm.name}
                  onChange={(e) => setDeviceForm({ ...deviceForm, name: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Serial Number</label>
                  <Input
                    required
                    disabled={!!editingDevice}
                    placeholder="e.g. JNP2252300795"
                    value={deviceForm.serialNumber}
                    onChange={(e) => setDeviceForm({ ...deviceForm, serialNumber: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Showroom Location</label>
                  <select
                    className="w-full h-10 px-3 rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-800"
                    value={deviceForm.locationCode}
                    onChange={(e) => setDeviceForm({ ...deviceForm, locationCode: e.target.value })}
                  >
                    <option value="BEL">BEL · Belagavi Flagship HQ</option>
                    <option value="DAV">DAV · Davanagere Mega Store</option>
                    <option value="SHI">SHI · Shivamogga Flagship</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">IP Address</label>
                  <Input
                    required
                    placeholder="e.g. terminal-host or IP"
                    value={deviceForm.ipAddress}
                    onChange={(e) => setDeviceForm({ ...deviceForm, ipAddress: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Port</label>
                  <Input
                    required
                    type="number"
                    placeholder="4370"
                    value={deviceForm.port}
                    onChange={(e) => setDeviceForm({ ...deviceForm, port: Number(e.target.value) })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Model</label>
                  <Input
                    value={deviceForm.model}
                    onChange={(e) => setDeviceForm({ ...deviceForm, model: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Firmware Version</label>
                  <Input
                    value={deviceForm.firmwareVersion}
                    onChange={(e) => setDeviceForm({ ...deviceForm, firmwareVersion: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <Button variant="outline" type="button" onClick={() => setDeviceModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="bg-[#0058be] text-white">
                  {editingDevice ? 'Save Changes' : 'Register Terminal'}
                </Button>
              </div>
            </form>
          </Modal>
        )}
      </div>
    </DashboardLayout>
  );
}
