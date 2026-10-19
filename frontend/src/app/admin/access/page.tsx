'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Filter,
  KeyRound,
  Layers,
  Network,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessNav } from '@/components/access/AccessNav';
import { RequireModule } from '@/components/access/RequireModule';
import { AssignUserRoleModal } from '../roles/components/AssignUserRoleModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { apiError, fetchAccessAuditLogs, fetchOverview } from '@/lib/access';
import type { AccessAuditEntry, AccessOverview } from '@/lib/access';
import { useMyAccess } from '@/lib/rbac';

function formatRoleName(name: string): string {
  if (!name) return '';
  return name
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: any;
  tone?: 'neutral' | 'good' | 'warn' | 'info';
  onClick?: () => void;
}) {
  const toneStyles = {
    neutral: {
      iconBg: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      valueColor: 'text-gray-900 dark:text-slate-100',
      border: 'border-gray-200 dark:border-slate-800',
    },
    good: {
      iconBg: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
      valueColor: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-gray-200 dark:border-slate-800',
    },
    warn: {
      iconBg: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400',
      valueColor: 'text-amber-600 dark:text-amber-400',
      border: 'border-amber-300 dark:border-amber-700/60 bg-amber-50/20 dark:bg-amber-950/10',
    },
    info: {
      iconBg: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
      valueColor: 'text-blue-600 dark:text-blue-400',
      border: 'border-gray-200 dark:border-slate-800',
    },
  }[tone];

  return (
    <div
      onClick={onClick}
      className={`rounded-xl border bg-white shadow-sm dark:bg-slate-900 overflow-hidden transition-all duration-200 hover:shadow-md ${toneStyles.border} ${
        onClick ? 'cursor-pointer hover:border-primary-400' : ''
      }`}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-slate-400">
              {label}
            </p>
            <p className={`text-2xl sm:text-3xl font-bold tracking-tight ${toneStyles.valueColor}`}>
              {value}
            </p>
          </div>
          <div className={`rounded-xl p-2.5 shrink-0 ${toneStyles.iconBg}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
        </div>
        {hint && (
          <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
            {tone === 'warn' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
            {tone === 'good' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
            <span>{hint}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AccessOverviewPage() {
  const access = useMyAccess();
  const [data, setData] = useState<AccessOverview | null>(null);
  const [logs, setLogs] = useState<AccessAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & filter states
  const [roleSearch, setRoleSearch] = useState('');
  const [moduleSearch, setModuleSearch] = useState('');
  const [showAllModules, setShowAllModules] = useState(false);

  // Assignment Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [filterUnassignedInModal, setFilterUnassignedInModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overview, recent] = await Promise.all([fetchOverview(), fetchAccessAuditLogs(12)]);
      setData(overview);
      setLogs(recent);
    } catch (err: any) {
      const message = apiError(err, 'Could not load the access overview');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.loading) return;
    load();
  }, [access.loading, load]);

  const canSeeGovernance = access.source !== 'rbac' || access.access['ROLES_PERMISSIONS'] !== 'none';
  const isSuperAdmin = access.source === 'system' || access.canManageRoles || access.roles?.includes('SUPER_ADMIN');

  // Filtered Roles
  const filteredRoles = useMemo(() => {
    if (!data?.roles) return [];
    const q = roleSearch.trim().toLowerCase();
    if (!q) return data.roles;
    return data.roles.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        formatRoleName(r.name).toLowerCase().includes(q)
    );
  }, [data?.roles, roleSearch]);

  // Filtered Modules
  const filteredModules = useMemo(() => {
    if (!data?.moduleCoverage) return [];
    const q = moduleSearch.trim().toLowerCase();
    let list = data.moduleCoverage;
    if (q) {
      list = list.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.module.toLowerCase().includes(q)
      );
    }
    return showAllModules || q ? list : list.slice(0, 10);
  }, [data?.moduleCoverage, moduleSearch, showAllModules]);

  // Assignable roles mapping for modal
  const assignableRoles = useMemo(() => {
    return (data?.roles || []).map((r) => ({
      id: r.id,
      name: r.name,
      description: '',
      isSystem: r.isSystem,
    }));
  }, [data?.roles]);

  const handleOpenAssignModal = (unassignedOnly = true) => {
    setFilterUnassignedInModal(unassignedOnly);
    setAssignModalOpen(true);
  };

  return (
    <DashboardLayout>
      <RequireModule module="ROLES_PERMISSIONS">
        <div className="space-y-6">
          <AccessNav access={access} />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="rounded-lg bg-primary-100 p-2 dark:bg-primary-950/60">
                  <ShieldCheck className="h-6 w-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-slate-100">
                    Access Control Overview
                  </h1>
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    Roles, assignments, module permissions, and real-time governance metrics.
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                Refresh
              </Button>
              <Link href="/admin/module-access">
                <Button variant="outline" size="sm">
                  <Network className="h-4 w-4" aria-hidden="true" />
                  Module Access
                </Button>
              </Link>
              <Link href="/admin/roles">
                <Button size="sm">
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                  Role Management
                </Button>
              </Link>
            </div>
          </div>

          {!access.loading && !canSeeGovernance && (
            <Card padding={false} className="border-amber-200 bg-amber-50/50 dark:border-amber-800/60 dark:bg-amber-950/20">
              <div className="flex items-start gap-3.5 p-4">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                <div>
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Access administration is not granted to your role
                  </p>
                  <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                    Ask a Super Admin to grant your role View on <span className="font-medium">Role Management</span>. The
                    server rejects administration requests regardless of what this page displays.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {error && !loading && (
            <Card padding={false} className="border-rose-200 bg-rose-50/50 dark:border-rose-800/60 dark:bg-rose-950/20">
              <div className="flex items-center justify-between gap-3 p-4">
                <p className="text-sm font-medium text-rose-800 dark:text-rose-300">{error}</p>
                <Button size="sm" variant="outline" onClick={load}>
                  Retry
                </Button>
              </div>
            </Card>
          )}

          {data && (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Roles"
                  value={data.totals.roles}
                  hint={`${data.totals.activeRoles} active system & custom roles`}
                  icon={KeyRound}
                  tone="info"
                />
                <StatCard
                  label="Inactive Roles"
                  value={data.totals.inactiveRoles}
                  hint={data.totals.inactiveRoles ? 'Roles currently disabled' : 'All roles active and usable'}
                  icon={Shield}
                  tone={data.totals.inactiveRoles ? 'warn' : 'good'}
                />
                <StatCard
                  label="Total Users"
                  value={data.totals.users}
                  hint={`${data.totals.activeUsers} active accounts`}
                  icon={Users}
                  tone="neutral"
                />
                <StatCard
                  label="Users Without Role"
                  value={data.totals.usersWithoutRoles}
                  hint={
                    data.totals.usersWithoutRoles
                      ? 'Click to assign RBAC roles'
                      : 'All accounts assigned to RBAC'
                  }
                  icon={UserX}
                  tone={data.totals.usersWithoutRoles ? 'warn' : 'good'}
                  onClick={data.totals.usersWithoutRoles ? () => handleOpenAssignModal(true) : undefined}
                />
              </div>

              {/* ACTION CALLOUT BANNER FOR UNASSIGNED USERS */}
              {data.totals.usersWithoutRoles > 0 ? (
                <div className="relative overflow-hidden rounded-xl border border-amber-300 bg-gradient-to-r from-amber-500/10 via-amber-100/50 to-orange-500/10 p-5 shadow-sm dark:border-amber-700/60 dark:from-amber-950/40 dark:via-slate-900/60 dark:to-orange-950/20">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="rounded-xl bg-amber-500/20 p-2.5 text-amber-700 ring-4 ring-amber-500/10 dark:text-amber-400">
                        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                            {data.totals.usersWithoutRoles} Account{data.totals.usersWithoutRoles === 1 ? '' : 's'} Pending RBAC Role Assignment
                          </h2>
                          <Badge variant="warning">
                            Legacy Permissions Active
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-slate-300 max-w-3xl leading-relaxed">
                          These accounts do not have an RBAC role assigned yet and are falling back to legacy hardcoded permissions.
                          Assign a role from the matrix to ensure granular permission enforcement and audit tracking.
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 sm:self-end md:self-center shrink-0">
                      <Button
                        size="sm"
                        onClick={() => handleOpenAssignModal(true)}
                        className="bg-amber-600 hover:bg-amber-700 text-white border-0 shadow-sm flex items-center gap-2 font-medium"
                      >
                        <UserPlus className="h-4 w-4" />
                        Assign Roles Now
                      </Button>
                      <Link href="/admin/users">
                        <Button size="sm" variant="outline" className="border-amber-300 dark:border-amber-700">
                          View Users
                          <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800/40 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <p className="text-sm font-medium text-emerald-900 dark:text-emerald-200">
                        All active user accounts are successfully governed under the RBAC permission matrix.
                      </p>
                    </div>
                    <Link href="/admin/roles">
                      <span className="text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-300 inline-flex items-center gap-1">
                        Manage roles
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </Link>
                  </div>
                </div>
              )}

              {/* Roles & Module Coverage Grid */}
              <div className="grid gap-6 lg:grid-cols-2">
                {/* Roles Card */}
                <Card padding={false} className="flex flex-col h-full overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                          Configured Roles ({data.roles.length})
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          System and custom role definitions
                        </p>
                      </div>
                      <Link
                        href="/admin/roles"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-blue-400"
                      >
                        Role Management
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <div className="relative">
                      <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                      <input
                        type="text"
                        value={roleSearch}
                        onChange={(e) => setRoleSearch(e.target.value)}
                        placeholder="Filter roles by name..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[440px]">
                    <table className="w-full text-left text-sm">
                      <thead className="sticky top-0 bg-gray-50/95 backdrop-blur-sm text-xs uppercase tracking-wider text-gray-500 dark:bg-slate-800/90 dark:text-slate-400 border-b border-gray-100 dark:border-slate-800">
                        <tr>
                          <th className="px-5 py-2.5 font-semibold">Role</th>
                          <th className="px-4 py-2.5 font-semibold text-center">Users</th>
                          <th className="px-4 py-2.5 font-semibold text-center">Status</th>
                          <th className="px-4 py-2.5 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-slate-800/60">
                        {filteredRoles.map((role) => (
                          <tr key={role.id} className="hover:bg-gray-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-gray-900 dark:text-slate-100">
                                  {formatRoleName(role.name)}
                                </span>
                                {role.isSystem ? (
                                  <Badge variant="info" className="text-[10px] tracking-wide uppercase">
                                    System
                                  </Badge>
                                ) : (
                                  <Badge variant="gray" className="text-[10px] tracking-wide uppercase">
                                    Custom
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-slate-800 dark:text-slate-200">
                                <Users className="h-3 w-3 text-gray-500" />
                                {role.userCount}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge variant={role.isActive ? 'success' : 'gray'} dot>
                                {role.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Link
                                href={`/admin/module-access?role=${role.id}`}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:underline dark:text-blue-400"
                              >
                                Permissions
                                <ChevronRight className="h-3 w-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                        {filteredRoles.length === 0 && (
                          <tr>
                            <td colSpan={4} className="px-5 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                              No roles found matching "{roleSearch}"
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Module Coverage Card */}
                <Card padding={false} className="flex flex-col h-full overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                          Module Coverage ({data.totals.modules} Modules)
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-slate-400">
                          Role accessibility distribution across system surfaces
                        </p>
                      </div>
                      <Link
                        href="/admin/module-access"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-blue-400"
                      >
                        Open Matrix
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={moduleSearch}
                          onChange={(e) => setModuleSearch(e.target.value)}
                          placeholder="Filter modules by name or key..."
                          className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>
                      {!moduleSearch && (
                        <button
                          type="button"
                          onClick={() => setShowAllModules(!showAllModules)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 shrink-0"
                        >
                          {showAllModules ? 'Top 10' : `All (${data.moduleCoverage.length})`}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto max-h-[440px] p-5 space-y-3.5">
                    {filteredModules.map((row) => {
                      const totalRolesCount = Math.max(data.totals.roles, 1);
                      const pct = Math.min(100, Math.round((row.rolesWithAccess / totalRolesCount) * 100));
                      return (
                        <div key={row.module} className="group">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-semibold text-gray-800 dark:text-slate-200 group-hover:text-primary-600 transition-colors">
                              {row.label}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-500 dark:text-slate-400 font-medium">
                                {row.rolesWithAccess} / {data.totals.roles} roles
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 dark:bg-slate-800 text-gray-600 dark:text-slate-300">
                                {pct}%
                              </span>
                            </div>
                          </div>
                          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary-600 transition-all duration-300"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}

                    {filteredModules.length === 0 && (
                      <div className="py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                        No modules found matching "{moduleSearch}"
                      </div>
                    )}
                  </div>
                </Card>
              </div>

              {/* Recent Access Changes / Audit Trail */}
              <Card padding={false} className="overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-bold text-gray-900 dark:text-slate-100">
                      Recent Access Changes
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-slate-400">
                      Audit history of role assignments, permission mutations, and access governance
                    </p>
                  </div>
                  <Link
                    href="/admin/audit-logs"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary-600 hover:text-primary-700 dark:text-blue-400"
                  >
                    <ClipboardList className="h-3.5 w-3.5" aria-hidden="true" />
                    Full Audit Trail
                  </Link>
                </div>

                <div className="p-5">
                  {logs.length === 0 ? (
                    <div className="py-10 text-center">
                      <div className="mx-auto w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 dark:bg-slate-800 mb-3">
                        <ClipboardList className="h-6 w-6" />
                      </div>
                      <p className="text-sm font-semibold text-gray-800 dark:text-slate-200">
                        No access control modifications recorded yet
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
                        When roles are created, permissions updated, or users assigned, the complete audit record with diffs will appear here.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {logs.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-3 text-sm dark:border-slate-800 dark:bg-slate-900/40 hover:border-gray-200 dark:hover:border-slate-700 transition-colors"
                        >
                          <div className="flex flex-wrap items-center gap-2.5">
                            <Badge
                              variant={
                                entry.action === 'DELETE'
                                  ? 'danger'
                                  : entry.action === 'CREATE'
                                  ? 'success'
                                  : 'info'
                              }
                              className="text-xs font-bold uppercase tracking-wider"
                            >
                              {entry.action}
                            </Badge>
                            <span className="font-semibold text-gray-900 dark:text-slate-100">
                              {entry.roleName || entry.entityType.replace('RBAC_', '').replace(/_/g, ' ')}
                            </span>
                            {entry.action === 'UPDATE' && entry.after?.diff && (
                              <div className="flex items-center gap-1.5 text-xs">
                                {entry.after.diff.added?.length > 0 && (
                                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 font-medium dark:bg-emerald-950/60 dark:text-emerald-400">
                                    +{entry.after.diff.added.length} added
                                  </span>
                                )}
                                {entry.after.diff.changed?.length > 0 && (
                                  <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-700 font-medium dark:bg-blue-950/60 dark:text-blue-400">
                                    ~{entry.after.diff.changed.length} changed
                                  </span>
                                )}
                                {entry.after.diff.removed?.length > 0 && (
                                  <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 font-medium dark:bg-rose-950/60 dark:text-rose-400">
                                    -{entry.after.diff.removed.length} removed
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-slate-400">
                            <span className="inline-flex items-center gap-1.5 font-medium text-gray-700 dark:text-slate-300">
                              <Network className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                              {entry.actorName || entry.actorEmail || 'System'}
                            </span>
                            <span className="tabular-nums">
                              {new Date(entry.createdAt).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </>
          )}

          {loading && !data && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-28 animate-pulse rounded-xl bg-gray-100 dark:bg-slate-800" />
              ))}
            </div>
          )}

          {/* Quick Assign Roles Modal */}
          {assignModalOpen && (
            <AssignUserRoleModal
              open={assignModalOpen}
              roles={assignableRoles}
              actorIsSuperAdmin={isSuperAdmin}
              defaultFilterUnassigned={filterUnassignedInModal}
              onClose={() => setAssignModalOpen(false)}
              onSaved={() => {
                setAssignModalOpen(false);
                load();
              }}
            />
          )}
        </div>
      </RequireModule>
    </DashboardLayout>
  );
}
