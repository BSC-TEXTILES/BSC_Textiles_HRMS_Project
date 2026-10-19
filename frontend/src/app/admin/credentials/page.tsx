'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Copy, KeyRound, Loader2, Lock, Plus, RefreshCw, Search, ShieldAlert, Unlock, UserCog, Users, Wrench,
} from 'lucide-react';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessNav } from '@/components/access/AccessNav';
import { RequireModule } from '@/components/access/RequireModule';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { useMyAccess } from '@/lib/rbac';
import { cn } from '@/lib/utils';

interface CredentialRow {
  id: string;
  loginId: string | null;
  email: string;
  fullName: string;
  legacyRole: string;
  roles: Array<{ roleId: string; name: string }>;
  isActive: boolean;
  status: string;
  mustChangePassword: boolean;
  passwordExpiresAt: string | null;
  passwordExpired: boolean;
  lockedUntil: string | null;
  failedLoginAttempts: number;
  consecutiveLockouts: number;
  lastLoginAt: string | null;
  mfaEnabled: boolean;
}

interface Summary {
  total: number;
  pendingPasswordChange: number;
  expired: number;
  locked: number;
  inactive: number;
  withoutRole: number;
}

type PendingAction =
  | { kind: 'status'; row: CredentialRow; next: boolean }
  | { kind: 'unlock'; row: CredentialRow }
  | { kind: 'must-change'; row: CredentialRow; next: boolean }
  | null;

const STRENGTH_LABELS = ['very weak', 'weak', 'fair', 'strong', 'excellent'];

function message(err: any, fallback: string): string {
  return err?.response?.data?.message || err?.response?.data?.error || fallback;
}

