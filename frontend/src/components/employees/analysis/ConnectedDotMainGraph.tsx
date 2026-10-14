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
  Legend,
} from 'recharts';
import {
  Activity,
  Calendar,
  Layers,
  Info,
  Maximize2,
  Eye,
  CheckCircle2,
} from 'lucide-react';

export interface TimelinePoint {
  date: string;
  label: string;
  uniqueLogins: number;
  successfulLogins: number;
  failedLogins: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  leaveCount: number;
  attendanceRate: number | null;
  avgLateMinutes: number | null;
  hasData: boolean;
}

interface ConnectedDotMainGraphProps {
  points: TimelinePoint[];
  loading: boolean;
  onPointClick: (date: string, metricKey?: string) => void;
  selectedDate?: string | null;
  onClearDate?: () => void;
}

interface SeriesToggle {
  key: keyof TimelinePoint;
  name: string;
  color: string;
  active: boolean;
  yAxisId: 'left' | 'right';
  strokeDasharray?: string;
}

export function ConnectedDotMainGraph({
  points,
  loading,
  onPointClick,
  selectedDate,
  onClearDate,
}: ConnectedDotMainGraphProps) {
  const [seriesConfig, setSeriesConfig] = useState<SeriesToggle[]>([
    {
      key: 'uniqueLogins',
      name: 'Unique Staff Logged In',
      color: '#0284c7', // Sky 600
      active: true,
      yAxisId: 'left',
    },
    {
      key: 'successfulLogins',
      name: 'Total Login Events',
      color: '#2563eb', // Blue 600
      active: true,
      yAxisId: 'left',
    },
    {
      key: 'presentCount',
      name: 'Present Attendance',
      color: '#059669', // Emerald 600
      active: true,
      yAxisId: 'left',
    },
    {
      key: 'lateCount',
      name: 'Late Arrivals',
      color: '#d97706', // Amber 600
      active: true,
      yAxisId: 'left',
    },
    {
      key: 'absentCount',
      name: 'Absent',
      color: '#e11d48', // Rose 600
      active: false,
      yAxisId: 'left',
    },
    {
      key: 'leaveCount',
      name: 'Approved Leaves',
      color: '#7c3aed', // Violet 600
      active: false,
      yAxisId: 'left',
    },
    {
      key: 'failedLogins',
      name: 'Failed Logins',
      color: '#dc2626', // Red 600
      active: false,
      yAxisId: 'left',
    },
    {
      key: 'attendanceRate',
      name: 'Attendance Rate (%)',
      color: '#9333ea', // Purple 600
      active: true,
      yAxisId: 'right',
      strokeDasharray: '4 4',
    },
  ]);

  const toggleSeries = (key: keyof TimelinePoint) => {
    setSeriesConfig((prev) =>
      prev.map((s) => (s.key === key ? { ...s, active: !s.active } : s))
    );
  };

  // Custom Connected-Dot Tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const pt: TimelinePoint = payload[0]?.payload;
    if (!pt) return null;

    return (
      <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl text-xs max-w-xs z-50 animate-in fade-in-50 zoom-in-95">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-2 mb-2">
          <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100">
            <Calendar className="w-3.5 h-3.5 text-[#1346a1] dark:text-blue-400" />
            <span>{pt.date}</span>
            <span className="text-slate-400 font-normal">({pt.label})</span>
          </div>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/40 text-[#1346a1] dark:text-blue-300 font-medium">
            Click to drill down
          </span>
        </div>

        <div className="space-y-1.5">
          {payload.map((item: any, idx: number) => {
            const isPercent = item.dataKey === 'attendanceRate';
            const val = item.value !== null && item.value !== undefined ? item.value : 'No Data';

            return (
              <div key={idx} className="flex items-center justify-between gap-3 text-[11px]">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.name}:</span>
                </div>
                <span className="font-bold text-slate-900 dark:text-white">
                  {val}
                  {isPercent && typeof val === 'number' ? '%' : ''}
                </span>
              </div>
            );
          })}
        </div>

        {pt.avgLateMinutes !== null && pt.avgLateMinutes > 0 && (
          <div className="mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800 text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <Info className="w-3 h-3 shrink-0" />
            <span>Avg lateness on this day: {pt.avgLateMinutes} mins</span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs mb-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-[#1346a1] dark:text-blue-400 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                Workforce Login & Attendance Connected-Dot Trend
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Connected chronological data points derived directly from database login events and punch records
              </p>
            </div>
          </div>
        </div>

        {/* Selected date indicator */}
        {selectedDate && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 rounded-xl text-xs text-[#1346a1] dark:text-blue-300">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-blue-600 dark:text-blue-400" />
            <span>
              Drill-down active for: <strong>{selectedDate}</strong>
            </span>
            {onClearDate && (
              <button
                type="button"
                onClick={onClearDate}
                aria-label="Clear drill-down date"
                className="ml-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors cursor-pointer text-slate-700 dark:text-slate-200 shadow-2xs"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Interactive Metric Series Toggles */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
          <Layers className="w-3.5 h-3.5" /> Toggle Series:
        </span>
        {seriesConfig.map((series) => (
          <button
            key={String(series.key)}
            type="button"
            onClick={() => toggleSeries(series.key)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              series.active
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 shadow-2xs border'
                : 'bg-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 border border-transparent'
            }`}
            style={{
              borderColor: series.active ? series.color : 'transparent',
            }}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform"
              style={{
                backgroundColor: series.active ? series.color : '#94a3b8',
                transform: series.active ? 'scale(1.1)' : 'scale(0.8)',
              }}
            />
            <span>{series.name}</span>
          </button>
        ))}
      </div>

      {/* Chart Canvas */}
      {loading ? (
        <div className="h-[360px] w-full flex items-center justify-center bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 animate-pulse">
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <Activity className="w-4 h-4 animate-spin text-[#1346a1]" />
            <span>Loading chronological telemetry...</span>
          </div>
        </div>
      ) : points.length === 0 ? (
        <div className="h-[360px] w-full flex items-center justify-center bg-slate-50/50 dark:bg-slate-800/20 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
          <span className="text-xs text-slate-400">
            No historical records found for the selected filter criteria.
          </span>
        </div>
      ) : (
        <div className="h-[360px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={points}
              margin={{ top: 15, right: 25, left: 0, bottom: 10 }}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload.length > 0) {
                  const clickedDate = e.activePayload[0]?.payload?.date;
                  if (clickedDate) {
                    onPointClick(clickedDate);
                  }
                }
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e2e8f0"
                className="dark:stroke-slate-800"
              />

              <XAxis
                dataKey="label"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: '#cbd5e1' }}
              />

              {/* Left Y Axis for Counts */}
              <YAxis
                yAxisId="left"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
                label={{
                  value: 'Staff / Events Count',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 10, fill: '#94a3b8' },
                }}
              />

              {/* Right Y Axis for Percentages */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#94a3b8"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                unit="%"
                label={{
                  value: 'Rate %',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 10, fill: '#94a3b8' },
                }}
              />

              <Tooltip content={<CustomTooltip />} />

              {seriesConfig.map((series) => {
                if (!series.active) return null;

                return (
                  <Line
                    key={String(series.key)}
                    yAxisId={series.yAxisId}
                    type="monotone"
                    dataKey={series.key as string}
                    name={series.name}
                    stroke={series.color}
                    strokeWidth={2.2}
                    strokeDasharray={series.strokeDasharray}
                    connectNulls={false}
                    dot={{
                      r: 4.5,
                      strokeWidth: 2,
                      fill: '#ffffff',
                      stroke: series.color,
                      className: 'cursor-pointer transition-transform hover:scale-150',
                    }}
                    activeDot={{
                      r: 8,
                      strokeWidth: 2.5,
                      fill: series.color,
                      stroke: '#ffffff',
                      cursor: 'pointer',
                    }}
                    isAnimationActive={true}
                    animationDuration={600}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Footer tips */}
      <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <span>💡 Click on any chronological dot on the graph to filter detailed employee records for that date.</span>
        <span>Connected-dot continuous line representation</span>
      </div>
    </div>
  );
}
