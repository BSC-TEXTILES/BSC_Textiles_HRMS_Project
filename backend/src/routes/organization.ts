/**
 * Organization Management Module — read routes
 *
 * Provides the live organization hierarchy data (locations, floors,
 * departments, sections, work areas / selling points) with employee
 * counts computed from real employee and attendance data.
 *
 * All endpoints require authentication; write-side endpoints live in
 * `orgApprovals.ts` (approval workflow).
 */
import { Router, Response, NextFunction } from 'express';
import { pool } from '../db.js';
import { authenticate, requireRole, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { OrgError } from '../services/orgPermissionService.js';
import {
  getDashboard,
  getHierarchy,
  getRoster,
  getEmployeeAssignmentDetail,
  getRecentActivity,
} from '../services/organizationService.js';
import {
  getAllDesignations,
  createDesignation,
  updateDesignation,
  deleteDesignation,
  assignEmployeeDesignation,
} from '../services/designationService.js';

const router = Router();
router.use(authenticate);

/** Shared error handler for OrgError-based services. */
function handleError(err: unknown, res: Response, next: NextFunction): void {
  if (err instanceof OrgError) {
    res.status(err.status).json({ success: false, error: { message: err.message, details: err.details } });
    return;
  }
  next(err);
}

/**
 * GET /organization/dashboard?locationId=
 * Location-aware organization dashboard with live counts.
 */
router.get(
  '/dashboard',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = getScopedLocationId(req.user, req.query.locationId);
      const data = await getDashboard(req.user!, locationId);
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * GET /organization/hierarchy?locationId=
 * Returns the full hierarchy tree (locations → floors → departments → sections → work areas).
 */
router.get(
  '/hierarchy',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = getScopedLocationId(req.user, req.query.locationId);
      const data = await getHierarchy(req.user!, locationId);
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * GET /organization/roster?locationId=&floorId=&departmentId=&sectionId=&workAreaId=&search=&status=&page=&limit=
 * Employees assigned to a location / floor / department / section / work area.
 */
router.get(
  '/roster',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = getScopedLocationId(req.user, req.query.locationId);
      const data = await getRoster(req.user!, {
        locationId,
        floorId: typeof req.query.floorId === 'string' ? req.query.floorId : undefined,
        departmentId: typeof req.query.departmentId === 'string' ? req.query.departmentId : undefined,
        sectionId: typeof req.query.sectionId === 'string' ? req.query.sectionId : undefined,
        workAreaId: typeof req.query.workAreaId === 'string' ? req.query.workAreaId : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 25),
      });
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * GET /organization/employees/:id/assignment
 * Full assignment view for one employee.
 */
router.get(
  '/employees/:id/assignment',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await getEmployeeAssignmentDetail(req.user!, req.params.id);
      if (!data) {
        res.status(404).json({ success: false, error: { message: 'Employee not found' } });
        return;
      }
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * GET /organization/activity?locationId=&limit=
 * Recent approved organization changes (audit feed).
 */
router.get(
  '/activity',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = getScopedLocationId(req.user, req.query.locationId);
      const limit = Math.min(Number(req.query.limit || 10), 50);
      const data = await getRecentActivity(req.user!, locationId, limit);
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * GET /organization/settings
 * Org settings (approval policy, live updates) for authenticated users.
 */
router.get(
  '/settings',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const cfg = await pool.query(
        `SELECT \`key\`, \`value\` FROM orgsettings
         WHERE \`key\` IN ('approvalPolicy','emergencyOverride','liveUpdates')`,
      );
      const rows: any[] = (cfg as any)[0] ?? [];
      const liveUpdates = rows.find((r: any) => r.key === 'liveUpdates')?.value ?? null;
      const emergencyOverride = rows.find((r: any) => r.key === 'emergencyOverride')?.value ?? null;
      const approvalPolicy = rows.find((r: any) => r.key === 'approvalPolicy')?.value ?? null;
      res.json({ success: true, data: { approvalPolicy, liveUpdates, emergencyOverride } });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * GET /organization/designations
 * Returns full designation matrix with actual employee counts, departments, and employees list.
 */
router.get(
  '/designations',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (_req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await getAllDesignations();
      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /organization/designations
 * Adds a new designation and persists to the database.
 */
router.post(
  '/designations',
  requireRole('SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'ORGANIZATION_MANAGER'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title, grade, band, minSalary, maxSalary, description, icon, department } = req.body || {};
      if (!title || !grade) {
        res.status(400).json({ success: false, error: { message: 'Title and grade are required' } });
        return;
      }
      await createDesignation({ title, grade, band, minSalary, maxSalary, description, icon, department });
      const data = await getAllDesignations();
      res.status(201).json({ success: true, message: `Designation "${title}" created successfully`, data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * PUT /organization/designations/:id
 * Updates an existing designation in the database.
 */
router.put(
  '/designations/:id',
  requireRole('SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'ORGANIZATION_MANAGER'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await updateDesignation(id, req.body || {});
      const data = await getAllDesignations();
      res.json({ success: true, message: 'Designation updated successfully', data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * DELETE /organization/designations/:id
 * Deactivates a designation.
 */
router.delete(
  '/designations/:id',
  requireRole('SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'ORGANIZATION_MANAGER'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      await deleteDesignation(id);
      const data = await getAllDesignations();
      res.json({ success: true, message: 'Designation removed successfully', data });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * POST /organization/designations/:title/assign
 * Assigns an employee to this designation.
 */
router.post(
  '/designations/:title/assign',
  requireRole('SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'ORGANIZATION_MANAGER'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { title } = req.params;
      const { employeeId } = req.body || {};
      if (!employeeId) {
        res.status(400).json({ success: false, error: { message: 'employeeId is required' } });
        return;
      }
      await assignEmployeeDesignation(employeeId, title);
      const data = await getAllDesignations();
      res.json({ success: true, message: 'Employee designation updated', data });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
