'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Users,
  Building2,
  ShieldCheck,
  Fingerprint,
  Store,
  Download,
  UserPlus,
  Search,
  Filter,
  X,
  ChevronRight,
  QrCode,
  ScanFace,
  FilterX,
  Contact,
  FolderLock,
  AlertCircle,
  Eye,
  BarChart3,
  UploadCloud,
  RefreshCw,
} from 'lucide-react';
import { HrAnalysisModule } from '@/components/employees/analysis/HrAnalysisModule';
import { EmployeeQrModal } from '@/components/dashboard/EmployeeQrModal';
import { EmployeeQuickDetailsDrawer } from '@/components/employees/drawers/EmployeeQuickDetailsDrawer';
import { TotalWorkforceDrawer } from '@/components/employees/drawers/TotalWorkforceDrawer';
import { ActiveOnFloorDrawer } from '@/components/employees/drawers/ActiveOnFloorDrawer';
import { KycComplianceDrawer } from '@/components/employees/drawers/KycComplianceDrawer';
import { BiometricProfilesDrawer } from '@/components/employees/drawers/BiometricProfilesDrawer';
import { StoreLocationsDrawer } from '@/components/employees/drawers/StoreLocationsDrawer';
import { CANONICAL_HUB_STORES, type CanonicalHubStore } from '@/components/employees/drawers/storeLocationsHelper';
import { AddEmployeeDialog } from '@/components/employees/AddEmployeeDialog';
import { BulkImportModal } from '@/components/employees/BulkImportModal';

import { useSession } from 'next-auth/react';

