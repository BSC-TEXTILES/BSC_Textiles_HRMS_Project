'use client';

import React, { useState } from 'react';
import { X, Clock, AlertTriangle, Coffee, Utensils, Check } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { STANDARD_SHIFT_NAMES } from '@/config/shiftPolicyConfig';

interface AddShiftModalProps {
  open: boolean;
  onClose: () => void;
  locations: Array<{ id: string; name: string; code: string }>;
  defaultLocationId?: string;
  onSuccess: (newShift: any) => void;
}

export function AddShiftModal({
  open,
  onClose,
  locations,
  defaultLocationId,
  onSuccess,
}: AddShiftModalProps) {
  const [selectedStandardName, setSelectedStandardName] = useState<string>('Shift I');
  const [isCustomName, setIsCustomName] = useState(false);
  const [customName, setCustomName] = useState('');
  const [code, setCode] = useState('');
  const [locationId, setLocationId] = useState(
    defaultLocationId && defaultLocationId !== 'all'
      ? defaultLocationId
      : locations[0]?.id || ''
  );
  const [startTime, setStartTime] = useState('09:30');
  const [endTime, setEndTime] = useState('18:30');
  const [maleLunchMinutes, setMaleLunchMinutes] = useState(45);
  const [femaleLunchMinutes, setFemaleLunchMinutes] = useState(45);
  const [maleTeaMinutes, setMaleTeaMinutes] = useState(15);
  const [femaleTeaMinutes, setFemaleTeaMinutes] = useState(15);
  const [gracePeriod, setGracePeriod] = useState(5);
  const [lateThreshold, setLateThreshold] = useState(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resolvedName = isCustomName ? customName.trim() : selectedStandardName;

  const isOvernight = (() => {
    if (!startTime || !endTime) return false;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return eh * 60 + em < sh * 60 + sm;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resolvedName) {
      setError('Shift name is required');
      return;
    }
    if (!locationId) {
      setError('Please select a valid location hub');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: resolvedName,
        code: code.trim() || undefined,
        locationId,
        startTime,
        endTime,
        lunchDurationMinutes: Math.max(maleLunchMinutes, femaleLunchMinutes),
        teaDurationMinutes: Math.max(maleTeaMinutes, femaleTeaMinutes),
        maleLunchMinutes: Number(maleLunchMinutes),
        femaleLunchMinutes: Number(femaleLunchMinutes),
        maleTeaMinutes: Number(maleTeaMinutes),
        femaleTeaMinutes: Number(femaleTeaMinutes),
        gracePeriod: Number(gracePeriod),
        lateThreshold: Number(lateThreshold),
      };

      const res = await api.post('/shifts', payload);
      toast.success(`Shift "${resolvedName}" created successfully!`);
      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      console.error('Failed to create shift:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to create shift';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#0c1424] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#1346a1]/10 text-[#1346a1] dark:text-blue-400 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30] dark:text-white">Create New Floor Shift</h2>
              <p className="text-xs text-slate-500">Configure standard shift timings and gender-specific break policies</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Standard Shift Selector */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider mb-2">
              Standard Shift Selection <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {STANDARD_SHIFT_NAMES.map((sName) => {
                const isSelected = !isCustomName && selectedStandardName === sName;
                return (
                  <button
                    key={sName}
                    type="button"
                    onClick={() => {
                      setSelectedStandardName(sName);
                      setIsCustomName(false);
                    }}
                    className={`py-2 px-2.5 rounded-lg font-bold text-xs border text-center transition-all ${
                      isSelected
                        ? 'bg-[#1346a1] text-white border-[#1346a1] shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {sName}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setIsCustomName(true)}
                className={`py-2 px-2.5 rounded-lg font-bold text-xs border text-center transition-all ${
                  isCustomName
                    ? 'bg-[#1346a1] text-white border-[#1346a1] shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                Other...
              </button>
            </div>

            {isCustomName && (
              <div className="mt-3">
                <input
                  type="text"
                  required
                  placeholder="Enter custom shift name"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]"
                />
              </div>
            )}
          </div>

          {/* Location & Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Location Hub <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]"
              >
                <option value="">Select Location</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Shift Code <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. DAV_SHIFT_I"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]"
              />
            </div>
          </div>

          {/* Timings */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-[#1346a1]" />
                Shift Working Hours
              </span>
              {isOvernight && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                  Overnight Shift (Ends next day)
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Start Time (Punch In) <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  End Time (Punch Out) <span className="text-red-500">*</span>
                </label>
                <input
                  type="time"
                  required
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Break Duration Policies: Men & Women */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 space-y-3">
            <span className="font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
              <Utensils className="w-4 h-4 text-amber-600" />
              Men & Women Break Allowances
            </span>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Men Lunch Break (Mins)
                </label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={maleLunchMinutes}
                  onChange={(e) => setMaleLunchMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Women Lunch Break (Mins)
                </label>
                <input
                  type="number"
                  min="0"
                  max="180"
                  value={femaleLunchMinutes}
                  onChange={(e) => setFemaleLunchMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Men Tea Break (Mins)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={maleTeaMinutes}
                  onChange={(e) => setMaleTeaMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Women Tea Break (Mins)
                </label>
                <input
                  type="number"
                  min="0"
                  max="60"
                  value={femaleTeaMinutes}
                  onChange={(e) => setFemaleTeaMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Grace & Late Thresholds */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Grace Period (Minutes)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={gracePeriod}
                onChange={(e) => setGracePeriod(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Late Cutoff (Minutes)
              </label>
              <input
                type="number"
                min="0"
                max="120"
                value={lateThreshold}
                onChange={(e) => setLateThreshold(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-xs font-bold text-white bg-[#1346a1] hover:bg-[#0e3882] rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading && <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>}
              <span>Save Floor Shift</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
