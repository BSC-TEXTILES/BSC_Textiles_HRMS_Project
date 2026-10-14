'use client';

import React from 'react';
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
import { AlertTriangle, Clock, ArrowRight, User } from 'lucide-react';

interface PunctualityPoint {
  date: string;
  label: string;
  lateCount: number;
  totalRecords: number;
  latePercentage: number;
  avgLateMinutes: number;
}

interface RepeatOffender {
  employeeId: string;
  fullName: string;
  employeeCode: string;
  designation: string;
  locationName: string;
  locationCode: string;
  departmentName: string;
  lateArrivals: number;
  totalLateMinutes: number;
  avgLateMinutes: number;
  lastLateDate: string | null;
}

interface PunctualitySectionProps {
  trend: PunctualityPoint[];
  repeatOffenders: RepeatOffender[];
  loading: boolean;
  onSelectEmployee?: (employeeId: string) => void;
}

export function PunctualitySection({
  trend,
  repeatOffenders,
  loading,
  onSelectEmployee,
}: PunctualitySectionProps) {
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: PunctualityPoint = payload[0]?.payload;
    if (!pt) return null;

    return (
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl text-xs max-w-xs z-50">
        <div className="font-bold text-slate-800 dark:text-slate-100 mb-1 border-b border-slate-100 dark:border-slate-800 pb-1">
          {pt.date} ({pt.label})
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>Late Arrivals:</span>
            <span className="font-bold text-amber-600">{pt.lateCount}</span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>Late % of Attendance:</span>
            <span className="font-bold text-amber-600">{pt.latePercentage}%</span>
          </div>
          {pt.avgLateMinutes > 0 && (
            <div className="flex justify-between gap-3 text-slate-500">
              <span>Avg Delay:</span>
              <span className="font-semibold">{pt.avgLateMinutes} mins</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs mb-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Punctuality & Late Arrival Analytics
          </h3>
          <p className="text-[11px] text-slate-500">
            Historical shift delays beyond grace threshold and repeated tardiness records
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Connected-Dot Trend Graph */}
        <div className="lg:col-span-7">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center justify-between">
            <span>Daily Late Arrival Trend & Percentage</span>
            <span className="text-[11px] text-slate-400">Amber: Delay Count • Violet: Late %</span>
          </div>

          {loading ? (
            <div className="h-[250px] bg-slate-50/50 dark:bg-slate-800/20 rounded-xl animate-pulse" />
          ) : trend.length === 0 ? (
            <div className="h-[250px] flex items-center justify-center bg-slate-50/50 dark:bg-slate-800/20 rounded-xl text-xs text-slate-400">
              No late arrival records in this period.
            </div>
          ) : (
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" stroke="#94a3b8" fontSize={10} tickLine={false} />
                  <YAxis
                    yAxisId="left"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="#94a3b8"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    domain={[0, 100]}
                    unit="%"
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="lateCount"
                    name="Late Count"
                    stroke="#d97706"
                    strokeWidth={2}
                    dot={{ r: 3.5, strokeWidth: 2, fill: '#fff', stroke: '#d97706' }}
                    activeDot={{ r: 6.5, strokeWidth: 2, fill: '#d97706', stroke: '#fff' }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="latePercentage"
                    name="Late %"
                    stroke="#8b5cf6"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={{ r: 3, strokeWidth: 1.5, fill: '#fff', stroke: '#8b5cf6' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Right: Repeat Late Arrivals Leaderboard */}
        <div className="lg:col-span-5">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              Repeated Late Arrivals
            </span>
            <span className="text-[10px] text-slate-400">Top delayed staff</span>
          </div>

          <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {repeatOffenders.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                Zero repeat late arrivals recorded in this period. Excellent punctuality!
              </div>
            ) : (
              repeatOffenders.map((emp, idx) => (
                <div
                  key={emp.employeeId}
                  className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-100/60 dark:hover:bg-slate-800 transition-colors flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 font-bold text-[10px] flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-white truncate">
                        {emp.fullName}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {emp.employeeCode} • {emp.departmentName} ({emp.locationCode})
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="font-bold text-amber-600 dark:text-amber-400">
                        {emp.lateArrivals} {emp.lateArrivals === 1 ? 'delay' : 'delays'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {emp.totalLateMinutes} mins total
                      </div>
                    </div>

                    {onSelectEmployee ? (
                      <button
                        type="button"
                        onClick={() => onSelectEmployee(emp.employeeId)}
                        className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-[#1346a1] transition-colors cursor-pointer"
                        title="Analyze employee activity"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <Link
                        href={`/employees/profile/${emp.employeeId}`}
                        className="p-1 rounded-lg hover:bg-white dark:hover:bg-slate-700 text-slate-400 hover:text-[#1346a1] transition-colors"
                        title="View profile"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
