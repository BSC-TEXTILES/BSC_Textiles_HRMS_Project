'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  Plus, Search, Share2, Copy, Archive, ArchiveRestore, Trash2,
  ExternalLink, Lock, Unlock, RefreshCw, Briefcase, Pencil,
} from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { canAction, useAccessSnapshot } from '@/lib/rbac';
import { HireError } from '@/components/hiring/HireError';
import { LinksModal } from '@/components/hiring/LinksModal';
import { formatSalaryRange, HiringForm, HiringFormDetail, HiringLocation, HiringTemplate } from '@/lib/hiring';
import { CreateFormModal } from './CreateFormModal';

const STATUS_BADGE: Record<string, 'gray' | 'success' | 'warning' | 'neutral'> = {
  DRAFT: 'gray',
  PUBLISHED: 'success',
  CLOSED: 'warning',
  ARCHIVED: 'neutral',
};

export default function HiringFormsPage() {
  const router = useRouter();
  const access = useAccessSnapshot();
  const canCreate = canAction(access, 'RECRUITMENT', 'create');
  const canUpdate = canAction(access, 'RECRUITMENT', 'update');
  const canDelete = canAction(access, 'RECRUITMENT', 'delete');

  const [forms, setForms] = useState<HiringForm[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [locations, setLocations] = useState<HiringLocation[]>([]);
  const [templates, setTemplates] = useState<HiringTemplate[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [shareForm, setShareForm] = useState<HiringFormDetail | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/hiring/forms', {
        params: {
          search: search || undefined,
          status: status || undefined,
          locationId: locationFilter || undefined,
          page,
          limit: 20,
        },
      });
      setForms(res.data?.forms || []);
      setTotal(res.data?.total || 0);
      setTotalPages(res.data?.totalPages || 1);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load job openings');
    } finally {
      setLoading(false);
    }
  }, [search, status, locationFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get('/hiring/locations').then((res) => setLocations(Array.isArray(res.data) ? res.data : [])).catch(() => undefined);
    api.get('/hiring/templates').then((res) => setTemplates(Array.isArray(res.data) ? res.data : [])).catch(() => undefined);
  }, []);

  const locationMap = useMemo(() => {
    const map = new Map<string, HiringLocation>();
    locations.forEach((l) => map.set(l.id, l));
    return map;
  }, [locations]);

  const act = async (id: string, fn: () => Promise<any>, success: string) => {
    setBusyId(id);
    try {
      await fn();
      toast.success(success);
      await load();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };

  const openShare = async (form: HiringForm) => {
    setBusyId(form.id);
    try {
      const res = await api.get(`/hiring/forms/${form.id}`);
      setShareForm(res.data);
      setShareOpen(true);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to load share links');
    } finally {
      setBusyId(null);
    }
  };

  const removeForm = async (form: HiringForm) => {
    if (!confirm(`Delete "${form.title}"? Applications already collected are kept.`)) return;
    await act(form.id, () => api.delete(`/hiring/forms/${form.id}`), 'Opening deleted');
  };

  const statusBadge = (s: string) => <Badge variant={STATUS_BADGE[s] || 'gray'} dot>{s.toLowerCase()}</Badge>;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Job Openings & Application Forms</h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Build the application form, publish it, then share the link or QR — {total} opening{total === 1 ? '' : 's'}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search job title…"
                className="w-56 rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:border-[#1346a1] focus:outline-none focus:ring-1 focus:ring-[#1346a1] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
            <Select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              options={[
                { value: '', label: 'All statuses' },
                { value: 'DRAFT', label: 'Draft' },
                { value: 'PUBLISHED', label: 'Published' },
                { value: 'CLOSED', label: 'Closed' },
                { value: 'ARCHIVED', label: 'Archived' },
              ]}
              className="w-40"
            />
            <Select
              value={locationFilter}
              onChange={(e) => { setLocationFilter(e.target.value); setPage(1); }}
              options={[{ value: '', label: 'All locations' }, ...locations.map((l) => ({ value: l.id, label: l.code }))]}
              className="w-36"
            />
            <Button variant="outline" className="gap-1.5" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {canCreate && (
              <Button className="gap-1.5" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4" /> New opening
              </Button>
            )}
          </div>
        </div>

        {error && <HireError message={error} onRetry={load} />}

        <Card className="rounded-xl border border-slate-200 bg-white p-0 dark:border-slate-800 dark:bg-slate-900">
          {loading && forms.length === 0 ? (
            <div className="space-y-3 p-5">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : forms.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Briefcase className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {search || status || locationFilter ? 'No openings match these filters.' : 'No job openings yet — create your first one.'}
              </p>
              {canCreate && !search && !status && !locationFilter && (
                <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
                  <Plus className="h-3.5 w-3.5" /> New opening
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {forms.map((form) => (
                <div key={form.id} className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => router.push(`/hiring/forms/${form.id}`)}
                        className="truncate text-sm font-semibold text-slate-900 hover:text-[#1346a1] hover:underline dark:text-white dark:hover:text-sky-400"
                      >
                        {form.title}
                      </button>
                      {statusBadge(form.status)}
                      <Badge variant="neutral">{form.employmentType.replace('_', ' ').toLowerCase()}</Badge>
                      {form.templateKey && <Badge variant="info">template</Badge>}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span>{form.openings} opening{form.openings === 1 ? '' : 's'}</span>
                      <span>· {formatSalaryRange(form)}</span>
                      <span>· {(form.locationIds || []).map((id) => locationMap.get(id)?.code || '?').join(', ') || 'No locations'}</span>
                      <span>· {form.views ?? 0} views / {form.submissions ?? 0} submissions</span>
                      <span>· {form.linkCount ?? 0} link{(form.linkCount ?? 0) === 1 ? '' : 's'}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {canUpdate && (
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(`/hiring/forms/${form.id}`)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="gap-1" disabled={busyId === form.id} onClick={() => openShare(form)}>
                      <Share2 className="h-3.5 w-3.5" /> Share
                    </Button>
                    {canUpdate && form.status === 'DRAFT' && (
                      <Button
                        size="sm"
                        variant="success"
                        className="gap-1"
                        disabled={busyId === form.id}
                        onClick={() => act(form.id, () => api.post(`/hiring/forms/${form.id}/publish`), 'Opening published')}
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Publish
                      </Button>
                    )}
                    {canUpdate && form.status === 'PUBLISHED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-amber-700"
                        disabled={busyId === form.id}
                        onClick={() => act(form.id, () => api.post(`/hiring/forms/${form.id}/close`), 'Opening closed')}
                      >
                        <Lock className="h-3.5 w-3.5" /> Close
                      </Button>
                    )}
                    {canUpdate && form.status === 'CLOSED' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1 text-emerald-700"
                        disabled={busyId === form.id}
                        onClick={() => act(form.id, () => api.post(`/hiring/forms/${form.id}/reopen`), 'Opening reopened')}
                      >
                        <Unlock className="h-3.5 w-3.5" /> Reopen
                      </Button>
                    )}
                    {canCreate && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        disabled={busyId === form.id}
                        title="Duplicate opening"
                        onClick={() => act(form.id, () => api.post(`/hiring/forms/${form.id}/duplicate`), 'Opening duplicated')}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canUpdate && form.status !== 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        title="Archive opening"
                        disabled={busyId === form.id}
                        onClick={() => act(form.id, () => api.post(`/hiring/forms/${form.id}/archive`), 'Opening archived')}
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canUpdate && form.status === 'ARCHIVED' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1"
                        title="Unarchive opening"
                        disabled={busyId === form.id}
                        onClick={() => act(form.id, () => api.post(`/hiring/forms/${form.id}/unarchive`), 'Opening restored')}
                      >
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="gap-1 text-red-600 hover:text-red-700"
                        title="Delete opening"
                        disabled={busyId === form.id}
                        onClick={() => removeForm(form)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {totalPages > 1 && (
                <div className="flex items-center justify-between p-4 text-xs text-slate-500 dark:text-slate-400">
                  <span>
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button size="xs" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                    <Button size="xs" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <CreateFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        locations={locations}
        templates={templates}
        onCreated={(form) => {
          setShowCreate(false);
          router.push(`/hiring/forms/${form.id}`);
        }}
      />

      {shareForm && (
        <LinksModal
          open={shareOpen}
          onClose={() => { setShareOpen(false); setShareForm(null); }}
          formId={shareForm.id}
          formTitle={shareForm.title}
          locationIds={shareForm.locationIds}
          allowOtherLocations={Boolean(shareForm.allowOtherLocations)}
          locations={locations}
          onLinksChanged={() => load()}
        />
      )}
    </DashboardLayout>
  );
}
