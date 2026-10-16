import type { AuthRequest } from '../middleware/auth.js';
import { pool } from '../db.js';
import { OrgError, resolveScope } from './orgPermissionService.js';

/**
 * Read layer for the organization module.
 *
 * Counting rules (identical for every screen so totals always reconcile):
 *  - Headcount is COUNT(DISTINCT employee.id) over ACTIVE employees only.
 *  - Every employee carries exactly one locationId, so per-location numbers
 *    always sum back to the company-wide workforce total.
 *  - "Allocated" means the employee has a departmentId; "awaiting allocation"
 *    means it is still NULL. Floor/section allocation are reported separately.
 *  - Working / absent / on-leave figures come from `attendance` for today only.
 *    When there is no attendance data for today in the requested scope the
 *    values are returned as `null` so the UI can show "Data unavailable"
 *    instead of a fabricated number.
 *  - Pending change figures come from orgchangerequest and never from the
 *    approved topology tables.
 */

const ATTENDANCE_WORKING_STATUSES = `('PRESENT','LATE','EARLY','OVERTIME','FACE_VERIFIED')`;

/** Today in IST (the HRMS operates in Karnataka, IST). */
export function todayIst(): string {
  return new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
}

export interface OrgScopeContext {
  /** undefined = every authorized location; otherwise an explicit allow-list. */
  locationIds?: string[];
}

export async function buildScope(
  user: AuthRequest['user'],
  requestedLocationId?: unknown
): Promise<OrgScopeContext> {
  const scope = await resolveScope(user);
  const requested =
    requestedLocationId && requestedLocationId !== 'all' && requestedLocationId !== 'ALL'
      ? String(requestedLocationId)
      : undefined;

  if (!scope.global) {
    if (requested) {
      if (!scope.locationIds.includes(requested)) {
        throw new OrgError(403, 'You do not have access to this location');
      }
      return { locationIds: [requested] };
    }
    return { locationIds: [...scope.locationIds] };
  }

  return requested ? { locationIds: [requested] } : {};
}

/** SQL fragment helpers ------------------------------------------------------------ */

function locFilter(column: string, ctx: OrgScopeContext, params: any[]): string {
  if (!ctx.locationIds || ctx.locationIds.length === 0) return '';
  params.push(...ctx.locationIds);
  const placeholders = ctx.locationIds.map(() => '?').join(', ');
  return ` AND ${column} IN (${placeholders})`;
}

async function query<T = any>(sql: string, params: any[] = []): Promise<T> {
  const [rows]: any = await pool.query(sql, params);
  return rows as T;
}

