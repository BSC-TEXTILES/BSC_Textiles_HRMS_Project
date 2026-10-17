'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { KeyRound, Network, RefreshCw, ShieldAlert, Users, UserX } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessNav } from '@/components/access/AccessNav';
import { RequireModule } from '@/components/access/RequireModule';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { apiError, fetchAccessAuditLogs, fetchOverview } from '@/lib/access';
import type { AccessAuditEntry, AccessOverview } from '@/lib/access';
import { useMyAccess } from '@/lib/rbac';

function StatCard({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <Card className="h-full">
      <CardContent className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{label}</p>
        <p
          className={
            tone === 'warn'
              ? 'text-2xl font-semibold text-amber-600'
              : tone === 'good'
                ? 'text-2xl font-semibold text-emerald-600'
                : 'text-2xl font-semibold text-gray-900 dark:text-slate-100'
          }
        >
          {value}
        </p>
        {hint && <p className="text-xs text-gray-500 dark:text-slate-400">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function AccessOverviewPage() {
  const access = useMyAccess();
  const [data, setData] = useState<AccessOverview | null>(null);
  const [logs, setLogs] = useState<AccessAuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <DashboardLayout>
      <RequireModule module="ROLES_PERMISSIONS">
      <div className="space-y-5">
        <AccessNav access={access} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Access Control Overview</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Roles, who holds them, and what has changed. Super Admin governs roles; Admin assigns module access.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </Button>
            <Link href="/admin/roles">
              <Button size="sm">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Role Management
              </Button>
            </Link>
          </div>
        </div>

        {!access.loading && !canSeeGovernance && (
          <Card>
            <CardContent className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 text-amber-600" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">Access administration is not granted to your role</p>
                <p className="mt-1 text-sm text-gray-600 dark:text-slate-300">
                  Ask a Super Admin to grant your role View on <span className="font-medium">Role Management</span>. The
                  server rejects administration requests regardless of what this page shows.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {error && !loading && (
          <Card>
            <CardContent className="flex items-center justify-between gap-3">
              <p className="text-sm text-red-600">{error}</p>
              <Button size="sm" variant="outline" onClick={load}>
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Total roles" value={data.totals.roles} hint={`${data.totals.activeRoles} active`} />
              <StatCard label="Inactive roles" value={data.totals.inactiveRoles} tone={data.totals.inactiveRoles ? 'warn' : 'good'} />
              <StatCard label="Total users" value={data.totals.users} hint={`${data.totals.activeUsers} active`} />
              <StatCard
                label="Users without a role"
                value={data.totals.usersWithoutRoles}
                tone={data.totals.usersWithoutRoles ? 'warn' : 'good'}
                hint={data.totals.usersWithoutRoles ? 'Falling back to legacy permissions' : 'Every account is role-governed'}
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card padding={false}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Roles</h2>
                    <Link href="/admin/module-access" className="text-xs font-medium text-[#1346a1] hover:underline dark:text-blue-300">
                      Open module access
                    </Link>
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/60 dark:text-slate-400">
                      <tr>
                        <th className="px-4 py-2 font-medium">Role</th>
                        <th className="px-4 py-2 font-medium">Users</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {data.roles.map((role) => (
                        <tr key={role.id}>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900 dark:text-slate-100">{role.name.replace(/_/g, ' ')}</span>
                              {role.isSystem && <Badge variant="info">system</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-gray-600 dark:text-slate-300">{role.userCount}</td>
                          <td className="px-4 py-2">
                            <Badge variant={role.isActive ? 'success' : 'gray'} dot>
                              {role.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Module coverage</h2>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {data.totals.modules} registered modules · how many roles can view each
                  </p>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.moduleCoverage.slice(0, 10).map((row) => {
                    const pct = data.roles.length > 0 ? Math.round((row.rolesWithAccess / data.roles.length) * 100) : 0;
                    return (
                      <div key={row.module}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 dark:text-slate-300">{row.label}</span>
                          <span className="tabular-nums text-gray-500 dark:text-slate-400">{row.rolesWithAccess}</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 dark:bg-slate-800">
                          <div className="h-1.5 rounded-full bg-[#1346a1]" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                  {data.moduleCoverage.length === 0 && (
                    <p className="text-sm text-gray-500 dark:text-slate-400">No module grants exist yet.</p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Recent access changes</h2>
                  <Link href="/admin/audit-logs" className="inline-flex items-center gap-1 text-xs font-medium text-[#1346a1] hover:underline dark:text-blue-300">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    Full audit trail
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {logs.length === 0 && (
                  <p className="text-sm text-gray-500 dark:text-slate-400">Nothing recorded yet.</p>
                )}
                {logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2">
                      <Badge variant={entry.action === 'DELETE' ? 'danger' : entry.action === 'CREATE' ? 'success' : 'info'}>
                        {entry.action}
                      </Badge>
                      <span className="text-gray-700 dark:text-slate-300">
                        {entry.roleName || entry.entityType.replace('RBAC_', '').replace('_', ' ')}
                      </span>
                      {entry.action === 'UPDATE' && entry.after?.diff && (
                        <span className="text-xs text-gray-500 dark:text-slate-400">
                          {`${entry.after.diff.added?.length || 0} added, ${entry.after.diff.changed?.length || 0} changed, ${entry.after.diff.removed?.length || 0} removed`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <Network className="h-3.5 w-3.5" aria-hidden="true" />
                        {entry.actorName || entry.actorEmail || 'system'}
                      </span>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}

        {loading && !data && (
          <Card>
            <CardContent className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-10 animate-pulse rounded-lg bg-gray-100 dark:bg-slate-800" />
              ))}
            </CardContent>
          </Card>
        )}

        {data?.totals.usersWithoutRoles ? (
          <Card>
            <CardContent className="flex items-start gap-3 text-sm">
              <UserX className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-medium text-gray-900 dark:text-slate-100">
                  {data.totals.usersWithoutRoles} account(s) have no RBAC role assigned
                </p>
                <p className="mt-1 text-gray-600 dark:text-slate-300">
                  They are still governed by the legacy permission set, which is how accounts keep working during
                  rollout. Assign a role from Users to bring them under the matrix.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
      </RequireModule>
    </DashboardLayout>
  );
}
