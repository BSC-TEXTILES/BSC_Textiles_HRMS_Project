'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { 
  UserCheck, 
  UserX, 
  Users, 
  Clock, 
  Building2, 
  Mail, 
  Search, 
  RefreshCw, 
  ShieldAlert, 
  ArrowLeft, 
  CheckCircle2, 
  Filter, 
  Loader2,
  ExternalLink
} from 'lucide-react';
import { useSession } from 'next-auth/react';

interface PendingCandidate {
  id: string;
  email: string;
  fullName: string;
  role: string;
  locationId: string | null;
  employeeId: string | null;
  createdAt: string;
  emailVerifiedAt: string | null;
  location?: {
    id: string;
    name: string;
    code: string;
  } | null;
}

export default function AdminRegistrationsPage() {
  const { data: session } = useSession();
  const [candidates, setCandidates] = useState<PendingCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const fetchPendingApprovals = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/pending-approvals');
      setCandidates(res.data?.pendingApprovals || []);
    } catch (err: any) {
      if (err?.response?.status !== 401 && !err?.isHandled401) {
        console.warn('Could not fetch pending approvals:', err?.message || err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPendingApprovals();
  }, [fetchPendingApprovals]);

  const handleApprove = async (candidate: PendingCandidate) => {
    setProcessingId(candidate.id);
    try {
      await api.post(`/auth/approve/${candidate.id}`, {
        role: candidate.role || 'SALES_EMPLOYEE',
      });
      toast.success(`Account for ${candidate.fullName} has been approved.`);
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Approval failed');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (candidate: PendingCandidate) => {
    const reason = window.prompt(`Provide reason for rejecting registration for ${candidate.fullName}:`, 'Candidate profile does not match vacancy criteria');
    if (!reason) return;

    setProcessingId(candidate.id);
    try {
      await api.post(`/auth/reject/${candidate.id}`, { reason });
      toast.success(`Registration for ${candidate.fullName} was rejected.`);
      setCandidates(prev => prev.filter(c => c.id !== candidate.id));
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Rejection failed');
    } finally {
      setProcessingId(null);
    }
  };

  const filtered = candidates.filter(c => {
    const matchesSearch = 
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase()) ||
      c.role.toLowerCase().includes(search.toLowerCase());
    const matchesLoc = !selectedLocation || c.locationId === selectedLocation;
    return matchesSearch && matchesLoc;
  });

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Breadcrumb & Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
              <Link href="/admin/users" className="hover:underline flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" /> System Administration
              </Link>
              <span>/</span>
              <span>Candidate Registration Queue</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
              <UserCheck className="w-6 h-6 text-[#0058be]" />
              New Employee Registration & Approval Queue
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Review and formally authorize incoming workforce registrations submitted via portal self-service.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchPendingApprovals()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Queue
            </button>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 transition-colors border border-slate-200 dark:border-slate-700"
            >
              <Users className="w-3.5 h-3.5" />
              Active System Users
            </Link>
          </div>
        </div>

        {/* Stats Summary Ribbon */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Pending HR Approvals</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{candidates.length}</span>
              <span className="text-xs text-slate-400">candidate registrations</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Email Verified</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                {candidates.filter(c => !!c.emailVerifiedAt).length}
              </span>
              <span className="text-xs text-slate-400">verified tokens</span>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">Security Policy</span>
            <div className="flex items-baseline gap-1 text-xs text-slate-600 dark:text-slate-300">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 inline mr-1" />
              <span>Multi-Factor HR Sign-off Enforced</span>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#0f172a] p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Filter by candidate name, email, or role..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedLocation}
              onChange={e => setSelectedLocation(e.target.value)}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-[#0058be]"
            >
              <option value="">All Showrooms & Hubs</option>
              <option value="BEL-01">BEL-01 (Belagavi Flagship)</option>
              <option value="DAV-02">DAV-02 (Davanagere Depot)</option>
            </select>
          </div>
        </div>

        {/* Candidate Approvals Table */}
        <div className="bg-white dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {loading ? (
            <div className="p-16 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#0058be] mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Loading registrations queue...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">
                {search || selectedLocation ? 'No matching registrations found' : 'Queue is completely clear!'}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1">
                {search || selectedLocation
                  ? 'Try clearing your search filters to view all pending applications.'
                  : 'All candidate self-registration requests have been reviewed and approved by HR.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Candidate Dossier</th>
                    <th className="py-3 px-4">Requested Role</th>
                    <th className="py-3 px-4">Location / Showroom</th>
                    <th className="py-3 px-4">Submission Date</th>
                    <th className="py-3 px-4">Verification</th>
                    <th className="py-3 px-4 text-right">HR Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((candidate) => (
                    <tr key={candidate.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {candidate.fullName}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-slate-400" />
                          {candidate.email}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900">
                          {candidate.role}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                        <div className="flex items-center gap-1.5 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {candidate.location?.name || candidate.locationId || 'BEL-01 Flagship'}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono">
                        {new Date(candidate.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>

                      <td className="py-3.5 px-4">
                        {candidate.emailVerifiedAt ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300">
                            Verified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            Token Pending
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(candidate)}
                            disabled={processingId === candidate.id}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1 shadow-xs disabled:opacity-50"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(candidate)}
                            disabled={processingId === candidate.id}
                            className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 hover:bg-red-100 text-xs font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
                          >
                            <UserX className="w-3.5 h-3.5" />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
