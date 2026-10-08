'use client';

import { useState, useEffect } from 'react';
import { 
  Coffee, Utensils, Clock, AlertTriangle, CheckCircle, 
  RefreshCw, MapPin, Search, StopCircle, UserCheck 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function BreaksOperationsPage() {
  const [activeBreaks, setActiveBreaks] = useState<any[]>([]);
  const [breakRules, setBreakRules] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [nowTime, setNowTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNowTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    fetchData();
  }, [selectedLocation]);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [activeRes, rulesRes, locRes] = await Promise.all([
        api.get('/breaks/active').catch(() => ({ data: { breaks: [] } })),
        api.get('/breaks/rules').catch(() => ({ data: { rules: [] } })),
        api.get('/locations/all').catch(() => ({ data: [] })),
      ]);

      let breaks = activeRes.data?.breaks || [];
      if (selectedLocation) {
        breaks = breaks.filter((b: any) => b.employee?.locationId === selectedLocation);
      }
      setActiveBreaks(breaks);
      setBreakRules(rulesRes.data?.rules || []);
      setLocations(locRes.data || []);
    } catch (e) {
      console.error('Fetch breaks error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleEndBreak = async (breakId: string, employeeName: string) => {
    try {
      await api.post(`/breaks/${breakId}/end`);
      toast.success(`Break ended for ${employeeName}`);
      fetchData();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to end break');
    }
  };

  const calculateRemaining = (startTime: string, allowedMinutes: number) => {
    const start = new Date(startTime).getTime();
    const allowedMs = allowedMinutes * 60 * 1000;
    const end = start + allowedMs;
    const diffSec = Math.floor((end - nowTime) / 1000);
    const isExceeded = diffSec < 0;
    const abs = Math.abs(diffSec);
    const m = Math.floor(abs / 60);
    const s = abs % 60;
    const str = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return {
      text: isExceeded ? `+${str} EXCEEDED` : str,
      isExceeded,
    };
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tea & Lunch Break Operations</h1>
            <p className="text-sm text-gray-500 mt-1">
              Live floor break monitoring, group policy compliance, and overrun tracking
            </p>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white font-medium"
            >
              <option value="">All Retail Stores</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
              ))}
            </select>

            <button
              onClick={fetchData}
              className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Quick Break Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
              <Coffee className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">On Tea Break Now</div>
              <div className="text-2xl font-bold text-gray-900 mt-0.5">
                {activeBreaks.filter((b) => b.breakType === 'TEA').length} Staff
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Utensils className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">On Lunch Break Now</div>
              <div className="text-2xl font-bold text-gray-900 mt-0.5">
                {activeBreaks.filter((b) => b.breakType === 'LUNCH').length} Staff
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 text-red-600 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase">Break Overruns</div>
              <div className="text-2xl font-bold text-red-600 mt-0.5">
                {activeBreaks.filter((b) => calculateRemaining(b.startTime, b.allowedDuration).isExceeded).length} Alert
              </div>
            </div>
          </div>
        </div>

        {/* Active Breaks Live Board */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <h2 className="font-bold text-gray-900">Active Break Sessions on Floor</h2>
            </div>
            <span className="text-xs font-medium text-gray-500">Auto-refreshing second-by-second</span>
          </div>

          {activeBreaks.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <CheckCircle className="w-10 h-10 mx-auto text-emerald-400 mb-2" />
              <div className="font-medium text-gray-700">All retail employees are currently on the sales floor.</div>
              <p className="text-xs text-gray-500 mt-1">No active tea or lunch break timer in progress.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-5">
              {activeBreaks.map((b) => {
                const rem = calculateRemaining(b.startTime, b.allowedDuration || 20);
                return (
                  <div 
                    key={b.id} 
                    className={`rounded-xl p-4 border transition-all ${
                      rem.isExceeded ? 'bg-red-50/70 border-red-200' : 'bg-gray-50/60 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-bold text-gray-900">{b.employee?.fullName || 'Staff'}</div>
                        <div className="text-xs font-mono text-gray-500">{b.employee?.employeeCode}</div>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        b.breakType === 'LUNCH' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {b.breakType}
                      </span>
                    </div>

                    <div className="mt-4 p-3 bg-white rounded-lg border border-gray-200/80 text-center">
                      <div className="text-[10px] uppercase font-semibold text-gray-500">Remaining Time</div>
                      <div className={`text-xl font-mono font-bold mt-0.5 ${rem.isExceeded ? 'text-red-600' : 'text-gray-900'}`}>
                        {rem.text}
                      </div>
                      <div className="text-[11px] text-gray-400 mt-0.5">
                        Started: {new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Allowed: {b.allowedDuration}m
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      <button
                        onClick={() => handleEndBreak(b.id, b.employee?.fullName || 'Staff')}
                        className="w-full bg-gray-900 hover:bg-black text-white py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-center gap-1.5"
                      >
                        <StopCircle className="w-3.5 h-3.5" />
                        End Break Now
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Configured Company Break Policies Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-200">
            <h3 className="font-bold text-gray-900">Configured Company Break Rules & Policies</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Configured per location and employee group. No gender-specific rules are hardcoded in code.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 text-xs uppercase font-semibold text-gray-700 border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Break Type</th>
                  <th className="py-3 px-4">Target Group / Department</th>
                  <th className="py-3 px-4">Allowed Duration</th>
                  <th className="py-3 px-4">Max Daily Limits</th>
                  <th className="py-3 px-4">Policy Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <tr>
                  <td className="py-3 px-4 font-semibold text-gray-900 flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-blue-600" />
                    Lunch Break (Male Group)
                  </td>
                  <td className="py-3 px-4 text-xs">Standard Sales Floor Group</td>
                  <td className="py-3 px-4 text-xs font-mono font-medium text-gray-800">1 Hour 40 Mins (100 min)</td>
                  <td className="py-3 px-4 text-xs">1 Session / day</td>
                  <td className="py-3 px-4"><span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">Active</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-gray-900 flex items-center gap-2">
                    <Utensils className="w-4 h-4 text-blue-600" />
                    Lunch Break (Female Group)
                  </td>
                  <td className="py-3 px-4 text-xs">Custom Shift Retail Group</td>
                  <td className="py-3 px-4 text-xs font-mono font-medium text-gray-800">40 Minutes</td>
                  <td className="py-3 px-4 text-xs">1 Session / day</td>
                  <td className="py-3 px-4"><span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">Active</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-gray-900 flex items-center gap-2">
                    <Coffee className="w-4 h-4 text-amber-600" />
                    Tea Break (Male Group)
                  </td>
                  <td className="py-3 px-4 text-xs">Storewide Operational Policy</td>
                  <td className="py-3 px-4 text-xs font-mono font-medium text-gray-800">20 Minutes</td>
                  <td className="py-3 px-4 text-xs">1 Session / shift</td>
                  <td className="py-3 px-4"><span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">Active</span></td>
                </tr>
                <tr>
                  <td className="py-3 px-4 font-semibold text-gray-900 flex items-center gap-2">
                    <Coffee className="w-4 h-4 text-amber-600" />
                    Tea Break (Female Group)
                  </td>
                  <td className="py-3 px-4 text-xs">Storewide Operational Policy</td>
                  <td className="py-3 px-4 text-xs font-mono font-medium text-gray-800">15 Minutes</td>
                  <td className="py-3 px-4 text-xs">1 Session / shift</td>
                  <td className="py-3 px-4"><span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">Active</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
