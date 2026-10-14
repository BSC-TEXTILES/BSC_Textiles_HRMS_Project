'use client';

import React from 'react';
import Link from 'next/link';
import {
  Users,
  Search,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Filter,
  X,
  Clock,
  Radio,
  Eye,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
} from 'lucide-react';

interface DrillDownRow {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  designation: string;
  role: string;
  status: string;
  hireDate: string | null;
  locationName: string;
  locationCode: string;
  departmentName: string;
  shiftName: string;
  attendanceStatus: string;
  actualLogin: string | null;
  actualLogout: string | null;
  isLate: boolean;
  lateMinutes: number;
  loginsToday: number;
  isOnline: boolean;
}

interface DrillDownRecordsTableProps {
  category: string;
  categoryTitle: string;
  targetDate: string;
  rows: DrillDownRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  loading: boolean;
  search: string;
  onSearchChange: (search: string) => void;
  onPageChange: (page: number) => void;
  onClose: () => void;
  onSelectEmployee?: (employeeId: string) => void;
}

export function DrillDownRecordsTable({
  category,
  categoryTitle,
  targetDate,
  rows,
  total,
  page,
  limit,
  totalPages,
  loading,
  search,
  onSearchChange,
  onPageChange,
  onClose,
  onSelectEmployee,
}: DrillDownRecordsTableProps) {
  const getAttendanceBadge = (status: string, isLate: boolean) => {
    if (isLate || status === 'LATE') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
          <AlertTriangle className="w-3 h-3" /> Late
        </span>
      );
    }
    switch (status) {
      case 'PRESENT':
      case 'FACE_VERIFIED':
      case 'OVERTIME':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
            <CheckCircle2 className="w-3 h-3" /> Present
          </span>
        );
      case 'ABSENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
            <AlertCircle className="w-3 h-3" /> Absent
          </span>
        );
      case 'ON_LEAVE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300">
            On Leave
          </span>
        );
      case 'WEEKLY_OFF':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            Weekly Off
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
            {status}
          </span>
        );
    }
  };

  return (
    <div
      id="drilldown-table-section"
      className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-[#1346a1]/30 dark:border-blue-500/30 shadow-md p-5 mb-6 scroll-mt-6"
    >
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1346a1] dark:bg-blue-400" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Drill-Down: {categoryTitle}
            </h3>
            <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-blue-50 text-[#1346a1] dark:bg-blue-950 dark:text-blue-300">
              {total} Matching Staff
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Filtered records for target date: <strong>{targetDate}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search staff in drilldown..."
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-[#1346a1] w-48 sm:w-60"
            />
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Close drill-down view"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800/80 text-[10px] uppercase font-bold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 tracking-wider">
            <tr>
              <th className="py-2.5 px-3">Employee</th>
              <th className="py-2.5 px-3">Role & Designation</th>
              <th className="py-2.5 px-3">Store & Department</th>
              <th className="py-2.5 px-3">Shift</th>
              <th className="py-2.5 px-3">Attendance</th>
              <th className="py-2.5 px-3">Punches / Delay</th>
              <th className="py-2.5 px-3">Login Status</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  Loading drilldown employee records...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  No employee records matched this drill-down filter.
                </td>
              </tr>
            ) : (
              rows.map((emp) => (
                <tr
                  key={emp.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                >
                  {/* Employee */}
                  <td className="py-2.5 px-3">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {emp.fullName}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {emp.employeeCode} {emp.email ? `• ${emp.email}` : ''}
                    </div>
                  </td>

                  {/* Role */}
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {emp.designation}
                    </div>
                    <div className="text-[10px] text-slate-400">{emp.role}</div>
                  </td>

                  {/* Store & Dept */}
                  <td className="py-2.5 px-3">
                    <div className="font-medium text-slate-800 dark:text-slate-200">
                      {emp.departmentName}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {emp.locationName} ({emp.locationCode})
                    </div>
                  </td>

                  {/* Shift */}
                  <td className="py-2.5 px-3">
                    <span className="text-slate-700 dark:text-slate-300">
                      {emp.shiftName}
                    </span>
                  </td>

                  {/* Attendance */}
                  <td className="py-2.5 px-3">
                    {getAttendanceBadge(emp.attendanceStatus, emp.isLate)}
                  </td>

                  {/* Punches */}
                  <td className="py-2.5 px-3">
                    {emp.actualLogin ? (
                      <div className="text-[11px] text-slate-800 dark:text-slate-200">
                        In: {emp.actualLogin}
                        {emp.actualLogout ? ` • Out: ${emp.actualLogout}` : ''}
                        {emp.isLate && emp.lateMinutes > 0 && (
                          <span className="text-amber-600 block text-[10px] font-semibold">
                            +{emp.lateMinutes} mins late
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 text-[11px]">—</span>
                    )}
                  </td>

                  {/* Login Status */}
                  <td className="py-2.5 px-3">
                    {emp.isOnline ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Online Now
                      </span>
                    ) : emp.loginsToday > 0 ? (
                      <span className="text-[11px] text-sky-600 dark:text-sky-400 font-medium">
                        {emp.loginsToday} {emp.loginsToday === 1 ? 'login' : 'logins'} today
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Not signed in</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td className="py-2.5 px-3 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      {onSelectEmployee && (
                        <button
                          type="button"
                          onClick={() => onSelectEmployee(emp.id)}
                          className="px-2 py-1 text-xs font-semibold rounded-lg bg-blue-50 text-[#1346a1] hover:bg-blue-100 dark:bg-blue-900/40 dark:text-blue-300 transition-colors cursor-pointer"
                        >
                          Analyze
                        </button>
                      )}
                      <Link
                        href={`/employees/profile/${emp.id}`}
                        className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-[#1346a1] transition-colors inline-flex items-center"
                        title="View employee profile 360"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <span>
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} records
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-bold text-slate-800 dark:text-slate-100">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
