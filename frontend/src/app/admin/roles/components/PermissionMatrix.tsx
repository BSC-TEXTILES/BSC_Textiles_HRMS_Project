'use client';

import { Lock } from 'lucide-react';
import type { RbacModule, AccessLevel } from '@/lib/rbac';

const LEVELS: AccessLevel[] = ['none', 'view', 'edit'];

const LEVEL_STYLES: Record<AccessLevel, string> = {
  none: 'bg-gray-100 text-gray-400 border-gray-200',
  view: 'bg-blue-50 text-blue-700 border-blue-200',
  edit: 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

const ACTIVE_STYLES: Record<AccessLevel, string> = {
  none: 'bg-gray-500 text-white border-gray-500',
  view: 'bg-blue-600 text-white border-blue-600',
  edit: 'bg-emerald-600 text-white border-emerald-600',
};

interface PermissionMatrixProps {
  modules: RbacModule[];
  value: Record<string, AccessLevel>;
  onChange: (next: Record<string, AccessLevel>) => void;
  readOnly?: boolean;
}

/**
 * Module × access-level matrix (None / View / Edit) used in the Create/Edit
 * Role modal.
 */
export function PermissionMatrix({ modules, value, onChange, readOnly = false }: PermissionMatrixProps) {
  const setLevel = (moduleKey: string, level: AccessLevel) => {
    if (readOnly) return;
    onChange({ ...value, [moduleKey]: level });
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-gray-50 text-[11px] uppercase font-semibold text-gray-700 border-b border-gray-200">
          <tr>
            <th className="py-2.5 px-4 min-w-[200px]">Module</th>
            {LEVELS.map((level) => (
              <th key={level} className="py-2.5 px-2 text-center min-w-[70px] capitalize">
                {level === 'none' ? 'No Access' : level}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {modules.map((m) => {
            const current = value[m.key] || 'none';
            return (
              <tr key={m.key} className="hover:bg-gray-50/70">
                <td className="py-2.5 px-4">
                  <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                    {m.label}
                    {current === 'view' && <Lock className="w-3 h-3 text-blue-500" aria-label="Read-only" />}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">{m.description}</div>
                </td>
                {LEVELS.map((level) => (
                  <td key={level} className="py-2.5 px-2 text-center">
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => setLevel(m.key, level)}
                      className={`px-2.5 py-1 rounded-md border text-[11px] font-semibold capitalize transition-colors ${
                        current === level ? ACTIVE_STYLES[level] : LEVEL_STYLES[level]
                      } ${readOnly ? 'cursor-not-allowed opacity-60' : 'hover:opacity-80'}`}
                    >
                      {level === 'none' ? 'None' : level}
                    </button>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

interface ModuleSummaryProps {
  modules: RbacModule[];
  value: Record<string, AccessLevel>;
}

/** Compact badge summary of a role's permissions for the roles list table. */
export function PermissionSummary({ modules, value }: ModuleSummaryProps) {
  const editCount = modules.filter((m) => (value[m.key] || 'none') === 'edit').length;
  const viewCount = modules.filter((m) => (value[m.key] || 'none') === 'view').length;
  const noneCount = modules.length - editCount - viewCount;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {editCount > 0 && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
          {editCount} edit
        </span>
      )}
      {viewCount > 0 && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
          {viewCount} view
        </span>
      )}
      {noneCount > 0 && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">
          {noneCount} none
        </span>
      )}
    </div>
  );
}
