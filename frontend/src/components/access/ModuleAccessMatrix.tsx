'use client';

import { Fragment, useMemo, useState } from 'react';
import { Check, Minus, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import { ACTION_LABELS, RBAC_ACTIONS, type ModuleGrant, type RbacAction } from '@/lib/rbac';
import type { MatrixModule, MatrixWidget } from '@/lib/access';

export type DraftGrants = Record<string, ModuleGrant>;
export type DraftWidgets = Record<string, boolean>;

const AREA_ORDER = ['OVERVIEW', 'HR', 'FLOOR', 'EMPLOYEE', 'ADMIN', 'SYSTEM'];
const AREA_LABELS: Record<string, string> = {
  OVERVIEW: 'Overview',
  HR: 'Human Resources',
  FLOOR: 'Floor / Team',
  EMPLOYEE: 'Employee self-service',
  ADMIN: 'Administration',
  SYSTEM: 'System & Security',
};

function emptyActions(value = false): Record<RbacAction, boolean> {
  return Object.fromEntries(RBAC_ACTIONS.map((a) => [a, value])) as Record<RbacAction, boolean>;
}

export function summariseGrants(draft: DraftGrants): { modules: number; actions: number } {
  let modules = 0;
  let actions = 0;
  for (const grant of Object.values(draft)) {
    if (!grant.enabled) continue;
    modules++;
    actions += RBAC_ACTIONS.filter((a) => grant.actions[a]).length;
  }
  return { modules, actions };
}

function ActionBox({
  checked,
  disabled,
  onChange,
  label,
  moduleLabel,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: (next: boolean) => void;
  label: string;
  moduleLabel: string;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer select-none items-center justify-center rounded-md border px-1.5 py-1 transition-colors',
        disabled && 'cursor-not-allowed opacity-40',
        checked
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-gray-200 bg-white text-gray-400 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800'
      )}
      title={`${label} — ${moduleLabel}`}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {checked ? <Check className="h-4 w-4" aria-hidden="true" /> : <Minus className="h-4 w-4" aria-hidden="true" />}
      <span className="sr-only">{`${label} for ${moduleLabel}`}</span>
    </label>
  );
}

interface Props {
  modules: MatrixModule[];
  widgets: MatrixWidget[];
  draft: DraftGrants;
  widgetDraft: DraftWidgets;
  readOnly: boolean;
  onChange: (next: DraftGrants) => void;
  onWidgetsChange: (next: DraftWidgets) => void;
}

/**
 * The module × action matrix. Every registered module is a row — a module that
 * is missing from the payload would be a silent revocation, so the grid is
 * always complete and the save posts it in full.
 */
