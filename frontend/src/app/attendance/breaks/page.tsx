'use client';

import { useState, useEffect } from 'react';
import { 
  Coffee, Utensils, Clock, AlertTriangle, 
  CheckCircle, Search, Filter, RefreshCw 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';

export default function AttendanceBreaksPage() {
  const [breaks, setBreaks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Deep-link support: /attendance/breaks?breakType=LUNCH&status=ACTIVE
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get('breakType');
    const s = q.get('status');
    if (t) setFilterType(t);
    if (s) setFilterStatus(s);
  }, []);

  useEffect(() => {
    fetchBreaks();
  }, [filterType, filterStatus]);

  const fetchBreaks = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterType) params.append('breakType', filterType);
      if (filterStatus) params.append('status', filterStatus);

      const res = await api.get(`/breaks?${params.toString()}&limit=50`);
      setBreaks(res.data?.breaks || []);
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
            <h1 className="text-2xl font-bold text-gray-900">Lunch & Break Tracker</h1>
            <p className="text-sm text-gray-500 mt-1">
              Historical break records, overage tracking, and policy compliance audits
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">All Break Types</option>
              <option value="LUNCH">Lunch Break</option>
              <option value="TEA">Tea Break</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
            >
              <option value="">All Statuses</option>
              <option value="ACTIVE">Active Session</option>
              <option value="COMPLETED">Completed</option>
              <option value="EXCEEDED">Exceeded Policy</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Break Type</th>
                  <th className="py-3 px-4">Start Time</th>
                  <th className="py-3 px-4">End Time</th>
                  <th className="py-3 px-4">Allowed</th>
                  <th className="py-3 px-4">Actual / Excess</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400">Loading break history...</td></tr>
                ) : breaks.length === 0 ? (
                  <tr><td colSpan={8} className="py-12 text-center text-gray-400">No break records found.</td></tr>
                ) : (
                  breaks.map((b) => (
                    <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {new Date(b.breakDate || b.startTime).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">{b.employee?.fullName}</div>
                        <div className="text-xs text-gray-400 font-mono">{b.employee?.employeeCode}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded ${
                          b.breakType === 'LUNCH' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {b.breakType === 'LUNCH' ? <Utensils className="w-3 h-3" /> : <Coffee className="w-3 h-3" />}
                          {b.breakType}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs font-mono">
                        {b.startTime ? new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '–'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono">
                        {b.endTime ? new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'In Progress'}
                      </td>
                      <td className="py-3 px-4 text-xs font-mono">{b.allowedDuration} mins</td>
                      <td className="py-3 px-4 text-xs font-mono">
                        {b.excessDuration ? (
                          <span className="text-red-600 font-bold">+{b.excessDuration}m over</span>
                        ) : (
                          <span className="text-emerald-600">On Time</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                          b.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                          b.status === 'ACTIVE' ? 'bg-amber-100 text-amber-800 animate-pulse' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {b.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
