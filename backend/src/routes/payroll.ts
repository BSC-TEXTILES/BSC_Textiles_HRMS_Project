import { Router } from 'express';
import { z } from 'zod';
import { pool, prisma } from '../nativeDb.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { Decimal } from '../db.js';
import { generatePayslipPdf, PayslipPdfData } from '../services/payrollPdfService.js';
import { sendPayslipEmail } from '../services/payrollEmailService.js';

const router = Router();
router.use(authenticate);

// RBAC Helper
function isHrOrAdmin(role?: string): boolean {
  if (!role) return false;
  return ['SUPER_ADMIN', 'ADMIN', 'HR', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER'].includes(role);
}

// -------------------------------------------------------------
// 1. GET /api/payroll/runs (List payroll cycles)
// -------------------------------------------------------------
router.get('/runs', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges to view master payroll runs' });
    }

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

    const formattedRuns = runs.map((run: any) => {
      const visibleItems = req.user!.role === 'SUPER_ADMIN' || !req.user!.locationId
        ? run.items
        : run.items.filter((item: any) => item.employee?.locationId === req.user!.locationId);

      const totalPayout = visibleItems.reduce((acc: number, item: any) => acc + Number(item.netPay || 0), 0);
      const totalBasic = visibleItems.reduce((acc: number, item: any) => acc + Number(item.basicSalary || 0), 0);
      const totalIncentives = visibleItems.reduce(
        (acc: number, item: any) =>
          acc +
          Number(item.earlyIncentive || 0) +
          Number(item.salesIncentive || 0) +
          Number(item.attendanceIncentive || 0) +
          Number(item.overtime || 0),
        0
      );
      const totalDeductions = visibleItems.reduce(
        (acc: number, item: any) => acc + Number(item.deductions || 0) + Number(item.penalties || 0),
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
    res.status(500).json({ error: 'Failed to retrieve payroll runs' });
  }
});

// -------------------------------------------------------------
// 2. GET /api/payroll/runs/:id (Run details and employee items)
// -------------------------------------------------------------
router.get('/runs/:id', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

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
                email: true,
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

    let items = run.items || [];

    // Location restriction
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.locationId) {
      items = items.filter((item: any) => item.employee?.location?.id === req.user!.locationId);
    } else if (locationId && locationId !== 'all') {
      items = items.filter((item: any) => item.employee?.location?.id === locationId);
    }

    if (search) {
      const q = String(search).toLowerCase();
      items = items.filter(
        (item: any) =>
          item.employee?.fullName?.toLowerCase().includes(q) ||
          item.employee?.employeeCode?.toLowerCase().includes(q)
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
      totalNetPay: items.reduce((sum: number, item: any) => sum + Number(item.netPay || 0), 0),
    });
  } catch (error) {
    console.error('Get payroll run details error:', error);
    res.status(500).json({ error: 'Failed to retrieve payroll run details' });
  }
});

