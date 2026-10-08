'use client';

import { useState, useEffect } from 'react';
import { 
  Settings, Shield, QrCode, Clock, Coffee, 
  Save, CheckCircle, RefreshCw, Server, AlertCircle 
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminSettingsPage() {
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedLocation, setSelectedLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [settings, setSettings] = useState({
    faceVerificationThreshold: 85,
    qrDailyTokenEnabled: true,
    qrOneTimeScan: true,
    gracePeriodMinutes: 5,
    lateThresholdMinutes: 5,
    earlyLoginIncentiveEnabled: true,
    earlyLoginRatePerSecond: 1,
    latePenaltyEnabled: true,
    latePenaltyRatePerSecond: 1,
    maleLunchMinutes: 100,
    femaleLunchMinutes: 40,
    maleTeaMinutes: 20,
    femaleTeaMinutes: 15,
  });

  useEffect(() => {
    fetchLocations();
  }, []);

  useEffect(() => {
    if (selectedLocation) {
      loadSettings(selectedLocation);
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
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async (locId: string) => {
    try {
      setLoading(true);
      const res = await api.get(`/settings?locationId=${locId}`);
      if (res.data?.settings) {
        const s = res.data.settings;
        setSettings({
          faceVerificationThreshold: s.faceVerificationThreshold ?? 85,
          qrDailyTokenEnabled: s.qrDailyTokenEnabled ?? true,
          qrOneTimeScan: s.qrOneTimeScan ?? true,
          gracePeriodMinutes: s.gracePeriodMinutes ?? 5,
          lateThresholdMinutes: s.lateThresholdMinutes ?? 5,
          earlyLoginIncentiveEnabled: s.earlyLoginIncentiveEnabled ?? true,
          earlyLoginRatePerSecond: Number(s.earlyLoginRatePerSecond ?? 1),
          latePenaltyEnabled: s.latePenaltyEnabled ?? true,
          latePenaltyRatePerSecond: Number(s.latePenaltyRatePerSecond ?? 1),
          maleLunchMinutes: s.maleLunchMinutes ?? 100,
          femaleLunchMinutes: s.femaleLunchMinutes ?? 40,
          maleTeaMinutes: s.maleTeaMinutes ?? 20,
          femaleTeaMinutes: s.femaleTeaMinutes ?? 15,
        });
      }
    } catch (e) {
      console.error(e);
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
        ...settings,
      });
      toast.success('Admin Control Center settings saved successfully!');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Control Center</h1>
            <p className="text-sm text-gray-500 mt-1">
              Global system configuration, biometric thresholds, QR security policies, and break rules
            </p>
          </div>

          <div className="flex items-center gap-3">
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
          {/* Card 1: Face Verification Threshold */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <Shield className="w-5 h-5 text-primary-600" />
              <div>
                <h3 className="font-bold text-gray-900">Biometric Face Verification Threshold</h3>
                <p className="text-xs text-gray-500">Security threshold required for automatic verification approval</p>
              </div>
            </div>

            <div className="mt-6 max-w-md">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-700">Minimum Match Confidence</label>
                <span className="text-sm font-mono font-bold text-primary-700">{settings.faceVerificationThreshold}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="99"
                value={settings.faceVerificationThreshold}
                onChange={(e) => setSettings({ ...settings, faceVerificationThreshold: Number(e.target.value) })}
                className="w-full accent-primary-600 cursor-pointer"
              />
              <p className="text-[11px] text-gray-500 mt-2">
                Face scans yielding confidence scores equal or above {settings.faceVerificationThreshold}% are marked VERIFIED. Any scan below this threshold is rejected as FAILED.
              </p>
            </div>
          </div>

          {/* Card 2: Daily QR Token Security */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <QrCode className="w-5 h-5 text-purple-600" />
              <div>
                <h3 className="font-bold text-gray-900">Daily QR Token Anti-Fraud Protection</h3>
                <p className="text-xs text-gray-500">Enforces daily expiration, one-time consumption, and replay protection</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.qrDailyTokenEnabled}
                  onChange={(e) => setSettings({ ...settings, qrDailyTokenEnabled: e.target.checked })}
                  className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 block">Daily Dynamic QR Token Generation</span>
                  <span className="text-xs text-gray-500">Generates unique token per employee per date, invalidating previous day tokens.</span>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.qrOneTimeScan}
                  onChange={(e) => setSettings({ ...settings, qrOneTimeScan: e.target.checked })}
                  className="rounded text-primary-600 focus:ring-primary-500 w-4 h-4"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 block">One-Time Scan Protection per Event</span>
                  <span className="text-xs text-gray-500">Rejects duplicate scans and prevents token sharing or double entry.</span>
                </div>
              </label>
            </div>
          </div>

          {/* Card 3: Break Allowances */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-3 pb-4 border-b border-gray-100">
              <Coffee className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="font-bold text-gray-900">Break Duration Policies</h3>
                <p className="text-xs text-gray-500">Standard allowances stored in database policy records</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Male Group Lunch (Minutes)</label>
                <input
                  type="number"
                  value={settings.maleLunchMinutes}
                  onChange={(e) => setSettings({ ...settings, maleLunchMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Female Group Lunch (Minutes)</label>
                <input
                  type="number"
                  value={settings.femaleLunchMinutes}
                  onChange={(e) => setSettings({ ...settings, femaleLunchMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Male Group Tea (Minutes)</label>
                <input
                  type="number"
                  value={settings.maleTeaMinutes}
                  onChange={(e) => setSettings({ ...settings, maleTeaMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Female Group Tea (Minutes)</label>
                <input
                  type="number"
                  value={settings.femaleTeaMinutes}
                  onChange={(e) => setSettings({ ...settings, femaleTeaMinutes: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <button
              type="submit"
              disabled={saving}
              className="bg-primary-600 hover:bg-primary-700 text-white font-medium py-2.5 px-6 rounded-lg shadow-sm text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save All Settings'}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  );
}
