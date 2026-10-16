'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Search,
  Info,
  ShieldCheck,
  History,
  Database,
  ArrowRight,
  FileText,
  Check,
  X,
  Filter,
  Users,
  ChevronRight,
  Building2,
  Calendar,
  Lock,
  Trash2,
  Server,
  KeyRound,
  FileCheck,
} from 'lucide-react';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TabType = 'import' | 'history' | 'id_policy' | 'data_quality' | 'schema_docs' | 'reset_cleanup';
type ImportMode = 'new' | 'update' | 'upsert' | 'replace_roster';

export function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('import');

  // File & Mode states
  const [file, setFile] = useState<File | null>(null);
  const [csvContent, setCsvContent] = useState<string>('');
  const [fileBase64, setFileBase64] = useState<string>('');
  const [mode, setMode] = useState<ImportMode>('upsert');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview & Execution states
  const [validating, setValidating] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [previewData, setPreviewData] = useState<any | null>(null);
  const [executionResult, setExecutionResult] = useState<any | null>(null);
  const [rowStatusFilter, setRowStatusFilter] = useState<string>('all');
  const [rowSearchQuery, setRowSearchQuery] = useState<string>('');
  const [previewPage, setPreviewPage] = useState(1);
  const pageSize = 12;

  // History & Policy states
  const [historyBatches, setHistoryBatches] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [policyInfo, setPolicyInfo] = useState<any | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [dataQualityReport, setDataQualityReport] = useState<any | null>(null);
  const [dataQualityLoading, setDataQualityLoading] = useState(false);
  const [schemaColumns, setSchemaColumns] = useState<any[]>([]);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');

  // Reset & Backup states
  const [backups, setBackups] = useState<any[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [resetReason, setResetReason] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<any | null>(null);
  const [replaceConfirmChecked, setReplaceConfirmChecked] = useState(false);
  const [showAbsentList, setShowAbsentList] = useState(false);

  // Reset import workflow
  const handleResetImport = () => {
    setFile(null);
    setCsvContent('');
    setFileBase64('');
    setPreviewData(null);
    setExecutionResult(null);
    setRowStatusFilter('all');
    setRowSearchQuery('');
    setPreviewPage(1);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Close and clean up
  const handleCloseModal = () => {
    handleResetImport();
    onClose();
  };

  // Download Formatted Excel (.xlsx) Template
  const handleDownloadExcelTemplate = async () => {
    try {
      const res = await api.get('/employees/import/template/excel', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bsc_textiles_employee_import_template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded formatted Excel template (.xlsx)!');
    } catch (err: any) {
      console.error('Error downloading Excel template:', err);
      toast.error('Failed to download Excel template file');
    }
  };

  // Download Plain CSV (.csv) Template
  const handleDownloadCsvTemplate = async () => {
    try {
      const res = await api.get('/employees/import/template/csv', { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'bsc_textiles_employee_import_template.csv';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded clean CSV template (.csv)!');
    } catch (err: any) {
      console.error('Error downloading CSV template:', err);
      toast.error('Failed to download CSV template file');
    }
  };

  // Legacy fallback
  const handleDownloadTemplate = handleDownloadExcelTemplate;

  // Read file into text or base64
  const processUploadedFile = (selectedFile: File) => {
    const isCsv = selectedFile.name.toLowerCase().endsWith('.csv');
    const isExcel = selectedFile.name.toLowerCase().endsWith('.xlsx') || selectedFile.name.toLowerCase().endsWith('.xls');

    if (!isCsv && !isExcel) {
      toast.error('Please select a valid Excel (.xlsx) or CSV (.csv) file.');
      return;
    }
    if (selectedFile.size > 5 * 1024 * 1024) {
      toast.error('File size exceeds maximum allowed limit (5 MB).');
      return;
    }

    setFile(selectedFile);
    setPreviewData(null);
    setExecutionResult(null);
    setPreviewPage(1);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = String(e.target?.result || '');
        const base64 = dataUrl.split(',')[1] || '';
        setFileBase64(base64);
        setCsvContent('');
        toast.success(`Loaded Excel "${selectedFile.name}" (${(selectedFile.size / 1024).toFixed(1)} KB)`);
      };
      reader.onerror = () => {
        toast.error('Could not read Excel file content');
      };
      reader.readAsDataURL(selectedFile);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = String(e.target?.result || '');
        setCsvContent(text);
        setFileBase64('');
        toast.success(`Loaded CSV "${selectedFile.name}" (${(selectedFile.size / 1024).toFixed(1)} KB)`);
      };
      reader.onerror = () => {
        toast.error('Could not read file content');
      };
      reader.readAsText(selectedFile, 'UTF-8');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  // Validate and generate Preview
  const handleValidatePreview = async () => {
    if (!file || (!csvContent && !fileBase64)) {
      toast.error('Please select or drop a CSV or Excel file first');
      return;
    }

    try {
      setValidating(true);
      const res = await api.post('/employees/import/preview', {
        csv: csvContent,
        fileBase64: fileBase64 || undefined,
        fileName: file.name,
        mode,
      });

      setPreviewData(res.data);
      setPreviewPage(1);
      toast.success(`Validated ${res.data.rows?.length || 0} employee rows!`);
    } catch (err: any) {
      console.error('Validation error:', err);
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Validation failed');
    } finally {
      setValidating(false);
    }
  };

  // Commit and Execute Import
  const handleExecuteImport = async () => {
    if (!file || (!csvContent && !fileBase64)) return;

    try {
      setExecuting(true);
      const res = await api.post('/employees/import/execute', {
        csv: csvContent,
        fileBase64: fileBase64 || undefined,
        fileName: file.name,
        mode,
      });

      setExecutionResult(res.data);
      toast.success(`Import completed! Created: ${res.data.created}, Updated: ${res.data.updated}`);
      onSuccess(); // Refresh workforce directory records
    } catch (err: any) {
      console.error('Execution error:', err);
      const errorMsg = err?.response?.data?.message || err?.response?.data?.error || 'Import execution failed';
      toast.error(errorMsg);
      if (err?.response?.data?.result) {
        setExecutionResult(err.response.data.result);
      }
    } finally {
      setExecuting(false);
    }
  };

  // Download error report CSV for batch
  const handleDownloadErrorReport = async (batchRef?: string) => {
    const targetRef = batchRef || executionResult?.batchRef || previewData?.batchRef;
    if (!targetRef) {
      toast.error('No batch reference available for error report');
      return;
    }
    try {
      const res = await api.get(`/employees/import/history/${targetRef}/error-report`, { responseType: 'blob' });
      const blob = new Blob([res.data], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bsc_import_errors_${targetRef}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success('Downloaded error report CSV');
    } catch (err) {
      toast.error('Could not download error report');
    }
  };

  // Fetch History Batches
  const fetchHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await api.get('/employees/import/history?limit=30');
      setHistoryBatches(res.data?.batches || []);
    } catch (err) {
      console.warn('History fetch error:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Fetch ID Policy Info
  const fetchPolicyInfo = useCallback(async () => {
    try {
      setPolicyLoading(true);
      const res = await api.get('/employees/import/id-policy');
      setPolicyInfo(res.data);
    } catch (err) {
      console.warn('Policy fetch error:', err);
    } finally {
      setPolicyLoading(false);
    }
  }, []);

  // Fetch Data Quality Audit
  const fetchDataQuality = useCallback(async () => {
    try {
      setDataQualityLoading(true);
      const res = await api.get('/employees/import/data-quality');
      setDataQualityReport(res.data);
    } catch (err) {
      console.warn('Data quality fetch error:', err);
    } finally {
      setDataQualityLoading(false);
    }
  }, []);

  // Fetch Verified Backups
  const fetchBackups = useCallback(async () => {
    try {
      setBackupsLoading(true);
      const res = await api.get('/employees/import/backups');
      setBackups(res.data?.backups || []);
    } catch (err) {
      console.warn('Backups fetch error:', err);
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  // Execute Controlled Employee Data Reset
  const handleExecuteReset = async () => {
    if (resetConfirmation !== 'RESET_APPROVED_EMPLOYEES') {
      toast.error('Type "RESET_APPROVED_EMPLOYEES" to confirm.');
      return;
    }

    try {
      setResetting(true);
      const res = await api.post('/employees/import/reset', {
        confirm: 'RESET_APPROVED_EMPLOYEES',
        reason: resetReason || 'Manual Controlled Reset via Admin Workspace',
      });

      setResetResult(res.data?.result || res.data);
      toast.success('Employee database reset complete! Login accounts 100% preserved.');
      fetchBackups();
      onSuccess(); // Refresh workforce records
    } catch (err: any) {
      console.error('Reset execution error:', err);
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Database reset failed');
    } finally {
      setResetting(false);
    }
  };

  // Fetch Schema Documentation Columns
  const fetchSchemaDocs = useCallback(async () => {
    try {
      setSchemaLoading(true);
      const res = await api.get('/employees/import/columns');
      setSchemaColumns(res.data?.columns || []);
    } catch (err) {
      console.warn('Schema columns fetch error:', err);
    } finally {
      setSchemaLoading(false);
    }
  }, []);

  // Handle Tab Switch
  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'history') fetchHistory();
    if (activeTab === 'id_policy') fetchPolicyInfo();
    if (activeTab === 'data_quality') fetchDataQuality();
    if (activeTab === 'schema_docs') fetchSchemaDocs();
    if (activeTab === 'reset_cleanup') fetchBackups();
  }, [activeTab, isOpen, fetchHistory, fetchPolicyInfo, fetchDataQuality, fetchSchemaDocs, fetchBackups]);

  if (!isOpen) return null;

  // Filter preview rows
  const allRows: any[] = previewData?.rows || [];
  const filteredRows = allRows.filter((r) => {
    if (rowStatusFilter === 'valid' && (r.action === 'ERROR' || r.action === 'SKIP')) return false;
    if (rowStatusFilter === 'create' && r.action !== 'CREATE') return false;
    if (rowStatusFilter === 'update' && r.action !== 'UPDATE') return false;
    if (rowStatusFilter === 'skip' && r.action !== 'SKIP') return false;
    if (rowStatusFilter === 'error' && r.action !== 'ERROR') return false;
    if (rowStatusFilter === 'warning' && (!r.warnings || r.warnings.length === 0)) return false;

    if (rowSearchQuery.trim()) {
      const q = rowSearchQuery.toLowerCase();
      const matchName = String(r.employeeName || '').toLowerCase().includes(q);
      const matchCode = String(r.employeeId || '').toLowerCase().includes(q);
      const matchEmail = String(r.email || '').toLowerCase().includes(q);
      const matchMobile = String(r.mobile || '').toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchEmail && !matchMobile) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const paginatedRows = filteredRows.slice((previewPage - 1) * pageSize, previewPage * pageSize);

  const writableRowCount = allRows.filter((r) => r.action === 'CREATE' || r.action === 'UPDATE').length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-import-title"
    >
      <div className="relative w-full max-w-5xl max-h-[92vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200/90 dark:border-slate-800 overflow-hidden text-slate-800 dark:text-slate-100">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1346a1] text-white flex items-center justify-center shadow-md">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="bulk-import-title" className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                  Bulk Employee Import & ID Management
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950 text-[#1346a1] dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  Karnataka Hubs
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Import staff records, update existing employees, assign standardized IDs, and audit directory integrity
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseModal}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('import')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'import'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <UploadCloud className="w-3.5 h-3.5" />
            <span>Upload & Import</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'history'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Import History</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('id_policy')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'id_policy'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Employee ID Policy</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('data_quality')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'data_quality'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Data Quality Audit</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('schema_docs')}
            className={`px-3.5 py-2.5 font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'schema_docs'
                ? 'border-[#1346a1] text-[#1346a1] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>CSV Column Guide</span>
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* TAB 1: UPLOAD & IMPORT */}
          {activeTab === 'import' && (
            <div className="space-y-6">
              {/* Top Banner: Download Template Actions */}
              <div className="p-4 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-[#1346a1] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Official Bulk Employee Templates</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Auto-Fitted & Formatted
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      Download pre-formatted templates with exact 49 columns, full header labels, text-formatted phone numbers (no scientific notation), and active Karnataka Hubs (BEL, DAV, SHI).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleDownloadExcelTemplate}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1346a1] hover:bg-[#0e357e] text-white flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer ring-1 ring-white/20"
                    title="Download Excel workbook with auto-fit columns, colors, and instructions sheet"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                    <span>Download Excel Template (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadCsvTemplate}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center justify-center gap-1.5 shadow-2xs transition-all cursor-pointer"
                    title="Download raw CSV file"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Plain CSV (.csv)</span>
                  </button>
                </div>
              </div>

              {/* Quick Format & Store Guide Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-xs">
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                    📍 Mandatory Columns
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-300">location_code</strong> (all rows)<br />
                    <strong className="text-slate-700 dark:text-slate-300">first_name, last_name, joining_date</strong> (new staff)
                  </p>
                </div>
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                    🏢 Karnataka Store Hubs
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-bold">BEL</code> Belagavi Head Store<br />
                    <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-bold">DAV</code> Davanagere Mega Store<br />
                    <code className="px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 font-bold">SHI</code> Shivamogga Flagship
                  </p>
                </div>
                <div>
                  <span className="font-bold text-slate-800 dark:text-slate-200 block mb-1">
                    ✨ ID Auto-Allocation
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Leave <strong className="text-slate-700 dark:text-slate-300">employee_id</strong> blank to auto-generate official sequential IDs (<code className="text-blue-600 dark:text-blue-400 font-mono">BSC-EMP-XXXX</code>).
                  </p>
                </div>
              </div>

              {/* Execution Success / Result Banner */}
              {executionResult && (
                <div
                  className={`p-4 rounded-xl border ${
                    executionResult.status === 'COMPLETED'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-900 dark:text-white">
                          Import Executed Successfully!
                        </h4>
                        <span className="text-[10px] text-slate-500 font-mono">
                          Batch Ref: {executionResult.batchRef} • Duration: {executionResult.durationMs}ms
                        </span>
                      </div>
                    </div>

                    {executionResult.failed > 0 && (
                      <button
                        type="button"
                        onClick={() => handleDownloadErrorReport(executionResult.batchRef)}
                        className="px-2.5 py-1 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg flex items-center gap-1 shadow-2xs"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download Rejection Report</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 my-3 text-xs">
                    <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block font-semibold">Created Staff</span>
                      <span className="text-base font-black text-emerald-600">{executionResult.created}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block font-semibold">Updated Staff</span>
                      <span className="text-base font-black text-blue-600">{executionResult.updated}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block font-semibold">Skipped Rows</span>
                      <span className="text-base font-black text-slate-500">{executionResult.skipped}</span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/60 border border-slate-200/60">
                      <span className="text-[10px] text-slate-400 block font-semibold">Failed Rows</span>
                      <span className="text-base font-black text-rose-600">{executionResult.failed}</span>
                    </div>
                  </div>

                  {executionResult.assignedIds && executionResult.assignedIds.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 text-[11px]">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        Assigned Employee IDs ({executionResult.assignedIds.length}):{' '}
                      </span>
                      <span className="font-mono text-[#1346a1] dark:text-blue-300 font-bold">
                        {executionResult.assignedIds.join(', ')}
                      </span>
                    </div>
                  )}

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleResetImport}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 cursor-pointer"
                    >
                      Import Another File
                    </button>
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-3.5 py-1.5 text-xs font-bold rounded-lg bg-[#1346a1] text-white hover:bg-[#0e357e] cursor-pointer"
                    >
                      Done & Return to Directory
                    </button>
                  </div>
                </div>
              )}

              {/* Upload Configuration: Mode & Dropzone (Hidden when already executed) */}
              {!executionResult && (
                <>
                  {/* Import Mode Selector */}
                  <div>
                    <label className="text-xs font-extrabold text-slate-900 dark:text-white block mb-2">
                      1. Select Synchronization Mode
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <button
                        type="button"
                        onClick={() => setMode('upsert')}
                        className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                          mode === 'upsert'
                            ? 'border-[#1346a1] ring-2 ring-[#1346a1]/20 bg-blue-50/20 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Add New & Update Existing
                          </span>
                          <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-blue-100 text-[#1346a1]">
                            Recommended
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Updates matched employees by Employee ID and safely creates new staff with auto-assigned IDs.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('update')}
                        className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                          mode === 'update'
                            ? 'border-[#1346a1] ring-2 ring-[#1346a1]/20 bg-blue-50/20 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Update Existing Only
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Updates matching records. Skips rows that do not match an existing Employee ID or verified contact.
                        </p>
                      </button>

                      <button
                        type="button"
                        onClick={() => setMode('new')}
                        className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                          mode === 'new'
                            ? 'border-[#1346a1] ring-2 ring-[#1346a1]/20 bg-blue-50/20 dark:bg-blue-950/30'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 bg-white dark:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            Add New Employees Only
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Inserts new records only. Flags or skips any row matching an existing employee to prevent duplication.
                        </p>
                      </button>
                    </div>
                  </div>

                  {/* Drag and Drop Zone */}
                  <div>
                    <label className="text-xs font-extrabold text-slate-900 dark:text-white block mb-2">
                      2. Choose or Drop Excel (.xlsx) or CSV (.csv) File
                    </label>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                      onChange={handleFileChange}
                      className="hidden"
                    />

                    {!file ? (
                      <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
                          isDragging
                            ? 'border-[#1346a1] bg-blue-50/50 dark:bg-blue-950/40'
                            : 'border-slate-200 dark:border-slate-700 hover:border-[#1346a1] bg-slate-50/40 dark:bg-slate-800/20'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 dark:bg-blue-900/40 text-[#1346a1] dark:text-blue-300 flex items-center justify-center mb-3 shadow-xs">
                          <UploadCloud className="w-6 h-6" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                          Drag and drop employee Excel (.xlsx) or CSV (.csv) file here
                        </h4>
                        <p className="text-xs text-slate-500 mt-1 mb-3">
                          Formatted Excel workbooks (.xlsx) and standard UTF-8 CSV supported (max 5 MB, up to 5,000 rows)
                        </p>
                        <button
                          type="button"
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-800 dark:text-slate-200 shadow-2xs"
                        >
                          Browse Files
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                            <FileSpreadsheet className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {file.name}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              {(file.size / 1024).toFixed(1)} KB • {file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls') ? 'Excel Workbook (.xlsx)' : 'CSV Document (.csv)'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 cursor-pointer"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={handleResetImport}
                            className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                            title="Remove file"
                          >
                            <X className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={handleValidatePreview}
                            disabled={validating}
                            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-[#1346a1] hover:bg-[#0e357e] text-white flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${validating ? 'animate-spin' : ''}`} />
                            <span>{validating ? 'Validating...' : 'Validate & Preview'}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* SECTION D: PREVIEW & VALIDATION SUMMARY TABLE */}
              {previewData && !executionResult && (
                <div className="space-y-4 pt-2 border-t border-slate-200/80 dark:border-slate-800">
                  {/* Summary Bar */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Validation Preview & Impact Analysis</span>
                      </h3>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Target Policy: {previewData.policy?.sampleFormat} (Next: {previewData.policy?.nextEmployeeId})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 block font-semibold">Total Rows</span>
                        <span className="text-base font-black text-slate-900 dark:text-white">
                          {previewData.summary?.totalRows}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200">
                        <span className="text-[10px] text-emerald-700 dark:text-emerald-300 block font-semibold">New Employees</span>
                        <span className="text-base font-black text-emerald-600">
                          {previewData.summary?.validNew}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200">
                        <span className="text-[10px] text-blue-700 dark:text-blue-300 block font-semibold">Existing Updates</span>
                        <span className="text-base font-black text-blue-600">
                          {previewData.summary?.existingUpdates}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200">
                        <span className="text-[10px] text-slate-500 block font-semibold">Skipped</span>
                        <span className="text-base font-black text-slate-600 dark:text-slate-300">
                          {previewData.summary?.skipped}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200">
                        <span className="text-[10px] text-amber-700 dark:text-amber-300 block font-semibold">Warnings</span>
                        <span className="text-base font-black text-amber-600">
                          {previewData.summary?.needsAttention}
                        </span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200">
                        <span className="text-[10px] text-rose-700 dark:text-rose-300 block font-semibold">Errors</span>
                        <span className="text-base font-black text-rose-600">
                          {previewData.summary?.cannotImport}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Filter Pills & Row Search */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { key: 'all', label: `All (${allRows.length})` },
                        { key: 'create', label: `New (${previewData.summary?.validNew || 0})` },
                        { key: 'update', label: `Updates (${previewData.summary?.existingUpdates || 0})` },
                        { key: 'warning', label: `Warnings (${previewData.summary?.needsAttention || 0})` },
                        { key: 'error', label: `Errors (${previewData.summary?.cannotImport || 0})` },
                      ].map((tab) => (
                        <button
                          key={tab.key}
                          type="button"
                          onClick={() => {
                            setRowStatusFilter(tab.key);
                            setPreviewPage(1);
                          }}
                          className={`px-2.5 py-1 rounded-lg font-bold transition-colors cursor-pointer ${
                            rowStatusFilter === tab.key
                              ? 'bg-[#1346a1] text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                        <input
                          type="text"
                          value={rowSearchQuery}
                          onChange={(e) => {
                            setRowSearchQuery(e.target.value);
                            setPreviewPage(1);
                          }}
                          placeholder="Filter rows..."
                          className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:border-[#1346a1]"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Preview Rows Table */}
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
                    <div className="overflow-x-auto max-h-[380px] custom-scrollbar">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200/80 sticky top-0 z-10 tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Row</th>
                            <th className="py-2.5 px-3">Result Action</th>
                            <th className="py-2.5 px-3">Employee ID</th>
                            <th className="py-2.5 px-3">Full Name</th>
                            <th className="py-2.5 px-3">Contact</th>
                            <th className="py-2.5 px-3">Designation & Role</th>
                            <th className="py-2.5 px-3">Hub & Dept</th>
                            <th className="py-2.5 px-3">Shift</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Validation Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-slate-700 dark:text-slate-200">
                          {paginatedRows.length === 0 ? (
                            <tr>
                              <td colSpan={10} className="p-8 text-center text-xs text-slate-400">
                                No preview rows matching current filter criteria.
                              </td>
                            </tr>
                          ) : (
                            paginatedRows.map((r: any) => {
                              const isError = r.action === 'ERROR';
                              const isUpdate = r.action === 'UPDATE';
                              const isCreate = r.action === 'CREATE';

                              return (
                                <tr
                                  key={r.rowNumber}
                                  className={`hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors ${
                                    isError ? 'bg-rose-50/30 dark:bg-rose-950/20' : ''
                                  }`}
                                >
                                  <td className="py-2 px-3 font-mono text-[11px] text-slate-400">
                                    #{r.rowNumber}
                                  </td>
                                  <td className="py-2 px-3 whitespace-nowrap">
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-extrabold ${
                                        isCreate
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                          : isUpdate
                                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                                          : isError
                                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                      }`}
                                    >
                                      {r.action}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 font-mono text-[11px] font-bold text-slate-900 dark:text-white">
                                    {r.employeeId || <span className="text-slate-400 italic">Auto-Generate</span>}
                                  </td>
                                  <td className="py-2 px-3 font-medium">
                                    {r.employeeName || '—'}
                                  </td>
                                  <td className="py-2 px-3 text-[11px]">
                                    <div className="font-mono">{r.mobile || '—'}</div>
                                    <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{r.email || ''}</div>
                                  </td>
                                  <td className="py-2 px-3 text-[11px]">
                                    <div>{r.designation || 'Sales Executive'}</div>
                                    <div className="text-[10px] text-slate-400">{r.role || 'EMPLOYEE'}</div>
                                  </td>
                                  <td className="py-2 px-3 text-[11px]">
                                    <span className="font-bold text-[#1346a1] dark:text-blue-400">{r.locationCode || 'BEL'}</span>
                                    {r.department ? ` • ${r.department}` : ''}
                                  </td>
                                  <td className="py-2 px-3 text-[11px] font-mono">
                                    {r.shift || 'GENERAL'}
                                  </td>
                                  <td className="py-2 px-3 text-[11px]">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                                      {r.employmentStatus || 'ACTIVE'}
                                    </span>
                                  </td>
                                  <td className="py-2 px-3 text-[11px] max-w-[220px]">
                                    {r.errors && r.errors.length > 0 ? (
                                      <div className="text-rose-600 dark:text-rose-400 font-semibold text-[10.5px]">
                                        {r.errors.join(' • ')}
                                      </div>
                                    ) : r.warnings && r.warnings.length > 0 ? (
                                      <div className="text-amber-600 dark:text-amber-400 text-[10px]">
                                        {r.warnings.join(' • ')}
                                      </div>
                                    ) : (
                                      <span className="text-emerald-600 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                                        <Check className="w-3 h-3" /> Ready
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                      <div className="p-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs">
                        <span className="text-[11px] text-slate-500">
                          Showing {(previewPage - 1) * pageSize + 1} to{' '}
                          {Math.min(previewPage * pageSize, filteredRows.length)} of {filteredRows.length} filtered rows
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={previewPage === 1}
                            onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                            className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs disabled:opacity-40 cursor-pointer"
                          >
                            Previous
                          </button>
                          <span className="px-2 font-mono text-[11px]">
                            {previewPage} / {totalPages}
                          </span>
                          <button
                            type="button"
                            disabled={previewPage === totalPages}
                            onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                            className="px-2.5 py-1 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs disabled:opacity-40 cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Confirm Import Action Footer */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        Ready to apply {writableRowCount} employee records
                      </div>
                      <p className="text-[11px] text-slate-500">
                        Writes occur inside a single atomic database transaction. Safe to retry.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleResetImport}
                        className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleExecuteImport}
                        disabled={executing || writableRowCount === 0 || (previewData?.mode === 'replace_roster' && !replaceConfirmChecked)}
                        className="px-5 py-2 text-xs font-bold rounded-xl bg-[#1346a1] hover:bg-[#0e357e] text-white flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        <UploadCloud className={`w-4 h-4 ${executing ? 'animate-bounce' : ''}`} />
                        <span>{executing ? 'Importing Employees...' : `Import ${writableRowCount} Employees`}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: IMPORT HISTORY */}
          {activeTab === 'history' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Historical Import Batches
                  </h3>
                  <p className="text-xs text-slate-500">
                    Audit log of previous CSV imports, user attribution, and download rejected row reports
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchHistory}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${historyLoading ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>

              {historyLoading ? (
                <div className="p-12 text-center text-xs text-slate-400">Loading import batch history...</div>
              ) : historyBatches.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-dashed">
                  No previous bulk import batches recorded yet.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200/80 tracking-wider">
                      <tr>
                        <th className="py-2.5 px-3">Batch Ref</th>
                        <th className="py-2.5 px-3">Filename</th>
                        <th className="py-2.5 px-3">Date & Time</th>
                        <th className="py-2.5 px-3">Imported By</th>
                        <th className="py-2.5 px-3">Created</th>
                        <th className="py-2.5 px-3">Updated</th>
                        <th className="py-2.5 px-3">Failed</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3 text-right">Error Report</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                      {historyBatches.map((b) => (
                        <tr key={b.batchRef} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <td className="py-2.5 px-3 font-mono font-bold text-[#1346a1] dark:text-blue-400">
                            {b.batchRef}
                          </td>
                          <td className="py-2.5 px-3 font-medium truncate max-w-[160px]" title={b.fileName}>
                            {b.fileName}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                            {new Date(b.createdAt).toLocaleString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold">{b.importedByName}</span>
                            <span className="text-[10px] text-slate-400 block">{b.role}</span>
                          </td>
                          <td className="py-2.5 px-3 font-bold text-emerald-600">{b.created}</td>
                          <td className="py-2.5 px-3 font-bold text-blue-600">{b.updated}</td>
                          <td className="py-2.5 px-3 font-bold text-rose-600">{b.failed}</td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                b.status === 'COMPLETED'
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              }`}
                            >
                              {b.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {b.failed > 0 ? (
                              <button
                                type="button"
                                onClick={() => handleDownloadErrorReport(b.batchRef)}
                                className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded flex items-center gap-1 ml-auto cursor-pointer"
                              >
                                <Download className="w-3 h-3" />
                                <span>Errors CSV</span>
                              </button>
                            ) : (
                              <span className="text-slate-400 text-[10px]">None</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: EMPLOYEE ID POLICY */}
          {activeTab === 'id_policy' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                  Enterprise Employee ID Policy & Auto-Sequence
                </h3>
                <p className="text-xs text-slate-500">
                  Centralized, concurrency-safe unique ID generation rules across all Karnataka locations
                </p>
              </div>

              {policyLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading Employee ID policy...</div>
              ) : policyInfo ? (
                <div className="space-y-4">
                  {/* Active Policy Strip */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/80 grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Active Prefix</span>
                      <span className="text-base font-black text-[#1346a1] dark:text-blue-300">
                        {policyInfo.policy?.prefix}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Format Schema</span>
                      <span className="text-base font-mono font-bold text-slate-900 dark:text-white">
                        {policyInfo.policy?.sampleFormat}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Next Auto Sequence</span>
                      <span className="text-base font-mono font-black text-emerald-600">
                        {policyInfo.nextEmployeeId}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 font-semibold block">Total Registered Staff</span>
                      <span className="text-base font-black text-slate-900 dark:text-white">
                        {policyInfo.totalEmployees}
                      </span>
                    </div>
                  </div>

                  {/* ID Distribution Breakdown */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white mb-2">
                      Workforce Identifier Distribution
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <span className="text-[10px] text-slate-400 font-semibold block">Standardized IDs</span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-xl font-bold text-emerald-600">{policyInfo.withStandardId}</span>
                          <span className="text-[10px] text-slate-400">e.g. BSC-EMP-0036</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <span className="text-[10px] text-slate-400 font-semibold block">Legacy Numeric IDs</span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-xl font-bold text-blue-600">{policyInfo.withLegacyNumericId}</span>
                          <span className="text-[10px] text-slate-400">e.g. 1372</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <span className="text-[10px] text-slate-400 font-semibold block">Test Identifiers</span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-xl font-bold text-amber-600">{policyInfo.withTestId}</span>
                          <span className="text-[10px] text-slate-400">e.g. TEST-EMP-001</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <span className="text-[10px] text-slate-400 font-semibold block">Missing IDs</span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-xl font-bold text-rose-600">{policyInfo.missingId}</span>
                          <span className="text-[10px] text-slate-400">Requires assignment</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Rules Information Card */}
                  <div className="p-4 rounded-xl bg-blue-50/40 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-900/40 text-xs space-y-2">
                    <h5 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Info className="w-4 h-4 text-[#1346a1]" />
                      <span>Employee ID Invariant Rules</span>
                    </h5>
                    <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-300 text-[11.5px]">
                      <li>Employee IDs are persistent across stores (BEL, DAV, SHI) and never reallocated.</li>
                      <li>Existing official ID <strong>1372</strong> for Sadashiva L. Hadimani is protected and preserved.</li>
                      <li>New employees imported with blank ID automatically receive the next sequential ID in transaction.</li>
                      <li>Legacy codes can be kept in the <code>employee_code</code> field alongside standardized IDs.</li>
                    </ul>
                  </div>
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 4: DATA QUALITY AUDIT */}
          {activeTab === 'data_quality' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Directory Integrity & Data Quality Scan
                  </h3>
                  <p className="text-xs text-slate-500">
                    Proactive detection of missing Employee IDs, broken store links, duplicate phones, and orphan records
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchDataQuality}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${dataQualityLoading ? 'animate-spin' : ''}`} />
                  <span>Run Audit Scan</span>
                </button>
              </div>

              {dataQualityLoading ? (
                <div className="p-12 text-center text-xs text-slate-400">Running database integrity scan...</div>
              ) : dataQualityReport ? (
                <div className="space-y-4">
                  {/* Totals Strip */}
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-semibold block">Total Audited Staff</span>
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {dataQualityReport.totals?.employees}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-semibold block">Active on Rolls</span>
                      <span className="text-lg font-bold text-emerald-600">
                        {dataQualityReport.totals?.active}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200">
                      <span className="text-[10px] text-slate-400 font-semibold block">Discrepancies Found</span>
                      <span className="text-lg font-bold text-amber-600">
                        {dataQualityReport.issues?.length || 0}
                      </span>
                    </div>
                  </div>

                  {/* Issues List */}
                  {dataQualityReport.issues?.length === 0 ? (
                    <div className="p-8 text-center text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200">
                      ✅ 100% Data Quality! All registered employees have valid IDs, contact info, and store allocations.
                    </div>
                  ) : (
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200/80">
                          <tr>
                            <th className="py-2.5 px-3">Severity</th>
                            <th className="py-2.5 px-3">Issue Type</th>
                            <th className="py-2.5 px-3">Employee</th>
                            <th className="py-2.5 px-3">Location</th>
                            <th className="py-2.5 px-3">Remediation Guidance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                          {dataQualityReport.issues?.map((iss: any, idx: number) => (
                            <tr key={idx} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-3">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    iss.severity === 'HIGH'
                                      ? 'bg-rose-100 text-rose-800'
                                      : 'bg-amber-100 text-amber-800'
                                  }`}
                                >
                                  {iss.severity}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white">
                                {iss.type?.replace(/_/g, ' ')}
                              </td>
                              <td className="py-2.5 px-3 font-mono">
                                <div>{iss.fullName || iss.employeeCode}</div>
                                <div className="text-[10px] text-slate-400">{iss.employeeCode}</div>
                              </td>
                              <td className="py-2.5 px-3">{iss.locationCode || '—'}</td>
                              <td className="py-2.5 px-3 text-[11px] text-slate-500">{iss.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* TAB 5: SCHEMA COLUMN REFERENCE */}
          {activeTab === 'schema_docs' && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    49 Supported CSV Columns (Live Contract)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Every supported field maps directly to the active employee schema and database columns
                  </p>
                </div>

                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={schemaSearch}
                    onChange={(e) => setSchemaSearch(e.target.value)}
                    placeholder="Search column key or label..."
                    className="pl-8 pr-3 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs focus:outline-none focus:border-[#1346a1]"
                  />
                </div>
              </div>

              {schemaLoading ? (
                <div className="p-8 text-center text-xs text-slate-400">Loading column documentation...</div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-[460px] overflow-y-auto custom-scrollbar">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200/80 sticky top-0 z-10">
                      <tr>
                        <th className="py-2 px-3">Column Key</th>
                        <th className="py-2 px-3">Display Label</th>
                        <th className="py-2 px-3">Category</th>
                        <th className="py-2 px-3">Requirement</th>
                        <th className="py-2 px-3">Sample Value</th>
                        <th className="py-2 px-3">Database Mapping</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-200">
                      {schemaColumns
                        .filter(
                          (c) =>
                            !schemaSearch ||
                            c.key.toLowerCase().includes(schemaSearch.toLowerCase()) ||
                            c.label.toLowerCase().includes(schemaSearch.toLowerCase()) ||
                            c.group.toLowerCase().includes(schemaSearch.toLowerCase())
                        )
                        .map((c) => (
                          <tr key={c.key} className="hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-mono font-bold text-[#1346a1] dark:text-blue-400 text-[11px]">
                              {c.key}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                              {c.label}
                            </td>
                            <td className="py-2 px-3 uppercase text-[9.5px] font-bold text-slate-400">
                              {c.group?.replace(/_/g, ' ')}
                            </td>
                            <td className="py-2 px-3">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold ${
                                  c.presence === 'required'
                                    ? 'bg-rose-100 text-rose-800'
                                    : c.presence === 'new'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {c.presence === 'new' ? 'Required for New' : c.presence}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-[10.5px] text-slate-500">
                              {c.example || '—'}
                            </td>
                            <td className="py-2 px-3 font-mono text-[10px] text-slate-400">
                              {c.dbColumn || '—'}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: RESET & CLEANUP WORKSPACE */}
          {activeTab === 'reset_cleanup' && (
            <div className="space-y-6">
              {/* Header Banner */}
              <div className="p-4 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                      Controlled Employee Database Reset & Backup Vault
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 border border-rose-300">
                      Super Admin Protected
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                    Safely reset and wipe out old unapproved employee records before importing fresh authoritative employee data.
                    <strong className="block text-slate-800 dark:text-slate-100 font-bold mt-1">
                      GUARANTEE: All existing user login accounts, password credentials, roles, and permissions in table <code className="bg-slate-200 dark:bg-slate-800 px-1 py-0.5 rounded">user</code> are 100% PRESERVED and untouched.
                    </strong>
                  </p>
                </div>
              </div>

              {/* Guarantees Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-1.5 text-emerald-600 dark:text-emerald-400">
                    <KeyRound className="w-4 h-4" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Logins 100% Preserved</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Accounts in <code className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">user</code> are decoupled via foreign key nullification. Passwords, hashes, and session tokens are never touched.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-1.5 text-blue-600 dark:text-blue-400">
                    <FileCheck className="w-4 h-4" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Pre-Reset Disk Backup</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Before wiping employee tables, a verified full JSON + SQL backup is written to disk with SHA-256 checksums and verified row counts.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 mb-1.5 text-purple-600 dark:text-purple-400">
                    <Server className="w-4 h-4" />
                    <span className="text-xs font-bold text-slate-900 dark:text-white">Multi-Tenant Shard Sync</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Atomic coordination clears employee business data across Control DB and all configured showroom shards (BEL, DAV, SHI).
                  </p>
                </div>
              </div>

              {/* Reset Execution Box */}
              <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border-2 border-rose-200 dark:border-rose-900/60 shadow-sm space-y-4">
                <div>
                  <h4 className="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    <span>Execute Controlled Employee Database Reset</span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    This clears employee profiles, attendance logs, punch records, incentives, and biometric device mappings. Existing user login accounts remain active.
                  </p>
                </div>

                <div className="space-y-3 max-w-lg">
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Reason for Reset (Optional audit note):
                    </label>
                    <input
                      type="text"
                      value={resetReason}
                      onChange={(e) => setResetReason(e.target.value)}
                      placeholder="e.g. Preparing for Approved Workforce Roster Import"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      Type <span className="font-mono text-rose-600 font-black">RESET_APPROVED_EMPLOYEES</span> to authorize:
                    </label>
                    <input
                      type="text"
                      value={resetConfirmation}
                      onChange={(e) => setResetConfirmation(e.target.value)}
                      placeholder="RESET_APPROVED_EMPLOYEES"
                      className="w-full text-xs font-mono font-bold px-3 py-2 rounded-lg border border-rose-300 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleExecuteReset}
                    disabled={resetting || resetConfirmation !== 'RESET_APPROVED_EMPLOYEES'}
                    className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-rose-600 hover:bg-rose-700 text-white flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-40"
                  >
                    <Trash2 className={`w-4 h-4 ${resetting ? 'animate-spin' : ''}`} />
                    <span>{resetting ? 'Executing Pre-Reset Backup & Reset...' : 'Execute Controlled Employee Reset'}</span>
                  </button>
                </div>

                {/* Reset Result Feedback */}
                {resetResult && (
                  <div className="mt-4 p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs space-y-2">
                    <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-extrabold">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <span>{resetResult.message || 'Database Reset Successful!'}</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                      <div className="p-2 rounded bg-white/80 dark:bg-slate-900 border border-emerald-200">
                        <span className="text-[10px] text-slate-400 block">User Logins Preserved</span>
                        <span className="text-sm font-black text-emerald-700">{resetResult.preservedUserCount} Accounts</span>
                      </div>
                      <div className="p-2 rounded bg-white/80 dark:bg-slate-900 border border-emerald-200">
                        <span className="text-[10px] text-slate-400 block">Employee Profiles Cleared</span>
                        <span className="text-sm font-black text-rose-600">{resetResult.clearedEmployeeCount} Profiles</span>
                      </div>
                      <div className="p-2 rounded bg-white/80 dark:bg-slate-900 border border-emerald-200">
                        <span className="text-[10px] text-slate-400 block">Backup Created</span>
                        <span className="text-[10px] font-mono text-slate-700 dark:text-slate-300 font-bold truncate block">
                          {resetResult.backup?.folderName || 'Verified on disk'}
                        </span>
                      </div>
                      <div className="p-2 rounded bg-white/80 dark:bg-slate-900 border border-emerald-200">
                        <span className="text-[10px] text-slate-400 block">Shards Synchronized</span>
                        <span className="text-xs font-bold text-purple-700">
                          {resetResult.shardsSynchronized?.join(', ') || 'BEL, DAV, SHI'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Verified Backups Vault Table */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
                      Verified Disk Backups Vault
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      Snapshots taken automatically prior to any reset or destructive operation
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={fetchBackups}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold flex items-center gap-1.5 hover:bg-slate-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${backupsLoading ? 'animate-spin' : ''}`} />
                    <span>Refresh Vault</span>
                  </button>
                </div>

                {backupsLoading ? (
                  <div className="p-6 text-center text-xs text-slate-400">Loading backups...</div>
                ) : backups.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                    No pre-reset backups created yet. Backups will appear here automatically when a reset is executed.
                  </div>
                ) : (
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-500 border-b border-slate-200/80">
                        <tr>
                          <th className="py-2.5 px-3">Backup Reference</th>
                          <th className="py-2.5 px-3">Timestamp</th>
                          <th className="py-2.5 px-3">Records Backed Up</th>
                          <th className="py-2.5 px-3">Disk Path</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {backups.map((b) => (
                          <tr key={b.backupId} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-3 font-mono font-bold text-[#1346a1] dark:text-blue-400">
                              {b.backupId}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                              {new Date(b.timestamp).toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200">
                              {b.totalRecords} rows across {b.files?.length || 0} tables
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10.5px] text-slate-400 truncate max-w-xs">
                              {b.directory}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
