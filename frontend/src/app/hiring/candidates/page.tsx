'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Search, RefreshCw, Download, LayoutGrid, List, Star, MapPin, Phone, Mail, Users,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { canAction, useAccessSnapshot } from '@/lib/rbac';
import { useSocket } from '@/context/SocketContext';
import { HireError } from '@/components/hiring/HireError';
import { StageBadge } from '@/components/hiring/StageBadge';
import {
  ACTIVE_STAGES, APPLICATION_STAGES, ApplicationStage, HiringApplication,
  HiringApplicationList, HiringForm, HiringLocation, movableStages, stageMeta,
} from '@/lib/hiring';
import { formatDate } from '@/lib/utils';

export default function CandidatePipelinePage() {
  const router = useRouter();
  const access = useAccessSnapshot();
  const { socket } = useSocket();
  const canUpdate = canAction(access, 'RECRUITMENT', 'update');
  const canExport = canAction(access, 'RECRUITMENT', 'export');

  const [apps, setApps] = useState<HiringApplication[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [locationId, setLocationId] = useState('');
  const [formId, setFormId] = useState('');
  const [stages, setStages] = useState<string[]>([]);
  const [starredOnly, setStarredOnly] = useState(false);
  const [view, setView] = useState<'table' | 'kanban'>('table');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStage, setBulkStage] = useState('');
  const [busy, setBusy] = useState(false);

  const [locations, setLocations] = useState<HiringLocation[]>([]);
  const [forms, setForms] = useState<HiringForm[]>([]);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get<HiringApplicationList>('/hiring/applications', {
        params: {
          search: search || undefined,
          locationId: locationId || undefined,
          formId: formId || undefined,
          stages: stages.length ? stages.join(',') : undefined,
          starred: starredOnly ? 'true' : undefined,
          page,
          limit: view === 'kanban' ? 100 : 25,
        },
      });
      setApps(res.data?.applications || []);
      setTotal(res.data?.total || 0);
      setTotalPages(res.data?.totalPages || 1);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load candidates');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [search, locationId, formId, stages, starredOnly, page, view]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/hiring/locations').then((res) => setLocations(Array.isArray(res.data) ? res.data : [])).catch(() => undefined);
    api.get('/hiring/forms', { params: { limit: 100 } }).then((res) => setForms(res.data?.forms || [])).catch(() => undefined);
  }, []);

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

  useEffect(() => {
    setSelected(new Set());
    setBulkStage('');
  }, [page, search, locationId, formId, stages, starredOnly, view]);

  const toggleStageFilter = (stage: string) => {
    setStages((prev) => (prev.includes(stage) ? prev.filter((s) => s !== stage) : [...prev, stage]));
    setPage(1);
  };

  const moveStage = async (app: HiringApplication, toStage: string) => {
    if (!toStage || toStage === app.stage) return;
    setBusy(true);
    try {
      await api.patch(
        `/hiring/applications/${app.id}/stage`,
        { toStage, locationId: app.locationId, shard: app.shard },
        {},
      );
      toast.success(`${app.summary?.fullName || 'Candidate'} moved to ${stageMeta(toStage).label}`);
      await load(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to move candidate');
    } finally {
      setBusy(false);
    }
  };

  const applyBulkStage = async () => {
    if (!bulkStage) return;
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error('Select candidates first');
      return;
    }
    setBusy(true);
    try {
      await api.post('/hiring/applications/bulk-stage', {
        applicationIds: ids,
        toStage: bulkStage,
      });
      toast.success(`${ids.length} candidate${ids.length === 1 ? '' : 's'} moved`);
      setSelected(new Set());
      setBulkStage('');
      await load(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Bulk move failed');
    } finally {
      setBusy(false);
    }
  };

  const exportList = async () => {
    try {
      const res = await api.get('/hiring/export', {
        params: {
          format: 'csv',
          search: search || undefined,
          locationId: locationId || undefined,
          formId: formId || undefined,
          stages: stages.length ? stages.join(',') : undefined,
          starred: starredOnly ? 'true' : undefined,
        },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded');
    } catch (err: any) {
      toast.error('Export failed — check your RECRUITMENT export permission');
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const columns = useMemo(
    () => [
      {
        key: 'select',
        header: '',
        render: (row: HiringApplication) => (
          <input
            type="checkbox"
            checked={selected.has(row.id)}
            onChange={() => toggleSelected(row.id)}
            className="h-4 w-4 rounded border-gray-300 text-[#1346a1]"
          />
        ),
      },
      {
        key: 'candidate',
        header: 'Candidate',
        render: (row: HiringApplication) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900 dark:text-white">
              {row.summary?.fullName || row.candidate?.fullName || 'Unknown'}
              {row.starred && <Star className="ml-1 inline h-3.5 w-3.5 fill-amber-400 text-amber-400" />}
            </p>
            <p className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
              {row.summary?.phone && <span className="inline-flex items-center gap-0.5"><Phone className="h-3 w-3" />{row.summary.phone}</span>}
              {row.summary?.email && <span className="inline-flex items-center gap-0.5 truncate"><Mail className="h-3 w-3" />{row.summary.email}</span>}
            </p>
          </div>
        ),
      },
      {
        key: 'job',
        header: 'Job',
        render: (row: HiringApplication) => (
          <div>
            <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{row.jobTitle || '—'}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              <MapPin className="mr-0.5 inline h-3 w-3" />
              {row.locationCode || row.summary?.city || '—'}
            </p>
          </div>
        ),
      },
      {
        key: 'stage',
        header: 'Stage',
        render: (row: HiringApplication) => <StageBadge stage={row.stage} />,
      },
      {
        key: 'rating',
        header: 'Rating',
        render: (row: HiringApplication) =>
          row.rating ? (
            <span className="inline-flex items-center gap-0.5 text-xs font-medium text-amber-600">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {row.rating}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        key: 'activity',
        header: 'Activity',
        render: (row: HiringApplication) => (
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            {row.noteCount} note{row.noteCount === 1 ? '' : 's'} · {row.interviewCount} interview{row.interviewCount === 1 ? '' : 's'}
          </span>
        ),
      },
      {
        key: 'appliedAt',
        header: 'Applied',
        render: (row: HiringApplication) => <span className="text-xs text-slate-500">{formatDate(row.appliedAt)}</span>,
      },
      {
        key: 'actions',
        header: '',
        render: (row: HiringApplication) => (
          <div className="flex items-center gap-1">
            {canUpdate && movableStages(row.stage).length > 0 && (
              <select
                value=""
                disabled={busy}
                onChange={(e) => moveStage(row, e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              >
                <option value="">Move…</option>
                {movableStages(row.stage).map((s) => (
                  <option key={s} value={s}>{stageMeta(s).label}</option>
                ))}
              </select>
            )}
            <Button size="xs" variant="outline" onClick={() => router.push(`/hiring/candidates/${row.id}?location=${row.locationId}`)}>
              Open
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, busy, canUpdate, router],
  );

  const kanbanStages = stages.length ? (stages.filter((s) => ACTIVE_STAGES.includes(s as ApplicationStage)) as ApplicationStage[]) : ACTIVE_STAGES;
  const grouped = useMemo(() => {
    const map = new Map<string, HiringApplication[]>();
    for (const s of kanbanStages) map.set(s, []);
    for (const app of apps) {
      if (!map.has(app.stage)) map.set(app.stage, []);
      map.get(app.stage)!.push(app);
    }
    return map;
  }, [apps, kanbanStages]);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Candidate Pipeline</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              {total} application{total === 1 ? '' : 's'} in your hiring scope.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Name, phone, email…"
                className="w-56 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-[#1346a1] focus:outline-none focus:ring-1 focus:ring-[#1346a1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <Select
              value={locationId}
              onChange={(e) => { setLocationId(e.target.value); setPage(1); }}
              options={[{ value: '', label: 'All locations' }, ...locations.map((l) => ({ value: l.id, label: l.code }))]}
              className="w-36"
            />
            <Select
              value={formId}
              onChange={(e) => { setFormId(e.target.value); setPage(1); }}
              options={[{ value: '', label: 'All openings' }, ...forms.map((f) => ({ value: f.id, label: f.title }))]}
              className="w-48"
            />
            <Button
              variant={starredOnly ? 'primary' : 'outline'}
              size="sm"
              className="gap-1"
              onClick={() => { setStarredOnly((v) => !v); setPage(1); }}
            >
              <Star className={`h-3.5 w-3.5 ${starredOnly ? 'fill-white' : ''}`} /> Starred
            </Button>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700">
              <Button variant={view === 'table' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('table')}><List className="h-3.5 w-3.5" /></Button>
              <Button variant={view === 'kanban' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('kanban')}><LayoutGrid className="h-3.5 w-3.5" /></Button>
            </div>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {canExport && (
              <Button variant="outline" size="sm" className="gap-1" onClick={exportList}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {APPLICATION_STAGES.map((stage) => {
            const meta = stageMeta(stage);
            const active = stages.includes(stage);
            return (
              <button
                key={stage}
                type="button"
                onClick={() => toggleStageFilter(stage)}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-[#1346a1] bg-[#1346a1] text-white'
                    : `border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300`
                }`}
              >
                <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : meta.dot}`} />
                {meta.label}
              </button>
            );
          })}
          {stages.length > 0 && (
            <button type="button" onClick={() => setStages([])} className="text-[11px] font-medium text-[#1346a1] hover:underline">
              Clear
            </button>
          )}
        </div>

        {error && <HireError message={error} onRetry={() => load()} />}

        {selected.size > 0 && canUpdate && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#1346a1]/20 bg-[#1346a1]/5 px-4 py-2.5">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{selected.size} selected</span>
            <select
              value={bulkStage}
              onChange={(e) => setBulkStage(e.target.value)}
              className="rounded border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
              <option value="">Move all to…</option>
              {APPLICATION_STAGES.map((s) => (
                <option key={s} value={s}>{stageMeta(s).label}</option>
              ))}
            </select>
            <Button size="xs" onClick={applyBulkStage} disabled={!bulkStage || busy}>Apply</Button>
            <Button size="xs" variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
          </div>
        )}

        {view === 'table' ? (
          <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-900">
            {loading && apps.length === 0 ? (
              <div className="space-y-3 p-5">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
                ))}
              </div>
            ) : apps.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-12 text-center">
                <Users className="h-10 w-10 text-slate-300" />
                <p className="text-sm text-slate-500 dark:text-slate-400">No applications match these filters.</p>
              </div>
            ) : (
              <DataTable
                columns={columns as any}
                data={apps}
                rowClick={(row: HiringApplication) => router.push(`/hiring/candidates/${row.id}?location=${row.locationId}`)}
                hoverable
              />
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button size="xs" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            )}
          </Card>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-4">
            {kanbanStages.map((stage) => {
              const meta = stageMeta(stage);
              const columnApps = grouped.get(stage) || [];
              return (
                <div key={stage} className={`w-72 shrink-0 rounded-xl border ${meta.soft} bg-white/60 p-3 dark:bg-slate-900/60`}>
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100">
                      <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                    <Badge variant="neutral">{columnApps.length}</Badge>
                  </div>
                  <div className="mt-3 space-y-2 max-h-[70vh] overflow-y-auto pr-1">
                    {columnApps.length === 0 && <p className="py-4 text-center text-[11px] text-slate-400">Empty</p>}
                    {columnApps.map((app) => (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => router.push(`/hiring/candidates/${app.id}?location=${app.locationId}`)}
                        className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow-md dark:border-slate-700 dark:bg-slate-900"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                            {app.summary?.fullName || app.candidate?.fullName || 'Unknown'}
                          </p>
                          {app.starred && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{app.jobTitle || '—'}</p>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                          <span>{app.locationCode || '—'}</span>
                          <span>{formatDate(app.appliedAt)}</span>
                        </div>
                        {canUpdate && movableStages(app.stage).length > 0 && (
                          <select
                            value=""
                            disabled={busy}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => moveStage(app, e.target.value)}
                            className="mt-2 w-full rounded border border-slate-200 bg-slate-50 px-1.5 py-1 text-[10px] text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            <option value="">Move to…</option>
                            {movableStages(app.stage).map((s) => (
                              <option key={s} value={s}>{stageMeta(s).label}</option>
                            ))}
                          </select>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
