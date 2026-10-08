import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { Decimal } from '@prisma/client/runtime/library';

const router = Router();

router.use(authenticate);

// Get all payroll runs
router.get('/runs', authorize('VIEW_SENSITIVE_DATA'), async (req: AuthRequest, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (status) where.status = String(status);

    const [runs, total] = await Promise.all([
      prisma.payrollRun.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            select: {
              id: true,
              netPay: true,
              basicSalary: true,
              deductions: true,
              earlyIncentive: true,
              salesIncentive: true,
              attendanceIncentive: true,
              penalties: true,
              overtime: true,
              employee: {
                select: {
                  id: true,
                  fullName: true,
                  employeeCode: true,
                  locationId: true,
                },
              },
            },
          },
        },
      }),
      prisma.payrollRun.count({ where }),
    ]);

    // Calculate aggregated stats
    const formattedRuns = runs.map((run) => {
      // Filter items if user is not SUPER_ADMIN
      const visibleItems = req.user!.role === 'SUPER_ADMIN'
        ? run.items
        : run.items.filter((item) => item.employee.locationId === req.user!.locationId);

      const totalPayout = visibleItems.reduce((acc, item) => acc + Number(item.netPay), 0);
      const totalBasic = visibleItems.reduce((acc, item) => acc + Number(item.basicSalary), 0);
      const totalIncentives = visibleItems.reduce(
        (acc, item) =>
          acc +
          Number(item.earlyIncentive) +
          Number(item.salesIncentive) +
          Number(item.attendanceIncentive) +
          Number(item.overtime),
        0
      );
      const totalDeductions = visibleItems.reduce(
        (acc, item) => acc + Number(item.deductions) + Number(item.penalties),
        0
      );

      return {
        id: run.id,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        status: run.status,
        processedBy: run.processedBy,
        processedAt: run.processedAt,
        employeeCount: visibleItems.length,
        totalPayout,
        totalBasic,
        totalIncentives,
        totalDeductions,
        createdAt: run.createdAt,
      };
    });

    res.json({ runs: formattedRuns, total, page: Number(page), limit: Number(limit) });
  } catch (error) {
    console.error('Get payroll runs error:', error);
    res.status(500).json({ error: 'Failed to get payroll runs' });
  }
});

// Get single payroll run details with items
router.get('/runs/:id', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { locationId, search } = req.query;

    const run = await prisma.payrollRun.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            employee: {
              select: {
                id: true,
                fullName: true,
                employeeCode: true,
                designation: true,
                location: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });

    if (!run) {
      return res.status(404).json({ error: 'Payroll run not found' });
    }

    let items = run.items;

    // Apply location restriction
    if (req.user!.role !== 'SUPER_ADMIN') {
      items = items.filter((item) => item.employee.location?.id === req.user!.locationId);
    } else if (locationId) {
      items = items.filter((item) => item.employee.location?.id === locationId);
    }

    if (search) {
      const q = String(search).toLowerCase();
      items = items.filter(
        (item) =>
          item.employee.fullName.toLowerCase().includes(q) ||
          item.employee.employeeCode.toLowerCase().includes(q)
      );
    }

    res.json({
      run: {
        id: run.id,
        periodStart: run.periodStart,
        periodEnd: run.periodEnd,
        status: run.status,
        processedBy: run.processedBy,
        processedAt: run.processedAt,
        createdAt: run.createdAt,
      },
      items,
      totalEmployees: items.length,
      totalNetPay: items.reduce((sum, item) => sum + Number(item.netPay), 0),
    });
  } catch (error) {
    console.error('Get payroll run details error:', error);
    res.status(500).json({ error: 'Failed to get payroll run details' });
  }
});

