'use client';

import { useEffect, useState } from 'react';
import { 
  Shield, CheckCircle, AlertCircle, Target, TrendingUp, TrendingDown,
  BarChart2, Users, Eye, AlertTriangle, RefreshCw, Download,
  ChevronLeft, ChevronRight, Calendar, Clock, Filter, Search,
  Building2, Monitor, X
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatTime, getStatusColor } from '@/lib/utils';

interface FaceVerificationRecord {
  id: number;
  employeeId: number;
  employeeCode: string;
  employeeName: string;
  deviceId: number | null;
  deviceName: string | null;
  locationId: number;
  locationCode: string;
  locationName: string;
  attemptedAt: string;
  score: number | null;
  threshold: number | null;
  result: string;
  purpose: string;
  failureReason: string | null;
  captureRef: string | null;
}

interface FaceDashboardStats {
  summary: {
    verifiedToday: number;
    failedToday: number;
    averageMatchPercent: number;
    highestMatchPercent: number;
    lowestMatchPercent: number;
    belowThreshold: number;
    manualVerification: number;
  };
  successRate: { total: number; passed: number; failed: number; rate: number };
  trend: Array<{ date: string; total: number; passed: number; failed: number; avgScore: number }>;
  locationBreakdown: Array<{ code: string; name: string; total: number; passed: number; failed: number; avgScore: number }>;
  deviceBreakdown: Array<{ device: string; total: number; passed: number; failed: number; avgScore: number }>;
}

