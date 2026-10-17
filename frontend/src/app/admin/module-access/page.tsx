'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, RotateCcw, Save, ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessNav } from '@/components/access/AccessNav';
import { RequireModule } from '@/components/access/RequireModule';
import {
  DraftGrants,
  DraftWidgets,
  ModuleAccessMatrix,
  summariseGrants,
} from '@/components/access/ModuleAccessMatrix';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { apiError, fetchMatrix, fetchRoles, saveMatrix } from '@/lib/access';
import type { AdminRole, MatrixModule, MatrixWidget } from '@/lib/access';
import { RBAC_ACTIONS, invalidateMyAccessCache, useMyAccess, type ModuleGrant, type RbacAction } from '@/lib/rbac';
import { cn } from '@/lib/utils';

function grantsFrom(modules: MatrixModule[]): DraftGrants {
  const draft: DraftGrants = {};
  for (const module of modules) {
    draft[module.key] = {
      module: module.key,
      enabled: Boolean(module.grant?.enabled),
      actions: { ...(module.grant?.actions || ({} as Record<RbacAction, boolean>)) },
    };
  }
  return draft;
}

function widgetsFrom(widgets: MatrixWidget[]): DraftWidgets {
  return Object.fromEntries(widgets.map((w) => [w.key, Boolean(w.visible)])) as DraftWidgets;
}

