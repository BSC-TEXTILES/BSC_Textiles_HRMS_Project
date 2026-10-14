'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { DocumentMetricDrawer, DocumentDrawerType } from '@/components/employees/documents/drawers/DocumentMetricDrawer';
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

interface CanonicalDepartmentOption {
  id: string;
  name: string;
  code: string;
  available: boolean;
}

const ORDERED_CANONICAL_DEPARTMENTS: readonly { name: string; code: string }[] = [
  { name: 'Customer Service & Billing', code: 'CS' },
  { name: 'Finance & Accounts', code: 'FIN' },
  { name: 'Human Resources', code: 'HR' },
  { name: 'Inventory & Logistics', code: 'INV' },
  { name: 'Sales & Retail', code: 'SALES' },
  { name: 'Store Operations', code: 'OPS' },
] as const;

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
  const [deptLoading, setDeptLoading] = useState<boolean>(true);
  const [deptError, setDeptError] = useState<string | null>(null);
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

  // 9 Summary KPI Drawers State & Handlers
  const [activeDrawer, setActiveDrawer] = useState<DocumentDrawerType | null>(null);
  const cardRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const handleOpenDrawer = useCallback((type: DocumentDrawerType) => {
    setActiveDrawer(type);
  }, []);

  const handleNavigateTab = useCallback((tab: 'directory' | 'folders' | 'verification' | 'missing', filters?: { statusFilter?: string }) => {
    setViewMode(tab);
    if (filters?.statusFilter) {
      setStatusFilter(filters.statusFilter);
    }
  }, []);

  const handleDownloadDocument = useCallback((doc: any) => {
    if (!doc?.id) return;
    const link = document.createElement('a');
    link.href = `/api/employees/documents/${doc.id}/download`;
    link.download = doc.fileName || 'document.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

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

  // Load departments once per page visit and cache in state
  const loadDepartments = useCallback(async () => {
    try {
      setDeptLoading(true);
      setDeptError(null);
      const res = await api.get('/departments?limit=100');
      setDepartments(res.data?.departments || []);
    } catch (err: any) {
      console.error('Failed to load departments:', err);
      setDeptError('Could not load departments');
    } finally {
      setDeptLoading(false);
    }
  }, []);

  // Load Filter Options & Document Types
  useEffect(() => {
    const loadInitData = async () => {
      try {
        const [locRes, typesRes] = await Promise.all([
          api.get('/locations/all').catch(() => ({ data: [] })),
          api.get('/employees/documents/types').catch(() => ({ data: { data: [], grouped: {} } }))
        ]);
        setLocations(locRes.data || []);
        if (typesRes.data?.data) {
          setDocTypes(typesRes.data.data);
          setDocTypesGrouped(typesRes.data.grouped || {});
        }
      } catch (err) {
        console.error('Failed to load initial metadata:', err);
      }
    };
    loadInitData();
    loadDepartments();
  }, [loadDepartments]);

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
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      const res = await api.get(`/employees/documents/verification-queue?${params.toString()}`);
      if (res.data?.success) {
        setVerificationQueue(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load verification queue:', err);
    }
  }, [selectedLocation, selectedDept]);

  // Fetch Missing Report
  const fetchMissingReport = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (selectedLocation && selectedLocation !== 'all') params.append('locationId', selectedLocation);
      if (selectedDept && selectedDept !== 'all') params.append('departmentId', selectedDept);
      const res = await api.get(`/employees/documents/missing-report?${params.toString()}`);
      if (res.data?.success) {
        setMissingReport(res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load missing documents report:', err);
    }
  }, [selectedLocation, selectedDept]);

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

  // Canonical de-duplicated department list (exactly 6 departments in fixed order, each appearing once)
  const departmentOptions: CanonicalDepartmentOption[] = useMemo(() => {
    if (!departments || departments.length === 0) return [];

    return ORDERED_CANONICAL_DEPARTMENTS.map((canonical) => {
      // Find all department rows matching this canonical department code or name
      const matchingRows = departments.filter((d: any) =>
        (d.code && d.code.toUpperCase() === canonical.code.toUpperCase()) ||
        (d.name && d.name.trim().toLowerCase() === canonical.name.trim().toLowerCase())
      );

      if (matchingRows.length === 0) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[Employee Documents] Department "${canonical.name}" (${canonical.code}) is missing from master list.`);
        }
        return {
          id: '',
          name: canonical.name,
          code: canonical.code,
          available: false,
        };
      }

      // If a specific store hub / branch is selected, prioritize that hub's unique departmentId
      let targetRow = matchingRows[0];
      if (selectedLocation && selectedLocation !== 'all') {
        const hubRow = matchingRows.find((d: any) => d.locationId === selectedLocation);
        if (hubRow) {
          targetRow = hubRow;
        }
      }

      return {
        id: targetRow.id,
        name: canonical.name,
        code: canonical.code,
        available: true,
      };
    });
  }, [departments, selectedLocation]);

  // Handle Location filter change
  const handleLocationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLocation = e.target.value;
    setSelectedLocation(newLocation);
    setPagination(prev => ({ ...prev, page: 1 }));

    // If a specific department is currently selected, preserve that department selection for the new hub
    if (selectedDept !== 'all') {
      const currentOpt = departmentOptions.find(opt => opt.id === selectedDept);
      if (currentOpt) {
        const matchingRows = departments.filter((d: any) =>
          (d.code && d.code.toUpperCase() === currentOpt.code.toUpperCase()) ||
          (d.name && d.name.trim().toLowerCase() === currentOpt.name.trim().toLowerCase())
        );

        let targetId = '';
        if (newLocation !== 'all') {
          const hubRow = matchingRows.find((d: any) => d.locationId === newLocation);
          if (hubRow) targetId = hubRow.id;
          else if (matchingRows.length > 0) targetId = matchingRows[0].id;
        } else if (matchingRows.length > 0) {
          targetId = matchingRows[0].id;
        }

        if (targetId) {
          setSelectedDept(targetId);
        } else {
          setSelectedDept('all');
          toast(`Department "${currentOpt.name}" is not available, reset to All Departments.`);
        }
      }
    }
  };

  // Handle Department filter change
  const handleDeptChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDept(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // Handle Compliance filter change
  const handleStatusFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(e.target.value);
    setPagination(prev => ({ ...prev, page: 1 }));
  };

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
              <span className="text-[#1346a1] dark:text-[#E8DCC6]">Employee Document Management</span>
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
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold shadow-md shadow-[#1346a1]/20 transition-all"
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
          {/* 1. TOTAL EMPLOYEES */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['total-employees'] = el; }}
            onClick={() => handleOpenDrawer('total-employees')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('total-employees'); } }}
            aria-label="View details for Total Employees"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Employees</span>
              <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{dashboardMetrics.totalEmployees}</div>
              <span className="text-[10px] text-slate-400 block mt-0.5">Karnataka Scope</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-semibold text-[#722F37] dark:text-[#E88E9B] group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 2. WITH DOCUMENTS */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['with-documents'] = el; }}
            onClick={() => handleOpenDrawer('with-documents')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('with-documents'); } }}
            aria-label="View details for With Documents"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between cursor-pointer hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">With Documents</span>
              <div className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1">{dashboardMetrics.employeesWithDocuments}</div>
              <span className="text-[10px] text-slate-400 block mt-0.5">Active dossiers</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-semibold text-blue-600 dark:text-blue-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 3. MISSING REQUIRED */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['missing-required'] = el; }}
            onClick={() => handleOpenDrawer('missing-required')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('missing-required'); } }}
            aria-label="View details for Missing Required"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 flex flex-col justify-between cursor-pointer hover:border-amber-400 dark:hover:border-amber-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">Missing Required</span>
              <div className="text-xl font-black text-amber-700 dark:text-amber-400 mt-1">{dashboardMetrics.employeesWithMissingRequired}</div>
              <span className="text-[10px] text-amber-600 block mt-0.5">Action needed</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-amber-200/60 dark:border-amber-900/40 flex items-center justify-between text-[10px] font-semibold text-amber-700 dark:text-amber-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 4. TOTAL DOCUMENTS */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['total-documents'] = el; }}
            onClick={() => handleOpenDrawer('total-documents')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('total-documents'); } }}
            aria-label="View details for Total Documents"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-purple-200 dark:border-purple-900/40 bg-purple-50/20 dark:bg-purple-950/10 flex flex-col justify-between cursor-pointer hover:border-purple-400 dark:hover:border-purple-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider">Total Documents</span>
              <div className="text-xl font-black text-purple-700 dark:text-purple-400 mt-1">{dashboardMetrics.totalDocuments}</div>
              <span className="text-[10px] text-purple-600 block mt-0.5">Files stored</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-purple-200/60 dark:border-purple-900/40 flex items-center justify-between text-[10px] font-semibold text-purple-700 dark:text-purple-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 5. PENDING REVIEW */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['pending-review'] = el; }}
            onClick={() => handleOpenDrawer('pending-review')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('pending-review'); } }}
            aria-label="View details for Pending Review"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-orange-200 dark:border-orange-900/40 bg-orange-50/20 dark:bg-orange-950/10 flex flex-col justify-between cursor-pointer hover:border-orange-400 dark:hover:border-orange-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">Pending Review</span>
              <div className="text-xl font-black text-orange-700 dark:text-orange-400 mt-1">{dashboardMetrics.documentsPendingVerification}</div>
              <span className="text-[10px] text-orange-600 block mt-0.5">HR queue</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-orange-200/60 dark:border-orange-900/40 flex items-center justify-between text-[10px] font-semibold text-orange-700 dark:text-orange-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 6. VERIFIED */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['verified'] = el; }}
            onClick={() => handleOpenDrawer('verified')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('verified'); } }}
            aria-label="View details for Verified"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10 flex flex-col justify-between cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Verified</span>
              <div className="text-xl font-black text-emerald-700 dark:text-emerald-400 mt-1">{dashboardMetrics.documentsVerified}</div>
              <span className="text-[10px] text-emerald-600 block mt-0.5">Approved</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-emerald-200/60 dark:border-emerald-900/40 flex items-center justify-between text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 7. REJECTED */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['rejected'] = el; }}
            onClick={() => handleOpenDrawer('rejected')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('rejected'); } }}
            aria-label="View details for Rejected"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-rose-200 dark:border-rose-900/40 bg-rose-50/20 dark:bg-rose-950/10 flex flex-col justify-between cursor-pointer hover:border-rose-400 dark:hover:border-rose-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wider">Rejected</span>
              <div className="text-xl font-black text-rose-700 dark:text-rose-400 mt-1">{dashboardMetrics.documentsRejected}</div>
              <span className="text-[10px] text-rose-600 block mt-0.5">Clarification</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-rose-200/60 dark:border-rose-900/40 flex items-center justify-between text-[10px] font-semibold text-rose-700 dark:text-rose-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 8. EXPIRING SOON */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['expiring-soon'] = el; }}
            onClick={() => handleOpenDrawer('expiring-soon')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('expiring-soon'); } }}
            aria-label="View details for Expiring Soon"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between cursor-pointer hover:border-slate-400 dark:hover:border-slate-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Expiring Soon</span>
              <div className="text-xl font-black text-slate-800 dark:text-slate-100 mt-1">{dashboardMetrics.documentsExpiringSoon}</div>
              <span className="text-[10px] text-slate-400 block mt-0.5">&lt; 30 days</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-semibold text-slate-600 dark:text-slate-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>

          {/* 9. RECENTLY ADDED */}
          <button
            type="button"
            ref={(el) => { cardRefs.current['recently-added'] = el; }}
            onClick={() => handleOpenDrawer('recently-added')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleOpenDrawer('recently-added'); } }}
            aria-label="View details for Recently Added"
            className="emp-doc-card group text-left bg-white dark:bg-[#1A1D24] p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 hover:shadow-md transition-all focus:outline-none focus:ring-2 focus:ring-[#722F37] focus:ring-offset-2 dark:focus:ring-offset-[#1A1D24] min-h-[118px]"
          >
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recently Added</span>
              <div className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{dashboardMetrics.recentlyUploaded}</div>
              <span className="text-[10px] text-slate-400 block mt-0.5">Past 7 days</span>
            </div>
            <div className="mt-2.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 group-hover:underline">
              <span>View details</span>
              <span aria-hidden="true" className="group-hover:translate-x-0.5 transition-transform">→</span>
            </div>
          </button>
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
                    ? 'bg-white dark:bg-[#1A1D24] text-[#1346a1] dark:text-[#E8DCC6] shadow-xs'
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
                    ? 'bg-white dark:bg-[#1A1D24] text-[#1346a1] dark:text-[#E8DCC6] shadow-xs'
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
                    ? 'bg-white dark:bg-[#1A1D24] text-[#1346a1] dark:text-[#E8DCC6] shadow-xs'
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
                    ? 'bg-white dark:bg-[#1A1D24] text-[#1346a1] dark:text-[#E8DCC6] shadow-xs'
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
                className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              />
            </div>
          </div>

          {/* Location & Department Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex flex-col gap-1">
              <label htmlFor="hub-filter-select" className="text-[10px] font-bold text-slate-400 uppercase">
                Store Hub / Branch
              </label>
              <select
                id="hub-filter-select"
                aria-label="Store Hub / Branch"
                value={selectedLocation}
                onChange={(e) => {
                  setSelectedLocation(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="all">All Karnataka Hubs</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="dept-filter-select" className="text-[10px] font-bold text-slate-400 uppercase">
                Department
              </label>
              <select
                id="dept-filter-select"
                aria-label="Department"
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
              >
                <option value="all">All Departments</option>
                {departments.map((dept) => (
                  <option key={dept.id} value={dept.id}>{dept.name}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="compliance-filter-select" className="text-[10px] font-bold text-slate-400 uppercase">
                Compliance Filter
              </label>
              <select
                id="compliance-filter-select"
                aria-label="Compliance Filter"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#1346a1]"
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
                          <RefreshCw className="w-6 h-6 animate-spin text-[#1346a1]" />
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
                            className="font-bold text-[#0b1c30] dark:text-white hover:text-[#1346a1] hover:underline text-left flex items-center gap-2"
                          >
                            <div className="w-6 h-6 rounded-full bg-[#1346a1]/10 text-[#1346a1] font-bold text-[10px] flex items-center justify-center">
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
                              className="px-2.5 py-1 rounded bg-[#1346a1] hover:bg-[#0e3882] text-white font-semibold text-[11px] transition-colors"
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
                  <div className="flex items-center gap-2 font-bold text-sm text-[#1346a1] dark:text-[#E8DCC6] pb-2 border-b border-slate-200 dark:border-slate-800">
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
                    className="w-full py-1.5 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold transition-all text-center"
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
                  <div className="w-12 h-12 rounded-xl bg-[#1346a1]/10 text-[#1346a1] font-extrabold text-base flex items-center justify-center border border-[#1346a1]/20">
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
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1346a1] text-white text-xs font-bold hover:bg-[#0e3882]"
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
                    <span className="font-bold text-[#1346a1] dark:text-[#E8DCC6]">
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
                          ? 'bg-[#1346a1] text-white'
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
                  <Upload className="w-5 h-5 text-[#1346a1]" />
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
                      className="text-xs text-slate-500 file:mr-4 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#1346a1] file:text-white hover:file:bg-[#0e3882]"
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
                    className="px-5 py-2 rounded-lg bg-[#1346a1] hover:bg-[#0e3882] text-white text-xs font-bold"
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
                  <Eye className="w-5 h-5 text-[#1346a1]" />
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
                  className="px-4 py-1.5 rounded-lg bg-[#1346a1] text-white text-xs font-bold"
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

        {/* MODAL 5: 9 SUMMARY KPI DETAIL DRAWER */}
        <DocumentMetricDrawer
          drawerType={activeDrawer}
          onClose={() => setActiveDrawer(null)}
          locationId={selectedLocation}
          departmentId={selectedDept}
          complianceFilter={statusFilter}
          locations={locations}
          departments={departments}
          onNavigateTab={handleNavigateTab}
          onPreviewDoc={(doc) => setPreviewDoc(doc)}
          onDownloadDoc={handleDownloadDocument}
          onVerifyDoc={(doc, action) =>
            setVerifyModal({
              isOpen: true,
              doc,
              action: action || 'VERIFY',
              reason: '',
              remarks: ''
            })
          }
          onReplaceDoc={(doc) => {
            setReplaceDoc(doc);
            setReplaceReason('');
            setReplaceFile(null);
          }}
          triggerRef={{ current: activeDrawer ? cardRefs.current[activeDrawer] || null : null }}
        />
      </div>
    </DashboardLayout>
  );
}