export default function FaceVerificationDashboardPage() {
  const [stats, setStats] = useState<FaceDashboardStats | null>(null);
  const [records, setRecords] = useState<FaceVerificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationId, setLocationId] = useState<string>('bel');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [resultFilter, setResultFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<FaceVerificationRecord | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    setFromDate(weekAgo);
    setToDate(today);
  }, []);

  const fetchStats = async () => {
    try {
      const res = await api.get<FaceDashboardStats>(`/face-verification/stats/${locationId}?from=${fromDate}&to=${toDate}`);
      setStats(res.data);
    } catch (err) {
      console.error('Failed to fetch face verification stats:', err);
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ locationId });
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      if (resultFilter !== 'all') params.set('result', resultFilter);
      if (search) params.set('search', search);
      
      const res = await api.get<{ rows: FaceVerificationRecord[]; total: number }>(`/face-verification/history?${params}`);
      setRecords(res.data.rows);
    } catch (err) {
      console.error('Failed to fetch face verification records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchRecords();
  }, [locationId, fromDate, toDate, resultFilter, search]);

  const statCards = stats ? [
    { label: 'Verified Today', value: stats.summary.verifiedToday, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Failed Today', value: stats.summary.failedToday, icon: AlertCircle, color: 'bg-red-500' },
    { label: 'Avg Match %', value: `${stats.summary.averageMatchPercent}%`, icon: Target, color: 'bg-blue-500' },
    { label: 'Highest Match', value: `${stats.summary.highestMatchPercent}%`, icon: TrendingUp, color: 'bg-green-500' },
    { label: 'Lowest Match', value: `${stats.summary.lowestMatchPercent}%`, icon: TrendingDown, color: 'bg-amber-500' },
    { label: 'Below Threshold', value: stats.summary.belowThreshold, icon: AlertTriangle, color: 'bg-orange-500' },
    { label: 'Manual Verify', value: stats.summary.manualVerification, icon: Eye, color: 'bg-purple-500' },
    { label: 'Success Rate', value: `${stats.successRate.rate}%`, icon: BarChart2, color: 'bg-indigo-500' },
  ] : [];

  const resultColors: Record<string, string> = {
    passed: 'success',
    failed: 'danger',
    not_enrolled: 'warning',
    error: 'neutral',
  };

  const columns = [
    { key: 'attemptedAt', header: 'Date & Time', render: (row: FaceVerificationRecord) => {
      const d = new Date(row.attemptedAt);
      return <span className="font-mono text-sm">{d.toLocaleDateString()} {d.toLocaleTimeString()}</span>;
    }},
    { key: 'employee', header: 'Employee', render: (row: FaceVerificationRecord) => (
      <div>
        <p className="font-medium">{row.employeeName}</p>
        <p className="text-xs text-gray-500 font-mono">{row.employeeCode}</p>
      </div>
    )},
    { key: 'location', header: 'Location', render: (row: FaceVerificationRecord) => (
      <span className="text-sm">{row.locationName} ({row.locationCode})</span>
    )},
    { key: 'device', header: 'Device', render: (row: FaceVerificationRecord) => (
      <span className="text-sm">{row.deviceName || 'Unknown'}</span>
    )},
    { key: 'purpose', header: 'Purpose', render: (row: FaceVerificationRecord) => (
      <Badge variant="neutral" className="text-xs">{row.purpose}</Badge>
    )},
    { key: 'score', header: 'Match %', render: (row: FaceVerificationRecord) => 
      row.score !== null ? (
        <div className="flex items-center gap-2">
          <span className={`font-mono font-medium ${row.score >= (row.threshold || 0) ? 'text-emerald-600' : 'text-red-600'}`}>
            {row.score.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-500">Threshold: {row.threshold}%</span>
        </div>
      ) : <span className="text-gray-400">—</span>
    },
    { key: 'result', header: 'Result', render: (row: FaceVerificationRecord) => (
      <Badge variant={resultColors[row.result] || 'neutral'} dot>
        {row.result.replace('_', ' ')}
      </Badge>
    )},
    { key: 'failureReason', header: 'Failure Reason', render: (row: FaceVerificationRecord) => 
      row.failureReason ? <span className="text-sm text-red-600">{row.failureReason}</span> : <span className="text-gray-400">—</span>
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Face Verification Dashboard</h1>
            <p className="text-gray-600 mt-1">Real-time face verification analytics, match percentages, and verification history</p>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={[
                { value: 'bel', label: 'Belagavi (BEL)' },
                { value: 'dav', label: 'Davanagere (DAV)' },
                { value: 'shi', label: 'Shivamogga (SHI)' },
              ]}
              className="w-56"
            />
            <Input
              type="date"
              label="From"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-40"
            />
            <Input
              type="date"
              label="To"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-40"
            />
            <Select
              value={resultFilter}
              onChange={(e) => setResultFilter(e.target.value)}
              options={[
                { value: 'all', label: 'All Results' },
                { value: 'passed', label: 'Passed' },
                { value: 'failed', label: 'Failed' },
                { value: 'not_enrolled', label: 'Not Enrolled' },
              ]}
              className="w-40"
            />
            <Input
              placeholder="Search..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48"
            />
            <Button variant="outline" onClick={() => { fetchStats(); fetchRecords(); }} disabled={loading}>
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {locationId && statCards.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
            {statCards.map((stat) => (
              <Card key={stat.label} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="text-2xs font-semibold uppercase tracking-wide text-gray-500">{stat.label}</p>
                  <div className={`p-2 rounded-xl ${stat.color}`}>
                    <stat.icon className="w-4 h-4 text-white" />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-bold text-gray-900">{stat.value}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Trend Chart */}
        {stats?.trend && stats.trend.length > 0 && (
          <Card>
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart2 className="w-5 h-5" /> 7-Day Verification Trend
            </h3>
            <div className="h-64 flex items-end justify-center gap-2 px-2">
              {stats.trend.map((day, idx) => (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                  <div className="w-full flex gap-1 justify-center">
                    <div 
                      className="flex-1 bg-emerald-500 rounded-t transition-all hover:bg-emerald-600"
                      style={{ height: `${Math.max(4, (day.passed / Math.max(1, day.total)) * 100)}%`, minHeight: '4px' }}
                      title={`Passed: ${day.passed}`}
                    />
                    <div 
                      className="flex-1 bg-red-500 rounded-t transition-all hover:bg-red-600"
                      style={{ height: `${Math.max(4, (day.failed / Math.max(1, day.total)) * 100)}%`, minHeight: '4px' }}
                      title={`Failed: ${day.failed}`}
                    />
                  </div>
                  <span className="text-2xs text-gray-500">{new Date(day.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}</span>
                  <span className="text-2xs font-medium text-gray-900">{day.avgScore.toFixed(1)}%</span>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-emerald-500 rounded" /> Passed</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded" /> Failed</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-primary-500 rounded" /> Avg: {stats.trend[stats.trend.length - 1]?.avgScore.toFixed(1)}%</span>
            </div>
          </Card>
        )}

        {/* Breakdown Tables */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {stats?.locationBreakdown && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Building2 className="w-5 h-5" /> By Location
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-2xs text-gray-500 uppercase border-b border-gray-200">
                      <th className="pb-2">Location</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-right">Passed</th>
                      <th className="pb-2 text-right">Failed</th>
                      <th className="pb-2 text-right">Avg %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.locationBreakdown.map((loc) => (
                      <tr key={loc.code} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 font-medium">{loc.name} ({loc.code})</td>
                        <td className="py-2 text-right">{loc.total}</td>
                        <td className="py-2 text-right text-emerald-600">{loc.passed}</td>
                        <td className="py-2 text-right text-red-600">{loc.failed}</td>
                        <td className="py-2 text-right font-mono">{loc.avgScore.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {stats?.deviceBreakdown && (
            <Card>
              <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Monitor className="w-5 h-5" /> By Device
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-2xs text-gray-500 uppercase border-b border-gray-200">
                      <th className="pb-2">Device</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-right">Passed</th>
                      <th className="pb-2 text-right">Failed</th>
                      <th className="pb-2 text-right">Avg %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.deviceBreakdown.map((dev, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 font-medium">{dev.device || 'Unknown'}</td>
                        <td className="py-2 text-right">{dev.total}</td>
                        <td className="py-2 text-right text-emerald-600">{dev.passed}</td>
                        <td className="py-2 text-right text-red-600">{dev.failed}</td>
                        <td className="py-2 text-right font-mono">{dev.avgScore.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>

        {/* Records Table */}
        <Card>
          <DataTable
            columns={columns}
            data={records}
            loading={loading}
            emptyMessage="No face verification records found for the selected filters"
            rowClick={(row) => setSelectedRecord(row)}
            striped
            hoverable
          />
        </Card>

        {/* Record Detail Modal */}
        {selectedRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Face Verification Details</h3>
                <button onClick={() => setSelectedRecord(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xs text-gray-500">Employee</p>
                    <p className="font-medium">{selectedRecord.employeeName} ({selectedRecord.employeeCode})</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Location</p>
                    <p className="font-medium">{selectedRecord.locationName}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Device</p>
                    <p className="font-medium">{selectedRecord.deviceName || 'Unknown'}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Purpose</p>
                    <Badge variant="neutral">{selectedRecord.purpose}</Badge>
                  </div>
                </div>

                <div className="border-t border-gray-200 pt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-2xs text-gray-500">Date & Time</p>
                    <p className="font-medium font-mono">{new Date(selectedRecord.attemptedAt).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Match Score</p>
                    <p className={`font-medium font-mono ${selectedRecord.score !== null && selectedRecord.score >= (selectedRecord.threshold || 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                      {selectedRecord.score !== null ? `${selectedRecord.score.toFixed(2)}%` : 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Threshold</p>
                    <p className="font-medium font-mono">{selectedRecord.threshold}%</p>
                  </div>
                  <div>
                    <p className="text-2xs text-gray-500">Result</p>
                    <Badge variant={resultColors[selectedRecord.result] || 'neutral'} dot>
                      {selectedRecord.result.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>

                {selectedRecord.failureReason && (
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-2xs text-gray-500">Failure Reason</p>
                    <p className="text-red-600 mt-1">{selectedRecord.failureReason}</p>
                  </div>
                )}

                {selectedRecord.captureRef && (
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-2xs text-gray-500">Capture Reference</p>
                    <p className="font-mono text-xs text-gray-600">{selectedRecord.captureRef}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