export function ModuleAccessMatrix({ modules, widgets, draft, widgetDraft, readOnly, onChange, onWidgetsChange }: Props) {
  const [filter, setFilter] = useState('');

  const grouped = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const visible = modules.filter(
      (m) => !needle || m.label.toLowerCase().includes(needle) || m.key.toLowerCase().includes(needle)
    );
    const byArea = new Map<string, MatrixModule[]>();
    for (const area of AREA_ORDER) byArea.set(area, []);
    for (const mod of visible) {
      const area = byArea.has(mod.area || 'SYSTEM') ? (mod.area as string) : 'SYSTEM';
      byArea.get(area)!.push(mod);
    }
    return [...byArea.entries()].filter(([, list]) => list.length > 0);
  }, [modules, filter]);

  const setGrant = (key: string, next: ModuleGrant) => {
    onChange({ ...draft, [key]: next });
  };

  const toggleModule = (moduleItem: MatrixModule, enabled: boolean) => {
    const current = draft[moduleItem.key] || { module: moduleItem.key, enabled: false, actions: emptyActions() };
    if (enabled) {
      // Turning a module on always grants View — a module with no actions is
      // not a meaningful state, and the server would normalise it away anyway.
      setGrant(moduleItem.key, { ...current, enabled: true, actions: { ...current.actions, view: true } });
    } else {
      setGrant(moduleItem.key, { ...current, enabled: false, actions: emptyActions() });
    }
  };

  const toggleAction = (moduleItem: MatrixModule, action: RbacAction, value: boolean) => {
    const current = draft[moduleItem.key] || { module: moduleItem.key, enabled: false, actions: emptyActions() };
    const actions = { ...current.actions, [action]: value };
    // View is the floor of the grant: it cannot be taken away while the module
    // stays enabled, because every other action implies being able to see it.
    if (action === 'view' && !value) {
      setGrant(moduleItem.key, { module: moduleItem.key, enabled: false, actions: emptyActions() });
      return;
    }
    setGrant(moduleItem.key, { ...current, enabled: true, actions });
  };

  const applyToAll = (mode: 'all' | 'none' | 'view') => {
    const next: DraftGrants = {};
    for (const mod of modules) {
      if (mode === 'none') {
        next[mod.key] = { module: mod.key, enabled: false, actions: emptyActions() };
      } else if (mode === 'view') {
        next[mod.key] = { module: mod.key, enabled: true, actions: { ...emptyActions(), view: true } };
      } else {
        next[mod.key] = { module: mod.key, enabled: true, actions: emptyActions(true) };
      }
    }
    onChange(next);
    if (mode === 'none') {
      const cleared: DraftWidgets = {};
      for (const key of Object.keys(widgetDraft)) cleared[key] = false;
      onWidgetsChange(cleared);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter modules…"
          className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#1346a1]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyToAll('all')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => applyToAll('view')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              View only
            </button>
            <button
              type="button"
              onClick={() => applyToAll('none')}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-red-950/40"
            >
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-slate-700">
        <table className="w-full min-w-[860px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-slate-800/80">
            <tr>
              <th className="w-[46%] px-4 py-3 text-left font-medium text-gray-600 dark:text-slate-300">Module</th>
              <th className="px-3 py-3 text-center font-medium text-gray-600 dark:text-slate-300">Access</th>
              {RBAC_ACTIONS.map((action) => (
                <th key={action} className="px-2 py-3 text-center font-medium text-gray-600 dark:text-slate-300">
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(([area, list]) => (
              <Fragment key={`area-${area}`}>
                <tr className="bg-blue-50/60 dark:bg-slate-800/40">
                  <td colSpan={RBAC_ACTIONS.length + 2} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-[#1346a1] dark:text-blue-300">
                    {AREA_LABELS[area] || area}
                  </td>
                </tr>
                {list.map((module) => {
                  const grant = draft[module.key] || { module: module.key, enabled: false, actions: emptyActions() };
                  return (
                    <tr
                      key={module.key}
                      className="border-t border-gray-100 align-middle dark:border-slate-800"
                    >
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-slate-100">{module.label}</span>
                          {grant.enabled && RBAC_ACTIONS.some((a) => a !== 'view' && grant.actions[a]) && (
                            <Badge variant="success">write</Badge>
                          )}
                        </div>
                        {module.description && (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{module.description}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <label className={cn('inline-flex cursor-pointer items-center', readOnly && 'cursor-not-allowed opacity-50')}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-[#1346a1] focus:ring-[#1346a1]"
                            checked={grant.enabled}
                            disabled={readOnly}
                            onChange={(e) => toggleModule(module, e.target.checked)}
                            aria-label={`Enable ${module.label}`}
                          />
                        </label>
                      </td>
                      {RBAC_ACTIONS.map((action) => (
                        <td key={action} className="px-2 py-2.5 text-center">
                          <ActionBox
                            checked={grant.enabled && grant.actions[action]}
                            disabled={readOnly || !grant.enabled}
                            onChange={(value) => toggleAction(module, action, value)}
                            label={ACTION_LABELS[action]}
                            moduleLabel={module.label}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 p-4 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">Dashboard widgets</h3>
          <span className="text-xs text-gray-500 dark:text-slate-400">
            {Object.values(widgetDraft).filter(Boolean).length} of {widgets.length} visible
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-slate-400">
          Controls which cards this role sees on its dashboard.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {widgets.map((widget) => {
            const checked = Boolean(widgetDraft[widget.key]);
            return (
              <label
                key={widget.id}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                  checked
                    ? 'border-[#1346a1]/40 bg-blue-50/60 dark:border-blue-700 dark:bg-blue-950/30'
                    : 'border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900',
                  readOnly && 'cursor-not-allowed opacity-60'
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#1346a1] focus:ring-[#1346a1]"
                  checked={checked}
                  disabled={readOnly}
                  onChange={(e) => onWidgetsChange({ ...widgetDraft, [widget.key]: e.target.checked })}
                />
                <span>
                  <span className="block font-medium text-gray-800 dark:text-slate-200">{widget.label}</span>
                  {widget.description && (
                    <span className="block text-xs text-gray-500 dark:text-slate-400">{widget.description}</span>
                  )}
                </span>
              </label>
            );
          })}
          {widgets.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-slate-400">No widgets registered yet.</p>
          )}
        </div>
      </div>

      {readOnly && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Your role can view this matrix but not change it. Module access is assigned by an Admin; roles themselves are
            created and edited only by a Super Admin.
          </span>
        </div>
      )}
    </div>
  );
}