// Process/Create new payroll run
router.post('/runs', authorize('MANAGE'), async (req: AuthRequest, res) => {
  try {
    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Period start and end dates are required' });
    }

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    // Fetch active employees
    const empWhere: any = { status: 'ACTIVE' };
    if (req.user!.role !== 'SUPER_ADMIN') {
      empWhere.locationId = req.user!.locationId;
    }

    const employees = await prisma.employee.findMany({
      where: empWhere,
      include: {
        location: true,
      },
    });

    if (employees.length === 0) {
      return res.status(400).json({ error: 'No active employees found to generate payroll' });
    }

    // Create payroll run
    const payrollRun = await prisma.payrollRun.create({
      data: {
        periodStart: start,
        periodEnd: end,
        status: 'DRAFT',
        processedBy: req.user!.fullName || req.user!.email,
        processedAt: new Date(),
      },
    });

    // Create payroll item for each employee
    for (const emp of employees) {
      // Base salary (default ₹25,000 to ₹45,000 if not specified)
      const baseSalary = 30000;

      // Calculate attendance early incentive & penalties from attendance records in the period
      const attendances = await prisma.attendance.findMany({
        where: {
          employeeId: emp.id,
          attendanceDate: {
            gte: start,
            lte: end,
          },
        },
      });

      const totalEarlyIncentive = attendances.reduce(
        (sum, a) => sum + Number(a.earlyLoginIncentive || 0),
        0
      );
      const totalLatePenalty = attendances.reduce(
        (sum, a) => sum + Number(a.lateLoginPenalty || 0),
        0
      );
      const totalOvertime = attendances.reduce(
        (sum, a) => sum + Number(a.overtimeIncentive || 0),
        0
      );

      const attendanceIncentive = attendances.length >= 24 ? 1000 : 0;
      const salesIncentive = 0;
      const deductions = Math.round(baseSalary * 0.12); // PF standard deduction
      const penalties = totalLatePenalty;

      const gross = baseSalary + totalEarlyIncentive + attendanceIncentive + totalOvertime + salesIncentive;
      const netPay = Math.max(0, gross - deductions - penalties);

      await prisma.payrollItem.create({
        data: {
          payrollRunId: payrollRun.id,
          employeeId: emp.id,
          basicSalary: new Decimal(baseSalary),
          earlyIncentive: new Decimal(totalEarlyIncentive),
          attendanceIncentive: new Decimal(attendanceIncentive),
          performanceIncentive: new Decimal(0),
          salesIncentive: new Decimal(salesIncentive),
          overtime: new Decimal(totalOvertime),
          deductions: new Decimal(deductions),
          penalties: new Decimal(penalties),
          netPay: new Decimal(netPay),
          calculationDetails: {
            daysPresent: attendances.length,
            earlyLoginSeconds: attendances.reduce((s, a) => s + (a.earlyLoginSeconds || 0), 0),
            lateLoginSeconds: attendances.reduce((s, a) => s + (a.lateLoginSeconds || 0), 0),
            overtimeSeconds: attendances.reduce((s, a) => s + (a.overtimeSeconds || 0), 0),
            pfDeduction: deductions,
            generatedAt: new Date().toISOString(),
          },
          status: 'PENDING',
        },
      });
    }

    // Log audit
    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'CREATE',
        entityType: 'PayrollRun',
        entityId: payrollRun.id,
        newValue: { periodStart, periodEnd, employeeCount: employees.length },
      },
    });

    res.status(201).json({
      message: 'Payroll generated successfully',
      payrollRunId: payrollRun.id,
      employeeCount: employees.length,
    });
  } catch (error) {
    console.error('Process payroll error:', error);
    res.status(500).json({ error: 'Failed to process payroll' });
  }
});

// Lock payroll run
router.post('/runs/:id/lock', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const run = await prisma.payrollRun.update({
      where: { id },
      data: { status: 'LOCKED' },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'UPDATE',
        entityType: 'PayrollRun',
        entityId: id,
        newValue: { status: 'LOCKED' },
      },
    });

    res.json({ message: 'Payroll run locked successfully', run });
  } catch (error) {
    console.error('Lock payroll error:', error);
    res.status(500).json({ error: 'Failed to lock payroll run' });
  }
});

// Approve payroll run
router.post('/runs/:id/approve', authorize('APPROVE'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    const run = await prisma.payrollRun.update({
      where: { id },
      data: { status: 'APPROVED' },
    });

    await prisma.payrollItem.updateMany({
      where: { payrollRunId: id },
      data: { status: 'APPROVED' },
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.id,
        locationId: req.user!.locationId,
        action: 'APPROVE',
        entityType: 'PayrollRun',
        entityId: id,
        newValue: { status: 'APPROVED' },
      },
    });

    res.json({ message: 'Payroll run approved successfully', run });
  } catch (error) {
    console.error('Approve payroll error:', error);
    res.status(500).json({ error: 'Failed to approve payroll run' });
  }
});

// Get individual payslip by item ID
router.get('/payslip/:itemId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { itemId } = req.params;

    const item = await prisma.payrollItem.findUnique({
      where: { id: itemId },
      include: {
        payrollRun: true,
        employee: {
          include: {
            location: true,
            department: true,
            floor: true,
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ error: 'Payslip not found' });
    }

    // Authorization check
    if (
      req.user!.role !== 'SUPER_ADMIN' &&
      req.user!.locationId &&
      item.employee.locationId !== req.user!.locationId
    ) {
      return res.status(403).json({ error: 'Access denied to payslip from different location' });
    }

    res.json(item);
  } catch (error) {
    console.error('Get payslip error:', error);
    res.status(500).json({ error: 'Failed to get payslip' });
  }
});

// Get employee payslip history
router.get('/employee/:employeeId', authorize('VIEW'), async (req: AuthRequest, res) => {
  try {
    const { employeeId } = req.params;

    const items = await prisma.payrollItem.findMany({
      where: { employeeId },
      include: {
        payrollRun: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(items);
  } catch (error) {
    console.error('Get employee payslips error:', error);
    res.status(500).json({ error: 'Failed to get employee payslips' });
  }
});

export default router;
