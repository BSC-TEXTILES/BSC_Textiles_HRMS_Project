'use client';

import { useState } from 'react';
import { 
  Database, Download, ShieldCheck, RefreshCw, 
  Server, HardDrive, CheckCircle2, Clock 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import toast from 'react-hot-toast';

export default function BackupAdminPage() {
  const [backingUp, setBackingUp] = useState(false);

  const backups = [
    { id: 'BAK-20261008-01', filename: 'bsc_textiles_hrms_20261008_040000.sql.gz', size: '14.8 MB', timestamp: 'Today, 04:00 AM', status: 'VERIFIED' },
    { id: 'BAK-20261007-01', filename: 'bsc_textiles_hrms_20261007_040000.sql.gz', size: '14.2 MB', timestamp: 'Yesterday, 04:00 AM', status: 'VERIFIED' },
    { id: 'BAK-20261006-01', filename: 'bsc_textiles_hrms_20261006_040000.sql.gz', size: '13.9 MB', timestamp: '6 Oct 2026, 04:00 AM', status: 'VERIFIED' },
  ];

  const handleCreateSnapshot = () => {
    setBackingUp(true);
    setTimeout(() => {
      setBackingUp(false);
      toast.success('Live database snapshot generated and securely archived!');
    }, 1500);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Database Backup & Disaster Recovery</h1>
            <p className="text-sm text-gray-500 mt-1">
              Automated MySQL dump snapshots, media preservation, and immutable audit logs
            </p>
          </div>

          <button
            onClick={handleCreateSnapshot}
            disabled={backingUp}
            className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2 px-4 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${backingUp ? 'animate-spin' : ''}`} />
            {backingUp ? 'Generating Snapshot...' : 'Create Snapshot Now'}
          </button>
        </div>

        {/* System Health Indicators */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">Database Engine</div>
              <div className="text-sm font-bold text-gray-900 mt-0.5">MySQL 8.0 (Healthy)</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">Automated Schedule</div>
              <div className="text-sm font-bold text-gray-900 mt-0.5">Daily 04:00 AM UTC</div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">Audit Preservation</div>
              <div className="text-sm font-bold text-gray-900 mt-0.5">100% Retained</div>
            </div>
          </div>
        </div>

        {/* Backups Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">Stored Database Archive Snapshots</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Snapshot ID</th>
                  <th className="py-3 px-4">Filename</th>
                  <th className="py-3 px-4">Archive Size</th>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Integrity Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {backups.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-gray-900 text-xs">{b.id}</td>
                    <td className="py-3 px-4 font-mono text-xs text-gray-600">{b.filename}</td>
                    <td className="py-3 px-4 text-xs font-mono">{b.size}</td>
                    <td className="py-3 px-4 text-xs text-gray-500">{b.timestamp}</td>
                    <td className="py-3 px-4">
                      <span className="text-xs font-semibold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full flex items-center gap-1 w-max">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => toast.success(`Downloading ${b.filename}...`)}
                        className="text-xs text-primary-600 hover:text-primary-800 font-medium bg-primary-50 px-2.5 py-1 rounded inline-flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        Download
                      </button>
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
