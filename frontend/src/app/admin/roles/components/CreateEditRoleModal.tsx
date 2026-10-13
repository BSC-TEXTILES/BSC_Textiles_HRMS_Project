'use client';

import { useEffect, useState } from 'react';
import { X, ShieldPlus, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { invalidateMyAccessCache, type AccessLevel, type RbacModule } from '@/lib/rbac';
import { PermissionMatrix } from './PermissionMatrix';

export interface RbacRole {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: Record<string, AccessLevel>;
  userCount: number;
}

interface CreateEditRoleModalProps {
  open: boolean;
  role: RbacRole | null; // null = create mode
  modules: RbacModule[];
  onClose: () => void;
  onSaved: () => void;
}

export function CreateEditRoleModal({ open, role, modules, onClose, onSaved }: CreateEditRoleModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [permissions, setPermissions] = useState<Record<string, AccessLevel>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setName(role?.name || '');
      setDescription(role?.description || '');
      const initial: Record<string, AccessLevel> = {};
      for (const m of modules) initial[m.key] = role?.permissions?.[m.key] || 'none';
      setPermissions(initial);
    }
  }, [open, role, modules]);

  if (!open) return null;

  const isEdit = Boolean(role);
  const isLockedSuperAdmin = role?.name === 'SUPER_ADMIN';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Role name is required');
      return;
    }
    try {
      setSaving(true);
      const payload = { name: name.trim().toUpperCase().replace(/\s+/g, '_'), description: description.trim(), permissions };
      if (isEdit && role) {
        await api.patch(`/roles/rbac/roles/${role.id}`, payload);
        toast.success(`Role "${payload.name}" updated successfully`);
      } else {
        await api.post('/roles/rbac/roles', payload);
        toast.success(`Role "${payload.name}" created successfully`);
      }
      invalidateMyAccessCache();
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save role');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <ShieldPlus className="w-5 h-5 text-primary-600" />
            <div>
              <h3 className="font-bold text-gray-900">{isEdit ? 'Edit Role' : 'Create New Role'}</h3>
              <p className="text-xs text-gray-500">Define module-level access (None / View / Edit)</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Role Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEdit && role?.isSystem}
                placeholder="e.g. STORE_MANAGER"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500 font-mono uppercase"
              />
              <p className="text-[10px] text-gray-400 mt-1">UPPERCASE_SNAKE_CASE, 3–50 characters</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What can this role do?"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>

          {isLockedSuperAdmin && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
              🔒 The SUPER_ADMIN role must keep Edit access on every module and cannot be renamed or deleted.
            </div>
          )}

          <PermissionMatrix
            modules={modules}
            value={permissions}
            onChange={setPermissions}
            readOnly={isLockedSuperAdmin}
          />

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg shadow-sm flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEdit ? 'Save Changes' : 'Create Role'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