// -------------------------------------------------------------
// 3. POST /api/payroll/runs (Generate master payroll)
// -------------------------------------------------------------
router.post('/runs', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Only HR or Admin can process payroll cycles' });
    }

    const { periodStart, periodEnd } = req.body;
    if (!periodStart || !periodEnd) {
      return res.status(400).json({ error: 'Period start and end dates are required' });
    }

    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    // Fetch active employees
    const empWhere: any = { status: 'ACTIVE' };
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.locationId) {
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
        processedBy: req.user!.fullName || 'HR Manager',
        processedAt: new Date(),
      },
    });

    // Generate items for each employee
    for (const emp of employees) {
      const attendances = await prisma.attendance.findMany({
        where: {
          employeeId: emp.id,
          date: {
            gte: start,
            lte: end,
          },
          status: 'PRESENT',
        },
      });

      const baseSalary = 30000;
      const totalEarlyIncentive = attendances.reduce(
        (sum: number, a: any) => sum + Number(a.earlyLoginIncentive || 0),
        0
      );
      const totalLatePenalty = attendances.reduce(
        (sum: number, a: any) => sum + Number(a.lateLoginPenalty || 0),
        0
      );
      const totalOvertime = attendances.reduce(
        (sum: number, a: any) => sum + Number(a.overtimeIncentive || 0),
        0
      );

      const attendanceIncentive = attendances.length >= 24 ? 1000 : 0;
      const hra = Math.round(baseSalary * 0.4);
      const allowances = 2500;
      const pfDeduction = Math.round(baseSalary * 0.12);
      const taxDeduction = 0;
      const penalties = totalLatePenalty;

      const gross = baseSalary + hra + allowances + totalEarlyIncentive + attendanceIncentive + totalOvertime;
      const totalDeductions = pfDeduction + taxDeduction + penalties;
      const netPay = Math.max(0, gross - totalDeductions);

      const calcDetails = {
        daysPresent: attendances.length,
        earlyLoginSeconds: attendances.reduce((s: number, a: any) => s + (a.earlyLoginSeconds || 0), 0),
        lateLoginSeconds: attendances.reduce((s: number, a: any) => s + (a.lateLoginSeconds || 0), 0),
        overtimeSeconds: attendances.reduce((s: number, a: any) => s + (a.overtimeSeconds || 0), 0),
        pfDeduction,
        generatedAt: new Date().toISOString(),
      };

      await pool.query(`
        INSERT INTO payrollitem (
          id, payrollRunId, employeeId, basicSalary, hra, allowances, earlyIncentive,
          attendanceIncentive, performanceIncentive, salesIncentive, overtime,
          bonus, deductions, pfDeduction, taxDeduction, lopDeduction, penalties,
          netPay, calculationDetails, status, emailStatus, createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, 0, ?, ?, ?, 0, ?, ?, ?, 'PENDING', 'NOT_SENT', NOW(), NOW()
        )
      `, [
        `pi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        payrollRun.id,
        emp.id,
        baseSalary,
        hra,
        allowances,
        totalEarlyIncentive,
        attendanceIncentive,
        totalOvertime,
        totalDeductions,
        pfDeduction,
        taxDeduction,
        penalties,
        netPay,
        JSON.stringify(calcDetails),
      ]);
    }

    res.status(201).json({
      message: 'Master payroll generated successfully',
      payrollRunId: payrollRun.id,
      employeeCount: employees.length,
    });
  } catch (error) {
    console.error('Process payroll error:', error);
    res.status(500).json({ error: 'Failed to process master payroll' });
  }
});

// -------------------------------------------------------------
// 4. GET /api/payroll/payslips (Full Payslip ledger with RBAC)
// -------------------------------------------------------------
router.get('/payslips', async (req: AuthRequest, res) => {
  try {
    const { month, year, search, status, locationId, employeeId, page = 1, limit = 50 } = req.query;

    const conditions: string[] = [];
    const params: any[] = [];

    // RBAC: Non-HR employees can ONLY view their own payslips
    if (!isHrOrAdmin(req.user?.role)) {
      if (!req.user?.employeeId) {
        return res.status(403).json({ error: 'No associated employee profile found' });
      }
      conditions.push('pi.employeeId = ?');
      params.push(req.user.employeeId);
    } else {
      // HR/Admin location scoping
      if (req.user?.role !== 'SUPER_ADMIN' && req.user?.locationId) {
        conditions.push('e.locationId = ?');
        params.push(req.user.locationId);
      } else if (locationId && locationId !== 'all') {
        conditions.push('e.locationId = ?');
        params.push(locationId);
      }

      if (employeeId) {
        conditions.push('pi.employeeId = ?');
        params.push(employeeId);
      }
    }

    if (status && status !== 'all') {
      conditions.push('pi.status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(e.fullName LIKE ? OR e.employeeCode LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term);
    }

    if (month && year) {
      conditions.push('MONTH(pr.periodEnd) = ? AND YEAR(pr.periodEnd) = ?');
      params.push(Number(month), Number(year));
    } else if (year) {
      conditions.push('YEAR(pr.periodEnd) = ?');
      params.push(Number(year));
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [rows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd, pr.status AS runStatus,
        e.employeeCode, e.fullName AS employeeName, e.designation, e.email AS employeeEmail,
        l.name AS locationName, l.code AS locationCode,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      ${whereClause}
      ORDER BY pr.periodEnd DESC, e.fullName ASC
      LIMIT ? OFFSET ?
    `, [...params, Number(limit), offset]);

    const [countRows]: any = await pool.query(`
      SELECT COUNT(pi.id) AS total
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      ${whereClause}
    `, params);

    res.json({
      payslips: rows,
      total: Number(countRows[0]?.total || 0),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (error) {
    console.error('Get payslips error:', error);
    res.status(500).json({ error: 'Failed to retrieve payslips' });
  }
});

// -------------------------------------------------------------
// 5. GET /api/payroll/payslip/:itemId (Single Payslip Details)
// -------------------------------------------------------------
router.get('/payslip/:itemId', async (req: AuthRequest, res) => {
  try {
    const { itemId } = req.params;

    const [rows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd, pr.status AS runStatus,
        e.employeeCode, e.fullName, e.designation, e.email, e.phone,
        NULL AS pan, NULL AS uan, NULL AS bankAccount, NULL AS bankName, NULL AS bankIfsc,
        l.id AS locationId, l.name AS locationName, l.code AS locationCode,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      WHERE pi.id = ?
    `, [itemId]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Payslip record not found' });
    }

    const payslip = rows[0];

    // RBAC IDOR check: Employees can only view their own payslip
    if (!isHrOrAdmin(req.user?.role)) {
      if (req.user?.employeeId && payslip.employeeId !== req.user.employeeId) {
        return res.status(403).json({ error: 'Access denied: You can only view your personal payslips' });
      }
    } else if (req.user?.role !== 'SUPER_ADMIN' && req.user?.locationId) {
      if (payslip.locationId && payslip.locationId !== req.user.locationId) {
        return res.status(403).json({ error: 'Access denied: Payslip belongs to another store hub' });
      }
    }

    // Parse JSON calculationDetails & customSections if string
    if (typeof payslip.calculationDetails === 'string') {
      try { payslip.calculationDetails = JSON.parse(payslip.calculationDetails); } catch {}
    }
    if (typeof payslip.customSections === 'string') {
      try { payslip.customSections = JSON.parse(payslip.customSections); } catch {}
    }

    res.json(payslip);
  } catch (error) {
    console.error('Get payslip details error:', error);
    res.status(500).json({ error: 'Failed to retrieve payslip details' });
  }
});

// -------------------------------------------------------------
// 6. PUT /api/payroll/payslip/:itemId (HR Edit Payslip & Add Sections)
// -------------------------------------------------------------
const editPayslipSchema = z.object({
  basicSalary: z.number().min(0).optional(),
  hra: z.number().min(0).optional(),
  allowances: z.number().min(0).optional(),
  bonus: z.number().min(0).optional(),
  earlyIncentive: z.number().min(0).optional(),
  attendanceIncentive: z.number().min(0).optional(),
  salesIncentive: z.number().min(0).optional(),
  overtime: z.number().min(0).optional(),
  pfDeduction: z.number().min(0).optional(),
  taxDeduction: z.number().min(0).optional(),
  lopDeduction: z.number().min(0).optional(),
  penalties: z.number().min(0).optional(),
  customSections: z.array(z.any()).optional(),
  remarks: z.string().optional(),
});

router.put('/payslip/:itemId', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Only HR or Admin can adjust payslips' });
    }

    const { itemId } = req.params;
    const body = editPayslipSchema.parse(req.body);

    const [existingRows]: any = await pool.query(`SELECT * FROM payrollitem WHERE id = ?`, [itemId]);
    if (!existingRows.length) return res.status(404).json({ error: 'Payslip not found' });
    const existing = existingRows[0];

    const basicSalary = body.basicSalary ?? Number(existing.basicSalary);
    const hra = body.hra ?? Number(existing.hra || basicSalary * 0.4);
    const allowances = body.allowances ?? Number(existing.allowances || 0);
    const bonus = body.bonus ?? Number(existing.bonus || 0);
    const earlyIncentive = body.earlyIncentive ?? Number(existing.earlyIncentive || 0);
    const attendanceIncentive = body.attendanceIncentive ?? Number(existing.attendanceIncentive || 0);
    const salesIncentive = body.salesIncentive ?? Number(existing.salesIncentive || 0);
    const overtime = body.overtime ?? Number(existing.overtime || 0);

    const pfDeduction = body.pfDeduction ?? Number(existing.pfDeduction || basicSalary * 0.12);
    const taxDeduction = body.taxDeduction ?? Number(existing.taxDeduction || 0);
    const lopDeduction = body.lopDeduction ?? Number(existing.lopDeduction || 0);
    const penalties = body.penalties ?? Number(existing.penalties || 0);

    // Calculate Custom Sections sum
    let customEarnings = 0;
    let customDeductions = 0;
    const customSections = body.customSections ?? (existing.customSections ? (typeof existing.customSections === 'string' ? JSON.parse(existing.customSections) : existing.customSections) : []);

    if (Array.isArray(customSections)) {
      customSections.forEach((sec: any) => {
        if (Array.isArray(sec.items)) {
          sec.items.forEach((it: any) => {
            const amt = Number(it.amount || 0);
            if (it.type === 'earning') customEarnings += amt;
            if (it.type === 'deduction') customDeductions += amt;
          });
        }
      });
    }

    const totalGross = basicSalary + hra + allowances + bonus + earlyIncentive + attendanceIncentive + salesIncentive + overtime + customEarnings;
    const totalDeductions = pfDeduction + taxDeduction + lopDeduction + penalties + customDeductions;
    const netPay = Math.max(0, totalGross - totalDeductions);

    await pool.query(`
      UPDATE payrollitem SET
        basicSalary = ?, hra = ?, allowances = ?, bonus = ?,
        earlyIncentive = ?, attendanceIncentive = ?, salesIncentive = ?, overtime = ?,
        pfDeduction = ?, taxDeduction = ?, lopDeduction = ?, penalties = ?,
        deductions = ?, netPay = ?,
        customSections = ?, remarks = ?, updatedAt = NOW()
      WHERE id = ?
    `, [
      basicSalary, hra, allowances, bonus,
      earlyIncentive, attendanceIncentive, salesIncentive, overtime,
      pfDeduction, taxDeduction, lopDeduction, penalties,
      totalDeductions, netPay,
      JSON.stringify(customSections), body.remarks ?? existing.remarks,
      itemId,
    ]);

    res.json({
      success: true,
      message: 'Payslip updated successfully with custom adjustments',
      netPay,
      totalGross,
      totalDeductions,
      payslip: {
        id: itemId,
        basicSalary,
        hra,
        allowances,
        bonus,
        netPay,
      },
    });
  } catch (error: any) {
    console.error('Update payslip error:', error);
    res.status(400).json({ error: error.message || 'Failed to update payslip' });
  }
});

// -------------------------------------------------------------
// 7. POST /api/payroll/payslip/:itemId/finalize (Lock & Auto-Email)
// -------------------------------------------------------------
router.post('/payslip/:itemId/finalize', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Only HR or Admin can finalize payslips' });
    }

    const { itemId } = req.params;

    const [rows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd,
        e.employeeCode, e.fullName, e.designation, e.email,
        NULL AS pan, NULL AS uan, NULL AS bankAccount,
        l.name AS locationName,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      WHERE pi.id = ?
    `, [itemId]);

    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });
    const p = rows[0];

    // Mark Finalized
    await pool.query(`
      UPDATE payrollitem 
      SET status = 'APPROVED', finalizedBy = ?, finalizedAt = NOW()
      WHERE id = ?
    `, [req.user?.fullName || 'HR Manager', itemId]);

    // Format for PDF & Auto-Email
    const pdfData: PayslipPdfData = {
      id: p.id,
      employeeCode: p.employeeCode,
      fullName: p.fullName,
      designation: p.designation,
      departmentName: p.departmentName,
      locationName: p.locationName,
      pan: p.pan,
      uan: p.uan,
      bankAccount: p.bankAccount,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      basicSalary: Number(p.basicSalary),
      hra: Number(p.hra || p.basicSalary * 0.4),
      allowances: Number(p.allowances || 2500),
      earlyIncentive: Number(p.earlyIncentive || 0),
      attendanceIncentive: Number(p.attendanceIncentive || 0),
      salesIncentive: Number(p.salesIncentive || 0),
      overtime: Number(p.overtime || 0),
      bonus: Number(p.bonus || 0),
      deductions: Number(p.deductions),
      pfDeduction: Number(p.pfDeduction || p.basicSalary * 0.12),
      taxDeduction: Number(p.taxDeduction || 0),
      lopDeduction: Number(p.lopDeduction || 0),
      penalties: Number(p.penalties || 0),
      netPay: Number(p.netPay),
      status: 'APPROVED',
      customSections: typeof p.customSections === 'string' ? JSON.parse(p.customSections) : p.customSections,
      remarks: p.remarks,
    };

    // Auto-send email with PDF attached
    const recipient = p.email || `${p.employeeCode.toLowerCase()}@bsctextiles.in`;
    const emailResult = await sendPayslipEmail(pdfData, recipient, req.user?.fullName || 'HR Administrator');

    res.json({
      success: true,
      message: 'Payslip finalized and signed. Email with certified PDF payslip dispatched!',
      status: 'APPROVED',
      emailResult,
      payslip: {
        id: p.id,
        status: 'APPROVED',
        emailStatus: emailResult.success ? 'SENT' : 'FAILED',
      },
    });
  } catch (error) {
    console.error('Finalize payslip error:', error);
    res.status(500).json({ error: 'Failed to finalize payslip' });
  }
});

