'use client';

import React from 'react';
import { Users, Clock, Edit3, ArrowRightLeft, Trash2, Utensils, Coffee, ChevronRight } from 'lucide-react';

interface ShiftsDataTableProps {
  shifts: any[];
  locations: any[];
  onViewEmployees: (shift: any) => void;
  onEditShift: (shift: any) => void;
  onChangeShift: (shift: any) => void;
  onDeleteShift: (shift: any) => void;
  onOpenDrill: (shift: any) => void;
}

function formatTime12(isoOrTime?: string | null): string {
  if (!isoOrTime) return '—';
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(isoOrTime)) {
    const parts = isoOrTime.split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  const d = new Date(isoOrTime);
  if (isNaN(d.getTime())) return isoOrTime;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export function ShiftsDataTable({
  shifts,
  locations,
  onViewEmployees,
  onEditShift,
  onChangeShift,
  onDeleteShift,
  onOpenDrill,
}: ShiftsDataTableProps) {
  if (shifts.length === 0) {
    return (
      <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 p-12 text-center text-slate-400">
        <Users className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
        <div className="font-bold text-slate-700 dark:text-slate-300">No shifts match the selected filters.</div>
        <p className="text-xs text-slate-400 mt-1">Try selecting another location hub or clearing the search query.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#0e172a] rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 uppercase tracking-wider font-bold text-[10px] border-b border-slate-200/80 dark:border-slate-800">
            <tr>
              <th className="py-3 px-4">Shift Details</th>
              <th className="py-3 px-3">Location Hub</th>
              <th className="py-3 px-3">Working Window</th>
              <th className="py-3 px-3">Men Breaks</th>
              <th className="py-3 px-3">Women Breaks</th>
              <th className="py-3 px-3 text-center">Assigned Staff</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {shifts.map((s) => {
              const staffCount = Number(s.staffCount ?? s._count?.employees ?? s.staff?.rostered ?? 0);
              const loc = locations.find((l) => l.id === s.locationId);
              const locLabel = s.locationName || (loc ? `${loc.name} (${loc.code})` : 'All Locations');
              const maleLunch = s.maleLunchMinutes ?? s.lunchDurationMinutes ?? 45;
              const femaleLunch = s.femaleLunchMinutes ?? s.lunchDurationMinutes ?? 45;
              const maleTea = s.maleTeaMinutes ?? s.teaDurationMinutes ?? 15;
              const femaleTea = s.femaleTeaMinutes ?? s.teaDurationMinutes ?? 15;

              return (
                <tr
                  key={s.id}
                  className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {/* Shift details */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-[#0b1c30] dark:text-white text-sm">
                        {s.name}
                      </span>
                      <span className="text-[10px] font-mono font-bold text-[#1346a1] dark:text-[#E8DCC6] bg-[#F8F4F1] dark:bg-slate-800 px-1.5 py-0.5 rounded border border-[#E5D5D7] dark:border-slate-700">
                        {s.code || 'SHIFT'}
                      </span>
                    </div>
                    {s.overnight && (
                      <span className="inline-block mt-1 text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                        Overnight (+1d)
                      </span>
                    )}
                  </td>

                  {/* Location Hub */}
                  <td className="py-3.5 px-3 text-slate-600 dark:text-slate-300 font-medium">
                    {locLabel}
                  </td>

                  {/* Working Window */}
                  <td className="py-3.5 px-3">
                    <div className="font-mono font-bold text-[#0b1c30] dark:text-white">
                      {formatTime12(s.startTime)} – {formatTime12(s.endTime)}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Grace: {s.gracePeriod ?? 5}m • Cutoff: {s.lateThreshold ?? 15}m
                    </div>
                  </td>

                  {/* Men Breaks */}
                  <td className="py-3.5 px-3">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Lunch: <span className="font-bold font-mono">{maleLunch}m</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Tea: <span className="font-bold font-mono">{maleTea}m</span>
                    </div>
                  </td>

                  {/* Women Breaks */}
                  <td className="py-3.5 px-3">
                    <div className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      Lunch: <span className="font-bold font-mono">{femaleLunch}m</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Tea: <span className="font-bold font-mono">{femaleTea}m</span>
                    </div>
                  </td>

                  {/* Staff count */}
                  <td className="py-3.5 px-3 text-center">
                    <button
                      type="button"
                      onClick={() => onViewEmployees(s)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-mono font-extrabold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                      title="Click to view assigned employees"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>{staffCount} Staff</span>
                    </button>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.status === 'ACTIVE' || !s.status
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {s.status === 'ACTIVE' || !s.status ? 'Active' : s.status}
                    </span>
                  </td>

                  {/* Working Actions */}
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        onClick={() => onViewEmployees(s)}
                        title="View Employees assigned to this shift"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-[#1346a1] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Users className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onEditShift(s)}
                        title="Edit Shift configuration"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeShift(s)}
                        title="Change Shift (Reassign employees)"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <ArrowRightLeft className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteShift(s)}
                        title="Delete Shift"
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenDrill(s)}
                        title="View live attendance roster for date"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#1346a1] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
