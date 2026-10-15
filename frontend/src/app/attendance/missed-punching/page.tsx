'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Clock,
  AlertTriangle,
  FileCheck,
  CheckCircle2,
  RefreshCw,
  Search,
  RotateCcw,
  Building2,
  MapPin,
  Calendar,
  Layers,
  UserCheck,
  Edit3,
  History,
  AlertCircle,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Check,
  X,
  FileText,
  User,
  Coffee,
  CheckSquare,
  FolderTree,
  Folder,
  Download,
  Filter,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  ArrowRight
} from 'lucide-react';

interface MissedPunchRecord {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  photoReference: string | null;
  designation: string;
  storeCode: string;
  storeName: string;
  department: string;
  departmentId: string | null;
  folderName: string;
  floor: string;
  floorId: string | null;
  floorManager: string;
  attendanceDate: string;
  scheduledShift: string;
  scheduledLoginTime: string;
  scheduledLogoutTime: string;
  firstPunchIn: string | null;
  firstPunchInFormatted: string;
  lastPunchOut: string | null;
  lastPunchOutFormatted: string;
  missingPunchType: 'MISSED_IN' | 'MISSED_OUT' | 'INCOMPLETE' | 'NONE';
  totalWorkingHours: string;
  totalWorkingSeconds: number;
  requiredWorkingHours: string;
  requiredWorkingSeconds: number;
  remainingHours: string;
  remainingSeconds: number;
  hoursStatus: 'UNDER_9_HOURS' | 'COMPLETED_9_HOURS' | 'UNVERIFIED';
  attendanceStatus: string;
  applicableConditions: string[];
  breakDurationMinutes: number;
  correctionStatus: string | null;
  correctionId: string | null;
  correctionReason: string | null;
  lastUpdated: string;
}

interface FolderSummary {
  folderId: string;
  folderName: string;
  storeCode: string;
  storeName: string;
  totalAssigned: number;
  missedIn: number;
  missedOut: number;
  incomplete: number;
  missingPunchTotal: number;
  under9Hours: number;
  pendingCorrections: number;
  resolvedIssues: number;
  totalAttentionNeeded: number;
}

interface FloorSummary {
  floorId: string;
  floorName: string;
  floorNumber: number;
  storeCode: string;
  storeName: string;
  floorManagerName: string;
  totalAssigned: number;
  missedIn: number;
  missedOut: number;
  incomplete: number;
  missingPunchTotal: number;
  under9Hours: number;
  pendingCorrections: number;
  resolvedIssues: number;
  totalAttentionNeeded: number;
}

interface StatsSummary {
  missedPunches: number;
  under9Hours: number;
  pendingCorrections: number;
  resolvedToday: number;
  totalAttentionNeeded: number;
}

const MISSING_TYPE_OPTIONS = [
  { value: 'ALL', label: 'All Issue Types' },
  { value: 'MISSED_IN', label: 'Missing Punch-In' },
  { value: 'MISSED_OUT', label: 'Missing Punch-Out' },
  { value: 'INCOMPLETE', label: 'Incomplete Punch Record' },
  { value: 'UNDER_9_HOURS', label: 'Under 9 Hours' },
];

const STORE_OPTIONS = [
  { value: 'all', label: 'All Hubs (BEL, DAV, SHI)' },
  { value: 'BEL', label: 'Belagavi Head Store (BEL)' },
  { value: 'DAV', label: 'Davanagere Mega Store (DAV)' },
  { value: 'SHI', label: 'Shivamogga Flagship (SHI)' },
];

