'use client';

import React, { useState } from 'react';
import { X, Trash2, AlertTriangle, ArrowRightLeft, ShieldAlert } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface DeleteShiftModalProps {
  open: boolean;
  shift: any;
  onClose: () => void;
  onSuccess: (deletedShift: any) => void;
  onReassignRequest: (shift: any) => void;
}

export function DeleteShiftModal({
  open,
  shift,
  onClose,
  onSuccess,
  onReassignRequest,
}: DeleteShiftModalProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !shift) return null;

  const staffCount = Number(shift.staffCount ?? shift._count?.employees ?? 0);
  const isAssigned = staffCount > 0;

  const handleDelete = async () => {
    if (isAssigned) {
      setError(`Cannot delete this shift because ${staffCount} employee(s) are assigned. Please reassign them first.`);
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      const res = await api.delete(`/shifts/${shift.id}`);
      toast.success(res.data?.message || `Shift "${shift.name}" deleted successfully`);
      onSuccess(shift);
      onClose();
    } catch (err: any) {
      console.error('Delete shift error:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to delete shift';
      setError(msg);
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#0c1424] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isAssigned
                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}
            >
              {isAssigned ? <ShieldAlert className="w-5 h-5" /> : <Trash2 className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-[#0b1c30] dark:text-white">
                {isAssigned ? 'Shift Deletion Blocked' : 'Delete Shift'}
              </h3>
              <p className="text-xs text-slate-500">
                {shift.name} ({shift.code || 'SHIFT'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{error}</span>
          </div>
        )}

        {/* Body content based on whether employees are assigned */}
        {isAssigned ? (
          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200 space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-amber-800 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Active Employee Assignments Detected</span>
              </div>
              <p className="leading-relaxed">
                This shift currently has <span className="font-bold font-mono underline">{staffCount} employee(s)</span> assigned.
                The system prevents deleting active shifts to avoid stranding workforce rosters or breaking attendance calculations.
              </p>
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Please reassign all assigned employees to another active shift before attempting deletion.
              </p>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onReassignRequest(shift);
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-[#1346a1] hover:bg-[#0e3882] rounded-lg shadow-sm flex items-center gap-1.5"
              >
                <ArrowRightLeft className="w-4 h-4" />
                <span>Reassign Employees ({staffCount})</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 text-xs">
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Are you sure you want to delete <span className="font-bold text-slate-900 dark:text-white">“{shift.name}”</span>?
            </p>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 space-y-1">
              <div className="font-bold text-slate-700 dark:text-slate-300">Historical Data Protection</div>
              <p>
                If this shift has past attendance or payroll records, it will be safely archived (marked inactive) so historical reports and payroll remain 100% accurate. If completely unused, it will be permanently removed.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={onClose}
                disabled={deleting}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleting && <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
