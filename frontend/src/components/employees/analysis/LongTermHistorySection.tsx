'use client';

import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { History, UserPlus, Users, PieChart } from 'lucide-react';

interface JoiningTrendPoint {
  month: string;
  hired: number;
  cumulativeTotal: number;
}

interface BreakdownItem {
  name?: string;
  status?: string;
  count: number;
}

interface LongTermHistorySectionProps {
  joiningTrend: JoiningTrendPoint[];
  departmentBreakdown: BreakdownItem[];
  statusBreakdown: BreakdownItem[];
  loading: boolean;
}

export function LongTermHistorySection({
  joiningTrend,
  departmentBreakdown,
  statusBreakdown,
  loading,
}: LongTermHistorySectionProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs mb-6 animate-pulse">
        <div className="h-6 w-48 bg-slate-200 dark:bg-slate-800 rounded mb-4" />
        <div className="h-56 bg-slate-100 dark:bg-slate-800 rounded-xl" />
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: JoiningTrendPoint = payload[0]?.payload;
    if (!pt) return null;

    return (
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl text-xs max-w-xs z-50">
        <div className="font-bold text-slate-800 dark:text-slate-100 mb-1 border-b border-slate-100 dark:border-slate-800 pb-1">
          Month: {pt.month}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>New Joiners:</span>
            <span className="font-bold text-emerald-600">{pt.hired}</span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>Cumulative Headcount:</span>
            <span className="font-bold text-blue-600">{pt.cumulativeTotal}</span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs mb-6">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="w-7 h-7 rounded-lg bg-teal-50 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 flex items-center justify-center">
          <History className="w-4 h-4" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Long-Term HR History & Organizational Tenure
          </h3>
          <p className="text-[11px] text-slate-500">
            Historical onboarding progression, cumulative workforce growth, and department representation
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Cumulative Hires Connected-Dot Graph */}
        <div className="lg:col-span-8">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <UserPlus className="w-3.5 h-3.5 text-blue-600" />
              Cumulative Headcount & Monthly Onboarding Trend
            </span>
            <span className="text-[11px] text-slate-400">Blue: Cumulative • Emerald: Monthly Hires</span>
          </div>

          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={joiningTrend} margin={{ top: 10, right: 15, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={10} tickLine={false} />
                <YAxis
                  stroke="#94a3b8"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Line
                  type="monotone"
                  dataKey="cumulativeTotal"
                  name="Cumulative Total"
                  stroke="#2563eb"
                  strokeWidth={2.2}
                  dot={{ r: 4, strokeWidth: 2, fill: '#fff', stroke: '#2563eb' }}
                  activeDot={{ r: 6.5, strokeWidth: 2, fill: '#2563eb', stroke: '#fff' }}
                />
                <Line
                  type="monotone"
                  dataKey="hired"
                  name="Monthly Hires"
                  stroke="#059669"
                  strokeWidth={1.8}
                  strokeDasharray="3 3"
                  dot={{ r: 3.5, strokeWidth: 1.5, fill: '#fff', stroke: '#059669' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Department & Status Representation */}
        <div className="lg:col-span-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
              <PieChart className="w-3.5 h-3.5 text-teal-600" />
              Department Workforce Share
            </div>
            <div className="space-y-2 mb-4">
              {departmentBreakdown.slice(0, 5).map((dept, i) => (
                <div key={i} className="text-xs">
                  <div className="flex justify-between text-slate-600 dark:text-slate-300 font-medium mb-1">
                    <span className="truncate">{dept.name || 'Unassigned'}</span>
                    <span className="font-bold text-slate-900 dark:text-white shrink-0 ml-2">
                      {dept.count} staff
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-teal-500 rounded-full"
                      style={{
                        width: `${Math.min(
                          100,
                          (dept.count /
                            Math.max(
                              1,
                              departmentBreakdown.reduce((a, b) => a + b.count, 0)
                            )) *
                            100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Staff Lifecycle Status
            </div>
            <div className="flex flex-wrap gap-1.5">
              {statusBreakdown.map((s, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200/60 dark:border-slate-700/60"
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      s.status === 'ACTIVE'
                        ? 'bg-emerald-500'
                        : s.status === 'PROBATION'
                        ? 'bg-blue-500'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    {s.status}: <strong>{s.count}</strong>
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
