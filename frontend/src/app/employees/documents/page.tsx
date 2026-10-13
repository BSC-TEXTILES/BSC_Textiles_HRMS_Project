'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  FolderLock,
  Folder,
  FolderOpen,
  FileText,
  Upload,
  Download,
  Eye,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  ChevronDown,
  Layers,
  UserCheck,
  Building2,
  FileCheck,
  FilePlus,
  History,
  RotateCcw,
  Sparkles,
  Info,
  Calendar,
  ChevronLeft,
  Lock,
  ExternalLink,
  Sliders,
  Trash2
} from 'lucide-react';

export default function EmployeeDocumentsPage() {
  // Navigation & View Mode
  const [viewMode, setViewMode] = useState<'directory' | 'folders' | 'verification' | 'missing'>('directory');
  
  // Filters
  const [selectedLocation, setSelectedLocation] = useState<string>('all');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Metadata
  const [locations, setLocations] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [docTypes, setDocTypes] = useState<any[]>([]);
  const [docTypesGrouped, setDocTypesGrouped] = useState<Record<string, any[]>>({});

  // Dashboard Metrics & Directory
  const [loading, setLoading] = useState<boolean>(true);
  const [dashboardMetrics, setDashboardMetrics] = useState<any>({
    totalEmployees: 0,
    employeesWithDocuments: 0,
    employeesWithMissingRequired: 0,
    totalDocuments: 0,
    documentsPendingVerification: 0,
    documentsVerified: 0,
    documentsRejected: 0,
    documentsRequiresReplacement: 0,
    documentsExpiringSoon: 0,
    documentsExpired: 0,
    recentlyUploaded: 0,
    categoryBreakdown: []
  });

  const [employees, setEmployees] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [verificationQueue, setVerificationQueue] = useState<any[]>([]);
  const [missingReport, setMissingReport] = useState<any[]>([]);

  // Selected Employee Dossier
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [employeeDossier, setEmployeeDossier] = useState<any | null>(null);
  const [dossierLoading, setDossierLoading] = useState<boolean>(false);
  const [selectedCategoryTab, setSelectedCategoryTab] = useState<string>('ALL');

  // Modals
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [previewDoc, setPreviewDoc] = useState<any | null>(null);
  const [replaceDoc, setReplaceDoc] = useState<any | null>(null);
  const [replaceReason, setReplaceReason] = useState<string>('');
  const [replaceFile, setReplaceFile] = useState<{ base64: string; name: string } | null>(null);

  const [verifyModal, setVerifyModal] = useState<{ isOpen: boolean; doc: any | null; action: 'VERIFY' | 'REJECT' | 'REQUEST_REPLACEMENT'; reason: string; remarks: string }>({
    isOpen: false,
    doc: null,
    action: 'VERIFY',
    reason: '',
    remarks: ''
  });

  // Upload Form State
  const [uploadForm, setUploadForm] = useState({
    employeeId: '',
    category: 'IDENTITY',
    documentType: 'AADHAAR_CARD',
    title: 'Aadhaar Card Copy',
    documentNumber: '',
    issueDate: '',
    expiryDate: '',
    confidentialityLevel: 'CONFIDENTIAL',
    description: '',
    remarks: '',
    file: null as { base64: string; name: string; size: number } | null
  });

  // Load Filter Options & Document Types
  useEffect(() => {
    const loadInitData = async () => {
      try {
        const [locRes, deptRes, typesRes] = await Promise.all([
          api.get('/locations/all').catch(() => ({ data: [] })),
          api.get('/departments').catch(() => ({ data: { departments: [] } })),
          api.get('/employees/documents/types').catch(() => ({ data: { data: [], grouped: {} } }))
        ]);
        setLocations(locRes.data || []);
        setDepartments(deptRes.data?.departments || []);
        if (typesRes.data?.data) {
          setDocTypes(typesRes.data.data);
          setDocTypesGrouped(typesRes.data.grouped || {});
        }
      } catch (err) {
        console.error('Failed to load initial metadata:', err);
      }
    };
    loadInitData();
  }, []);

  // Fetch Dashboard Metrics
  const fetchDashboardMetrics = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      const res = await api.get(`/employees/documents/dashboard?${params.toString()}`);
      if (res.data?.success) {
        setDashboardMetrics(res.data.data);
      }
    } catch (err) {
      console.error('Failed to load document dashboard metrics:', err);
    }
  }, [selectedLocation, selectedDept]);

  // Fetch Directory
  const fetchDirectory = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      if (statusFilter && statusFilter !== 'all') params.append('statusFilter', statusFilter);
      if (searchQuery.trim()) params.append('search', searchQuery.trim());
      params.append('page', String(pagination.page));
      params.append('limit', String(pagination.limit));

      const res = await api.get(`/employees/documents/directory?${params.toString()}`);
      if (res.data?.success) {
        setEmployees(res.data.data || []);
        if (res.data.pagination) {
          setPagination(prev => ({
            ...prev,
            total: res.data.pagination.total,
            totalPages: res.data.pagination.totalPages
          }));
        }
      }
    } catch (err) {
      console.error('Failed to load employee document directory:', err);
      toast.error('Failed to load employee document directory');
    } finally {
      setLoading(false);
    }
  }, [selectedLocation, selectedDept, statusFilter, searchQuery, pagination.page, pagination.limit]);

  // Fetch Verification Queue
  const fetchVerificationQueue = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      const res = await api.get(`/employees/documents/verification-queue?${params.toString()}`);
      if (res.data?.success) {
        setVerificationQueue(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load verification queue:', err);
    }
  }, [selectedLocation]);

  // Fetch Missing Report
  const fetchMissingReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      const res = await api.get(`/employees/documents/missing-report?${params.toString()}`);
      if (res.data?.success) {
        setMissingReport(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load missing documents report:', err);
    }
  }, [selectedLocation]);

  useEffect(() => {
    fetchDashboardMetrics();
    if (viewMode === 'directory' || viewMode === 'folders') {
      fetchDirectory();
    } else if (viewMode === 'verification') {
      fetchVerificationQueue();
    } else if (viewMode === 'missing') {
      fetchMissingReport();
    }
  }, [fetchDashboardMetrics, fetchDirectory, fetchVerificationQueue, fetchMissingReport, viewMode]);

  // Open Employee Dossier
  const handleOpenDossier = async (empId: string) => {
    try {
      setDossierLoading(true);
      setSelectedEmpId(empId);
      const res = await api.get(`/employees/documents/employee/${empId}`);
      if (res.data?.success) {
        setEmployeeDossier(res.data);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to load employee document dossier');
    } finally {
      setDossierLoading(false);
    }
  };

  // File Upload Helper (FileReader to base64)
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, isReplace = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size cannot exceed 10MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      if (isReplace) {
        setReplaceFile({ base64, name: file.name });
      } else {
        setUploadForm(prev => ({
          ...prev,
          file: { base64, name: file.name, size: file.size }
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Upload Form
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.employeeId || !uploadForm.file) {
      toast.error('Please select an employee and choose a document file to upload');
      return;
    }

    try {
      const payload = {
        employeeId: uploadForm.employeeId,
        category: uploadForm.category,
        documentType: uploadForm.documentType,
        title: uploadForm.title || uploadForm.documentType.replace(/_/g, ' '),
        documentNumber: uploadForm.documentNumber,
        base64Content: uploadForm.file.base64,
        originalName: uploadForm.file.name,
        issueDate: uploadForm.issueDate || undefined,
        expiryDate: uploadForm.expiryDate || undefined,
        confidentialityLevel: uploadForm.confidentialityLevel,
        description: uploadForm.description,
        remarks: uploadForm.remarks
      };

      const res = await api.post('/employees/documents/upload', payload);
      if (res.data?.success) {
        toast.success(`Document uploaded successfully for ${res.data.employeeName}!`);
        setIsUploadModalOpen(false);
        setUploadForm({
          employeeId: '',
          category: 'IDENTITY',
          documentType: 'AADHAAR_CARD',
          title: 'Aadhaar Card Copy',
          documentNumber: '',
          issueDate: '',
          expiryDate: '',
          confidentialityLevel: 'CONFIDENTIAL',
          description: '',
          remarks: '',
          file: null
        });

        fetchDashboardMetrics();
        fetchDirectory();
        if (selectedEmpId) {
          handleOpenDossier(selectedEmpId);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to upload document');
    }
  };

  // Submit Replacement
  const handleReplaceSubmit = async () => {
    if (!replaceDoc || !replaceFile) {
      toast.error('Please select a replacement file');
      return;
    }

    try {
      const res = await api.post(`/employees/documents/${replaceDoc.id}/replace`, {
        base64Content: replaceFile.base64,
        originalName: replaceFile.name,
        reason: replaceReason.trim() || 'Updated version uploaded by user'
      });

      if (res.data?.success) {
        toast.success(res.data.message);
        setReplaceDoc(null);
        setReplaceFile(null);
        setReplaceReason('');
        fetchDashboardMetrics();
        if (selectedEmpId) {
          handleOpenDossier(selectedEmpId);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to replace document');
    }
  };

  // Submit Verification Decision
  const handleVerifySubmit = async () => {
    if (!verifyModal.doc) return;
    if ((verifyModal.action === 'REJECT' || verifyModal.action === 'REQUEST_REPLACEMENT') && !verifyModal.reason.trim()) {
      toast.error('A mandatory justification reason is required for rejection or replacement requests');
      return;
    }

    try {
      const res = await api.post(`/employees/documents/${verifyModal.doc.id}/verify`, {
        action: verifyModal.action,
        reason: verifyModal.reason.trim(),
        remarks: verifyModal.remarks.trim()
      });

      if (res.data?.success) {
        toast.success(res.data.message);
        setVerifyModal({ isOpen: false, doc: null, action: 'VERIFY', reason: '', remarks: '' });
        fetchDashboardMetrics();
        fetchVerificationQueue();
        if (selectedEmpId) {
          handleOpenDossier(selectedEmpId);
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Verification decision failed');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (employees.length === 0) {
      toast.error('No employee records to export');
      return;
    }
    const headers = [
      'Employee Code', 'Employee Name', 'Designation', 'Department', 'Location',
      'Employment Status', 'Total Documents', 'Required Completed', 'Missing Required',
      'Pending Verification', 'Rejected Documents', 'Compliance Status'
    ];
    const rows = employees.map(e => [
      `"${e.employeeCode || ''}"`,
      `"${e.fullName || ''}"`,
      `"${e.designation || ''}"`,
      `"${e.departmentName || ''}"`,
      `"${e.locationName || ''}"`,
      `"${e.employmentStatus || ''}"`,
      e.totalDocuments,
      e.requiredCompleted,
      e.requiredPending,
      e.pendingVerification,
      e.rejected,
      e.isCompliant ? 'COMPLIANT' : 'PENDING_DOCUMENTS'
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Employee_Documents_Audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Document audit metadata exported successfully');
  };

  // Group directory by Location -> Department for Folder View
  const hierarchicalFolders = useMemo(() => {
    const map: Record<string, Record<string, any[]>> = {};
    for (const emp of employees) {
      const loc = emp.locationName || 'Unassigned Hub';
      const dept = emp.departmentName || 'General Staff';
      if (!map[loc]) map[loc] = {};
      if (!map[loc][dept]) map[loc][dept] = [];
      map[loc][dept].push(emp);
    }
    return map;
  }, [employees]);

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-6 pb-12">
        {/* TOP HEADER */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-2 gap-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-xs font-semibold tracking-wider uppercase">
              <span>Workforce Directory</span>
              <span>/</span>
              <span className="text-[#722F37] dark:text-[#E8DCC6]">Employee Document Management</span>
            </div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl lg:text-3xl font-extrabold text-[#0b1c30] dark:text-white tracking-tight">
                Employee Document Management System
              </h1>
              <span className="px-3 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs font-bold border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Protected File Vault • Magic Byte Audited</span>
              </span>
            </div>
            <p className="text-xs lg:text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
              Centralized employee file repository with role-based uploads for HR and authorized Floor Managers, Aadhaar & identity privacy masking, multi-tier verification, and version retention.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => setIsUploadModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white text-xs font-bold shadow-md shadow-[#722F37]/20 transition-all"
            >
              <FilePlus className="w-3.5 h-3.5" />
              <span>+ Upload Employee Document</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-all"
            >
              <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={() => { fetchDashboardMetrics(); fetchDirectory(); }}
              className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 hover:bg-slate-50 transition-all"
              title="Refresh Records"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 9 SUMMARY KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2.5">
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Total Employees</span>
            <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{dashboardMetrics.totalEmployees}</div>
            <span className="text-[10px] text-slate-400">Karnataka Scope</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">With Documents</span>
            <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">{dashboardMetrics.employeesWithDocuments}</div>
            <span className="text-[10px] text-slate-400">Active dossiers</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">Missing Required</span>
            <div className="text-xl font-black text-amber-700 dark:text-amber-400 mt-1">{dashboardMetrics.employeesWithMissingRequired}</div>
            <span className="text-[10px] text-amber-600">Action needed</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase">Total Documents</span>
            <div className="text-xl font-black text-purple-700 dark:text-purple-400 mt-1">{dashboardMetrics.totalDocuments}</div>
            <span className="text-[10px] text-purple-600">Files stored</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/20 dark:bg-orange-950/10 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase">Pending Review</span>
            <div className="text-xl font-black text-orange-700 dark:text-orange-400 mt-1">{dashboardMetrics.documentsPendingVerification}</div>
            <span className="text-[10px] text-orange-600">HR queue</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Verified</span>
            <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{dashboardMetrics.documentsVerified}</div>
            <span className="text-[10px] text-emerald-600">Approved</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase">Rejected</span>
            <div className="text-xl font-black text-rose-700 dark:text-rose-400 mt-1">{dashboardMetrics.documentsRejected}</div>
            <span className="text-[10px] text-rose-600">Clarification</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Expiring Soon</span>
            <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">{dashboardMetrics.documentsExpiringSoon}</div>
            <span className="text-[10px] text-slate-400">&lt; 30 days</span>
          </div>
          <div className="bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
            <span className="text-[10px] font-bold text-slate-400 uppercase">Recently Added</span>
            <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{dashboardMetrics.recentlyUploaded}</div>
            <span className="text-[10px] text-slate-400">Past 7 days</span>
          </div>
        </div>

        {/* VIEW MODE TABS & FILTERS BAR */}
        <div className="bg-white dark:bg-[#1A1D24] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* View Mode Switcher */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl w-full md:w-auto">
              <button
                onClick={() => setViewMode('directory')}
                className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'directory'
                    ? 'bg-white dark:bg-[#1A1D24] text-[#722F37] dark:text-[#E8DCC6] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Employee Directory ({pagination.total})</span>
              </button>
              <button
                onClick={() => setViewMode('folders')}
                className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'folders'
                    ? 'bg-white dark:bg-[#1A1D24] text-[#722F37] dark:text-[#E8DCC6] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5 text-amber-500" />
                <span>Folder Hierarchy View</span>
              </button>
              <button
                onClick={() => setViewMode('verification')}
                className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'verification'
                    ? 'bg-white dark:bg-[#1A1D24] text-[#722F37] dark:text-[#E8DCC6] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5 text-orange-500" />
                <span>Verification Queue ({dashboardMetrics.documentsPendingVerification})</span>
              </button>
              <button
                onClick={() => setViewMode('missing')}
                className={`flex-1 md:flex-initial flex items-center justify-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  viewMode === 'missing'
                    ? 'bg-white dark:bg-[#1A1D24] text-[#722F37] dark:text-[#E8DCC6] shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                <span>Missing Documents ({dashboardMetrics.employeesWithMissingRequired})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by Employee Name, ID, Role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#722F37]"
              />
            </div>
          </div>

          {/* Location & Department Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Store Hub / Branch</label>
              <select
                value={selectedLocation}
                onChange={(e) => setSelectedLocation(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#722F37]"
              >
                <option value="all">All Karnataka Hubs</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Department</label>
              <select
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#722F37]"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Compliance Filter</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#722F37]"
              >
                <option value="all">All Employees</option>
                <option value="COMPLIANT">Fully Compliant Dossiers</option>
                <option value="MISSING_REQUIRED">Missing Mandatory Documents</option>
                <option value="HAS_PENDING">Has Documents Awaiting Verification</option>
                <option value="HAS_REJECTED">Has Rejected Documents</option>
              </select>
            </div>
          </div>
        </div>

        {/* VIEW 1: DIRECTORY LIST VIEW */}
        {viewMode === 'directory' && (
          <div className="bg-white dark:bg-[#1A1D24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">
                    <th className="py-3 px-3">Emp ID</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">Designation</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3">Hub / Location</th>
                    <th className="py-3 px-3">Total Docs</th>
                    <th className="py-3 px-3">Required Completed</th>
                    <th className="py-3 px-3">Pending Review</th>
                    <th className="py-3 px-3">Rejected</th>
                    <th className="py-3 px-3">Compliance Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {loading ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <RefreshCw className="w-6 h-6 animate-spin text-[#722F37]" />
                          <span>Loading employee document dossiers...</span>
                        </div>
                      </td>
                    </tr>
                  ) : employees.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        No employees found matching the filter criteria.
                      </td>
                    </tr>
                  ) : (
                    employees.map((emp) => (
                      <tr key={emp.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors whitespace-nowrap">
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                          {emp.employeeCode}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            onClick={() => handleOpenDossier(emp.id)}
                            className="font-bold text-[#0b1c30] dark:text-white hover:text-[#722F37] hover:underline text-left flex items-center gap-2"
                          >
                            <div className="w-6 h-6 rounded-full bg-[#722F37]/10 text-[#722F37] font-bold text-[10px] flex items-center justify-center">
                              {emp.fullName.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                            </div>
                            <span>{emp.fullName}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {emp.designation}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {emp.departmentName}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">
                          {emp.locationName}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                          {emp.totalDocuments}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">
                              {emp.requiredCompleted} / {emp.requiredTarget}
                            </span>
                            <div className="w-16 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${emp.requiredCompleted >= emp.requiredTarget ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                style={{ width: `${Math.min(100, (emp.requiredCompleted / emp.requiredTarget) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {emp.pendingVerification > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-50 text-orange-700 border border-orange-200">
                              {emp.pendingVerification} Pending
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono">
                          {emp.rejected > 0 ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              {emp.rejected} Rejected
                            </span>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {emp.isCompliant ? (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-fit">
                              <CheckCircle className="w-3 h-3" />
                              <span>COMPLIANT</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 w-fit">
                              <AlertTriangle className="w-3 h-3" />
                              <span>INCOMPLETE ({emp.requiredPending})</span>
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenDossier(emp.id)}
                              className="px-2.5 py-1 rounded bg-[#722F37] hover:bg-[#5B232A] text-white font-semibold text-[11px] transition-colors"
                            >
                              Open Dossier
                            </button>
                            <button
                              onClick={() => {
                                setUploadForm(prev => ({ ...prev, employeeId: emp.id }));
                                setIsUploadModalOpen(true);
                              }}
                              className="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 text-slate-700 dark:text-slate-300 font-semibold text-[11px] transition-colors"
                            >
                              + Upload
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs">
              <span className="text-slate-500 font-medium">
                Showing {employees.length} of {pagination.total} employees (Page {pagination.page} of {pagination.totalPages || 1})
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-white"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  disabled={pagination.page >= pagination.totalPages}
                  onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                  className="p-1.5 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-white"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: FOLDER HIERARCHY VIEW */}
        {viewMode === 'folders' && (
          <div className="bg-white dark:bg-[#1A1D24] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-5">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-amber-500" />
                <span>Logical Folder Hierarchy Explorer</span>
              </h3>
              <p className="text-xs text-slate-500">
                Organized structure: Store Location → Department → Employee Name (ID) → Category Dossier Folders.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {Object.entries(hierarchicalFolders).map(([locName, depts]) => (
                <div key={locName} className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-850/40">
                  <div className="flex items-center gap-2 font-bold text-sm text-[#722F37] dark:text-[#E8DCC6] pb-2 border-b border-slate-200 dark:border-slate-800">
                    <Building2 className="w-4 h-4" />
                    <span>{locName}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                    {Object.entries(depts).map(([deptName, emps]) => (
                      <div key={deptName} className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                            <Folder className="w-3.5 h-3.5 text-amber-500" />
                            <span>{deptName}</span>
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded">
                            {emps.length} Staff
                          </span>
                        </div>

                        <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto pt-1">
                          {emps.map((emp) => (
                            <button
                              key={emp.id}
                              onClick={() => handleOpenDossier(emp.id)}
                              className="text-left p-1.5 rounded hover:bg-slate-50 dark:hover:bg-slate-700/60 flex items-center justify-between text-xs transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <FileText className="w-3.5 h-3.5 text-blue-500" />
                                <div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{emp.fullName}</div>
                                  <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode}</div>
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-slate-500">{emp.totalDocuments} docs</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* VIEW 3: HR VERIFICATION QUEUE */}
        {viewMode === 'verification' && (
          <div className="bg-white dark:bg-[#1A1D24] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-orange-50/20 dark:bg-orange-950/10">
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-orange-500" />
                  <span>HR Document Verification & Approval Queue</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Documents uploaded by Floor Managers and HR awaiting formal verification and compliance sign-off.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full bg-orange-100 text-orange-800 font-bold text-xs">
                {verificationQueue.length} Pending Review
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-bold uppercase text-[10px]">
                    <th className="py-3 px-3">Emp ID</th>
                    <th className="py-3 px-3">Employee Name</th>
                    <th className="py-3 px-3">Department</th>
                    <th className="py-3 px-3">Location</th>
                    <th className="py-3 px-3">Document Title</th>
                    <th className="py-3 px-3">Category</th>
                    <th className="py-3 px-3">Uploaded By</th>
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3 text-right">Verification Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {verificationQueue.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-400">
                        No documents currently pending verification in this store scope.
                      </td>
                    </tr>
                  ) : (
                    verificationQueue.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="py-2.5 px-3 font-mono font-bold">{doc.employeeCode}</td>
                        <td className="py-2.5 px-3 font-bold">{doc.employeeName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{doc.departmentName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{doc.locationName}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">{doc.title}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800">
                            {doc.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {doc.uploadedByName} ({doc.uploadedByRole})
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500">
                          {new Date(doc.createdAt).toLocaleDateString('en-IN')}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => setPreviewDoc(doc)}
                              className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-[11px]"
                            >
                              Preview
                            </button>
                            <button
                              onClick={() => setVerifyModal({ isOpen: true, doc, action: 'VERIFY', reason: '', remarks: '' })}
                              className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-[11px]"
                            >
                              Verify
                            </button>
                            <button
                              onClick={() => setVerifyModal({ isOpen: true, doc, action: 'REJECT', reason: '', remarks: '' })}
                              className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-700 text-white font-semibold text-[11px]"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW 4: MISSING DOCUMENTS REPORT */}
        {viewMode === 'missing' && (
          <div className="bg-white dark:bg-[#1A1D24] p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span>Workforce Missing Required Documents Report</span>
              </h3>
              <p className="text-xs text-slate-500">
                Identifies employees missing mandatory statutory identity, address, banking, and joining documents.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {missingReport.map((item, idx) => (
                <div key={idx} className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded">
                        {item.employee.employeeCode}
                      </span>
                      <span className="text-[10px] font-bold text-rose-600">
                        {item.missingCount} Missing
                      </span>
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white mt-1.5">{item.employee.fullName}</h4>
                    <p className="text-[11px] text-slate-500">{item.employee.designation} • {item.employee.departmentName}</p>
                  </div>

                  <div className="flex flex-col gap-1 text-[11px] bg-white dark:bg-slate-850 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800">
                    <span className="font-bold text-slate-400 text-[10px] uppercase">Missing Items:</span>
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {item.missingDocuments.map((m: any, mIdx: number) => (
                        <span key={mIdx} className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-semibold">
                          {m.name}
                        </span>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setUploadForm(prev => ({ ...prev, employeeId: item.employee.id }));
                      setIsUploadModalOpen(true);
                    }}
                    className="w-full py-1.5 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white text-xs font-bold transition-all text-center"
                  >
                    + Upload Required Document
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* EMPLOYEE DOSSIER DRAWER / MODAL */}
        {selectedEmpId && employeeDossier && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
              {/* Dossier Header */}
              <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-[#722F37]/10 text-[#722F37] font-extrabold text-base flex items-center justify-center border border-[#722F37]/20">
                    {employeeDossier.employee.fullName.split(' ').map((n: string) => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                        {employeeDossier.employee.fullName}
                      </h3>
                      <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                        {employeeDossier.employee.employeeCode}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {employeeDossier.employee.designation} • {employeeDossier.employee.departmentName} • {employeeDossier.employee.locationName}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setUploadForm(prev => ({ ...prev, employeeId: employeeDossier.employee.id }));
                      setIsUploadModalOpen(true);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#722F37] text-white text-xs font-bold hover:bg-[#5B232A]"
                  >
                    <FilePlus className="w-3.5 h-3.5" />
                    <span>Upload Document</span>
                  </button>
                  <button
                    onClick={() => { setSelectedEmpId(null); setEmployeeDossier(null); }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
                  >
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>

              {/* Dossier Tabs & Content */}
              <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-5">
                {/* Checklist Summary Bar */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-slate-800 dark:text-slate-200">Onboarding & Compliance Checklist</span>
                    <p className="text-[11px] text-slate-500">8 required statutory and employment documents</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#722F37] dark:text-[#E8DCC6]">
                      {employeeDossier.checklist.filter((c: any) => c.isRequired && c.status === 'VERIFIED').length} / {employeeDossier.checklist.filter((c: any) => c.isRequired).length} Completed
                    </span>
                  </div>
                </div>

                {/* Category Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 dark:border-slate-800 pb-2">
                  {['ALL', 'IDENTITY', 'ADDRESS', 'EDUCATION', 'EMPLOYMENT', 'BANK_PAYROLL', 'HR_DOSSIER', 'COMPLIANCE'].map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategoryTab(cat)}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        selectedCategoryTab === cat
                          ? 'bg-[#722F37] text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                      }`}
                    >
                      {cat.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>

                {/* Documents Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {employeeDossier.documents
                    .filter((d: any) => selectedCategoryTab === 'ALL' || d.category === selectedCategoryTab)
                    .map((doc: any) => (
                      <div
                        key={doc.id}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 shadow-xs flex flex-col justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {doc.category.replace(/_/g, ' ')}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                                v{doc.version}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  doc.verificationStatus === 'VERIFIED'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : doc.verificationStatus === 'REJECTED'
                                    ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                    : 'bg-orange-50 text-orange-700 border border-orange-200'
                                }`}
                              >
                                {doc.verificationStatus}
                              </span>
                            </div>
                          </div>

                          <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-1">{doc.title}</h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">{doc.fileName} • {Math.round(doc.fileSize / 1024)} KB</p>

                          {doc.documentNumberMasked && (
                            <div className="mt-2 text-xs font-mono font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>Masked ID: {doc.documentNumberMasked}</span>
                            </div>
                          )}

                          {doc.rejectionReason && (
                            <div className="mt-2 p-2 rounded bg-rose-50 text-rose-700 text-[11px] border border-rose-200">
                              <strong>Rejection Reason:</strong> {doc.rejectionReason}
                            </div>
                          )}
                        </div>

                        {/* Audit Details */}
                        <div className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                          <span>By: {doc.uploadedByName}</span>
                          <span>{new Date(doc.createdAt).toLocaleDateString('en-IN')}</span>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1.5 pt-1">
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            <span>Preview</span>
                          </button>
                          <a
                            href={`/api/employees/documents/${doc.id}/download`}
                            download={doc.fileName}
                            className="px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            <span>Download</span>
                          </a>
                          <button
                            onClick={() => {
                              setReplaceDoc(doc);
                              setReplaceFile(null);
                              setReplaceReason('');
                            }}
                            className="px-2.5 py-1 rounded bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-xs flex items-center gap-1"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Replace</span>
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 1: UPLOAD EMPLOYEE DOCUMENT */}
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-[#722F37]" />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Upload Employee Document
                  </h3>
                </div>
                <button
                  onClick={() => setIsUploadModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUploadSubmit} className="flex flex-col gap-3.5 text-xs">
                {/* Employee Selector */}
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Select Target Employee <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={uploadForm.employeeId}
                    onChange={(e) => setUploadForm({ ...uploadForm, employeeId: e.target.value })}
                    required
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  >
                    <option value="">-- Choose Employee --</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeCode}) • {emp.departmentName}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Category & Type */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Category</label>
                    <select
                      value={uploadForm.category}
                      onChange={(e) => {
                        const cat = e.target.value;
                        const available = docTypesGrouped[cat] || [];
                        setUploadForm({
                          ...uploadForm,
                          category: cat,
                          documentType: available[0]?.code || 'OTHER',
                          title: available[0]?.name || 'Document'
                        });
                      }}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    >
                      {Object.keys(docTypesGrouped).map((cat) => (
                        <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Document Type</label>
                    <select
                      value={uploadForm.documentType}
                      onChange={(e) => {
                        const code = e.target.value;
                        const item = docTypes.find(d => d.code === code);
                        setUploadForm({
                          ...uploadForm,
                          documentType: code,
                          title: item?.name || code.replace(/_/g, ' ')
                        });
                      }}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    >
                      {(docTypesGrouped[uploadForm.category] || []).map((dt: any) => (
                        <option key={dt.code} value={dt.code}>{dt.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Title & Document Number */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Document Title</label>
                    <input
                      type="text"
                      value={uploadForm.title}
                      onChange={(e) => setUploadForm({ ...uploadForm, title: e.target.value })}
                      required
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Document / Identity No.</label>
                    <input
                      type="text"
                      placeholder="e.g. 12-digit Aadhaar / PAN (auto-masked)"
                      value={uploadForm.documentNumber}
                      onChange={(e) => setUploadForm({ ...uploadForm, documentNumber: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* File Upload Zone */}
                <div className="flex flex-col gap-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Document File (PDF, JPG, PNG up to 10MB) <span className="text-rose-500">*</span>
                  </label>
                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center gap-2 bg-slate-50/50 dark:bg-slate-800/40">
                    <Upload className="w-6 h-6 text-slate-400" />
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => handleFileSelect(e)}
                      className="text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#722F37] file:text-white hover:file:bg-[#5B232A]"
                    />
                    {uploadForm.file && (
                      <span className="text-[11px] font-bold text-emerald-600">
                        Selected: {uploadForm.file.name} ({Math.round(uploadForm.file.size / 1024)} KB)
                      </span>
                    )}
                  </div>
                </div>

                {/* Confidentiality & Remarks */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Confidentiality Level</label>
                    <select
                      value={uploadForm.confidentialityLevel}
                      onChange={(e) => setUploadForm({ ...uploadForm, confidentialityLevel: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    >
                      <option value="INTERNAL">Internal Use</option>
                      <option value="CONFIDENTIAL">Confidential</option>
                      <option value="STRICTLY_CONFIDENTIAL">Strictly Confidential (Aadhaar/Bank)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">Remarks / Notes</label>
                    <input
                      type="text"
                      placeholder="e.g. Scanned copy during recruitment"
                      value={uploadForm.remarks}
                      onChange={(e) => setUploadForm({ ...uploadForm, remarks: e.target.value })}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsUploadModalOpen(false)}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-lg bg-[#722F37] hover:bg-[#5B232A] text-white text-xs font-bold"
                  >
                    Upload Document
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: SECURE DOCUMENT PREVIEW */}
        {previewDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-[85vh]">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/80">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-[#722F37]" />
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">{previewDoc.title}</h3>
                    <p className="text-[11px] text-slate-500">{previewDoc.fileName} • {previewDoc.verificationStatus}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={`/api/employees/documents/${previewDoc.id}/download`}
                    download={previewDoc.fileName}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </a>
                  <button onClick={() => setPreviewDoc(null)} className="text-slate-400 hover:text-slate-600">
                    <XCircle className="w-6 h-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-slate-900 p-2 flex items-center justify-center overflow-auto">
                {previewDoc.mimeType?.includes('image') ? (
                  <img
                    src={`/api/employees/documents/${previewDoc.id}/preview`}
                    alt={previewDoc.title}
                    className="max-h-full max-w-full object-contain rounded-lg"
                  />
                ) : (
                  <iframe
                    src={`/api/employees/documents/${previewDoc.id}/preview`}
                    className="w-full h-full rounded-lg bg-white"
                    title={previewDoc.title}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* MODAL 3: REPLACE DOCUMENT (VERSION INCREMENT) */}
        {replaceDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-amber-500" />
                  <span>Replace Document (Advance to v{replaceDoc.version + 1})</span>
                </h3>
                <button onClick={() => setReplaceDoc(null)} className="text-slate-400">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Uploading a replacement archives the previous version <strong>(v{replaceDoc.version})</strong> into history and resets status to <strong>PENDING_VERIFICATION</strong>.
              </p>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Select New File <span className="text-rose-500">*</span>
                </label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => handleFileSelect(e, true)}
                  className="text-xs text-slate-500"
                />
                {replaceFile && (
                  <span className="text-[11px] font-bold text-emerald-600">Selected: {replaceFile.name}</span>
                )}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Replacement Reason <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={replaceReason}
                  onChange={(e) => setReplaceReason(e.target.value)}
                  placeholder="e.g. Uploaded high-resolution color copy following rejection"
                  className="w-full p-2 rounded-lg border border-slate-200 text-xs bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button onClick={() => setReplaceDoc(null)} className="px-4 py-1.5 rounded-lg border text-xs font-semibold">
                  Cancel
                </button>
                <button
                  onClick={handleReplaceSubmit}
                  className="px-4 py-1.5 rounded-lg bg-[#722F37] text-white text-xs font-bold"
                >
                  Submit Replacement
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL 4: VERIFY / REJECT ACTION */}
        {verifyModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#1A1D24] w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {verifyModal.action === 'VERIFY' ? 'Approve & Verify Document' : 'Reject Document'}
                </h3>
                <button onClick={() => setVerifyModal(prev => ({ ...prev, isOpen: false }))} className="text-slate-400">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <p className="text-xs text-slate-500">
                Document: <strong>{verifyModal.doc?.title}</strong> for <strong>{verifyModal.doc?.employeeName}</strong>
              </p>

              {verifyModal.action === 'REJECT' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Mandatory Rejection Justification <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    value={verifyModal.reason}
                    onChange={(e) => setVerifyModal(prev => ({ ...prev, reason: e.target.value }))}
                    placeholder="e.g. Scanned document is cropped or missing official seal"
                    className="w-full p-2.5 rounded-lg border border-slate-200 text-xs bg-slate-50"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Internal Remarks (Optional)
                </label>
                <input
                  type="text"
                  value={verifyModal.remarks}
                  onChange={(e) => setVerifyModal(prev => ({ ...prev, remarks: e.target.value }))}
                  placeholder="Reviewer notes for audit log"
                  className="w-full p-2 rounded-lg border border-slate-200 text-xs bg-slate-50"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button onClick={() => setVerifyModal(prev => ({ ...prev, isOpen: false }))} className="px-4 py-1.5 rounded-lg border text-xs font-semibold">
                  Cancel
                </button>
                <button
                  onClick={handleVerifySubmit}
                  className={`px-4 py-1.5 rounded-lg text-white text-xs font-bold ${verifyModal.action === 'VERIFY' ? 'bg-emerald-600' : 'bg-rose-600'}`}
                >
                  {verifyModal.action === 'VERIFY' ? 'Confirm Verification' : 'Confirm Rejection'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
