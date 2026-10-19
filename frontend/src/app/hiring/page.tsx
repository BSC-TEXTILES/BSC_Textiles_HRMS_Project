'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Briefcase, Users, UserPlus, Star, TrendingUp, RefreshCw,
  CheckCircle2, XCircle, Clock, Database, ArrowRight, CalendarClock,
} from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { useSocket } from '@/context/SocketContext';
import { HireError } from '@/components/hiring/HireError';
import {
  HiringDashboardData,
  HiringLocation,
  stageMeta,
} from '@/lib/hiring';
import { formatDate } from '@/lib/utils';

function KpiCard({
  label, value, icon: Icon, accent, hint,
}: {
  label: string;
  value: string | number;
  icon: any;
  accent: string;
  hint?: string;
}) {
  return (
    <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{hint}</p>}
        </div>
        <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${accent}`}>
          <Icon className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
      </div>
    </Card>
  );
}

export default function HiringDashboardPage() {
  const router = useRouter();
  const { socket } = useSocket();
  const [data, setData] = useState<HiringDashboardData | null>(null);
  const [locations, setLocations] = useState<HiringLocation[]>([]);
  const [locationId, setLocationId] = useState('');
  const [days, setDays] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get('/hiring/dashboard', {
        params: { locationId: locationId || undefined, days },
      });
      setData(res.data);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load hiring dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [locationId, days]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get('/hiring/locations')
      .then((res) => setLocations(Array.isArray(res.data) ? res.data : []))
      .catch(() => undefined);
  }, []);

  // Live pipeline updates: a new submission or a stage move anywhere in the
  // user's scope refreshes the KPIs without a manual reload.
  useEffect(() => {
    if (!socket) return;
    const refresh = () => load(true);
    socket.on('hiring:application:new', refresh);
    socket.on('hiring:application:stage', refresh);
    return () => {
      socket.off('hiring:application:new', refresh);
      socket.off('hiring:application:stage', refresh);
    };
  }, [socket, load]);

  const funnelRows = useMemo(() => {
    if (!data) return [];
    const { views, starts, submissions, conversionRate } = data.funnel;
    const max = Math.max(views, starts, submissions, 1);
    return [
      { label: 'Form views', value: views, pct: (views / max) * 100, color: 'bg-sky-500' },
      { label: 'Started applying', value: starts, pct: (starts / max) * 100, color: 'bg-teal-500' },
      { label: 'Submitted', value: submissions, pct: (submissions / max) * 100, color: 'bg-emerald-600' },
    ];
  }, [data]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Candidate Hiring</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Live pipeline across every hiring location — applications, funnel conversion, interviews and shard health.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              options={[{ value: '', label: 'All locations' }, ...locations.map((l) => ({ value: l.id, label: `${l.code} — ${l.name}` }))]}
              className="w-56"
            />
            <Select
              value={days}
              onChange={(e) => setDays(e.target.value)}
              options={[
                { value: '7', label: 'Last 7 days' },
                { value: '30', label: 'Last 30 days' },
                { value: '90', label: 'Last 90 days' },
              ]}
              className="w-40"
            />
            <Button variant="outline" className="gap-1.5" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </Button>
            <Button className="gap-1.5" onClick={() => router.push('/hiring/forms')}>
              <Briefcase className="h-4 w-4" /> Job Openings
            </Button>
          </div>
        </div>

        {error && <HireError message={error} onRetry={() => load()} />}

        {loading && !data ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Applications" value={data.totals.applications} icon={Users} accent="bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300" />
              <KpiCard label="New this week" value={data.totals.newThisWeek} icon={UserPlus} accent="bg-teal-100 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300" />
              <KpiCard label="In pipeline" value={data.totals.inPipeline} icon={Briefcase} accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300" />
              <KpiCard label="Hired" value={data.totals.hired} icon={CheckCircle2} accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300" />
              <KpiCard label="Rejected" value={data.totals.rejected} icon={XCircle} accent="bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300" />
              <KpiCard
                label="Avg rating"
                value={data.totals.averageRating ? data.totals.averageRating.toFixed(1) : '—'}
                icon={Star}
                accent="bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                hint={data.totals.averageTimeToHireDays ? `${data.totals.averageTimeToHireDays}d avg time-to-hire` : undefined}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Application funnel</h2>
                  <Badge variant="info">{data.funnel.conversionRate}% submit rate</Badge>
                </div>
                <div className="mt-4 space-y-4">
                  {funnelRows.map((row) => (
                    <div key={row.label}>
                      <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                        <span>{row.label}</span>
                        <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{row.value}</span>
                      </div>
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-2 rounded-full ${row.color}`} style={{ width: `${Math.max(row.pct, row.value > 0 ? 4 : 0)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" /> {data.forms.published} published forms</span>
                  <span className="text-slate-300">•</span>
                  <span>{data.forms.totalOpenings} open positions</span>
                </div>
              </Card>

              <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 xl:col-span-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Applications per day</h2>
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400"><TrendingUp className="h-3.5 w-3.5" /> last {days} days</span>
                </div>
                <div className="mt-3 h-56">
                  {data.byDay.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">No applications in this window</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.byDay} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="hiringByDay" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#0d9488" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#0d9488" stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                        <XAxis dataKey="day" tick={{ fontSize: 11 }} tickFormatter={(v) => String(v).slice(5)} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Area type="monotone" dataKey="count" name="Applications" stroke="#0d9488" strokeWidth={2} fill="url(#hiringByDay)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Pipeline by stage</h2>
                <div className="mt-4 space-y-2.5">
                  {data.stageCounts.length === 0 && <p className="text-sm text-slate-400">No applications yet</p>}
                  {data.stageCounts.map((row) => {
                    const meta = stageMeta(row.stage);
                    const max = Math.max(...data.stageCounts.map((s) => s.count), 1);
                    return (
                      <div key={row.stage} className="flex items-center gap-3">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${meta.dot}`} />
                        <span className="w-40 shrink-0 truncate text-xs text-slate-600 dark:text-slate-400">{meta.label}</span>
                        <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className={`h-1.5 rounded-full ${meta.dot}`} style={{ width: `${(row.count / max) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right text-xs font-semibold tabular-nums text-slate-900 dark:text-white">{row.count}</span>
                      </div>
                    );
                  })}
                </div>
                <Link href="/hiring/candidates" className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-[#1346a1] hover:underline dark:text-sky-400">
                  Open candidate pipeline <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Card>

              <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Applications by location</h2>
                <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                  {data.byLocation.length === 0 && <p className="text-sm text-slate-400">No locations</p>}
                  {data.byLocation.map((row) => (
                    <div key={row.locationId} className="flex items-center justify-between py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {row.locationCode || '—'}
                        </span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{row.hired} hired</span>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-slate-900 dark:text-white">{row.count}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">Shard health</h2>
                  <Database className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-4 space-y-2">
                  {data.shardSummaries.map((shard) => (
                    <div key={shard.databaseId} className="flex items-center justify-between rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${shard.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{shard.locationCode || shard.databaseId}</span>
                      </div>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">
                        {shard.success ? `${shard.rowCount} rows · ${shard.latencyMs}ms` : 'unreachable'}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Card className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Upcoming interviews</h2>
                <Badge variant="neutral">{data.upcomingInterviews.length}</Badge>
              </div>
              {data.upcomingInterviews.length === 0 ? (
                <p className="mt-3 text-sm text-slate-400">No interviews scheduled yet.</p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                  {data.upcomingInterviews.slice(0, 8).map((iv) => (
                    <Link
                      key={iv.id}
                      href={`/hiring/candidates/${iv.applicationId}${iv.locationId ? `?location=${iv.locationId}` : ''}`}
                      className="flex items-center justify-between gap-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 -mx-2 px-2 rounded-lg"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300">
                          <CalendarClock className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{iv.candidateName || 'Candidate'}</p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{iv.jobTitle || '—'} {iv.round ? `· Round ${iv.round}` : ''}</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {formatDate(iv.scheduledAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
