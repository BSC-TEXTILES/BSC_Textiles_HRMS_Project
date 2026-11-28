'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { 
  ClipboardCheck, 
  Calendar, 
  ChevronLeft, 
  ChevronRight, 
  Filter, 
  Search, 
  Download, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Building2,
  RefreshCw
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

export default function EmployeeAttendancePage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [locationId, setLocationId] = useState('ALL');
  const [locations, setLocations] = useState<any[]>([]);
  const [matrixData, setMatrixData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/attendance/monthly-matrix', {
        params: { year, month, locationId: locationId === 'ALL' ? undefined : locationId, search },
      });
      setMatrixData(res.data);
    } catch (err: any) {
      console.warn('Failed to load attendance matrix:', err);
      toast.error('Failed to load attendance matrix');
    } finally {
      setLoading(false);
    }
  }, [year, month, locationId, search]);

  useEffect(() => {
    api.get('/locations/all').then((res) => {
      const list = Array.isArray(res.data) ? res.data : res.data?.locations || [];
      setLocations(list);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    fetchMatrix();
  }, [fetchMatrix]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const getCellColorClass = (color?: string, status?: string) => {
    switch (color) {
      case 'green':
        return 'bg-emerald-500 text-white font-bold';
      case 'red':
        return 'bg-red-500 text-white font-bold';
      case 'yellow':
        return 'bg-amber-400 text-slate-900 font-bold';
      case 'blue':
        return 'bg-blue-500 text-white font-bold';
      case 'grey':
        return 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold';
      case 'purple':
        return 'bg-purple-600 text-white font-bold';
      case 'orange':
        return 'bg-orange-500 text-white font-bold';
      case 'lightgreen':
        return 'bg-emerald-300 text-emerald-950 font-bold';
      default:
        return 'text-slate-400 dark:text-slate-600';
    }
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <DashboardLayout>
      <div className="max-w-[100rem] mx-auto py-8 px-4 sm:px-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <ClipboardCheck className="w-7 h-7 text-sky-600" />
              Employee Attendance Register & Color-Coded Calendar
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              Monthly attendance matrix with 8 distinct color codes, automatic Sunday & weekly offs, and double holiday pay tracking.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Showroom filter */}
            <select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200"
            >
              <option value="ALL">All Hubs & Showrooms</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name} ({loc.code})
                </option>
              ))}
              {locations.length === 0 && (
                <>
                  <option value="cmuzam5fr00024n4p4izbomev">Davanagere (DAV)</option>
                  <option value="cmuzam5fe00014n4pq25hkcww">Belagavi (BEL)</option>
                  <option value="cmuzam5g400034n4p89o33l8e">Shivamogga (SHI)</option>
                </>
              )}
            </select>

            {/* Month Navigator */}
            <div className="flex items-center rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
              <button onClick={handlePrevMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
              <span className="px-3 text-xs font-bold text-slate-900 dark:text-white min-w-[120px] text-center">
                {monthNames[month - 1]} {year}
              </span>
              <button onClick={handleNextMonth} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
                <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <button
              onClick={fetchMatrix}
              className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 text-slate-600 dark:text-slate-300"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 8 Color Legend */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 mb-6">
          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
            <span className="w-3.5 h-3.5 rounded bg-emerald-500 shrink-0" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 truncate">Green: Present</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
            <span className="w-3.5 h-3.5 rounded bg-red-500 shrink-0" />
            <span className="text-xs font-semibold text-red-700 dark:text-red-300 truncate">Red: Absent</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-400/10 border border-amber-400/20">
            <span className="w-3.5 h-3.5 rounded bg-amber-400 shrink-0" />
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300 truncate">Yellow: Pending</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <span className="w-3.5 h-3.5 rounded bg-blue-500 shrink-0" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300 truncate">Blue: Leave</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-500/10 border border-slate-500/20">
            <span className="w-3.5 h-3.5 rounded bg-slate-400 shrink-0" />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">Grey: Weekly Off</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-600/10 border border-purple-600/20">
            <span className="w-3.5 h-3.5 rounded bg-purple-600 shrink-0" />
            <span className="text-xs font-semibold text-purple-700 dark:text-purple-300 truncate">Purple: Holiday</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <span className="w-3.5 h-3.5 rounded bg-orange-500 shrink-0" />
            <span className="text-xs font-semibold text-orange-700 dark:text-orange-300 truncate">Orange: Hol (2x)</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-300/20 border border-emerald-300/30">
            <span className="w-3.5 h-3.5 rounded bg-emerald-300 shrink-0" />
            <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-200 truncate">Lt Green: Paid Leave</span>
          </div>
        </div>

        {/* Matrix Grid Table */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="px-4 py-3 text-left font-bold min-w-[180px] sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 shadow-sm">
                    Employee Details
                  </th>
                  {Array.from({ length: matrixData?.daysInMonth || 31 }).map((_, i) => (
                    <th key={i + 1} className="px-1.5 py-3 font-semibold min-w-[32px]">
                      {i + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {matrixData?.employees?.map((emp: any) => (
                  <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="px-4 py-3 text-left sticky left-0 bg-white dark:bg-slate-900 z-10 shadow-sm">
                      <div className="font-bold text-slate-900 dark:text-white truncate max-w-[170px]">
                        {emp.fullName}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {emp.employeeCode} • {emp.designation || 'Staff'}
                      </div>
                    </td>

                    {Array.from({ length: matrixData.daysInMonth }).map((_, i) => {
                      const dayNum = i + 1;
                      const cell = matrixData.matrix?.[emp.id]?.[dayNum];
                      const colorClass = getCellColorClass(cell?.color, cell?.status);
                      return (
                        <td key={dayNum} className="p-1 text-center">
                          <div
                            title={cell ? `${cell.label} (${cell.date}) ${cell.actualLogin ? `[In: ${cell.actualLogin}]` : ''}` : ''}
                            className={`w-7 h-7 mx-auto rounded flex items-center justify-center text-[10px] cursor-default transition-transform hover:scale-110 ${colorClass}`}
                          >
                            {cell?.code || '-'}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
