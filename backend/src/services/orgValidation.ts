import { pool } from '../db.js';
import { OrgError, type OrgRequestAction, type OrgRequestType } from './orgPermissionService.js';

/**
 * Server-side validation for organization change requests.
 *
 * Every rule here is re-checked at apply time inside the approval transaction,
 * so a request that somehow reaches HR review can never write an invalid row.
 */

export const KNOWN_PERMISSIONS = [
  'VIEW',
  'ADD',
  'EDIT',
  'DELETE',
  'APPROVE',
  'REJECT',
  'ASSIGN',
  'EXPORT',
  'IMPORT',
  'CONFIGURE',
  'MANAGE',
  'RECORD',
  'UPLOAD',
  'PUBLISH',
  'SCAN',
  'VIEW_SENSITIVE_DATA',
];

export const ADMIN_ACCOUNT_ROLES = [
  'ADMIN',
  'HR_MANAGER',
  'HR_EXECUTIVE',
  'PAYROLL_MANAGER',
  'LOCATION_MANAGER',
  'FLOOR_MANAGER',
  'DEPARTMENT_MANAGER',
];

export interface ValidationContext {
  requestType: OrgRequestType;
  action: OrgRequestAction;
  payload: any;
  locationId?: string | null;
  floorId?: string | null;
  departmentId?: string | null;
  sectionId?: string | null;
  workAreaId?: string | null;
  employeeId?: string | null;
}

async function one(sql: string, params: any[] = []): Promise<any> {
  const [rows]: any = await pool.query(sql, params);
  return rows && rows.length > 0 ? rows[0] : null;
}

function requireString(value: unknown, field: string, min = 2, max = 191): string {
  if (typeof value !== 'string' || value.trim().length < min) {
    throw new OrgError(400, `${field} is required (minimum ${min} characters)`);
  }
  if (value.trim().length > max) {
    throw new OrgError(400, `${field} must be at most ${max} characters`);
  }
  return value.trim();
}

function optionalString(value: unknown, field: string, max = 191): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new OrgError(400, `${field} must be a string`);
  if (value.trim().length > max) throw new OrgError(400, `${field} must be at most ${max} characters`);
  return value.trim();
}

async function assertLocation(locationId: string | null | undefined, field = 'locationId'): Promise<any> {
  if (!locationId) throw new OrgError(400, `${field} is required`);
  const loc = await one('SELECT id, code, name, status FROM location WHERE id = ?', [locationId]);
  if (!loc) throw new OrgError(400, 'The selected store location does not exist');
  if (loc.status !== 'ACTIVE') throw new OrgError(400, `Store location ${loc.code} is not active`);
  return loc;
}

async function assertFloor(floorId: string, locationId: string): Promise<any> {
  const floor = await one('SELECT id, name, floorNumber, locationId, status FROM floor WHERE id = ?', [
    floorId,
  ]);
  if (!floor) throw new OrgError(400, 'The selected floor does not exist');
  if (floor.locationId !== locationId) {
    throw new OrgError(400, 'The selected floor belongs to a different store location');
  }
  if (floor.status !== 'ACTIVE') throw new OrgError(400, 'The selected floor is not active');
  return floor;
}

async function assertDepartment(departmentId: string, locationId: string): Promise<any> {
  const dept = await one(
    'SELECT id, name, code, locationId, floorId, status FROM department WHERE id = ?',
    [departmentId]
  );
  if (!dept) throw new OrgError(400, 'The selected department does not exist');
  if (dept.locationId !== locationId) {
    throw new OrgError(400, 'The selected department belongs to a different store location');
  }
  if (dept.status !== 'ACTIVE') throw new OrgError(400, 'The selected department is not active');
  return dept;
}

async function assertSection(sectionId: string, locationId: string): Promise<any> {
  const section = await one(
    'SELECT id, name, code, locationId, floorId, departmentId, status FROM section WHERE id = ?',
    [sectionId]
  );
  if (!section) throw new OrgError(400, 'The selected section does not exist');
  if (section.locationId !== locationId) {
    throw new OrgError(400, 'The selected section belongs to a different store location');
  }
  if (section.status !== 'ACTIVE') throw new OrgError(400, 'The selected section is not active');
  return section;
}

