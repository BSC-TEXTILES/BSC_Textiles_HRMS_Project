'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import {
  X,
  RefreshCw,
  Search,
  ExternalLink,
  Eye,
  Download,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  FileText,
  Users,
  ShieldCheck,
  Calendar,
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import api from '@/lib/api';

export type DocumentDrawerType =
  | 'total-employees'
  | 'with-documents'
  | 'missing-required'
  | 'total-documents'
  | 'pending-review'
  | 'verified'
  | 'rejected'
  | 'expiring-soon'
  | 'recently-added';

interface DocumentMetricDrawerProps {
  drawerType: DocumentDrawerType | null;
  onClose: () => void;
  locationId: string;
  departmentId: string;
  complianceFilter: string;
  locations: any[];
  departments: any[];
  onNavigateTab: (tab: 'directory' | 'folders' | 'verification' | 'missing', filters?: { statusFilter?: string }) => void;
  onPreviewDoc: (doc: any) => void;
  onDownloadDoc: (doc: any) => void;
  onVerifyDoc?: (doc: any, action: 'VERIFY' | 'REJECT') => void;
  onReplaceDoc?: (doc: any) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(d?: string | Date | null): string {
  if (!d) return 'Not available';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return 'Not available';
  }
}

function formatDateTime(d?: string | Date | null): string {
  if (!d) return 'Not available';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return 'Not available';
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  } catch {
    return 'Not available';
  }
}

function renderStatusBadge(status?: string) {
  switch (status) {
    case 'VERIFIED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
          <CheckCircle2 className="w-3 h-3" />
          Verified
        </span>
      );
    case 'PENDING_VERIFICATION':
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-400 border border-orange-200 dark:border-orange-800">
          <Clock className="w-3 h-3" />
          Pending Review
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
          <XCircle className="w-3 h-3" />
          Rejected
        </span>
      );
    case 'REQUIRES_REPLACEMENT':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
          <AlertTriangle className="w-3 h-3" />
          Replacement Needed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
          {status || 'Not available'}
        </span>
      );
  }
}