async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T[]>(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface LocationSummary {
  id: string;
  code: string;
  name: string;
  status: string;
  city?: string | null;
  activeFloors: number;
  activeDepartments: number;
  activeSections: number;
  workAreas: number;
  totalEmployees: number;
  allocatedEmployees: number;
  sectionAllocatedEmployees: number;
  floorAllocatedEmployees: number;
  awaitingAllocation: number;
  workingToday: number | null;
  absentToday: number | null;
  onApprovedLeaveToday: number;
  attendanceAvailable: boolean;
  pendingChanges: number;
  awaitingHrApproval: number;
  managerName?: string | null;
  hrManagerName?: string | null;
}

export interface OrganizationDashboard {
  generatedAt: string;
  scope: OrgScopeContext;
  attendance: { date: string; available: boolean };
  organization: {
    totalStores: number;
    totalActiveFloors: number;
    totalActiveDepartments: number;
    totalActiveSections: number;
    totalWorkAreas: number;
    totalEmployees: number;
    allocatedToDepartments: number;
    allocatedToFloors: number;
    allocatedToSections: number;
    awaitingAllocation: number;
    awaitingHrApproval: number;
    workingToday: number | null;
    absentToday: number | null;
    onApprovedLeaveToday: number;
    attendanceAvailable: boolean;
    pendingChanges: number;
  };
  locations: LocationSummary[];
}

export async function getDashboard(
  user: AuthRequest['user'],
  requestedLocationId?: unknown
): Promise<OrganizationDashboard> {
  const ctx = await buildScope(user, requestedLocationId);
  const today = todayIst();

  const locationParams: any[] = [];
  const locationSql = locFilter('l.id', ctx, locationParams);

  const workforceParams: any[] = [];
  const workforceSql = locFilter('locationId', ctx, workforceParams);

  const attendanceParams: any[] = [today];
  const attendanceSql = locFilter('a.locationId', ctx, attendanceParams);

  const pendingParams: any[] = [];
  const pendingSql = locFilter('locationId', ctx, pendingParams);

  const leaveParams: any[] = [today];
  const leaveSql = locFilter('e.locationId', ctx, leaveParams);

  const [locations, topoByLoc, workforceByLoc, attendanceByLoc, pendingByLoc, leaveByLoc] =
    await Promise.all([
      query<any[]>(
        `SELECT l.id, l.code, l.name, l.status, l.city,
                mu.fullName AS managerName, hu.fullName AS hrManagerName
           FROM location l
           LEFT JOIN user mu ON mu.id = l.managerId
           LEFT JOIN user hu ON hu.id = l.hrManagerId
          WHERE l.status <> 'ARCHIVED'${locationSql}
          ORDER BY l.code ASC`,
        locationParams
      ),
      query<any[]>(
        `SELECT l.id AS locationId,
                (SELECT COUNT(*) FROM floor f WHERE f.locationId = l.id AND f.status = 'ACTIVE') AS activeFloors,
                (SELECT COUNT(*) FROM department d WHERE d.locationId = l.id AND d.status = 'ACTIVE') AS activeDepartments,
                (SELECT COUNT(*) FROM section s WHERE s.locationId = l.id AND s.status = 'ACTIVE') AS activeSections,
                (SELECT COUNT(*) FROM sellingpoint sp WHERE sp.locationId = l.id AND sp.status = 1) AS workAreas
           FROM location l
          WHERE l.status <> 'ARCHIVED'${locationSql}`,
        [...locationParams]
      ),
      query<any[]>(
        `SELECT locationId,
                COUNT(*) AS totalEmployees,
                SUM(departmentId IS NOT NULL) AS allocatedEmployees,
                SUM(floorId IS NOT NULL) AS floorAllocatedEmployees,
                SUM(sectionId IS NOT NULL) AS sectionAllocatedEmployees,
                SUM(departmentId IS NULL) AS awaitingAllocation
           FROM employee
          WHERE status = 'ACTIVE'${workforceSql}
          GROUP BY locationId`,
        workforceParams
      ),
      query<any[]>(
        `SELECT a.locationId AS locationId,
                COUNT(*) AS records,
                SUM(CASE WHEN a.status IN ${ATTENDANCE_WORKING_STATUSES} OR a.actualLogin IS NOT NULL THEN 1 ELSE 0 END) AS working,
                SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent
           FROM attendance a
           JOIN employee e ON e.id = a.employeeId AND e.status = 'ACTIVE'
          WHERE a.attendanceDate = ?${attendanceSql}
          GROUP BY a.locationId`,
        attendanceParams
      ),
      query<any[]>(
        `SELECT locationId,
                COUNT(*) AS pendingChanges,
                SUM(currentStage = 'HR') AS awaitingHrApproval
           FROM orgchangerequest
          WHERE status IN ('PENDING','CHANGES_REQUESTED')${pendingSql}
          GROUP BY locationId`,
        pendingParams
      ),
      query<any[]>(
        `SELECT e.locationId AS locationId, COUNT(DISTINCT e.id) AS onLeave
           FROM leaverequest lr
           JOIN employee e ON e.id = lr.employeeId AND e.status = 'ACTIVE'
          WHERE lr.status = 'APPROVED'
            AND DATE(?) BETWEEN DATE(lr.startDate) AND DATE(lr.endDate)${leaveSql}
          GROUP BY e.locationId`,
        leaveParams
      ),
    ]);

  const topoMap = new Map(topoByLoc.map((r) => [r.locationId, r]));
  const workforceMap = new Map(workforceByLoc.map((r) => [r.locationId, r]));
  const attendanceMap = new Map(attendanceByLoc.map((r) => [r.locationId, r]));
  const pendingMap = new Map(pendingByLoc.map((r) => [r.locationId, r]));
  const leaveMap = new Map(leaveByLoc.map((r) => [r.locationId, r]));

  const locationSummaries: LocationSummary[] = locations.map((loc) => {
    const topo = topoMap.get(loc.id) || {};
    const workforce = workforceMap.get(loc.id) || {};
    const attendance = attendanceMap.get(loc.id);
    const pending = pendingMap.get(loc.id) || {};
    const leave = leaveMap.get(loc.id) || {};
    const attendanceAvailable = Boolean(attendance && num(attendance.records) > 0);

    return {
      id: loc.id,
      code: loc.code,
      name: loc.name,
      status: loc.status,
      city: loc.city ?? null,
      activeFloors: num(topo.activeFloors),
      activeDepartments: num(topo.activeDepartments),
      activeSections: num(topo.activeSections),
      workAreas: num(topo.workAreas),
      totalEmployees: num(workforce.totalEmployees),
      allocatedEmployees: num(workforce.allocatedEmployees),
      sectionAllocatedEmployees: num(workforce.sectionAllocatedEmployees),
      floorAllocatedEmployees: num(workforce.floorAllocatedEmployees),
      awaitingAllocation: num(workforce.awaitingAllocation),
      workingToday: attendanceAvailable ? num(attendance!.working) : null,
      absentToday: attendanceAvailable ? num(attendance!.absent) : null,
      onApprovedLeaveToday: num(leave.onLeave),
      attendanceAvailable,
      pendingChanges: num(pending.pendingChanges),
      awaitingHrApproval: num(pending.awaitingHrApproval),
      managerName: loc.managerName ?? null,
      hrManagerName: loc.hrManagerName ?? null,
    };
  });

  const attendanceRecords = attendanceByLoc.reduce((sum, r) => sum + num(r.records), 0);
  const attendanceAvailable = attendanceRecords > 0;

  const organization = {
    totalStores: locationSummaries.length,
    totalActiveFloors: locationSummaries.reduce((s, l) => s + l.activeFloors, 0),
    totalActiveDepartments: locationSummaries.reduce((s, l) => s + l.activeDepartments, 0),
    totalActiveSections: locationSummaries.reduce((s, l) => s + l.activeSections, 0),
    totalWorkAreas: locationSummaries.reduce((s, l) => s + l.workAreas, 0),
    totalEmployees: locationSummaries.reduce((s, l) => s + l.totalEmployees, 0),
    allocatedToDepartments: locationSummaries.reduce((s, l) => s + l.allocatedEmployees, 0),
    allocatedToFloors: locationSummaries.reduce((s, l) => s + l.floorAllocatedEmployees, 0),
    allocatedToSections: locationSummaries.reduce((s, l) => s + l.sectionAllocatedEmployees, 0),
    awaitingAllocation: locationSummaries.reduce((s, l) => s + l.awaitingAllocation, 0),
    awaitingHrApproval: locationSummaries.reduce((s, l) => s + l.awaitingHrApproval, 0),
    workingToday: attendanceAvailable
      ? locationSummaries.reduce((s, l) => s + (l.workingToday ?? 0), 0)
      : null,
    absentToday: attendanceAvailable
      ? locationSummaries.reduce((s, l) => s + (l.absentToday ?? 0), 0)
      : null,
    onApprovedLeaveToday: locationSummaries.reduce((s, l) => s + l.onApprovedLeaveToday, 0),
    attendanceAvailable,
    pendingChanges: locationSummaries.reduce((s, l) => s + l.pendingChanges, 0),
  };

  return {
    generatedAt: new Date().toISOString(),
    scope: ctx,
    attendance: { date: today, available: attendanceAvailable },
    organization,
    locations: locationSummaries,
  };
}

/* ---------------------------------------------------------------------------------
 * Hierarchy: location -> floor -> department -> section -> work area
 * --------------------------------------------------------------------------------- */

export interface OrgSectionNode {
  id: string;
  name: string;
  code: string;
  status: string;
  floorId: string;
  departmentId: string | null;
  supervisorName: string | null;
  employees: number;
  workingToday: number | null;
  attendanceAvailable: boolean;
  pendingChanges: number;
  workAreas: OrgWorkAreaNode[];
}

export interface OrgWorkAreaNode {
  id: string;
  name: string;
  code: string;
  category: string | null;
  status: number;
  employees: number;
  managerName: string | null;
}

export interface OrgDepartmentNode {
  id: string;
  name: string;
  code: string;
  status: string;
  floorId: string | null;
  managerName: string | null;
  locationId: string;
  employees: number;
  workingToday: number | null;
  attendanceAvailable: boolean;
  pendingChanges: number;
  sectionCount: number;
  workAreaCount: number;
  sections: OrgSectionNode[];
}

export interface OrgFloorNode {
  id: string;
  name: string;
  floorNumber: number;
  status: string;
  locationId: string;
  floorManagerName: string | null;
  assistantManagerName: string | null;
  employees: number;
  workingToday: number | null;
  attendanceAvailable: boolean;
  pendingChanges: number;
  activeSections: number;
  workAreas: number;
  departments: OrgDepartmentNode[];
}

export interface OrgHierarchy {
  generatedAt: string;
  attendance: { date: string; available: boolean };
  locations: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    employees: number;
    workingToday: number | null;
    attendanceAvailable: boolean;
    pendingChanges: number;
    activeFloors: number;
    activeDepartments: number;
    activeSections: number;
    workAreas: number;
    floors: OrgFloorNode[];
    storeWideDepartments: OrgDepartmentNode[];
    floorlessSections: OrgSectionNode[];
  }>;
}

