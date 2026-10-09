'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  Shield, CheckCircle, AlertCircle, FileText, Lock, 
  RefreshCw, Download, Filter, Search, Building2, Eye,
  CheckCircle2, XCircle, Clock, ExternalLink, Settings,
  AlertTriangle, Check, X, User, ChevronRight, Fingerprint
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { api } from '@/lib/api';
import toast from 'react-hot-toast';

interface KycDocument {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  locationCode: string;
  locationName: string;
  departmentName?: string;
  designation?: string;
  documentType: 'AADHAAR' | 'PAN' | 'DRIVING_LICENSE' | 'VOTER_ID' | 'PASSPORT' | 'DEGREE_CERTIFICATE' | 'EXPERIENCE_LETTER' | 'OTHER';
  documentNumberMasked: string;
  issuer: string;
  source: 'DIGILOCKER' | 'MANUAL_UPLOAD' | 'PHYSICAL_VERIFICATION';
  status: 'PENDING' | 'SUBMITTED' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  digilockerDocUri?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  rejectionReason?: string;
  createdAt: string;
}

interface KycStats {
  summary: {
    totalDocuments: number;
    verifiedCount: number;
    pendingCount: number;
    rejectedCount: number;
    expiredCount: number;
    digilockerCount: number;
    manualCount: number;
    complianceRate: number;
  };
  byType: Array<{ type: string; count: number; verified: number; rate: number }>;
  byLocation: Array<{ code: string; name: string; total: number; verified: number; rate: number }>;
}

