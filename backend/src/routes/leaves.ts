import { Router } from 'express';
import { container } from '../core/container/ServiceContainer.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { prisma } from '../index.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/leaves/types
 * List all active leave types & annual quotas
 */
router.get('/types', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const types = await container.leaveManagementService.getLeaveTypes();
    res.json(types);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch leave types', message: error.message });
  }
});

/**
 * GET /api/leaves/balances
 * Get leave balances for an employee (self or specified)
 */
router.get('/balances', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    let targetEmpId = (req.query.employeeId as string) || req.user?.employeeId;
    if (!targetEmpId) {
      const emps = await container.employeeRepo.listActive();
      targetEmpId = emps[0]?.id;
    }
    if (!targetEmpId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    // Role check: Employees can only view their own balances
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'SALES_EMPLOYEE') {
      if (targetEmpId !== req.user?.employeeId) {
        return res.status(403).json({ error: 'Access denied: You can only view your own leave balance' });
      }
    }

    const year = Number(req.query.year || new Date().getFullYear());
    const balances = await container.leaveBalanceService.getBalancesForEmployee(targetEmpId, year);
    res.json(balances);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch leave balances', message: error.message });
  }
});

/**
 * POST /api/leaves/apply
 * Employee applies for leave
 */
router.post('/apply', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, leaveTypeId, startDate, endDate, isHalfDay, halfDaySession, reason, documentUrl } = req.body;
    const targetEmpId = employeeId || req.user?.employeeId;

    if (!targetEmpId) {
      return res.status(400).json({ error: 'Employee ID is required' });
    }

    // Role check: Employees can only apply for themselves
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'SALES_EMPLOYEE') {
      if (targetEmpId !== req.user?.employeeId) {
        return res.status(403).json({ error: 'Access denied: You can only apply for your own leaves' });
      }
    }

    const application = await container.leaveManagementService.applyForLeave({
      employeeId: targetEmpId,
      leaveTypeId,
      startDate,
      endDate,
      isHalfDay: Boolean(isHalfDay),
      halfDaySession,
      reason,
      documentUrl,
    });

    // Get employee details for notification
    const employee = await prisma.employee.findUnique({
      where: { id: targetEmpId },
      select: { fullName: true, employeeCode: true, locationId: true },
    });

    // Publish notification for leave request
    if (employee) {
      await container.notificationService.publishEvent({
        eventId: 'LEAVE.REQUESTED',
        title: 'New Leave Request',
        message: `${employee.fullName} (${employee.employeeCode}) requested leave from ${startDate} to ${endDate}.`,
        type: 'INFO',
        severity: 'MEDIUM',
        entityType: 'leaveRequest',
        entityId: application.id,
        locationId: employee.locationId,
        actionUrl: `/leaves/applications?id=${application.id}`,
        correlationId: `leave_req_${application.id}`,
        metadata: { leaveTypeId, startDate, endDate, isHalfDay, reason },
      });
    }

    res.status(201).json(application);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to submit leave application' });
  }
});

/**
 * GET /api/leaves/applications
 * List leave applications (employees see own, managers/HR see scoped team)
 */
router.get('/applications', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, locationId, status, page = '1', limit = '20' } = req.query;

    let targetEmpId = employeeId as string;
    let targetLocId = locationId as string;

    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'SALES_EMPLOYEE') {
      targetEmpId = req.user.employeeId!;
      targetLocId = undefined as any;
    } else if (req.user?.role !== 'SUPER_ADMIN' && req.user?.role !== 'ADMIN') {
      targetLocId = req.user?.locationId || (undefined as any);
    }

    const data = await container.leaveManagementService.listApplications({
      employeeId: targetEmpId,
      locationId: targetLocId,
      status: status as string,
      page: Number(page),
      limit: Number(limit),
    });

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch leave applications', message: error.message });
  }
});

/**
 * POST /api/leaves/applications/:id/approve
 * Manager/HR approves leave application
 */
router.post('/applications/:id/approve', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const approved = await container.leaveManagementService.approve(
      req.params.id,
      req.user?.id || 'system'
    );

    // Get application details for notification
    const application = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { fullName: true, employeeCode: true, locationId: true } } },
    });

    if (application?.employee) {
      await container.notificationService.publishEvent({
        eventId: 'LEAVE.APPROVED',
        title: 'Leave Request Approved',
        message: `Leave request for ${application.employee.fullName} (${application.employee.employeeCode}) has been approved.`,
        type: 'INFO',
        severity: 'MEDIUM',
        entityType: 'leaveRequest',
        entityId: application.id,
        locationId: application.employee.locationId,
        actionUrl: `/leaves/applications?id=${application.id}`,
        correlationId: `leave_approved_${application.id}`,
        metadata: { approvedBy: req.user!.id },
      });
    }

    res.json(approved);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to approve leave application' });
  }
});

/**
 * POST /api/leaves/applications/:id/reject
 * Manager/HR rejects leave application with reason
 */
router.post('/applications/:id/reject', authorize('REJECT'), async (req: AuthRequest, res) => {
  try {
    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ error: 'Documented rejection reason is mandatory' });
    }

    const rejected = await container.leaveManagementService.reject(
      req.params.id,
      req.user?.id || 'system',
      reason
    );

    // Get application details for notification
    const application = await prisma.leaveRequest.findUnique({
      where: { id: req.params.id },
      include: { employee: { select: { fullName: true, employeeCode: true, locationId: true } } },
    });

    if (application?.employee) {
      await container.notificationService.publishEvent({
        eventId: 'LEAVE.REJECTED',
        title: 'Leave Request Rejected',
        message: `Leave request for ${application.employee.fullName} (${application.employee.employeeCode}) has been rejected. Reason: ${reason}`,
        type: 'WARNING',
        severity: 'HIGH',
        entityType: 'leaveRequest',
        entityId: application.id,
        locationId: application.employee.locationId,
        actionUrl: `/leaves/applications?id=${application.id}`,
        correlationId: `leave_rejected_${application.id}`,
        metadata: { rejectedBy: req.user!.id, reason },
      });
    }

    res.json(rejected);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to reject leave application' });
  }
});

/**
 * POST /api/leaves/applications/:id/cancel
 * Employee cancels pending leave request
 */
router.post('/applications/:id/cancel', authorize('RECORD'), async (req: AuthRequest, res) => {
  try {
    const targetEmpId = req.user?.employeeId;
    if (!targetEmpId) {
      return res.status(400).json({ error: 'Employee context not found' });
    }

    await container.leaveManagementService.cancelApplication(req.params.id, targetEmpId);
    res.json({ success: true, message: 'Leave application cancelled successfully' });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to cancel leave application' });
  }
});

export default router;
