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
    const targetEmpId = (req.query.employeeId as string) || req.user?.employeeId;
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
        // /leaves/applications is an API path, not a page — the only leave
        // screen is /leaves. A notification deep-linking to it 404s.
        actionUrl: `/leaves?application=${application.id}`,
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
        // /leaves/applications is an API path, not a page — the only leave
        // screen is /leaves. A notification deep-linking to it 404s.
        actionUrl: `/leaves?application=${application.id}`,
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
        // /leaves/applications is an API path, not a page — the only leave
        // screen is /leaves. A notification deep-linking to it 404s.
        actionUrl: `/leaves?application=${application.id}`,
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

/**
 * POST /api/leaves/import
 * Bulk Import Leave Details & Historical Records
 */
router.post('/import', authorize('ADD'), async (req: AuthRequest, res) => {
  try {
    const { leaves } = req.body || {};
    if (!Array.isArray(leaves) || leaves.length === 0) {
      return res.status(400).json({ error: 'A non-empty leaves array is required' });
    }

    let importedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ row: number; reason: string }> = [];

    for (let i = 0; i < leaves.length; i++) {
      const row = leaves[i];
      try {
        const empQuery = String(row.employeeId || row.employeeCode || '').trim();
        if (!empQuery) {
          skippedCount++;
          errors.push({ row: i + 1, reason: 'Missing employee identifier' });
          continue;
        }

        const employee = await prisma.employee.findFirst({
          where: { OR: [{ id: empQuery }, { employeeCode: empQuery }] },
          select: { id: true, locationId: true, fullName: true },
        });

        if (!employee) {
          skippedCount++;
          errors.push({ row: i + 1, reason: `Employee not found: ${empQuery}` });
          continue;
        }

        const startDate = new Date(row.startDate);
        const endDate = new Date(row.endDate || row.startDate);
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
          skippedCount++;
          errors.push({ row: i + 1, reason: 'Invalid start or end date' });
          continue;
        }

        const days = Number(row.days || 1);
        const leaveType = ['CASUAL', 'SICK', 'EARNED', 'UNPAID'].includes(String(row.leaveType).toUpperCase())
          ? String(row.leaveType).toUpperCase()
          : 'CASUAL';

        const status = ['APPROVED', 'PENDING', 'REJECTED'].includes(String(row.status).toUpperCase())
          ? String(row.status).toUpperCase()
          : 'APPROVED';

        // Check duplicate
        const existing = await prisma.leaveRequest.findFirst({
          where: {
            employeeId: employee.id,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
            status: { in: ['APPROVED', 'PENDING'] },
          },
        });

        if (existing) {
          skippedCount++;
          errors.push({ row: i + 1, reason: `Overlapping leave request already exists on record` });
          continue;
        }

        await prisma.leaveRequest.create({
          data: {
            employeeId: employee.id,
            locationId: employee.locationId,
            leaveType: leaveType as any,
            startDate,
            endDate,
            days,
            reason: String(row.reason || 'Imported historical leave record').slice(0, 190),
            status: status as any,
            appliedById: req.user?.id,
            reviewedById: status === 'APPROVED' ? req.user?.id : null,
          },
        });

        // If approved, update attendance status on those dates
        if (status === 'APPROVED') {
          const cur = new Date(startDate);
          while (cur <= endDate) {
            const ymd = cur.toISOString().slice(0, 10);
            await prisma.attendance.updateMany({
              where: { employeeId: employee.id, attendanceDate: ymd },
              data: { status: 'ON_LEAVE' },
            });
            cur.setDate(cur.getDate() + 1);
          }
        }

        importedCount++;
      } catch (err: any) {
        skippedCount++;
        errors.push({ row: i + 1, reason: err?.message || 'Processing failed' });
      }
    }

    res.json({
      success: true,
      totalRows: leaves.length,
      importedCount,
      skippedCount,
      errors,
      message: `Successfully imported ${importedCount} leave records (${skippedCount} skipped).`,
    });
  } catch (error: any) {
    console.error('Leave import error:', error);
    res.status(500).json({ error: 'Failed to import leave records', message: error.message });
  }
});

export default router;
