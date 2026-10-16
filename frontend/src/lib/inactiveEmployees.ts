/**
 * Inactive Employees data assembly.
 *
 * Employment status and account activity are deliberately kept apart:
 *   • `employee.status`   → HR-set employment state (the only source of truth
 *                           for "is this person part of the active workforce").
 *   • `user.lastLoginAt`  → informational account activity. Nobody is ever
 *                           marked inactive because they have not signed in
 *                           recently, and no UI here derives status from it.
 */
import api from '@/lib/api';
import { normalizeEmployeeCode } from '@/lib/employeeCode';

/** Employment states that mean "not part of the active workforce". */
export const INACTIVE_EMPLOYMENT_STATUSES = [
  'INACTIVE',
  'TERMINATED',
  'RESIGNED',
  'EX_EMPLOYEE',
  'SUSPENDED',
  'LEFT',
  'EXIT',
];

/** Employment states counted in the active workforce (probation is active). */
export const ACTIVE_WORKFORCE_STATUSES = ['ACTIVE', 'PROBATION', 'CONFIRMED', 'ON_LEAVE'];

export function isInactiveStatus(status: unknown): boolean {
  const s = String(status || '').toUpperCase();
  return INACTIVE_EMPLOYMENT_STATUSES.includes(s);
}

export interface AccountInfo {
  userId: string | null;
  email: string | null;
  accountActive: boolean | null;
  lastLoginAt: string | null;
  role: string | null;
}

export type AccountMap = Record<string, AccountInfo>;

/**
 * `GET /users` carries `lastLoginAt` + `isActive` and is linked to the employee
 * record through `employeeId`. HR-only endpoint; when it is unavailable the
 * caller shows "not recorded" rather than guessing.
 */
export async function fetchAccountMap(): Promise<AccountMap> {
  const map: AccountMap = {};
  try {
    const res = await api.get('/users', { params: { limit: 200 } });
    const users: any[] = res.data?.users || [];
    for (const u of users) {
      const employeeId = u.employeeId ? String(u.employeeId) : null;
      if (!employeeId) continue;
      map[employeeId] = {
        userId: u.id || null,
        email: u.email || null,
        accountActive: u.isActive === undefined ? null : Boolean(u.isActive),
        lastLoginAt: u.lastLoginAt || null,
        role: u.role || null,
      };
    }
  } catch {
    // No user-directory access for this role — last login simply stays unknown.
  }
  return map;
}

export interface ExitInfo {
  exitId?: string | null;
  exitType?: string | null;
  reason?: string | null;
  lastWorkingDay?: string | null;
  resignationDate?: string | null;
  exitStatus?: string | null;
  settlementStatus?: string | null;
}

export type ExitMap = Record<string, ExitInfo>;

/** Exit / Full & Final records supply the documented deactivation reason. */
export async function fetchExitMap(): Promise<ExitMap> {
  const map: ExitMap = {};
  try {
    const res = await api.get('/exits', { params: { page: 1, limit: 100 } });
    const rows: any[] = res.data?.exits || res.data?.employees || [];
    for (const row of rows) {
      const employeeId = String(row.employeeId || row.employee_id || row.id || '');
      if (!employeeId) continue;
      map[employeeId] = {
        exitId: row.exit_id || row.exitId || null,
        exitType: row.exit_type || row.exitType || null,
        reason: row.reason || row.exit_reason || row.exitReason || null,
        lastWorkingDay: row.last_working_day || row.lastWorkingDay || null,
        resignationDate: row.resignation_date || row.resignationDate || null,
        exitStatus: row.exit_status || row.exitStatus || null,
        settlementStatus: row.settlement_status || row.settlementStatus || null,
      };
    }
  } catch {
    // Exit workflow not reachable for this role — the reason column then shows
    // whatever the employee record itself carries.
  }
  return map;
}

