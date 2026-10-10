import api from '@/lib/api';

/**
 * Shared filters passed from the Executive Dashboard to drill-down views
 * and the operations summary chart.
 */
export interface DrillFilters {
  /** Hub / location id, or 'all' */
  locationId?: string;
  /** Department id, or 'all' */
  departmentId?: string;
  /** Shift id, or 'all' */
  shiftId?: string;
  /** Employee status (ACTIVE, PROBATION, …), or 'all' */
  status?: string;
  /** yyyy-mm-dd */
  date?: string;
}

/** Filtered employee roster used for enrichment and dept/shift scoping. */
export interface Scope {
  ready: boolean;
  employees: any[];
  inScope: Set<string>;
  empById: Map<string, any>;
}

export const ROSTER_LIMIT = 100;

/** Build a scope map (filtered roster) used for enrichment + dept/shift filtering. */
export async function fetchScope(filters: DrillFilters): Promise<Scope> {
  try {
    const { locationId, departmentId, shiftId, status } = filters;
    const p = new URLSearchParams();
    p.set('limit', String(ROSTER_LIMIT));
    if (locationId && locationId !== 'all') p.set('locationId', locationId);
    if (departmentId && departmentId !== 'all') p.set('departmentId', departmentId);
    if (shiftId && shiftId !== 'all') p.set('shiftId', shiftId);
    if (status && status !== 'all') p.set('status', status);
    const res = await api.get(`/employees?${p.toString()}`).catch(() => ({ data: null }));
    const employees: any[] = res?.data?.employees || [];
    const empById = new Map<string, any>();
    const inScope = new Set<string>();
    for (const e of employees) {
      inScope.add(e.id);
      empById.set(e.id, {
        code: e.employeeCode,
        name: e.fullName || `${e.firstName || ''} ${e.lastName || ''}`.trim(),
        department: e.department?.name || '—',
        hub: e.location?.name || '—',
        shift: e.shift?.name || '—',
        designation: e.designation || '—',
        status: e.status,
      });
    }
    return { ready: true, employees, inScope, empById };
  } catch {
    return { ready: false, employees: [], inScope: new Set(), empById: new Map() };
  }
}

/** Resolve display fields for an employee, falling back to an embedded record. */
export function empOf(scope: Scope, id?: string, fallback?: any): any {
  const scoped = id ? scope.empById.get(id) : undefined;
  return {
    code: scoped?.code || fallback?.employeeCode || '—',
    name: scoped?.name || fallback?.fullName || '—',
    department: scoped?.department || fallback?.department?.name || '—',
    hub: scoped?.hub || fallback?.location?.name || '—',
    shift: scoped?.shift || fallback?.shift?.name || '—',
  };
}
