/**
 * Employee Roster Service — the single read/write path for the employee roster.
 *
 * Why this exists: the codebase grew two parallel schemas for the same people
 * (`employee` camelCase, legacy, anchored to every foreign key and to
 * authentication; `employees` snake_case, seed). Different routes read
 * different ones, so the same employee could appear in one screen and be absent
 * from another. Migration 023-024 consolidated the rows into `employee` and
 * turned `employees` into a view over it; this service is the only path the new
 * HR endpoints use, and it reads the authoritative table directly.
 *
 * Every method here is location-scoped by the CALLER's resolved scope, never by
 * a client-supplied array, and returns the employee number as stored (digits,
 * leading zeros intact) alongside the preserved legacy identifier.
 */
import type { PoolConnection } from 'mysql2/promise';
import { pool, prisma } from '../db.js';
import { AuditService } from './auditService.js';
import { validateEmployeeCode } from '../utils/employeeCode.js';
import { resolveLocationAlias } from './locationRegistry.js';

export type EmploymentStatus =
  | 'ACTIVE' | 'INACTIVE' | 'ON_LEAVE' | 'TERMINATED'
  | 'RESIGNED' | 'RETIRED' | 'EX_EMPLOYEE' | 'SUSPENDED';

export const EMPLOYMENT_STATUSES: EmploymentStatus[] = [
  'ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED', 'RETIRED', 'EX_EMPLOYEE', 'SUSPENDED',
];

/** Statuses that mean "this person is not part of the working roster". */
export const INACTIVE_STATUSES: EmploymentStatus[] = [
  'INACTIVE', 'ON_LEAVE', 'TERMINATED', 'RESIGNED', 'RETIRED', 'EX_EMPLOYEE', 'SUSPENDED',
];

const SELECT_COLUMNS = `
  e.\`id\`,
  e.\`employeeCode\`,
  e.\`legacyEmployeeCode\`,
  e.\`employeeCodeProposal\`,
  e.\`employeeCodeOrigin\`,
  e.\`requiresHrCodeReview\`,
  e.\`firstName\`, e.\`middleName\`, e.\`lastName\`, e.\`fullName\`,
  e.\`email\`, e.\`phone\`, e.\`alternatePhone\`, e.\`gender\`, e.\`dateOfBirth\`,
  e.\`locationId\`, e.\`floorId\`, e.\`departmentId\`, e.\`sectionId\`, e.\`shiftId\`,
  e.\`legacyFloorId\`, e.\`legacyDepartmentId\`, e.\`legacySectionId\`, e.\`legacyShiftId\`, e.\`legacySellingPointId\`,
  e.\`designation\`, e.\`role\`,
  e.\`status\` AS \`employmentStatus\`,
  e.\`employmentStatusChangedAt\`, e.\`employmentStatusChangedById\`, e.\`employmentStatusReason\`,
  e.\`joiningDate\`, e.\`exitDate\`, e.\`confirmationDate\`, e.\`reportingManagerId\`,
  e.\`employmentType\`, e.\`employeeCategory\`,
  e.\`attendanceEligible\`, e.\`biometricDeviceEmployeeId\`, e.\`salesmanNo\`, e.\`batch\`,
  e.\`photoReference\`, e.\`documentStatus\`, e.\`remarks\`,
  e.\`rowVersion\`, e.\`rosterSource\`, e.\`createdAt\`, e.\`updatedAt\`,
  loc.\`code\` AS \`locationCode\`, loc.\`name\` AS \`locationName\`,
  dept.\`name\` AS \`departmentName\`,
  fl.\`name\` AS \`floorName\`,
  sec.\`name\` AS \`sectionName\`,
  sh.\`name\` AS \`shiftName\`, sh.\`startTime\` AS \`shiftStartTime\`, sh.\`endTime\` AS \`shiftEndTime\`,
  u.\`id\` AS \`userId\`,
  u.\`accessStatus\` AS \`accountAccessStatus\`,
  u.\`status\` AS \`accountStatus\`,
  u.\`isActive\` AS \`accountIsActive\`,
  u.\`lastLoginAt\`,
  u.\`hasEverLoggedIn\`,
  CASE
    WHEN u.\`id\` IS NULL THEN 'NO_ACCOUNT'
    WHEN u.\`accessStatus\` = 'ACTIVE' AND u.\`lockedUntil\` IS NOT NULL AND u.\`lockedUntil\` > NOW() THEN 'LOCKED'
    ELSE u.\`accessStatus\`
  END AS \`effectiveAccessStatus\`
`;