export default function MissedPunchingPage() {
  const { data: session } = useSession();
  const rawRole = (session?.user as any)?.role || 'STAFF';
  const isHRorAdmin = ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER'].includes(rawRole);
  const isFloorManager = rawRole === 'FLOOR_MANAGER';
  const isFolderManager = rawRole === 'FOLDER_MANAGER';

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'folders' | 'floors' | 'employees'>('folders');

  // Summary KPI Cards
  const [stats, setStats] = useState<StatsSummary>({
    missedPunches: 0,
    under9Hours: 0,
    pendingCorrections: 0,
    resolvedToday: 0,
    totalAttentionNeeded: 0,
  });

  // Folder & Floor Breakdowns
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [floors, setFloors] = useState<FloorSummary[]>([]);

  // Detailed Employee Records
  const [records, setRecords] = useState<MissedPunchRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const limit = 15;

  // Filters
  const [search, setSearch] = useState('');
  const [selectedStore, setSelectedStore] = useState('all');
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectedMissingType, setSelectedMissingType] = useState('ALL');
  const [selectedDate, setSelectedDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<MissedPunchRecord | null>(null);

  // Edit form state
  const [punchInTime, setPunchInTime] = useState('');
  const [punchOutTime, setPunchOutTime] = useState('');
  const [breakDuration, setBreakDuration] = useState(0);
  const [missingReason, setMissingReason] = useState('Biometric scanner timeout');
  const [correctionReason, setCorrectionReason] = useState('');
  const [managerRemarks, setManagerRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // History state
  const [historyData, setHistoryData] = useState<{ attendance: any; corrections: any[]; breaks: any[] } | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Fetch KPI statistics
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/attendance/missed-punching/stats', {
        params: {
          locationId: selectedStore !== 'all' ? selectedStore : undefined,
          floorId: selectedFloor !== 'all' ? selectedFloor : undefined,
          departmentId: selectedFolder !== 'all' ? selectedFolder : undefined,
          date: selectedDate || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      if (res.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Fetch stats error:', err);
    }
  }, [selectedStore, selectedFloor, selectedFolder, selectedDate, startDate, endDate]);

  // Fetch Folder-Wise breakdown
  const fetchFolders = useCallback(async () => {
    try {
      const res = await api.get('/attendance/missed-punching/folders', {
        params: {
          store: selectedStore !== 'all' ? selectedStore : undefined,
          date: selectedDate || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      if (res.data?.folders) {
        setFolders(res.data.folders);
      }
    } catch (err) {
      console.error('Fetch folders error:', err);
    }
  }, [selectedStore, selectedDate, startDate, endDate]);

  // Fetch Floor-Wise breakdown
  const fetchFloors = useCallback(async () => {
    try {
      const res = await api.get('/attendance/missed-punching/floors', {
        params: {
          store: selectedStore !== 'all' ? selectedStore : undefined,
          date: selectedDate || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      if (res.data?.floors) {
        setFloors(res.data.floors);
      }
    } catch (err) {
      console.error('Fetch floors error:', err);
    }
  }, [selectedStore, selectedDate, startDate, endDate]);

  // Fetch Employee Attention Records
  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {
        page,
        limit,
        search: search.trim() || undefined,
        store: selectedStore !== 'all' ? selectedStore : undefined,
        floorId: selectedFloor !== 'all' ? selectedFloor : undefined,
        departmentId: selectedFolder !== 'all' ? selectedFolder : undefined,
        missingType: selectedMissingType !== 'ALL' ? selectedMissingType : undefined,
        date: selectedDate || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      };

      const res = await api.get('/attendance/missed-punching', { params });
      if (res.data) {
        setRecords(res.data.records || []);
        setTotalRecords(res.data.total || 0);
      }
    } catch (err: any) {
      console.error('Fetch records error:', err);
      toast.error('Failed to load attendance records');
    } finally {
      setLoading(false);
    }
  }, [page, search, selectedStore, selectedFloor, selectedFolder, selectedMissingType, selectedDate, startDate, endDate]);

  useEffect(() => {
    fetchStats();
    fetchFolders();
    fetchFloors();
    fetchRecords();
  }, [fetchStats, fetchFolders, fetchFloors, fetchRecords]);

  // Drill down from Folder click
  const handleDrillFolder = (folderName: string, storeCode?: string) => {
    setSelectedFolder(folderName);
    if (storeCode && selectedStore === 'all') {
      setSelectedStore(storeCode);
    }
    setActiveTab('employees');
    setPage(1);
    toast.success(`Filtered report by Folder: ${folderName}`);
  };

  // Drill down from Floor click
  const handleDrillFloor = (floorId: string, floorName: string, storeCode?: string) => {
    setSelectedFloor(floorId);
    if (storeCode && selectedStore === 'all') {
      setSelectedStore(storeCode);
    }
    setActiveTab('employees');
    setPage(1);
    toast.success(`Filtered report by Floor: ${floorName}`);
  };

  // Open Edit Modal
  const handleOpenEdit = (rec: MissedPunchRecord) => {
    setSelectedRecord(rec);
    const defaultIn = rec.firstPunchIn ? rec.firstPunchIn.substring(11, 16) : '10:00';
    const defaultOut = rec.lastPunchOut ? rec.lastPunchOut.substring(11, 16) : '19:00';
    setPunchInTime(defaultIn);
    setPunchOutTime(defaultOut);
    setBreakDuration(rec.breakDurationMinutes || 0);
    setCorrectionReason('');
    setManagerRemarks('');
    setMissingReason(
      rec.missingPunchType === 'MISSED_IN'
        ? 'Forgot morning punch-in'
        : rec.missingPunchType === 'MISSED_OUT'
        ? 'Customer rush during evening closing'
        : 'Biometric scanner timeout'
    );
    setEditModalOpen(true);
  };

  // Submit Correction
  const handleSubmitCorrection = async () => {
    if (!selectedRecord) return;
    if (!correctionReason.trim()) {
      toast.error('Please enter a mandatory correction reason');
      return;
    }

    setSubmitting(true);
    try {
      const dateStr = selectedRecord.attendanceDate;
      const fullIn = punchInTime ? `${dateStr}T${punchInTime}:00.000Z` : null;
      const fullOut = punchOutTime ? `${dateStr}T${punchOutTime}:00.000Z` : null;

      const payload = {
        attendanceId: selectedRecord.id,
        employeeId: selectedRecord.employeeId,
        attendanceDate: dateStr,
        punchIn: fullIn,
        punchOut: fullOut,
        breakDurationMinutes: Number(breakDuration) || 0,
        missingReason,
        correctionReason,
        managerRemarks,
      };

      const res = await api.post('/attendance/missed-punching/correct', payload);
      toast.success(res.data.message || 'Correction processed successfully');
      setEditModalOpen(false);
      fetchStats();
      fetchFolders();
      fetchFloors();
      fetchRecords();
    } catch (err: any) {
      console.error('Submit correction error:', err);
      toast.error(err.response?.data?.error || 'Failed to submit attendance correction');
    } finally {
      setSubmitting(false);
    }
  };

  // Open History Audit Modal
  const handleOpenHistory = async (rec: MissedPunchRecord) => {
    setSelectedRecord(rec);
    setHistoryModalOpen(true);
    setHistoryLoading(true);
    try {
      const res = await api.get(`/attendance/missed-punching/history/${rec.employeeId}/${rec.attendanceDate}`);
      setHistoryData(res.data);
    } catch (err) {
      console.error('Load history error:', err);
      toast.error('Could not load attendance audit history');
    } finally {
      setHistoryLoading(false);
    }
  };

  // Quick Approve (HR/Admin)
  const handleApproveCorrection = async (correctionId: string) => {
    try {
      await api.post('/attendance/missed-punching/approve', { correctionId });
      toast.success('Attendance correction approved and hours recalculated');
      fetchStats();
      fetchFolders();
      fetchFloors();
      fetchRecords();
      setHistoryModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve correction');
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const params = new URLSearchParams();
    if (selectedStore !== 'all') params.append('store', selectedStore);
    if (selectedFloor !== 'all') params.append('floorId', selectedFloor);
    if (selectedFolder !== 'all') params.append('departmentId', selectedFolder);
    if (selectedDate) params.append('date', selectedDate);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);

    const exportUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'}/attendance/missed-punching/export?${params.toString()}`;
    window.open(exportUrl, '_blank');
  };

  const resetFilters = () => {
    setSearch('');
    setSelectedStore('all');
    setSelectedFloor('all');
    setSelectedFolder('all');
    setSelectedMissingType('ALL');
    setSelectedDate('');
    setStartDate('');
    setEndDate('');
    setPage(1);
    toast.success('Filters reset to default view');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        {/* Header Title Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-[#092b69] via-[#0e3882] to-[#124294] p-6 rounded-2xl border border-sky-400/20 shadow-xl text-white">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-400/20 border border-amber-300/30 rounded-xl text-amber-300 shadow-inner">
                <Clock className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Missed Punching &amp; Working Hours
                </h1>
                <p className="text-xs text-amber-300/90 font-medium mt-0.5">
                  Folder-Wise · Floor-Wise · Store-Wise · Employee-Wise Monitoring
                </p>
              </div>
            </div>
            <p className="text-xs text-blue-100/80 max-w-3xl pt-1">
              Live corporate monitoring of biometric attendance exceptions, missing punch-in/out records, incomplete sessions, and 9-hour workday compliance across Belagavi (BEL), Davanagere (DAV), and Shivamogga (SHI).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              className="bg-white/10 hover:bg-white/20 text-white border-white/20 flex items-center gap-1.5 text-xs font-semibold shadow-xs"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV Report
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => { fetchStats(); fetchFolders(); fetchFloors(); fetchRecords(); }}
              className="bg-sky-500 hover:bg-sky-400 text-white border-none flex items-center gap-1.5 shadow-sm text-xs font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh Data
            </Button>
          </div>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Missed Punches */}
          <Card className="p-5 border-l-4 border-l-amber-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Missed Punches
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.missedPunches}
                </h3>
              </div>
              <div className="p-3 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-500/20">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Missing IN or OUT biometric punch
            </p>
          </Card>

          {/* Card 2: Under 9 Hours */}
          <Card className="p-5 border-l-4 border-l-rose-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Under 9 Hours
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.under9Hours}
                </h3>
              </div>
              <div className="p-3 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-xl border border-rose-500/20">
                <Clock className="w-6 h-6" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Verified work time &lt; 09h 00m target
            </p>
          </Card>

          {/* Card 3: Pending Corrections */}
          <Card className="p-5 border-l-4 border-l-sky-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Pending HR Review
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.pendingCorrections}
                </h3>
              </div>
              <div className="p-3 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-xl border border-sky-500/20">
                <FileCheck className="w-6 h-6" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500"></span>
              Manager regularizations awaiting review
            </p>
          </Card>

          {/* Card 4: Resolved Today */}
          <Card className="p-5 border-l-4 border-l-emerald-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Resolved Today
                </p>
                <h3 className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                  {stats.resolvedToday}
                </h3>
              </div>
              <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-500/20">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Approved &amp; reconciled in official register
            </p>
          </Card>
        </div>

        {/* Global Multi-Dimension Filter Bar */}
        <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Search Employee
              </label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Code or name..."
                  className="pl-9 text-xs h-9"
                />
              </div>
            </div>

            {/* Store Hub */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Store Hub
              </label>
              <select
                value={selectedStore}
                onChange={(e) => { setSelectedStore(e.target.value); setPage(1); }}
                className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {STORE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Folder / Department Filter */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Folder (Department)
              </label>
              <select
                value={selectedFolder}
                onChange={(e) => { setSelectedFolder(e.target.value); setPage(1); }}
                className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="all">All Folders</option>
                <option value="Sales">Sales</option>
                <option value="Operations">Operations</option>
                <option value="HR">HR</option>
                <option value="Finance">Finance (Accounts)</option>
                <option value="Inventory">Inventory</option>
                <option value="Customer Service">Customer Service</option>
              </select>
            </div>

            {/* Issue Type */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Exception Type
              </label>
              <select
                value={selectedMissingType}
                onChange={(e) => { setSelectedMissingType(e.target.value); setPage(1); }}
                className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                {MISSING_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Exact Date */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Specific Date
              </label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => { setSelectedDate(e.target.value); setStartDate(''); setEndDate(''); setPage(1); }}
                className="text-xs h-9"
              />
            </div>

            {/* Date Range Start & End */}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
                Date Range
              </label>
              <div className="flex items-center gap-1">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => { setStartDate(e.target.value); setSelectedDate(''); setPage(1); }}
                  placeholder="From"
                  className="text-[10px] h-9 px-1.5"
                />
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => { setEndDate(e.target.value); setSelectedDate(''); setPage(1); }}
                  placeholder="To"
                  className="text-[10px] h-9 px-1.5"
                />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs gap-2">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                Active Filter:
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                {selectedDate ? `Date: ${selectedDate}` : (startDate || endDate ? `${startDate || 'Start'} to ${endDate || 'Now'}` : 'All Historical Dates')}
              </span>
              {selectedFolder !== 'all' && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 dark:bg-sky-950 text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                  Folder: {selectedFolder}
                </span>
              )}
              {selectedStore !== 'all' && (
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                  Store: {selectedStore}
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-7 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" /> Reset Filters
            </Button>
          </div>
        </Card>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-1">
          <button
            onClick={() => setActiveTab('folders')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'folders'
                ? 'bg-[#092b69] text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <FolderTree className="w-4 h-4" />
            Folder-Wise Dashboard ({folders.length})
          </button>

          <button
            onClick={() => setActiveTab('floors')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'floors'
                ? 'bg-[#092b69] text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            Floor-Wise Dashboard ({floors.length})
          </button>

          <button
            onClick={() => setActiveTab('employees')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'employees'
                ? 'bg-[#092b69] text-white shadow-md'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Employee Details Report ({totalRecords})
          </button>
        </div>

        {/* TAB 1: FOLDER-WISE DASHBOARD */}
        {activeTab === 'folders' && (
          <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden rounded-xl">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Folder className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Organizational Folder Breakdown
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                Click any folder to inspect individual employee attendance records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    <th className="py-3 px-4">Folder (Department)</th>
                    <th className="py-3 px-3">Store Location</th>
                    <th className="py-3 px-3 text-center">Assigned Employees</th>
                    <th className="py-3 px-3 text-center text-amber-600">Missing Punch</th>
                    <th className="py-3 px-3 text-center text-rose-600">Under 9 Hours</th>
                    <th className="py-3 px-3 text-center text-sky-600">Pending Review</th>
                    <th className="py-3 px-3 text-center text-emerald-600">Resolved</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {folders.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        No folder data found for current filter.
                      </td>
                    </tr>
                  ) : (
                    folders.map((f, i) => (
                      <tr
                        key={i}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        onClick={() => handleDrillFolder(f.folderName, f.storeCode)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                            <Folder className="w-4 h-4 text-sky-500" />
                            {f.folderName}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                            {f.storeCode} · {f.storeName}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                          {f.totalAssigned}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            {f.missingPunchTotal}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40">
                            {f.under9Hours}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40">
                            {f.pendingCorrections}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            {f.resolvedIssues}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs flex items-center gap-1 font-semibold text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDrillFolder(f.folderName, f.storeCode);
                            }}
                          >
                            View Folder <ArrowRight className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* TAB 2: FLOOR-WISE DASHBOARD */}
        {activeTab === 'floors' && (
          <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden rounded-xl">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-600" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Store Floor-Wise Monitoring
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                Floor Manager assignments and floor-level exceptions
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    <th className="py-3 px-4">Floor Name</th>
                    <th className="py-3 px-3">Store Location</th>
                    <th className="py-3 px-3">Floor Manager</th>
                    <th className="py-3 px-3 text-center">Assigned Employees</th>
                    <th className="py-3 px-3 text-center text-amber-600">Missing Punch</th>
                    <th className="py-3 px-3 text-center text-rose-600">Under 9 Hours</th>
                    <th className="py-3 px-3 text-center text-sky-600">Pending Review</th>
                    <th className="py-3 px-3 text-center text-emerald-600">Resolved</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {floors.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        No floor data found for current filter.
                      </td>
                    </tr>
                  ) : (
                    floors.map((fl, i) => (
                      <tr
                        key={i}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                        onClick={() => handleDrillFloor(fl.floorId, fl.floorName, fl.storeCode)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                            <Layers className="w-4 h-4 text-amber-500" />
                            {fl.floorName} (L{fl.floorNumber})
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
                            {fl.storeCode}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                          {fl.floorManagerName}
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-slate-700 dark:text-slate-300">
                          {fl.totalAssigned}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            {fl.missingPunchTotal}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40">
                            {fl.under9Hours}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800/40">
                            {fl.pendingCorrections}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                            {fl.resolvedIssues}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDrillFloor(fl.floorId, fl.floorName, fl.storeCode);
                            }}
                          >
                            View Floor <ArrowRight className="w-3 h-3" />
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* TAB 3: EMPLOYEE ATTENDANCE DETAILS REPORT */}
        {activeTab === 'employees' && (
          <Card className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden rounded-xl">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-sky-600" />
                <h3 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Employee Attendance Exception Records
                </h3>
              </div>
              <span className="text-[11px] text-slate-500 font-medium">
                {totalRecords} records found meeting exception criteria
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Employee</th>
                    <th className="py-3.5 px-3">Folder &amp; Floor</th>
                    <th className="py-3.5 px-3">Date &amp; Shift</th>
                    <th className="py-3.5 px-3">First Punch-In</th>
                    <th className="py-3.5 px-3">Last Punch-Out</th>
                    <th className="py-3.5 px-3 text-center">Working Hours</th>
                    <th className="py-3.5 px-3 text-center">Remaining</th>
                    <th className="py-3.5 px-3">Status &amp; Flags</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-500" />
                        Loading attendance exception records...
                      </td>
                    </tr>
                  ) : records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">No Attendance Attention Required</p>
                        <p className="text-[11px] text-slate-400 mt-1">All employee punches and working hours meet the 9-hour policy for selected criteria.</p>
                      </td>
                    </tr>
                  ) : (
                    records.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                        {/* Employee Info */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center font-bold text-xs text-slate-700 dark:text-slate-300 overflow-hidden flex-shrink-0">
                              {rec.photoReference ? (
                                <img src={rec.photoReference} alt="" className="w-full h-full object-cover" />
                              ) : (
                                rec.employeeName.charAt(0)
                              )}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white">
                                {rec.employeeName}
                              </div>
                              <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                                {rec.employeeCode} · {rec.designation}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Folder & Floor */}
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                              {rec.storeCode}
                            </span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">
                              {rec.folderName}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {rec.floor} · Mgr: {rec.floorManager}
                          </div>
                        </td>

                        {/* Date & Shift */}
                        <td className="py-3.5 px-3">
                          <div className="font-medium text-slate-800 dark:text-slate-200">
                            {rec.attendanceDate}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[130px]">
                            {rec.scheduledShift}
                          </div>
                        </td>

                        {/* First Punch-In */}
                        <td className="py-3.5 px-3">
                          {rec.firstPunchIn ? (
                            <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {rec.firstPunchInFormatted}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50">
                              No Punch-In
                            </span>
                          )}
                        </td>

                        {/* Last Punch-Out */}
                        <td className="py-3.5 px-3">
                          {rec.lastPunchOut ? (
                            <div className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                              {rec.lastPunchOutFormatted}
                            </div>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50">
                              No Punch-Out
                            </span>
                          )}
                        </td>

                        {/* Working Hours */}
                        <td className="py-3.5 px-3 text-center">
                          {rec.hoursStatus === 'UNVERIFIED' ? (
                            <span className="text-[11px] text-slate-400 italic">
                              Hours Cannot Be Verified
                            </span>
                          ) : (
                            <div className="inline-flex flex-col items-center">
                              <span className={`font-mono font-bold text-xs ${rec.hoursStatus === 'UNDER_9_HOURS' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                {rec.totalWorkingHours}
                              </span>
                              <span className="text-[9px] text-slate-400">
                                req: {rec.requiredWorkingHours}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Remaining Hours */}
                        <td className="py-3.5 px-3 text-center">
                          {rec.hoursStatus === 'UNDER_9_HOURS' ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-mono">
                              -{rec.remainingHours}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-mono text-xs">
                              {rec.remainingHours}
                            </span>
                          )}
                        </td>

                        {/* Statuses and multi-conditions */}
                        <td className="py-3.5 px-3">
                          <div className="flex flex-wrap gap-1 max-w-[160px]">
                            {rec.applicableConditions.map((cond, idx) => {
                              let badgeStyle = 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300';
                              if (cond === 'Missed Punch-In') badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 border-rose-800/40 font-bold';
                              if (cond === 'Missed Punch-Out') badgeStyle = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 border-amber-800/40 font-bold';
                              if (cond === 'Under 9 Hours') badgeStyle = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 border-rose-800/40 font-bold';
                              if (cond === 'Pending HR Review' || cond === 'Correction Requested') badgeStyle = 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 border-sky-800/40 font-bold';
                              if (cond === 'Resolved') badgeStyle = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-800/40';

                              return (
                                <span
                                  key={idx}
                                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold border ${badgeStyle}`}
                                >
                                  {cond}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEdit(rec)}
                              className="h-7 px-2.5 text-[11px] font-semibold border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 flex items-center gap-1 shadow-2xs"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenHistory(rec)}
                              className="h-7 px-2 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                              title="View Audit History"
                            >
                              <History className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalRecords > limit && (
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Page {page} of {Math.ceil(totalRecords / limit)}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page * limit >= totalRecords}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-7 px-2"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Edit Attendance Modal (Floor Manager & HR) */}
      <Modal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Correct Attendance & Working Hours"
      >
        {selectedRecord && (
          <div className="space-y-4 text-xs pt-1">
            {/* Employee Banner */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <p className="font-bold text-sm text-slate-900 dark:text-white">
                  {selectedRecord.employeeName}
                </p>
                <p className="text-slate-500 font-mono text-[11px]">
                  {selectedRecord.employeeCode} · {selectedRecord.designation}
                </p>
              </div>
              <div className="text-right">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                  {selectedRecord.storeCode} · {selectedRecord.folderName} · {selectedRecord.floor}
                </span>
                <p className="text-slate-400 text-[10px] mt-0.5">
                  Date: {selectedRecord.attendanceDate}
                </p>
              </div>
            </div>

            {/* Shift Reference */}
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg flex items-center justify-between text-amber-900 dark:text-amber-200 text-[11px]">
              <span className="font-medium">Shift Schedule: {selectedRecord.scheduledShift}</span>
              <span className="font-bold">Required Target: 09h 00m</span>
            </div>

            {/* Punch Correction Inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Punch-In Time (IST)
                </label>
                <Input
                  type="time"
                  value={punchInTime}
                  onChange={(e) => setPunchInTime(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Punch-Out Time (IST)
                </label>
                <Input
                  type="time"
                  value={punchOutTime}
                  onChange={(e) => setPunchOutTime(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* Break Duration */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Unpaid Break Duration (Minutes)
              </label>
              <Input
                type="number"
                min={0}
                max={240}
                value={breakDuration}
                onChange={(e) => setBreakDuration(Number(e.target.value))}
                placeholder="e.g. 30 or 45"
                className="text-xs h-9"
              />
            </div>

            {/* Missing Reason */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Missing Punch Reason
              </label>
              <select
                value={missingReason}
                onChange={(e) => setMissingReason(e.target.value)}
                className="w-full h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs px-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="Customer rush during floor closing">Customer rush during floor closing</option>
                <option value="Biometric scanner timeout">Biometric scanner timeout</option>
                <option value="Forgot morning punch-in">Forgot morning punch-in</option>
                <option value="Store inventory stock audit">Store inventory stock audit</option>
                <option value="Offsite customer bridal delivery">Offsite customer bridal delivery</option>
                <option value="Device synchronization delay">Device synchronization delay</option>
              </select>
            </div>

            {/* Correction Reason (Mandatory) */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Correction Justification <span className="text-rose-500">*</span>
              </label>
              <Input
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Explain why this correction is verified..."
                className="text-xs h-9"
                required
              />
            </div>

            {/* Manager Remarks */}
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Manager Remarks
              </label>
              <textarea
                value={managerRemarks}
                onChange={(e) => setManagerRemarks(e.target.value)}
                rows={2}
                placeholder="Optional manager notes or supporting observation..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs p-2.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Policy Notice */}
            <p className="text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 leading-relaxed">
              <strong>Audit Policy:</strong> Original biometric punches are permanently preserved in the database audit log. {isHRorAdmin ? 'As HR/Admin, this update will immediately recalculate verified working hours.' : 'As Folder/Floor Manager, this submission will be routed to HR for formal verification.'}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditModalOpen(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitCorrection}
                disabled={submitting}
                className="bg-sky-600 hover:bg-sky-700 text-white font-bold flex items-center gap-1.5 shadow-md"
              >
                {submitting ? (
                  <>Saving...</>
                ) : isHRorAdmin ? (
                  <><Check className="w-4 h-4" /> Save &amp; Finalize</>
                ) : (
                  <><CheckSquare className="w-4 h-4" /> Submit for Approval</>
                )}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* History & Audit Trail Modal */}
      <Modal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Attendance History &amp; Correction Audit"
      >
        {selectedRecord && (
          <div className="space-y-4 text-xs pt-1">
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{selectedRecord.employeeName}</p>
                  <p className="text-slate-500 font-mono text-[11px]">{selectedRecord.employeeCode} · {selectedRecord.folderName} · {selectedRecord.floor}</p>
                </div>
                <Badge variant="secondary">Date: {selectedRecord.attendanceDate}</Badge>
              </div>
            </div>

            {historyLoading ? (
              <div className="py-8 text-center text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-sky-500" />
                Loading audit trail...
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-sky-500" /> Verified Record Snapshot
                  </h4>
                  <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                    <div>
                      <span className="text-slate-400 block">First Punch-In:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {selectedRecord.firstPunchInFormatted || 'Missing'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Last Punch-Out:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {selectedRecord.lastPunchOutFormatted || 'Missing'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Verified Duration:</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        {selectedRecord.totalWorkingHours}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Current Status:</span>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {selectedRecord.attendanceStatus}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Previous Corrections Log */}
                <div>
                  <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-amber-500" /> Regularization History
                  </h4>
                  {historyData?.corrections && historyData.corrections.length > 0 ? (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {historyData.corrections.map((corr: any) => (
                        <div
                          key={corr.id}
                          className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                              corr.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' :
                              corr.status === 'PENDING' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                              'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            }`}>
                              {corr.status}
                            </span>
                            <span className="text-slate-400 text-[10px]">
                              {new Date(corr.createdAt).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          <p className="text-slate-700 dark:text-slate-300">
                            <strong>Reason:</strong> {corr.reason || 'None provided'}
                          </p>
                          {corr.requestedByName && (
                            <p className="text-slate-400 text-[10px]">
                              Requested by: {corr.requestedByName}
                            </p>
                          )}
                          {corr.reviewedByName && (
                            <p className="text-slate-400 text-[10px]">
                              Reviewed by: {corr.reviewedByName} ({corr.reviewNote || 'Approved'})
                            </p>
                          )}

                          {/* HR Quick Action if Pending */}
                          {isHRorAdmin && corr.status === 'PENDING' && (
                            <div className="pt-1 flex items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleApproveCorrection(corr.id)}
                                className="h-6 px-2 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                              >
                                Approve Correction
                              </Button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-slate-400 italic text-[11px] p-2 bg-slate-50 dark:bg-slate-800/40 rounded-lg">
                      No previous corrections recorded for this attendance date.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <Button size="sm" variant="secondary" onClick={() => setHistoryModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </DashboardLayout>
  );
}
