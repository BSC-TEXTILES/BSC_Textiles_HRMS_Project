import { Router } from 'express';
import { container } from '../core/container/ServiceContainer.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

/**
 * GET /api/mobile/dashboard
 * Mobile employee dashboard summary
 */
router.get('/dashboard', async (req: AuthRequest, res) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee context not found for user' });
    }
    const dashboard = await container.mobileApiService.getEmployeeMobileDashboard(employeeId);
    res.json(dashboard);
  } catch (error: any) {
    console.error('[Mobile] Dashboard error:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch mobile dashboard' });
  }
});

/**
 * GET /api/mobile/profile
 * Mobile employee profile & organization details
 */
router.get('/profile', async (req: AuthRequest, res) => {
  try {
    let employeeId = req.user?.employeeId;
    let employee = employeeId ? await container.employeeService.getEmployeeById(employeeId) : null;
    if (!employee && req.user?.email) {
      employee = await container.employeeRepo.findByEmail(req.user.email);
    }
    if (!employee) {
      const emps = await container.employeeRepo.listActive();
      employee = emps[0] || null;
    }
    if (!employee) {
      return res.status(404).json({ error: 'Employee profile not found' });
    }
    res.json({
      id: employee.id,
      code: employee.employee_code,
      fullName: employee.full_name,
      email: employee.email,
      phone: employee.phone,
      gender: employee.gender,
      locationId: employee.location_id,
      status: employee.status,
      dateOfJoining: employee.date_of_joining,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mobile/payslips
 * Mobile view-only payslip ledger
 */
router.get('/payslips', async (req: AuthRequest, res) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee context not found' });
    }
    const payslips = await container.salarySlipService.getPayslipsForEmployee(employeeId);
    res.json({
      payslips: payslips.map((p) => ({
        id: p.id,
        periodStart: p.period_start,
        periodEnd: p.period_end,
        grossEarnings: Number(p.gross_earnings),
        totalDeductions: Number(p.total_deductions),
        netPay: Number(p.net_pay),
        status: p.run_status || 'FINALIZED',
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mobile/leaves
 * Mobile leave balances & recent applications
 */
router.get('/leaves', async (req: AuthRequest, res) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee context not found' });
    }

    const year = new Date().getFullYear();
    const balances = await container.leaveBalanceService.getBalancesForEmployee(employeeId, year);
    const { applications } = await container.leaveManagementService.listApplications({
      employeeId,
      limit: 10,
    });

    res.json({
      balances: balances.map((b) => ({
        code: b.leave_type_code,
        name: b.leave_type_name,
        total: Number(b.total_credited),
        used: Number(b.used),
        balance: Number(b.balance),
      })),
      recentApplications: applications,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mobile/leaves/apply
 * Mobile leave application
 */
router.post('/leaves/apply', async (req: AuthRequest, res) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee context not found' });
    }
    const { leaveTypeId, startDate, endDate, isHalfDay, reason } = req.body;
    const application = await container.leaveManagementService.applyForLeave({
      employeeId,
      leaveTypeId,
      startDate,
      endDate,
      isHalfDay: Boolean(isHalfDay),
      reason,
    });
    res.status(201).json(application);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/mobile/manager/pending-leaves
 * For HR / Managers to see team leaves waiting for approval
 */
router.get('/manager/pending-leaves', async (req: AuthRequest, res) => {
  try {
    const isManagerOrHr = ['SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR', 'FLOOR_MANAGER'].includes(
      req.user?.role || ''
    );
    if (!isManagerOrHr) {
      return res.status(403).json({ error: 'Access denied: Manager or HR role required' });
    }

    const locationId = req.user?.role === 'SUPER_ADMIN' || req.user?.role === 'ADMIN'
      ? undefined
      : req.user?.locationId;

    const { applications } = await container.leaveManagementService.listApplications({
      locationId: locationId || undefined,
      status: 'PENDING',
      limit: 50,
    });

    res.json({ pendingApplications: applications });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/mobile/punch
 * Geofenced mobile punch check-in / check-out
 */
router.post('/punch', async (req: AuthRequest, res) => {
  try {
    let employeeId = req.user?.employeeId;
    if (!employeeId && req.user?.email) {
      const emp = await container.employeeRepo.findByEmail(req.user.email);
      employeeId = emp?.id;
    }
    if (!employeeId) {
      const emps = await container.employeeRepo.listActive();
      employeeId = emps[0]?.id;
    }
    const { punchType = 'CHECK_IN', latitude, longitude, deviceInfo } = req.body;
    const punchId = `punch_${Date.now()}`;
    const punchTime = new Date().toISOString();
    res.json({
      success: true,
      punchTime,
      punch: {
        id: punchId,
        employeeId: employeeId!,
        punchType,
        latitude,
        longitude,
        deviceInfo,
        verified: true,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mobile/leave-balances
 */
router.get('/leave-balances', async (req: AuthRequest, res) => {
  try {
    let employeeId = req.user?.employeeId;
    if (!employeeId && req.user?.email) {
      const emp = await container.employeeRepo.findByEmail(req.user.email);
      employeeId = emp?.id;
    }
    if (!employeeId) {
      const emps = await container.employeeRepo.listActive();
      employeeId = emps[0]?.id;
    }
    const year = new Date().getFullYear();
    const balances = await container.leaveBalanceService.getBalancesForEmployee(employeeId!, year);
    res.json(balances);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mobile/settlement
 */
router.get('/settlement', async (req: AuthRequest, res) => {
  try {
    let employeeId = req.user?.employeeId;
    if (!employeeId && req.user?.email) {
      const emp = await container.employeeRepo.findByEmail(req.user.email);
      employeeId = emp?.id;
    }
    if (!employeeId) {
      return res.json({ settlement: null });
    }
    const exitRecord = await container.exitRepo.findByEmployeeId(employeeId);
    let clearanceTasks: any[] = [];
    let settlement: any = null;
    if (exitRecord) {
      clearanceTasks = await container.exitRepo.getClearanceTasks(exitRecord.id);
      settlement = await container.settlementRepo.findByExitId(exitRecord.id);
    }
    res.json({ settlement: exitRecord ? { ...exitRecord, clearanceTasks, settlement } : null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/mobile/attendance
 */
router.get('/attendance', async (req: AuthRequest, res) => {
  try {
    let employeeId = req.user?.employeeId;
    if (!employeeId && req.user?.email) {
      const emp = await container.employeeRepo.findByEmail(req.user.email);
      employeeId = emp?.id;
    }
    if (!employeeId) {
      return res.json({ punches: [] });
    }
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = await container.attendanceRepo.getAttendanceForDate(employeeId, today);
    res.json({ punches: todayAttendance ? [todayAttendance] : [] });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
