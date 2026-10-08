'use client';

import { useEffect, useState } from 'react';
import { 
  Calculator, Search, User, Clock, Calendar, Download,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Coffee, Utensils, Activity, DollarSign, Settings,
  RefreshCw, Eye, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { formatCurrency, formatTime } from '@/lib/utils';

interface AttendanceCalculation {
  employee: { id: number; code: string; name: string; gender: string; locationId: number; shiftId: number | null };
  date: string;
  scheduledLogin: string;
  scheduledLogout: string;
  actualLogin: string | null;
  actualLogout: string | null;
  graceMinutes: number;
  lateThresholdMinutes: number;
  graceEndTime: string;
  lateThresholdTime: string;
  earlyLoginSeconds: number;
  earlyLoginIncentive: number;
  lateLoginSeconds: number;
  latePenalty: number;
  overtimeSeconds: number;
  overtimeIncentive: number;
  totalWorkingSeconds: number;
  totalBreakSeconds: number;
  effectiveWorkingSeconds: number;
  lunchBreakSeconds: number;
  teaBreakSeconds: number;
  lunchDurationAllowed: number;
  teaDurationAllowed: number;
  attendanceStatus: string;
  breaks: Array<{ id: number; breakTypeId: number; startTime: string; endTime: string | null; durationMinutes: number; exceededMinutes: number; status: string }>;
  faceVerifications: Array<{ score: number | null; result: string; threshold: number | null; attemptedAt: string }>;
  qrScans: Array<{ purpose: string; result: string; scannedAt: string }>;
  events: Array<{ eventType: string; eventSubtype?: string | null; actualTime: string; durationSeconds: number | null; amount: number | null; calculationBasis: string | null; source?: string | null }>;
}

interface AttendanceRules {
  login_time: string;
  logout_time: string;
  grace_minutes: number;
  late_threshold_minutes: number;
  early_login_incentive_enabled: boolean;
  early_login_rate_per_second: number;
  early_login_max_daily: number | null;
  early_login_max_monthly: number | null;
  late_penalty_enabled: boolean;
  late_penalty_rate_per_second: number;
  late_penalty_max_daily: number | null;
  late_penalty_max_monthly: number | null;
  overtime_incentive_enabled: boolean;
  overtime_rate_per_second: number | null;
  early_logout_penalty_enabled: boolean;
  early_logout_rate_per_second: number | null;
  lunch_duration_minutes: number;
  tea_duration_minutes: number;
  male_lunch_minutes: number;
  female_lunch_minutes: number;
  male_tea_minutes: number;
  female_tea_minutes: number;
  face_verification_threshold: number;
  qr_daily_token_enabled: boolean;
  qr_one_time_scan: boolean;
  scanner_roles: string[];
}

export default function AttendanceCalculationPage() {
  const [calculation, setCalculation] = useState<AttendanceCalculation | null>(null);
  const [rules, setRules] = useState<AttendanceRules | null>(null);
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [locationId, setLocationId] = useState<string>('');
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [editingRules, setEditingRules] = useState<Partial<AttendanceRules>>({});
  const [activeTab, setActiveTab] = useState<'overview' | 'timeline' | 'breaks' | 'events' | 'face' | 'qr'>('overview');

  const fetchCalculation = async () => {
    if (!employeeId || !date) return;
    setLoading(true);
    try {
      const [calcRes, summaryRes, rulesRes] = await Promise.all([
        api.get<AttendanceCalculation>(`/attendance/calculate/${employeeId}/${date}`),
        api.get(`/attendance/summary/${employeeId}/${date}`),
        api.get<AttendanceRules>(`/attendance/rules/${locationId}`).catch(() => ({ data: null })),
      ]);
      setCalculation(calcRes.data);
      if (rulesRes.data) setRules(rulesRes.data);
    } catch (err) {
      console.error('Failed to fetch calculation:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRules = async () => {
    if (!locationId) return;
    try {
      const res = await api.get<AttendanceRules>(`/attendance/rules/${locationId}`);
      setRules(res.data);
    } catch (err) {
      console.error('Failed to fetch rules:', err);
    }
  };

  const saveRules = async () => {
    try {
      await api.put(`/attendance/rules/${locationId}`, editingRules);
      setRules(prev => prev ? { ...prev, ...editingRules } : null);
      setShowRulesModal(false);
      fetchRules();
    } catch (err) {
      console.error('Failed to save rules:', err);
    }
  };

  const formatSeconds = (seconds: number) => {
    if (!seconds) return '00:00:00';
    const sign = seconds < 0 ? '-' : '';
    const abs = Math.abs(seconds);
    const h = Math.floor(abs / 3600).toString().padStart(2, '0');
    const m = Math.floor((abs % 3600) / 60).toString().padStart(2, '0');
    const s = (abs % 60).toString().padStart(2, '0');
    return `${sign}${h}:${m}:${s}`;
  };

  const formatTimeStr = (isoString: string | null) => {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const overviewCards = calculation && rules ? [
    { label: 'Scheduled Login', value: formatTimeStr(calculation.scheduledLogin), icon: Clock, color: 'bg-blue-500' },
    { label: 'Actual Login', value: formatTimeStr(calculation.actualLogin), icon: User, color: calculation.earlyLoginSeconds > 0 ? 'bg-emerald-500' : calculation.lateLoginSeconds > 0 ? 'bg-red-500' : 'bg-blue-500' },
    { label: 'Scheduled Logout', value: formatTimeStr(calculation.scheduledLogout), icon: Clock, color: 'bg-blue-500' },
    { label: 'Actual Logout', value: formatTimeStr(calculation.actualLogout), icon: User, color: 'bg-blue-500' },
    { label: 'Early Login', value: formatSeconds(calculation.earlyLoginSeconds), icon: TrendingUp, color: calculation.earlyLoginSeconds > 0 ? 'bg-emerald-500' : 'bg-slate-400', incentive: `₹${calculation.earlyLoginIncentive}` },
    { label: 'Late Login', value: formatSeconds(calculation.lateLoginSeconds), icon: TrendingDown, color: calculation.lateLoginSeconds > 0 ? 'bg-red-500' : 'bg-slate-400', penalty: `₹${calculation.latePenalty}` },
    { label: 'Overtime', value: formatSeconds(calculation.overtimeSeconds), icon: Activity, color: calculation.overtimeSeconds > 0 ? 'bg-amber-500' : 'bg-slate-400', incentive: `₹${calculation.overtimeIncentive}` },
    { label: 'Total Working', value: formatSeconds(calculation.totalWorkingSeconds), icon: Clock, color: 'bg-indigo-500' },
    { label: 'Break Time', value: formatSeconds(calculation.totalBreakSeconds), icon: Coffee, color: 'bg-orange-500' },
    { label: 'Effective Working', value: formatSeconds(calculation.effectiveWorkingSeconds), icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Lunch Break', value: `${formatSeconds(calculation.lunchBreakSeconds)} / ${formatSeconds(calculation.lunchDurationAllowed)}`, icon: Utensils, color: 'bg-blue-400' },
    { label: 'Tea Break', value: `${formatSeconds(calculation.teaBreakSeconds)} / ${formatSeconds(calculation.teaDurationAllowed)}`, icon: Coffee, color: 'bg-orange-400' },
  ] : [];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Attendance Calculation Engine</h1>
            <p className="text-gray-600 mt-1">Transparent, second-precision attendance calculations with early/late incentives, overtime, and break tracking.</p>
          </div>
          <div className="flex items-center gap-2">
            {rules && <Button variant="outline" onClick={() => { setEditingRules({...rules}); setShowRulesModal(true); }}>
              <Settings className="w-4 h-4 mr-2" /> Configure Rules
            </Button>}
          </div>
        </div>

        {/* Input Form */}
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Select
              label="Location"
              value={locationId}
              onChange={(e) => { setLocationId(e.target.value); fetchRules(); }}
              options={[
                { value: '', label: 'Select Location' },
                { value: 'bel', label: 'Belagavi' },
                { value: 'dav', label: 'Davanagere' },
                { value: 'shi', label: 'Shivamogga' },
              ]}
            />
            <Input
              label="Employee ID"
              type="number"
              placeholder="e.g. 123"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            />
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <Button onClick={fetchCalculation} disabled={loading || !employeeId || !date} className="self-end">
              <Calculator className="w-4 h-4 mr-2" /> Calculate
            </Button>
          </div>
        </Card>

        {loading && <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent"></div></div>}

        {calculation && (
          <>
            {/* Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {overviewCards.map((card, index) => (
                <Card key={index} className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-2xs font-semibold uppercase tracking-wide text-gray-500">{card.label}</p>
                    <div className={`p-2 rounded-xl ${card.color}`}>
                      <card.icon className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <p className="mt-2 text-xl font-bold text-gray-900 font-mono">{card.value}</p>
                  {(card as any).incentive && (
                    <p className="text-xs text-emerald-600 mt-1">Incentive: {(card as any).incentive}</p>
                  )}
                  {(card as any).penalty && (
                    <p className="text-xs text-red-600 mt-1">Penalty: {(card as any).penalty}</p>
                  )}
                </Card>
              ))}
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 mb-4">
              <nav className="flex gap-1" aria-label="Attendance detail tabs">
                {['overview', 'timeline', 'breaks', 'events', 'face', 'qr'].map(tab => (
                  <Button
                    key={tab}
                    variant="ghost"
                    size="sm"
                    className={activeTab === tab ? 'border-b-2 border-primary-600 text-primary-600' : 'text-gray-500'}
                    onClick={() => setActiveTab(tab as any)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Button>
                ))}
              </nav>
            </div>

            {/* Tab Content */}
            {activeTab === 'overview' && calculation && (
              <div className="space-y-6">
                {/* Calculation Transparency */}
                <Card className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Calculator className="w-5 h-5" /> Calculation Transparency
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">All calculations are based on server timestamps with configurable rules. HR can inspect exactly how each amount was derived.</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { title: 'Early Login Incentive', details: { seconds: calculation.earlyLoginSeconds, rate: rules?.early_login_rate_per_second || 1, amount: calculation.earlyLoginIncentive }, color: 'emerald' },
                      { title: 'Late Login Penalty', details: { seconds: calculation.lateLoginSeconds, rate: rules?.late_penalty_rate_per_second || 1, amount: calculation.latePenalty }, color: 'red' },
                      { title: 'Overtime Incentive', details: { seconds: calculation.overtimeSeconds, rate: rules?.overtime_rate_per_second || 1.5, amount: calculation.overtimeIncentive }, color: 'amber' },
                    ].map((item, idx) => (
                      <div key={idx} className={`p-4 rounded-lg border-l-4 border-${item.color}-500 bg-${item.color}-50`}>
                        <h4 className="font-medium text-${item.color}-800 mb-2">{item.title}</h4>
                        <p className="text-sm text-${item.color}-700">Rate: ₹{item.details.rate}/sec</p>
                        <p className="text-sm text-${item.color}-700">Time: {item.details.seconds}s</p>
                        <p className="text-sm text-${item.color}-700">Calculation: {item.details.seconds} × {item.details.rate}</p>
                        <p className="text-lg font-bold text-${item.color}-800 mt-1">Amount: ₹{item.details.amount}</p>
                      </div>
                    ))}
                  </div>
                </Card>

                {/* Grace Period Info */}
                <Card className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Grace Period Configuration</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div><p className="text-gray-500">Scheduled Login</p><p className="font-mono font-medium">{calculation.scheduledLogin.split('T')[1]?.slice(0,8)}</p></div>
                    <div><p className="text-gray-500">Grace Period</p><p className="font-mono font-medium">{calculation.graceMinutes} minutes</p></div>
                    <div><p className="text-gray-500">Grace Ends</p><p className="font-mono font-medium">{calculation.graceEndTime.split('T')[1]?.slice(0,8)}</p></div>
                    <div><p className="text-gray-500">Late Threshold</p><p className="font-mono font-medium">{calculation.lateThresholdMinutes} minutes</p></div>
                    <div><p className="text-gray-500">Late Threshold Time</p><p className="font-mono font-medium">{calculation.lateThresholdTime.split('T')[1]?.slice(0,8)}</p></div>
                    <div><p className="text-gray-500">Scheduled Logout</p><p className="font-mono font-medium">{calculation.scheduledLogout.split('T')[1]?.slice(0,8)}</p></div>
                  </div>
                </Card>
              </div>
            )}

            {activeTab === 'timeline' && calculation && (
              <Card className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Attendance Timeline</h3>
                <div className="space-y-3">
                  {calculation.events.map((event, idx) => (
                    <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border-l-4 border-primary-500">
                      <div className="w-10 text-center text-xs text-gray-500 font-mono">
                        {new Date(event.actualTime).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium capitalize">{event.eventType.replace('_', ' ')}</p>
                        {event.durationSeconds && <p className="text-sm text-gray-500">Duration: {formatSeconds(event.durationSeconds)}</p>}
                        {event.amount !== null && <p className="text-sm text-emerald-600">Amount: ₹{event.amount}</p>}
                        {event.calculationBasis && <p className="text-xs text-gray-400">Basis: {event.calculationBasis}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {activeTab === 'breaks' && calculation && (
              <Card className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Break Sessions</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-2xs text-gray-500 uppercase border-b">
                        <th className="pb-2">Type</th>
                        <th className="pb-2">Start</th>
                        <th className="pb-2">End</th>
                        <th className="pb-2">Duration</th>
                        <th className="pb-2">Allowed</th>
                        <th className="pb-2">Exceeded</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculation.breaks.map((br, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="py-2 capitalize">{br.status === 'active' ? 'Ongoing' : 'Break'}</td>
                          <td className="py-2">{br.startTime ? new Date(br.startTime).toLocaleTimeString() : '—'}</td>
                          <td className="py-2">{br.endTime ? new Date(br.endTime).toLocaleTimeString() : 'Ongoing'}</td>
                          <td className="py-2">{br.durationMinutes}m</td>
                          <td className="py-2">{br.exceededMinutes > 0 ? br.durationMinutes - br.exceededMinutes : br.durationMinutes}m</td>
                          <td className="py-2">{br.exceededMinutes > 0 ? <span className="text-red-600">+{br.exceededMinutes}m</span> : '—'}</td>
                          <td className="py-2"><Badge variant={br.status === 'completed' ? 'success' : br.status === 'active' ? 'info' : br.status === 'exceeded' ? 'danger' : 'neutral'}>{br.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === 'events' && calculation && (
              <Card className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">All Attendance Events</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-2xs text-gray-500 uppercase border-b">
                        <th className="pb-2">Time</th>
                        <th className="pb-2">Event</th>
                        <th className="pb-2">Subtype</th>
                        <th className="pb-2">Duration</th>
                        <th className="pb-2">Amount</th>
                        <th className="pb-2">Basis</th>
                        <th className="pb-2">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculation.events.map((event, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50">
                          <td className="py-2 font-mono">{new Date(event.actualTime).toLocaleTimeString()}</td>
                          <td className="py-2 capitalize">{event.eventType.replace('_', ' ')}</td>
                          <td className="py-2">{event.eventSubtype || '—'}</td>
                          <td className="py-2">{event.durationSeconds ? formatSeconds(event.durationSeconds) : '—'}</td>
                          <td className="py-2">{event.amount !== null ? `₹${event.amount}` : '—'}</td>
                          <td className="py-2 text-gray-500">{event.calculationBasis || '—'}</td>
                          <td className="py-2"><Badge variant="neutral" className="text-xs">{event.source}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            {activeTab === 'face' && calculation && (
              <Card className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">Face Verifications</h3>
                <div className="space-y-2">
                  {calculation.faceVerifications.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No face verifications for this date</p>
                  ) : (
                    calculation.faceVerifications.map((fv, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant={fv.result === 'passed' ? 'success' : 'danger'} dot>
                            {fv.result}
                          </Badge>
                          <div>
                            <p className="font-medium">Face Verification</p>
                            <p className="text-xs text-gray-500">{new Date(fv.attemptedAt).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={`font-mono font-medium ${fv.score !== null && fv.score >= (fv.threshold || 0) ? 'text-emerald-600' : 'text-red-600'}`}>
                            {fv.score !== null ? `${fv.score.toFixed(2)}%` : 'N/A'}
                          </p>
                          <p className="text-xs text-gray-500">Threshold: {fv.threshold}%</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}

            {activeTab === 'qr' && calculation && (
              <Card className="p-4">
                <h3 className="font-semibold text-gray-900 mb-4">QR Scans</h3>
                <div className="space-y-2">
                  {calculation.qrScans.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No QR scans for this date</p>
                  ) : (
                    calculation.qrScans.map((qr, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant={qr.result === 'success' ? 'success' : 'danger'} dot>
                            {qr.result}
                          </Badge>
                          <div>
                            <p className="font-medium capitalize">{qr.purpose.replace('_', ' ')}</p>
                            <p className="text-xs text-gray-500">{new Date(qr.scannedAt).toLocaleString()}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            )}

            {/* Rules Modal */}
            {showRulesModal && rules && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
                <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                  <div className="p-4 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">Attendance Rules Configuration</h3>
                    <button onClick={() => setShowRulesModal(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  <form onSubmit={saveRules} className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <Input label="Login Time" type="time" value={editingRules.login_time || rules.login_time} onChange={(e) => setEditingRules({...editingRules, login_time: e.target.value})} />
                      <Input label="Logout Time" type="time" value={editingRules.logout_time || rules.logout_time} onChange={(e) => setEditingRules({...editingRules, logout_time: e.target.value})} />
                      <Input label="Grace Minutes" type="number" value={editingRules.grace_minutes ?? rules.grace_minutes} onChange={(e) => setEditingRules({...editingRules, grace_minutes: Number(e.target.value)})} />
                      <Input label="Late Threshold Minutes" type="number" value={editingRules.late_threshold_minutes ?? rules.late_threshold_minutes} onChange={(e) => setEditingRules({...editingRules, late_threshold_minutes: Number(e.target.value)})} />
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-semibold mb-3">Early Login Incentive</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={editingRules.early_login_incentive_enabled ?? rules.early_login_incentive_enabled} onChange={(e) => setEditingRules({...editingRules, early_login_incentive_enabled: e.target.checked})} className="h-4 w-4" />
                          <span>Enabled</span>
                        </label>
                        <Input label="Rate per Second (₹)" type="number" step="0.01" value={editingRules.early_login_rate_per_second ?? rules.early_login_rate_per_second} onChange={(e) => setEditingRules({...editingRules, early_login_rate_per_second: Number(e.target.value)})} />
                        <Input label="Max Daily (₹)" type="number" step="0.01" value={editingRules.early_login_max_daily ?? (rules.early_login_max_daily || '')} onChange={(e) => setEditingRules({...editingRules, early_login_max_daily: e.target.value ? Number(e.target.value) : null})} />
                        <Input label="Max Monthly (₹)" type="number" step="0.01" value={editingRules.early_login_max_monthly ?? (rules.early_login_max_monthly || '')} onChange={(e) => setEditingRules({...editingRules, early_login_max_monthly: e.target.value ? Number(e.target.value) : null})} />
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-semibold mb-3">Late Login Penalty</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={editingRules.late_penalty_enabled ?? rules.late_penalty_enabled} onChange={(e) => setEditingRules({...editingRules, late_penalty_enabled: e.target.checked})} className="h-4 w-4" />
                          <span>Enabled</span>
                        </label>
                        <Input label="Rate per Second (₹)" type="number" step="0.01" value={editingRules.late_penalty_rate_per_second ?? rules.late_penalty_rate_per_second} onChange={(e) => setEditingRules({...editingRules, late_penalty_rate_per_second: Number(e.target.value)})} />
                        <Input label="Max Daily (₹)" type="number" step="0.01" value={editingRules.late_penalty_max_daily ?? (rules.late_penalty_max_daily || '')} onChange={(e) => setEditingRules({...editingRules, late_penalty_max_daily: e.target.value ? Number(e.target.value) : null})} />
                        <Input label="Max Monthly (₹)" type="number" step="0.01" value={editingRules.late_penalty_max_monthly ?? (rules.late_penalty_max_monthly || '')} onChange={(e) => setEditingRules({...editingRules, late_penalty_max_monthly: e.target.value ? Number(e.target.value) : null})} />
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-semibold mb-3">Overtime & Early Logout</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={editingRules.overtime_incentive_enabled ?? rules.overtime_incentive_enabled} onChange={(e) => setEditingRules({...editingRules, overtime_incentive_enabled: e.target.checked})} className="h-4 w-4" />
                          <span>OT Incentive</span>
                        </label>
                        <Input label="OT Rate/Second (₹)" type="number" step="0.01" value={editingRules.overtime_rate_per_second ?? (rules.overtime_rate_per_second || '')} onChange={(e) => setEditingRules({...editingRules, overtime_rate_per_second: e.target.value ? Number(e.target.value) : null})} />
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={editingRules.early_logout_penalty_enabled ?? rules.early_logout_penalty_enabled} onChange={(e) => setEditingRules({...editingRules, early_logout_penalty_enabled: e.target.checked})} className="h-4 w-4" />
                          <span>Early Logout Penalty</span>
                        </label>
                        <Input label="Early Logout Rate/Second (₹)" type="number" step="0.01" value={editingRules.early_logout_rate_per_second ?? (rules.early_logout_rate_per_second || '')} onChange={(e) => setEditingRules({...editingRules, early_logout_rate_per_second: e.target.value ? Number(e.target.value) : null})} />
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-semibold mb-3">Break Durations</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Input label="Lunch (Default) Minutes" type="number" value={editingRules.lunch_duration_minutes ?? rules.lunch_duration_minutes} onChange={(e) => setEditingRules({...editingRules, lunch_duration_minutes: Number(e.target.value)})} />
                        <Input label="Tea (Default) Minutes" type="number" value={editingRules.tea_duration_minutes ?? rules.tea_duration_minutes} onChange={(e) => setEditingRules({...editingRules, tea_duration_minutes: Number(e.target.value)})} />
                        <Input label="Male Lunch Minutes" type="number" value={editingRules.male_lunch_minutes ?? rules.male_lunch_minutes} onChange={(e) => setEditingRules({...editingRules, male_lunch_minutes: Number(e.target.value)})} />
                        <Input label="Female Lunch Minutes" type="number" value={editingRules.female_lunch_minutes ?? rules.female_lunch_minutes} onChange={(e) => setEditingRules({...editingRules, female_lunch_minutes: Number(e.target.value)})} />
                        <Input label="Male Tea Minutes" type="number" value={editingRules.male_tea_minutes ?? rules.male_tea_minutes} onChange={(e) => setEditingRules({...editingRules, male_tea_minutes: Number(e.target.value)})} />
                        <Input label="Female Tea Minutes" type="number" value={editingRules.female_tea_minutes ?? rules.female_tea_minutes} onChange={(e) => setEditingRules({...editingRules, female_tea_minutes: Number(e.target.value)})} />
                      </div>
                    </div>

                    <div className="border-t border-slate-200 pt-4">
                      <h4 className="font-semibold mb-3">Face Verification & QR</h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Input label="Face Threshold %" type="number" step="0.01" min="0" max="100" value={editingRules.face_verification_threshold ?? rules.face_verification_threshold} onChange={(e) => setEditingRules({...editingRules, face_verification_threshold: Number(e.target.value)})} />
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={editingRules.qr_daily_token_enabled ?? rules.qr_daily_token_enabled} onChange={(e) => setEditingRules({...editingRules, qr_daily_token_enabled: e.target.checked})} className="h-4 w-4" />
                          <span>Daily QR Token</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={editingRules.qr_one_time_scan ?? rules.qr_one_time_scan} onChange={(e) => setEditingRules({...editingRules, qr_one_time_scan: e.target.checked})} className="h-4 w-4" />
                          <span>One-Time Scan</span>
                        </label>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                      <Button type="button" variant="outline" onClick={() => setShowRulesModal(false)}>Cancel</Button>
                      <Button type="submit"><Settings className="w-4 h-4 mr-2" /> Save Rules</Button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}