async function assertWorkArea(workAreaId: string, locationId: string): Promise<any> {
  const sp = await one(
    'SELECT id, name, code, locationId, floorId, sectionId, status FROM sellingpoint WHERE id = ?',
    [workAreaId]
  );
  if (!sp) throw new OrgError(400, 'The selected work area / counter does not exist');
  if (sp.locationId !== locationId) {
    throw new OrgError(400, 'The selected work area belongs to a different store location');
  }
  if (Number(sp.status) !== 1) throw new OrgError(400, 'The selected work area is inactive');
  return sp;
}

async function assertEmployee(employeeId: string): Promise<any> {
  const emp = await one(
    `SELECT id, employeeCode, fullName, status, locationId, floorId, departmentId, sectionId
       FROM employee WHERE id = ?`,
    [employeeId]
  );
  if (!emp) throw new OrgError(400, 'The employee does not exist in the employee directory');
  if (emp.status === 'TERMINATED' || emp.status === 'INACTIVE') {
    throw new OrgError(400, `Employee ${emp.employeeCode} is ${emp.status} and cannot be allocated`);
  }
  return emp;
}

async function assertActiveUser(userId: string, field: string): Promise<any> {
  const user = await one('SELECT id, fullName, role, isActive, status FROM user WHERE id = ?', [userId]);
  if (!user) throw new OrgError(400, `${field} does not reference an existing user`);
  if (!user.isActive || (user.status && user.status !== 'ACTIVE')) {
    throw new OrgError(400, `${field} references a user that is not active`);
  }
  return user;
}

function normalizeCode(value: unknown, field: string): string {
  const code = requireString(value, field, 2, 30).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9\-_]*$/.test(code)) {
    throw new OrgError(400, `${field} may only contain letters, numbers, hyphens and underscores`);
  }
  return code;
}

async function assertCodeAvailable(
  table: 'department' | 'section' | 'sellingpoint' | 'location',
  code: string,
  locationId: string,
  ignoreId?: string | null
): Promise<void> {
  const existing = await one(`SELECT id FROM \`${table}\` WHERE code = ? AND locationId = ?`, [
    code,
    locationId,
  ]);
  if (existing && existing.id !== ignoreId) {
    throw new OrgError(409, `Code ${code} is already in use at this location`);
  }
}

/**
 * Full payload validation. Throws OrgError(400/409) when the proposed change
 * violates a structural or data-integrity rule.
 */
