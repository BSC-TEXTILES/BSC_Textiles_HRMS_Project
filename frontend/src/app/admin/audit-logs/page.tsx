'use client';

import { useState, useEffect } from 'react';
import { 
  ShieldCheck, Search, Filter, RefreshCw, 
  Clock, User, MapPin, Eye 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<any>(null);

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const url = actionFilter ? `/audit?action=${actionFilter}&limit=50` : '/audit?limit=50';
      const res = await api.get(url);
      setLogs(res.data?.logs || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Logs & Security Trail</h1>
            <p className="text-sm text-gray-500 mt-1">
              Immutable forensic trail of user actions, credential authentications, and policy modifications
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">All Actions (CREATE, UPDATE, APPROVE...)</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="APPROVE">APPROVE</option>
              <option value="LOGIN">LOGIN</option>
              <option value="SCAN">SCAN</option>
            </select>
          </div>
        </div>

        {/* Logs Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Entity / Module</th>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Entity ID</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-400">Loading audit records...</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={6} className="py-12 text-center text-gray-400">No audit records found.</td></tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 text-xs font-mono text-gray-500">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          log.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' :
                          log.action === 'APPROVE' ? 'bg-blue-100 text-blue-800' :
                          log.action === 'UPDATE' ? 'bg-amber-100 text-amber-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-gray-900 text-xs">
                        {log.entityType}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-medium text-gray-900">{log.user?.fullName || 'System'}</div>
                        <div className="text-[10px] text-gray-400">{log.user?.email}</div>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono text-gray-500 truncate max-w-[120px]">
                        {log.entityId}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-xs text-primary-600 hover:text-primary-800 font-medium bg-primary-50 px-2.5 py-1 rounded"
                        >
                          View Diff
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Modal Diff */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
              <h3 className="text-lg font-bold text-gray-900">Audit Record Details</h3>
              <p className="text-xs text-gray-500 mt-0.5">Event ID: {selectedLog.id}</p>

              <div className="mt-4 space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-gray-700 block mb-1">Payload / New Values:</span>
                  <pre className="p-3 bg-gray-900 text-emerald-400 rounded-lg overflow-x-auto text-[11px] font-mono">
                    {JSON.stringify(selectedLog.newValue || {}, null, 2)}
                  </pre>
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="bg-gray-900 hover:bg-black text-white text-xs px-4 py-2 rounded-lg font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
