'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Clock, Coffee, Utensils, Users, RefreshCw, X } from 'lucide-react';
import Link from 'next/link';
import { ShiftOptionItem } from './ExecutiveShiftFilter';
import { archiveShiftRegistryItem } from '@/lib/shiftRegistry';
import {
  formatLunchBreakDisplay,
  formatTeaBreakDisplay,
  formatPunchTime12,
} from '@/lib/shiftHelpers';
import toast from 'react-hot-toast';

export interface ExecutiveDeleteShiftDialogProps {
  isOpen: boolean;
  shift: ShiftOptionItem | null;
  totalActiveShifts?: number;
  onClose: () => void;
  onSuccess: (deletedShift: ShiftOptionItem) => void;
  returnFocusRef?: React.RefObject<HTMLElement | null>;
}

export function ExecutiveDeleteShiftDialog({
  isOpen,
  shift,
  totalActiveShifts = 1,
  onClose,
  onSuccess,
  returnFocusRef,
}: ExecutiveDeleteShiftDialogProps) {
  const [mounted, setMounted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [blockedCode, setBlockedCode] = useState<string | null>(null);

  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset state when dialog opens or shift changes
  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setBlockedCode(null);
      setDeleting(false);

      // Initial local block checks
      if (shift) {
        if (totalActiveShifts <= 1) {
          setBlockedCode('BLOCKED_LAST_SHIFT');
          setErrorMessage('At least one shift must remain.');
        } else if ((shift.staffCount ?? 0) > 0) {
          setBlockedCode('BLOCKED_ASSIGNED_STAFF');
          setErrorMessage(
            `${shift.name} has ${shift.staffCount} employees assigned. Move them to another shift before deleting.`
          );
        }
      }

      // Autofocus cancel or close button on open
      const timer = setTimeout(() => {
        if (cancelButtonRef.current) {
          cancelButtonRef.current.focus();
        } else if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(timer);
    } else {
      // Abort any in-flight request on close
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [isOpen, shift, totalActiveShifts]);

  const handleClose = useCallback(() => {
    if (deleting) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    onClose();
    if (returnFocusRef?.current) {
      setTimeout(() => {
        returnFocusRef.current?.focus();
      }, 50);
    }
  }, [deleting, onClose, returnFocusRef]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const handleDelete = async () => {
    if (!shift || deleting) return;

    setDeleting(true);
    setErrorMessage(null);
    setBlockedCode(null);

    abortControllerRef.current = new AbortController();

    try {
      await archiveShiftRegistryItem(shift.id, abortControllerRef.current.signal);

      toast.success(`Shift ${shift.name} deleted.`);
      onSuccess(shift);
      handleClose();
    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;

      const resp = err.response?.data;
      const msg =
        resp?.error ||
        resp?.message ||
        'Could not delete shift. Please try again.';
      setErrorMessage(msg);
      if (resp?.code) {
        setBlockedCode(resp.code);
      }
    } finally {
      setDeleting(false);
      abortControllerRef.current = null;
    }
  };

  if (!mounted || !isOpen || !shift) return null;

  const isBlocked =
    blockedCode === 'BLOCKED_ASSIGNED_STAFF' ||
    blockedCode === 'BLOCKED_FUTURE_ROSTER' ||
    blockedCode === 'BLOCKED_LAST_SHIFT' ||
    (shift.staffCount ?? 0) > 0 ||
    totalActiveShifts <= 1;

  const optPunchIn = formatPunchTime12(shift.startTime || '10:00');
  const optPunchOut = formatPunchTime12(shift.endTime || '21:30');
  const timeRangeDisplay = shift.timeRange || `${optPunchIn} – ${optPunchOut}`;
  const lunchDisplay = formatLunchBreakDisplay(shift.lunchDurationMinutes ?? 45);
  const teaDisplay = formatTeaBreakDisplay(
    shift.teaDurationMinutes ?? 0,
    (shift.teaBreakSlot as any) || 'None'
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="exec-delete-shift-title"
      aria-describedby="exec-delete-shift-desc"
      className="exec-shift-dialog-portal fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 overflow-y-auto"
      style={{ margin: 0, padding: '16px' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="exec-shift-dialog-card relative w-full max-w-[440px] bg-white dark:bg-[#1A1D24] rounded-xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col text-slate-800 dark:text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isBlocked
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
            <h3
              id="exec-delete-shift-title"
              className="font-bold text-base text-slate-900 dark:text-white"
            >
              {isBlocked ? `Cannot Delete ${shift.name}` : `Delete ${shift.name}?`}
            </h3>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={deleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 text-xs">
          {/* Blocked Alert Banner */}
          {isBlocked ? (
            <div
              role="alert"
              aria-live="polite"
              className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 text-amber-800 dark:text-amber-200 space-y-2"
            >
              <p className="font-medium leading-relaxed">
                {errorMessage ||
                  `${shift.name} has ${shift.staffCount ?? 0} employees assigned. Move them to another shift before deleting.`}
              </p>
              {(shift.staffCount ?? 0) > 0 && (
                <div>
                  <Link
                    href={`/employees?shiftId=${encodeURIComponent(shift.id)}`}
                    onClick={handleClose}
                    className="inline-flex items-center gap-1 font-bold text-[#0058be] dark:text-blue-400 hover:underline"
                  >
                    View assigned employees →
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <p id="exec-delete-shift-desc" className="text-slate-600 dark:text-slate-300 leading-relaxed">
              This removes the shift from all shift dropdowns in the HRMS. Past attendance,
              punch, and payroll records keep their shift name.
            </p>
          )}

          {/* Shift Details Confirmation Box */}
          <div className="p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2 text-slate-700 dark:text-slate-300 font-medium">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">Shift Name:</span>
              <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                {shift.name}
                {shift.isCustom && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                    Custom
                  </span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Working Hours:
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {timeRangeDisplay}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Utensils className="w-3.5 h-3.5" /> Lunch Break:
              </span>
              <span className="text-slate-800 dark:text-slate-200">{lunchDisplay}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Coffee className="w-3.5 h-3.5" /> Tea Break:
              </span>
              <span className="text-slate-800 dark:text-slate-200">{teaDisplay}</span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
              <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Assigned Staff:
              </span>
              <span
                className={`font-mono font-bold ${
                  (shift.staffCount ?? 0) === 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {shift.staffCount ?? 0} staff
              </span>
            </div>
          </div>

          {/* Inline Error Message on failure */}
          {errorMessage && !isBlocked && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs">
                <p className="font-semibold">{errorMessage}</p>
                <button
                  type="button"
                  onClick={handleDelete}
                  className="mt-1.5 px-2.5 py-1 rounded bg-red-600 text-white font-bold text-[11px] hover:bg-red-700 transition-colors inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" /> Retry
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800/80">
          {isBlocked ? (
            <button
              ref={closeButtonRef}
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Close
            </button>
          ) : (
            <>
              <button
                ref={cancelButtonRef}
                type="button"
                onClick={handleClose}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold rounded-lg bg-red-600 hover:bg-red-700 text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-60 flex items-center gap-1.5"
              >
                {deleting && <RefreshCw className="w-3 h-3 animate-spin" />}
                <span>{deleting ? 'Deleting…' : 'Delete shift'}</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