export async function validateChangeRequest(ctx: ValidationContext): Promise<void> {
  const { requestType, action, payload } = ctx;

  switch (requestType) {
    case 'LOCATION': {
      if (action === 'CREATE') {
        const code = normalizeCode(payload.code, 'Location code');
        const name = requireString(payload.name, 'Location name');
        void name;
        const existing = await one('SELECT id FROM location WHERE code = ?', [code]);
        if (existing) throw new OrgError(409, `Store location code ${code} already exists`);
      } else if (ctx.locationId) {
        await assertLocation(ctx.locationId);
      }
      break;
    }

    case 'FLOOR': {
      const location = await assertLocation(payload.locationId || ctx.locationId);
      if (action === 'CREATE') {
        const name = requireString(payload.name, 'Floor name');
        void name;
        const floorNumber = Number(payload.floorNumber);
        if (!Number.isInteger(floorNumber) || floorNumber < -3 || floorNumber > 200) {
          throw new OrgError(400, 'Floor number must be an integer between -3 and 200');
        }
        const clash = await one('SELECT id, name FROM floor WHERE locationId = ? AND floorNumber = ?', [
          location.id,
          floorNumber,
        ]);
        if (clash) {
          throw new OrgError(
            409,
            `${location.code} already has a floor numbered ${floorNumber} (${clash.name})`
          );
        }
      } else if (ctx.floorId) {
        await assertFloor(ctx.floorId, location.id);
      }
      break;
    }

    case 'DEPARTMENT': {
      const location = await assertLocation(payload.locationId || ctx.locationId);
      if (action === 'CREATE') {
        const code = normalizeCode(payload.code, 'Department code');
        await assertCodeAvailable('department', code, location.id);
        if (payload.floorId) await assertFloor(payload.floorId, location.id);
        if (payload.managerId) await assertActiveUser(payload.managerId, 'Department manager');
      } else if (ctx.departmentId) {
        await assertDepartment(ctx.departmentId, location.id);
        if (payload.floorId) await assertFloor(payload.floorId, location.id);
        if (payload.managerId) await assertActiveUser(payload.managerId, 'Department manager');
        if (payload.code) {
          const code = normalizeCode(payload.code, 'Department code');
          await assertCodeAvailable('department', code, location.id, ctx.departmentId);
        }
      }
      break;
    }

    case 'SECTION': {
      const location = await assertLocation(payload.locationId || ctx.locationId);
      if (action === 'CREATE') {
        if (!payload.floorId) {
          throw new OrgError(400, 'A section must belong to a floor');
        }
        await assertFloor(payload.floorId, location.id);
        const code = normalizeCode(payload.code, 'Section code');
        await assertCodeAvailable('section', code, location.id);
        if (payload.departmentId) {
          const dept = await assertDepartment(payload.departmentId, location.id);
          if (dept.floorId && dept.floorId !== payload.floorId) {
            throw new OrgError(400, 'The selected department belongs to a different floor');
          }
        }
        if (payload.supervisorId) await assertActiveUser(payload.supervisorId, 'Section supervisor');
      } else if (ctx.sectionId) {
        const section = await assertSection(ctx.sectionId, location.id);
        if (payload.floorId) await assertFloor(payload.floorId, location.id);
        if (payload.departmentId) {
          const dept = await assertDepartment(payload.departmentId, location.id);
          if (dept.floorId && payload.floorId && dept.floorId !== payload.floorId) {
            throw new OrgError(400, 'The selected department belongs to a different floor');
          }
          void section;
        }
        if (payload.code) {
          const code = normalizeCode(payload.code, 'Section code');
          await assertCodeAvailable('section', code, location.id, ctx.sectionId);
        }
        if (payload.supervisorId) await assertActiveUser(payload.supervisorId, 'Section supervisor');
      }
      break;
    }

    case 'WORK_AREA': {
      const location = await assertLocation(payload.locationId || ctx.locationId);
      if (action === 'CREATE') {
        if (!payload.floorId || !payload.sectionId) {
          throw new OrgError(400, 'A work area / counter must belong to a floor and a section');
        }
        await assertFloor(payload.floorId, location.id);
        const section = await assertSection(payload.sectionId, location.id);
        if (section.floorId !== payload.floorId) {
          throw new OrgError(400, 'The selected section belongs to a different floor');
        }
        const code = normalizeCode(payload.code, 'Work area code');
        await assertCodeAvailable('sellingpoint', code, location.id);
        if (payload.departmentId) await assertDepartment(payload.departmentId, location.id);
        if (payload.managerId) await assertActiveUser(payload.managerId, 'Work area manager');
      } else if (ctx.workAreaId) {
        await assertWorkArea(ctx.workAreaId, location.id);
        if (payload.sectionId) await assertSection(payload.sectionId, location.id);
        if (payload.code) {
          const code = normalizeCode(payload.code, 'Work area code');
          await assertCodeAvailable('sellingpoint', code, location.id, ctx.workAreaId);
        }
        if (payload.managerId) await assertActiveUser(payload.managerId, 'Work area manager');
      }
      break;
    }

    case 'EMPLOYEE_ALLOCATION':
    case 'EMPLOYEE_TRANSFER': {
      const employee = await assertEmployee(ctx.employeeId as string);
      const location = await assertLocation(payload.locationId);
      if (payload.floorId) await assertFloor(payload.floorId, location.id);
      if (payload.departmentId) await assertDepartment(payload.departmentId, location.id);
      if (payload.sectionId) {
        const section = await assertSection(payload.sectionId, location.id);
        if (payload.departmentId && section.departmentId && section.departmentId !== payload.departmentId) {
          throw new OrgError(400, 'The selected section belongs to a different department');
        }
        if (payload.floorId && section.floorId !== payload.floorId) {
          throw new OrgError(400, 'The selected section belongs to a different floor');
        }
      }
      if (payload.workAreaId) {
        const wa = await assertWorkArea(payload.workAreaId, location.id);
        if (payload.sectionId && wa.sectionId !== payload.sectionId) {
          throw new OrgError(400, 'The selected work area belongs to a different section');
        }
      }
      if (payload.reportingManagerId) {
        await assertActiveUser(payload.reportingManagerId, 'Reporting supervisor');
        if (payload.reportingManagerId === employee.id) {
          throw new OrgError(400, 'An employee cannot be their own reporting supervisor');
        }
      }

      const unchanged =
        employee.locationId === location.id &&
        (payload.floorId || null) === (employee.floorId || null) &&
        (payload.departmentId || null) === (employee.departmentId || null) &&
        (payload.sectionId || null) === (employee.sectionId || null);

      if (requestType === 'EMPLOYEE_ALLOCATION' && unchanged && !payload.workAreaId && !payload.reportingManagerId) {
        throw new OrgError(
          409,
          `Employee ${employee.employeeCode} is already allocated to that exact assignment`
        );
      }
      if (requestType === 'EMPLOYEE_TRANSFER' && unchanged && !payload.workAreaId && !payload.reportingManagerId) {
        throw new OrgError(
          409,
          `Employee ${employee.employeeCode} is already in the proposed location / floor / department / section`
        );
      }
      break;
    }

    case 'MANAGER_ASSIGNMENT': {
      const scope = String(payload.scope || '').toUpperCase();
      if (!['EMPLOYEE', 'LOCATION', 'FLOOR', 'DEPARTMENT', 'SECTION'].includes(scope)) {
        throw new OrgError(400, 'Manager assignment scope must be EMPLOYEE, LOCATION, FLOOR, DEPARTMENT or SECTION');
      }
      if (!payload.managerId) throw new OrgError(400, 'A manager must be selected');
      const manager = await assertActiveUser(payload.managerId, 'Manager');
      if (scope === 'EMPLOYEE') {
        await assertEmployee(ctx.employeeId as string);
      } else if (scope === 'LOCATION') {
        await assertLocation(ctx.locationId);
      } else if (scope === 'FLOOR') {
        const floor = await one('SELECT id, locationId FROM floor WHERE id = ?', [ctx.floorId]);
        if (!floor) throw new OrgError(400, 'The selected floor does not exist');
        await assertLocation(floor.locationId);
      } else if (scope === 'DEPARTMENT') {
        const dept = await one('SELECT id, locationId FROM department WHERE id = ?', [ctx.departmentId]);
        if (!dept) throw new OrgError(400, 'The selected department does not exist');
        await assertLocation(dept.locationId);
      } else if (scope === 'SECTION') {
        const section = await one('SELECT id, locationId FROM section WHERE id = ?', [ctx.sectionId]);
        if (!section) throw new OrgError(400, 'The selected section does not exist');
        await assertLocation(section.locationId);
      }
      if (scope !== 'EMPLOYEE' && manager.role === 'EMPLOYEE') {
        throw new OrgError(400, 'The selected user has a non-managerial role');
      }
      break;
    }

    case 'ADMIN_ACCOUNT': {
      const email = requireString(payload.email, 'Work email', 5, 191).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new OrgError(400, 'A valid work email is required');
      }
      requireString(payload.fullName, 'Full name', 3, 191);

      const duplicate = await one('SELECT id FROM user WHERE LOWER(email) = ?', [email]);
      if (duplicate) throw new OrgError(409, 'A user with this email already exists');

      if (payload.employeeId) {
        const emp = await one('SELECT id FROM employee WHERE id = ? OR employeeCode = ?', [
          payload.employeeId,
          payload.employeeId,
        ]);
        if (!emp) throw new OrgError(400, 'The provided employee ID was not found');
        const linked = await one('SELECT id FROM user WHERE employeeId = ?', [emp.id]);
        if (linked) throw new OrgError(409, 'That employee already has a user account');
      }

      const role = String(payload.role || '').toUpperCase();
      if (!ADMIN_ACCOUNT_ROLES.includes(role)) {
        throw new OrgError(
          400,
          `Role must be one of: ${ADMIN_ACCOUNT_ROLES.join(', ')} (a Super Admin account cannot be created through this workflow)`
        );
      }

      if (!Array.isArray(payload.permissions) || payload.permissions.length === 0) {
        throw new OrgError(400, 'At least one module permission is required');
      }
      const unknown = payload.permissions.filter(
        (p: unknown) => typeof p !== 'string' || !KNOWN_PERMISSIONS.includes(p)
      );
      if (unknown.length > 0) {
        throw new OrgError(400, `Unknown permissions: ${unknown.join(', ')}`);
      }

      if (!Array.isArray(payload.locationIds) || payload.locationIds.length === 0) {
        throw new OrgError(400, 'At least one authorized location must be selected');
      }
      for (const locId of payload.locationIds) await assertLocation(locId, 'locationIds');

      requireString(payload.justification, 'Request justification', 10, 1000);
      break;
    }

    default:
      throw new OrgError(400, `Unsupported request type: ${requestType}`);
  }
}
