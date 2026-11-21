'use client';

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  Lock, 
  Search, 
  RefreshCw, 
  KeyRound, 
  ShieldAlert, 
  Copy, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function ResetEmployeeCredentialsPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [customPassword, setCustomPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resultPassword, setResultPassword] = useState<string | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/credentials');
      setUsers(res.data?.users || []);
    } catch (err: any) {
      console.warn('Failed to load accounts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleReset = async (user: any) => {
    setSelectedUser(user);
    setCustomPassword('');
    setResultPassword(null);
  };

  const executeReset = async () => {
    if (!selectedUser) return;
    setSubmitting(true);
    try {
      const res = await api.post(`/credentials/${selectedUser.id}/password/reset`, {
        password: customPassword || undefined,
        mustChangePassword: true,
        notifyUser: true,
      });

      const pass = res.data?.temporaryPassword || customPassword || 'Updated';
      setResultPassword(pass);
      toast.success(`Password reset for ${selectedUser.fullName}!`);
      fetchUsers();
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to execute password reset');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = users.filter((u) =>
    u.fullName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.loginId?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <DashboardLayout>
      <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Lock className="w-7 h-7 text-amber-600" />
              Reset Employee Credentials
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Authorized HR & Admin single-use password resets with automatic audit logging and password expiration policies.
            </p>
          </div>

          <button
            onClick={fetchUsers}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-xs font-semibold text-slate-700 dark:text-slate-300"
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
            placeholder="Search by name, email or login ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
          />
        </div>

        {/* List */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 text-xs uppercase font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-5 py-3.5">Employee Name</th>
                  <th className="px-5 py-3.5">Login ID</th>
                  <th className="px-5 py-3.5">Email</th>
                  <th className="px-5 py-3.5">Password State</th>
                  <th className="px-5 py-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-5 py-3.5 font-semibold text-slate-900 dark:text-white">
                      {u.fullName}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-xs text-slate-600 dark:text-slate-300">
                      {u.loginId || u.email?.split('@')[0]}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {u.email}
                    </td>
                    <td className="px-5 py-3.5 text-xs">
                      {u.mustChangePassword ? (
                        <span className="text-amber-600 font-semibold">Change Required</span>
                      ) : (
                        <span className="text-emerald-600 font-semibold">Normal</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => handleReset(u)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 inline-flex items-center gap-1.5"
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reset Dialog */}
        {selectedUser && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
                Reset Password: {selectedUser.fullName}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                Generate a secure temporary password or specify custom credentials.
              </p>

              {resultPassword ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-xl text-center mb-5">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300 font-semibold">New Temporary Password:</p>
                  <p className="text-xl font-mono font-bold text-emerald-900 dark:text-emerald-100 my-2 select-all">
                    {resultPassword}
                  </p>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(resultPassword);
                      toast.success('Password copied to clipboard!');
                    }}
                    className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 hover:underline"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Password
                  </button>
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Custom Password (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Leave blank to auto-generate"
                      value={customPassword}
                      onChange={(e) => setCustomPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setSelectedUser(null)}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                >
                  Close
                </button>
                {!resultPassword && (
                  <button
                    onClick={executeReset}
                    disabled={submitting}
                    className="px-5 py-2 text-xs font-semibold rounded-lg bg-amber-600 hover:bg-amber-500 text-white"
                  >
                    {submitting ? 'Resetting...' : 'Confirm Reset'}
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
