'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { apiError, createRole, updateRole } from '@/lib/access';
import type { AdminRole } from '@/lib/access';

interface Props {
  open: boolean;
  role: AdminRole | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Create / edit a role. Module access is deliberately not edited here — that is
 * the Admin's job on the Module Access page, and keeping the two apart is the
 * point of the Super Admin / Admin split.
 */
export function RoleFormModal({ open, role, onClose, onSaved }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [withFirstUser, setWithFirstUser] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(role);
  const nameLocked = Boolean(role?.isSystem);

  useEffect(() => {
    if (!open) return;
    setName(role?.name || '');
    setDescription(role?.description || '');
    setIsActive(role ? role.isActive : true);
    setWithFirstUser(false);
    setFullName('');
    setEmail('');
    setPassword('');
  }, [open, role]);

  if (!open) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const normalised = name.trim().toUpperCase().replace(/\s+/g, '_');
    if (!normalised) {
      toast.error('Role name is required');
      return;
    }
    if (withFirstUser && (!fullName.trim() || !email.trim() || password.length < 12)) {
      toast.error('First user needs a name, an email and a password of at least 12 characters');
      return;
    }
    setSaving(true);
    try {
      if (isEdit && role) {
        await updateRole(role.id, {
          ...(normalised !== role.name ? { name: normalised } : {}),
          description: description.trim(),
          isActive,
        });
        toast.success(`Role "${normalised}" updated`);
      } else {
        await createRole({
          name: normalised,
          description: description.trim(),
          isActive,
          ...(withFirstUser
            ? { firstUser: { fullName: fullName.trim(), email: email.trim(), password } }
            : {}),
        });
        toast.success(withFirstUser ? `Role "${normalised}" and its first user created` : `Role "${normalised}" created`);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(apiError(err, 'Could not save the role'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit role' : 'Create role'} className="max-w-xl">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Input
              label="Role name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={nameLocked}
              placeholder="e.g. PAYROLL_REVIEWER"
              className="font-mono uppercase"
              helperText="UPPERCASE_SNAKE_CASE, 3–50 characters"
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#1346a1] focus:ring-[#1346a1]"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={role?.name === 'SUPER_ADMIN'}
              />
              Role is active
            </label>
          </div>
        </div>

        <Textarea
          label="Description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this role for, and who normally holds it?"
          maxLength={500}
        />

        {nameLocked && (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {role?.name === 'SUPER_ADMIN'
              ? 'SUPER_ADMIN cannot be renamed, deactivated or deleted — it is the recovery path if every other role is misconfigured.'
              : 'System roles cannot be renamed or deleted. Deactivate it instead if it should stop being usable.'}
          </p>
        )}

        {!isEdit && (
          <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-800 dark:text-slate-200">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-[#1346a1] focus:ring-[#1346a1]"
                checked={withFirstUser}
                onChange={(e) => setWithFirstUser(e.target.checked)}
              />
              <UserPlus className="h-4 w-4" aria-hidden="true" />
              Create the first user for this role now
            </label>

            {withFirstUser && (
              <div className="mt-3 space-y-3">
                <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Priya Nair" />
                <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="priya@bsctextiles.com" />
                <Input
                  label="Temporary password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  helperText="Minimum 12 characters with upper, lower, number and symbol"
                />
                <p className="text-xs text-gray-500 dark:text-slate-400">
                  The user is created with no module access. Set it on the Module Access page, then hand this person the
                  link to sign in.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            {!saving && <>{isEdit ? 'Save changes' : 'Create role'}</>}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
