'use client';

import { useState, useEffect } from 'react';
import { 
  Clock, Shield, DollarSign, Settings, Save, 
  MapPin, CheckCircle, AlertTriangle, HelpCircle 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function TimeShiftsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    gracePeriodMinutes: 5,
    lateThresholdMinutes: 5,
    earlyLoginIncentiveEnabled: true,
    earlyLoginRatePerSecond: 1,
    latePenaltyEnabled: true,
    latePenaltyRatePerSecond: 1,
    overtimeIncentiveEnabled: true,
    overtimeRatePerSecond: 1.5,
    lunchDurationMinutes: 100,
    teaDurationMinutes: 20,
    faceVerificationThreshold: 85,
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      fetchSettings(selectedLocation);
    }
  }, [selectedLocation]);

  const fetchLocations = async () => {
    try {
      const res = await api.get('/locations/all');
      const locs = res.data || [];
      setLocations(locs);
      if (locs.length > 0) {
        setSelectedLocation(locs[0].id);
      }
    } catch (e) {
      console.error('Fetch locations error:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async (locId: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/settings?locationId=${locId}`);
      if (res.data?.settings) {
        const s = res.data.settings;
        setForm({
          gracePeriodMinutes: s.gracePeriodMinutes ?? 5,
          lateThresholdMinutes: s.lateThresholdMinutes ?? 5,
          earlyLoginIncentiveEnabled: s.earlyLoginIncentiveEnabled ?? true,
          earlyLoginRatePerSecond: Number(s.earlyLoginRatePerSecond ?? 1),
          latePenaltyEnabled: s.latePenaltyEnabled ?? true,
          latePenaltyRatePerSecond: Number(s.latePenaltyRatePerSecond ?? 1),
          overtimeIncentiveEnabled: s.overtimeIncentiveEnabled ?? true,
          overtimeRatePerSecond: Number(s.overtimeRatePerSecond ?? 1.5),
          lunchDurationMinutes: s.lunchDurationMinutes ?? 100,
          teaDurationMinutes: s.teaDurationMinutes ?? 20,
          faceVerificationThreshold: s.faceVerificationThreshold ?? 85,
        });
      }
    } catch (e) {
      console.error('Fetch settings error:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      await api.put('/settings', {
        locationId: selectedLocation,
        ...form,
      });
      toast.success('Attendance and shift parameters updated successfully!');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Time & Shift Configuration</h1>
            <p className="text-sm text-gray-500 mt-1">
              Configure login thresholds, ₹/second incentive/penalty rates, grace periods, and overtime parameters
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-600">Branch:</span>
            <select
              value={selectedLocation}
              onChange={(e) => setSelectedLocation(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 bg-white font-medium"
            >
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name} ({loc.code})</option>
              ))}
            </select>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Section 1: Punctuality & Grace Periods */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <Clock className="w-5 h-5 text-primary-600" />
              <div>
                <h3 className="font-bold text-gray-900">Login Punctuality & Grace Thresholds</h3>
                <p className="text-xs text-gray-500">Defines when an arrival is considered on-time vs late</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Grace Period (Minutes)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={form.gracePeriodMinutes}
                    onChange={(e) => setForm({ ...form, gracePeriodMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">mins</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  Arrival within this window (e.g. 10:30 to 10:35) is marked on-time with zero penalty.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Late Calculation Threshold (Minutes)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={form.lateThresholdMinutes}
                    onChange={(e) => setForm({ ...form, lateThresholdMinutes: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">mins</span>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  After 10:35, penalty calculation begins from configured threshold.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Early Login Incentive */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-gray-900">Early Arrival Incentive Rule</h3>
                  <p className="text-xs text-gray-500">Rewards workforce arriving prior to scheduled shift start</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={form.earlyLoginIncentiveEnabled}
                  onChange={(e) => setForm({ ...form, earlyLoginIncentiveEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Early Incentive Rate (₹ per second)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.earlyLoginRatePerSecond}
                    onChange={(e) => setForm({ ...form, earlyLoginRatePerSecond: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">/ sec</span>
                </div>
                <div className="mt-2 p-2.5 bg-emerald-50 rounded-lg text-xs text-emerald-800">
                  Example: 10 mins early (600 seconds) × ₹{form.earlyLoginRatePerSecond} = <strong>₹{600 * form.earlyLoginRatePerSecond} early incentive</strong>.
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Late Penalty & Overtime */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <Shield className="w-5 h-5 text-red-600" />
                <div>
                  <h3 className="font-bold text-gray-900">Late Arrival Deduction & Overtime Policy</h3>
                  <p className="text-xs text-gray-500">Policy-based transparent calculation subjected to HR approval</p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={form.latePenaltyEnabled}
                  onChange={(e) => setForm({ ...form, latePenaltyEnabled: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-600"></div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Late Deduction Rate (₹ per second)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.latePenaltyRatePerSecond}
                    onChange={(e) => setForm({ ...form, latePenaltyRatePerSecond: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">/ sec</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Overtime Multiplier Rate (₹ per second)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs text-gray-400 font-bold">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.overtimeRatePerSecond}
                    onChange={(e) => setForm({ ...form, overtimeRatePerSecond: Number(e.target.value) })}
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500 font-mono"
                  />
                  <span className="absolute right-3 top-2.5 text-xs text-gray-400">/ sec</span>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 px-6 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