// -------------------------------------------------------------
// 8. POST /api/payroll/payslip/:itemId/email (Manual Resend Email)
// -------------------------------------------------------------
router.post('/payslip/:itemId/email', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions to dispatch emails' });
    }

    const { itemId } = req.params;

    const [rows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd,
        e.employeeCode, e.fullName, e.designation, e.email,
        NULL AS pan, NULL AS uan, NULL AS bankAccount,
        l.name AS locationName,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      WHERE pi.id = ?
    `, [itemId]);

    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });
    const p = rows[0];

    const pdfData: PayslipPdfData = {
      id: p.id,
      employeeCode: p.employeeCode,
      fullName: p.fullName,
      designation: p.designation,
      departmentName: p.departmentName,
      locationName: p.locationName,
      pan: p.pan,
      uan: p.uan,
      bankAccount: p.bankAccount,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      basicSalary: Number(p.basicSalary),
      hra: Number(p.hra || p.basicSalary * 0.4),
      allowances: Number(p.allowances || 2500),
      earlyIncentive: Number(p.earlyIncentive || 0),
      attendanceIncentive: Number(p.attendanceIncentive || 0),
      salesIncentive: Number(p.salesIncentive || 0),
      overtime: Number(p.overtime || 0),
      bonus: Number(p.bonus || 0),
      deductions: Number(p.deductions),
      pfDeduction: Number(p.pfDeduction || p.basicSalary * 0.12),
      taxDeduction: Number(p.taxDeduction || 0),
      lopDeduction: Number(p.lopDeduction || 0),
      penalties: Number(p.penalties || 0),
      netPay: Number(p.netPay),
      status: p.status,
      customSections: typeof p.customSections === 'string' ? JSON.parse(p.customSections) : p.customSections,
      remarks: p.remarks,
    };

    const recipient = p.email || `${p.employeeCode.toLowerCase()}@bsctextiles.in`;
    const emailResult = await sendPayslipEmail(pdfData, recipient, req.user?.fullName || 'HR Manager');

    res.json({
      success: true,
      message: `Payslip email sent to ${recipient}!`,
      emailStatus: emailResult.success ? 'SENT' : 'FAILED',
      emailResult,
    });
  } catch (error) {
    console.error('Manual resend email error:', error);
    res.status(500).json({ error: 'Failed to send payslip email' });
  }
});

// -------------------------------------------------------------
// 9. GET /api/payroll/payslip/:itemId/pdf (Stream PDF Download)
// -------------------------------------------------------------
router.get('/payslip/:itemId/pdf', async (req: AuthRequest, res) => {
  try {
    const { itemId } = req.params;

    const [rows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd,
        e.employeeCode, e.fullName, e.designation, e.email,
        NULL AS pan, NULL AS uan, NULL AS bankAccount,
        l.name AS locationName,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      WHERE pi.id = ?
    `, [itemId]);

    if (!rows.length) return res.status(404).json({ error: 'Payslip not found' });
    const p = rows[0];

    // RBAC IDOR check: Employees can only download their own payslip
    if (!isHrOrAdmin(req.user?.role)) {
      if (req.user?.employeeId && p.employeeId !== req.user.employeeId) {
        return res.status(403).json({ error: 'Access denied: You can only download your own payslip' });
      }
    }

    const [settingsRows]: any = await pool.query(`SELECT * FROM payroll_settings LIMIT 1`);
    const settings = settingsRows[0] || {};

    const pdfData: PayslipPdfData = {
      id: p.id,
      employeeCode: p.employeeCode,
      fullName: p.fullName,
      designation: p.designation,
      departmentName: p.departmentName,
      locationName: p.locationName,
      pan: p.pan,
      uan: p.uan,
      bankAccount: p.bankAccount,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      basicSalary: Number(p.basicSalary),
      hra: Number(p.hra || p.basicSalary * 0.4),
      allowances: Number(p.allowances || 2500),
      earlyIncentive: Number(p.earlyIncentive || 0),
      attendanceIncentive: Number(p.attendanceIncentive || 0),
      salesIncentive: Number(p.salesIncentive || 0),
      overtime: Number(p.overtime || 0),
      bonus: Number(p.bonus || 0),
      deductions: Number(p.deductions),
      pfDeduction: Number(p.pfDeduction || p.basicSalary * 0.12),
      taxDeduction: Number(p.taxDeduction || 0),
      lopDeduction: Number(p.lopDeduction || 0),
      penalties: Number(p.penalties || 0),
      netPay: Number(p.netPay),
      status: p.status,
      customSections: typeof p.customSections === 'string' ? JSON.parse(p.customSections) : p.customSections,
      remarks: p.remarks,
    };

    const pdfBuffer = await generatePayslipPdf(pdfData, {
      companyName: settings.companyName,
      companyAddress: settings.companyAddress,
      signatoryName: settings.signatoryName,
      signatoryDesignation: settings.signatoryDesignation,
    });

    const fileName = `Payslip_${p.employeeCode}_${new Date(p.periodEnd).toISOString().slice(0, 7)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Generate PDF error:', error);
    res.status(500).json({ error: 'Failed to generate payslip PDF' });
  }
});

// -------------------------------------------------------------
// 10. GET /api/payroll/reports/summary (Executive wage breakdown)
// -------------------------------------------------------------
router.get('/reports/summary', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    const [summaryRows]: any = await pool.query(`
      SELECT 
        COUNT(pi.id) AS totalPayslips,
        COALESCE(SUM(pi.basicSalary), 0) AS totalBasic,
        COALESCE(SUM(pi.hra), 0) AS totalHra,
        COALESCE(SUM(pi.allowances), 0) AS totalAllowances,
        COALESCE(SUM(pi.earlyIncentive + pi.attendanceIncentive + pi.salesIncentive + pi.overtime + pi.bonus), 0) AS totalIncentives,
        COALESCE(SUM(pi.pfDeduction), 0) AS totalPf,
        COALESCE(SUM(pi.taxDeduction), 0) AS totalTax,
        COALESCE(SUM(pi.penalties + pi.lopDeduction), 0) AS totalPenalties,
        COALESCE(SUM(pi.deductions), 0) AS totalDeductions,
        COALESCE(SUM(pi.netPay), 0) AS totalNetPayout
      FROM payrollitem pi
    `);

    // Location breakdown
    const [byLocation]: any = await pool.query(`
      SELECT 
        l.code, l.name,
        COUNT(pi.id) AS employeeCount,
        COALESCE(SUM(pi.netPay), 0) AS netPayout,
        COALESCE(SUM(pi.deductions), 0) AS deductions
      FROM payrollitem pi
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      GROUP BY l.id, l.code, l.name
    `);

    // Status breakdown
    const [byStatus]: any = await pool.query(`
      SELECT status, COUNT(id) AS count, COALESCE(SUM(netPay), 0) AS netTotal
      FROM payrollitem
      GROUP BY status
    `);

    const sum = summaryRows[0] || {};
    const totalDisbursed = Number(sum.totalNetPayout || 0);
    const totalBasic = Number(sum.totalBasic || 0);
    const totalPfDeductions = Number(sum.totalPf || 0);
    const totalTaxDeductions = Number(sum.totalTax || 0);

    const locationBreakdown = byLocation.map((l: any) => ({
      locationId: l.code,
      locationName: l.name,
      employeeCount: Number(l.employeeCount || 0),
      totalNetPay: Number(l.netPayout || 0),
    }));

    res.json({
      totalDisbursed,
      totalBasic,
      totalPfDeductions,
      totalTaxDeductions,
      locationBreakdown,
      summary: sum,
      byLocation,
      byStatus,
    });
  } catch (error) {
    console.error('Payroll summary report error:', error);
    res.status(500).json({ error: 'Failed to retrieve payroll summary report' });
  }
});

// -------------------------------------------------------------
// 11. Salary Structures API (/api/payroll/salary-structures)
// -------------------------------------------------------------
router.get('/salary-structures', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    const [rows]: any = await pool.query(`SELECT * FROM salary_structure ORDER BY baseSalary ASC`);
    res.json({ structures: rows });
  } catch (error) {
    console.error('Get salary structures error:', error);
    res.status(500).json({ error: 'Failed to retrieve salary structures' });
  }
});

router.post('/salary-structures', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    const { title, cadreGrade, baseSalary, hraPercent, conveyance, medicalAllowance, specialAllowance } = req.body;
    if (!title || !baseSalary) {
      return res.status(400).json({ error: 'Title and Base Salary are required' });
    }
    const id = `struct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(`
      INSERT INTO salary_structure (id, title, cadreGrade, baseSalary, hraPercent, conveyance, medicalAllowance, specialAllowance)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, title, cadreGrade || 'CADRE-A', baseSalary, hraPercent || 40, conveyance || 1600, medicalAllowance || 1250, specialAllowance || 2000]);

    res.status(201).json({ message: 'Salary structure template created successfully', id });
  } catch (error) {
    console.error('Create salary structure error:', error);
    res.status(500).json({ error: 'Failed to create salary structure' });
  }
});

// -------------------------------------------------------------
// 12. Payroll Settings API (/api/payroll/settings)
// -------------------------------------------------------------
router.get('/settings', async (req: AuthRequest, res) => {
  try {
    const [rows]: any = await pool.query(`SELECT * FROM payroll_settings LIMIT 1`);
    res.json(rows[0] || {});
  } catch (error) {
    console.error('Get payroll settings error:', error);
    res.status(500).json({ error: 'Failed to retrieve settings' });
  }
});

router.put('/settings', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Only HR or Admin can configure payroll settings' });
    }
    const { companyName, companyAddress, logoUrl, signatoryName, signatoryDesignation, smtpHost, smtpPort, smtpUser, smtpFrom } = req.body;
    await pool.query(`
      UPDATE payroll_settings SET
        companyName = COALESCE(?, companyName),
        companyAddress = COALESCE(?, companyAddress),
        logoUrl = COALESCE(?, logoUrl),
        signatoryName = COALESCE(?, signatoryName),
        signatoryDesignation = COALESCE(?, signatoryDesignation),
        smtpHost = COALESCE(?, smtpHost),
        smtpPort = COALESCE(?, smtpPort),
        smtpUser = COALESCE(?, smtpUser),
        smtpFrom = COALESCE(?, smtpFrom),
        updatedAt = NOW()
    `, [companyName, companyAddress, logoUrl, signatoryName, signatoryDesignation, smtpHost, smtpPort, smtpUser, smtpFrom]);

    res.json({ message: 'Payroll & company template settings updated successfully' });
  } catch (error) {
    console.error('Update payroll settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// -------------------------------------------------------------
// 13. Email Audit Logs (/api/payroll/emails/log)
// -------------------------------------------------------------
router.get('/emails/log', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    const [rows]: any = await pool.query(`
      SELECT el.*, e.fullName AS employeeName, e.employeeCode
      FROM payroll_email_log el
      JOIN employee e ON el.employeeId = e.id
      ORDER BY el.sentAt DESC
      LIMIT 100
    `);
    res.json({ logs: rows });
  } catch (error) {
    console.error('Get email log error:', error);
    res.status(500).json({ error: 'Failed to retrieve email logs' });
  }
});

export default router;