export async function getHierarchy(
  user: AuthRequest['user'],
  requestedLocationId?: unknown
): Promise<OrgHierarchy> {
  const ctx = await buildScope(user, requestedLocationId);
  const today = todayIst();

  const locationParams: any[] = [];
  const locationSql = locFilter('l.id', ctx, locationParams);

  const floorParams: any[] = [];
  const floorSql = locFilter('f.locationId', ctx, floorParams);

  const departmentParams: any[] = [];
  const departmentSql = locFilter('d.locationId', ctx, departmentParams);

  const sectionParams: any[] = [];
  const sectionSql = locFilter('s.locationId', ctx, sectionParams);

  const workAreaParams: any[] = [];
  const workAreaSql = locFilter('sp.locationId', ctx, workAreaParams);

  const employeeParams: any[] = [];
  const employeeSql = locFilter('locationId', ctx, employeeParams);

  const attendanceParams: any[] = [today];
  const attendanceSql = locFilter('a.locationId', ctx, attendanceParams);

  const pendingParams: any[] = [];
  const pendingSql = locFilter('locationId', ctx, pendingParams);

  const [
    locations,
    floors,
    departments,
    sections,
    workAreas,
    empByNode,
    attByNode,
    pendingByNode,
  ] = await Promise.all([
    query<any[]>(
      `SELECT id, code, name, status FROM location WHERE status <> 'ARCHIVED'${locationSql} ORDER BY code`,
      locationParams
    ),
    query<any[]>(
      `SELECT f.id, f.name, f.floorNumber, f.status, f.locationId,
              fm.fullName AS floorManagerName, am.fullName AS assistantManagerName
         FROM floor f
         LEFT JOIN user fm ON fm.id = f.floorManagerId
         LEFT JOIN user am ON am.id = f.assistantManagerId
        WHERE f.status = 'ACTIVE'${floorSql}
        ORDER BY f.locationId, f.floorNumber`,
      floorParams
    ),
    query<any[]>(
      `SELECT d.id, d.name, d.code, d.status, d.locationId, d.floorId, m.fullName AS managerName
         FROM department d
         LEFT JOIN user m ON m.id = d.managerId
        WHERE d.status = 'ACTIVE'${departmentSql}
        ORDER BY d.locationId, d.name`,
      departmentParams
    ),
    query<any[]>(
      `SELECT s.id, s.name, s.code, s.status, s.locationId, s.floorId, s.departmentId,
              sv.fullName AS supervisorName
         FROM section s
         LEFT JOIN user sv ON sv.id = s.supervisorId
        WHERE s.status = 'ACTIVE'${sectionSql}
        ORDER BY s.locationId, s.floorId, s.name`,
      sectionParams
    ),
    query<any[]>(
      `SELECT sp.id, sp.name, sp.code, sp.category, sp.status, sp.locationId, sp.floorId,
              sp.sectionId, sp.departmentId, m.fullName AS managerName
         FROM sellingpoint sp
         LEFT JOIN user m ON m.id = sp.managerId
        WHERE sp.status = 1${workAreaSql}
        ORDER BY sp.locationId, sp.sectionId, sp.code`,
      workAreaParams
    ),
    query<any[]>(
      `SELECT locationId, floorId, departmentId, sectionId, COUNT(*) AS employees
         FROM employee
        WHERE status = 'ACTIVE'${employeeSql}
        GROUP BY locationId, floorId, departmentId, sectionId`,
      employeeParams
    ),
    query<any[]>(
      `SELECT e.locationId, e.floorId, e.departmentId, e.sectionId,
              COUNT(*) AS records,
              SUM(CASE WHEN a.status IN ${ATTENDANCE_WORKING_STATUSES} OR a.actualLogin IS NOT NULL THEN 1 ELSE 0 END) AS working,
              SUM(CASE WHEN a.status = 'ABSENT' THEN 1 ELSE 0 END) AS absent
         FROM attendance a
         JOIN employee e ON e.id = a.employeeId AND e.status = 'ACTIVE'
        WHERE a.attendanceDate = ?${attendanceSql}
        GROUP BY e.locationId, e.floorId, e.departmentId, e.sectionId`,
      attendanceParams
    ),
    query<any[]>(
      `SELECT locationId, floorId, departmentId, sectionId, COUNT(*) AS pending
         FROM orgchangerequest
        WHERE status IN ('PENDING','CHANGES_REQUESTED')${pendingSql}
        GROUP BY locationId, floorId, departmentId, sectionId`,
      pendingParams
    ),
  ]);

  const nodeKey = (r: any) => `${r.locationId || ''}|${r.floorId || ''}|${r.departmentId || ''}|${r.sectionId || ''}`;
  const empMap = new Map<string, any>();
  for (const r of empByNode) empMap.set(nodeKey(r), r);
  const attMap = new Map<string, any>();
  for (const r of attByNode) attMap.set(nodeKey(r), r);
  const pendingMap = new Map<string, any>();
  for (const r of pendingByNode) pendingMap.set(nodeKey(r), r);

  const lookup = (
    locationId: string,
    floorId: string | null,
    departmentId: string | null,
    sectionId: string | null
  ) => {
    const key = `${locationId}|${floorId || ''}|${departmentId || ''}|${sectionId || ''}`;
    const att = attMap.get(key);
    const hasAttendance = Boolean(att && num(att.records) > 0);
    return {
      employees: num(empMap.get(key)?.employees),
      workingToday: hasAttendance ? num(att.working) : null,
      absentToday: hasAttendance ? num(att.absent) : null,
      attendanceAvailable: hasAttendance,
      pendingChanges: num(pendingMap.get(key)?.pending),
    };
  };

  const sectionsByDept = new Map<string, OrgSectionNode[]>();
  const workAreasBySection = new Map<string, OrgWorkAreaNode[]>();

  for (const wa of workAreas) {
    const node: OrgWorkAreaNode = {
      id: wa.id,
      name: wa.name,
      code: wa.code,
      category: wa.category ?? null,
      status: num(wa.status),
      employees: 0,
      managerName: wa.managerName ?? null,
    };
    const list = workAreasBySection.get(wa.sectionId) || [];
    list.push(node);
    workAreasBySection.set(wa.sectionId, list);
  }

  for (const s of sections) {
    const stats = lookup(s.locationId, s.floorId, s.departmentId, s.id);
    const node: OrgSectionNode = {
      id: s.id,
      name: s.name,
      code: s.code,
      status: s.status,
      floorId: s.floorId,
      departmentId: s.departmentId,
      supervisorName: s.supervisorName ?? null,
      employees: stats.employees,
      workingToday: stats.workingToday,
      attendanceAvailable: stats.attendanceAvailable,
      pendingChanges: stats.pendingChanges,
      workAreas: workAreasBySection.get(s.id) || [],
    };
    const key = s.departmentId || `__none__${s.locationId}`;
    const list = sectionsByDept.get(key) || [];
    list.push(node);
    sectionsByDept.set(key, list);
  }

  const buildDepartment = (d: any): OrgDepartmentNode => {
    const stats = lookup(d.locationId, d.floorId, d.id, null);
    const ownSections = sectionsByDept.get(d.id) || [];
    const sectionScoped = d.floorId ? ownSections.filter((s) => s.floorId === d.floorId) : ownSections;
    const workAreaCount = sectionScoped.reduce((sum, s) => sum + s.workAreas.length, 0);
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      status: d.status,
      floorId: d.floorId,
      managerName: d.managerName ?? null,
      locationId: d.locationId,
      employees: stats.employees,
      workingToday: stats.workingToday,
      attendanceAvailable: stats.attendanceAvailable,
      pendingChanges: stats.pendingChanges,
      sectionCount: sectionScoped.length,
      workAreaCount,
      sections: sectionScoped,
    };
  };

  const locationNodes = locations.map((loc) => {
    const locFloors = floors.filter((f) => f.locationId === loc.id);
    const locDepartments = departments.filter((d) => d.locationId === loc.id);
    const locStats = lookup(loc.id, null, null, null);

    const floorNodes: OrgFloorNode[] = locFloors.map((f) => {
      const floorDepts = locDepartments.filter((d) => d.floorId === f.id).map(buildDepartment);
      const stats = lookup(loc.id, f.id, null, null);
      const floorSections = sections.filter((s) => s.locationId === loc.id && s.floorId === f.id);
      const floorWorkAreas = workAreas.filter((w) => w.locationId === loc.id && w.floorId === f.id);
      return {
        id: f.id,
        name: f.name,
        floorNumber: f.floorNumber,
        status: f.status,
        locationId: loc.id,
        floorManagerName: f.floorManagerName ?? null,
        assistantManagerName: f.assistantManagerName ?? null,
        employees: stats.employees,
        workingToday: stats.workingToday,
        attendanceAvailable: stats.attendanceAvailable,
        pendingChanges: stats.pendingChanges,
        activeSections: floorSections.length,
        workAreas: floorWorkAreas.length,
        departments: floorDepts,
      };
    });

    const storeWide = locDepartments
      .filter((d) => !d.floorId)
      .map(buildDepartment);

    const floorlessSections = sections.filter(
      (s) => s.locationId === loc.id && !s.departmentId
    );

    return {
      id: loc.id,
      code: loc.code,
      name: loc.name,
      status: loc.status,
      employees: locStats.employees,
      workingToday: locStats.workingToday,
      attendanceAvailable: locStats.attendanceAvailable,
      pendingChanges: locStats.pendingChanges,
      activeFloors: locFloors.length,
      activeDepartments: locDepartments.length,
      activeSections: sections.filter((s) => s.locationId === loc.id).length,
      workAreas: workAreas.filter((w) => w.locationId === loc.id).length,
      floors: floorNodes,
      storeWideDepartments: storeWide,
      floorlessSections,
    };
  });

  const anyAttendance = attByNode.some((r) => num(r.records) > 0);

  return {
    generatedAt: new Date().toISOString(),
    attendance: { date: today, available: anyAttendance },
    locations: locationNodes,
  };
}

