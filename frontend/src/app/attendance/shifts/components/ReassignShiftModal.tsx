'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { X, ArrowRightLeft, Users, Search, Check, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface ReassignShiftModalProps {
  open: boolean;
  sourceShift: any;
  availableShifts: any[];
  preselectedEmployeeId?: string;
  onClose: () => void;
  onSuccess: (result: any) => void;
}

export function ReassignShiftModal({
  open,
  sourceShift,
  availableShifts,
  preselectedEmployeeId,
  onClose,
  onSuccess,
}: ReassignShiftModalProps) {
  const [targetShiftId, setTargetShiftId] = useState('');
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmpIds, setSelectedEmpIds] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [notes, setNotes] = useState('');
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filter available target shifts: same location, not the source shift
  const targetOptions = useMemo(() => {
    if (!sourceShift) return [];
    return availableShifts.filter(
      (s) => s.id !== sourceShift.id && s.locationId === sourceShift.locationId && s.status !== 'INACTIVE'
    );
  }, [sourceShift, availableShifts]);

  // Load employees assigned to source shift
  useEffect(() => {
    if (!open || !sourceShift) return;
    setTargetShiftId(targetOptions[0]?.id || '');
    setNotes('');
    setSearch('');
    setError(null);

    let isMounted = true;
    (async () => {
      setLoadingEmployees(true);
      try {
        const res = await api.get(`/shifts/${sourceShift.id}/employees`);
        if (isMounted) {
          const empList = res.data?.employees || [];
          setEmployees(empList);
          if (preselectedEmployeeId) {
            setSelectedEmpIds([preselectedEmployeeId]);
          } else {
            // Default to selecting all employees on the shift
            setSelectedEmpIds(empList.map((e: any) => e.id));
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load shift employees:', err);
          setError('Could not load employees for this shift');
        }
      } finally {
        if (isMounted) setLoadingEmployees(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [open, sourceShift, targetOptions, preselectedEmployeeId]);

  if (!open || !sourceShift) return null;

  const filteredEmployees = employees.filter(
    (e) =>
      e.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeCode?.toLowerCase().includes(search.toLowerCase()) ||
      e.designation?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelectAll = () => {
    if (selectedEmpIds.length === filteredEmployees.length) {
      setSelectedEmpIds([]);
    } else {
      setSelectedEmpIds(filteredEmployees.map((e) => e.id));
    }
  };

  const toggleEmp = (id: string) => {
    setSelectedEmpIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetShiftId) {
      setError('Please select a destination shift');
      return;
    }
    if (selectedEmpIds.length === 0) {
      setError('Please select at least one employee to reassign');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await api.post('/shifts/reassign', {
        employeeIds: selectedEmpIds,
        targetShiftId,
        sourceShiftId: sourceShift.id,
        notes: notes.trim() || undefined,
      });

      toast.success(res.data?.message || `Successfully reassigned ${selectedEmpIds.length} employee(s)`);
      onSuccess(res.data);
      onClose();
    } catch (err: any) {
      console.error('Reassignment failed:', err);
      const msg = err.response?.data?.error || err.message || 'Failed to reassign employees';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#0c1424] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#0b1c30] dark:text-white">Change Shift Assignment</h2>
              <p className="text-xs text-slate-500">Reassign employees from {sourceShift.name} to another active shift</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleReassign} className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Source and Destination Summary */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40">
            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source Shift</div>
              <div className="text-sm font-bold text-[#0b1c30] dark:text-white mt-0.5">{sourceShift.name}</div>
              <div className="text-[11px] text-slate-500">{employees.length} active employee(s) assigned</div>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Target Shift <span className="text-red-500">*</span>
              </label>
              {targetOptions.length === 0 ? (
                <div className="text-xs text-amber-600 font-semibold">
                  No other active shifts in this hub. Create another shift first.
                </div>
              ) : (
                <select
                  required
                  value={targetShiftId}
                  onChange={(e) => setTargetShiftId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                >
                  {targetOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} ({opt.code || 'SHIFT'})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Employees Selection Checklist */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-[#1346a1]" />
                Select Employees to Reassign ({selectedEmpIds.length} of {employees.length} selected)
              </label>
              {filteredEmployees.length > 0 && (
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="text-xs font-semibold text-[#1346a1] hover:underline"
                >
                  {selectedEmpIds.length === filteredEmployees.length ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {/* Search filter for employees */}
            <div className="relative mb-2">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, employee code, or designation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white"
              />
            </div>

            {/* List */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl max-h-56 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-[#0c1424]">
              {loadingEmployees ? (
                <div className="p-6 text-center text-slate-400">Loading employees...</div>
              ) : filteredEmployees.length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  {employees.length === 0 ? 'No employees are currently assigned to this shift.' : 'No employees match your search.'}
                </div>
              ) : (
                filteredEmployees.map((emp) => {
                  const isChecked = selectedEmpIds.includes(emp.id);
                  const isWoman = emp.gender?.toUpperCase() === 'FEMALE';
                  return (
                    <label
                      key={emp.id}
                      className={`flex items-center gap-3 px-3.5 py-2.5 cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        isChecked ? 'bg-blue-50/40 dark:bg-blue-950/30' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleEmp(emp.id)}
                        className="rounded text-[#1346a1] focus:ring-[#1346a1] w-4 h-4 cursor-pointer"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 dark:text-white truncate">{emp.fullName}</span>
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {emp.employeeCode}
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                              isWoman
                                ? 'bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800'
                                : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            }`}
                          >
                            {isWoman ? 'Woman' : 'Man'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {emp.designation || 'Staff'} • {emp.departmentName || 'Operations'}
                        </div>
                      </div>
                      {isChecked && <Check className="w-4 h-4 text-[#1346a1] shrink-0" />}
                    </label>
                  );
                })
              )}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-200 mb-1">
              Reassignment Reason / Note <span className="text-slate-400 font-normal">(Optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Floor rotation, seasonal requirement, roster adjustment"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
            />
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || selectedEmpIds.length === 0 || targetOptions.length === 0}
              className="px-5 py-2 text-xs font-bold text-white bg-[#1346a1] hover:bg-[#0e3882] rounded-lg shadow-sm flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting && <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>}
              <span>Reassign {selectedEmpIds.length} Employee{selectedEmpIds.length === 1 ? '' : 's'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
