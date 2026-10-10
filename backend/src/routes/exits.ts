import { Router } from 'express';
import { container } from '../core/container/ServiceContainer.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/exits/stats
 * Dedicated Former Employees & F&F Dashboard metrics
 */
router.get(['/stats', '/dashboard-stats'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const locationId = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN'
      ? (req.query.locationId as string)
      : req.user?.locationId;
    const stats = await container.hrmDashboardService.getFormerEmployeesStats(locationId || undefined);
    res.json(stats);
  } catch (error: any) {
    console.error('[Exits] Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch former employee stats', message: error.message });
  }
});

/**
 * GET /api/exits/former-employees
 * Paginated list of former employees with filter options
 */
router.get(['/former-employees', '/'], authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { locationId, departmentId, status, search, page = '1', limit = '20' } = req.query;
    const scopedLoc = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN'
      ? (locationId as string)
      : req.user?.locationId;

    const data = await container.employeeService.getFormerEmployees({
      locationId: scopedLoc || undefined,
      departmentId: departmentId as string,
      status: status as string,
      search: search as string,
      page: Number(page),
      limit: Number(limit),
    });
    res.json({
      ...data,
      exits: data.employees,
      pagination: {
        total: data.total,
        page: data.page,
        limit: data.limit,
      },
    });
  } catch (error: any) {
    console.error('[Exits] List former employees error:', error);
    res.status(500).json({ error: 'Failed to list former employees', message: error.message });
  }
});

/**
 * POST /api/exits/initiate
 * Initiate resignation, termination, or retirement
 */
router.post('/initiate', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { employeeId, exitType, resignationDate, noticePeriodDays, lastWorkingDay, reason } = req.body;
    if (!employeeId || !exitType || !resignationDate || !lastWorkingDay || !reason) {
      return res.status(400).json({ error: 'Missing required exit fields' });
    }

    const exit = await container.employeeExitService.initiateExit({
      employeeId,
      exitType,
      resignationDate,
      noticePeriodDays: Number(noticePeriodDays || 30),
      lastWorkingDay,
      reason,
      initiatorId: req.user?.id,
    });
    res.status(201).json(exit);
  } catch (error: any) {
    console.error('[Exits] Initiate exit error:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate exit' });
  }
});

/**
 * GET /api/exits/:id
 * Exit record details with clearance checklist tasks
 */
router.get('/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const details = await container.employeeExitService.getExitDetails(req.params.id);
    res.json(details);
  } catch (error: any) {
    res.status(404).json({ error: error.message || 'Exit record not found' });
  }
});

/**
 * PUT /api/exits/clearance/:taskId
 * Update departmental clearance status
 */
router.put('/clearance/:taskId', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { status, remarks } = req.body;
    if (!status || !['CLEARED', 'REJECTED', 'WAIVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid clearance status' });
    }

    await container.employeeExitService.updateClearance(
      req.params.taskId,
      status,
      remarks || '',
      req.user?.id || 'system'
    );
    res.json({ success: true, message: 'Clearance task updated successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to update clearance task' });
  }
});

/**
 * POST /api/exits/:id/calculate-fnf
 * Calculate preliminary Full & Final settlement statement
 */
router.post('/:id/calculate-fnf', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const settlement = await container.fnfSettlementService.calculateAndPrepareSettlement(
      req.params.id,
      req.user?.id
    );
    res.json(settlement);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to calculate settlement' });
  }
});

/**
 * GET /api/exits/:id/settlement
 * Retrieve settlement details
 */
router.get('/:id/settlement', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const settlement = await container.fnfSettlementService.getSettlementByExitId(req.params.id);
    if (!settlement) {
      return res.status(404).json({ error: 'Settlement statement not yet prepared for this exit' });
    }
    res.json(settlement);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/exits/settlement/:id/component
 * HR edit of permitted settlement component with audit reason
 */
router.put('/settlement/:id/component', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { field, value, reason } = req.body;
    if (!field || value === undefined || !reason) {
      return res.status(400).json({ error: 'Field name, new value, and documented audit reason are required' });
    }

    const updated = await container.fnfSettlementService.updateSettlementComponent(
      req.params.id,
      field,
      value,
      reason,
      req.user?.id || 'system'
    );
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to update settlement component' });
  }
});

/**
 * POST /api/exits/settlement/:id/approve
 * Approve finalized settlement
 */
router.post('/settlement/:id/approve', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const approved = await container.fnfSettlementService.approveSettlement(
      req.params.id,
      req.user?.id || 'system'
    );
    res.json(approved);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to approve settlement' });
  }
});

/**
 * POST /api/exits/settlement/:id/pay
 * Record disbursement payment reference and date
 */
router.post('/settlement/:id/pay', authorize('EDIT'), async (req: AuthRequest, res) => {
  try {
    const { paymentReference, paymentMode, paymentDate } = req.body;
    if (!paymentReference || !paymentMode || !paymentDate) {
      return res.status(400).json({ error: 'Payment reference, payment mode, and date are required' });
    }

    const paid = await container.fnfSettlementService.recordPayment(
      req.params.id,
      paymentReference,
      paymentMode,
      paymentDate
    );
    res.json(paid);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to record payment' });
  }
});

/**
 * GET /api/exits/settlement/:id/pdf
 * Stream settlement statement PDF
 */
router.get('/settlement/:id/pdf', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const pdfBuffer = await container.fnfSettlementService.getStatementPdfBuffer(req.params.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="settlement_${req.params.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Failed to generate settlement PDF' });
  }
});

export default router;
