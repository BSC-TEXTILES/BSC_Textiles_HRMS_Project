'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  KeyRound, 
  Search, 
  RefreshCw, 
  ShieldCheck, 
  Lock, 
  Unlock, 
  CheckCircle2, 
  XCircle, 
  Copy,
  AlertCircle
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EmployeeCredentialsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [resetModalUser, setResetModalUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const res = await api.get('/credentials');
      setUsers(res.data?.users || []);
    } catch (err: any) {
      console.warn('Failed to load credentials:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCredentials();
  }, []);

  const handleToggleStatus = async (user: any) => {
    const nextStatus = !user.isActive;
    try {
      await api.post(`/credentials/${user.id}/status`, { isActive: nextStatus });
      toast.success(nextStatus ? 'Account activated' : 'Account deactivated');
      fetchCredentials();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to update status');
    }
  };

  const handleUnlock = async (userId: string) => {
    try {
      await api.post(`/credentials/${userId}/unlock`);
      toast.success('Account unlocked');
      fetchCredentials();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to unlock');
    }
  };

  const handleResetPassword = async () => {
    if (!resetModalUser) return;
    setResetting(true);
    try {
      const res = await api.post(`/credentials/${resetModalUser.id}/password/reset`, {
        password: newPassword || undefined,
        mustChangePassword: true,
      });

      setGeneratedPassword(res.data?.temporaryPassword || newPassword || 'Generated');
      toast.success('Password reset successfully!');
      fetchCredentials();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const filteredUsers = users.filter((u) =>
    u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.loginId?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <KeyRound className="w-7 h-7 text-sky-600" />
              Employee Login Credentials
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Manage workforce authentication accounts, password resets, locked statuses, and activation states.
            </p>
          </div>

          <button
            onClick={fetchCredentials}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Accounts
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-6 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            placeholder="Search by name, email, or login ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
        </div>

        {/* Credentials Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Employee / User</th>
                  <th className="px-5 py-3.5">Login ID / Username</th>
                  <th className="px-5 py-3.5">Role</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Security State</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredUsers.map((user) => {
                  const isLocked = Boolean(user.lockedUntil && new Date(user.lockedUntil) > new Date());
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">{user.fullName}</div>
                        <div className="text-xs text-slate-500">{user.email}</div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {user.loginId || user.email?.split('@')[0]}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800">
                          {user.legacyRole || user.roles?.[0]?.name || 'EMPLOYEE'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        {user.isActive ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-400">
                            <XCircle className="w-3.5 h-3.5" /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs">
                        {isLocked ? (
                          <span className="text-red-600 font-semibold flex items-center gap-1">
                            <Lock className="w-3.5 h-3.5" /> Locked
                          </span>
                        ) : user.mustChangePassword ? (
                          <span className="text-amber-600 font-semibold">Change Required</span>
                        ) : (
                          <span className="text-slate-500">Normal</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right space-x-2">
                        {isLocked && (
                          <button
                            onClick={() => handleUnlock(user.id)}
                            className="px-2.5 py-1 text-xs font-semibold rounded bg-amber-500/10 text-amber-600 hover:bg-amber-500/20"
                          >
                            Unlock
                          </button>
                        )}
                        <button
                          onClick={() => {
                            setResetModalUser(user);
                            setNewPassword('');
                            setGeneratedPassword(null);
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded bg-sky-500/10 text-sky-600 hover:bg-sky-500/20"
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`px-2.5 py-1 text-xs font-semibold rounded ${
                            user.isActive
                              ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                          }`}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reset Password Modal */}
        {resetModalUser && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-xl">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">
                Reset Password: {resetModalUser.fullName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Set a specific temporary password or leave blank to automatically generate one.
              </p>

              {generatedPassword ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-lg text-center mb-4">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">New Temporary Password:</p>
                  <p className="text-lg font-mono font-bold text-emerald-900 dark:text-emerald-100 my-1 select-all">
                    {generatedPassword}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedPassword);
                      toast.success('Password copied to clipboard!');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:underline mt-1"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy to Clipboard
                  </button>
                </div>
              ) : (
                <div className="space-y-4 mb-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      New Temporary Password
                    </label>
                    <input
                      type="text"
                      placeholder="Leave blank to auto-generate"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setResetModalUser(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Close
                </button>
                {!generatedPassword && (
                  <button
                    onClick={handleResetPassword}
                    disabled={resetting}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-[#092B69] hover:bg-[#07204f] text-white"
                  >
                    {resetting ? 'Resetting...' : 'Confirm Reset'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
