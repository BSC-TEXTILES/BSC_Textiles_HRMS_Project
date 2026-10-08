'use client';

import { useState, useEffect } from 'react';
import { 
  ClipboardCheck, CheckCircle, XCircle, Clock, 
  User, MapPin, AlertCircle, RefreshCw 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function PunchCorrectionsPage() {
  const [corrections, setCorrections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Synthetic sample correction requests
  const sampleRequests = [
    {
      id: 'CORR-001',
      employee: { fullName: 'Priya Sharma', employeeCode: 'TEST-EMP-002', location: 'Belagavi' },
      date: '2026-10-06',
      originalLogin: '09:48 AM',
      requestedLogin: '09:30 AM',
      reason: 'Biometric fingerprint reader timeout during heavy festival rush at entrance gate.',
      status: 'PENDING',
    },
    {
      id: 'CORR-002',
      employee: { fullName: 'Suresh Reddy', employeeCode: 'TEST-EMP-007', location: 'Davanagere' },
      date: '2026-10-05',
      originalLogin: '10:12 AM',
      requestedLogin: '09:30 AM',
      reason: 'Assisted regional stock transfer lorry unloading at Davanagere rear logistics dock.',
      status: 'PENDING',
    },
    {
      id: 'CORR-003',
      employee: { fullName: 'Sneha Rao', employeeCode: 'TEST-EMP-014', location: 'Shivamogga' },
      date: '2026-10-04',
      originalLogin: '–',
      requestedLogin: '09:28 AM',
      reason: 'Morning power outage before generator synchronization at retail store.',
      status: 'APPROVED',
    },
  ];

  const [items, setItems] = useState(sampleRequests);

  const handleAction = (id: string, action: 'APPROVE' | 'REJECT') => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' } : item
      )
    );
    toast.success(`Correction request ${action === 'APPROVE' ? 'approved' : 'rejected'}`);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Attendance Punch Corrections</h1>
          <p className="text-sm text-gray-500 mt-1">
            Managerial review and approval workflow for missing or disputed attendance timestamps
          </p>
        </div>

        <div className="space-y-4">
          {items.map((req) => (
            <div key={req.id} className="bg-white rounded-xl p-5 border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-900 text-base">{req.employee.fullName}</span>
                  <span className="text-xs font-mono text-gray-500">({req.employee.employeeCode})</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded font-medium">
                    {req.employee.location}
                  </span>
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                    req.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' :
                    req.status === 'REJECTED' ? 'bg-red-100 text-red-800' :
                    'bg-amber-100 text-amber-800'
                  }`}>
                    {req.status}
                  </span>
                </div>

                <div className="text-xs text-gray-500 flex items-center gap-4 pt-1">
                  <span>Date: <strong>{req.date}</strong></span>
                  <span>Recorded: <strong className="text-red-500">{req.originalLogin}</strong></span>
                  <span>Requested: <strong className="text-emerald-600">{req.requestedLogin}</strong></span>
                </div>

                <p className="text-xs text-gray-700 bg-gray-50 p-2.5 rounded-lg mt-2 italic">
                  "{req.reason}"
                </p>
              </div>

              {req.status === 'PENDING' ? (
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleAction(req.id, 'APPROVE')}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors shadow-sm"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Approve
                  </button>
                  <button
                    onClick={() => handleAction(req.id, 'REJECT')}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    Reject
                  </button>
                </div>
              ) : (
                <span className="text-xs text-gray-400 font-medium">Resolution Audited</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
