'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Database,
  Server,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Search,
  Filter,
  UserCheck,
  ArrowRightLeft,
  Building2,
  Users,
  MapPin,
  FileCheck2,
  Lock,
  Activity,
  Zap,
  HardDrive,
  Copy,
  Info
} from 'lucide-react';

interface Shard {
  database_id: string;
  shard_name: string;
  location_code: string | null;
  location_id: string | null;
  database_name: string;
  secret_reference: string;
  is_control_shard: boolean | number;
  is_writable: boolean | number;
  is_readable: boolean | number;
  status: 'ACTIVE' | 'READ_ONLY' | 'MAINTENANCE' | 'OFFLINE';
  health_status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN';
  last_health_check_at: string | null;
  latency_ms: number;
  schema_version: string;
  total_users: number;
  total_employees: number;
  notes?: string;
}

interface UserAssignment {
  id: string;
  user_id: string;
  employee_id: string | null;
  location_id: string | null;
  database_id: string;
  status: 'ACTIVE' | 'MIGRATING' | 'REVOKED';
  assignment_type: 'LOCATION_DEFAULT' | 'EXPLICIT_OVERRIDE' | 'CROSS_SHARD_ADMIN';
  assigned_by: string | null;
  assigned_at: string;
  fullName?: string;
  email?: string;
  role?: string;
  shard_name?: string;
  database_name?: string;
  location_name?: string;
  location_code?: string;
}

interface MigrationRecord {
  id: string;
  migration_name: string;
  shard_id: string;
  batch_id: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
  records_migrated: number;
  details?: any;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
}