export function DocumentMetricDrawer({
  drawerType,
  onClose,
  locationId,
  departmentId,
  complianceFilter,
  locations,
  departments,
  onNavigateTab,
  onPreviewDoc,
  onDownloadDoc,
  onVerifyDoc,
  onReplaceDoc,
  triggerRef,
}: DocumentMetricDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeChip, setActiveChip] = useState('ALL');

  // Cached data
  const [directoryData, setDirectoryData] = useState<any[]>([]);
  const [missingData, setMissingData] = useState<any[]>([]);
  const [documentsData, setDocumentsData] = useState<any[]>([]);
  const [documentsSummary, setDocumentsSummary] = useState<any>(null);

  const cacheRef = useRef<Record<string, any>>({});
  const abortControllerRef = useRef<AbortController | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Filter summary description
  const filterSummary = useMemo(() => {
    const locObj = locations.find((l) => l.id === locationId);
    const deptObj = departments.find((d) => d.id === departmentId);
    const parts = [];
    if (locObj) parts.push(`Store: ${locObj.name}`);
    else parts.push('All Karnataka Hubs');
    if (deptObj) parts.push(`Dept: ${deptObj.name}`);
    else parts.push('All Departments');
    if (complianceFilter && complianceFilter !== 'all') {
      parts.push(`Compliance: ${complianceFilter}`);
    }
    return parts.join(' • ');
  }, [locationId, departmentId, complianceFilter, locations, departments]);

  // Drawer Title and Config
  const drawerMeta = useMemo(() => {
    switch (drawerType) {
      case 'total-employees':
        return {
          title: 'Total Employees',
          subtitle: 'Workforce records in Karnataka scope',
          footerLabel: 'Open in Employee Directory',
          targetTab: 'directory' as const,
        };
      case 'with-documents':
        return {
          title: 'Employees With Documents',
          subtitle: 'Active document dossiers',
          footerLabel: 'Open in Employee Directory',
          targetTab: 'directory' as const,
        };
      case 'missing-required':
        return {
          title: 'Missing Required Documents',
          subtitle: 'Employees requiring document submission',
          footerLabel: 'Open Missing Documents tab',
          targetTab: 'missing' as const,
        };
      case 'total-documents':
        return {
          title: 'Total Documents Stored',
          subtitle: 'Comprehensive file catalog',
          footerLabel: 'Open in Employee Directory',
          targetTab: 'directory' as const,
        };
      case 'pending-review':
        return {
          title: 'Pending Review Queue',
          subtitle: 'Documents awaiting HR verification',
          footerLabel: 'Open Verification Queue',
          targetTab: 'verification' as const,
        };
      case 'verified':
        return {
          title: 'Verified Documents',
          subtitle: 'Approved workforce credentials',
          footerLabel: 'Open in Employee Directory',
          targetTab: 'directory' as const,
        };
      case 'rejected':
        return {
          title: 'Rejected Documents',
          subtitle: 'Clarification and resubmission needed',
          footerLabel: 'Open Verification Queue',
          targetTab: 'verification' as const,
        };
      case 'expiring-soon':
        return {
          title: 'Expiring Soon Documents',
          subtitle: 'Documents expiring within 30 days',
          footerLabel: 'Open in Employee Directory',
          targetTab: 'directory' as const,
        };
      case 'recently-added':
        return {
          title: 'Recently Added Documents',
          subtitle: 'Uploads in the past 7 days',
          footerLabel: 'Open in Employee Directory',
          targetTab: 'directory' as const,
        };
      default:
        return {
          title: 'Document Details',
          subtitle: '',
          footerLabel: 'Open in Employee Directory',
          targetTab: 'directory' as const,
        };
    }
  }, [drawerType]);

  // Fetch drawer-specific data
  const loadDrawerData = useCallback(async (forceRefresh = false) => {
    if (!drawerType) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const cacheKey = `${drawerType}_${locationId}_${departmentId}`;
    if (!forceRefresh && cacheRef.current[cacheKey]) {
      const cached = cacheRef.current[cacheKey];
      if (drawerType === 'total-employees' || drawerType === 'with-documents') {
        setDirectoryData(cached);
      } else if (drawerType === 'missing-required') {
        setMissingData(cached);
      } else {
        setDocumentsData(cached.data || []);
        setDocumentsSummary(cached.summary || null);
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (locationId && locationId !== 'all') params.append('locationId', locationId);
      if (departmentId && departmentId !== 'all') params.append('departmentId', departmentId);

      if (drawerType === 'total-employees' || drawerType === 'with-documents') {
        params.append('limit', '100');
        const res = await api.get(`/employees/documents/directory?${params.toString()}`, {
          signal: abortController.signal,
        });
        const emps = res.data?.data || [];
        cacheRef.current[cacheKey] = emps;
        setDirectoryData(emps);
      } else if (drawerType === 'missing-required') {
        const res = await api.get(`/employees/documents/missing-report?${params.toString()}`, {
          signal: abortController.signal,
        });
        const report = res.data?.data || [];
        cacheRef.current[cacheKey] = report;
        setMissingData(report);
      } else {
        // Document-centric cards
        let filterType = 'all';
        if (drawerType === 'pending-review') filterType = 'pending';
        else if (drawerType === 'verified') filterType = 'verified';
        else if (drawerType === 'rejected') filterType = 'rejected';
        else if (drawerType === 'expiring-soon') filterType = 'expiring';
        else if (drawerType === 'recently-added') filterType = 'recent';

        params.append('filterType', filterType);
        params.append('limit', '500');

        const res = await api.get(`/employees/documents/records?${params.toString()}`, {
          signal: abortController.signal,
        });
        const result = {
          data: res.data?.data || [],
          summary: res.data?.summary || null,
        };
        cacheRef.current[cacheKey] = result;
        setDocumentsData(result.data);
        setDocumentsSummary(result.summary);
      }
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.code === 'ERR_CANCELED') {
        return; // Ignore canceled requests
      }
      console.error('Failed to load drawer records:', err);
      setError(err?.response?.data?.message || err?.message || 'Failed to load details. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [drawerType, locationId, departmentId]);

  // Trigger load when drawer opens or filters change
  useEffect(() => {
    if (drawerType) {
      setSearch('');
      setActiveChip('ALL');
      loadDrawerData();
    }
  }, [drawerType, loadDrawerData]);

  // Clean up abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Accessibility: Lock background scroll, trap escape, focus management
  useEffect(() => {
    if (!drawerType) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const triggerEl = triggerRef?.current;

    const timeout = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timeout);
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', handleKeyDown);
      triggerEl?.focus();
    };
  }, [drawerType, onClose, triggerRef]);

  if (!mounted || !drawerType) return null;

  // -------------------------------------------------------------
  // Data Filtering by Search and Chips
  // -------------------------------------------------------------
  const filteredDirectory = directoryData.filter((emp) => {
    if (activeChip === 'WITH_DOCS' && emp.totalDocuments === 0) return false;
    if (activeChip === 'WITHOUT_DOCS' && emp.totalDocuments > 0) return false;
    if (activeChip === 'COMPLIANT' && !emp.isCompliant) return false;
    if (activeChip === 'NON_COMPLIANT' && emp.isCompliant) return false;

    if (search.trim()) {
      const q = search.toLowerCase();
      const code = (emp.employeeCode || '').toLowerCase();
      const name = (emp.fullName || '').toLowerCase();
      const desig = (emp.designation || '').toLowerCase();
      const dept = (emp.departmentName || '').toLowerCase();
      const loc = (emp.locationName || '').toLowerCase();
      return code.includes(q) || name.includes(q) || desig.includes(q) || dept.includes(q) || loc.includes(q);
    }
    return true;
  });

  const filteredMissing = missingData.filter((item) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const emp = item.employee || {};
      const code = (emp.employeeCode || '').toLowerCase();
      const name = (emp.fullName || '').toLowerCase();
      const dept = (emp.departmentName || '').toLowerCase();
      const loc = (emp.locationName || '').toLowerCase();
      const missingList = (item.missingDocuments || []).map((m: any) => m.name.toLowerCase()).join(' ');
      return code.includes(q) || name.includes(q) || dept.includes(q) || loc.includes(q) || missingList.includes(q);
    }
    return true;
  });

  const filteredDocuments = documentsData.filter((doc) => {
    if (drawerType === 'total-documents') {
      if (activeChip === 'VERIFIED' && doc.verificationStatus !== 'VERIFIED') return false;
      if (activeChip === 'PENDING' && doc.verificationStatus !== 'PENDING_VERIFICATION') return false;
      if (activeChip === 'REJECTED' && doc.verificationStatus !== 'REJECTED') return false;
    } else if (drawerType === 'verified') {
      if (activeChip !== 'ALL' && doc.documentType !== activeChip) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const id = (doc.id || '').toLowerCase();
      const type = (doc.documentType || '').toLowerCase();
      const title = (doc.title || '').toLowerCase();
      const empCode = (doc.employeeCode || '').toLowerCase();
      const empName = (doc.employeeName || '').toLowerCase();
      const dept = (doc.departmentName || '').toLowerCase();
      const uploader = (doc.uploadedByName || '').toLowerCase();
      const verifier = (doc.verifiedByName || '').toLowerCase();
      return (
        id.includes(q) ||
        type.includes(q) ||
        title.includes(q) ||
        empCode.includes(q) ||
        empName.includes(q) ||
        dept.includes(q) ||
        uploader.includes(q) ||
        verifier.includes(q)
      );
    }
    return true;
  });

  // Calculate Record Count for Header Badge
  let recordCount = 0;
  if (drawerType === 'total-employees' || drawerType === 'with-documents') {
    recordCount = filteredDirectory.length;
  } else if (drawerType === 'missing-required') {
    recordCount = filteredMissing.length;
  } else {
    recordCount = filteredDocuments.length;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="emp-doc-drawer-title"
      aria-describedby="emp-doc-drawer-desc"
    >
      {/* Even dim backdrop without blur or gradient */}
      <div
        className="fixed inset-0 bg-slate-900/60 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Drawer panel */}
      <div className="relative z-10 w-full sm:w-[80vw] sm:max-w-[760px] max-w-full h-full bg-white dark:bg-[#0e172a] shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col text-slate-800 dark:text-slate-100 animate-in slide-in-from-right duration-200 ease-out">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-20 px-5 py-4 bg-white dark:bg-[#0e172a] border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex flex-col min-w-0 pr-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h2
                id="emp-doc-drawer-title"
                className="text-base font-bold text-slate-900 dark:text-slate-100 tracking-tight truncate"
              >
                {drawerMeta.title}
              </h2>
              <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#722F37]/10 text-[#722F37] border border-[#722F37]/20 whitespace-nowrap">
                {recordCount} Records
              </span>
            </div>

            <div className="flex items-center gap-2 mt-1">
              <span
                id="emp-doc-drawer-desc"
                className="text-[11px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-md"
              >
                {filterSummary}
              </span>
              {drawerMeta.subtitle && (
                <span className="text-[11px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                  • {drawerMeta.subtitle}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => loadDrawerData(true)}
              disabled={loading}
              aria-label="Refresh records"
              className="p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Refresh Records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-[#722F37]' : ''}`} />
            </button>

            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              aria-label="Close details"
              className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Drawer Body with internal scrolling */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          
          {/* ERROR ALERT WITH RETRY */}
          {error && (
            <div className="p-3.5 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl flex items-center justify-between gap-3 text-xs text-rose-700 dark:text-rose-400">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => loadDrawerData(true)}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-rose-600 hover:bg-rose-700 text-white transition-colors shrink-0"
              >
                Retry
              </button>
            </div>
          )}

          {/* SUMMARY STRIP TOP BANNER */}
          {drawerType === 'total-employees' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Total Employees</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">{directoryData.length}</div>
              </div>
              <div>
                <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-semibold">With Documents</div>
                <div className="text-base font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {directoryData.filter((e) => e.totalDocuments > 0).length}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Compliant</div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {directoryData.filter((e) => e.isCompliant).length}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-semibold">Non-Compliant</div>
                <div className="text-base font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                  {directoryData.filter((e) => !e.isCompliant).length}
                </div>
              </div>
            </div>
          )}

          {drawerType === 'with-documents' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Active Dossiers</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                  {directoryData.filter((e) => e.totalDocuments > 0).length}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-blue-600 dark:text-blue-400 uppercase font-semibold">Avg Docs / Employee</div>
                <div className="text-base font-bold text-blue-600 dark:text-blue-400 mt-0.5">
                  {directoryData.length > 0
                    ? (directoryData.reduce((acc, curr) => acc + (curr.totalDocuments || 0), 0) / directoryData.length).toFixed(1)
                    : '0'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Complete Dossier</div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {directoryData.filter((e) => e.isCompliant).length}
                </div>
              </div>
            </div>
          )}

          {drawerType === 'missing-required' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-amber-50/40 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-amber-800 dark:text-amber-300 uppercase font-semibold">Action Needed</div>
                <div className="text-base font-bold text-amber-800 dark:text-amber-300 mt-0.5">{missingData.length} Employees</div>
              </div>
              <div>
                <div className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-semibold">Total Missing Items</div>
                <div className="text-base font-bold text-amber-700 dark:text-amber-400 mt-0.5">
                  {missingData.reduce((acc, curr) => acc + (curr.missingCount || 0), 0)} Items
                </div>
              </div>
              <div>
                <div className="text-[10px] text-amber-700 dark:text-amber-400 uppercase font-semibold">Key Missing Docs</div>
                <div className="text-xs font-semibold text-amber-900 dark:text-amber-200 mt-1 truncate">
                  Aadhaar, PAN, Offer Letter
                </div>
              </div>
            </div>
          )}

          {drawerType === 'total-documents' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-purple-50/30 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/40 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-purple-700 dark:text-purple-400 uppercase font-semibold">Total Files</div>
                <div className="text-base font-bold text-purple-700 dark:text-purple-300 mt-0.5">{documentsData.length}</div>
              </div>
              <div>
                <div className="text-[10px] text-purple-700 dark:text-purple-400 uppercase font-semibold">Storage Used</div>
                <div className="text-base font-bold text-purple-700 dark:text-purple-300 mt-0.5">
                  {formatBytes(documentsSummary?.totalStorageBytes)}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Verified</div>
                <div className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {documentsData.filter((d) => d.verificationStatus === 'VERIFIED').length}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-orange-600 dark:text-orange-400 uppercase font-semibold">Pending / Rejected</div>
                <div className="text-base font-bold text-orange-600 dark:text-orange-400 mt-0.5">
                  {documentsData.filter((d) => d.verificationStatus === 'PENDING_VERIFICATION').length} / {documentsData.filter((d) => d.verificationStatus === 'REJECTED').length}
                </div>
              </div>
            </div>
          )}

          {drawerType === 'pending-review' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-orange-50/40 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-orange-700 dark:text-orange-400 uppercase font-semibold">Pending in Queue</div>
                <div className="text-base font-bold text-orange-700 dark:text-orange-300 mt-0.5">{documentsData.length} Files</div>
              </div>
              <div>
                <div className="text-[10px] text-orange-700 dark:text-orange-400 uppercase font-semibold">Oldest Pending</div>
                <div className="text-base font-bold text-orange-700 dark:text-orange-300 mt-0.5">
                  {documentsData.length > 0
                    ? `${Math.max(...documentsData.map((d) => d.daysPending || 0))} Days`
                    : 'None'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-orange-700 dark:text-orange-400 uppercase font-semibold">Hubs Involved</div>
                <div className="text-base font-bold text-orange-700 dark:text-orange-300 mt-0.5">
                  {new Set(documentsData.map((d) => d.locationName).filter(Boolean)).size} Hubs
                </div>
              </div>
            </div>
          )}

          {drawerType === 'verified' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/40 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Total Verified</div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">{documentsData.length} Files</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Verified Types</div>
                <div className="text-base font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {Object.keys(documentsSummary?.byType || {}).length} Categories
                </div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-semibold">Primary Verifier</div>
                <div className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 mt-1 truncate">
                  {Object.keys(documentsSummary?.byVerifier || {})[0] || 'HR Manager'}
                </div>
              </div>
            </div>
          )}

          {drawerType === 'rejected' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-rose-50/40 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-rose-700 dark:text-rose-400 uppercase font-semibold">Total Rejected</div>
                <div className="text-base font-bold text-rose-700 dark:text-rose-300 mt-0.5">{documentsData.length} Files</div>
              </div>
              <div>
                <div className="text-[10px] text-rose-700 dark:text-rose-400 uppercase font-semibold">Distinct Reasons</div>
                <div className="text-base font-bold text-rose-700 dark:text-rose-300 mt-0.5">
                  {Object.keys(documentsSummary?.byReason || {}).length} Reasons
                </div>
              </div>
              <div>
                <div className="text-[10px] text-rose-700 dark:text-rose-400 uppercase font-semibold">Next Step</div>
                <div className="text-xs font-semibold text-rose-800 dark:text-rose-300 mt-1">Re-upload Required</div>
              </div>
            </div>
          )}

          {drawerType === 'expiring-soon' && (
            <div className="grid grid-cols-2 gap-2.5 p-3 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-slate-500 uppercase font-semibold">Expiring &lt; 30 Days</div>
                <div className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">{documentsData.length} Files</div>
              </div>
              <div>
                <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-semibold">Compliance State</div>
                <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 mt-1">All Credentials In Valid Period</div>
              </div>
            </div>
          )}

          {drawerType === 'recently-added' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/40 rounded-xl text-xs">
              <div>
                <div className="text-[10px] text-indigo-700 dark:text-indigo-400 uppercase font-semibold">Uploaded Past 7 Days</div>
                <div className="text-base font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">{documentsData.length} Files</div>
              </div>
              <div>
                <div className="text-[10px] text-indigo-700 dark:text-indigo-400 uppercase font-semibold">Distinct Uploaders</div>
                <div className="text-base font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                  {Object.keys(documentsSummary?.byUploader || {}).length}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-indigo-700 dark:text-indigo-400 uppercase font-semibold">Latest Upload</div>
                <div className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 mt-1 truncate">
                  {formatDate(documentsData[0]?.createdAt)}
                </div>
              </div>
            </div>
          )}

          {/* SEARCH BOX AND FILTER CHIPS */}
          <div className="space-y-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={
                  drawerType === 'missing-required'
                    ? 'Search employee name, ID, missing document...'
                    : drawerType === 'total-employees' || drawerType === 'with-documents'
                    ? 'Search employee name, code, designation, department...'
                    : 'Search by document ID, type, employee, or uploader...'
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-[#722F37] text-slate-800 dark:text-slate-100"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Filter chips for specific cards */}
            {drawerType === 'total-employees' && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {[
                  { id: 'ALL', label: `All (${directoryData.length})` },
                  { id: 'WITH_DOCS', label: `With Documents (${directoryData.filter((e) => e.totalDocuments > 0).length})` },
                  { id: 'WITHOUT_DOCS', label: `Without Docs (${directoryData.filter((e) => e.totalDocuments === 0).length})` },
                  { id: 'COMPLIANT', label: `Compliant (${directoryData.filter((e) => e.isCompliant).length})` },
                  { id: 'NON_COMPLIANT', label: `Non-compliant (${directoryData.filter((e) => !e.isCompliant).length})` },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setActiveChip(chip.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                      activeChip === chip.id
                        ? 'bg-[#722F37] text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {drawerType === 'total-documents' && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                {[
                  { id: 'ALL', label: `All (${documentsData.length})` },
                  { id: 'VERIFIED', label: `Verified (${documentsData.filter((d) => d.verificationStatus === 'VERIFIED').length})` },
                  { id: 'PENDING', label: `Pending (${documentsData.filter((d) => d.verificationStatus === 'PENDING_VERIFICATION').length})` },
                  { id: 'REJECTED', label: `Rejected (${documentsData.filter((d) => d.verificationStatus === 'REJECTED').length})` },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setActiveChip(chip.id)}
                    className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                      activeChip === chip.id
                        ? 'bg-[#722F37] text-white shadow-xs'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {drawerType === 'verified' && (
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <button
                  type="button"
                  onClick={() => setActiveChip('ALL')}
                  className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                    activeChip === 'ALL'
                      ? 'bg-[#722F37] text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                  }`}
                >
                  All Types ({documentsData.length})
                </button>
                {Object.entries(documentsSummary?.byType || {})
                  .slice(0, 4)
                  .map(([typeCode, count]) => (
                    <button
                      key={typeCode}
                      type="button"
                      onClick={() => setActiveChip(typeCode)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                        activeChip === typeCode
                          ? 'bg-[#722F37] text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                      }`}
                    >
                      {typeCode.replace(/_/g, ' ')} ({String(count)})
                    </button>
                  ))}
              </div>
            )}
          </div>

          {/* LOADING SKELETON STATE */}
          {loading && (
            <div className="space-y-2.5 py-4">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded-lg animate-pulse border border-slate-200/60 dark:border-slate-800"
                />
              ))}
            </div>
          )}

          {/* DETAIL TABLE CONTAINERS */}
          {!loading && !error && (
            <>
              {/* 4.1 TOTAL EMPLOYEES */}
              {drawerType === 'total-employees' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDirectory.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No employees match these filters
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Designation</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Hub / Location</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-center">Total Docs</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Required Completed</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-center">Pending Review</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Compliance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDirectory.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono font-medium text-slate-600 dark:text-slate-300">
                              {emp.employeeCode}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${emp.id}`}
                                aria-label={`Open complete profile for ${emp.fullName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] dark:hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{emp.fullName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {emp.designation || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {emp.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {emp.locationName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-center font-bold text-slate-800 dark:text-slate-100">
                              {emp.totalDocuments}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-700 dark:text-slate-200">
                                  {emp.requiredCompleted} / {emp.requiredTarget}
                                </span>
                                <div className="w-16 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      emp.requiredCompleted === emp.requiredTarget ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                    style={{ width: `${Math.round((emp.requiredCompleted / emp.requiredTarget) * 100)}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-center font-semibold text-orange-600">
                              {emp.pendingVerification || 0}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              {emp.isCompliant ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Compliant
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                  <AlertTriangle className="w-3 h-3" />
                                  Action Needed
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.2 WITH DOCUMENTS */}
              {drawerType === 'with-documents' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDirectory.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No employees match these filters
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Hub / Location</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-center">Total Docs</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Last Upload Date</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDirectory.map((emp) => (
                          <tr key={emp.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono font-medium text-slate-600 dark:text-slate-300">
                              {emp.employeeCode}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${emp.id}`}
                                aria-label={`Open complete profile for ${emp.fullName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{emp.fullName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {emp.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {emp.locationName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-center font-bold text-blue-600 dark:text-blue-400">
                              {emp.totalDocuments}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(emp.lastDocumentUpdate)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                                Active Dossier
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.3 MISSING REQUIRED */}
              {drawerType === 'missing-required' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredMissing.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No employees have missing required documents
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Hub / Location</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Missing Document Types</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-center">Missing Count</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Days Since Requested</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredMissing.map((item) => (
                          <tr key={item.employee?.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono font-medium text-slate-600 dark:text-slate-300">
                              {item.employee?.employeeCode}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${item.employee?.id}`}
                                aria-label={`Open complete profile for ${item.employee?.fullName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{item.employee?.fullName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {item.employee?.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {item.employee?.locationName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {(item.missingDocuments || []).map((m: any) => (
                                  <span
                                    key={m.code}
                                    className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40"
                                  >
                                    {m.name}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-center font-bold text-amber-600">
                              {item.missingCount}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-500">
                              {item.daysSinceRequested ? `${item.daysSinceRequested} days` : 'Not available'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.4 TOTAL DOCUMENTS */}
              {drawerType === 'total-documents' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No documents match these filters
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document Type</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Uploaded Date</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Uploaded By</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-center">Version</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Status</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {doc.id}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                              {doc.title || doc.documentType?.replace(/_/g, ' ') || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                              {doc.employeeCode || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${doc.employeeId}`}
                                aria-label={`Open complete profile for ${doc.employeeName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{doc.employeeName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(doc.createdAt)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.uploadedByName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-center font-mono font-medium">
                              v{doc.version || 1}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              {renderStatusBadge(doc.verificationStatus)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => onPreviewDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="View document"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDownloadDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="Download document"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.5 PENDING REVIEW */}
              {drawerType === 'pending-review' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No documents are pending review
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document Type</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Hub</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Uploaded Date</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-center">Days Pending</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Uploaded By</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {doc.id}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                              {doc.title || doc.documentType?.replace(/_/g, ' ') || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                              {doc.employeeCode || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${doc.employeeId}`}
                                aria-label={`Open complete profile for ${doc.employeeName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{doc.employeeName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.locationName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(doc.createdAt)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-center font-bold text-orange-600">
                              {doc.daysPending || 0}d
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.uploadedByName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => onPreviewDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="View document"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {onVerifyDoc && (
                                  <button
                                    type="button"
                                    onClick={() => onVerifyDoc(doc, 'VERIFY')}
                                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors"
                                    title="Verify document"
                                  >
                                    Verify
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.6 VERIFIED */}
              {drawerType === 'verified' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No verified documents match these filters
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document Type</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Verified Date</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Verified By</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {doc.id}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                              {doc.title || doc.documentType?.replace(/_/g, ' ') || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                              {doc.employeeCode || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${doc.employeeId}`}
                                aria-label={`Open complete profile for ${doc.employeeName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{doc.employeeName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(doc.verifiedAt || doc.updatedAt)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.verifiedByName || 'HR Manager'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => onPreviewDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="View document"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDownloadDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="Download document"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.7 REJECTED */}
              {drawerType === 'rejected' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No rejected documents
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document Type</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Rejected Date</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Rejected By</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Rejection Reason</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Re-upload Status</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {doc.id}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                              {doc.title || doc.documentType?.replace(/_/g, ' ') || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                              {doc.employeeCode || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${doc.employeeId}`}
                                aria-label={`Open complete profile for ${doc.employeeName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{doc.employeeName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(doc.updatedAt || doc.verifiedAt)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.verifiedByName || 'HR Manager'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span className="text-rose-700 dark:text-rose-400 font-medium">
                                {doc.rejectionReason || 'Clarification required'}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                Pending Re-upload
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => onPreviewDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="View document"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                {onReplaceDoc && (
                                  <button
                                    type="button"
                                    onClick={() => onReplaceDoc(doc)}
                                    className="px-2 py-0.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold transition-colors"
                                    title="Re-upload replacement"
                                  >
                                    Re-upload
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.8 EXPIRING SOON */}
              {drawerType === 'expiring-soon' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No documents are expiring in the next 30 days.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document Type</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Expiry Date</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-center">Days Left</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {doc.id}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                              {doc.title || doc.documentType?.replace(/_/g, ' ') || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                              {doc.employeeCode || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${doc.employeeId}`}
                                aria-label={`Open complete profile for ${doc.employeeName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{doc.employeeName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDate(doc.expiryDate)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-center font-bold text-amber-600">
                              {doc.daysLeft !== null ? `${doc.daysLeft}d` : 'Not available'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* 4.9 RECENTLY ADDED */}
              {drawerType === 'recently-added' && (
                <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
                  {filteredDocuments.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No documents added recently
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="sticky top-0 bg-slate-50 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-800">
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Document Type</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee ID</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Employee Name</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Department</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Uploaded Date & Time</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Uploaded By</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap">Status</th>
                          <th className="px-3.5 py-2.5 whitespace-nowrap text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredDocuments.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-[11px] text-slate-500">
                              {doc.id}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-semibold text-slate-800 dark:text-slate-200">
                              {doc.title || doc.documentType?.replace(/_/g, ' ') || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap font-mono text-slate-600 dark:text-slate-300">
                              {doc.employeeCode || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <Link
                                href={`/employees/profile/${doc.employeeId}`}
                                aria-label={`Open complete profile for ${doc.employeeName}`}
                                className="font-semibold text-slate-900 dark:text-white hover:text-[#722F37] hover:underline flex items-center gap-1.5"
                              >
                                <span>{doc.employeeName}</span>
                                <ExternalLink className="w-3 h-3 text-slate-400" />
                              </Link>
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.departmentName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {formatDateTime(doc.createdAt)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                              {doc.uploadedByName || 'Not available'}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              {renderStatusBadge(doc.verificationStatus)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => onPreviewDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="View document"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onDownloadDoc(doc)}
                                  className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                  title="Download document"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Sticky Footer Action */}
        <div className="sticky bottom-0 z-20 px-5 py-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            Showing {recordCount} records matching active filters
          </div>
          <button
            type="button"
            onClick={() => {
              onNavigateTab(drawerMeta.targetTab);
              onClose();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#722F37] hover:bg-[#59242b] text-white text-xs font-semibold shadow-xs transition-colors"
          >
            <span>{drawerMeta.footerLabel}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
