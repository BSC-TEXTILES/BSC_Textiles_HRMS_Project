'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, AlertTriangle, Coffee, Utensils, Check, RefreshCw } from 'lucide-react';
import {
  STATUTORY_CAPS,
  TEA_BREAK_OPTIONS,
  TEA_BREAK_SLOTS,
  LUNCH_BREAK_OPTIONS,
  type TeaBreakMinutes,
  type TeaBreakSlot,
} from '@/config/shiftPolicyConfig';
import {
  to24HourString,
  calculateShiftDuration,
} from '@/lib/shiftHelpers';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export interface CreatedCustomShift {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  lunchDurationMinutes: number;
  teaDurationMinutes: number;
  teaBreakSlot?: string;
  staffCount: number;
  isCustom: boolean;
}

interface ExecutiveCustomShiftDialogProps {
  open: boolean;
  onClose: () => void;
  existingShiftNames: string[];
  locationId?: string;
  onSuccess: (shift: CreatedCustomShift) => void;
}

export function ExecutiveCustomShiftDialog({
  open,
  onClose,
  existingShiftNames,
  locationId = 'all',
  onSuccess,
}: ExecutiveCustomShiftDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [name, setName] = useState('');

  // 12-hour picker states for Punch In (default 10:00 AM)
  const [inHour, setInHour] = useState(10);
  const [inMin, setInMin] = useState(0);
  const [inPeriod, setInPeriod] = useState<'AM' | 'PM'>('AM');

  // 12-hour picker states for Punch Out (default 07:00 PM)
  const [outHour, setOutHour] = useState(7);
  const [outMin, setOutMin] = useState(0);
  const [outPeriod, setOutPeriod] = useState<'AM' | 'PM'>('PM');

  // Lunch break dropdown (null when unselected, stores minutes: 100, 60, or 45)
  const [lunchBreakMinutes, setLunchBreakMinutes] = useState<number | null>(null);
  const [lunchTouched, setLunchTouched] = useState(false);
  const [lunchCapConfirmed, setLunchCapConfirmed] = useState(false);

  // Tea break
  const [teaBreak, setTeaBreak] = useState<TeaBreakMinutes>(10);
  const [teaSlot, setTeaSlot] = useState<TeaBreakSlot>('None');

  // Submission state
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const initialFocusRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Prevent background scroll when dialog is open
  useEffect(() => {
    if (open) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [open]);

  // Focus trap & Escape key handler
  useEffect(() => {
    if (!open) return;

    // Auto-focus first input
    const timer = setTimeout(() => {
      initialFocusRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose]);

  // Derived 24-hour time strings
  const punchIn24 = useMemo(() => to24HourString(inHour, inMin, inPeriod), [inHour, inMin, inPeriod]);
  const punchOut24 = useMemo(() => to24HourString(outHour, outMin, outPeriod), [outHour, outMin, outPeriod]);

  // Shift duration in minutes
  const shiftDurationMinutes = useMemo(() => {
    return calculateShiftDuration(punchIn24, punchOut24);
  }, [punchIn24, punchOut24]);

  const isPunchOutAfterPunchIn = shiftDurationMinutes > 0;

  // Lunch validations & cap warnings
  const isLunchSelected = lunchBreakMinutes !== null;
  const isLunchAboveCap = isLunchSelected && lunchBreakMinutes > STATUTORY_CAPS.lunchCapMinutes;

  // Tea minutes & slot logic
  const teaMinutes = teaBreak;
  const isTeaDisabled = teaMinutes === 0;

  // Total break duration
  const totalBreakMinutes = (isLunchSelected ? lunchBreakMinutes : 0) + teaMinutes;
  const isTotalBreakValid = !isPunchOutAfterPunchIn || totalBreakMinutes < shiftDurationMinutes;

  // Name validation: 2-30 chars, letters, numbers, spaces, and hyphens
  const trimmedName = name.trim();
  const isNameFormatValid = /^[a-zA-Z0-9 -]{2,30}$/.test(trimmedName);
  const isNameDuplicate = useMemo(() => {
    if (!trimmedName) return false;
    return existingShiftNames.some(
      (existing) => existing.trim().toLowerCase() === trimmedName.toLowerCase()
    );
  }, [trimmedName, existingShiftNames]);

  // Overall form validity
  const isFormValid =
    isNameFormatValid &&
    !isNameDuplicate &&
    isPunchOutAfterPunchIn &&
    isLunchSelected &&
    isTotalBreakValid &&
    (!isLunchAboveCap || lunchCapConfirmed);

  // Reset form when dialog opens so stale drafts are cleared
  useEffect(() => {
    if (open) {
      setName('');
      setInHour(10);
      setInMin(0);
      setInPeriod('AM');
      setOutHour(7);
      setOutMin(0);
      setOutPeriod('PM');
      setLunchBreakMinutes(null);
      setLunchTouched(false);
      setLunchCapConfirmed(false);
      setTeaBreak(10);
      setTeaSlot('None');
      setServerError(null);
      setLoading(false);
    }
  }, [open]);

  // Handler for saving
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLunchTouched(true);
    if (!isFormValid || loading || lunchBreakMinutes === null) return;

    setLoading(true);
    setServerError(null);

    const cleanCode = (
      'S_' +
      trimmedName
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6) +
      '_' +
      Date.now().toString(36).slice(-4)
    ).toUpperCase();

    // Prepare payload for backend (duration in minutes only)
    const payload = {
      name: trimmedName,
      code: cleanCode,
      locationId: locationId !== 'all' ? locationId : 'cmuzam5fe00014n4pq25hkcww', // Default to Belagavi if All
      startTime: punchIn24,
      endTime: punchOut24,
      lunchDurationMinutes: lunchBreakMinutes,
      teaDurationMinutes: teaMinutes,
      maleLunchMinutes: lunchBreakMinutes,
      femaleLunchMinutes: lunchBreakMinutes,
      maleTeaMinutes: teaMinutes,
      femaleTeaMinutes: teaMinutes,
      gracePeriod: STATUTORY_CAPS.graceBufferMinutes,
      lateThreshold: 15,
      earlyLoginIncentive: true,
      overtimeEnabled: true,
      scannerRoles: {
        isCustomShift: true,
        teaBreakSlot: isTeaDisabled ? 'None' : teaSlot,
      },
    };

    try {
      const res = await api.post('/shifts', payload);
      const shiftId = res?.data?.id || `shift-${Date.now()}`;

      const createdShift: CreatedCustomShift = {
        id: shiftId,
        name: trimmedName,
        code: cleanCode,
        startTime: punchIn24,
        endTime: punchOut24,
        lunchDurationMinutes: lunchBreakMinutes,
        teaDurationMinutes: teaMinutes,
        teaBreakSlot: isTeaDisabled ? 'None' : teaSlot,
        staffCount: 0,
        isCustom: true,
      };

      toast.success(`Shift ${trimmedName} added.`);
      onSuccess(createdShift);
      onClose();
    } catch (err: any) {
      console.error('Save custom shift error:', err);
      const details = err?.response?.data?.details;
      const msg =
        (Array.isArray(details) && details.length > 0 ? details.join(', ') : null) ||
        err?.response?.data?.error ||
        err?.message ||
        'Could not save custom shift. Please try again.';
      setServerError(msg);
    } finally {
      setLoading(false);
    }
  };

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="exec-shift-overlay fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-slate-950/70"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(11, 28, 48, 0.7)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="exec-shift-dialog-title"
        className="exec-shift-dialog w-full sm:w-[90%] md:max-w-[560px] max-h-full sm:max-h-[90vh] bg-white dark:bg-[#0c1424] sm:rounded-2xl border-0 sm:border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Sticky Dialog Header */}
        <div className="exec-shift-header px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-white dark:bg-[#0c1424]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2
                id="exec-shift-dialog-title"
                className="text-base font-bold text-[#0b1c30] dark:text-slate-100"
              >
                Create Custom Shift
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Define operating hours, punch thresholds, and break durations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cancel and close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Dialog Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Server Error Notice with Retry */}
          {serverError && (
            <div
              role="alert"
              aria-live="polite"
              className="exec-shift-server-error p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <span>{serverError}</span>
              </div>
              <button
                type="button"
                onClick={() => handleSave()}
                className="px-2.5 py-1 rounded bg-rose-600 text-white font-bold text-[11px] hover:bg-rose-700 transition-colors shrink-0 flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Retry</span>
              </button>
            </div>
          )}

          {/* 1. Shift Name */}
          <div className="exec-shift-field">
            <label
              htmlFor="exec-shift-name"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1"
            >
              Shift Name <span className="text-red-500">*</span>
            </label>
            <input
              id="exec-shift-name"
              ref={initialFocusRef}
              type="text"
              required
              aria-label="Shift name"
              aria-describedby={
                isNameDuplicate
                  ? 'exec-shift-name-duplicate-err'
                  : !isNameFormatValid && trimmedName
                  ? 'exec-shift-name-format-err'
                  : undefined
              }
              placeholder="e.g. Shift 3, Shift 4, Festival Shift"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (serverError) setServerError(null);
              }}
              className={`w-full px-3 py-2 text-xs rounded-xl border bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none transition-colors ${
                isNameDuplicate || (!isNameFormatValid && trimmedName)
                  ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-[#0058be]'
              }`}
            />
            {isNameDuplicate && (
              <p
                id="exec-shift-name-duplicate-err"
                role="alert"
                aria-live="polite"
                className="mt-1 text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                This shift name already exists.
              </p>
            )}
            {!isNameFormatValid && trimmedName && !isNameDuplicate && (
              <p
                id="exec-shift-name-format-err"
                role="alert"
                aria-live="polite"
                className="mt-1 text-[11px] text-amber-600 dark:text-amber-400"
              >
                Name must be 2–30 characters (letters, numbers, spaces, hyphens).
              </p>
            )}
          </div>

          {/* 2 & 3. Punch In & Punch Out (12-hour pickers) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Punch In */}
            <div className="exec-shift-field p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                <span>
                  Punch In <span className="text-red-500">*</span>
                </span>
                <span className="text-[11px] font-mono text-[#0058be] dark:text-blue-400">
                  {punchIn24} (24h)
                </span>
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Punch in time - hour"
                  value={inHour}
                  onChange={(e) => setInHour(Number.parseInt(e.target.value, 10))}
                  className="flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400 font-bold">:</span>
                <select
                  aria-label="Punch in time - minute"
                  value={inMin}
                  onChange={(e) => setInMin(Number.parseInt(e.target.value, 10))}
                  className="flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setInPeriod('AM')}
                    className={`px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      inPeriod === 'AM'
                        ? 'bg-[#0058be] text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setInPeriod('PM')}
                    className={`px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      inPeriod === 'PM'
                        ? 'bg-[#0058be] text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>

            {/* Punch Out */}
            <div className="exec-shift-field p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center justify-between">
                <span>
                  Punch Out <span className="text-red-500">*</span>
                </span>
                <span className="text-[11px] font-mono text-[#0058be] dark:text-blue-400">
                  {punchOut24} (24h)
                </span>
              </label>
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Punch out time - hour"
                  value={outHour}
                  onChange={(e) => setOutHour(Number.parseInt(e.target.value, 10))}
                  className="flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400 font-bold">:</span>
                <select
                  aria-label="Punch out time - minute"
                  value={outMin}
                  onChange={(e) => setOutMin(Number.parseInt(e.target.value, 10))}
                  className="flex-1 px-2 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
                >
                  {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, '0')}
                    </option>
                  ))}
                </select>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden shrink-0">
                  <button
                    type="button"
                    onClick={() => setOutPeriod('AM')}
                    className={`px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      outPeriod === 'AM'
                        ? 'bg-[#0058be] text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    AM
                  </button>
                  <button
                    type="button"
                    onClick={() => setOutPeriod('PM')}
                    className={`px-2 py-1.5 text-[11px] font-bold transition-colors ${
                      outPeriod === 'PM'
                        ? 'bg-[#0058be] text-white'
                        : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    PM
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Punch Out validation message */}
          {!isPunchOutAfterPunchIn && (
            <p
              role="alert"
              aria-live="polite"
              className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Punch Out must be after Punch In.
            </p>
          )}

          {/* 4. Lunch Break Dropdown */}
          <div className="exec-shift-field p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
            <label
              htmlFor="exec-lunch-select"
              className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5"
            >
              <Utensils className="w-3.5 h-3.5 text-amber-500" />
              <span>
                Lunch Break <span className="text-red-500">*</span>
              </span>
            </label>

            <select
              id="exec-lunch-select"
              aria-label="Lunch break duration"
              aria-required="true"
              aria-describedby={
                lunchTouched && lunchBreakMinutes === null
                  ? 'exec-lunch-error'
                  : isLunchAboveCap
                  ? 'exec-lunch-cap-warning'
                  : undefined
              }
              value={lunchBreakMinutes ?? ''}
              onBlur={() => setLunchTouched(true)}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number.parseInt(e.target.value, 10);
                setLunchBreakMinutes(val);
                setLunchTouched(true);
                if (val === null || val <= STATUTORY_CAPS.lunchCapMinutes) {
                  setLunchCapConfirmed(false);
                }
                if (serverError) setServerError(null);
              }}
              className={`w-full px-3 py-2 text-xs font-semibold rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none transition-colors ${
                lunchTouched && lunchBreakMinutes === null
                  ? 'border-red-400 focus:ring-1 focus:ring-red-400'
                  : 'border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-[#0058be]'
              }`}
            >
              <option value="" disabled>
                Select lunch break
              </option>
              {LUNCH_BREAK_OPTIONS.map((opt) => (
                <option
                  key={opt.minutes}
                  value={opt.minutes}
                  aria-label={`${opt.label}, ${opt.minutes} minutes`}
                >
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Missing lunch selection error */}
            {lunchTouched && lunchBreakMinutes === null && (
              <p
                id="exec-lunch-error"
                role="alert"
                aria-live="polite"
                className="mt-1.5 text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1"
              >
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Select a lunch break
              </p>
            )}

            {/* Statutory cap warning & confirmation checkbox (only when > 45 min) */}
            {isLunchAboveCap && (
              <div
                id="exec-lunch-cap-warning"
                role="alert"
                aria-live="polite"
                className="mt-2.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900/60 text-xs text-amber-800 dark:text-amber-200 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
                  <span>
                    This lunch break is longer than the {STATUTORY_CAPS.lunchCapMinutes} min
                    statutory cap.
                  </span>
                </div>
                <label className="flex items-center gap-2 text-[11px] font-semibold text-amber-900 dark:text-amber-100 cursor-pointer pt-1 border-t border-amber-200/60 dark:border-amber-900/60">
                  <input
                    type="checkbox"
                    checked={lunchCapConfirmed}
                    onChange={(e) => setLunchCapConfirmed(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-[#0058be] focus:ring-[#0058be]"
                  />
                  <span>I confirm this lunch break length.</span>
                </label>
              </div>
            )}
          </div>

          {/* 5. Tea Break & 6. Tea Break Slot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* 5. Tea Break Dropdown */}
            <div className="exec-shift-field p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <label
                htmlFor="exec-tea-break-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5 flex items-center gap-1.5"
              >
                <Coffee className="w-3.5 h-3.5 text-amber-600" />
                <span>
                  Tea Break <span className="text-red-500">*</span>
                </span>
              </label>
              <select
                id="exec-tea-break-select"
                aria-label="Tea break duration"
                value={teaBreak}
                onChange={(e) => {
                  const val = Number.parseInt(e.target.value, 10) as TeaBreakMinutes;
                  setTeaBreak(val);
                  if (val === 0) setTeaSlot('None');
                }}
                className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-[#0058be]"
              >
                {TEA_BREAK_OPTIONS.map((opt) => (
                  <option key={opt.minutes} value={opt.minutes}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 6. Tea Break Slot Dropdown */}
            <div className="exec-shift-field p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
              <label
                htmlFor="exec-tea-slot-select"
                className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5"
              >
                Tea Break Slot
              </label>
              <select
                id="exec-tea-slot-select"
                aria-label="Tea break slot"
                disabled={isTeaDisabled}
                value={teaSlot}
                onChange={(e) => setTeaSlot(e.target.value as TeaBreakSlot)}
                className={`w-full px-3 py-2 text-xs font-semibold rounded-lg border bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none transition-colors ${
                  isTeaDisabled
                    ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-slate-800'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-1 focus:ring-[#0058be]'
                }`}
              >
                {TEA_BREAK_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Break vs Shift Duration validation */}
          {!isTotalBreakValid && (
            <p
              role="alert"
              aria-live="polite"
              className="text-[11px] text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Total breaks must be less than the shift window.
            </p>
          )}

          {/* Total Break Summary badge */}
          {isPunchOutAfterPunchIn && isTotalBreakValid && (
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
              <span>
                Shift window:{' '}
                <strong className="font-mono text-slate-700 dark:text-slate-200">
                  {Math.floor(shiftDurationMinutes / 60)}h {shiftDurationMinutes % 60}m
                </strong>
              </span>
              <span>
                Total breaks:{' '}
                <strong className="font-mono text-[#0058be] dark:text-blue-400">
                  {totalBreakMinutes} min
                </strong>
              </span>
            </div>
          )}
        </form>

        {/* Sticky Dialog Footer Actions */}
        <div className="exec-shift-footer px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-[#09101f] flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={!isFormValid || loading}
            aria-label="Save custom shift"
            className={`inline-flex items-center gap-1.5 px-5 py-2 text-xs font-bold rounded-xl transition-all shadow-xs ${
              !isFormValid || loading
                ? 'opacity-50 cursor-not-allowed bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                : 'bg-[#0058be] hover:bg-[#004ba3] text-white active:scale-98'
            }`}
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Save Shift</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
