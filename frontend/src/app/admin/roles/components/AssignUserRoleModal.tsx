'use client';

import { useEffect, useState } from 'react';
import { X, Search, Loader2, Check } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export interface AssignableRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
}

interface RbacUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status?: string;
  isActive: boolean;
  rbacRoles: Array<{ roleId: string; name: string }>;
}

interface AssignUserRoleModalProps {
  open: boolean;
  /** Pre-selected user (when opened from a specific user row), else search first. */
  initialUser?: RbacUser | null;
  roles: AssignableRole[];
  /** Whether the acting user may hand out the SUPER_ADMIN role. */
  actorIsSuperAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Search a user, then assign/remove RBAC roles (multiple roles per user).
 */
export function AssignUserRoleModal({
  open,
  initialUser,
  roles,
  actorIsSuperAdmin,
  onClose,
  onSaved,
}: AssignUserRoleModalProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<RbacUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<RbacUser | null>(initialUser || null);
  const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelectedUser(initialUser || null);
    setSelectedRoleIds(initialUser ? initialUser.rbacRoles.map((r) => r.roleId) : []);
  }, [open, initialUser]);

  useEffect(() => {
    if (!open || selectedUser) return;
    const q = query.trim();
    if (q.length < 2) {
      setUsers([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setSearching(true);
        const res = await api.get(`/roles/rbac/users`, { params: { q } });
        setUsers(res.data?.users || []);
      } catch (err) {
        console.error(err);
        setUsers([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, open, selectedUser]);

  if (!open) return null;

  const toggleRole = (roleId: string, roleName: string) => {
    if (roleName === 'SUPER_ADMIN' && !actorIsSuperAdmin) {
      toast('Only Super Admin can assign the Super Admin role', { icon: '🔒' });
      return;
    }
    setSelectedRoleIds((prev) => (prev.includes(roleId) ? prev.filter((id) => id !== roleId) : [...prev, roleId]));
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    try {
      setSaving(true);
      await api.put(`/roles/rbac/users/${selectedUser.id}/roles`, { roleIds: selectedRoleIds });
      toast.success(`Roles updated for ${selectedUser.fullName || selectedUser.email}`);
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update user roles');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-primary-600" />
            <div>
              <h3 className="font-bold text-gray-900">Assign Roles to User</h3>
              <p className="text-xs text-gray-500">Users can hold one or more roles</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {!selectedUser ? (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email or role..."
                  autoFocus
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              {searching && (
                <div className="flex items-center justify-center py-6 text-gray-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}

              <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto border border-gray-100 rounded-lg">
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setSelectedUser(u);
                      setSelectedRoleIds(u.rbacRoles.map((r) => r.roleId));
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{u.fullName || '—'}</div>
                      <div className="text-xs text-gray-500">{u.email}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[45%]">
                      {u.rbacRoles.length > 0 ? (
                        u.rbacRoles.map((r) => (
                          <span key={r.roleId} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-primary-50 text-primary-700 border border-primary-200">
                            {r.name}
                          </span>
                        ))
                      ) : (
                        <span className="text-[10px] text-gray-400 font-mono">{u.role}</span>
                      )}
                    </div>
                  </button>
                ))}
                {!searching && query.trim().length >= 2 && users.length === 0 && (
                  <div className="px-4 py-6 text-center text-sm text-gray-400">No users found</div>
                )}
                {query.trim().length < 2 && (
                  <div className="px-4 py-6 text-center text-xs text-gray-400">Type at least 2 characters to search</div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <div className="text-sm font-bold text-gray-900">{selectedUser.fullName || '—'}</div>
                  <div className="text-xs text-gray-500">{selectedUser.email}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUser(null);
                    setSelectedRoleIds([]);
                  }}
                  className="text-xs text-primary-600 font-semibold hover:underline"
                >
                  Change user
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-2">Roles</label>
                <div className="space-y-2">
                  {roles.map((role) => {
                    const checked = selectedRoleIds.includes(role.id);
                    const locked = role.name === 'SUPER_ADMIN' && !actorIsSuperAdmin;
                    return (
                      <label
                        key={role.id}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked ? 'border-primary-300 bg-primary-50/50' : 'border-gray-200 hover:bg-gray-50'
                        } ${locked ? 'opacity-60' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={locked}
                          onChange={() => toggleRole(role.id, role.name)}
                          className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                            {role.name}
                            {role.isSystem && <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-bold">SYSTEM</span>}
                            {locked && <span title="Only Super Admin can assign this role">🔒</span>}
                          </div>
                          <div className="text-[11px] text-gray-500">{role.description}</div>
                        </div>
                        {checked && <Check className="w-4 h-4 text-primary-600" />}
                      </label>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!selectedUser || saving}
            className="px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Save Assignment
          </button>
        </div>
      </div>
    </div>
  );
}