export default function ModuleAccessPage() {
  const access = useMyAccess();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const [roleId, setRoleId] = useState<string | null>(null);
  const [modules, setModules] = useState<MatrixModule[]>([]);
  const [widgets, setWidgets] = useState<MatrixWidget[]>([]);
  const [baseline, setBaseline] = useState<DraftGrants>({});
  const [baselineWidgets, setBaselineWidgets] = useState<DraftWidgets>({});
  const [draft, setDraft] = useState<DraftGrants>({});
  const [widgetDraft, setWidgetDraft] = useState<DraftWidgets>({});
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const readOnly = access.source === 'rbac' && !access.canAssignModuleAccess;

  useEffect(() => {
    if (access.loading) return;
    (async () => {
      setLoadingRoles(true);
      try {
        const { roles: list } = await fetchRoles();
        setRoles(list);
        // Deep link from Role Management ("Access") preselects the role. Read
        // from the location directly so the page needs no Suspense boundary.
        const wanted = new URLSearchParams(window.location.search).get('role');
        const preferred =
          list.find((role) => role.id === wanted) ||
          list.find((role) => role.isActive && !role.isSystem) ||
          list.find((role) => role.isActive) ||
          list[0];
        if (preferred) setRoleId(preferred.id);
      } catch (err: any) {
        setError(apiError(err, 'Could not load roles'));
      } finally {
        setLoadingRoles(false);
      }
    })();
  }, [access.loading]);

  const loadMatrix = useCallback(async (id: string) => {
    setLoadingMatrix(true);
    setError(null);
    try {
      const matrix = await fetchMatrix(id);
      setModules(matrix.modules);
      setWidgets(matrix.widgets);
      setBaseline(grantsFrom(matrix.modules));
      setBaselineWidgets(widgetsFrom(matrix.widgets));
      setDraft(grantsFrom(matrix.modules));
      setWidgetDraft(widgetsFrom(matrix.widgets));
    } catch (err: any) {
      setError(apiError(err, 'Could not load this role’s matrix'));
      setModules([]);
      setWidgets([]);
      setDraft({});
      setBaseline({});
    } finally {
      setLoadingMatrix(false);
    }
  }, []);

  useEffect(() => {
    if (roleId) loadMatrix(roleId);
  }, [roleId, loadMatrix]);

  const selectedRole = roles.find((role) => role.id === roleId) || null;

  const isDirty = useMemo(() => {
    for (const module of modules) {
      const now = draft[module.key];
      const was = baseline[module.key];
      if (!now || !was) return true;
      if (now.enabled !== was.enabled) return true;
      if (RBAC_ACTIONS.some((action) => Boolean(now.actions[action]) !== Boolean(was.actions[action]))) return true;
    }
    for (const widget of widgets) {
      if (Boolean(widgetDraft[widget.key]) !== Boolean(baselineWidgets[widget.key])) return true;
    }
    return false;
  }, [modules, draft, baseline, widgets, widgetDraft, baselineWidgets]);

  const summary = summariseGrants(draft);
  const widgetSummary = Object.values(widgetDraft).filter(Boolean).length;

  const onSave = async () => {
    if (!roleId) return;
    setSaving(true);
    try {
      const payload = modules.map((module) => {
        const grant: ModuleGrant = draft[module.key] || { module: module.key, enabled: false, actions: {} as any };
        return { module: module.key, enabled: grant.enabled, actions: grant.actions };
      });
      const visibleWidgets = widgets.filter((w) => widgetDraft[w.key]).map((w) => w.key);
      const result = await saveMatrix(roleId, payload, visibleWidgets);
      const matrix = result.matrix;
      setModules(matrix.modules);
      setWidgets(matrix.widgets);
      setBaseline(grantsFrom(matrix.modules));
      setBaselineWidgets(widgetsFrom(matrix.widgets));
      setDraft(grantsFrom(matrix.modules));
      setWidgetDraft(widgetsFrom(matrix.widgets));
      // The current user's own grants may have just changed, so the sidebar and
      // every <Can> check must re-read them.
      invalidateMyAccessCache();
      toast.success(result.message || 'Module access saved');
    } catch (err: any) {
      toast.error(apiError(err, 'Could not save module access'));
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    setDraft({ ...baseline });
    setWidgetDraft({ ...baselineWidgets });
    toast('Changes discarded', { icon: '↺' });
  };

  return (
    <DashboardLayout>
      <RequireModule module="MODULE_ACCESS">
      <div className="space-y-5">
        <AccessNav access={access} />

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-slate-100">Module Access</h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
              Choose a role, then decide exactly what it may do on each module. Saving applies immediately and is
              recorded in the audit trail.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && !readOnly && (
              <Badge variant="warning" dot>
                Unsaved changes
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={onReset} disabled={!isDirty || saving || readOnly}>
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
            {!readOnly && (
              <Button size="sm" onClick={onSave} loading={saving} disabled={!isDirty || loadingMatrix || modules.length === 0}>
                {!saving && <Save className="h-4 w-4" aria-hidden="true" />}
                Save access
              </Button>
            )}
          </div>
        </div>

        {access.loading ? (
          <Card>
            <CardContent className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Loading your permissions…
            </CardContent>
          </Card>
        ) : (
          <>
            <Card padding={false}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-semibold text-gray-900 dark:text-slate-100">Roles</h2>
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    {summary.modules} module(s) enabled · {summary.actions} action grant(s) · {widgetSummary} widget(s)
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {loadingRoles && <p className="text-sm text-gray-500">Loading roles…</p>}
                {roles.map((role) => {
                  const active = role.id === roleId;
                  return (
                    <button
                      key={role.id}
                      type="button"
                      onClick={() => setRoleId(role.id)}
                      className={cn(
                        'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        active
                          ? 'border-[#1346a1] bg-[#1346a1] text-white shadow-sm'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                      )}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        {role.name.replace(/_/g, ' ')}
                        {!role.isActive && (
                          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold', active ? 'bg-white/20' : 'bg-gray-100 text-gray-500')}>
                            inactive
                          </span>
                        )}
                      </span>
                      <span className={cn('mt-0.5 block text-xs', active ? 'text-blue-100' : 'text-gray-500 dark:text-slate-400')}>
                        {role.userCount} user{role.userCount === 1 ? '' : 's'}
                      </span>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {error && (
              <Card>
                <CardContent className="flex items-center justify-between gap-3">
                  <p className="text-sm text-red-600">{error}</p>
                  {roleId && (
                    <Button size="sm" variant="outline" onClick={() => loadMatrix(roleId)}>
                      Retry
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {selectedRole && !selectedRole.isActive && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {selectedRole.name.replace(/_/g, ' ')} is deactivated. Users assigned to it inherit nothing from it
                  until a Super Admin reactivates it.
                </span>
              </div>
            )}

            {loadingMatrix ? (
              <Card>
                <CardContent className="flex items-center gap-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading matrix…
                </CardContent>
              </Card>
            ) : modules.length > 0 ? (
              <ModuleAccessMatrix
                modules={modules}
                widgets={widgets}
                draft={draft}
                widgetDraft={widgetDraft}
                readOnly={readOnly}
                onChange={setDraft}
                onWidgetsChange={setWidgetDraft}
              />
            ) : null}
          </>
        )}
      </div>
      </RequireModule>
    </DashboardLayout>
  );
}
