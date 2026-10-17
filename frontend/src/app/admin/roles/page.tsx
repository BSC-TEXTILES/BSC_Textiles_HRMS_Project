'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { KeyRound, Network, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, UserCog, Users } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessNav } from '@/components/access/AccessNav';
import { RequireModule } from '@/components/access/RequireModule';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { RoleFormModal } from '@/components/access/RoleFormModal';
import { AssignUserRoleModal } from './components/AssignUserRoleModal';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { apiError, deleteRole, fetchRoles, setRoleStatus } from '@/lib/access';
import type { AdminRole } from '@/lib/access';
import { invalidateMyAccessCache, useMyAccess } from '@/lib/rbac';
import { cn } from '@/lib/utils';

type PendingAction =
  | { kind: 'delete'; role: AdminRole }
  | { kind: 'status'; role: AdminRole; next: boolean }
  | null;

export default function RoleManagementPage() {
  const access = useMyAccess();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRole | null>(null);
  const [assignFor, setAssignFor] = useState<AdminRole | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const mayManage = access.canManageRoles || access.source !== 'rbac';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { roles: list } = await fetchRoles();
      setRoles(list);
    } catch (err: any) {
      const message = apiError(err, 'Could not load roles');
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

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return roles;
    return roles.filter(
      (role) =>
        role.name.toLowerCase().includes(needle) ||
        (role.description || '').toLowerCase().includes(needle)
    );
  }, [roles, query]);

  const applyPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'delete') {
        await deleteRole(pending.role.id);
        toast.success(`Role "${pending.role.name}" deleted`);
      } else {
        await setRoleStatus(pending.role.id, pending.next);
        toast.success(`Role "${pending.role.name}" ${pending.next ? 'activated' : 'deactivated'}`);
      }
      invalidateMyAccessCache();
      setPending(null);
      await load();
    } catch (err: any) {
      // The server refuses these when the result would strand a user, so the
      // refusal is shown rather than guessed at on the client.
      toast.error(apiError(err, 'Action refused'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <RequireModule module="ROLES_PERMISSIONS">
      <div className="space-y-5">
        <AccessNav access={access} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Role Management</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              {mayManage
                ? 'Create, rename, deactivate and delete roles here. What each role may do is assigned on the Module Access page.'
                : 'You can see the roles and assign their module access, but only a Super Admin can create, rename, deactivate or delete them.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
              Refresh
            </Button>
            {mayManage && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create Role
              </Button>
            )}
          </div>
        </div>

        {!access.loading && !mayManage && (
          <Card>
            <CardContent className="flex items-start gap-3 text-sm">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#1346a1]" aria-hidden="true" />
              <div>
                <p className="font-medium text-gray-900 dark:text-slate-100">Role governance is read-only for your account</p>
                <p className="mt-1 text-gray-600 dark:text-slate-300">
                  Super Admin owns the role list; Admin owns module access. That separation is enforced by the API, so
                  these buttons are absent rather than disabled.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search roles by name or description…"
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#1346a1]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>

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

        <Card padding={false}>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Role name</th>
                    <th className="px-4 py-3 font-medium">Description</th>
                    <th className="px-4 py-3 font-medium">Users</th>
                    <th className="px-4 py-3 font-medium">Modules</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="sticky right-0 z-10 bg-gray-50 px-4 py-3 text-right font-medium dark:bg-slate-800">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {loading &&
                    [0, 1, 2, 3].map((i) => (
                      <tr key={i}>
                        <td colSpan={6} className="px-4 py-3">
                          <div className="h-8 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
                        </td>
                      </tr>
                    ))}

                  {!loading && filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                        No roles match “{query}”.
                      </td>
                    </tr>
                  )}

                  {!loading &&
                    filtered.map((role) => {
                      const isSuperAdminRole = role.name === 'SUPER_ADMIN';
                      const canDelete = mayManage && !role.isSystem && role.userCount === 0;
                      return (
                        <tr key={role.id} className="align-top">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <KeyRound className="h-4 w-4 text-gray-400" aria-hidden="true" />
                              <span className="font-medium text-gray-900 dark:text-slate-100">
                                {role.name.replace(/_/g, ' ')}
                              </span>
                              {role.isSystem && <Badge variant="info">system</Badge>}
                            </div>
                          </td>
                          <td className="max-w-sm px-4 py-3 text-gray-600 dark:text-slate-300">
                            {role.description || <span className="text-gray-400">No description</span>}
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 text-gray-700 dark:text-slate-300">
                              <Users className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />
                              {role.userCount}
                            </span>
                            {role.userCount > 0 && !role.isSystem && (
                              <p className="mt-0.5 text-xs text-gray-400">reassign its users to delete</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700 dark:text-slate-300">{role.moduleCount}</td>
                          <td className="px-4 py-3">
                            <Badge variant={role.isActive ? 'success' : 'gray'} dot>
                              {role.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </td>
                          <td className="sticky right-0 bg-white px-2 py-3 dark:bg-[#0e172a]">
                            <div className="flex flex-wrap justify-end gap-1">
                              <Link href={`/admin/module-access?role=${encodeURIComponent(role.id)}`}>
                                <Button variant="ghost" size="xs" title="Assign module access">
                                  <Network className="h-3.5 w-3.5" aria-hidden="true" />
                                  Access
                                </Button>
                              </Link>
                              {mayManage && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => {
                                      setEditing(role);
                                      setFormOpen(true);
                                    }}
                                    title="Edit role"
                                  >
                                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                                    Edit
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    onClick={() => setAssignFor(role)}
                                    title="Assign users to this role"
                                  >
                                    <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                                    Users
                                  </Button>
                                  {!isSuperAdminRole && (
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      onClick={() => setPending({ kind: 'status', role, next: !role.isActive })}
                                    >
                                      {role.isActive ? 'Deactivate' : 'Activate'}
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    className="text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950/40"
                                    disabled={!canDelete}
                                    title={
                                      role.isSystem
                                        ? 'System roles cannot be deleted'
                                        : role.userCount > 0
                                          ? `${role.userCount} user(s) are still assigned — reassign them first`
                                          : 'Delete role'
                                    }
                                    onClick={() => setPending({ kind: 'delete', role })}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <p className="text-xs text-gray-500 dark:text-slate-400">
          Defaults shipped with the system: Admin, HR, Floor Manager, Employee — plus SUPER_ADMIN, which cannot be
          removed so there is always a way back in.
        </p>

        <RoleFormModal
          open={formOpen}
          role={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={load}
        />

        <AssignUserRoleModal
          open={Boolean(assignFor)}
          roles={roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description || '',
            isSystem: role.isSystem,
          }))}
          actorIsSuperAdmin={access.unrestricted || access.roles.includes('SUPER_ADMIN')}
          onClose={() => setAssignFor(null)}
          onSaved={() => {
            invalidateMyAccessCache();
            load();
          }}
        />

        <ConfirmDialog
          open={Boolean(pending)}
          title={pending?.kind === 'delete' ? `Delete ${pending.role.name}?` : `${pending?.role.name} — ${pending?.next === false ? 'deactivate' : 'reactivate'}?`}
          tone={pending?.kind === 'delete' ? 'danger' : 'primary'}
          confirmLabel={pending?.kind === 'delete' ? 'Delete role' : 'Confirm'}
          loading={busy}
          message={
            pending?.kind === 'delete' ? (
              <>
                This removes the role and its {pending.role.moduleCount} module grant(s) permanently. Users assigned to
                it lose those permissions the moment their next request is checked.
              </>
            ) : (
              <>
                {pending?.next === false ? (
                  <>
                    Deactivating hides every module grant on this role for its {pending?.role.userCount || 0} assigned
                    user(s) until it is reactivated. Their accounts stay intact.
                  </>
                ) : (
                  <>Reactiving restores this role’s grants to its {pending?.role.userCount || 0} assigned user(s).</>
                )}
              </>
            )
          }
          details={
            pending?.kind === 'delete' && pending.role.userCount > 0 ? (
              <span>{pending.role.userCount} user(s) are still assigned — delete will be refused.</span>
            ) : undefined
          }
          onConfirm={applyPending}
          onCancel={() => setPending(null)}
        />
      </div>
      </RequireModule>
    </DashboardLayout>
  );
}
