'use client';

import React, { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { Clock, Flame, ArrowDown, Activity } from 'lucide-react';

interface HourlyDataPoint {
  hour: number;
  hourLabel: string;
  successfulLogins: number;
  failedLogins: number;
  uniqueEmployees: number;
}

interface HourlyLoginDistributionChartProps {
  hourlyData: HourlyDataPoint[];
  peakPeriod?: { hour: number; label: string; count: number };
  lowestPeriod?: { hour: number; label: string; count: number };
  loading: boolean;
}

export function HourlyLoginDistributionChart({
  hourlyData,
  peakPeriod,
  lowestPeriod,
  loading,
}: HourlyLoginDistributionChartProps) {
  const [metric, setMetric] = useState<'successfulLogins' | 'uniqueEmployees'>('successfulLogins');

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: HourlyDataPoint = payload[0]?.payload;
    if (!pt) return null;

    return (
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl text-xs max-w-xs z-50">
        <div className="font-bold text-slate-800 dark:text-slate-100 mb-1.5 pb-1 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-[#1346a1]" />
            {pt.hourLabel} - {String((pt.hour + 1) % 24).padStart(2, '0')}:00
          </span>
          {peakPeriod && peakPeriod.hour === pt.hour && pt.successfulLogins > 0 && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 text-[10px] font-bold">
              Peak
            </span>
          )}
        </div>
        <div className="space-y-1">
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>Successful Logins:</span>
            <span className="font-bold text-slate-900 dark:text-white">{pt.successfulLogins}</span>
          </div>
          <div className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
            <span>Unique Employees:</span>
            <span className="font-bold text-slate-900 dark:text-white">{pt.uniqueEmployees}</span>
          </div>
          {pt.failedLogins > 0 && (
            <div className="flex justify-between gap-3 text-rose-600 dark:text-rose-400">
              <span>Failed Attempts:</span>
              <span className="font-bold">{pt.failedLogins}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-400 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Hourly Login Distribution (24-Hour Day)
            </h3>
            <p className="text-[11px] text-slate-500">Distribution of login requests throughout the working hours</p>
          </div>
        </div>

        {/* Metric Toggle */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setMetric('successfulLogins')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
              metric === 'successfulLogins'
                ? 'bg-white dark:bg-slate-700 text-[#1346a1] dark:text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Total Logins
          </button>
          <button
            type="button"
            onClick={() => setMetric('uniqueEmployees')}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer ${
              metric === 'uniqueEmployees'
                ? 'bg-white dark:bg-slate-700 text-[#1346a1] dark:text-white shadow-2xs'
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            Unique Staff
          </button>
        </div>
      </div>

      {/* Peak & Lowest Period Highlights */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Peak Login Period
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {peakPeriod ? peakPeriod.label : '—'}
              </div>
            </div>
          </div>
          <span className="text-sm font-extrabold text-amber-700 dark:text-amber-300">
            {peakPeriod ? `${peakPeriod.count} logins` : '0'}
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ArrowDown className="w-4 h-4 text-slate-500 shrink-0" />
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Lowest Activity Period
              </div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                {lowestPeriod ? lowestPeriod.label : '—'}
              </div>
            </div>
          </div>
          <span className="text-sm font-extrabold text-slate-600 dark:text-slate-300">
            {lowestPeriod ? `${lowestPeriod.count} logins` : '0'}
          </span>
        </div>
      </div>

      {/* Connected Dot Chart */}
      {loading ? (
        <div className="h-[240px] flex items-center justify-center bg-slate-50/50 dark:bg-slate-800/20 rounded-xl animate-pulse">
          <Activity className="w-4 h-4 animate-spin text-[#1346a1]" />
        </div>
      ) : (
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={hourlyData}
              margin={{ top: 10, right: 15, left: -15, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis
                dataKey="hourLabel"
                stroke="#94a3b8"
                fontSize={10}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />
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
                dataKey={metric}
                name={metric === 'successfulLogins' ? 'Total Logins' : 'Unique Staff'}
                stroke="#0284c7"
                strokeWidth={2}
                dot={{
                  r: 3.5,
                  strokeWidth: 2,
                  fill: '#ffffff',
                  stroke: '#0284c7',
                }}
                activeDot={{
                  r: 6.5,
                  strokeWidth: 2,
                  fill: '#0284c7',
                  stroke: '#ffffff',
                }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