function relativeTime(value?: string | null): string {
  if (!value) return 'never';
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function CredentialsPage() {
  const access = useMyAccess();
  const [rows, setRows] = useState<CredentialRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [roles, setRoles] = useState<Array<{ id: string; name: string; isActive: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState('all');

  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<CredentialRow | null>(null);
  const [editLoginFor, setEditLoginFor] = useState<CredentialRow | null>(null);
  const [issued, setIssued] = useState<{ loginId: string; password: string } | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [busy, setBusy] = useState(false);

  const mayManage = access.canManageCredentials;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, totals, roleList] = await Promise.all([
        api.get('/credentials', { params: { q: query || undefined, roleId: roleFilter || undefined, flag: flagFilter } }),
        api.get('/credentials/summary'),
        api.get('/credentials/roles'),
      ]);
      setRows(list.data.users || []);
      setSummary(totals.data);
      setRoles(roleList.data.roles || []);
    } catch (err: any) {
      const text = message(err, 'Could not load credentials');
      setError(text);
      toast.error(text);
    } finally {
      setLoading(false);
    }
  }, [query, roleFilter, flagFilter]);

  useEffect(() => {
    if (access.loading) return;
    load();
  }, [access.loading, load]);

  const applyPending = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      if (pending.kind === 'status') {
        await api.post(`/credentials/${pending.row.id}/status`, { isActive: pending.next });
        toast.success(pending.next ? 'Account activated' : 'Account deactivated');
      } else if (pending.kind === 'unlock') {
        await api.post(`/credentials/${pending.row.id}/unlock`, {});
        toast.success('Account unlocked — the cooldown is cleared');
      } else {
        await api.post(`/credentials/${pending.row.id}/must-change`, { mustChange: pending.next });
        toast.success(pending.next ? 'Will ask for a new password at next sign-in' : 'Forced change removed');
      }
      setPending(null);
      await load();
    } catch (err: any) {
      toast.error(message(err, 'Action refused'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashboardLayout>
      <RequireModule module="USER_CREDENTIALS">
        <div className="space-y-5">
          <AccessNav access={access} />

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">User Credentials</h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                {mayManage
                  ? 'Create login IDs, reset passwords, unlock accounts. Passwords are shown once and never stored in plain text.'
                  : 'Credentials are issued and reset by an Admin. You can see account status for your team, but not change passwords.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
                Refresh
              </Button>
              {mayManage && (
                <Button size="sm" onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New credential
                </Button>
              )}
            </div>
          </div>

          {!access.loading && !mayManage && (
            <Card>
              <CardContent className="flex items-start gap-3 text-sm">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-[#1346a1]" aria-hidden="true" />
                <div>
                  <p className="font-medium text-gray-900 dark:text-slate-100">Read-only for your role</p>
                  <p className="mt-1 text-gray-600 dark:text-slate-300">
                    Creating or resetting a credential is an Admin responsibility, and a Super Admin deliberately cannot
                    do it either — that separation is enforced by the API, not by hiding buttons.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {summary && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                { label: 'Accounts', value: summary.total },
                { label: 'Awaiting first sign-in', value: summary.pendingPasswordChange, warn: true },
                { label: 'Password expired', value: summary.expired, warn: true },
                { label: 'Locked now', value: summary.locked, warn: true },
                { label: 'Inactive', value: summary.inactive },
              ].map((stat) => (
                <Card key={stat.label} className="h-full">
                  <CardContent className="space-y-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-slate-400">{stat.label}</p>
                    <p
                      className={cn(
                        'text-2xl font-semibold',
                        stat.warn && stat.value > 0 ? 'text-amber-600' : 'text-gray-900 dark:text-slate-100'
                      )}
                    >
                      {stat.value}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by name, login ID or email…"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#1346a1]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value)}
                options={[
                  { value: '', label: 'All roles' },
                  ...roles.map((role) => ({ value: role.id, label: role.name.replace(/_/g, ' ') })),
                ]}
              />
            </div>
            <div className="w-full sm:w-56">
              <Select
                value={flagFilter}
                onChange={(event) => setFlagFilter(event.target.value)}
                options={[
                  { value: 'all', label: 'Everyone' },
                  { value: 'pending-change', label: 'Must change password' },
                  { value: 'locked', label: 'Locked out' },
                  { value: 'expired', label: 'Password expired' },
                  { value: 'inactive', label: 'Inactive' },
                ]}
              />
            </div>
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
                <table className="w-full min-w-[980px] text-sm">
                  <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500 dark:bg-slate-800/70 dark:text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Person</th>
                      <th className="px-4 py-3 font-medium">Login ID</th>
                      <th className="px-4 py-3 font-medium">Roles</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Last sign-in</th>
                      <th className="sticky right-0 z-10 bg-gray-50 px-4 py-3 text-right font-medium dark:bg-slate-800">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {loading &&
                      [0, 1, 2].map((index) => (
                        <tr key={index}>
                          <td colSpan={6} className="px-4 py-3">
                            <div className="h-8 animate-pulse rounded bg-gray-100 dark:bg-slate-800" />
                          </td>
                        </tr>
                      ))}
                    {!loading && rows.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500 dark:text-slate-400">
                          No accounts match these filters.
                        </td>
                      </tr>
                    )}
                    {!loading &&
                      rows.map((row) => {
                        const locked = Boolean(row.lockedUntil && new Date(row.lockedUntil).getTime() > Date.now());
                        return (
                          <tr key={row.id} className="align-top">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 dark:text-slate-100">{row.fullName}</div>
                              <div className="text-xs text-gray-500 dark:text-slate-400">{row.email}</div>
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-slate-300">
                              {row.loginId || <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {row.roles.length === 0 && <Badge variant="warning">no role assigned</Badge>}
                                {row.roles.map((role) => (
                                  <Badge key={role.roleId} variant="gray">
                                    {role.name.replace(/_/g, ' ')}
                                  </Badge>
                                ))}
                                {row.mfaEnabled && <Badge variant="info">2FA</Badge>}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                <Badge variant={row.isActive && row.status === 'ACTIVE' ? 'success' : 'gray'} dot>
                                  {row.isActive && row.status === 'ACTIVE' ? 'Active' : row.status.toLowerCase().replace(/_/g, ' ')}
                                </Badge>
                                {row.mustChangePassword && <Badge variant="warning">temp password</Badge>}
                                {row.passwordExpired && <Badge variant="danger">expired</Badge>}
                                {locked && <Badge variant="danger">locked</Badge>}
                              </div>
                              {locked && (
                                <p className="mt-1 text-[11px] text-gray-500 dark:text-slate-400">
                                  until {new Date(row.lockedUntil!).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })} · {row.failedLoginAttempts} failed
                                </p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 dark:text-slate-300">{relativeTime(row.lastLoginAt)}</td>
                            <td className="sticky right-0 bg-white px-3 py-3 dark:bg-[#0e172a]">
                              <div className="flex flex-wrap justify-end gap-1">
                                {mayManage && (
                                  <>
                                    <Button variant="ghost" size="xs" onClick={() => setEditLoginFor(row)} title="Change login ID">
                                      <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                                      Login ID
                                    </Button>
                                    <Button variant="ghost" size="xs" onClick={() => setResetFor(row)} title="Reset password">
                                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                                      Reset
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      onClick={() => setPending({ kind: 'must-change', row, next: !row.mustChangePassword })}
                                    >
                                      <Wrench className="h-3.5 w-3.5" aria-hidden="true" />
                                      {row.mustChangePassword ? 'No force' : 'Force change'}
                                    </Button>
                                    {locked && (
                                      <Button variant="ghost" size="xs" onClick={() => setPending({ kind: 'unlock', row })}>
                                        <Unlock className="h-3.5 w-3.5" aria-hidden="true" />
                                        Unlock
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="xs"
                                      onClick={() => setPending({ kind: 'status', row, next: !(row.isActive && row.status === 'ACTIVE') })}
                                    >
                                      {row.isActive && row.status === 'ACTIVE' ? (
                                        <>
                                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                                          Deactivate
                                        </>
                                      ) : (
                                        'Activate'
                                      )}
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
            {summary?.withoutRole
              ? `${summary.withoutRole} account(s) have no RBAC role and are still governed by the legacy permission set.`
              : 'Every account is governed by an assigned role.'}
          </p>

          {creating && <CreateCredentialModal roles={roles} onClose={() => setCreating(false)} onIssued={setIssued} onSaved={load} />}
          {resetFor && <ResetPasswordModal row={resetFor} onClose={() => setResetFor(null)} onIssued={setIssued} />}
          {editLoginFor && (
            <EditLoginModal
              row={editLoginFor}
              onClose={() => setEditLoginFor(null)}
              onSaved={() => {
                setEditLoginFor(null);
                load();
              }}
            />
          )}
          {issued && <IssuedPasswordModal issued={issued} onClose={() => setIssued(null)} />}
          <ConfirmDialog
            open={Boolean(pending)}
            title={
              pending?.kind === 'unlock'
                ? `Unlock ${pending.row.fullName}?`
                : pending?.kind === 'status'
                  ? `${pending.next ? 'Activate' : 'Deactivate'} ${pending.row.fullName}?`
                  : `Force a password change for ${pending?.row.fullName}?`
            }
            tone={pending?.kind === 'status' && pending.next === false ? 'danger' : 'primary'}
            confirmLabel="Confirm"
            loading={busy}
            message={
              pending?.kind === 'unlock'
                ? 'The failed-attempt counter and the cooldown are cleared, and the account can sign in again immediately.'
              : pending?.kind === 'status'
                ? pending.next
                  ? 'The account will be able to sign in again with its existing password.'
                  : 'The account is deactivated and every live session is ended. Its data is kept — this is reversible by an Admin.'
                : pending?.next === false
                  ? 'The user keeps their current password and will not be prompted to change it.'
                  : 'On their next sign-in the user must set a new password before any other screen opens.'
            }
            onConfirm={applyPending}
            onCancel={() => setPending(null)}
          />
        </div>
      </RequireModule>
    </DashboardLayout>
  );
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

function useStrengthMeter() {
  const [policy, setPolicy] = useState<any>(null);
  const [pending, setPending] = useState(false);

  const check = useCallback((password: string, loginId: string, fullName: string) => {
    if (!password) {
      setPolicy(null);
      return;
    }
    setPending(true);
    api
      .post('/credentials/password/evaluate', { password, loginId, fullName })
      .then((response) => setPolicy(response.data))
      .catch(() => setPolicy(null))
      .finally(() => setPending(false));
  }, []);

  return { policy, pending, check };
}

function StrengthMeter({ policy, password }: { policy: any; password: string }) {
  if (!password) return null;
  const score = policy?.score ?? 0;
  return (
    <div className="mt-2 space-y-1.5 rounded-lg border border-gray-200 p-2.5 dark:border-slate-700">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-gray-600 dark:text-slate-300">Strength</span>
        <span className={cn('font-semibold', score >= 3 ? 'text-emerald-600' : score === 2 ? 'text-amber-600' : 'text-red-600')}>
          {STRENGTH_LABELS[score] || 'very weak'}
        </span>
      </div>
      <div className="flex gap-1" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((index) => (
          <span key={index} className={cn('h-1.5 flex-1 rounded-full', index < score ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-slate-700')} />
        ))}
      </div>
      {policy?.errors?.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-red-600 dark:text-red-400">
          {policy.errors.slice(0, 4).map((error: string) => (
            <li key={error}>· {error}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CreateCredentialModal({
  roles,
  onClose,
  onSaved,
  onIssued,
}: {
  roles: Array<{ id: string; name: string; isActive: boolean }>;
  onClose: () => void;
  onSaved: () => void;
  onIssued: (issued: { loginId: string; password: string }) => void;
}) {
  const [fullName, setFullName] = useState('');
  const [loginId, setLoginId] = useState('');
  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [manual, setManual] = useState(false);
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [saving, setSaving] = useState(false);
  const { policy, check } = useStrengthMeter();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!fullName.trim() || !loginId.trim()) {
      toast.error('A name and a login ID are required');
      return;
    }
    setSaving(true);
    try {
      const { data } = await api.post('/credentials', {
        fullName: fullName.trim(),
        loginId: loginId.trim().toLowerCase(),
        email: email.trim() || undefined,
        roleId: roleId || undefined,
        password: manual ? password : undefined,
        mustChangePassword: mustChange,
      });
      onIssued({ loginId: data.user.loginId, password: data.temporaryPassword });
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(message(err, 'Could not create the credential'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Create credential" className="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Full name" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="e.g. Priya Nair" />
        <Input
          label="Login ID"
          required
          value={loginId}
          onChange={(event) => {
            const value = event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
            setLoginId(value);
            if (manual) check(password, value, fullName);
          }}
          helperText="3–32 characters, starts with a letter. Shown to the user at sign-in."
          className="font-mono"
        />
        <Input
          label="Email (optional)"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          helperText="Defaults to loginId@bsctextiles.com. Used for security notifications."
        />
        <Select
          label="Role"
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          options={[{ value: '', label: 'No role yet' }, ...roles.filter((role) => role.isActive).map((role) => ({ value: role.id, label: role.name.replace(/_/g, ' ') }))]}
          helperText="Module access for the role is configured separately by an Admin."
        />

        <div className="rounded-lg border border-gray-200 p-3 dark:border-slate-700">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-slate-200">
            <input
              type="checkbox"
              checked={manual}
              onChange={(event) => setManual(event.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#1346a1]"
            />
            Type the password myself
          </label>
          {manual ? (
            <div className="mt-3">
              <Input
                label="Password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  check(event.target.value, loginId, fullName);
                }}
                autoComplete="off"
              />
              <StrengthMeter policy={policy} password={password} />
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500 dark:text-slate-400">
              A strong temporary password is generated for you and displayed once.
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
          <input
            type="checkbox"
            checked={mustChange}
            onChange={(event) => setMustChange(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#1346a1]"
          />
          Force a password change at first sign-in
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" loading={saving} disabled={manual && policy?.valid === false}>
            Create credential
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordModal({
  row,
  onClose,
  onIssued,
}: {
  row: CredentialRow;
  onClose: () => void;
  onIssued: (issued: { loginId: string; password: string }) => void;
}) {
  const [manual, setManual] = useState(false);
  const [password, setPassword] = useState('');
  const [mustChange, setMustChange] = useState(true);
  const [saving, setSaving] = useState(false);
  const { policy, check } = useStrengthMeter();

  const submit = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/credentials/${row.id}/password/reset`, {
        password: manual ? password : undefined,
        mustChangePassword: mustChange,
        reason: 'ADMIN_RESET',
      });
      onIssued({ loginId: row.loginId || row.email, password: data.temporaryPassword });
      onClose();
    } catch (err: any) {
      toast.error(message(err, 'Could not reset the password'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Reset password — ${row.fullName}`} className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-slate-300">
          Every live session for this account is ended immediately, and the outstanding access tokens stop working. The
          new password is shown once and never stored or returned again.
        </p>

        <label className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-slate-200">
          <input type="checkbox" checked={manual} onChange={(event) => setManual(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#1346a1]" />
          Type the password myself
        </label>
        {manual && (
          <div>
            <Input
              label="New password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                check(event.target.value, row.loginId || '', row.fullName);
              }}
              autoComplete="off"
            />
            <StrengthMeter policy={policy} password={password} />
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-slate-200">
          <input type="checkbox" checked={mustChange} onChange={(event) => setMustChange(event.target.checked)} className="h-4 w-4 rounded border-gray-300 text-[#1346a1]" />
          Force a change at next sign-in
        </label>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={saving} disabled={manual && policy?.valid === false}>
            Reset password
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function EditLoginModal({ row, onClose, onSaved }: { row: CredentialRow; onClose: () => void; onSaved: () => void }) {
  const [loginId, setLoginId] = useState(row.loginId || '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      await api.patch(`/credentials/${row.id}/login-id`, { loginId: loginId.trim().toLowerCase() });
      toast.success('Login ID updated');
      onSaved();
    } catch (err: any) {
      toast.error(message(err, 'Could not change the login ID'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Login ID — ${row.fullName}`} className="max-w-sm">
      <div className="space-y-4">
        <Input
          label="Login ID"
          value={loginId}
          onChange={(event) => setLoginId(event.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ''))}
          className="font-mono"
          helperText="The old ID stops working at once, including for any session already open."
        />
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={submit} loading={saving} disabled={!loginId.trim()}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function IssuedPasswordModal({ issued, onClose }: { issued: { loginId: string; password: string }; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${issued.loginId}\t${issued.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Clipboard blocked by the browser — select the text instead');
    }
  };

  return (
    <Modal open onClose={onClose} title="Share this once, then close" className="max-w-md">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-slate-300">
          This is the only time the password is displayed. It is stored as an Argon2id hash with a server-side pepper,
          and the user is required to replace it at first sign-in.
        </p>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Login ID</p>
          <p className="font-mono text-sm font-semibold text-gray-900 dark:text-slate-100">{issued.loginId}</p>
          <p className="mt-2 text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400">Temporary password</p>
          <p className="select-all font-mono text-sm font-semibold text-gray-900 dark:text-slate-100">{issued.password}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="h-4 w-4" aria-hidden="true" />
            {copied ? 'Copied' : 'Copy both'}
          </Button>
          <Button size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Modal>
  );
}
