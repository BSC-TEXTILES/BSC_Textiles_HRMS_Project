import type { ReactNode } from 'react';

/**
 * Shared presentation primitives for drill-down detail views:
 * status pills, employee cells, and value formatters.
 * Used by MetricDrillDownModal, DetailDrillDownModal, and related views.
 */

export const TONE = {
  green: 'bg-[#eff4ff] dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 border border-[#dce9ff] dark:border-blue-900',
  red: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  amber: 'bg-blue-50/50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900',
  blue: 'bg-[#eff4ff] dark:bg-blue-950/60 text-[#0058be] dark:text-blue-300 border border-[#dce9ff] dark:border-blue-900',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
} as const;

export type Tone = keyof typeof TONE;

export function Pill({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/**
 * Employee identity cell. When `profileId` is provided the cell signals that
 * the row can be opened in the employee profile (hover underline + icon);
 * activation itself is handled by the parent row.
 */
export function EmpCell({ code, name, profileId }: { code?: string; name?: string; profileId?: string }) {
  const initials = (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex items-center gap-2 min-w-[150px]">
      <div className="w-7 h-7 rounded-full bg-[#131b2e] dark:bg-slate-800 text-white flex items-center justify-center font-bold text-[10px] flex-shrink-0 border border-slate-700/50">
        {initials}
      </div>
      <div className="min-w-0">
        <div className={`font-bold text-[#0b1c30] dark:text-slate-100 truncate max-w-[160px] ${profileId ? 'group-hover:text-[#0058be] dark:group-hover:text-blue-400 group-hover:underline' : ''}`}>
          {name || '—'}
        </div>
        <div className="text-[10px] font-mono text-slate-400 dark:text-slate-500 flex items-center gap-1">
          <span>{code || '—'}</span>
          {profileId && (
            <span className="material-symbols-outlined text-[11px] text-[#0058be] dark:text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
              open_in_new
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function fmtTime(v?: string | null): string {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  } catch {
    /* fall through */
  }
  return String(v);
}

export function fmtDate(v?: string | null): string {
  if (!v) return '—';
  try {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    /* fall through */
  }
  return String(v);
}

export function prettyEnum(v?: string | null): string {
  if (!v) return '—';
  return String(v)
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const EMP_STATUS_TONE: Record<string, Tone> = {
  ACTIVE: 'green',
  PROBATION: 'amber',
  ON_LEAVE: 'amber',
  LEAVE: 'amber',
  INACTIVE: 'slate',
  TERMINATED: 'red',
};

export const ATT_STATUS_TONE: Record<string, Tone> = {
  PRESENT: 'green',
  EARLY: 'green',
  ON_TIME: 'green',
  OVERTIME: 'blue',
  LATE: 'amber',
  ON_LUNCH: 'blue',
  ON_TEA_BREAK: 'blue',
  WEEKLY_OFF: 'slate',
  ABSENT: 'red',
  FACE_VERIFICATION_FAILED: 'red',
};

export const INC_STATUS_TONE: Record<string, Tone> = {
  APPROVED: 'green',
  PAID: 'green',
  PENDING: 'amber',
  REJECTED: 'red',
};

export const BREAK_TYPE_TONE: Record<string, Tone> = { LUNCH: 'amber', TEA: 'blue', OTHER: 'slate' };

export const ON_FLOOR = new Set(['PRESENT', 'EARLY', 'ON_TIME', 'OVERTIME']);

/** Table column definition used by drill-down detail views. */
export interface DrillColumn {
  key: string;
  header: string;
  render: (row: any) => ReactNode;
  className?: string;
}
