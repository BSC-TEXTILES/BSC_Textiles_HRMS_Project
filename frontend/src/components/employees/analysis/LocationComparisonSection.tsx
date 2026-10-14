'use client';

import React from 'react';
import { Building2, MapPin, Users, CheckCircle2, AlertCircle, TrendingUp, Filter } from 'lucide-react';

interface LocationStat {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  totalEmployees: number;
  activeEmployees: number;
  loggedInToday: number;
  markedPresent: number;
  absentToday: number;
  lateToday: number;
  attendanceRate: number;
  totalLoginsPeriod: number;
}

interface LocationComparisonSectionProps {
  locations: LocationStat[];
  loading: boolean;
  onSelectLocation: (locId: string) => void;
  selectedLocationId?: string;
}

export function LocationComparisonSection({
  locations,
  loading,
  onSelectLocation,
  selectedLocationId,
}: LocationComparisonSectionProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs mb-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 bg-slate-100 dark:bg-slate-800 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Building2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Location-Wise Employee Analysis & Hub Distribution
            </h3>
            <p className="text-[11px] text-slate-500">
              Live metrics across BSC Textiles retail stores (Belagavi, Davanagere, Shivamogga)
            </p>
          </div>
        </div>

        {selectedLocationId && selectedLocationId !== 'all' && (
          <button
            type="button"
            onClick={() => onSelectLocation('all')}
            className="text-xs font-semibold text-[#1346a1] hover:underline flex items-center gap-1 cursor-pointer"
          >
            Show All Hubs
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {locations.map((loc) => {
          const isSelected = selectedLocationId === loc.id || selectedLocationId === loc.code;

          return (
            <div
              key={loc.id}
              className={`p-4 rounded-xl border transition-all duration-200 ${
                isSelected
                  ? 'border-[#1346a1] ring-2 ring-[#1346a1]/20 bg-blue-50/20 dark:bg-blue-950/20'
                  : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div>
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white text-sm">
                    <MapPin className="w-3.5 h-3.5 text-[#1346a1] dark:text-blue-400 shrink-0" />
                    <span>{loc.name}</span>
                  </div>
                  <span className="text-[10px] font-semibold text-slate-400">
                    Code: {loc.code} • {loc.city || 'Karnataka'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectLocation(loc.id)}
                  title={`Filter to ${loc.name}`}
                  className="p-1 rounded-md text-slate-400 hover:text-[#1346a1] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <Filter className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Progress visualizer for attendance rate */}
              <div className="mb-3">
                <div className="flex items-center justify-between text-xs font-semibold mb-1">
                  <span className="text-slate-500">Attendance Rate</span>
                  <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                    {loc.attendanceRate}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, loc.attendanceRate))}%` }}
                  />
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block">Total Staff</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">
                    {loc.totalEmployees}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block">Logged In Today</span>
                  <span className="font-bold text-sky-600 dark:text-sky-400">
                    {loc.loggedInToday}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block">Present Today</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {loc.markedPresent}
                  </span>
                </div>
                <div className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block">Absent Today</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {loc.absentToday}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