const FROM_CLAUSE = `
  FROM \`employee\` e
  LEFT JOIN \`location\`   loc  ON loc.\`id\`  = e.\`locationId\`
  LEFT JOIN \`department\` dept ON dept.\`id\` = e.\`departmentId\`
  LEFT JOIN \`floor\`      fl   ON fl.\`id\`   = e.\`floorId\`
  LEFT JOIN \`section\`    sec  ON sec.\`id\`  = e.\`sectionId\`
  LEFT JOIN \`shift\`      sh   ON sh.\`id\`   = e.\`shiftId\`
  LEFT JOIN \`user\`       u    ON u.\`employeeId\` = e.\`id\`
`;

export interface RosterFilters {
  status?: string;
  locationId?: string;
  departmentId?: string;
  sectionId?: string;
  floorId?: string;
  shiftId?: string;
  /** Matches the employee number (exact or prefix) or a name fragment. */
  search?: string;
  joinedFrom?: string;
  joinedTo?: string;
  exitFrom?: string;
  exitTo?: string;
  updatedFrom?: string;
  updatedTo?: string;
  requiresHrCodeReview?: boolean;
  page?: number;
  limit?: number;
  orderBy?: 'employeeCode' | 'fullName' | 'joiningDate' | 'updatedAt';
  order?: 'asc' | 'desc';
}

export interface CallerScope {
  userId: string;
  role: string;
  /** Resolved authoritative location id, or undefined for unrestricted roles. */
  locationId?: string;
}

const ORDERABLE: Record<string, string> = {
  employeeCode: "LPAD(e.`employeeCode`, 30, '0')",
  fullName: 'e.`fullName`',
  joiningDate: 'e.`joiningDate`',
  updatedAt: 'e.`updatedAt`',
};

