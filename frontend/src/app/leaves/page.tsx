'use client';

import { useState } from 'react';
import { 
  Calendar, CheckCircle, XCircle, Clock, 
  Plus, AlertCircle, Shield, FileText 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

export default function LeavesManagementPage() {
  const [leaves, setLeaves] = useState([
    {
      id: 'LV-001',
      employee: 'Priya Sharma',
      code: 'TEST-EMP-002',
      type: 'Casual Leave',
      startDate: '2026-10-12',
      endDate: '2026-10-13',
      days: 2,
      reason: 'Family wedding event in Belagavi',
      status: 'PENDING',
    },
    {
      id: 'LV-002',
      employee: 'Suresh Reddy',
      code: 'TEST-EMP-007',
      type: 'Sick Leave',
      startDate: '2026-10-10',
      endDate: '2026-10-10',
      days: 1,
      reason: 'Doctor appointment & medical consultation',
      status: 'PENDING',
    },
    {
      id: 'LV-003',
      employee: 'Amit Patel',
      code: 'TEST-EMP-003',
      type: 'Earned Leave',
      startDate: '2026-09-20',
      endDate: '2026-09-24',
      days: 5,
      reason: 'Annual family festival visit',
      status: 'APPROVED',
    },
  ]);

  const [isApplyModalOpen, setIsApplyModalOpen] = useState(false);
  const [applyForm, setApplyForm] = useState({
    type: 'Casual Leave',
    startDate: '',
    endDate: '',
    reason: '',
  });

  const handleAction = (id: string, action: 'APPROVED' | 'REJECTED') => {
    setLeaves((prev) =>
      prev.map((l) => (l.id === id ? { ...l, status: action } : l))
    );
    toast.success(`Leave request ${action.toLowerCase()}`);
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setLeaves([
      {
        id: `LV-00${leaves.length + 1}`,
        employee: 'Current User',
        code: 'TEST-EMP-001',
        type: applyForm.type,
        startDate: applyForm.startDate,
        endDate: applyForm.endDate,
        days: 1,
        reason: applyForm.reason,
        status: 'PENDING',
      },
      ...leaves,
    ]);
    toast.success('Leave application submitted!');
    setIsApplyModalOpen(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leave Approvals & Balances</h1>
            <p className="text-sm text-gray-500 mt-1">
              Workforce paid leaves, statutory sick days, and approval workflows
            </p>
          </div>

          <button
            onClick={() => setIsApplyModalOpen(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Apply Leave
          </button>
        </div>

        {/* Leave Balances Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase">Casual Leaves (CL)</span>
            <div className="text-2xl font-bold text-gray-900 mt-1">10 / 12 Days Remaining</div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase">Sick Leaves (SL)</span>
            <div className="text-2xl font-bold text-gray-900 mt-1">6 / 7 Days Remaining</div>
          </div>
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
            <span className="text-xs font-semibold text-gray-500 uppercase">Earned Leaves (EL)</span>
            <div className="text-2xl font-bold text-gray-900 mt-1">15 / 15 Days Accrued</div>
          </div>
        </div>

        {/* Leave Requests Queue */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">Leave Requests Queue</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Date Range</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Reason</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leaves.map((l) => (
                  <tr key={l.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      <div>{l.employee}</div>
                      <div className="text-xs text-gray-400 font-mono">{l.code}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-gray-800">{l.type}</td>
                    <td className="py-3 px-4 text-xs font-mono">{l.startDate} to {l.endDate}</td>
                    <td className="py-3 px-4 text-xs font-bold text-gray-900">{l.days} Days</td>
                    <td className="py-3 px-4 text-xs text-gray-600 max-w-xs truncate">{l.reason}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        l.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                        l.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                        'bg-amber-100 text-amber-800'
                      }`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {l.status === 'PENDING' ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleAction(l.id, 'APPROVED')}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 py-1 rounded"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => handleAction(l.id, 'REJECTED')}
                            className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-2.5 py-1 rounded"
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Processed</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