/* ---------------------------------------------------------------------------------
 * Employee roster
 * --------------------------------------------------------------------------------- */

export interface RosterFilters {
  locationId?: string;
  floorId?: string;
  departmentId?: string;
  sectionId?: string;
  workAreaId?: string;
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface RosterResult {
  employees: any[];
  total: number;
  page: number;
  limit: number;
}

export async function getRoster(
  user: AuthRequest['user'],
  filters: RosterFilters
): Promise<RosterResult> {
  const ctx = await buildScope(user, filters.locationId);
  const page = Math.max(1, Number(filters.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(filters.limit) || 25));
  const offset = (page - 1) * limit;

  const where: string[] = [];
  const params: any[] = [];

  if (ctx.locationIds && ctx.locationIds.length > 0) {
    where.push(`e.locationId IN (${ctx.locationIds.map(() => '?').join(', ')})`);
    params.push(...ctx.locationIds);
  }
  if (filters.floorId) {
    where.push('e.floorId = ?');
    params.push(filters.floorId);
  }
  if (filters.departmentId) {
    where.push('e.departmentId = ?');
    params.push(filters.departmentId);
  }
  if (filters.sectionId) {
    where.push('e.sectionId = ?');
    params.push(filters.sectionId);
  }
  if (filters.workAreaId) {
    where.push(
      `EXISTS (SELECT 1 FROM employeesellingpoint esp WHERE esp.employeeId = e.id AND esp.sellingPointId = ?)`
    );
    params.push(filters.workAreaId);
  }
  if (filters.status) {
    where.push('e.status = ?');
    params.push(filters.status);
  } else {
    where.push("e.status = 'ACTIVE'");
  }
  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    where.push(
      '(e.fullName LIKE ? OR e.employeeCode LIKE ? OR e.designation LIKE ? OR e.email LIKE ?)'
    );
    params.push(term, term, term, term);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const today = todayIst();

  const [rows, countRows]: any[] = await Promise.all([
    query(
      `SELECT e.id, e.employeeCode, e.fullName, e.email, e.designation, e.role, e.status,
              e.locationId, e.floorId, e.departmentId, e.sectionId, e.joiningDate,
              l.name AS locationName, l.code AS locationCode,
              f.name AS floorName,
              d.name AS departmentName, d.code AS departmentCode,
              s.name AS sectionName, s.code AS sectionCode,
              mu.fullName AS reportingManagerName,
              att.status AS attendanceStatus, att.actualLogin, att.actualLogout,
              (SELECT sp.name FROM employeesellingpoint esp
                 JOIN sellingpoint sp ON sp.id = esp.sellingPointId
                WHERE esp.employeeId = e.id
                ORDER BY esp.isPrimary DESC, esp.assignedDate DESC LIMIT 1) AS workAreaName,
              (SELECT sp.code FROM employeesellingpoint esp
                 JOIN sellingpoint sp ON sp.id = esp.sellingPointId
                WHERE esp.employeeId = e.id
                ORDER BY esp.isPrimary DESC, esp.assignedDate DESC LIMIT 1) AS workAreaCode
         FROM employee e
         LEFT JOIN location l ON l.id = e.locationId
         LEFT JOIN floor f ON f.id = e.floorId
         LEFT JOIN department d ON d.id = e.departmentId
         LEFT JOIN section s ON s.id = e.sectionId
         LEFT JOIN employeeassignmenthistory ah
                ON ah.employeeId = e.id AND ah.isCurrent = 1
         LEFT JOIN user mu ON mu.id = ah.reportingManagerId
         LEFT JOIN attendance att
                ON att.employeeId = e.id AND att.attendanceDate = ?
        ${whereSql}
        ORDER BY e.fullName ASC
        LIMIT ? OFFSET ?`,
      [today, ...params, limit, offset]
    ),
    query(`SELECT COUNT(*) AS total FROM employee e ${whereSql}`, params),
  ]);

  return {
    employees: rows,
    total: num(countRows?.[0]?.total),
    page,
    limit,
  };
}

/** Single employee's approved allocation plus full transfer/assignment history. */
export async function getEmployeeAssignmentDetail(
  user: AuthRequest['user'],
  employeeId: string
): Promise<any> {
  const employee = await queryOne(
    `SELECT e.id, e.employeeCode, e.fullName, e.designation, e.status, e.role,
            e.locationId, e.floorId, e.departmentId, e.sectionId,
            l.name AS locationName, f.name AS floorName,
            d.name AS departmentName, s.name AS sectionName
       FROM employee e
       LEFT JOIN location l ON l.id = e.locationId
       LEFT JOIN floor f ON f.id = e.floorId
       LEFT JOIN department d ON d.id = e.departmentId
       LEFT JOIN section s ON s.id = e.sectionId
      WHERE e.id = ?`,
    [employeeId]
  );
  if (!employee) throw new OrgError(404, 'Employee not found');
  await buildScope(user, employee.locationId);

  const history = await query(
    `SELECT h.*, cb.fullName AS changedByName, cr.requestCode
       FROM employeeassignmenthistory h
       LEFT JOIN user cb ON cb.id = h.changedById
       LEFT JOIN orgchangerequest cr ON cr.id = h.changeRequestId
      WHERE h.employeeId = ?
      ORDER BY h.effectiveFrom DESC, h.createdAt DESC`,
    [employeeId]
  );

  const workAreas = await query(
    `SELECT sp.id, sp.name, sp.code, esp.isPrimary, esp.assignedDate
       FROM employeesellingpoint esp
       JOIN sellingpoint sp ON sp.id = esp.sellingPointId
      WHERE esp.employeeId = ?
      ORDER BY esp.isPrimary DESC, esp.assignedDate DESC`,
    [employeeId]
  );

  return { employee, history, workAreas };
}

/* ---------------------------------------------------------------------------------
 * Activity feed (recent approvals + topology changes)
 * --------------------------------------------------------------------------------- */

export async function getRecentActivity(
  user: AuthRequest['user'],
  requestedLocationId?: unknown,
  limit = 20
): Promise<any[]> {
  const ctx = await buildScope(user, requestedLocationId);
  const p: any[] = [];
  const locSql = locFilter('cr.locationId', ctx, p);

  const requests = await query<any[]>(
    `SELECT cr.id, cr.requestCode, cr.requestType, cr.action, cr.title, cr.status,
            cr.currentStage, cr.locationId, cr.submittedAt, cr.createdAt, cr.updatedAt,
            ru.fullName AS requestedByName, l.name AS locationName, l.code AS locationCode
       FROM orgchangerequest cr
       JOIN user ru ON ru.id = cr.requestedById
       LEFT JOIN location l ON l.id = cr.locationId
      WHERE 1 = 1${locSql}
      ORDER BY cr.updatedAt DESC
      LIMIT ?`,
    [...p, Math.min(100, limit)]
  );

  return requests.map((r) => ({
    id: r.id,
    requestCode: r.requestCode,
    requestType: r.requestType,
    action: r.action,
    title: r.title,
    status: r.status,
    currentStage: r.currentStage,
    locationName: r.locationName,
    locationCode: r.locationCode,
    requestedByName: r.requestedByName,
    submittedAt: r.submittedAt,
    updatedAt: r.updatedAt,
  }));
}

/** Validate a location exists and is active (used before raising requests). */
export async function assertLocationExists(locationId: string, allowInactive = false): Promise<any> {
  const loc = await queryOne(`SELECT id, code, name, status FROM location WHERE id = ?`, [locationId]);
  if (!loc) throw new OrgError(400, 'The selected store location does not exist');
  if (!allowInactive && loc.status !== 'ACTIVE') {
    throw new OrgError(400, `Store location ${loc.code} is not active`);
  }
  return loc;
}