function buildWhere(filters: RosterFilters, scope: CallerScope): { sql: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  // ---- server-side location scoping, never trusting a client-supplied list --
  if (scope.locationId) {
    clauses.push('e.`locationId` = ?');
    params.push(scope.locationId);
  }

  // ---- status ---------------------------------------------------------------
  const status = (filters.status || '').trim().toUpperCase();
  if (status && status !== 'ALL') {
    if (status === 'INACTIVE_ROSTER') {
      const placeholders = INACTIVE_STATUSES.map(() => '?').join(',');
      clauses.push(`e.\`status\` IN (${placeholders})`);
      params.push(...INACTIVE_STATUSES);
    } else if (EMPLOYMENT_STATUSES.includes(status as EmploymentStatus)) {
      clauses.push('e.`status` = ?');
      params.push(status);
    } else {
      clauses.push('1 = 0');
    }
  }

  // Explicit filters are still constrained by the caller's scope above.
  const locationFilter = resolveLocationAlias(filters.locationId);
  if (locationFilter && !scope.locationId) {
    clauses.push('e.`locationId` = ?');
    params.push(locationFilter);
  }

  if (filters.departmentId && filters.departmentId !== 'all') {
    if (filters.departmentId.includes(',')) {
      const ids = filters.departmentId.split(',').map((s) => s.trim()).filter(Boolean);
      clauses.push(`e.\`departmentId\` IN (${ids.map(() => '?').join(',')})`);
      params.push(...ids);
    } else {
      clauses.push('e.`departmentId` = ?');
      params.push(filters.departmentId);
    }
  }
  if (filters.sectionId && filters.sectionId !== 'all') {
    clauses.push('e.`sectionId` = ?');
    params.push(filters.sectionId);
  }
  if (filters.floorId && filters.floorId !== 'all') {
    clauses.push('e.`floorId` = ?');
    params.push(filters.floorId);
  }
  if (filters.shiftId && filters.shiftId !== 'all') {
    clauses.push('e.`shiftId` = ?');
    params.push(filters.shiftId);
  }

  // ---- search: employee number or name -------------------------------------
  const search = (filters.search || '').trim();
  if (search) {
    if (/^[0-9]+$/.test(search)) {
      // A digits-only query is almost always a store number: match the stored
      // number exactly, by prefix, and the preserved legacy identifier.
      clauses.push(`(e.\`employeeCode\` = ?
                     OR e.\`employeeCode\` LIKE ?
                     OR e.\`legacyEmployeeCode\` LIKE ?
                     OR e.\`fullName\` LIKE ?)`);
      params.push(search, `${search}%`, `%${search}%`, `%${search}%`);
    } else {
      clauses.push('(e.`fullName` LIKE ? OR e.`firstName` LIKE ? OR e.`lastName` LIKE ? OR e.`email` LIKE ? OR e.`legacyEmployeeCode` LIKE ?)');
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }
  }

  // ---- date ranges ----------------------------------------------------------
  const dateRange = (column: string, from?: string, to?: string, label = '') => {
    if (from) {
      clauses.push(`${column} >= ?`);
      params.push(new Date(`${from}T00:00:00`));
    }
    if (to) {
      clauses.push(`${column} <= ?`);
      params.push(new Date(`${to}T23:59:59.999`));
    }
  };
  dateRange('e.`joiningDate`', filters.joinedFrom, filters.joinedTo);
  dateRange('e.`exitDate`', filters.exitFrom, filters.exitTo);
  dateRange('e.`updatedAt`', filters.updatedFrom, filters.updatedTo);

  if (filters.requiresHrCodeReview !== undefined) {
    clauses.push('e.`requiresHrCodeReview` = ?');
    params.push(filters.requiresHrCodeReview ? 1 : 0);
  }

  return { sql: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

/** Page through the roster with the filters the HR screens need. */
export async function listRoster(
  filters: RosterFilters,
  scope: CallerScope
): Promise<{
  employees: any[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  counts: { active: number; inactive: number; total: number; byStatus: Record<string, number> };
}> {
  const page = Math.max(1, Number(filters.page || 1));
  const limit = Math.min(Math.max(Number(filters.limit || 25), 1), 200);
  const offset = (page - 1) * limit;
  const { sql: whereSql, params } = buildWhere(filters, scope);

  const orderBy = ORDERABLE[filters.orderBy || 'employeeCode'] || ORDERABLE.employeeCode;
  const order = (filters.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';

  const [rows] = await pool.query<any[]>(
    `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} ${whereSql}
      ORDER BY ${orderBy} ${order}, e.\`id\` ASC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  // Counts respect the same filters, so "Active 41 / Inactive 12" describes the
  // screen the HR user is looking at, not the whole database.
  const [countRows] = await pool.query<any[]>(
    `SELECT e.\`status\` AS employmentStatus, COUNT(*) AS n ${FROM_CLAUSE} ${whereSql}
      GROUP BY e.\`status\``,
    params
  );

  const byStatus: Record<string, number> = {};
  let active = 0;
  let inactive = 0;
  for (const row of countRows) {
    const n = Number(row.n);
    byStatus[row.employmentStatus] = n;
    if (INACTIVE_STATUSES.includes(row.employmentStatus as EmploymentStatus)) inactive += n;
    else active += n;
  }

  return {
    employees: rows.map(shapeEmployee),
    pagination: { page, limit, total: active + inactive, totalPages: Math.max(1, Math.ceil((active + inactive) / limit)) },
    counts: { active, inactive, total: active + inactive, byStatus },
  };
}

/**
 * The single display shape for an employee number.
 * Stored value is authoritative and keeps leading zeros; the legacy identifier
 * is exposed separately so HR can see what the record used to be called.
 */
export function shapeEmployee(row: any): any {
  if (!row) return row;
  const employeeCode = row.employeeCode ?? null;
  return {
    ...row,
    employeeCode,
    employeeCodeDisplay: employeeCode,
    employeeNumber: employeeCode,
    legacyEmployeeCode: row.legacyEmployeeCode ?? null,
    isNonConformingEmployeeNumber: row.requiresHrCodeReview === 1,
    hasLoginAccount: !!row.userId,
    employmentStatus: row.employmentStatus ?? row.status,
  };
}

export async function findEmployeeById(id: string): Promise<any | null> {
  const [rows] = await pool.query<any[]>(`SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE} WHERE e.\`id\` = ? LIMIT 1`, [id]);
  return rows.length ? shapeEmployee(rows[0]) : null;
}

export async function findEmployeeByCode(code: string): Promise<any | null> {
  const [rows] = await pool.query<any[]>(
    `SELECT ${SELECT_COLUMNS} ${FROM_CLAUSE}
      WHERE e.\`employeeCode\` = ? OR e.\`legacyEmployeeCode\` = ? LIMIT 1`,
    [code, code]
  );
  return rows.length ? shapeEmployee(rows[0]) : null;
}

/**
 * Full former/inactive employee detail: the person's record, their historical
 * attendance, their historical payroll, their documents and their status
 * history. Nothing here deletes or hides anything — an employee who left years
 * ago remains fully retrievable and searchable.
 */
export async function getEmployeeFullHistory(employeeId: string, opts?: {
  attendanceFrom?: string;
  attendanceTo?: string;
  limit?: number;
}): Promise<any> {
  const employee = await findEmployeeById(employeeId);
  if (!employee) return null;

  const limit = Math.min(Math.max(Number(opts?.limit || 200), 1), 1000);
  const attParams: any[] = [employeeId];
  let attRange = '';
  if (opts?.attendanceFrom) { attRange += ' AND a.`attendanceDate` >= ?'; attParams.push(new Date(`${opts.attendanceFrom}T00:00:00`)); }
  if (opts?.attendanceTo) { attRange += ' AND a.`attendanceDate` <= ?'; attParams.push(new Date(`${opts.attendanceTo}T23:59:59.999`)); }

  const [attendance] = await pool.query<any[]>(
    `SELECT a.\`id\`, a.\`attendanceDate\`, a.\`actualLogin\`, a.\`actualLogout\`, a.\`status\`,
            a.\`totalWorkingSeconds\`, a.\`lateLoginSeconds\`, a.\`overtimeSeconds\`,
            a.\`locationId\`, l.\`code\` AS \`locationCode\`, l.\`name\` AS \`locationName\`
       FROM \`attendance\` a
       LEFT JOIN \`location\` l ON l.\`id\` = a.\`locationId\`
      WHERE a.\`employeeId\` = ?${attRange}
      ORDER BY a.\`attendanceDate\` DESC
      LIMIT ?`,
    [...attParams, limit]
  );

  // Both payroll generations are read: `payrollitem` (authoritative) and
  // `payroll_items` (the seed run set), so a former employee's history is not
  // silently split by which pipeline produced it.
  const [payroll] = await pool.query<any[]>(
    `SELECT pi.\`id\`, pi.\`employeeId\`, pi.\`salaryMonth\`, pi.\`salaryYear\`, pi.\`basicSalary\`,
            pi.\`grossEarnings\`, pi.\`netPay\`, pi.\`status\`, pi.\`createdAt\`,
            pr.\`periodStart\`, pr.\`periodEnd\`, 'payrollitem' AS \`source\`
       FROM \`payrollitem\` pi
       LEFT JOIN \`payrollrun\` pr ON pr.\`id\` = pi.\`payrollRunId\`
      WHERE pi.\`employeeId\` = ?
      UNION ALL
      SELECT pi2.\`id\`, pi2.\`employee_id\`, NULL, NULL, pi2.\`basic_salary\`, pi2.\`gross_earnings\`,
             pi2.\`net_pay\`, pi2.\`status\`, pi2.\`created_at\`, pr2.\`period_start\`, pr2.\`period_end\`, 'payroll_items'
        FROM \`payroll_items\` pi2
        LEFT JOIN \`payroll_runs\` pr2 ON pr2.\`id\` = pi2.\`payroll_run_id\`
       WHERE pi2.\`employee_id\` = ?
       ORDER BY \`periodStart\` DESC, \`createdAt\` DESC
       LIMIT ?`,
    [employeeId, employeeId, limit]
  );

  const [documents] = await pool.query<any[]>(
    `SELECT \`id\`, \`documentType\`, \`title\`, \`category\`, \`fileName\`, \`fileSize\`,
            \`mimeType\`, \`issueDate\`, \`expiryDate\`, \`verificationStatus\`,
            \`documentNumberMasked\`, \`version\`, \`uploadedByName\`, \`uploadedByRole\`,
            \`verifiedByName\`, \`createdAt\`, \`updatedAt\`
       FROM \`employee_documents\`
      WHERE \`employeeId\` = ?
      ORDER BY \`createdAt\` DESC`,
    [employeeId]
  );

  const [leaves] = await pool.query<any[]>(
    `SELECT \`id\`, \`leaveType\`, \`startDate\`, \`endDate\`, \`status\`, \`reason\`, \`appliedAt\`
       FROM \`leaverequest\` WHERE \`employeeId\` = ? ORDER BY \`startDate\` DESC LIMIT ?`,
    [employeeId, limit]
  );

  const [statusHistory] = await pool.query<any[]>(
    `SELECT h.\`id\`, h.\`previousStatus\`, h.\`newStatus\`, h.\`reason\`, h.\`changedById\`,
            h.\`source\`, h.\`createdAt\`, au.\`fullName\` AS \`changedByName\`, au.\`email\` AS \`changedByEmail\`
       FROM \`employment_status_history\` h
       LEFT JOIN \`user\` au ON au.\`id\` = h.\`changedById\`
      WHERE h.\`employeeId\` = ?
      ORDER BY h.\`createdAt\` DESC`,
    [employeeId]
  );

  const [exit] = await pool.query<any[]>(
    `SELECT ex.\`id\` AS \`exitId\`, ex.\`exit_type\`, ex.\`resignation_date\`, ex.\`last_working_day\`,
            ex.\`status\` AS \`exitStatus\`, fnf.\`id\` AS \`settlementId\`,
            fnf.\`status\` AS \`settlementStatus\`, fnf.\`net_payable\` AS \`settlementNetPayable\`,
            fnf.\`payment_date\` AS \`settlementPaymentDate\`
       FROM \`employee_exits\` ex
       LEFT JOIN \`fnf_settlements\` fnf ON fnf.\`exit_id\` = ex.\`id\`
      WHERE ex.\`employee_id\` = ?`,
    [employeeId]
  );

  return {
    employee,
    history: {
      attendance: { count: attendance.length, records: attendance },
      payroll: { count: payroll.length, records: payroll },
      documents: { count: documents.length, records: documents },
      leaves: { count: leaves.length, records: leaves },
      statusChanges: statusHistory,
      exit: exit.length ? exit[0] : null,
    },
  };
}

export interface StatusChangeActor {
  userId: string;
  userName: string;
  role: string;
  ipAddress: string;
  userAgent: string;
}

export class StatusChangeError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any) {
    super(message);
  }
}

/**
 * Change an EMPLOYMENT status. Deliberately separate from account access:
 * this never touches `user.isActive`, `user.status` or `user.accessStatus`, and
 * disabling a login is a different endpoint. Runs in one transaction and writes
 * an audit entry; the database trigger adds the append-only history row and
 * refuses a transition that arrives without an actor and a reason.
 */
export async function changeEmploymentStatus(
  employeeId: string,
  targetStatus: EmploymentStatus,
  reason: string,
  actor: StatusChangeActor,
  opts?: { expectedRowVersion?: number; notifyAccount?: boolean }
): Promise<{ employee: any; previousStatus: EmploymentStatus }> {
  if (!EMPLOYMENT_STATUSES.includes(targetStatus)) {
    throw new StatusChangeError(422, 'INVALID_STATUS', `Unknown employment status "${targetStatus}".`, {
      allowed: EMPLOYMENT_STATUSES,
    });
  }
  const trimmedReason = (reason || '').trim();
  if (trimmedReason.length < 5) {
    throw new StatusChangeError(422, 'REASON_REQUIRED',
      'A reason is required for every employment status change (at least 5 characters).');
  }

  const conn: PoolConnection = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [current] = await conn.query<any[]>(
      'SELECT `id`, `employeeCode`, `fullName`, `status`, `locationId`, `rowVersion`, `exitDate` FROM `employee` WHERE `id` = ? FOR UPDATE',
      [employeeId]
    );
    if (!current.length) {
      throw new StatusChangeError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
    }
    const before = current[0];

    if (opts?.expectedRowVersion !== undefined && Number(opts.expectedRowVersion) !== Number(before.rowVersion)) {
      throw new StatusChangeError(409, 'CONFLICT',
        `This employee record was changed by someone else while you were editing it (expected version ${opts.expectedRowVersion}, current ${before.rowVersion}). Reload and re-apply.`,
        { currentVersion: Number(before.rowVersion), employeeId });
    }

    const exitDate = targetStatus === 'TERMINATED' || targetStatus === 'RESIGNED' || targetStatus === 'RETIRED' || targetStatus === 'EX_EMPLOYEE'
      ? (before.exitDate ?? new Date())
      : null;

    const [result] = await conn.query<any>(
      `UPDATE \`employee\`
          SET \`status\` = ?,
              \`exitDate\` = ?,
              \`employmentStatusChangedAt\` = NOW(3),
              \`employmentStatusChangedById\` = ?,
              \`employmentStatusReason\` = ?,
              \`rowVersion\` = \`rowVersion\` + 1,
              \`updatedAt\` = NOW(3)
        WHERE \`id\` = ?`,
      [targetStatus, exitDate, actor.userId, trimmedReason, employeeId]
    );
    if (result.affectedRows !== 1) {
      throw new StatusChangeError(409, 'CONFLICT', 'The employee record changed underneath this request; nothing was written.');
    }

    await conn.commit();

    const employee = await findEmployeeById(employeeId);

    await AuditService.log({
      userId: actor.userId,
      locationId: before.locationId ?? null,
      action: 'EMPLOYMENT_STATUS_CHANGED',
      entityType: 'Employee',
      entityId: employeeId,
      ipAddress: actor.ipAddress,
      userAgent: actor.userAgent,
      correlationId: `emp_status_${employeeId}_${Date.now()}`,
      before: { employeeCode: before.employeeCode, employmentStatus: before.status, rowVersion: Number(before.rowVersion) },
      after: { employeeCode: before.employeeCode, employmentStatus: targetStatus, reason: trimmedReason, changedBy: actor.userName, role: actor.role },
    });

    return { employee, previousStatus: before.status };
  } catch (err) {
    try { await conn.rollback(); } catch { /* rollback of an unstarted tx is not an error */ }
    throw err;
  } finally {
    conn.release();
  }
}

export interface EmployeeWriteActor extends StatusChangeActor {}

/**
 * Create or update an employee through the field policy + digits-only rule.
 * `mode` decides whether protected groups are even legal in the payload.
 */
export async function assertEmployeeCodeField(value: unknown, label = 'Employee number'): Promise<void> {
  const result = validateEmployeeCode(value);
  if (!result.valid) {
    throw new StatusChangeError(422, `INVALID_${result.code}`, `${label}: ${result.message}`, {
      field: 'employeeCode',
      reasonCode: result.code,
      received: typeof value === 'string' ? value : String(value ?? ''),
    });
  }
}

/** Duplicate detection that reports instead of failing with an opaque 500. */
export async function findEmployeeCodeConflicts(code: string, excludeEmployeeId?: string): Promise<{
  exact: any[];
  numeric: any[];
}> {
  const [exact] = await pool.query<any[]>(
    `SELECT \`id\`, \`employeeCode\`, \`fullName\` FROM \`employee\`
      WHERE \`employeeCode\` = ? AND (? IS NULL OR \`id\` <> ?)`,
    [code, excludeEmployeeId ?? null, excludeEmployeeId ?? null]
  );
  const [numeric] = await pool.query<any[]>(
    `SELECT \`id\`, \`employeeCode\`, \`fullName\` FROM \`employee\`
      WHERE \`employeeCode\` REGEXP '^[0-9]+$'
        AND CAST(\`employeeCode\` AS UNSIGNED) = CAST(? AS UNSIGNED)
        AND \`employeeCode\` <> ?
        AND (? IS NULL OR \`id\` <> ?)`,
    [code, code, excludeEmployeeId ?? null, excludeEmployeeId ?? null]
  );
  return { exact, numeric };
}

/** Optimistic-concurrency guard used by every HR write path. */
export async function assertRowVersion(employeeId: string, expected?: number): Promise<any> {
  const [rows] = await pool.query<any[]>('SELECT `id`, `rowVersion` FROM `employee` WHERE `id` = ?', [employeeId]);
  if (!rows.length) throw new StatusChangeError(404, 'EMPLOYEE_NOT_FOUND', 'Employee not found.');
  if (expected !== undefined && Number(expected) !== Number(rows[0].rowVersion)) {
    throw new StatusChangeError(409, 'CONFLICT',
      `Version conflict: this record is at version ${rows[0].rowVersion} but your form loaded version ${expected}. Another HR user saved changes first.`,
      { currentVersion: Number(rows[0].rowVersion), employeeId });
  }
  return rows[0];
}

/**
 * The numbers HR still has to correct: invalid, duplicated or missing employee
 * numbers, plus accounts that resolve to no employee and org assignments the
 * consolidation deliberately left unmapped.
 */
export async function getHrCorrectionQueue(scope: CallerScope): Promise<any> {
  const scopedEmployee = scope.locationId ? 'AND e.`locationId` = ?' : '';
  const params: any[] = scope.locationId ? [scope.locationId] : [];

  const [codeIssues] = await pool.query<any[]>(
    `SELECT r.\`id\`, r.\`employeeId\`, e.\`employeeCode\` AS \`currentEmployeeCode\`, e.\`fullName\`,
            r.\`originalCode\`, r.\`digitsOnlyProposal\`, r.\`appliedCode\`, r.\`issue\`, r.\`resolution\`,
            r.\`requiresHrReview\`, r.\`conflictGroupKey\`, r.\`note\`, r.\`createdAt\`
       FROM \`employee_code_compliance_report\` r
       JOIN \`employee\` e ON e.\`id\` = r.\`employeeId\`
      WHERE r.\`requiresHrReview\` = 1 ${scopedEmployee}
      ORDER BY r.\`id\``,
    params
  );

  const [unlinked] = await pool.query<any[]>(
    `SELECT r.\`userId\`, r.\`email\`, r.\`userFullName\`, r.\`userRole\`, r.\`locationId\`,
            r.\`previousEmployeeId\`, r.\`matchStrategy\`, r.\`note\`,
            l.\`code\` AS \`locationCode\`, l.\`name\` AS \`locationName\`
       FROM \`user_employee_link_report\` r
       LEFT JOIN \`location\` l ON l.\`id\` = r.\`locationId\`
      WHERE r.\`isUnresolved\` = 1
      ORDER BY r.\`email\``
  );

  const [pendingAssignments] = await pool.query<any[]>(
    `SELECT a.\`employeeId\`, e.\`employeeCode\`, e.\`fullName\`, e.\`status\` AS \`employmentStatus\`,
            a.\`legacyFloorId\`, a.\`legacyDepartmentId\`, a.\`legacySectionId\`,
            a.\`legacyShiftId\`, a.\`legacySellingPointId\`, a.\`note\`
       FROM \`_review_pending_org_assignment\` a
       JOIN \`employee\` e ON e.\`id\` = a.\`employeeId\`
      WHERE 1 = 1 ${scoped}
      ORDER BY e.\`employeeCode\``,
    params
  );

  const [numericDuplicates] = await pool.query<any[]>(
    `SELECT c.\`numericValue\`, c.\`employeeId\`, c.\`employeeCode\`, e.\`fullName\`, e.\`employeeCode\` AS \`currentCode\`,
            e.\`legacyEmployeeCode\`
       FROM \`employee_code_number_conflict\` c
       JOIN \`employee\` e ON e.\`id\` = c.\`employeeId\`
      ORDER BY c.\`numericValue\`, c.\`employeeId\``
  );

  return {
    employeeNumbers: codeIssues,
    numericDuplicates: numericDuplicates,
    unlinkedAccounts: unlinked,
    pendingOrgAssignments: pendingAssignments,
    totals: {
      employeeNumbers: codeIssues.length,
      numericDuplicates: numericDuplicates.length,
      unlinkedAccounts: unlinked.length,
      pendingOrgAssignments: pendingAssignments.length,
    },
  };
}

/** Mark a reported code as HR-corrected, without deleting the report row. */
export async function resolveCodeReport(
  employeeId: string,
  actor: StatusChangeActor,
  resolution: 'RESOLVED_BY_HR' | 'AWAITING_HR'
): Promise<void> {
  const [res] = await pool.query<any>(
    `UPDATE \`employee_code_compliance_report\`
        SET \`requiresHrReview\` = ?, \`resolution\` = ?, \`createdById\` = COALESCE(\`createdById\`, ?)
      WHERE \`employeeId\` = ? AND \`requiresHrReview\` = 1`,
    [resolution === 'RESOLVED_BY_HR' ? 0 : 1, resolution, actor.userId, employeeId]
  );
  if (res.affectedRows === 0) {
    throw new StatusChangeError(404, 'NO_OPEN_REPORT', 'This employee has no open employee-number report to resolve.');
  }
  await AuditService.log({
    userId: actor.userId,
    action: 'EMPLOYEE_CODE_REVIEW_UPDATED',
    entityType: 'Employee',
    entityId: employeeId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    after: { resolution },
  });
}

export { prisma };
