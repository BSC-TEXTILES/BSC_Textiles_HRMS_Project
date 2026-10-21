'use client';

import React, { useState, useEffect } from 'react';
import { X, Users, Search, ArrowRightLeft, Phone, Building2 } from 'lucide-react';
import api from '@/lib/api';

interface ViewShiftEmployeesModalProps {
  open: boolean;
  shift: any;
  onClose: () => void;
  onReassignIndividual: (shift: any, employeeId: string) => void;
  onReassignAll: (shift: any) => void;
}

export function ViewShiftEmployeesModal({
  open,
  shift,
  onClose,
  onReassignIndividual,
  onReassignAll,
}: ViewShiftEmployeesModalProps) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !shift) return;
    setSearch('');
    setError(null);

    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get(`/shifts/${shift.id}/employees`);
        if (isMounted) {
          setEmployees(res.data?.employees || []);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load shift employees:', err);
          setError('Failed to load employee list');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [open, shift]);

  if (!open || !shift) return null;

  const filtered = employees.filter(
    (e) =>
      e.fullName?.toLowerCase().includes(search.toLowerCase()) ||
      e.employeeCode?.toLowerCase().includes(search.toLowerCase()) ||
      e.designation?.toLowerCase().includes(search.toLowerCase()) ||
      e.departmentName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
      <div className="bg-white dark:bg-[#0c1424] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#1346a1]/10 text-[#1346a1] dark:text-blue-400 flex items-center justify-center font-bold">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#0b1c30] dark:text-white">
                  Assigned Employees — {shift.name}
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono">
                  {employees.length} Staff
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Workforce currently allocated to {shift.name} ({shift.code || 'SHIFT'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search bar and bulk actions */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#0c1424]">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, code, dept..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#1346a1]/40"
            />
          </div>

          {employees.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onReassignAll(shift);
              }}
              className="w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs font-bold text-white bg-[#1346a1] hover:bg-[#0e3882] shadow-xs flex items-center justify-center gap-1.5 shrink-0"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              <span>Reassign All Floor Staff</span>
            </button>
          )}
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-xs">Loading assigned workforce...</div>
          ) : error ? (
            <div className="p-12 text-center text-red-500 text-xs">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              {employees.length === 0 ? 'No employees are currently assigned to this shift.' : 'No employees match your search.'}
            </div>
          ) : (
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 uppercase tracking-wider font-bold text-[10px] border-b border-slate-200/80 dark:border-slate-800 sticky top-0">
                <tr>
                  <th className="py-2.5 px-4">Employee</th>
                  <th className="py-2.5 px-3">Gender</th>
                  <th className="py-2.5 px-3">Department</th>
                  <th className="py-2.5 px-3">Designation</th>
                  <th className="py-2.5 px-3">Contact</th>
                  <th className="py-2.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((emp) => {
                  const isWoman = emp.gender?.toUpperCase() === 'FEMALE';
                  return (
                    <tr
                      key={emp.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 dark:text-white">{emp.fullName}</div>
                        <div className="text-[10px] font-mono text-slate-400">{emp.employeeCode}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            isWoman
                              ? 'bg-pink-50 dark:bg-pink-950/60 text-pink-700 dark:text-pink-300 border border-pink-200 dark:border-pink-800'
                              : 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                          }`}
                        >
                          {isWoman ? 'Women' : 'Men'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-300 font-medium">
                        {emp.departmentName || '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-500 dark:text-slate-400">
                        {emp.designation || 'Staff'}
                      </td>
                      <td className="py-3 px-3 text-slate-500 font-mono text-[11px]">
                        {emp.phone || '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onReassignIndividual(shift, emp.id);
                          }}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#1346a1] hover:bg-blue-50 dark:hover:bg-blue-950/50 rounded-lg transition-colors border border-blue-200 dark:border-blue-800 inline-flex items-center gap-1"
                        >
                          <ArrowRightLeft className="w-3 h-3" />
                          <span>Change Shift</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50 dark:bg-slate-900/50">
          <span>Showing {filtered.length} of {employees.length} employees</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
