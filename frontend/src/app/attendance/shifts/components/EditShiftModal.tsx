'use client';

import React, { useState, useEffect } from 'react';
import { X, Clock, AlertTriangle, Coffee, Utensils, Edit3 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface EditShiftModalProps {
  open: boolean;
  shift: any;
  onClose: () => void;
  onSuccess: (updatedShift: any) => void;
}

export function EditShiftModal({
  open,
  shift,
  onClose,
  onSuccess,
}: EditShiftModalProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [startTime, setStartTime] = useState('09:30');
  const [endTime, setEndTime] = useState('18:30');
  const [maleLunchMinutes, setMaleLunchMinutes] = useState(45);
  const [femaleLunchMinutes, setFemaleLunchMinutes] = useState(45);
  const [maleTeaMinutes, setMaleTeaMinutes] = useState(15);
  const [femaleTeaMinutes, setFemaleTeaMinutes] = useState(15);
  const [gracePeriod, setGracePeriod] = useState(5);
  const [lateThreshold, setLateThreshold] = useState(15);
  const [status, setStatus] = useState('ACTIVE');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (shift) {
      setName(shift.name || '');
      setCode(shift.code || '');
      // Extract HH:MM
      const sTime = shift.startTime ? shift.startTime.slice(11, 16) || shift.startTime.slice(0, 5) : '09:30';
      const eTime = shift.endTime ? shift.endTime.slice(11, 16) || shift.endTime.slice(0, 5) : '18:30';
      setStartTime(sTime);
      setEndTime(eTime);
      setMaleLunchMinutes(shift.maleLunchMinutes ?? shift.lunchDurationMinutes ?? 45);
      setFemaleLunchMinutes(shift.femaleLunchMinutes ?? shift.lunchDurationMinutes ?? 45);
      setMaleTeaMinutes(shift.maleTeaMinutes ?? shift.teaDurationMinutes ?? 15);
      setFemaleTeaMinutes(shift.femaleTeaMinutes ?? shift.teaDurationMinutes ?? 15);
      setGracePeriod(shift.gracePeriod ?? 5);
      setLateThreshold(shift.lateThreshold ?? 15);
      setStatus(shift.status || 'ACTIVE');
      setError(null);
    }
  }, [shift]);

  if (!open || !shift) return null;

  const isOvernight = (() => {
    if (!startTime || !endTime) return false;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return eh * 60 + em < sh * 60 + sm;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Shift name is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        name: name.trim(),
        code: code.trim(),
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
        status,
      };

      const res = await api.put(`/shifts/${shift.id}`, payload);
      toast.success(`Shift "${name.trim()}" updated successfully!`);
      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      console.error('Failed to update shift:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to update shift';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#0c1424] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30] dark:text-white">Edit Shift Configuration</h2>
              <p className="text-xs text-slate-500">Update shift timings, break durations, and status</p>
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
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Shift Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Shift Code
              </label>
              <input
                type="text"
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
                  Overnight Shift
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Start Time (Punch In)
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
                  End Time (Punch Out)
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
              Men & Women Break Durations
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

          {/* Grace, Late, & Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Grace (Mins)
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
                Late Cutoff (Mins)
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
            <div>
              <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              >
                <option value="ACTIVE">Active</option>
                <option value="INACTIVE">Inactive</option>
              </select>
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
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