export default function KycDashboardPage() {
  const [stats, setStats] = useState<KycStats | null>(null);
  const [documents, setDocuments] = useState<KycDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(false);
  const [locationFilter, setLocationFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoc, setSelectedDoc] = useState<KycDocument | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [submittingDecision, setSubmittingDecision] = useState(false);

  // Super Admin settings state
  const [settingsData, setSettingsData] = useState({
    digilockerClientId: 'BSC_TEXTILES_REQ_8819',
    digilockerRequesterOrgId: 'ORG-KA-TEXTILES-001',
    isSandbox: true,
    consentExpiryDays: 365,
    requireAadhaarMasking: true,
  });

  const fetchStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const url = locationFilter !== 'all' ? `/kyc/stats?locationId=${locationFilter}` : '/kyc/stats';
      const res = await api.get<KycStats>(url);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch KYC stats:', err);
    } finally {
      setStatsLoading(false);
    }
  }, [locationFilter]);

  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (locationFilter !== 'all') params.set('locationId', locationFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (typeFilter !== 'all') params.set('documentType', typeFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (searchQuery) params.set('search', searchQuery);
      
      const res = await api.get<{ documents: KycDocument[]; total: number }>(`/kyc/documents?${params}`);
      setDocuments(res.data.documents || []);
    } catch (err) {
      console.error('Failed to fetch KYC documents:', err);
    } finally {
      setLoading(false);
    }
  }, [locationFilter, statusFilter, typeFilter, sourceFilter, searchQuery]);

  useEffect(() => {
    fetchStats();
    fetchDocuments();
  }, [fetchStats, fetchDocuments]);

  const handleDecision = async (decision: 'VERIFIED' | 'REJECTED') => {
    if (!selectedDoc) return;
    if (decision === 'REJECTED' && !rejectionReason.trim()) {
      toast.error('Please specify a rejection reason for the employee');
      return;
    }

    try {
      setSubmittingDecision(true);
      await api.post(`/kyc/verify/${selectedDoc.id}`, {
        decision,
        rejectionReason: decision === 'REJECTED' ? rejectionReason : undefined,
      });

      toast.success(
        decision === 'VERIFIED'
          ? `Document #${selectedDoc.documentNumberMasked} approved & marked Verified!`
          : `Document rejected and notification sent.`
      );

      setReviewModalOpen(false);
      setSelectedDoc(null);
      setRejectionReason('');
      fetchStats();
      fetchDocuments();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record verification decision');
    } finally {
      setSubmittingDecision(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      const res = await api.get('/kyc/settings');
      if (res.data) setSettingsData(res.data);
      setSettingsModalOpen(true);
    } catch (err) {
      toast.error('Only Super Admin can configure DigiLocker integration settings');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/kyc/settings', settingsData);
      toast.success('DigiLocker integration settings saved!');
      setSettingsModalOpen(false);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col w-full gap-6 pb-12">
        {/* EXECUTIVE HERO BANNER */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0b1c30] via-[#0f2744] to-[#123158] p-6 lg:p-8 text-white shadow-xl border border-slate-700/50">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
          <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mb-20" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-200 text-xs font-semibold tracking-wide border border-blue-400/30 backdrop-blur-md">
                  <Shield className="w-3.5 h-3.5 text-blue-300" />
                  National DigiLocker &amp; UIDAI Requester Service
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-medium border border-emerald-400/30 backdrop-blur-md">
                  <Lock className="w-3.5 h-3.5" />
                  Aadhaar Masking Standard Active (UIDAI Section 29)
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Employee KYC &amp; DigiLocker Verification Center
              </h1>
              <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                Legally binding digital onboarding, OAuth 2.0 PKCE identity retrieval, masked Aadhaar storage, and multi-hub employee document governance.
              </p>
            </div>

            {/* Quick Action Suite */}
            <div className="flex items-center gap-3 self-start lg:self-center">
              <Button
                variant="outline"
                onClick={handleOpenSettings}
                className="bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md text-xs font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all"
              >
                <Settings className="w-4 h-4 mr-2 text-slate-300" />
                DigiLocker Config
              </Button>
              <Button
                onClick={() => { fetchStats(); fetchDocuments(); }}
                disabled={loading || statsLoading}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-xs px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${loading || statsLoading ? 'animate-spin' : ''}`} />
                Sync KYC Feed
              </Button>
            </div>
          </div>
        </div>

        {/* 4 PRIMARY METRIC HERO CARDS */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Total Digital Dossiers</span>
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-[#0058be] shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {stats?.summary?.totalDocuments ?? 0}
              </span>
              <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                {stats?.summary?.complianceRate ?? 100}% Compliance
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>DigiLocker API Source:</span>
              <span className="font-bold text-slate-800">{stats?.summary?.digilockerCount ?? 0} verified</span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Verified &amp; Sealed</span>
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-xs">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-emerald-600 tracking-tight">
                {stats?.summary?.verifiedCount ?? 0}
              </span>
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Valid Credentials
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Government Root CA:</span>
              <span className="font-bold text-emerald-600">Cryptographically Signed</span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Pending HR Attestation</span>
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shadow-xs">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-slate-900 tracking-tight">
                {stats?.summary?.pendingCount ?? 0}
              </span>
              <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                Review Required
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Manual Uploads:</span>
              <span className="font-bold text-amber-600">{stats?.summary?.manualCount ?? 0} submissions</span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-2xl bg-white p-5 border border-slate-200/90 shadow-sm hover:shadow-md transition-all group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-rose-50 rounded-bl-full pointer-events-none group-hover:scale-110 transition-transform" />
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Non-Compliant / Rejected</span>
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 shadow-xs">
                <XCircle className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-black text-rose-600 tracking-tight">
                {stats?.summary?.rejectedCount ?? 0}
              </span>
              <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                Action Mandated
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>Expired Documents:</span>
              <span className="font-bold text-slate-800">{stats?.summary?.expiredCount ?? 0} records</span>
            </div>
          </div>
        </div>

        {/* REFINED FILTER CONTROLS TOOLBAR */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Location Selector */}
            <div className="flex items-center bg-slate-50 hover:bg-slate-100/80 transition-colors px-3 py-2 rounded-xl border border-slate-200/80 text-xs">
              <Building2 className="w-4 h-4 text-[#0058be] mr-2 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Hub:</span>
              <select
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Karnataka Hubs</option>
                <option value="cmuwszr8t00011vdtc7vgvags">Belagavi Flagship (BEL)</option>
                <option value="cmuwszr9500021vdtxscy3nsc">Davanagere Mega Hub (DAV)</option>
                <option value="cmuwszr9s00031vdtqlwzkrw8">Shivamogga Apex (SHI)</option>
              </select>
            </div>

            {/* Document Type Selector */}
            <div className="flex items-center bg-slate-50 hover:bg-slate-100/80 transition-colors px-3 py-2 rounded-xl border border-slate-200/80 text-xs">
              <FileText className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Document Types</option>
                <option value="AADHAAR">Aadhaar Card (UIDAI)</option>
                <option value="PAN">PAN Card (Income Tax)</option>
                <option value="DRIVING_LICENSE">Driving License (RTO)</option>
                <option value="VOTER_ID">Voter ID (ECI)</option>
                <option value="DEGREE_CERTIFICATE">Educational Degree / Diploma</option>
                <option value="EXPERIENCE_LETTER">Prior Experience Attestation</option>
              </select>
            </div>

            {/* Status Selector */}
            <div className="flex items-center bg-slate-50 hover:bg-slate-100/80 transition-colors px-3 py-2 rounded-xl border border-slate-200/80 text-xs">
              <Filter className="w-4 h-4 text-slate-500 mr-2 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Statuses</option>
                <option value="PENDING">Pending Review</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="VERIFIED">Verified &amp; Sealed</option>
                <option value="REJECTED">Rejected</option>
                <option value="EXPIRED">Expired</option>
              </select>
            </div>

            {/* Source Selector */}
            <div className="flex items-center bg-slate-50 hover:bg-slate-100/80 transition-colors px-3 py-2 rounded-xl border border-slate-200/80 text-xs">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-2">Source:</span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="bg-transparent font-semibold text-xs text-slate-800 focus:outline-none cursor-pointer pr-1"
              >
                <option value="all">All Sources</option>
                <option value="DIGILOCKER">DigiLocker Official</option>
                <option value="MANUAL_UPLOAD">Manual Attestation</option>
              </select>
            </div>
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search employee, ID, or masked doc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 pl-10 pr-4 py-2 rounded-xl border border-slate-200/80 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
          </div>
        </div>

        {/* KYC DOCUMENT REPOSITORY TABLE */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
            <div>
              <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-[#0058be]" />
                Employee Digital Verification Ledger
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Authentic government repository feeds, masked UID identifiers, and HR dual-signoff tracking
              </p>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-700 self-start sm:self-center">
              Showing {documents.length} verified submissions
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 text-slate-500 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Store Location</th>
                  <th className="py-3 px-4">Document Type</th>
                  <th className="py-3 px-4">Masked Number</th>
                  <th className="py-3 px-4">Source Channel</th>
                  <th className="py-3 px-4">Verification Status</th>
                  <th className="py-3 px-4">Submission / Timestamp</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#0058be] mb-2" />
                      Loading employee KYC records...
                    </td>
                  </tr>
                ) : documents.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-slate-500">
                      No KYC documents found matching selected filters.
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => {
                    const isVerified = doc.status === 'VERIFIED';
                    const isRejected = doc.status === 'REJECTED';
                    const isDigi = doc.source === 'DIGILOCKER';

                    return (
                      <tr 
                        key={doc.id} 
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                        onClick={() => { setSelectedDoc(doc); setReviewModalOpen(true); }}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#0b1c30] to-[#0058be] text-white flex items-center justify-center font-bold text-xs shadow-xs">
                              {doc.employeeName ? doc.employeeName.charAt(0) : 'E'}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 group-hover:text-[#0058be] transition-colors">
                                {doc.employeeName || 'Unknown Employee'}
                              </p>
                              <p className="font-mono text-[11px] text-slate-400">{doc.employeeCode || 'N/A'}</p>
                            </div>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 font-medium text-slate-800">
                          {doc.locationName}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 text-slate-800 border border-slate-200">
                            {doc.documentType === 'AADHAAR' && <Fingerprint className="w-3.5 h-3.5 text-blue-600" />}
                            {doc.documentType === 'PAN' && <CreditCardIcon className="w-3.5 h-3.5 text-emerald-600" />}
                            {doc.documentType.replace('_', ' ')}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                          {doc.documentNumberMasked}
                        </td>

                        <td className="py-3.5 px-4">
                          {isDigi ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                              <Shield className="w-3 h-3 text-[#0058be]" />
                              DigiLocker Verified
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                              Manual Upload
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          {isVerified ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              VERIFIED
                            </span>
                          ) : isRejected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              REJECTED
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              {doc.status}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                          {new Date(doc.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDoc(doc);
                              setReviewModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-[#eff4ff] text-slate-700 hover:text-[#0058be] font-semibold text-xs transition-colors"
                          >
                            Review
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* HR REVIEW & VERIFICATION MODAL */}
        {reviewModalOpen && selectedDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 rounded-t-2xl">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-blue-100 text-[#0058be]">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-slate-900">Document Verification Review</h3>
                    <p className="text-xs text-slate-500">Karnataka Factories Act 1948 • Identity &amp; Compliance Audit</p>
                  </div>
                </div>
                <button
                  onClick={() => { setReviewModalOpen(false); setSelectedDoc(null); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6 space-y-5">
                {/* Employee Card */}
                <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200/80">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-[#0b1c30] to-[#0058be] text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    {selectedDoc.employeeName ? selectedDoc.employeeName.charAt(0) : 'E'}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-extrabold text-slate-900 text-base">{selectedDoc.employeeName}</h4>
                    <p className="text-xs text-slate-500 font-mono">Code: {selectedDoc.employeeCode} • {selectedDoc.locationName}</p>
                  </div>
                  <div>
                    <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-200 text-slate-700">
                      {selectedDoc.status}
                    </span>
                  </div>
                </div>

                {/* Document Metadata Grid */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Document Classification</span>
                    <p className="text-sm font-bold text-slate-900 mt-1">{selectedDoc.documentType.replace('_', ' ')}</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Masked Identifier</span>
                    <p className="text-sm font-mono font-black text-[#0058be] mt-1">{selectedDoc.documentNumberMasked}</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Issuing Authority</span>
                    <p className="text-sm font-semibold text-slate-800 mt-1">{selectedDoc.issuer || 'Official Accredited Registry'}</p>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Channel Source</span>
                    <p className="text-sm font-semibold text-slate-800 mt-1">
                      {selectedDoc.source === 'DIGILOCKER' ? 'DigiLocker eSigned API' : 'Physical / Manual Scan'}
                    </p>
                  </div>
                </div>

                {/* DigiLocker Signature details if verified */}
                {selectedDoc.source === 'DIGILOCKER' && (
                  <div className="p-4 rounded-xl bg-emerald-50/80 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                    <div className="flex items-center gap-1.5 font-bold">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      DigiLocker Cryptographic Attestation Valid
                    </div>
                    <p className="text-emerald-700 text-[11px]">
                      Document was fetched directly via authorized employee OAuth token with Government Root CA signature verified.
                    </p>
                    <p className="font-mono text-[10px] text-emerald-800 pt-1">
                      URI: {selectedDoc.digilockerDocUri}
                    </p>
                  </div>
                )}

                {/* Rejection input */}
                {selectedDoc.status !== 'VERIFIED' && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Rejection Reason (Required if rejecting):
                    </label>
                    <textarea
                      rows={2}
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="e.g. Document image distorted, missing official stamp, or name mismatch..."
                      className="w-full text-xs p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <Button
                    variant="outline"
                    onClick={() => { setReviewModalOpen(false); setSelectedDoc(null); }}
                    className="text-xs font-semibold px-4 py-2"
                  >
                    Cancel
                  </Button>
                  
                  {selectedDoc.status !== 'VERIFIED' && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="danger"
                        disabled={submittingDecision}
                        onClick={() => handleDecision('REJECTED')}
                        className="text-xs font-bold px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white"
                      >
                        <X className="w-4 h-4 mr-1" />
                        Reject Document
                      </Button>
                      <Button
                        disabled={submittingDecision}
                        onClick={() => handleDecision('VERIFIED')}
                        className="text-xs font-bold px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Verify &amp; Seal
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUPER ADMIN SETTINGS MODAL */}
        {settingsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-[#0058be]" />
                  <h3 className="font-bold text-base text-slate-900">DigiLocker Integration Settings</h3>
                </div>
                <button onClick={() => setSettingsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4 pt-4 text-xs">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">DigiLocker Requester Client ID</label>
                  <input
                    type="text"
                    value={settingsData.digilockerClientId}
                    onChange={(e) => setSettingsData({ ...settingsData, digilockerClientId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">Requester Organization ID (Govt Portal)</label>
                  <input
                    type="text"
                    value={settingsData.digilockerRequesterOrgId}
                    onChange={(e) => setSettingsData({ ...settingsData, digilockerRequesterOrgId: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900">DigiLocker Sandbox Emulation Mode</p>
                    <p className="text-[11px] text-slate-500">Simulate OAuth 2.0 PKCE with official sandbox credentials</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsData.isSandbox}
                    onChange={(e) => setSettingsData({ ...settingsData, isSandbox: e.target.checked })}
                    className="w-4 h-4 text-[#0058be] rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div>
                    <p className="font-bold text-slate-900">Enforce Aadhaar Masking</p>
                    <p className="text-[11px] text-slate-500">Only persist and display last 4 digits (UIDAI Section 29)</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={settingsData.requireAadhaarMasking}
                    onChange={(e) => setSettingsData({ ...settingsData, requireAadhaarMasking: e.target.checked })}
                    className="w-4 h-4 text-[#0058be] rounded cursor-pointer"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <Button variant="outline" onClick={() => setSettingsModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-[#0058be] text-white">
                    Save Configuration
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function CreditCardIcon(props: any) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}
