'use client';

import { useState, useEffect } from 'react';
import { 
  FileBarChart, Download, Printer, Filter, 
  Shield, QrCode, DollarSign, Eye, Calendar, MapPin 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import toast from 'react-hot-toast';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState<'attendance' | 'face' | 'qr' | 'incentives' | 'payroll'>('attendance');
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLocations();
  }, []);

  // Deep-link support: /reports?tab=qr
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    if (t && ['attendance', 'face', 'qr', 'incentives', 'payroll'].includes(t)) {
      setActiveTab(t as any);
    }
  }, []);

  useEffect(() => {
    fetchReportData();
  }, [activeTab, selectedLocation]);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/locations/all');
      setLocations(res.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReportData = async () => {
    try {
      setLoading(true);
      let rows: any[] = [];
      if (activeTab === 'attendance') {
        const res = await api.get(selectedLocation ? `/reports/attendance-summary?locationId=${selectedLocation}` : '/reports/attendance-summary');
        rows = Array.isArray(res.data) ? res.data : (res.data?.summary || res.data?.data || []);
      } else if (activeTab === 'face') {
        const res = await api.get(selectedLocation ? `/reports/face-verification-accuracy?locationId=${selectedLocation}` : '/reports/face-verification-accuracy');
        rows = Array.isArray(res.data) ? res.data : (res.data?.records || res.data?.rows || res.data?.data || []);
      } else if (activeTab === 'qr') {
        const res = await api.get(selectedLocation ? `/reports/qr-scans-summary?locationId=${selectedLocation}` : '/reports/qr-scans-summary');
        rows = Array.isArray(res.data) ? res.data : (res.data?.records || res.data?.scans || res.data?.data || []);
      } else if (activeTab === 'incentives') {
        const res = await api.get(selectedLocation ? `/reports/incentives-summary?locationId=${selectedLocation}` : '/reports/incentives-summary');
        rows = Array.isArray(res.data) ? res.data : (res.data?.summary || res.data?.records || res.data?.data || []);
      } else if (activeTab === 'payroll') {
        const res = await api.get('/payroll/runs');
        rows = res.data?.runs || (Array.isArray(res.data) ? res.data : []);
      }
      setData(rows);
    } catch (e) {
      console.error('Fetch report error:', e);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (data.length === 0) {
      toast.error('No report data to export');
      return;
    }
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map((d) => Object.values(d).join(','));
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `BSC_Textiles_${activeTab}_report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report exported to CSV!');
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Governance & Operations Reports</h1>
            <p className="text-sm text-gray-500 mt-1">
              Authoritative reporting engine with audit-compliant exports (CSV, Print)
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm"
            >
              <Printer className="w-4 h-4" />
              Print
            </button>
            <button
              onClick={handleExportCSV}
              className="bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
          {[
            { id: 'attendance', label: 'Attendance Summary' },
            { id: 'face', label: 'Face Verification Accuracy' },
            { id: 'qr', label: 'QR Scan Fraud & Usage' },
            { id: 'incentives', label: 'Incentives & Overtime' },
            { id: 'payroll', label: 'Payroll Wage Runs' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                activeTab === tab.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Report Content Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <h3 className="font-bold text-gray-900 capitalize">{activeTab} Report Data</h3>
            <span className="text-xs text-gray-500">{data.length} Records Found</span>
          </div>

          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center text-gray-400">Loading report metrics...</div>
            ) : data.length === 0 ? (
              <div className="p-12 text-center text-gray-400">No data found for this report period.</div>
            ) : (
              <table className="w-full text-left text-xs text-gray-600">
                <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-700 border-b border-gray-200">
                  <tr>
                    {Object.keys(data[0]).map((key) => (
                      <th key={key} className="py-3 px-4 capitalize">{key.replace(/([A-Z])/g, ' $1')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.map((row, idx) => (
                    <tr key={idx} className="hover:bg-gray-50/80">
                      {Object.values(row).map((val: any, vIdx) => (
                        <td key={vIdx} className="py-3 px-4 font-mono">
                          {typeof val === 'object' ? JSON.stringify(val).slice(0, 25) : String(val)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
