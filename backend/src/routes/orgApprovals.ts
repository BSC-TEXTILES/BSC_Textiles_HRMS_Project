/**
 * Organization Management Module — change-request / approval routes
 *
 * Implements the mandated approval workflow:
 *   1. An authorized user creates and submits a change request
 *   2. A preliminary manager (location / floor / department) reviews it
 *   3. HR performs the final approval which *applies* the change transactionally
 *   4. Requester and stakeholders are notified via the existing notification
 *      service and Socket.IO `organization:changed` event
 *
 * Security: every endpoint re-checks permissions server-side via
 * `orgPermissionService` (scope, stage reviewer, no self-approval,
 * duplicate prevention, transaction safety). Frontend checks are cosmetic.
 */
import { Router, Response, NextFunction } from 'express';
import { authenticate, requireRole, AuthRequest, getScopedLocationId } from '../middleware/auth.js';
import { OrgError, resolveScope } from '../services/orgPermissionService.js';
import {
  createChangeRequest,
  updateChangeRequest,
  cancelChangeRequest,
  submitChangeRequest,
  decideChangeRequest,
  emergencyOverrideChangeRequest,
  listChangeRequests,
  getChangeRequestDetail,
} from '../services/orgApprovalService.js';
import type { CreateChangeRequestInput, RequestListFilters } from '../services/orgApprovalService.js';

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
 * GET /organization/approvals/requests?status=&locationId=&requestType=&stage=&search=&page=&limit=
 * List change requests visible to the current user (role + location scoped).
 */
router.get(
  '/requests',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const locationId = getScopedLocationId(req.user, req.query.locationId);
      const filters: RequestListFilters = {
        locationId,
        requestType: typeof req.query.requestType === 'string' ? req.query.requestType : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        stage: typeof req.query.stage === 'string' ? req.query.stage : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        from: typeof req.query.from === 'string' ? req.query.from : undefined,
        to: typeof req.query.to === 'string' ? req.query.to : undefined,
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
      };
      const data = await listChangeRequests(req.user!, filters);
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * GET /organization/approvals/requests/:id
 * Full request detail including payload, timeline, and current stage.
 */
router.get(
  '/requests/:id',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const data = await getChangeRequestDetail(req.user!, req.params.id);
      res.json({ success: true, data });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * POST /organization/approvals/requests
 * Create a new change request (in DRAFT status; optionally submit immediately).
 */
router.post(
  '/requests',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input: CreateChangeRequestInput = {
        requestType: String(req.body?.requestType || '') as CreateChangeRequestInput['requestType'],
        action: String(req.body?.action || '') as CreateChangeRequestInput['action'],
        reason: String(req.body?.reason || ''),
        title: typeof req.body?.title === 'string' ? req.body.title : undefined,
        locationId: req.body?.locationId ?? null,
        floorId: req.body?.floorId ?? null,
        departmentId: req.body?.departmentId ?? null,
        sectionId: req.body?.sectionId ?? null,
        workAreaId: req.body?.workAreaId ?? null,
        employeeId: req.body?.employeeId ?? null,
        effectiveDate: req.body?.effectiveDate ?? null,
        payload: req.body?.payload ?? {},
      };
      const options = { submit: req.body?.submit === true };
      const result = await createChangeRequest(input, req.user!, options);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * PATCH /organization/approvals/requests/:id
 * Edit a DRAFT or CHANGES_REQUESTED request (title / reason / payload / effectiveDate).
 */
router.patch(
  '/requests/:id',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const changes: { title?: string; reason?: string; payload?: any; effectiveDate?: string | null } = {};
      if (typeof req.body?.title === 'string') changes.title = req.body.title;
      if (typeof req.body?.reason === 'string') changes.reason = req.body.reason;
      if (req.body?.payload !== undefined) changes.payload = req.body.payload;
      if (req.body?.effectiveDate !== undefined) changes.effectiveDate = req.body.effectiveDate;
      const result = await updateChangeRequest(req.params.id, req.user!, changes);
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * DELETE /organization/approvals/requests/:id
 * Cancel a DRAFT, PENDING, or CHANGES_REQUESTED request (soft-cancel; audit preserved).
 */
router.delete(
  '/requests/:id',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await cancelChangeRequest(req.params.id, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * POST /organization/approvals/requests/:id/submit
 * Move a DRAFT / CHANGES_REQUESTED request into the PENDING review queue.
 */
router.post(
  '/requests/:id/submit',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await submitChangeRequest(req.params.id, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * POST /organization/approvals/requests/:id/decide
 * Reviewer decision (APPROVE / REJECT / REQUEST_CHANGES) for the current stage.
 * On final HR approval the change is applied transactionally.
 */
router.post(
  '/requests/:id/decide',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const decision = String(req.body?.decision || '').toUpperCase();
      if (!['APPROVE', 'REJECT', 'REQUEST_CHANGES'].includes(decision)) {
        res.status(422).json({
          success: false,
          error: { message: 'Decision must be APPROVE, REJECT, or REQUEST_CHANGES' },
        });
        return;
      }
      const remarks = typeof req.body?.remarks === 'string' ? req.body.remarks : undefined;
      const result = await decideChangeRequest(req.params.id, decision as any, remarks, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * POST /organization/approvals/requests/:id/emergency-override
 * Super Admin audited emergency override. Applies the change immediately but
 * records a distinct `EMERGENCY_OVERRIDE` audit event — never a silent bypass.
 */
router.post(
  '/requests/:id/emergency-override',
  requireRole('SUPER_ADMIN'),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const justification = typeof req.body?.justification === 'string' ? req.body.justification : '';
      const result = await emergencyOverrideChangeRequest(req.params.id, justification, req.user!);
      res.json({ success: true, data: result });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

/**
 * GET /organization/approvals/summary
 * Quick counts for the approvals inbox header (pending for me, my requests, etc.).
 */
router.get(
  '/summary',
  requireRole(
    'SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'HR_AUDITOR',
    'ORGANIZATION_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER',
    'EMPLOYEE',
  ),
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveScope(req.user!);
      const userId = req.user!.id;
      const userRole = req.user!.role;

      // Requests awaiting preliminary review or final HR approval
      const pendingFilters: RequestListFilters = { status: 'PENDING', limit: 100 };
      const pending = await listChangeRequests(req.user!, pendingFilters);

      // Requests I created
      const mineFilters: RequestListFilters = { requestedById: userId, limit: 100 };
      const mine = await listChangeRequests(req.user!, mineFilters);

      // Requests awaiting final HR approval
      const hrFilters: RequestListFilters = { status: 'PENDING', stage: 'HR', limit: 100 };
      const hrQueue = await listChangeRequests(req.user!, hrFilters);

      res.json({
        success: true,
        data: {
          pendingForMe: pending.total,
          myRequests: mine.total,
          awaitingHr: hrQueue.total,
          scope,
        },
      });
    } catch (err) {
      handleError(err, res, next);
    }
  },
);

export default router;