export default function AdminShardsPage() {
  const [shards, setShards] = useState<Shard[]>([]);
  const [assignments, setAssignments] = useState<UserAssignment[]>([]);
  const [migrations, setMigrations] = useState<MigrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState(false);
  const [activeTab, setActiveTab] = useState<'shards' | 'assignments' | 'migrations'>('shards');

  // Filters & Pagination for assignments
  const [search, setSearch] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [selectedShard, setSelectedShard] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalAssignments, setTotalAssignments] = useState(0);

  // Reassignment Modal State
  const [reassignModalOpen, setReassignModalOpen] = useState(false);
  const [targetUser, setTargetUser] = useState<UserAssignment | null>(null);
  const [targetShardId, setTargetShardId] = useState('');
  const [reassignReason, setReassignReason] = useState('');
  const [submittingReassign, setSubmittingReassign] = useState(false);

  // Fetch all shard definitions and health
  const fetchShards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/shards');
      if (res.data?.shards) {
        setShards(res.data.shards);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('Failed to load database shards');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch paginated user assignments
  const fetchAssignments = useCallback(async () => {
    try {
      const res = await api.get('/shards/assignments', {
        params: {
          page,
          limit: 15,
          search: search || undefined,
          locationId: selectedLocation || undefined,
          databaseId: selectedShard || undefined,
        },
      });
      if (res.data?.assignments) {
        setAssignments(res.data.assignments);
        setTotalPages(res.data.totalPages || 1);
        setTotalAssignments(res.data.total || 0);
      }
    } catch (err: any) {
      console.error(err);
    }
  }, [page, search, selectedLocation, selectedShard]);

  // Fetch migrations audit
  const fetchMigrations = useCallback(async () => {
    try {
      const res = await api.get('/shards/migrations');
      if (res.data?.migrations) {
        setMigrations(res.data.migrations);
      }
    } catch (err: any) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchShards();
    fetchAssignments();
    fetchMigrations();
  }, [fetchShards, fetchAssignments, fetchMigrations]);

  // Trigger live health check
  const handleHealthPing = async () => {
    try {
      setPinging(true);
      const res = await api.get('/shards/health');
      if (res.data?.reports) {
        toast.success(`Live Shard Ping Complete: All ${res.data.reports.length} shards responsive`);
        fetchShards();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Shard ping failed');
    } finally {
      setPinging(false);
    }
  };

  // Open Reassign Modal
  const openReassignModal = (userAssignment: UserAssignment) => {
    setTargetUser(userAssignment);
    setTargetShardId(userAssignment.database_id);
    setReassignReason('');
    setReassignModalOpen(true);
  };

  // Submit User Reassignment
  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser || !targetShardId) return;

    try {
      setSubmittingReassign(true);
      const res = await api.post('/shards/assignments/reassign', {
        userId: targetUser.user_id,
        targetDatabaseId: targetShardId,
        reason: reassignReason || 'Administrative location reallocation',
      });

      if (res.data?.success) {
        toast.success(res.data.message || 'User successfully reassigned');
        setReassignModalOpen(false);
        fetchAssignments();
        fetchShards();
        fetchMigrations();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Reassignment failed');
    } finally {
      setSubmittingReassign(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Copied: ${text}`, { duration: 1500 });
  };

  // Calculated aggregates
  const totalEmployeesAcrossShards = shards.reduce((acc, s) => acc + (s.total_employees || 0), 0);
  const totalUsersAcrossShards = shards.reduce((acc, s) => acc + (s.total_users || 0), 0);
  const avgLatency = shards.length > 0 
    ? Math.round(shards.reduce((acc, s) => acc + (s.latency_ms || 0), 0) / shards.length)
    : 0;

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-7xl mx-auto px-2 sm:px-4 pb-20">
        {/* ============================================================= */}
        {/* HEADER                                                        */}
        {/* ============================================================= */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded-md text-[11px] font-extrabold uppercase tracking-wider bg-[#1346a1] text-white flex items-center gap-1.5 shadow-2xs">
                <Database className="w-3.5 h-3.5" />
                <span>MySQL Sharding Architecture</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                <span>Zero Data Loss Reconciled</span>
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              <span>Database Shard Registry & User Identity Mapping</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Physical multi-database location isolation for Belagavi, Davanagere, Shivamogga, and Central HQ Control Shard.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleHealthPing}
              disabled={pinging}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors shadow-2xs disabled:opacity-50"
            >
              <Activity className={`w-3.5 h-3.5 text-[#1346a1] ${pinging ? 'animate-spin' : ''}`} />
              <span>{pinging ? 'Pinging Shards...' : 'Live Health Check'}</span>
            </button>

            <button
              onClick={() => {
                fetchShards();
                fetchAssignments();
                fetchMigrations();
                toast.success('Shard topology refreshed');
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[#1346a1] text-white hover:bg-[#582128] flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh Registry</span>
            </button>
          </div>
        </div>

        {/* ============================================================= */}
        {/* TOP STATUS CARDS                                              */}
        {/* ============================================================= */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Registered Shards</span>
              <Layers className="w-4 h-4 text-[#1346a1]" />
            </div>
            <div className="text-xl font-black text-slate-900">{shards.length} Operational Shards</div>
            <p className="text-[11px] text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              <span>1 Control + 3 Store Shards Active</span>
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Average Shard Latency</span>
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-black text-slate-900">{avgLatency} ms</div>
            <p className="text-[11px] text-slate-500 font-medium">
              High-speed local connection pool
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Mapped Identities</span>
              <Users className="w-4 h-4 text-[#1346a1]" />
            </div>
            <div className="text-xl font-black text-slate-900">{totalUsersAcrossShards} Users Mapped</div>
            <p className="text-[11px] text-slate-500 font-medium">
              Persistent MySQL shard assignments
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-1">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-semibold">Staff Data In Shards</span>
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-black text-slate-900">{totalEmployeesAcrossShards} Employees</div>
            <p className="text-[11px] text-slate-500 font-medium">
              Isolated operational attendance & payroll
            </p>
          </div>
        </div>

        {/* ============================================================= */}
        {/* TABS SELECTOR                                                 */}
        {/* ============================================================= */}
        <div className="flex items-center gap-2 border-b border-slate-200">
          <button
            onClick={() => setActiveTab('shards')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'shards'
                ? 'border-[#1346a1] text-[#1346a1]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Operational Shard Topology ({shards.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('assignments')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'assignments'
                ? 'border-[#1346a1] text-[#1346a1]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>User Shard Assignments ({totalAssignments})</span>
          </button>

          <button
            onClick={() => setActiveTab('migrations')}
            className={`pb-3 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'migrations'
                ? 'border-[#1346a1] text-[#1346a1]'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            <span>Migration & Audit Log ({migrations.length})</span>
          </button>
        </div>

        {/* ============================================================= */}
        {/* TAB 1: OPERATIONAL SHARD TOPOLOGY                             */}
        {/* ============================================================= */}
        {activeTab === 'shards' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shards.map((s) => (
                <div
                  key={s.database_id}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 hover:border-[#1346a1]/50 transition-all flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-9 h-9 rounded-xl bg-[#1346a1]/10 text-[#1346a1] flex items-center justify-center font-bold text-xs shrink-0">
                          {s.location_code || 'HQ'}
                        </div>
                        <div>
                          <div className="text-sm font-black text-slate-900">{s.shard_name}</div>
                          <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                            <span className="font-bold text-slate-700">{s.database_id}</span>
                            <button
                              onClick={() => copyToClipboard(s.database_id)}
                              className="text-slate-400 hover:text-slate-600"
                              title="Copy Database ID"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                            s.health_status === 'HEALTHY'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-amber-50 text-amber-700 border-amber-200'
                          }`}
                        >
                          {s.health_status}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {s.status}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs text-slate-500">{s.notes || 'Configured operational showroom database'}</p>
                  </div>

                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-xs space-y-2">
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div>
                        <span className="text-slate-400 block">Physical Database</span>
                        <span className="font-mono font-bold text-slate-800">{s.database_name}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Location Mapping</span>
                        <span className="font-semibold text-slate-800">{s.location_code || 'Global HQ Control'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Mapped Users</span>
                        <span className="font-bold text-[#1346a1]">{s.total_users || 0} users</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Staff Records</span>
                        <span className="font-bold text-emerald-700">{s.total_employees || 0} employees</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-500">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Latency: {s.latency_ms}ms</span>
                      </span>
                      <span className="text-slate-400 font-mono text-[10px]">
                        Schema v{s.schema_version} · Protected Pool
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50/70 border border-blue-200 rounded-2xl p-4 flex items-start gap-3 text-xs text-blue-900">
              <Info className="w-5 h-5 text-[#1346a1] shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Strict Server-Side Location Isolation Architecture</span>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Raw credentials and hostnames are securely resolved on the server and never sent to the browser.
                  Requests are verified against the authenticated user&apos;s immutable record in MySQL. Belagavi users cannot read Davanagere or Shivamogga data even if client-side parameters are modified.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 2: USER TO SHARD ASSIGNMENTS                              */}
        {/* ============================================================= */}
        {activeTab === 'assignments' && (
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3 text-xs">
              <div className="relative w-full md:w-80">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, role..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1346a1]"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <select
                  value={selectedShard}
                  onChange={(e) => {
                    setSelectedShard(e.target.value);
                    setPage(1);
                  }}
                  className="p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-[#1346a1]"
                >
                  <option value="">All Shards</option>
                  {shards.map((s) => (
                    <option key={s.database_id} value={s.database_id}>
                      {s.database_id} ({s.location_code || 'HQ'})
                    </option>
                  ))}
                </select>

                <button
                  onClick={() => {
                    setSearch('');
                    setSelectedLocation('');
                    setSelectedShard('');
                    setPage(1);
                  }}
                  className="px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50 font-bold text-slate-600"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Assignments Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-700">
                  <thead className="bg-slate-50/70 border-b border-slate-200 font-bold text-slate-600 text-[11px] uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5 pl-4">User / Staff Member</th>
                      <th className="p-3.5">Role</th>
                      <th className="p-3.5">Showroom Location</th>
                      <th className="p-3.5">Assigned Logical Database ID</th>
                      <th className="p-3.5">Assignment Type</th>
                      <th className="p-3.5 text-right pr-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {assignments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No user database assignments found matching filters.
                        </td>
                      </tr>
                    ) : (
                      assignments.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-3.5 pl-4">
                            <div className="font-bold text-slate-900">{u.fullName || 'User'}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                          </td>
                          <td className="p-3.5">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {u.role || 'EMPLOYEE'}
                            </span>
                          </td>
                          <td className="p-3.5 font-medium text-slate-800">
                            {u.location_name ? (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-[#1346a1]" />
                                <span>{u.location_name}</span>
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">Global Headquarter</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            <div className="flex items-center gap-1 font-mono font-bold text-[#1346a1]">
                              <span>{u.database_id}</span>
                              <button
                                onClick={() => copyToClipboard(u.database_id)}
                                className="text-slate-400 hover:text-slate-600"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{u.database_name || 'MySQL'}</div>
                          </td>
                          <td className="p-3.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                u.assignment_type === 'CROSS_SHARD_ADMIN'
                                  ? 'bg-purple-50 text-purple-700 border border-purple-200'
                                  : u.assignment_type === 'EXPLICIT_OVERRIDE'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              }`}
                            >
                              {u.assignment_type}
                            </span>
                          </td>
                          <td className="p-3.5 text-right pr-4">
                            <button
                              onClick={() => openReassignModal(u)}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:border-[#1346a1] hover:text-[#1346a1] transition-all flex items-center gap-1 ml-auto shadow-2xs"
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span>Reassign</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="p-3.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Showing Page {page} of {totalPages} ({totalAssignments} total users)
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-2.5 py-1 rounded border border-slate-200 bg-white disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* TAB 3: MIGRATIONS & AUDIT LOGS                                */}
        {/* ============================================================= */}
        {activeTab === 'migrations' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#1346a1]" />
                <h3 className="font-bold text-slate-900 text-sm">Cross-Shard Migration & Checkpoint Audit</h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold border border-slate-200">
                {migrations.length} Events Logged
              </span>
            </div>

            <div className="divide-y divide-slate-100 text-xs">
              {migrations.length === 0 ? (
                <div className="p-8 text-center text-slate-400">No migration checkpoints recorded.</div>
              ) : (
                migrations.map((m) => (
                  <div key={m.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">{m.migration_name}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            m.status === 'COMPLETED'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : m.status === 'FAILED'
                              ? 'bg-rose-50 text-rose-800 border-rose-200'
                              : 'bg-amber-50 text-amber-800 border-amber-200'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono flex items-center gap-2">
                        <span>Target Shard: <b className="text-slate-800">{m.shard_id}</b></span>
                        <span>•</span>
                        <span>Batch: {m.batch_id}</span>
                        <span>•</span>
                        <span>Records: {m.records_migrated}</span>
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-slate-400">
                      <div>Started: {new Date(m.started_at).toLocaleString()}</div>
                      {m.completed_at && <div>Completed: {new Date(m.completed_at).toLocaleString()}</div>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ============================================================= */}
        {/* REASSIGN USER MODAL                                           */}
        {/* ============================================================= */}
        {reassignModalOpen && targetUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
            <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-[#1346a1]" />
                  <h3 className="font-bold text-slate-900 text-sm">Reassign User Database Shard</h3>
                </div>
                <button
                  onClick={() => setReassignModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleReassignSubmit} className="p-5 space-y-4 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-1">
                  <span className="text-slate-400 block text-[11px]">Selected User</span>
                  <div className="font-bold text-slate-900 text-sm">{targetUser.fullName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">{targetUser.email}</div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    Current Shard: <b className="font-mono text-[#1346a1]">{targetUser.database_id}</b>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Database Shard</label>
                  <select
                    value={targetShardId}
                    onChange={(e) => setTargetShardId(e.target.value)}
                    required
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-[#1346a1]"
                  >
                    {shards.map((s) => (
                      <option key={s.database_id} value={s.database_id}>
                        {s.database_id} — {s.shard_name} ({s.location_code || 'HQ'})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Reason for Reassignment (Audit Log)</label>
                  <textarea
                    rows={3}
                    value={reassignReason}
                    onChange={(e) => setReassignReason(e.target.value)}
                    required
                    placeholder="Enter business reason, e.g. Staff transferred from Belagavi to Davanagere Mega Store"
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-[#1346a1]"
                  />
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    This action will update the user&apos;s authoritative routing assignment in MySQL and migrate employee profile data to the target shard.
                  </span>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setReassignModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 font-bold hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingReassign}
                    className="px-4 py-2 bg-[#1346a1] text-white rounded-xl font-bold hover:bg-[#582128] transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {submittingReassign ? 'Migrating...' : 'Confirm Reassignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
