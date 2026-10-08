'use client';

import { useState, useEffect } from 'react';
import { 
  Fingerprint, Search, Filter, Plus, Calendar, 
  MapPin, Clock, ShieldCheck, CheckCircle2 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function BiometricPunchesPage() {
  const [punches, setPunches] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const [manualForm, setManualForm] = useState({
    employeeId: '',
    punchType: 'IN',
    timestamp: new Date().toISOString().slice(0, 16),
    reason: 'Biometric device offline backup entry',
  });

  useEffect(() => {
    fetchPunches();
    fetchEmployees();
  }, []);

  const fetchPunches = async () => {
    try {
      setLoading(true);
      const res = await api.get('/attendance?limit=50');
      setPunches(res.data?.attendance || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const fetchEmployees = async () => {
    try {
      const res = await api.get('/employees?limit=50');
      setEmployees(res.data?.employees || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleManualPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.employeeId) {
      toast.error('Select employee');
      return;
    }
    try {
      await api.post('/attendance/punch', {
        employeeId: manualForm.employeeId,
        punchType: manualForm.punchType,
        timestamp: manualForm.timestamp,
        notes: manualForm.reason,
      });
      toast.success('Manual biometric punch recorded and audited!');
      setIsManualModalOpen(false);
      fetchPunches();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to record punch');
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Biometric Punches & Terminal Logs</h1>
            <p className="text-sm text-gray-500 mt-1">
              Time-stamped biometric events, terminal syncs, and audited manual check-in records
            </p>
          </div>

          <button
            onClick={() => setIsManualModalOpen(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Manual Punch Override
          </button>
        </div>

        {/* Table of Punches */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Branch Location</th>
                  <th className="py-3 px-4">Punch In Time</th>
                  <th className="py-3 px-4">Punch Out Time</th>
                  <th className="py-3 px-4">Face Verification</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">Loading punch logs...</td>
                  </tr>
                ) : punches.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-400">No punches found.</td>
                  </tr>
                ) : (
                  punches.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {new Date(p.attendanceDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-gray-900">{p.employee?.fullName}</div>
                        <div className="text-xs text-gray-400 font-mono">{p.employee?.employeeCode}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-600">
                        {p.location?.name || 'Assigned'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs font-semibold text-gray-800">
                        {p.actualLogin ? new Date(p.actualLogin).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-gray-700">
                        {p.actualLogout ? new Date(p.actualLogout).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–'}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          {p.faceMatchPercentage ? `${Number(p.faceMatchPercentage).toFixed(1)}% Match` : 'Verified'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          p.status === 'PRESENT' ? 'bg-emerald-100 text-emerald-800' :
                          p.status === 'LATE' ? 'bg-amber-100 text-amber-800' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manual Punch Modal */}
        {isManualModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
              <h3 className="text-lg font-bold text-gray-900">Manual Punch Entry</h3>
              <p className="text-xs text-gray-500 mt-1">This action is audited and tagged with your manager credentials.</p>

              <form onSubmit={handleManualPunch} className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Select Employee *</label>
                  <select
                    required
                    value={manualForm.employeeId}
                    onChange={(e) => setManualForm({ ...manualForm, employeeId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                  >
                    <option value="">Select Employee</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.fullName} ({emp.employeeCode})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Punch Event *</label>
                    <select
                      value={manualForm.punchType}
                      onChange={(e) => setManualForm({ ...manualForm, punchType: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    >
                      <option value="IN">Punch IN (Arrival)</option>
                      <option value="OUT">Punch OUT (Departure)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Punch Time *</label>
                    <input
                      type="datetime-local"
                      required
                      value={manualForm.timestamp}
                      onChange={(e) => setManualForm({ ...manualForm, timestamp: e.target.value })}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Justification Reason *</label>
                  <input
                    type="text"
                    required
                    value={manualForm.reason}
                    onChange={(e) => setManualForm({ ...manualForm, reason: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-3 border-t border-gray-100">
                  <button type="button" onClick={() => setIsManualModalOpen(false)} className="px-4 py-2 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">
                    Cancel
                  </button>
                  <button type="submit" className="px-5 py-2 text-xs bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium">
                    Record Punch
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
