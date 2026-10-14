'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  User,
  Search,
  ExternalLink,
  Briefcase,
  MapPin,
  Clock,
  Calendar,
  AlertTriangle,
  LogIn,
  CheckCircle2,
  X,
  Activity,
} from 'lucide-react';
import api from '@/lib/api';

interface EmployeeOption {
  id: string;
  fullName: string;
  employeeCode: string;
  departmentName?: string;
  locationCode?: string;
}

interface EmployeeActivityPoint {
  date: string;
  label: string;
  isPresent: boolean;
  status: string;
  leaveType: string | null;
  onLeave: boolean;
  lateMinutes: number;
  hoursWorked: number;
  successfulLogins: number;
  failedLogins: number;
  actualLogin: string | null;
  actualLogout: string | null;
  hasActivity: boolean;
}

interface EmployeeActivityDeepDiveProps {
  selectedEmployeeId?: string;
  onSelectEmployee: (id: string) => void;
  dateRange: { startDate: string; endDate: string; preset?: string };
}

export function EmployeeActivityDeepDive({
  selectedEmployeeId,
  onSelectEmployee,
  dateRange,
}: EmployeeActivityDeepDiveProps) {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [search, setSearch] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [activityData, setActivityData] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch employee options for the dropdown selector
  useEffect(() => {
    let active = true;
    const fetchEmps = async () => {
      try {
        const res = await api.get('/employees?limit=150');
        const list = res.data?.employees || res.data || [];
        if (active) {
          const mapped = list.map((e: any) => ({
            id: e.id,
            fullName: e.fullName || `${e.firstName} ${e.lastName}`,
            employeeCode: e.employeeCode,
            departmentName: e.department?.name,
            locationCode: e.location?.code,
          }));
          setEmployees(mapped);
          if (!selectedEmployeeId && mapped.length > 0) {
            onSelectEmployee(mapped[0].id);
          }
        }
      } catch (err) {
        console.warn('Error fetching employee list for selector:', err);
      }
    };
    fetchEmps();
    return () => {
      active = false;
    };
  }, []);

  // Fetch selected employee's activity
  useEffect(() => {
    if (!selectedEmployeeId) {
      setActivityData(null);
      return;
    }

    let active = true;
    const fetchActivity = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = new URLSearchParams();
        if (dateRange.startDate) params.append('startDate', dateRange.startDate);
        if (dateRange.endDate) params.append('endDate', dateRange.endDate);
        if (dateRange.preset) params.append('preset', dateRange.preset);

        const res = await api.get(`/analysis/employee/${selectedEmployeeId}?${params.toString()}`);
        if (active) {
          setActivityData(res.data);
        }
      } catch (err: any) {
        if (active) {
          setError(err?.response?.data?.message || 'Failed to load employee activity');
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    fetchActivity();
    return () => {
      active = false;
    };
  }, [selectedEmployeeId, dateRange.startDate, dateRange.endDate, dateRange.preset]);

  const filteredEmps = search
    ? employees.filter(
        (e) =>
          e.fullName.toLowerCase().includes(search.toLowerCase()) ||
          e.employeeCode.toLowerCase().includes(search.toLowerCase())
      )
    : employees;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: EmployeeActivityPoint = payload[0]?.payload;
    if (!pt) return null;

    return (
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl text-xs max-w-xs z-50">
        <div className="font-bold text-slate-800 dark:text-slate-100 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span>{pt.date} ({pt.label})</span>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
              pt.isPresent
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : pt.onLeave
                ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300'
                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {pt.status}
          </span>
        </div>

        <div className="space-y-1">
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>Hours Worked:</span>
            <span className="font-bold text-slate-900 dark:text-white">{pt.hoursWorked} hrs</span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>Successful Logins:</span>
            <span className="font-bold text-sky-600 dark:text-sky-400">{pt.successfulLogins}</span>
          </div>
          {pt.lateMinutes > 0 && (
            <div className="flex justify-between gap-3 text-amber-600 dark:text-amber-400">
              <span>Late Duration:</span>
              <span className="font-bold">{pt.lateMinutes} mins</span>
            </div>
          )}
          {pt.failedLogins > 0 && (
            <div className="flex justify-between gap-3 text-rose-600 dark:text-rose-400">
              <span>Failed Logins:</span>
              <span className="font-bold">{pt.failedLogins}</span>
            </div>
          )}
          {pt.actualLogin && (
            <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800">
              Punch In: {new Date(pt.actualLogin).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              {pt.actualLogout ? ` • Out: ${new Date(pt.actualLogout).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}` : ' (Active Shift)'}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs mb-6">
      {/* Header with Employee Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Employee-Wise Activity & Telemetry Deep-Dive
            </h3>
            <p className="text-[11px] text-slate-500">
              Select any employee to view their individual login events, working hours, and punctuality trend
            </p>
          </div>
        </div>

        {/* Searchable Dropdown / Selector */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <select
              value={selectedEmployeeId || ''}
              onChange={(e) => onSelectEmployee(e.target.value)}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-100 font-semibold focus:outline-none focus:border-[#1346a1] min-w-[220px]"
            >
              <option value="">Select Employee to Analyze...</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode}) {emp.locationCode ? `• ${emp.locationCode}` : ''}
                </option>
              ))}
            </select>
          </div>

          {selectedEmployeeId && (
            <button
              type="button"
              onClick={() => onSelectEmployee('')}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              title="Clear selected employee"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {!selectedEmployeeId ? (
        <div className="p-8 text-center bg-slate-50/50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400">
          <User className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">No Employee Selected</p>
          <p className="text-[11px] mt-0.5">
            Choose an employee from the dropdown above to visualize their telemetry, working hours, and login activity.
          </p>
        </div>
      ) : loading ? (
        <div className="h-[280px] flex items-center justify-center bg-slate-50/50 dark:bg-slate-800/20 rounded-xl animate-pulse">
          <Activity className="w-5 h-5 animate-spin text-[#1346a1]" />
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 text-xs border border-rose-200">
          {error}
        </div>
      ) : activityData ? (
        <div>
          {/* Profile Summary Strip */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-700/60 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1346a1] text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                {activityData.employee.fullName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    {activityData.employee.fullName}
                  </h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                    {activityData.employee.employeeCode}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                    {activityData.employee.status}
                  </span>
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activityData.employee.designation || 'Staff'} • {activityData.employee.departmentName} • {activityData.employee.locationName}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href={`/employees/profile/${activityData.employee.id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#1346a1] text-white hover:bg-[#0e357e] transition-colors shadow-2xs"
              >
                <span>View Profile 360</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 mb-4">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Present Days</span>
              <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                {activityData.summary.totalPresentDays}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Late Arrivals</span>
              <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                {activityData.summary.totalLateDays}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Worked Hours</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {activityData.summary.totalWorkingHours}h
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Avg Daily Hours</span>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {activityData.summary.avgDailyHours}h
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Login Events</span>
              <span className="text-sm font-bold text-sky-600 dark:text-sky-400">
                {activityData.summary.totalSuccessfulLogins}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700/50 text-center">
              <span className="text-[10px] text-slate-400 block font-medium">Leave Days</span>
              <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                {activityData.summary.approvedLeaveDays}
              </span>
            </div>
          </div>

          {/* Connected-Dot Telemetry Chart */}
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={activityData.points}
                margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis
                  yAxisId="left"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: 'Hours / Logins',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 10, fill: '#94a3b8' },
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  unit="m"
                  label={{
                    value: 'Late Mins',
                    angle: 90,
                    position: 'insideRight',
                    style: { fontSize: 10, fill: '#94a3b8' },
                  }}
                />
                <Tooltip content={<CustomTooltip />} />

                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="hoursWorked"
                  name="Hours Worked"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#059669' }}
                  activeDot={{ r: 7, strokeWidth: 2, fill: '#059669', stroke: '#fff' }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="successfulLogins"
                  name="Login Events"
                  stroke="#0284c7"
                  strokeWidth={1.8}
                  strokeDasharray="2 2"
                  dot={{ r: 3.5, strokeWidth: 1.5, fill: '#fff', stroke: '#0284c7' }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="lateMinutes"
                  name="Late Minutes"
                  stroke="#d97706"
                  strokeWidth={1.8}
                  dot={{ r: 3.5, strokeWidth: 1.5, fill: '#fff', stroke: '#d97706' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