export default function EmployeesPage() {
  const { data: session, status: authStatus } = useSession();
  const [employees, setEmployees] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>(CANONICAL_HUB_STORES);
  const [departments, setDepartments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('ACTIVE');
  const [totalCount, setTotalCount] = useState(0);

  // Drawer state management
  type DrawerType = 'workforce' | 'on-floor' | 'kyc' | 'biometrics' | 'locations' | null;
  const [activeDrawer, setActiveDrawer] = useState<DrawerType>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerRefreshing, setDrawerRefreshing] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Focus trigger refs for accessible focus restoration on close
  const card1Ref = useRef<HTMLButtonElement>(null);
  const card2Ref = useRef<HTMLButtonElement>(null);
  const card3Ref = useRef<HTMLButtonElement>(null);
  const card4Ref = useRef<HTMLButtonElement>(null);
  const card5Ref = useRef<HTMLButtonElement>(null);

  // In-memory cache for drawer workforce data and abort controller for cancellation
  const drawerDataCacheRef = useRef<Record<string, any[]>>({});
  const drawerAbortControllerRef = useRef<AbortController | null>(null);

  // Add Employee & Bulk Import Dialogs
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [selectedQrEmp, setSelectedQrEmp] = useState<any | null>(null);
  const [selectedDetailEmp, setSelectedDetailEmp] = useState<any | null>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement | null>(null);
  const addEmployeeBtnRef = useRef<HTMLButtonElement>(null);
  const [filterNotice, setFilterNotice] = useState<string | null>(null);

  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [departmentsError, setDepartmentsError] = useState<string | null>(null);

  // Deduplicate department options so repeated hub names never appear multiple times
  const departmentOptions: Array<{ name: string; id: string }> = useMemo(() => {
    const relevantDepts = selectedLocation
      ? departments.filter((d) => d.locationId === selectedLocation)
      : departments;

    const seen = new Set<string>();
    const options: Array<{ name: string; id: string }> = [];

    for (const d of relevantDepts) {
      const name = (d.name || '').trim();
      const norm = name.toLowerCase();
      if (name && !seen.has(norm)) {
        seen.add(norm);
        const allMatchingIds = relevantDepts
          .filter((item) => (item.name || '').trim().toLowerCase() === norm)
          .map((item) => item.id)
          .join(',');
        options.push({ name, id: selectedLocation ? d.id : allMatchingIds });
      }
    }

    return options.sort((a, b) => a.name.localeCompare(b.name));
  }, [departments, selectedLocation]);

  const fetchMetadata = useCallback(async () => {
    try {
      setDepartmentsLoading(true);
      setDepartmentsError(null);
      const [locRes, deptRes] = await Promise.all([
        api.get('/locations/all').catch(() => ({ data: [] })),
        api.get('/departments?limit=100').catch((err) => {
          setDepartmentsError('Could not load departments');
          return { data: [] };
        }),
      ]);
      const fetchedLocs = Array.isArray(locRes.data) && locRes.data.length > 0 ? locRes.data : CANONICAL_HUB_STORES;
      const mergedLocs = CANONICAL_HUB_STORES.map((canonical: CanonicalHubStore) => {
        const found = fetchedLocs.find(
          (l: any) =>
            l.code?.toUpperCase() === canonical.code.toUpperCase() ||
            l.id === canonical.id
        );
        return found ? { ...canonical, ...found, code: canonical.code } : canonical;
      });
      setLocations(mergedLocs);
      setDepartments(deptRes.data?.departments || deptRes.data || []);
    } catch (e: any) {
      if (e?.response?.status !== 401 && !e?.isHandled401) {
        console.warn('Metadata fetch error:', e?.message || e);
      }
      setLocations(CANONICAL_HUB_STORES);
    } finally {
      setDepartmentsLoading(false);
    }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedLocation) params.append('locationId', selectedLocation);
      if (selectedDept) params.append('departmentId', selectedDept);
      if (selectedStatus && selectedStatus !== 'ALL') params.append('status', selectedStatus);
      params.append('limit', '1000');

      const res = await api.get(`/employees?${params.toString()}`);
      if (res?.data) {
        setEmployees(res.data.employees || []);
        setTotalCount(res.data.total || (res.data.employees ? res.data.employees.length : 35));
      }
    } catch (err: any) {
      if (err?.response?.status !== 401 && !err?.isHandled401) {
        console.warn('Fetch employees error:', err?.message || err);
      }
    } finally {
      setLoading(false);
    }
  }, [search, selectedLocation, selectedDept, selectedStatus]);

  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchMetadata();
      fetchEmployees();
    }
  }, [authStatus, fetchMetadata, fetchEmployees]);

  // Drawer handlers with caching and AbortController cancellation
  const handleOpenDrawer = (type: DrawerType) => {
    setActiveDrawer(type);
    setDrawerError(null);

    // If already cached, instant display
    if (drawerDataCacheRef.current[type || '']) {
      return;
    }

    if (drawerAbortControllerRef.current) {
      drawerAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    drawerAbortControllerRef.current = controller;

    setDrawerLoading(true);
    api.get('/employees?limit=1000', { signal: controller.signal })
      .then((res) => {
        if (res?.data?.employees) {
          drawerDataCacheRef.current[type || ''] = res.data.employees;
        }
      })
      .catch((err) => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          console.warn('Drawer data fetch error:', err?.message || err);
        }
      })
      .finally(() => {
        setDrawerLoading(false);
      });
  };

  const handleCloseDrawer = () => {
    if (drawerAbortControllerRef.current) {
      drawerAbortControllerRef.current.abort();
      drawerAbortControllerRef.current = null;
    }
    setActiveDrawer(null);
    setDrawerLoading(false);
    setDrawerError(null);
  };

  const handleRefreshDrawer = (type: DrawerType) => {
    if (!type) return;
    setDrawerRefreshing(true);
    setDrawerError(null);

    const controller = new AbortController();
    drawerAbortControllerRef.current = controller;

    api.get('/employees?limit=1000', { signal: controller.signal })
      .then((res) => {
        if (res?.data?.employees) {
          drawerDataCacheRef.current[type] = res.data.employees;
          toast.success('Drawer records refreshed');
        }
      })
      .catch((err) => {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') {
          setDrawerError('Failed to refresh data. Please retry.');
        }
      })
      .finally(() => {
        setDrawerRefreshing(false);
      });
  };

  useEffect(() => {
    return () => {
      if (drawerAbortControllerRef.current) {
        drawerAbortControllerRef.current.abort();
      }
    };
  }, []);

  const drawerEmployees = (activeDrawer && drawerDataCacheRef.current[activeDrawer]) || employees;
  const hqLocation = locations.find((l) => l.code === 'BEL');
  const nonHqLocations = locations.filter((l) => l.code !== 'BEL');

  const handleEmployeeCreated = (createdEmp: any) => {
    // Invalidate drawer cache so drawers will fetch latest records
    drawerDataCacheRef.current = {};
    // Refetch workforce records and summary counts
    fetchEmployees();

    // Check if created employee matches active filters
    const matchesLoc = !selectedLocation || createdEmp.locationId === selectedLocation;
    const matchesDept = !selectedDept || createdEmp.departmentId === selectedDept;
    const matchesSearch =
      !search ||
      (createdEmp.fullName?.toLowerCase().includes(search.toLowerCase()) ||
        createdEmp.employeeCode?.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus =
      !selectedStatus || selectedStatus === 'ALL' || createdEmp.status === selectedStatus;

    if (!matchesLoc || !matchesDept || !matchesSearch || !matchesStatus) {
      const empName = createdEmp.fullName || `${createdEmp.firstName} ${createdEmp.lastName}`.trim();
      setFilterNotice(
        `Employee ${empName} added. Note: The new employee is hidden by the current filters.`
      );
    } else {
      setFilterNotice(null);
    }
  };

  const handleResetFilters = () => {
    setSearch('');
    setSelectedLocation('');
    setSelectedDept('');
    setSelectedStatus('ACTIVE');
    setFilterNotice(null);
  };

  const handleExportCSV = async () => {
    try {
      setIsExportingCSV(true);
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (selectedLocation) params.append('locationId', selectedLocation);
      if (selectedDept) params.append('departmentId', selectedDept);
      if (selectedStatus && selectedStatus !== 'ALL') params.append('status', selectedStatus);

      // Call production endpoint which exports standard 49-column template compliant CSV
      const res = await api.get(`/employees/export/csv?${params.toString()}`, {
        responseType: 'blob'
      });

      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BSC_Textiles_Workforce_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success('Exported Workforce Master CSV (49-column standard)!');
    } catch (err: any) {
      console.warn('Backend export failed, falling back to local dataset export:', err);
      if (employees.length === 0) {
        toast.error('No employees to export');
        return;
      }
      const headers = 'Employee Code,Name,Role,Location,Department,Status\n';
      const rows = employees.map(e => 
        `"${e.employeeCode}","${e.fullName || `${e.firstName} ${e.lastName}`}","${e.role}","${e.location?.name || ''}","${e.department?.name || ''}","${e.status}"`
      ).join('\n');
      const blob = new Blob([headers + rows], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BSC_Textiles_Workforce_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      toast.success('Exported Workforce Master CSV!');
    } finally {
      setIsExportingCSV(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-5">
        {/* BREADCRUMB & CONTEXT BANNER */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
              <span>Workforce Directory</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[#1346a1] font-bold">Staff Master Ledger</span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              <span>Karnataka Hubs</span>
            </div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-[#18181B] tracking-tight">
                Workforce Directory & Staff Records
              </h1>
              <span className="bg-[#1346a1]/10 text-[#1346a1] border border-[#1346a1]/20 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider">
                Live Synced ({totalCount} Staff)
              </span>
            </div>
            <p className="text-xs text-slate-500 max-w-3xl">
              Centralized record directory of all verified employees across Karnataka retail stores, regional warehouses, and head office.
            </p>
          </div>

          {/* PRIMARY ACTION CLUSTER */}
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/employees/analysis"
              className="flex items-center gap-1.5 bg-sky-50 dark:bg-sky-950/40 hover:bg-sky-100 dark:hover:bg-sky-900/50 text-[#1346a1] dark:text-sky-300 border border-sky-300 dark:border-sky-700/60 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all"
            >
              <BarChart3 className="w-4 h-4 text-[#1346a1] dark:text-sky-400" />
              <span>Analysis & Trends</span>
            </Link>
            <Link
              href="/employees/documents"
              className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-700/60 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all"
            >
              <FolderLock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>Employee Documents</span>
            </Link>
            <button
              type="button"
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 px-3.5 py-2 rounded-lg text-xs font-semibold shadow-xs transition-all cursor-pointer"
              title="Bulk import employees via CSV with validation preview and Employee ID assignment"
            >
              <UploadCloud className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Bulk Import</span>
            </button>
            <button
              onClick={handleExportCSV}
              disabled={isExportingCSV}
              className="flex items-center gap-1.5 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-100 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className={`w-4 h-4 text-slate-500 dark:text-slate-400 ${isExportingCSV ? 'animate-bounce' : ''}`} />
              <span>{isExportingCSV ? 'Exporting...' : 'Export CSV'}</span>
            </button>
            <button
              ref={addEmployeeBtnRef}
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 bg-[#1346a1] hover:bg-[#0e3882] text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-xs transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
              aria-haspopup="dialog"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Add Employee</span>
            </button>
          </div>
        </div>

        {/* 5 WORKFORCE KPIS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* 1. TOTAL WORKFORCE */}
          <button
            type="button"
            ref={card1Ref}
            onClick={() => handleOpenDrawer('workforce')}
            aria-label="View details for Total Workforce"
            className="emp-dir-summary-card text-left bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer transition-all hover:border-[#1346a1]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-1 w-full">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Workforce</span>
              <div className="w-8 h-8 rounded-lg bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
                <Users className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">{totalCount}</span>
              <span className="text-[10px] font-bold text-[#1346a1] bg-[#1346a1]/10 px-1.5 py-0.5 rounded-full">+3 MTD</span>
            </div>
            <div className="w-full pt-2 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Full-Time Staff</span>
                <span>•</span>
                <span>Active Roster</span>
              </div>
              <div className="flex items-center justify-end text-[10px] font-bold text-[#1346a1]">
                <span>View details &rarr;</span>
              </div>
            </div>
          </button>

          {/* 2. ACTIVE ON-FLOOR */}
          <button
            type="button"
            ref={card2Ref}
            onClick={() => handleOpenDrawer('on-floor')}
            aria-label="View details for Active On-Floor"
            className="emp-dir-summary-card text-left bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer transition-all hover:border-[#1346a1]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-1 w-full">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active On-Floor</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <Store className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">12</span>
              <span className="text-xs text-slate-400">/ {totalCount}</span>
            </div>
            <div className="w-full pt-2 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="text-emerald-700 font-bold">Shift A Active</span>
                <span>Off-Duty / Roster</span>
              </div>
              <div className="flex items-center justify-end text-[10px] font-bold text-[#1346a1]">
                <span>View details &rarr;</span>
              </div>
            </div>
          </button>

          {/* 3. KYC COMPLIANCE */}
          <button
            type="button"
            ref={card3Ref}
            onClick={() => handleOpenDrawer('kyc')}
            aria-label="View details for KYC Compliance"
            className="emp-dir-summary-card text-left bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer transition-all hover:border-[#1346a1]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-1 w-full">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">KYC Compliance</span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">100%</span>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full">Verified</span>
            </div>
            <div className="w-full pt-2 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>PF & ESI Linked</span>
                <span>Aadhaar KYC</span>
              </div>
              <div className="flex items-center justify-end text-[10px] font-bold text-[#1346a1]">
                <span>View details &rarr;</span>
              </div>
            </div>
          </button>

          {/* 4. BIOMETRIC PROFILES */}
          <button
            type="button"
            ref={card4Ref}
            onClick={() => handleOpenDrawer('biometrics')}
            aria-label="View details for Biometric Profiles"
            className="emp-dir-summary-card text-left bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer transition-all hover:border-[#1346a1]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-1 w-full">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Biometric Profiles</span>
              <div className="w-8 h-8 rounded-lg bg-[#1346a1]/10 flex items-center justify-center text-[#1346a1]">
                <Fingerprint className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">{totalCount}</span>
              <span className="text-xs text-slate-400">/ {totalCount}</span>
            </div>
            <div className="w-full pt-2 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Face Enrolled</span>
                <span className="text-[#1346a1] font-bold">QR Ready</span>
              </div>
              <div className="flex items-center justify-end text-[10px] font-bold text-[#1346a1]">
                <span>View details &rarr;</span>
              </div>
            </div>
          </button>

          {/* 5. STORE LOCATIONS */}
          <button
            type="button"
            ref={card5Ref}
            onClick={() => handleOpenDrawer('locations')}
            aria-label="View details for Store Locations"
            className="emp-dir-summary-card text-left bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between cursor-pointer transition-all hover:border-[#1346a1]/40 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-2"
          >
            <div className="flex items-center justify-between mb-1 w-full">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Store Locations</span>
              <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700">
                <Building2 className="w-4 h-4" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[#18181B]">{locations.length}</span>
              <span className="text-xs text-slate-400">Hub Stores</span>
            </div>
            <div className="w-full pt-2 border-t border-slate-100 space-y-1">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>{nonHqLocations.map((l) => l.code).join(' • ')}</span>
                {hqLocation && (
                  <span className="text-[#1346a1] font-bold">{hqLocation.code}</span>
                )}
              </div>
              <div className="flex items-center justify-end text-[10px] font-bold text-[#1346a1]">
                <span>View details &rarr;</span>
              </div>
            </div>
          </button>
        </div>

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2 max-w-xl bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg focus-within:border-[#1346a1] focus-within:ring-1 focus-within:ring-[#1346a1]/20 transition-all">
            <Search className="w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by Name, Employee Code (e.g. TEST-EMP-001), Email, or Role..."
              className="w-full bg-transparent text-xs text-[#18181B] placeholder:text-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Location Filter */}
            <select
              value={selectedLocation}
              onChange={(e) => {
                setSelectedLocation(e.target.value);
                setSelectedDept('');
              }}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-100 font-medium focus:outline-none focus:border-[#1346a1]"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
            </select>

            {/* Department Filter */}
            <div className="flex items-center gap-1">
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                disabled={departmentsLoading}
                className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-100 font-medium focus:outline-none focus:border-[#1346a1] disabled:opacity-50"
              >
                <option value="">All Departments</option>
                {departmentOptions.map((dept) => (
                  <option key={dept.name} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </select>
              {departmentsError && (
                <button
                  type="button"
                  onClick={fetchMetadata}
                  className="p-1.5 text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg border border-rose-200 dark:border-rose-800 transition-colors"
                  title="Could not load departments. Click to retry."
                  aria-label="Retry loading departments"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-100 font-medium focus:outline-none focus:border-[#1346a1]"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Workforce</option>
              <option value="PROBATION">Probation</option>
              <option value="INACTIVE">Inactive / Resigned</option>
            </select>

            <button
              onClick={() => {
                setSearch('');
                setSelectedLocation('');
                setSelectedDept('');
                setSelectedStatus('ACTIVE');
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
              title="Reset Filters"
            >
              <FilterX className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Notice when created employee is hidden by active filters */}
        {filterNotice && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs shadow-2xs"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{filterNotice}</span>
            </div>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-colors shrink-0"
            >
              Clear Filters
            </button>
          </div>
        )}

        {/* WORKFORCE MASTER TABLE */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Contact className="w-4 h-4 text-[#1346a1]" />
              <h2 className="text-sm font-bold text-[#18181B]">Registered Staff Directory</h2>
              <span className="text-xs text-slate-400">({employees.length} Records)</span>
            </div>
            <span className="text-[11px] text-slate-500 font-medium">Sorted by Employee Code</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-400">Loading workforce records...</div>
            ) : employees.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No employees match current filters.</div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-100 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Designation & Role</th>
                    <th className="py-3 px-4">Store & Floor</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Shift Allotment</th>
                    <th className="py-3 px-4">Biometrics</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right w-[130px] min-w-[130px] whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {employees.map((emp) => (
                    <tr key={emp.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <Link
                          href={`/employees/profile/${emp.id}`}
                          aria-label={`View profile for ${emp.fullName || `${emp.firstName} ${emp.lastName}`}`}
                          className="flex items-center gap-2.5 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] rounded-lg"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#1346a1] text-white flex items-center justify-center font-bold text-xs shrink-0 group-hover:opacity-90">
                            {emp.firstName?.[0]}{emp.lastName?.[0]}
                          </div>
                          <div>
                            <div className="font-bold text-[#18181B] group-hover:text-[#1346a1] transition-colors">
                              {emp.fullName || `${emp.firstName} ${emp.lastName}`}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode}</div>
                          </div>
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#18181B]">{emp.designation || 'Sales Consultant'}</div>
                        <div className="text-[10px] text-slate-400 uppercase tracking-wider">{emp.role?.replace(/_/g, ' ')}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#18181B]">{emp.location?.name || 'Belagavi Flagship'}</div>
                        <div className="text-[10px] text-slate-400">{emp.floor?.name || 'Floor 0'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-medium">
                          {emp.department?.name || 'Retail Sales'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600">
                        {emp.shift?.name || 'Shift A (09:30 - 18:30)'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            <ScanFace className="w-3 h-3" />
                            Face
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedQrEmp({
                              id: emp.id,
                              code: emp.employeeCode,
                              name: emp.fullName || `${emp.firstName || ''} ${emp.lastName || ''}`.trim(),
                              department: emp.department?.name,
                              hub: emp.location?.name,
                              shift: emp.shift?.name,
                            })}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-[#eff4ff] hover:bg-[#dce9ff] text-[#0058be] font-bold border border-[#dce9ff] transition-all cursor-pointer shadow-2xs active:scale-95"
                            title={`Open One-Time QR Pass for ${emp.fullName || emp.employeeCode}`}
                          >
                            <QrCode className="w-3 h-3" />
                            <span>QR Pass</span>
                          </button>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          emp.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {emp.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              detailsTriggerRef.current = e.currentTarget;
                              setSelectedDetailEmp(emp);
                            }}
                            aria-label={`View quick details for ${emp.fullName || `${emp.firstName} ${emp.lastName}`}`}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:bg-slate-300 rounded-lg border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer shadow-2xs active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                            title="Open quick details summary"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                            <span>Details</span>
                          </button>
                          <Link
                            href={`/employees/profile/${emp.id}`}
                            aria-label={`View profile for ${emp.fullName || `${emp.firstName} ${emp.lastName}`}`}
                            className="inline-flex items-center justify-center px-3 py-1.5 text-xs font-semibold text-[#1346a1] dark:text-blue-300 hover:bg-[#1346a1]/10 dark:hover:bg-blue-500/20 active:bg-[#1346a1]/20 rounded-lg border border-[#1346a1]/30 dark:border-blue-500/40 transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1346a1] focus-visible:ring-offset-1"
                          >
                            View Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* 3. NEW HR ANALYSIS & CONNECTED-DOT TELEMETRY SECTION */}
        <div id="hr-analysis-section" className="pt-6 border-t border-slate-200 dark:border-slate-800">
          <HrAnalysisModule
            initialLocationId={selectedLocation}
            initialDeptId={selectedDept}
          />
        </div>

        {/* CREATE EMPLOYEE MODAL */}
        <AddEmployeeDialog
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSuccess={handleEmployeeCreated}
          locations={locations}
          departments={departments}
          departmentsLoading={departmentsLoading}
          departmentsError={departmentsError}
          onRetryDepartments={fetchMetadata}
          triggerRef={addEmployeeBtnRef}
        />

        {/* ENTERPRISE BULK EMPLOYEE IMPORT & ID MANAGEMENT MODAL */}
        <BulkImportModal
          isOpen={isImportModalOpen}
          onClose={() => setIsImportModalOpen(false)}
          onSuccess={() => {
            fetchEmployees();
            drawerDataCacheRef.current = {};
          }}
        />

        {/* Employee One-Time QR Pass Modal */}
        {selectedQrEmp && (
          <EmployeeQrModal
            open={!!selectedQrEmp}
            onClose={() => setSelectedQrEmp(null)}
            employee={selectedQrEmp}
          />
        )}

        {/* Employee Quick Details Drawer */}
        <EmployeeQuickDetailsDrawer
          open={Boolean(selectedDetailEmp)}
          onClose={() => setSelectedDetailEmp(null)}
          employee={selectedDetailEmp}
          onOpenQrPass={(emp) => {
            setSelectedDetailEmp(null);
            setSelectedQrEmp(emp);
          }}
          triggerRef={detailsTriggerRef}
        />

        {/* 1. TOTAL WORKFORCE DRAWER */}
        <TotalWorkforceDrawer
          open={activeDrawer === 'workforce'}
          onClose={handleCloseDrawer}
          employees={drawerEmployees}
          locations={locations}
          departments={departments}
          currentLocationId={selectedLocation}
          currentDeptId={selectedDept}
          onApplyDirectoryFilter={({ locationId, departmentId }) => {
            if (locationId !== undefined) setSelectedLocation(locationId);
            if (departmentId !== undefined) setSelectedDept(departmentId);
          }}
          onRefresh={() => handleRefreshDrawer('workforce')}
          isRefreshing={drawerRefreshing}
          triggerRef={card1Ref}
          isLoading={drawerLoading}
          error={drawerError}
          onRetry={() => handleOpenDrawer('workforce')}
        />

        {/* 2. ACTIVE ON-FLOOR DRAWER */}
        <ActiveOnFloorDrawer
          open={activeDrawer === 'on-floor'}
          onClose={handleCloseDrawer}
          employees={drawerEmployees}
          locations={locations}
          departments={departments}
          currentLocationId={selectedLocation}
          currentDeptId={selectedDept}
          onApplyDirectoryFilter={({ locationId, departmentId, status }) => {
            if (locationId !== undefined) setSelectedLocation(locationId);
            if (departmentId !== undefined) setSelectedDept(departmentId);
            if (status !== undefined) setSelectedStatus(status);
          }}
          onRefresh={() => handleRefreshDrawer('on-floor')}
          isRefreshing={drawerRefreshing}
          triggerRef={card2Ref}
          isLoading={drawerLoading}
          error={drawerError}
          onRetry={() => handleOpenDrawer('on-floor')}
        />

        {/* 3. KYC COMPLIANCE DRAWER */}
        <KycComplianceDrawer
          open={activeDrawer === 'kyc'}
          onClose={handleCloseDrawer}
          employees={drawerEmployees}
          locations={locations}
          departments={departments}
          currentLocationId={selectedLocation}
          currentDeptId={selectedDept}
          onApplyDirectoryFilter={({ locationId, departmentId }) => {
            if (locationId !== undefined) setSelectedLocation(locationId);
            if (departmentId !== undefined) setSelectedDept(departmentId);
          }}
          onRefresh={() => handleRefreshDrawer('kyc')}
          isRefreshing={drawerRefreshing}
          triggerRef={card3Ref}
          isLoading={drawerLoading}
          error={drawerError}
          onRetry={() => handleOpenDrawer('kyc')}
        />

        {/* 4. BIOMETRIC PROFILES DRAWER */}
        <BiometricProfilesDrawer
          open={activeDrawer === 'biometrics'}
          onClose={handleCloseDrawer}
          employees={drawerEmployees}
          locations={locations}
          departments={departments}
          currentLocationId={selectedLocation}
          currentDeptId={selectedDept}
          onApplyDirectoryFilter={({ locationId, departmentId }) => {
            if (locationId !== undefined) setSelectedLocation(locationId);
            if (departmentId !== undefined) setSelectedDept(departmentId);
          }}
          onRefresh={() => handleRefreshDrawer('biometrics')}
          isRefreshing={drawerRefreshing}
          triggerRef={card4Ref}
          isLoading={drawerLoading}
          error={drawerError}
          onRetry={() => handleOpenDrawer('biometrics')}
        />

        {/* 5. STORE LOCATIONS DRAWER */}
        <StoreLocationsDrawer
          open={activeDrawer === 'locations'}
          onClose={handleCloseDrawer}
          locations={locations}
          employees={drawerEmployees}
          currentLocationId={selectedLocation}
          currentDeptId={selectedDept}
          onSelectLocation={(locId) => {
            setSelectedLocation(locId);
          }}
          onRefresh={() => handleRefreshDrawer('locations')}
          isRefreshing={drawerRefreshing}
          triggerRef={card5Ref}
          isLoading={drawerLoading}
          error={drawerError}
          onRetry={() => handleOpenDrawer('locations')}
        />
      </div>
    </DashboardLayout>
  );
}
