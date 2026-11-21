'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  CalendarClock, 
  Search, 
  RefreshCw, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  FileSpreadsheet,
  Check,
  X,
  Plus
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EmployeeLeavesPage() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importing, setImporting] = useState(false);

  const fetchApplications = async () => {
    setLoading(true);
    try {
      const res = await api.get('/leaves/applications?limit=100');
      const list = res.data?.applications || (Array.isArray(res.data) ? res.data : []);
      setApplications(list);
    } catch (err: any) {
      console.warn('Failed to load leave applications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApplications();
  }, []);

  const handleApprove = async (id: string) => {
    try {
      await api.post(`/leaves/applications/${id}/approve`);
      toast.success('Leave request approved');
      fetchApplications();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to approve leave');
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Please enter the documented reason for rejecting this leave:');
    if (!reason) return;
    try {
      await api.post(`/leaves/applications/${id}/reject`, { reason });
      toast.success('Leave request rejected');
      fetchApplications();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to reject leave');
    }
  };

  const handleBulkImport = async () => {
    if (!importJsonText.trim()) {
      toast.error('Paste JSON leave data to import');
      return;
    }

    setImporting(true);
    try {
      const parsed = JSON.parse(importJsonText);
      const rows = Array.isArray(parsed) ? parsed : parsed.leaves || [];
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Expected an array of leave records');
      }

      const res = await api.post('/leaves/import', { leaves: rows });
      toast.success(res.data?.message || `Imported ${res.data?.importedCount} leave records!`);
      setIsImportModalOpen(false);
      setImportJsonText('');
      fetchApplications();
    } catch (err: any) {
      console.error('Leave bulk import error:', err);
      toast.error(err.response?.data?.message || err.message || 'Import failed. Check JSON format.');
    } finally {
      setImporting(false);
    }
  };

  const filtered = applications.filter((app) => {
    const matchesSearch =
      app.employee?.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      app.employee?.employeeCode?.includes(search) ||
      app.reason?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <CalendarClock className="w-7 h-7 text-sky-600" />
              Employee Leave Details & Approvals
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Review workforce leave applications, track statutory casual/sick leaves, and import historical leave records.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#092B69] hover:bg-[#07204f] text-white text-xs font-semibold shadow-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              Import Leaves (CSV/JSON)
            </button>

            <button
              onClick={fetchApplications}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600 dark:text-slate-300"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="relative max-w-md w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by employee name or reason..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  statusFilter === st
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Employee</th>
                  <th className="px-5 py-3.5">Leave Type</th>
                  <th className="px-5 py-3.5">Duration</th>
                  <th className="px-5 py-3.5">Days</th>
                  <th className="px-5 py-3.5">Reason</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {app.employee?.fullName || 'Staff Member'}
                      </div>
                      <div className="text-xs text-slate-500 font-mono">
                        {app.employee?.employeeCode}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                        {app.leaveType || 'CASUAL'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                      {new Date(app.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })} — {new Date(app.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-5 py-3.5 font-bold font-mono text-slate-900 dark:text-white">
                      {app.days || 1} day(s)
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-[200px] truncate" title={app.reason}>
                      {app.reason || 'Personal'}
                    </td>
                    <td className="px-5 py-3.5">
                      {app.status === 'APPROVED' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                        </span>
                      ) : app.status === 'REJECTED' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                          <XCircle className="w-3.5 h-3.5" /> Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                          <AlertCircle className="w-3.5 h-3.5" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      {app.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => handleApprove(app.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 inline-flex items-center gap-1"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => handleReject(app.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-red-500/10 text-red-600 hover:bg-red-500/20 inline-flex items-center gap-1"
                          >
                            <X className="w-3 h-3" /> Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bulk Leave Import Modal */}
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                <Upload className="w-5 h-5 text-sky-500" />
                Bulk Leave Details Import & Integration
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Paste JSON array of leave records with employeeCode, startDate (YYYY-MM-DD), endDate, leaveType, and days.
              </p>

              <textarea
                rows={10}
                placeholder={`[\n  {\n    "employeeCode": "1024",\n    "leaveType": "CASUAL",\n    "startDate": "2026-11-10",\n    "endDate": "2026-11-11",\n    "days": 2,\n    "reason": "Family ceremony",\n    "status": "APPROVED"\n  }\n]`}
                value={importJsonText}
                onChange={(e) => setImportJsonText(e.target.value)}
                className="w-full p-3 text-xs font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white mb-4"
              />

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkImport}
                  disabled={importing}
                  className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#092B69] hover:bg-[#07204f] text-white flex items-center gap-2 disabled:opacity-50"
                >
                  {importing ? 'Validating & Importing...' : 'Import & Sync with Calendar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