/** Pull the reason HR (or an import job) stamped onto `employee.remarks`. */
export function reasonFromRemarks(remarks?: string | null): string | null {
  if (!remarks) return null;
  const match = String(remarks).match(/\[Deactivated:\s*([^\]]+)\]/i) || String(remarks).match(/\[Reactivated:\s*([^\]]+)\]/i);
  if (match) return match[1].trim();
  return String(remarks).trim() || null;
}

/**
 * Attendance history summary for one employee — used by the table cell.
 * `GET /attendance?employeeId=` returns a `total`, so a single-row request is
 * enough to know how many days exist without pulling the whole ledger.
 */
export async function fetchAttendanceSummary(employeeId: string): Promise<{ total: number; latest: string | null } | null> {
  try {
    const res = await api.get('/attendance', { params: { employeeId, limit: 1, page: 1 } });
    const rows: any[] = res.data?.attendance || res.data?.attendances || res.data?.records || [];
    const latest = rows[0]?.attendanceDate || rows[0]?.attendance_date || null;
    return { total: Number(res.data?.total ?? rows.length ?? 0), latest };
  } catch {
    return null;
  }
}

/**
 * Historical attendance ledger for the drawer.
 * `GET /attendance/employee/:id` is the per-employee endpoint used by the
 * employee attendance screen too.
 */
export async function fetchAttendanceHistory(employeeId: string, limit = 30): Promise<any[]> {
  const res = await api.get(`/attendance/employee/${employeeId}`, { params: { limit } });
  return res.data?.attendances || res.data?.attendance || [];
}

export interface EmployeeHistoryEntry {
  id: string;
  action: string;
  entityType: string;
  createdAt: string;
  actor: string;
  summary: string;
  oldValue?: any;
  newValue?: any;
}

/**
 * "Who changed this and when" — read from the audit trail.
 * `/audit` filters by entityType/userId/date but not yet by entityId, so the
 * rows are narrowed client-side against this employee. Empty results are
 * surfaced as such in the UI instead of being padded with guesses.
 */
export async function fetchEmployeeAuditTrail(
  employee: { id: string; employeeCode?: string; fullName?: string },
  limit = 50
): Promise<{ entries: EmployeeHistoryEntry[]; limited: boolean }> {
  const entries: EmployeeHistoryEntry[] = [];
  let limited = false;

  try {
    const res = await api.get('/audit', { params: { limit, page: 1 } });
    const logs: any[] = res.data?.logs || [];
    const targetId = String(employee.id);
    const targetCode = normalizeEmployeeCode(employee.employeeCode);

    const relevant = logs.filter((log) => {
      const entityId = String(log.entityId ?? '');
      if (entityId === targetId) return true;
      if (targetCode && entityId && entityId === targetCode) return true;
      const meta = log.newValue && typeof log.newValue === 'object' ? log.newValue : {};
      if (meta.employeeId === targetId || meta.employeeCode === targetCode) return true;
      return false;
    });

    for (const log of relevant) {
      entries.push({
        id: String(log.id),
        action: String(log.action || ''),
        entityType: String(log.entityType || ''),
        createdAt: log.createdAt,
        actor: log.user?.fullName || log.user?.email || log.userId || 'System',
        summary: describeAuditAction(log),
        oldValue: log.oldValue,
        newValue: log.newValue,
      });
    }

    limited = logs.length >= limit && relevant.length === 0;
  } catch {
    // Audit access requires VIEW_SENSITIVE_DATA — the drawer shows a notice.
    return { entries: [], limited: true };
  }

  return { entries, limited };
}

function describeAuditAction(log: any): string {
  const action = String(log.action || '').replace(/_/g, ' ');
  const details = log.newValue && typeof log.newValue === 'object' ? log.newValue : {};
  if (details.previousStatus && details.newStatus) {
    return `${action}: ${details.previousStatus} → ${details.newStatus}${details.reason ? ` · reason: ${details.reason}` : ''}`;
  }
  if (Array.isArray(details.changes) && details.changes.length) {
    return `${action}: ${details.changes.join(', ')}`;
  }
  return action;
}
