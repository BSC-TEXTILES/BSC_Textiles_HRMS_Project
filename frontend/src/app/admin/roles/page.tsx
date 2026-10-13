'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  ShieldQuestion, Plus, Pencil, Trash2, UserPlus, RefreshCw,
  Loader2, Lock, Users, Search, Sparkles, ShieldCheck
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useMyAccess, canViewModule, invalidateMyAccessCache, type AccessLevel, type RbacModule } from '@/lib/rbac';
import { PermissionSummary } from './components/PermissionMatrix';
import { CreateEditRoleModal, type RbacRole } from './components/CreateEditRoleModal';
import { AssignUserRoleModal } from './components/AssignUserRoleModal';

const CELL_STYLES: Record<AccessLevel, string> = {
  none: 'bg-gray-100 text-gray-400 border border-gray-200 hover:bg-gray-200 hover:text-gray-700',
  view: 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 hover:border-blue-300 shadow-xs',
  edit: 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 shadow-xs',
};

const NEXT_LEVEL: Record<AccessLevel, AccessLevel> = {
  none: 'view',
  view: 'edit',
  edit: 'none',
};

const CELL_LABELS: Record<AccessLevel, string> = { none: '—', view: 'VIEW', edit: 'EDIT' };

export default function RolesAdminPage() {
  const { data: session } = useSession();
  const myAccess = useMyAccess();

  const [roles, setRoles] = useState<RbacRole[]>([]);
  const [modules, setModules] = useState<RbacModule[]>([]);
  const [loading, setLoading] = useState(true);

  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RbacRole | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [deletingRole, setDeletingRole] = useState<RbacRole | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const actorIsSuperAdmin = (session?.user as any)?.role === 'SUPER_ADMIN';
  const canManage = actorIsSuperAdmin || myAccess.canManageRoles || myAccess.source !== 'rbac';
  const canViewRoles = canViewModule(myAccess, 'ROLES_PERMISSIONS');

  const fetchRoles = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/roles/rbac/roles');
      setRoles(res.data?.roles || []);
      if (Array.isArray(res.data?.modules) && res.data.modules.length > 0) {
        setModules(res.data.modules);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load roles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canViewRoles) {
      fetchRoles();
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewRoles]);

  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [matrixSearch, setMatrixSearch] = useState('');

  const effectiveModules = useMemo(() => (modules.length > 0 ? modules : []), [modules]);

  const filteredModules = useMemo(() => {
    if (!matrixSearch.trim()) return effectiveModules;
    const q = matrixSearch.toLowerCase();
    return effectiveModules.filter(
      (m) => m.label.toLowerCase().includes(q) || m.key.toLowerCase().includes(q)
    );
  }, [effectiveModules, matrixSearch]);

  const handleCellClick = async (role: RbacRole, moduleKey: string, currentLevel: AccessLevel) => {
    if (!canManage) {
      toast.error('Only administrators can modify role permissions');
      return;
    }

    if (role.name === 'SUPER_ADMIN') {
      toast('The SUPER_ADMIN role must keep full EDIT access on all operational modules', {
        icon: '🔒',
      });
      return;
    }

    const nextLevel = NEXT_LEVEL[currentLevel] || 'none';
    const cellKey = `${role.id}:${moduleKey}`;
    const previousPermissions = { ...(role.permissions || {}) };
    const nextPermissions = { ...previousPermissions, [moduleKey]: nextLevel };

    // Optimistic UI update
    setRoles((prev) =>
      prev.map((r) => (r.id === role.id ? { ...r, permissions: nextPermissions } : r))
    );
    setSavingCellKey(cellKey);

    try {
      await api.patch(`/roles/rbac/roles/${role.id}`, {
        permissions: nextPermissions,
      });
      invalidateMyAccessCache();
      toast.success(
        `${role.name}: ${moduleKey.replace(/_/g, ' ')} → ${nextLevel.toUpperCase()}`,
        { id: `cell-${cellKey}`, duration: 1800 }
      );
    } catch (err: any) {
      // Rollback optimistic update
      setRoles((prev) =>
        prev.map((r) => (r.id === role.id ? { ...r, permissions: previousPermissions } : r))
      );
      toast.error(err.response?.data?.error || 'Failed to update access level');
    } finally {
      setSavingCellKey(null);
    }
  };

  const handleDelete = async (role: RbacRole) => {
    try {
      setDeleteBusy(true);
      await api.delete(`/roles/rbac/roles/${role.id}`);
      toast.success(`Role "${role.name}" deleted`);
      setDeletingRole(null);
      fetchRoles();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete role');
    } finally {
      setDeleteBusy(false);
    }
  };

  if (!loading && !canViewRoles) {
    return (
      <DashboardLayout>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center">
          <Lock className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <h2 className="font-bold text-gray-900 mb-1">Restricted Section 🔒</h2>
          <p className="text-sm text-gray-500">
            Your role does not have access to Roles &amp; Permissions. Contact an administrator if you believe this is an error.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShieldQuestion className="w-6 h-6 text-primary-600" />
              Roles &amp; Permissions
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Create roles, control module-level access (View / Edit / No Access), and assign roles to users
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchRoles}
              className="p-2.5 rounded-lg border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            {canManage && (
              <button
                onClick={() => {
                  setEditingRole(null);
                  setRoleModalOpen(true);
                }}
                className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 px-5 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Create New Role
              </button>
            )}
          </div>
        </div>

        {/* Roles list */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 min-w-[200px]">Role</th>
                    <th className="py-3 px-4 min-w-[240px]">Access Summary</th>
                    <th className="py-3 px-3 text-center">Users</th>
                    <th className="py-3 px-4 text-right min-w-[150px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roles.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-gray-900 flex items-center gap-1.5">
                          {r.name}
                          {r.isSystem && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">SYSTEM</span>
                          )}
                        </div>
                        <div className="text-[11px] text-gray-500 mt-0.5">{r.description}</div>
                      </td>
                      <td className="py-3 px-4">
                        <PermissionSummary modules={effectiveModules} value={r.permissions} />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1 text-gray-700 font-semibold">
                          <Users className="w-3.5 h-3.5 text-gray-400" />
                          {r.userCount ?? 0}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManage && (
                            <>
                              <button
                                onClick={() => {
                                  setAssignModalOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 flex items-center gap-1"
                                title="Assign users to roles"
                              >
                                <UserPlus className="w-3.5 h-3.5" />
                                Assign
                              </button>
                              <button
                                onClick={() => {
                                  setEditingRole(r);
                                  setRoleModalOpen(true);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 flex items-center gap-1"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                                Edit
                              </button>
                              {!r.isSystem && (
                                <button
                                  onClick={() => setDeletingRole(r)}
                                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 flex items-center gap-1"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                          {!canManage && (
                            <span className="text-[11px] text-gray-400 flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Read-only
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {roles.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-10 text-center text-sm text-gray-400">
                        No roles found. The default roles will appear after the database migrates.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Interactive permission overview matrix */}
        {effectiveModules.length > 0 && roles.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-200">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-gray-900 text-base">Permission Matrix Overview</h3>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <Sparkles className="w-3 h-3 text-emerald-500" /> Click to Edit Access
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Click any cell to cycle access (<span className="font-semibold text-gray-400">—</span> &rarr; <span className="font-semibold text-blue-600">VIEW</span> &rarr; <span className="font-semibold text-emerald-600">EDIT</span>), or click a role to configure details
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {/* Legend badges */}
                <div className="flex items-center gap-1.5 text-[11px]">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-emerald-200 bg-emerald-50 font-bold text-emerald-700">
                    EDIT
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-200 bg-blue-50 font-bold text-blue-700">
                    VIEW
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-gray-200 bg-gray-100 font-bold text-gray-400">
                    — None
                  </span>
                </div>

                {/* Filter modules input */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Filter modules..."
                    value={matrixSearch}
                    onChange={(e) => setMatrixSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 w-40"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-700 border-b border-gray-200">
                  <tr>
                    <th className="py-3 px-4 min-w-[200px] sticky left-0 bg-gray-50 z-20">Role</th>
                    {filteredModules.map((m) => (
                      <th key={m.key} className="py-3 px-2 text-center min-w-[90px]">
                        <span className="truncate block" title={m.label}>{m.label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {roles.map((r) => {
                    const isSuperAdmin = r.name === 'SUPER_ADMIN';
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/70 transition-colors">
                        <td className="py-2.5 px-4 font-bold text-gray-900 sticky left-0 bg-white z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              disabled={!canManage}
                              onClick={() => {
                                setEditingRole(r);
                                setRoleModalOpen(true);
                              }}
                              className="text-left font-bold text-gray-900 hover:text-primary-600 transition-colors flex items-center gap-1.5 group cursor-pointer"
                              title="Click to edit role settings"
                            >
                              <span>{r.name}</span>
                              {canManage && (
                                <Pencil className="w-3 h-3 text-gray-400 opacity-60 group-hover:opacity-100 group-hover:text-primary-600 transition-all" />
                              )}
                            </button>
                            {r.isSystem && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 font-mono font-semibold">
                                SYSTEM
                              </span>
                            )}
                          </div>
                        </td>
                        {filteredModules.map((m) => {
                          const level = (r.permissions?.[m.key] || 'none') as AccessLevel;
                          const cellKey = `${r.id}:${m.key}`;
                          const isSavingThis = savingCellKey === cellKey;
                          const nextLevel = NEXT_LEVEL[level];

                          return (
                            <td key={m.key} className="py-2 px-1.5 text-center">
                              <button
                                type="button"
                                disabled={!canManage || isSuperAdmin || isSavingThis}
                                onClick={() => handleCellClick(r, m.key, level)}
                                className={`w-full max-w-[85px] mx-auto py-1.5 px-2 rounded-md font-bold text-[10px] tracking-wider border transition-all transform active:scale-95 flex items-center justify-center gap-1 ${
                                  CELL_STYLES[level]
                                } ${
                                  isSuperAdmin
                                    ? 'cursor-not-allowed opacity-90'
                                    : canManage
                                    ? 'cursor-pointer hover:shadow-xs hover:scale-105 ring-offset-1 focus:outline-none focus:ring-2 focus:ring-primary-400'
                                    : 'cursor-default'
                                } ${isSavingThis ? 'ring-2 ring-primary-500 animate-pulse' : ''}`}
                                title={
                                  isSuperAdmin
                                    ? 'SUPER_ADMIN has permanently locked EDIT access'
                                    : canManage
                                    ? `Current: ${CELL_LABELS[level]} — Click to toggle to ${CELL_LABELS[nextLevel]}`
                                    : `Access level: ${CELL_LABELS[level]}`
                                }
                              >
                                {isSavingThis ? (
                                  <Loader2 className="w-3 h-3 animate-spin text-primary-600" />
                                ) : (
                                  CELL_LABELS[level]
                                )}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <CreateEditRoleModal
        open={roleModalOpen}
        role={editingRole}
        modules={effectiveModules}
        onClose={() => setRoleModalOpen(false)}
        onSaved={fetchRoles}
      />

      <AssignUserRoleModal
        open={assignModalOpen}
        roles={roles}
        actorIsSuperAdmin={actorIsSuperAdmin}
        onClose={() => setAssignModalOpen(false)}
        onSaved={fetchRoles}
      />

      {/* Delete confirmation */}
      {deletingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-bold text-gray-900 mb-2">Delete role "{deletingRole.name}"?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This removes the role and its permissions, and unassigns it from {deletingRole.userCount ?? 0} user(s).
              This action is recorded in the audit log.
            </p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeletingRole(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => handleDelete(deletingRole)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg flex items-center gap-2 disabled:opacity-50"
              >
                {deleteBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete Role
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
