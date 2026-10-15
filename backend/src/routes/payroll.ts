import { Router } from 'express';
import { z } from 'zod';
import { pool, prisma } from '../nativeDb.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { Decimal } from '../db.js';
import { generatePayslipPdf, PayslipPdfData } from '../services/payrollPdfService.js';
import { safeJsonParse } from '../utils/safeJson.js';
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
          attendanceDate: {
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
// 3.1 GET /api/payroll/employees (HR Employee list with statutory data)
// -------------------------------------------------------------
router.get('/employees', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    const { search } = req.query;
    const conditions = ["e.status != 'TERMINATED'"];
    const params: any[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      const q = `%${search.trim()}%`;
      conditions.push('(e.fullName LIKE ? OR e.employeeCode LIKE ? OR l.name LIKE ? OR l.code LIKE ?)');
      params.push(q, q, q, q);
    }

    const [rows]: any = await pool.query(`
      SELECT 
        e.id, e.employeeCode, e.fullName, e.designation, e.email, e.phone, e.gender,
        COALESCE(e.pfNo, '') AS pfNo,
        COALESCE(e.esiNo, '') AS esiNo,
        COALESCE(e.uanNo, '') AS uanNo,
        COALESCE(e.bankName, '') AS bankName,
        COALESCE(e.bankAccount, '') AS bankAccount,
        COALESCE(e.salesmanNo, e.employeeCode) AS salesmanNo,
        COALESCE(e.batch, 'SHIFT II') AS batch,
        COALESCE(e.pfPay, e.basicSalary, 12000.00) AS pfPay,
        COALESCE(e.fixedGrossSalary, 16000.00) AS fixedGrossSalary,
        COALESCE(e.perDaySalary, 516.13) AS perDaySalary,
        COALESCE(e.daysPayable, 31.00) AS daysPayable,
        COALESCE(e.basicSalary, 12000.00) AS basicSalary,
        COALESCE(e.hra, 4000.00) AS hra,
        l.id AS locationId, l.name AS locationName, l.code AS locationCode,
        d.id AS departmentId, d.name AS departmentName,
        sec.id AS sectionId, sec.name AS sectionName,
        sh.id AS shiftId, sh.name AS shiftName
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN section sec ON e.sectionId = sec.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY e.fullName ASC
    `, params);

    res.json({ employees: rows });
  } catch (error: any) {
    console.error('Get payroll employees error:', error);
    res.status(500).json({ error: 'Failed to retrieve employee roster' });
  }
});

// -------------------------------------------------------------
// 3.2 GET /api/payroll/load-or-calculate (Load existing payslip or calculate draft)
// -------------------------------------------------------------
router.get('/load-or-calculate', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    const { employeeId, employeeCode, month, year } = req.query;
    const lookupParam = (employeeId || employeeCode) as string;
    if (!lookupParam) {
      return res.status(400).json({ error: 'Employee ID or Employee Code is required' });
    }

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let targetMonthStr = String(month || 'Aug');
    let targetMonthNum = 8;
    if (!isNaN(Number(targetMonthStr))) {
      targetMonthNum = Number(targetMonthStr);
      targetMonthStr = monthNames[targetMonthNum - 1] || 'Aug';
    } else {
      const idx = monthNames.findIndex(m => m.toLowerCase() === targetMonthStr.toLowerCase());
      if (idx !== -1) targetMonthNum = idx + 1;
    }
    const targetYearNum = Number(year || 2026);

    // Days in target month
    const daysInMonth = new Date(targetYearNum, targetMonthNum, 0).getDate();

    // Fetch employee particulars
    const [empRows]: any = await pool.query(`
      SELECT 
        e.*,
        l.name AS locationName, l.code AS locationCode,
        d.name AS departmentName,
        sec.name AS sectionName,
        sh.name AS shiftName
      FROM employee e
      LEFT JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN section sec ON e.sectionId = sec.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
      WHERE e.id = ? OR e.employeeCode = ?
      LIMIT 1
    `, [lookupParam, lookupParam]);

    if (!empRows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRows[0];
    const resolvedEmpId = emp.id;

    // Check if a payslip already exists for this employee for that month & year
    const [itemRows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd, pr.status AS runStatus
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      WHERE pi.employeeId = ? AND (
        (pi.salaryMonth = ? AND pi.salaryYear = ?) OR
        (MONTH(pr.periodEnd) = ? AND YEAR(pr.periodEnd) = ?)
      )
      LIMIT 1
    `, [resolvedEmpId, targetMonthStr, targetYearNum, targetMonthNum, targetYearNum]);

    if (itemRows.length > 0) {
      const item = itemRows[0];
      const parsedEarnings = safeJsonParse(item.earningsConfig, null);
      const parsedDeductions = safeJsonParse(item.deductionsConfig, null);
      const parsedCalc = safeJsonParse(item.calculationDetails, {});

      const payslipObj = {
          id: item.id,
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          fullName: emp.fullName,
          designation: emp.designation,
          departmentName: emp.departmentName || 'Atelier',
          section: item.section || emp.sectionName || 'KIDS',
          shift: item.shiftName || emp.shiftName || 'SHIFT II',
          batch: item.batch || emp.batch || 'SHIFT II',
          locationName: emp.locationName,
          locationCode: item.locationCode || emp.locationCode || 'BSCTEX',
          pfNo: item.pfNo || emp.pfNo || '',
          esiNo: item.esiNo || emp.esiNo || '',
          uanNo: item.uanNo || emp.uanNo || '',
          bankName: item.bankName || emp.bankName || 'HDFC',
          bankAccount: item.bankAccount || emp.bankAccount || '',
          salesmanNo: item.salesmanNo || emp.salesmanNo || emp.employeeCode,
          salaryMonth: item.salaryMonth || targetMonthStr,
          salaryYear: item.salaryYear || targetYearNum,
          daysPayable: Number(item.daysPayable || daysInMonth),
          perDaySalary: Number(item.perDaySalary || (Number(item.fixedGrossSalary || 16000) / daysInMonth)),
          pfPay: Number(item.pfPay || item.basicSalary || 12000),
          fixedGrossSalary: Number(item.fixedGrossSalary || (Number(item.basicSalary || 0) + Number(item.hra || 0))),
          basicSalary: Number(item.basicSalary || 12000),
          hra: Number(item.hra || 4000),
          grossSalary: Number(item.grossSalary || item.totalEarnings || 20375.50),
          totalEarnings: Number(item.totalEarnings || item.grossSalary || 20375.50),
          totalDeductions: Number(item.totalDeductions || item.deductions || 1593.00),
          totalPayable: Number(item.totalPayable || item.netPay || 18782.50),
          netPayable: Number(item.netPay || item.totalPayable || 18782.50),
          salaryAdvance: Number(item.salaryAdvance || 0),
          loanAdvance: Number(item.loanAdvance || 0),
          employerPf: item.employerPf !== null && item.employerPf !== undefined ? Number(item.employerPf) : Math.round(Number(item.basicSalary || 12000) * 0.12),
          employerEsi: item.employerEsi !== null && item.employerEsi !== undefined ? Number(item.employerEsi) : (Number(item.grossSalary || 0) <= 21000 ? Math.round(Number(item.grossSalary || 0) * 0.0325) : 0),
          ctc: item.ctc !== null && item.ctc !== undefined ? Number(item.ctc) : Math.round(Number(item.grossSalary || 0) + Number(item.employerPf || 0) + Number(item.employerEsi || 0)),
          earningsConfig: parsedEarnings || [
            { id: 'basic', label: 'BASIC PAY', amount: Number(item.basicSalary || 12000), enabled: true },
            { id: 'hra', label: 'HRA', amount: Number(item.hra || 4000), enabled: true },
            { id: 'ot', label: 'OT', amount: Number(item.otPay || item.overtime || 0), enabled: true },
            { id: 'govt_holiday', label: 'GOVT.HOLIDAY', amount: Number(item.govtHolidayPay || 0), enabled: true },
          ],
          deductionsConfig: parsedDeductions || [
            { id: 'pf', label: 'EMPLOYEE PF', amount: Number(item.employeePf || item.pfDeduction || 1440), enabled: true },
            { id: 'esi', label: 'EMPLOYEE ESI', amount: Number(item.employeeEsi || 153), enabled: true },
            { id: 'pt', label: 'PROF TAX', amount: Number(item.profTax || 0), enabled: true },
            { id: 'sal_adv', label: 'SALARY ADVANCE', amount: Number(item.salaryAdvance || 0), enabled: true },
            { id: 'loan_adv', label: 'LOAN ADVANCE', amount: Number(item.loanAdvance || 0), enabled: true },
            { id: 'late_fine', label: 'LATE FINE DEDUCTION (₹1.0/SEC)', amount: Number(item.penalties || item.lateFineDeduction || 0), enabled: Number(item.penalties || item.lateFineDeduction || 0) > 0 },
          ],
          remarks: item.remarks || '',
          status: item.status || 'APPROVED',
          customSections: safeJsonParse(item.customSections, []),
          calculationDetails: parsedCalc,
      };
      return res.json({
        mode: 'EXISTING',
        payslip: payslipObj,
        data: payslipObj,
      });
    }

    // Default calculations for fresh payslip
    const defaultFixedGross = Number(emp.fixedGrossSalary || 16000);
    const defaultBasic = Number(emp.basicSalary || (defaultFixedGross * 0.75) || 12000);
    const defaultHra = Number(emp.hra || (defaultFixedGross - defaultBasic) || 4000);
    const defaultPfPay = Number(emp.pfPay || defaultBasic);
    const defaultDaysPayable = Number(emp.daysPayable || daysInMonth);
    const defaultPerDay = Math.round((defaultFixedGross / defaultDaysPayable) * 100) / 100;

    // Check attendance for overtime / bonuses
    const startDateStr = `${targetYearNum}-${String(targetMonthNum).padStart(2, '0')}-01`;
    const endDateStr = `${targetYearNum}-${String(targetMonthNum).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    const [attRows]: any = await pool.query(`
      SELECT 
        COALESCE(SUM(earlyLoginIncentive), 0) AS earlyTotal,
        COALESCE(SUM(lateLoginPenalty), 0) AS latePenaltyTotal,
        COALESCE(SUM(lateLoginSeconds), 0) AS lateSecondsTotal,
        COUNT(id) AS presentDays
      FROM attendance
      WHERE employeeId = ? AND attendanceDate >= ? AND attendanceDate <= ?
    `, [emp.id, startDateStr, endDateStr]);

    const attIncentive = Number(attRows[0]?.earlyTotal || 0);

    // Query Late Attendance Records (Permanent ₹1.0/min policy: 1m chargeable late beyond grace = ₹1.00 deduction)
    let lateFineAmount = 0;
    let lateChargeableSeconds = 0;
    try {
      const [lateRows]: any = await pool.query(`
        SELECT 
          COALESCE(SUM(chargeableLateSeconds), 0) AS totalChargeableSeconds,
          COALESCE(SUM(CASE WHEN approvalStatus = 'APPROVED' OR payrollStatus = 'APPLIED_TO_PAYROLL' THEN finalFine ELSE calculatedFine END), 0) AS totalFine
        FROM late_attendance_record
        WHERE employeeId = ? 
          AND recordDate >= ? AND recordDate <= ?
          AND approvalStatus != 'WAIVED'
      `, [emp.id, startDateStr, endDateStr]);

      if (lateRows && lateRows.length > 0 && (Number(lateRows[0].totalFine) > 0 || Number(lateRows[0].totalChargeableSeconds) > 0)) {
        lateChargeableSeconds = Number(lateRows[0].totalChargeableSeconds || 0);
        // Permanent ₹1.0/min statutory rate
        lateFineAmount = Number(lateRows[0].totalFine) > 0
          ? Math.round(Number(lateRows[0].totalFine))
          : Math.round((lateChargeableSeconds / 60.0) * 1.0);
      } else if (Number(attRows[0]?.lateSecondsTotal || 0) > 0) {
        lateChargeableSeconds = Number(attRows[0].lateSecondsTotal);
        lateFineAmount = Math.round((lateChargeableSeconds / 60.0) * 1.0);
      }
    } catch (e) {
      if (Number(attRows[0]?.lateSecondsTotal || 0) > 0) {
        lateChargeableSeconds = Number(attRows[0].lateSecondsTotal);
        lateFineAmount = Math.round((lateChargeableSeconds / 60.0) * 1.0);
      }
    }

    // Default statutory deductions
    const defaultEmpPf = Math.round(defaultPfPay * 0.12);
    const defaultEmpEsi = defaultFixedGross <= 21000 ? Math.round(defaultFixedGross * 0.0075) : 0;
    const defaultPt = defaultFixedGross >= 15000 ? 200 : 0;

    const initialEarnings = [
      { id: 'basic', label: 'BASIC PAY', amount: defaultBasic, enabled: true },
      { id: 'hra', label: 'HRA', amount: defaultHra, enabled: true },
      { id: 'ot', label: 'OT', amount: 0, enabled: true },
      { id: 'govt_holiday', label: 'GOVT.HOLIDAY', amount: 0, enabled: true },
      { id: 'attendance_inc', label: 'ATTENDANCE INCENTIVE', amount: attIncentive, enabled: attIncentive > 0 },
      { id: 'special_allow', label: 'SPECIAL ALLOWANCE', amount: 0, enabled: false },
      { id: 'bonus', label: 'BONUS', amount: 0, enabled: false },
      { id: 'other_earn', label: 'OTHER EARNINGS', amount: 0, enabled: false },
    ];

    const initialDeductions = [
      { id: 'pf', label: 'EMPLOYEE PF', amount: defaultEmpPf, enabled: true },
      { id: 'esi', label: 'EMPLOYEE ESI', amount: defaultEmpEsi, enabled: true },
      { id: 'pt', label: 'PROF TAX', amount: defaultPt, enabled: defaultPt > 0 },
      { id: 'sal_adv', label: 'SALARY ADVANCE', amount: 0, enabled: true },
      { id: 'loan_adv', label: 'LOAN ADVANCE', amount: 0, enabled: true },
      { 
        id: 'late_fine', 
        label: 'LATE FINE DEDUCTION (₹1.0/MIN)', 
        amount: lateFineAmount, 
        enabled: lateFineAmount > 0 
      },
      { id: 'lop_ded', label: 'LEAVE/ATTENDANCE DEDUCTION', amount: 0, enabled: false },
      { id: 'other_ded', label: 'OTHER DEDUCTIONS', amount: 0, enabled: false },
    ];

    const totalEarn = initialEarnings.filter(e => e.enabled).reduce((sum, e) => sum + e.amount, 0);
    const totalDed = initialDeductions.filter(d => d.enabled).reduce((sum, d) => sum + d.amount, 0);
    const totalPay = Math.max(0, totalEarn - totalDed);
    const empPfContrib = Math.round(defaultPfPay * 0.12);
    const empEsiContrib = totalEarn <= 21000 ? Math.round(totalEarn * 0.0325) : 0;
    const ctcEst = totalEarn + empPfContrib + empEsiContrib;

    const draftObj = {
      id: `draft_${emp.id}_${targetMonthStr}_${targetYearNum}`,
      employeeId: emp.id,
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      designation: emp.designation,
      departmentName: emp.departmentName || 'Atelier',
      section: emp.sectionName || 'KIDS',
      shift: emp.shiftName || 'SHIFT II',
      batch: emp.batch || 'SHIFT II',
      locationName: emp.locationName,
      locationCode: emp.locationCode || 'BSCTEX',
      pfNo: emp.pfNo || '',
      esiNo: emp.esiNo || '',
      uanNo: emp.uanNo || '',
      bankName: emp.bankName || 'HDFC',
      bankAccount: emp.bankAccount || '',
      salesmanNo: emp.salesmanNo || emp.employeeCode,
      salaryMonth: targetMonthStr,
      salaryYear: targetYearNum,
      daysPayable: defaultDaysPayable,
      perDaySalary: defaultPerDay,
      pfPay: defaultPfPay,
      fixedGrossSalary: defaultFixedGross,
      basicSalary: defaultBasic,
      hra: defaultHra,
      grossSalary: totalEarn,
      totalEarnings: totalEarn,
      totalDeductions: totalDed,
      totalPayable: totalPay,
      netPayable: totalPay,
      salaryAdvance: 0,
      loanAdvance: 0,
      employerPf: empPfContrib,
      employerEsi: empEsiContrib,
      ctc: ctcEst,
      earningsConfig: initialEarnings,
      deductionsConfig: initialDeductions,
      remarks: '',
      status: 'DRAFT',
      customSections: [],
    };

    res.json({
      mode: 'NEW_CALCULATED',
      payslip: draftObj,
      data: draftObj,
    });
  } catch (error: any) {
    console.error('Load or calculate payslip error:', error);
    res.status(500).json({ error: 'Failed to compute payslip details', details: error.message });
  }
});

// -------------------------------------------------------------
// 3.3 POST /api/payroll/save-payslip (HR Save / Update Payslip)
// -------------------------------------------------------------
router.post('/save-payslip', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }

    const {
      employeeId,
      salaryMonth,
      salaryYear,
      daysPayable,
      perDaySalary,
      pfPay,
      fixedGrossSalary,
      earningsConfig,
      deductionsConfig,
      remarks,
      status = 'APPROVED',
      salesmanNo,
      batch,
      section,
      shift,
      locationCode,
      pfNo,
      esiNo,
      uanNo,
      bankName,
      bankAccount,
      customSections = [],
    } = req.body;

    if (!employeeId || !salaryMonth || !salaryYear) {
      return res.status(400).json({ error: 'Employee ID, salary month, and year are required' });
    }

    // Verify employee
    const [empRows]: any = await pool.query('SELECT * FROM employee WHERE id = ? LIMIT 1', [employeeId]);
    if (!empRows.length) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    const emp = empRows[0];

    // Compute totals from configs
    let totalGross = 0;
    const basicItem = Array.isArray(earningsConfig) ? earningsConfig.find((e: any) => e.id === 'basic' || e.label?.includes('BASIC')) : null;
    const hraItem = Array.isArray(earningsConfig) ? earningsConfig.find((e: any) => e.id === 'hra' || e.label?.includes('HRA')) : null;
    const otItem = Array.isArray(earningsConfig) ? earningsConfig.find((e: any) => e.id === 'ot' || e.label?.includes('OT')) : null;
    const govtHolidayItem = Array.isArray(earningsConfig) ? earningsConfig.find((e: any) => e.id === 'govt_holiday' || e.label?.includes('HOLIDAY')) : null;

    if (Array.isArray(earningsConfig)) {
      earningsConfig.forEach((item: any) => {
        if (item.enabled !== false) {
          totalGross += Number(item.amount || 0);
        }
      });
    }

    let totalDeductions = 0;
    const pfItem = Array.isArray(deductionsConfig) ? deductionsConfig.find((d: any) => d.id === 'pf' || d.label?.includes('PF')) : null;
    const esiItem = Array.isArray(deductionsConfig) ? deductionsConfig.find((d: any) => d.id === 'esi' || d.label?.includes('ESI')) : null;
    const ptItem = Array.isArray(deductionsConfig) ? deductionsConfig.find((d: any) => d.id === 'pt' || d.label?.includes('PROF')) : null;
    const salAdvItem = Array.isArray(deductionsConfig) ? deductionsConfig.find((d: any) => d.id === 'sal_adv' || d.label?.includes('SALARY ADVANCE')) : null;
    const loanAdvItem = Array.isArray(deductionsConfig) ? deductionsConfig.find((d: any) => d.id === 'loan_adv' || d.label?.includes('LOAN ADVANCE')) : null;

    if (Array.isArray(deductionsConfig)) {
      deductionsConfig.forEach((item: any) => {
        if (item.enabled !== false) {
          totalDeductions += Number(item.amount || 0);
        }
      });
    }

    const netPayable = Math.max(0, totalGross - totalDeductions);
    const basicVal = Number(basicItem?.amount ?? emp.basicSalary ?? 12000);
    const hraVal = Number(hraItem?.amount ?? emp.hra ?? 4000);
    const otVal = Number(otItem?.amount ?? 0);
    const govtHolidayVal = Number(govtHolidayItem?.amount ?? 0);
    const pfDeductVal = Number(pfItem?.amount ?? Math.round(basicVal * 0.12));
    const esiDeductVal = Number(esiItem?.amount ?? Math.round(totalGross * 0.0075));
    const profTaxVal = Number(ptItem?.amount ?? 0);
    const salAdvVal = Number(salAdvItem?.amount ?? 0);
    const loanAdvVal = Number(loanAdvItem?.amount ?? 0);

    const employerPfVal = Math.round(Number(pfPay || basicVal) * 0.12);
    const employerEsiVal = totalGross <= 21000 ? Math.round(totalGross * 0.0325) : 0;
    const ctcVal = Math.round(totalGross + employerPfVal + employerEsiVal);

    // Find or create payrollrun for this month/year
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    let monthNum = 8;
    if (!isNaN(Number(salaryMonth))) {
      monthNum = Number(salaryMonth);
    } else {
      const idx = monthNames.findIndex(m => m.toLowerCase() === String(salaryMonth).toLowerCase());
      if (idx !== -1) monthNum = idx + 1;
    }
    const yearNum = Number(salaryYear);
    const lastDay = new Date(yearNum, monthNum, 0).getDate();
    const periodStart = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;
    const periodEnd = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const [runRows]: any = await pool.query(`
      SELECT id FROM payrollrun 
      WHERE (MONTH(periodEnd) = ? AND YEAR(periodEnd) = ?)
      LIMIT 1
    `, [monthNum, yearNum]);

    let runId: string;
    if (runRows.length > 0) {
      runId = runRows[0].id;
    } else {
      runId = `run_${salaryMonth}_${yearNum}_${Date.now()}`;
      await pool.query(`
        INSERT INTO payrollrun (id, periodStart, periodEnd, status, processedBy, processedAt, createdAt, updatedAt)
        VALUES (?, ?, ?, 'APPROVED', ?, NOW(), NOW(), NOW())
      `, [runId, periodStart, periodEnd, req.user?.fullName || 'HR Manager']);
    }

    // Check if payrollitem already exists
    const [existingItemRows]: any = await pool.query(`
      SELECT id FROM payrollitem
      WHERE employeeId = ? AND (
        (salaryMonth = ? AND salaryYear = ?) OR
        payrollRunId = ?
      )
      LIMIT 1
    `, [employeeId, salaryMonth, yearNum, runId]);

    const calcDetails = {
      pfNo: pfNo || emp.pfNo || '',
      esiNo: esiNo || emp.esiNo || '',
      uanNo: uanNo || emp.uanNo || '',
      bankName: bankName || emp.bankName || 'HDFC',
      bankAccount: bankAccount || emp.bankAccount || '',
      salesmanNo: salesmanNo || emp.salesmanNo || emp.employeeCode,
      section: section || emp.sectionName || 'KIDS',
      shift: shift || emp.shiftName || 'SHIFT II',
      batch: batch || emp.batch || 'SHIFT II',
      locationCode: locationCode || 'BSCTEX',
      pfPay: Number(pfPay || basicVal),
      hra: hraVal,
      grossSalary: Number(fixedGrossSalary || (basicVal + hraVal)),
      perDaySalary: Number(perDaySalary || (Number(fixedGrossSalary || 16000) / (Number(daysPayable) || 31))),
      daysPayable: Number(daysPayable || 31),
      earningsTotal: totalGross,
      deductionsTotal: totalDeductions,
      totalPayable: netPayable,
      netPayable: netPayable,
      employerPf: employerPfVal,
      employerEsi: employerEsiVal,
      ctc: ctcVal,
      earningsConfig,
      deductionsConfig,
      remarks,
    };

    let itemId: string;

    if (existingItemRows.length > 0) {
      itemId = existingItemRows[0].id;
      await pool.query(`
        UPDATE payrollitem SET
          basicSalary = ?,
          hra = ?,
          overtime = ?,
          deductions = ?,
          netPay = ?,
          pfNo = ?,
          esiNo = ?,
          uanNo = ?,
          bankName = ?,
          bankAccount = ?,
          salesmanNo = ?,
          section = ?,
          shiftName = ?,
          batch = ?,
          locationCode = ?,
          pfPay = ?,
          fixedGrossSalary = ?,
          perDaySalary = ?,
          daysPayable = ?,
          govtHolidayPay = ?,
          otPay = ?,
          employeePf = ?,
          employeeEsi = ?,
          profTax = ?,
          salaryAdvance = ?,
          loanAdvance = ?,
          employerPf = ?,
          employerEsi = ?,
          ctc = ?,
          grossSalary = ?,
          totalEarnings = ?,
          totalDeductions = ?,
          totalPayable = ?,
          salaryMonth = ?,
          salaryYear = ?,
          earningsConfig = ?,
          deductionsConfig = ?,
          calculationDetails = ?,
          customSections = ?,
          remarks = ?,
          status = ?,
          updatedAt = NOW()
        WHERE id = ?
      `, [
        basicVal, hraVal, otVal, totalDeductions, netPayable,
        pfNo || emp.pfNo, esiNo || emp.esiNo, uanNo || emp.uanNo, bankName || emp.bankName, bankAccount || emp.bankAccount,
        salesmanNo || emp.salesmanNo || emp.employeeCode, section || 'KIDS', shift || 'SHIFT II', batch || 'SHIFT II', locationCode || 'BSCTEX',
        Number(pfPay || basicVal), Number(fixedGrossSalary || 16000), Number(perDaySalary || 516.13), Number(daysPayable || 31),
        govtHolidayVal, otVal, pfDeductVal, esiDeductVal, profTaxVal, salAdvVal, loanAdvVal,
        employerPfVal, employerEsiVal, ctcVal, totalGross, totalGross, totalDeductions, netPayable,
        salaryMonth, yearNum, JSON.stringify(earningsConfig), JSON.stringify(deductionsConfig),
        JSON.stringify(calcDetails), JSON.stringify(customSections), remarks || '', status, itemId
      ]);
    } else {
      itemId = `pi_${emp.employeeCode}_${salaryMonth}_${yearNum}_${Date.now()}`;
      await pool.query(`
        INSERT INTO payrollitem (
          id, payrollRunId, employeeId, basicSalary, hra, allowances, overtime,
          earlyIncentive, attendanceIncentive, performanceIncentive, salesIncentive, bonus,
          deductions, penalties, pfDeduction, taxDeduction, lopDeduction, netPay,
          pfNo, esiNo, uanNo, bankName, bankAccount, salesmanNo, section, shiftName, batch, locationCode,
          pfPay, fixedGrossSalary, perDaySalary, daysPayable, govtHolidayPay, otPay,
          employeePf, employeeEsi, profTax, salaryAdvance, loanAdvance, employerPf, employerEsi, ctc,
          grossSalary, totalEarnings, totalDeductions, totalPayable, salaryMonth, salaryYear,
          earningsConfig, deductionsConfig, calculationDetails, customSections, remarks, status,
          createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, ?, 0.00, ?,
          0.00, 0.00, 0.00, 0.00, 0.00,
          ?, 0.00, ?, 0.00, 0.00, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          NOW(), NOW()
        )
      `, [
        itemId, runId, employeeId, basicVal, hraVal, otVal,
        totalDeductions, pfDeductVal, netPayable,
        pfNo || emp.pfNo, esiNo || emp.esiNo, uanNo || emp.uanNo, bankName || emp.bankName, bankAccount || emp.bankAccount,
        salesmanNo || emp.salesmanNo || emp.employeeCode, section || 'KIDS', shift || 'SHIFT II', batch || 'SHIFT II', locationCode || 'BSCTEX',
        Number(pfPay || basicVal), Number(fixedGrossSalary || 16000), Number(perDaySalary || 516.13), Number(daysPayable || 31), govtHolidayVal, otVal,
        pfDeductVal, esiDeductVal, profTaxVal, salAdvVal, loanAdvVal, employerPfVal, employerEsiVal, ctcVal,
        totalGross, totalGross, totalDeductions, netPayable, salaryMonth, yearNum,
        JSON.stringify(earningsConfig), JSON.stringify(deductionsConfig), JSON.stringify(calcDetails), JSON.stringify(customSections), remarks || '', status
      ]);
    }

    // Update employee master record with any modified statutory info
    await pool.query(`
      UPDATE employee SET
        pfNo = COALESCE(?, pfNo),
        esiNo = COALESCE(?, esiNo),
        uanNo = COALESCE(?, uanNo),
        bankName = COALESCE(?, bankName),
        bankAccount = COALESCE(?, bankAccount),
        salesmanNo = COALESCE(?, salesmanNo),
        batch = COALESCE(?, batch),
        pfPay = COALESCE(?, pfPay),
        fixedGrossSalary = COALESCE(?, fixedGrossSalary),
        perDaySalary = COALESCE(?, perDaySalary),
        daysPayable = COALESCE(?, daysPayable)
      WHERE id = ?
    `, [
      pfNo || null, esiNo || null, uanNo || null, bankName || null, bankAccount || null,
      salesmanNo || null, batch || null, pfPay ? Number(pfPay) : null,
      fixedGrossSalary ? Number(fixedGrossSalary) : null,
      perDaySalary ? Number(perDaySalary) : null,
      daysPayable ? Number(daysPayable) : null,
      employeeId
    ]);

    // Insert version record
    try {
      await pool.query(`
        INSERT INTO payslip_versions (
          id, payroll_item_id, payroll_run_id, employee_id, version, is_superseded,
          basic_salary, allowances, statutory_deductions, gross_earnings, total_deductions, net_pay,
          edited_by, edit_reason
        ) VALUES (?, ?, ?, ?, 1, FALSE, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        `pv_${itemId}_${Date.now()}`, itemId, runId, employeeId,
        basicVal, hraVal, pfDeductVal + esiDeductVal, totalGross, totalDeductions, netPayable,
        req.user?.fullName || req.user?.id || 'HR Manager', remarks || 'HR Payslip update and adjustment'
      ]);
    } catch (verErr: any) {
      console.warn('Payslip version log warning:', verErr.message);
    }

    res.json({
      success: true,
      message: 'Payslip saved and updated successfully!',
      payslipId: itemId,
      totalEarnings: totalGross,
      totalDeductions,
      netPayable,
      ctc: ctcVal,
    });
  } catch (error: any) {
    console.error('Save payslip error:', error);
    res.status(500).json({ error: 'Failed to save payslip', details: error.message });
  }
});

// -------------------------------------------------------------
// 3.4 GET /api/payroll/floor-salary-overview (Floor-Wise Salary Overview with RBAC)
// -------------------------------------------------------------
router.get('/floor-salary-overview', async (req: AuthRequest, res) => {
  try {
    // Access restriction: Only authorized HR and Admin roles can access the Floor-Wise Salary Overview
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({
        error: 'Access Denied: Only authorized HR and Admin roles can access the Floor-Wise Salary Overview. Floor Managers and general employees are restricted.',
      });
    }

    const {
      locationCode,
      locationId,
      floorId,
      sectionId,
      month = 'Aug',
      year = '2026',
    } = req.query;

    const targetMonthStr = String(month || 'Aug');
    const targetYearNum = Number(year || 2026);

    // 1. Fetch available locations, floors, sections for filter dropdowns
    const [allLocations]: any = await pool.query('SELECT id, code, name, city FROM location ORDER BY code');
    const [allFloors]: any = await pool.query(`
      SELECT f.id, f.name, f.floorNumber, f.locationId, l.code AS locationCode
      FROM floor f
      JOIN location l ON f.locationId = l.id
      ORDER BY l.code, f.floorNumber
    `);
    const [allSections]: any = await pool.query(`
      SELECT s.id, s.name, s.code, s.floorId, s.locationId, l.code AS locationCode
      FROM section s
      JOIN location l ON s.locationId = l.id
      ORDER BY s.name
    `);

    // 2. Query floors with their assigned Floor Manager particulars
    const floorConditions: string[] = [];
    const floorParams: any[] = [];

    if (locationCode && locationCode !== 'ALL') {
      floorConditions.push('l.code = ?');
      floorParams.push(locationCode);
    } else if (locationId && locationId !== 'ALL') {
      floorConditions.push('l.id = ?');
      floorParams.push(locationId);
    }

    if (floorId && floorId !== 'ALL') {
      floorConditions.push('f.id = ?');
      floorParams.push(floorId);
    }

    const floorWhere = floorConditions.length > 0 ? `WHERE ${floorConditions.join(' AND ')}` : '';

    const [floorRows]: any = await pool.query(`
      SELECT 
        f.id AS floorId,
        f.name AS floorName,
        f.floorNumber,
        l.id AS locationId,
        l.code AS locationCode,
        l.name AS locationName,
        l.city AS locationCity,
        u.id AS managerUserId,
        u.fullName AS managerName,
        u.email AS managerEmail,
        COALESCE(mgrEmp.employeeCode, u.employeeId, 'N/A') AS managerEmployeeCode
      FROM floor f
      JOIN location l ON f.locationId = l.id
      LEFT JOIN user u ON f.floorManagerId = u.id
      LEFT JOIN employee mgrEmp ON u.employeeId = mgrEmp.id
      ${floorWhere}
      ORDER BY l.code, f.floorNumber
    `, floorParams);

    // 3. Query all active employees and their payroll items for target month
    const empConditions: string[] = ["e.status = 'ACTIVE'"];
    const empParams: any[] = [targetMonthStr, targetYearNum];

    if (locationCode && locationCode !== 'ALL') {
      empConditions.push('l.code = ?');
      empParams.push(locationCode);
    } else if (locationId && locationId !== 'ALL') {
      empConditions.push('l.id = ?');
      empParams.push(locationId);
    }

    if (floorId && floorId !== 'ALL') {
      empConditions.push('e.floorId = ?');
      empParams.push(floorId);
    }

    if (sectionId && sectionId !== 'ALL') {
      empConditions.push('e.sectionId = ?');
      empParams.push(sectionId);
    }

    const [empPayrollRows]: any = await pool.query(`
      SELECT 
        e.id AS employeeId,
        e.employeeCode,
        e.fullName,
        e.designation,
        e.locationId,
        e.floorId,
        e.sectionId,
        l.code AS locationCode,
        l.name AS locationName,
        f.name AS floorName,
        f.floorNumber,
        sec.id AS secId,
        COALESCE(sec.name, 'General') AS sectionName,
        COALESCE(sec.code, 'GEN') AS sectionCode,
        sh.name AS shiftName,
        pi.id AS payrollItemId,
        COALESCE(pi.basicSalary, e.basicSalary, 12000) AS basicSalary,
        COALESCE(pi.grossSalary, pi.basicSalary + COALESCE(pi.earlyIncentive,0) + COALESCE(pi.attendanceIncentive,0) + COALESCE(pi.overtime,0), e.fixedGrossSalary, 16000) AS grossSalary,
        COALESCE(pi.totalDeductions, pi.deductions, 0) AS totalDeductions,
        COALESCE(pi.totalPayable, pi.netPay, 0) AS netPayable,
        COALESCE(pi.employerPf, ROUND(COALESCE(pi.basicSalary, 12000) * 0.12), 0) AS employerPf,
        COALESCE(pi.employerEsi, ROUND(COALESCE(pi.grossSalary, 16000) * 0.0325), 0) AS employerEsi,
        COALESCE(pi.ctc, 0) AS ctc,
        COALESCE(pi.daysPayable, 31) AS daysPayable,
        COALESCE(pi.status, 'APPROVED') AS status
      FROM employee e
      JOIN location l ON e.locationId = l.id
      LEFT JOIN floor f ON e.floorId = f.id
      LEFT JOIN section sec ON e.sectionId = sec.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
      LEFT JOIN payrollitem pi ON pi.employeeId = e.id AND (
        (pi.salaryMonth = ? AND pi.salaryYear = ?) OR 
        (pi.salaryMonth IS NULL AND pi.salaryYear IS NULL)
      )
      WHERE ${empConditions.join(' AND ')}
      ORDER BY l.code, f.floorNumber, sec.name, e.fullName
    `, empParams);

    // 4. Structure aggregation by Location and Floor
    interface FloorAgg {
      id: string;
      name: string;
      floorNumber: number;
      locationId: string;
      locationCode: string;
      locationName: string;
      floorManager: {
        id: string;
        fullName: string;
        employeeId: string;
        employeeCode: string;
        email: string;
      } | null;
      summary: {
        totalEmployees: number;
        totalGrossSalary: number;
        totalDeductions: number;
        totalNetPayable: number;
        totalEmployerPf: number;
        totalEmployerEsi: number;
        totalEmployerContrib: number;
        totalCtc: number;
      };
      sections: Array<{
        id: string;
        name: string;
        code: string;
        employeeCount: number;
        grossSalary: number;
        netPayable: number;
      }>;
      employees: any[];
    }

    interface LocationAgg {
      id: string;
      code: string;
      name: string;
      city: string;
      summary: {
        totalEmployees: number;
        totalGrossSalary: number;
        totalDeductions: number;
        totalNetPayable: number;
        totalEmployerPf: number;
        totalEmployerEsi: number;
        totalEmployerContrib: number;
        totalCtc: number;
      };
      floors: FloorAgg[];
    }

    const locationMap = new Map<string, LocationAgg>();
    const floorMap = new Map<string, FloorAgg>();

    // Initialize floors from floorRows
    for (const fl of floorRows) {
      if (!locationMap.has(fl.locationId)) {
        locationMap.set(fl.locationId, {
          id: fl.locationId,
          code: fl.locationCode,
          name: fl.locationName,
          city: fl.locationCity,
          summary: {
            totalEmployees: 0,
            totalGrossSalary: 0,
            totalDeductions: 0,
            totalNetPayable: 0,
            totalEmployerPf: 0,
            totalEmployerEsi: 0,
            totalEmployerContrib: 0,
            totalCtc: 0,
          },
          floors: [],
        });
      }

      const floorObj: FloorAgg = {
        id: fl.floorId,
        name: fl.floorName,
        floorNumber: fl.floorNumber,
        locationId: fl.locationId,
        locationCode: fl.locationCode,
        locationName: fl.locationName,
        floorManager: fl.managerUserId
          ? {
              id: fl.managerUserId,
              fullName: fl.managerName,
              employeeId: fl.managerEmployeeCode,
              employeeCode: fl.managerEmployeeCode,
              email: fl.managerEmail,
            }
          : null,
        summary: {
          totalEmployees: 0,
          totalGrossSalary: 0,
          totalDeductions: 0,
          totalNetPayable: 0,
          totalEmployerPf: 0,
          totalEmployerEsi: 0,
          totalEmployerContrib: 0,
          totalCtc: 0,
        },
        sections: [],
        employees: [],
      };

      floorMap.set(fl.floorId, floorObj);
      locationMap.get(fl.locationId)!.floors.push(floorObj);
    }

    // Populate employees and calculate floor/location metrics
    const sectionMapByFloor = new Map<string, Map<string, any>>();

    for (const emp of empPayrollRows) {
      const fId = emp.floorId;
      if (!fId || !floorMap.has(fId)) {
        continue;
      }

      const fl = floorMap.get(fId)!;
      const loc = locationMap.get(fl.locationId)!;

      const gross = Number(emp.grossSalary);
      const deductions = Number(emp.totalDeductions);
      const netPay = Number(emp.netPayable);
      const empPf = Number(emp.employerPf);
      const empEsi = Number(emp.employerEsi);
      const empContrib = empPf + empEsi;
      const ctcVal = Number(emp.ctc || (gross + empContrib));

      // Update floor summary
      fl.summary.totalEmployees += 1;
      fl.summary.totalGrossSalary += gross;
      fl.summary.totalDeductions += deductions;
      fl.summary.totalNetPayable += netPay;
      fl.summary.totalEmployerPf += empPf;
      fl.summary.totalEmployerEsi += empEsi;
      fl.summary.totalEmployerContrib += empContrib;
      fl.summary.totalCtc += ctcVal;

      // Update location summary
      loc.summary.totalEmployees += 1;
      loc.summary.totalGrossSalary += gross;
      loc.summary.totalDeductions += deductions;
      loc.summary.totalNetPayable += netPay;
      loc.summary.totalEmployerPf += empPf;
      loc.summary.totalEmployerEsi += empEsi;
      loc.summary.totalEmployerContrib += empContrib;
      loc.summary.totalCtc += ctcVal;

      // Track section metrics inside this floor
      if (!sectionMapByFloor.has(fId)) {
        sectionMapByFloor.set(fId, new Map());
      }
      const floorSecMap = sectionMapByFloor.get(fId)!;
      const secKey = emp.sectionName || 'General';
      if (!floorSecMap.has(secKey)) {
        floorSecMap.set(secKey, {
          id: emp.secId || `sec_${secKey}`,
          name: emp.sectionName || 'General',
          code: emp.sectionCode || 'GEN',
          employeeCount: 0,
          grossSalary: 0,
          netPayable: 0,
        });
      }
      const secEntry = floorSecMap.get(secKey)!;
      secEntry.employeeCount += 1;
      secEntry.grossSalary += gross;
      secEntry.netPayable += netPay;

      fl.employees.push({
        payrollItemId: emp.payrollItemId || `draft_${emp.employeeId}`,
        employeeId: emp.employeeId,
        employeeCode: emp.employeeCode,
        fullName: emp.fullName,
        designation: emp.designation,
        sectionName: emp.sectionName,
        shiftName: emp.shiftName,
        daysPayable: Number(emp.daysPayable),
        basicSalary: Number(emp.basicSalary),
        grossSalary: gross,
        totalDeductions: deductions,
        netPayable: netPay,
        employerPf: empPf,
        employerEsi: empEsi,
        employerContrib: empContrib,
        ctc: ctcVal,
        status: emp.status,
      });
    }

    // Attach section summaries to each floor
    for (const [fId, secMap] of sectionMapByFloor.entries()) {
      if (floorMap.has(fId)) {
        floorMap.get(fId)!.sections = Array.from(secMap.values());
      }
    }

    // Overall summary across all locations
    const overallSummary = {
      totalLocations: locationMap.size,
      totalFloors: floorMap.size,
      totalEmployees: 0,
      totalGrossSalary: 0,
      totalDeductions: 0,
      totalNetPayable: 0,
      totalEmployerPf: 0,
      totalEmployerEsi: 0,
      totalEmployerContrib: 0,
      totalCtc: 0,
    };

    for (const loc of locationMap.values()) {
      overallSummary.totalEmployees += loc.summary.totalEmployees;
      overallSummary.totalGrossSalary += loc.summary.totalGrossSalary;
      overallSummary.totalDeductions += loc.summary.totalDeductions;
      overallSummary.totalNetPayable += loc.summary.totalNetPayable;
      overallSummary.totalEmployerPf += loc.summary.totalEmployerPf;
      overallSummary.totalEmployerEsi += loc.summary.totalEmployerEsi;
      overallSummary.totalEmployerContrib += loc.summary.totalEmployerContrib;
      overallSummary.totalCtc += loc.summary.totalCtc;
    }

    // Return structured payload
    res.json({
      success: true,
      filters: {
        locationCode: locationCode || 'ALL',
        floorId: floorId || 'ALL',
        sectionId: sectionId || 'ALL',
        month: targetMonthStr,
        year: targetYearNum,
      },
      availableFilters: {
        locations: allLocations,
        floors: allFloors,
        sections: allSections,
        months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
        years: [2025, 2026, 2027],
      },
      overallSummary,
      locations: Array.from(locationMap.values()),
    });
  } catch (error: any) {
    console.error('Floor salary overview error:', error);
    res.status(500).json({ error: 'Failed to compute floor-wise salary overview', details: error.message });
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

    const yearNum = Number(year);
    const safeYear = Number.isFinite(yearNum) && yearNum > 1970 ? yearNum : null;

    if (month && safeYear) {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const rawMonth = String(month).trim();
      let monthNum = Number(rawMonth);
      let monthName = rawMonth;

      if (Number.isFinite(monthNum) && monthNum >= 1 && monthNum <= 12) {
        monthName = monthNames[monthNum - 1];
      } else {
        const idx = monthNames.findIndex((m) => m.toLowerCase() === rawMonth.toLowerCase());
        monthNum = idx + 1;
        monthName = idx !== -1 ? monthNames[idx] : rawMonth;
      }

      conditions.push('((pi.salaryMonth = ? AND pi.salaryYear = ?) OR (MONTH(pr.periodEnd) = ? AND YEAR(pr.periodEnd) = ?))');
      params.push(monthName, safeYear, monthNum, safeYear);
    } else if (safeYear) {
      conditions.push('(pi.salaryYear = ? OR YEAR(pr.periodEnd) = ?)');
      params.push(safeYear, safeYear);
    } else if (month) {
      conditions.push('pi.salaryMonth = ?');
      params.push(String(month).trim());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (Number(page) - 1) * Number(limit);

    const [rows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd, pr.status AS runStatus,
        e.employeeCode, e.fullName AS employeeName, e.designation, e.email AS employeeEmail,
        COALESCE(pi.pfNo, e.pfNo, '') AS pfNo,
        COALESCE(pi.esiNo, e.esiNo, '') AS esiNo,
        COALESCE(pi.uanNo, e.uanNo, '') AS uanNo,
        COALESCE(pi.bankName, e.bankName, 'HDFC') AS bankName,
        COALESCE(pi.bankAccount, e.bankAccount, '') AS bankAccount,
        COALESCE(pi.salesmanNo, e.salesmanNo, e.employeeCode) AS salesmanNo,
        COALESCE(pi.section, sec.name, d.name, 'KIDS') AS section,
        COALESCE(pi.shiftName, sh.name, 'SHIFT II') AS shift,
        COALESCE(pi.batch, e.batch, 'SHIFT II') AS batch,
        COALESCE(pi.locationCode, l.code, 'BSCTEX') AS locationCode,
        COALESCE(pi.pfPay, e.pfPay, pi.basicSalary, 12000.00) AS pfPay,
        COALESCE(pi.fixedGrossSalary, e.fixedGrossSalary, 16000.00) AS fixedGrossSalary,
        COALESCE(pi.perDaySalary, e.perDaySalary, 516.13) AS perDaySalary,
        COALESCE(pi.daysPayable, e.daysPayable, 31.00) AS daysPayable,
        l.name AS locationName, l.code AS locationCode,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN section sec ON e.sectionId = sec.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
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

    const formattedRows = rows.map((r: any) => ({
      ...r,
      earningsConfig: safeJsonParse(r.earningsConfig, null),
      deductionsConfig: safeJsonParse(r.deductionsConfig, null),
      calculationDetails: safeJsonParse(r.calculationDetails, {}),
      customSections: safeJsonParse(r.customSections, []),
    }));

    res.json({
      payslips: formattedRows,
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
        COALESCE(pi.pfNo, e.pfNo, '') AS pfNo,
        COALESCE(pi.esiNo, e.esiNo, '') AS esiNo,
        COALESCE(pi.uanNo, e.uanNo, '') AS uanNo,
        COALESCE(pi.bankName, e.bankName, 'HDFC') AS bankName,
        COALESCE(pi.bankAccount, e.bankAccount, '') AS bankAccount,
        COALESCE(pi.salesmanNo, e.salesmanNo, e.employeeCode) AS salesmanNo,
        COALESCE(pi.section, sec.name, d.name, 'KIDS') AS section,
        COALESCE(pi.shiftName, sh.name, 'SHIFT II') AS shift,
        COALESCE(pi.batch, e.batch, 'SHIFT II') AS batch,
        COALESCE(pi.locationCode, l.code, 'BSCTEX') AS locationCode,
        COALESCE(pi.pfPay, e.pfPay, pi.basicSalary, 12000.00) AS pfPay,
        COALESCE(pi.fixedGrossSalary, e.fixedGrossSalary, 16000.00) AS fixedGrossSalary,
        COALESCE(pi.perDaySalary, e.perDaySalary, 516.13) AS perDaySalary,
        COALESCE(pi.daysPayable, e.daysPayable, 31.00) AS daysPayable,
        l.id AS locationId, l.name AS locationName, l.code AS locationCode,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN section sec ON e.sectionId = sec.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
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

    // Parse JSON
    payslip.calculationDetails = safeJsonParse(payslip.calculationDetails, {});
    payslip.customSections = safeJsonParse(payslip.customSections, []);
    payslip.earningsConfig = safeJsonParse(payslip.earningsConfig, null);
    payslip.deductionsConfig = safeJsonParse(payslip.deductionsConfig, null);

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
    let existingCalc: any = {};
    if (existing.calculationDetails) {
      existingCalc = safeJsonParse<any>(existing.calculationDetails, {});
    }

    const basicSalary = body.basicSalary ?? Number(existing.basicSalary);
    const hra = body.hra ?? Number(existingCalc.hra || basicSalary * 0.4);
    const allowances = body.allowances ?? Number(existingCalc.allowances || 0);
    const bonus = body.bonus ?? Number(existingCalc.bonus || 0);
    const earlyIncentive = body.earlyIncentive ?? Number(existing.earlyIncentive || 0);
    const attendanceIncentive = body.attendanceIncentive ?? Number(existing.attendanceIncentive || 0);
    const salesIncentive = body.salesIncentive ?? Number(existing.salesIncentive || 0);
    const overtime = body.overtime ?? Number(existing.overtime || 0);

    const pfDeduction = body.pfDeduction ?? Number(existingCalc.pfDeduction || basicSalary * 0.12);
    const taxDeduction = body.taxDeduction ?? Number(existingCalc.taxDeduction || 0);
    const lopDeduction = body.lopDeduction ?? Number(existingCalc.lopDeduction || 0);
    const penalties = body.penalties ?? Number(existing.penalties || 0);

    // Calculate Custom Sections sum
    let customEarnings = 0;
    let customDeductions = 0;
    const customSections = body.customSections ?? (existingCalc.customSections || []);

    if (Array.isArray(customSections)) {
      customSections.forEach((sec: any) => {
        if (Array.isArray(sec.items)) {
          sec.items.forEach((it: any) => {
            const amt = Number(it.amount || 0);
            if (it.type === 'earning' || it.type === 'EARNING') customEarnings += amt;
            if (it.type === 'deduction' || it.type === 'DEDUCTION') customDeductions += amt;
          });
        }
      });
    }

    const totalGross = basicSalary + hra + allowances + bonus + earlyIncentive + attendanceIncentive + salesIncentive + overtime + customEarnings;
    const totalDeductions = pfDeduction + taxDeduction + lopDeduction + penalties + customDeductions;
    const netPay = Math.max(0, totalGross - totalDeductions);

    const updatedCalculationDetails = {
      ...existingCalc,
      basic: basicSalary,
      hra,
      allowances,
      bonus,
      earlyIncentive,
      attendanceIncentive,
      salesIncentive,
      overtime,
      pfDeduction,
      taxDeduction,
      lopDeduction,
      penalties,
      customSections,
      remarks: body.remarks ?? existingCalc.remarks,
    };

    await pool.query(`
      UPDATE payrollitem SET
        basicSalary = ?,
        earlyIncentive = ?,
        attendanceIncentive = ?,
        salesIncentive = ?,
        overtime = ?,
        penalties = ?,
        deductions = ?,
        netPay = ?,
        calculationDetails = ?,
        updatedAt = NOW()
      WHERE id = ?
    `, [
      basicSalary,
      earlyIncentive,
      attendanceIncentive,
      salesIncentive,
      overtime,
      penalties,
      totalDeductions,
      netPay,
      JSON.stringify(updatedCalculationDetails),
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
      customSections: safeJsonParse<any[]>(p.customSections, []),
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
      customSections: safeJsonParse<any[]>(p.customSections, []),
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
        COALESCE(pi.pfNo, e.pfNo, '') AS pfNo,
        COALESCE(pi.esiNo, e.esiNo, '') AS esiNo,
        COALESCE(pi.uanNo, e.uanNo, '') AS uanNo,
        COALESCE(pi.bankName, e.bankName, 'HDFC') AS bankName,
        COALESCE(pi.bankAccount, e.bankAccount, '') AS bankAccount,
        COALESCE(pi.salesmanNo, e.salesmanNo, e.employeeCode) AS salesmanNo,
        COALESCE(pi.section, sec.name, d.name, 'KIDS') AS section,
        COALESCE(pi.shiftName, sh.name, 'SHIFT II') AS shift,
        COALESCE(pi.batch, e.batch, 'SHIFT II') AS batch,
        COALESCE(pi.locationCode, l.code, 'BSCTEX') AS locationCode,
        COALESCE(pi.pfPay, e.pfPay, pi.basicSalary, 12000.00) AS pfPay,
        COALESCE(pi.fixedGrossSalary, e.fixedGrossSalary, 16000.00) AS fixedGrossSalary,
        COALESCE(pi.perDaySalary, e.perDaySalary, 516.13) AS perDaySalary,
        COALESCE(pi.daysPayable, e.daysPayable, 31.00) AS daysPayable,
        l.name AS locationName,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN section sec ON e.sectionId = sec.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
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

    let settings: any = {
      companyName: 'BSC Textiles Private Limited',
      companyAddress: '#104 Silk Mill Road, Industrial Area, Belagavi, Karnataka – 590014\nGSTIN: 29AAACB1234F1Z5 | TAN: BLRB12345C',
      signatoryName: 'Sunita Deshmukh',
      signatoryDesignation: 'Head of Human Resources & Statutory Compliance',
    };
    try {
      const [settingsRows]: any = await pool.query(`SELECT * FROM payroll_settings LIMIT 1`);
      if (settingsRows && settingsRows[0]) {
        settings = { ...settings, ...settingsRows[0] };
      }
    } catch (e: any) {
      console.warn('Could not query payroll_settings, using fallback:', e.message);
    }

    const parsedEarnings = safeJsonParse<any[]>(p.earningsConfig, []);
    const parsedDeductions = safeJsonParse<any[]>(p.deductionsConfig, []);

    const earningsList = Array.isArray(parsedEarnings) && parsedEarnings.length > 0 ? parsedEarnings.filter((e: any) => e.enabled !== false).map((e: any) => ({
      label: e.label,
      amount: Number(e.amount || 0),
    })) : [
      { label: 'BASIC PAY', amount: Number(p.basicSalary || 12000) },
      { label: 'HRA', amount: Number(p.hra || 4000) },
      ...(Number(p.otPay || p.overtime || 0) > 0 ? [{ label: 'OT', amount: Number(p.otPay || p.overtime) }] : []),
      ...(Number(p.govtHolidayPay || 0) > 0 ? [{ label: 'GOVT.HOLIDAY', amount: Number(p.govtHolidayPay) }] : []),
    ];

    const deductionsList = Array.isArray(parsedDeductions) && parsedDeductions.length > 0 ? parsedDeductions.filter((d: any) => d.enabled !== false).map((d: any) => ({
      label: d.label,
      amount: Number(d.amount || 0),
    })) : [
      { label: 'EMPLOYEE PF', amount: Number(p.employeePf || p.pfDeduction || 1440) },
      { label: 'EMPLOYEE ESI', amount: Number(p.employeeEsi || 153) },
      { label: 'PROF TAX', amount: Number(p.profTax || 0) },
    ];

    const mask = req.query.mask !== 'false';

    const pdfData: PayslipPdfData = {
      id: p.id,
      employeeCode: p.employeeCode,
      fullName: p.fullName,
      designation: p.designation,
      departmentName: p.departmentName,
      locationName: p.locationName,
      pfNo: p.pfNo,
      esiNo: p.esiNo,
      uanNo: p.uanNo || p.uan,
      bankName: p.bankName,
      bankAccount: p.bankAccount,
      maskBankAccount: mask,
      salesmanNo: p.salesmanNo,
      section: p.section,
      shift: p.shift,
      batch: p.batch,
      locationCode: p.locationCode,
      periodStart: p.periodStart,
      periodEnd: p.periodEnd,
      salaryMonth: p.salaryMonth,
      salaryYear: p.salaryYear,
      pfPay: Number(p.pfPay || p.basicSalary),
      hra: Number(p.hra || 0),
      fixedGrossSalary: Number(p.fixedGrossSalary || (Number(p.basicSalary || 0) + Number(p.hra || 0))),
      perDaySalary: Number(p.perDaySalary || 0),
      daysPayable: Number(p.daysPayable || 31),
      basicSalary: Number(p.basicSalary || 0),
      overtime: Number(p.otPay || p.overtime || 0),
      grossSalary: Number(p.grossSalary || p.totalEarnings || p.basicSalary),
      grossDeductions: Number(p.grossDeductions || p.totalDeductions || p.deductions),
      totalPayable: Number(p.totalPayable || p.netPay),
      salaryAdvance: Number(p.salaryAdvance || 0),
      loanAdvance: Number(p.loanAdvance || 0),
      netPayable: Number(p.netPayable || p.netPay),
      netPay: Number(p.netPayable || p.netPay),
      employerPf: Number(p.employerPf || Math.round(Number(p.basicSalary || 0) * 0.12)),
      employerEsi: Number(p.employerEsi || Math.round(Number(p.grossSalary || 0) * 0.0325)),
      ctc: Number(p.ctc || 0),
      earningsList,
      deductionsList,
      status: p.status || 'APPROVED',
      customSections: safeJsonParse<any[]>(p.customSections, []),
      remarks: p.remarks,
    };

    const pdfBuffer = await generatePayslipPdf(pdfData, {
      companyName: settings.companyName || 'BSC TEXTILES PVT LTD.,',
      companyAddress: settings.companyAddress || 'DENTAL COLLEGE ROAD,, DAVANGERE - 577004',
      signatoryName: settings.signatoryName,
      signatoryDesignation: settings.signatoryDesignation,
    });

    const fileName = `BSC_Payslip_${p.employeeCode}_${p.salaryMonth || 'Slip'}_${p.salaryYear || 2026}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(pdfBuffer);
  } catch (error: any) {
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
    const structures = rows.map((r: any) => {
      const baseSalary = Number(r.baseSalary || 0);
      const hraPercent = Number(r.hraPercent || 40);
      const pfPercent = Number(r.pfPercent || 12);
      const conveyance = Number(r.conveyance || 0);
      const medicalAllowance = Number(r.medicalAllowance || 0);
      const specialAllowance = Number(r.specialAllowance || 0);
      const totalAllowances = conveyance + medicalAllowance + specialAllowance;
      const hraAmount = Math.round(baseSalary * (hraPercent / 100));
      const pfAmount = Math.round(baseSalary * (pfPercent / 100));
      const ptDeduction = Number(r.ptDeduction || 200);
      const gross = baseSalary + hraAmount + totalAllowances;
      const net = gross - pfAmount - ptDeduction;

      return {
        ...r,
        name: r.title,
        title: r.title,
        cadre: r.cadreGrade,
        cadreGrade: r.cadreGrade,
        basicSalary: baseSalary,
        baseSalary,
        hraPercent,
        pfPercent,
        allowances: totalAllowances,
        conveyance,
        medicalAllowance,
        specialAllowance,
        ptDeduction,
        hraAmount,
        pfAmount,
        grossEst: gross,
        netEst: net,
      };
    });
    res.json({ structures });
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
    const {
      title,
      name,
      cadreGrade,
      cadre,
      baseSalary,
      basicSalary,
      hraPercent,
      allowances,
      conveyance,
      medicalAllowance,
      specialAllowance,
      pfPercent,
      ptDeduction,
    } = req.body;

    const effTitle = title || name;
    const effCadre = cadreGrade || cadre || 'CADRE-A';
    const effBase = baseSalary !== undefined ? Number(baseSalary) : basicSalary !== undefined ? Number(basicSalary) : 0;

    if (!effTitle || !effBase) {
      return res.status(400).json({ error: 'Title and Base Salary are required' });
    }

    const effConveyance = conveyance !== undefined ? Number(conveyance) : 1600;
    const effMedical = medicalAllowance !== undefined ? Number(medicalAllowance) : 1250;
    const effSpecial =
      specialAllowance !== undefined
        ? Number(specialAllowance)
        : allowances !== undefined
        ? Math.max(0, Number(allowances) - (effConveyance + effMedical))
        : 2000;

    const id = `struct-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    await pool.query(`
      INSERT INTO salary_structure (
        id, title, cadreGrade, baseSalary, hraPercent, conveyance, medicalAllowance, specialAllowance, pfPercent, ptDeduction, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
    `, [
      id,
      effTitle,
      effCadre,
      effBase,
      hraPercent !== undefined ? Number(hraPercent) : 40,
      effConveyance,
      effMedical,
      effSpecial,
      pfPercent !== undefined ? Number(pfPercent) : 12,
      ptDeduction !== undefined ? Number(ptDeduction) : 200,
    ]);

    res.status(201).json({ message: 'Salary structure template created successfully', id });
  } catch (error) {
    console.error('Create salary structure error:', error);
    res.status(500).json({ error: 'Failed to create salary structure' });
  }
});

router.put('/salary-structures/:id', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    const { id } = req.params;
    const {
      title,
      name,
      cadreGrade,
      cadre,
      baseSalary,
      basicSalary,
      hraPercent,
      allowances,
      conveyance,
      medicalAllowance,
      specialAllowance,
      pfPercent,
      ptDeduction,
      status,
    } = req.body;

    const effTitle = title || name;
    const effCadre = cadreGrade || cadre;
    const effBase = baseSalary !== undefined ? Number(baseSalary) : basicSalary !== undefined ? Number(basicSalary) : 0;

    if (!effTitle || !effBase) {
      return res.status(400).json({ error: 'Title and Base Salary are required' });
    }

    const effConveyance = conveyance !== undefined ? Number(conveyance) : 1600;
    const effMedical = medicalAllowance !== undefined ? Number(medicalAllowance) : 1250;
    const effSpecial =
      specialAllowance !== undefined
        ? Number(specialAllowance)
        : allowances !== undefined
        ? Math.max(0, Number(allowances) - (effConveyance + effMedical))
        : 2000;

    await pool.query(
      `UPDATE salary_structure SET
        title = ?,
        cadreGrade = ?,
        baseSalary = ?,
        hraPercent = ?,
        conveyance = ?,
        medicalAllowance = ?,
        specialAllowance = ?,
        pfPercent = ?,
        ptDeduction = ?,
        status = COALESCE(?, status),
        updatedAt = NOW()
      WHERE id = ?`,
      [
        effTitle,
        effCadre || 'CADRE-A',
        effBase,
        hraPercent !== undefined ? Number(hraPercent) : 40,
        effConveyance,
        effMedical,
        effSpecial,
        pfPercent !== undefined ? Number(pfPercent) : 12,
        ptDeduction !== undefined ? Number(ptDeduction) : 200,
        status || 'ACTIVE',
        id,
      ]
    );

    res.json({ message: 'Salary structure updated successfully', id });
  } catch (error) {
    console.error('Update salary structure error:', error);
    res.status(500).json({ error: 'Failed to update salary structure' });
  }
});

router.delete('/salary-structures/:id', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges' });
    }
    const { id } = req.params;
    await pool.query(`DELETE FROM salary_structure WHERE id = ?`, [id]);
    res.json({ message: 'Salary structure deleted successfully', id });
  } catch (error) {
    console.error('Delete salary structure error:', error);
    res.status(500).json({ error: 'Failed to delete salary structure' });
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

// -------------------------------------------------------------
// 14. Employee View-Only Payslips (/api/payroll/payslips/my-slips)
// -------------------------------------------------------------
router.get('/payslips/my-slips', async (req: AuthRequest, res) => {
  try {
    const employeeId = req.user?.employeeId;
    if (!employeeId) {
      return res.status(400).json({ error: 'Employee context not found for logged in user' });
    }
    const [rows]: any = await pool.query(`
      SELECT pi.*, pr.period_start, pr.period_end, pr.status as run_status,
             e.employee_code, e.full_name as employee_name,
             l.name as location_name, d.name as department_name
      FROM payroll_items pi
      JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
      JOIN employees e ON pi.employee_id = e.id
      LEFT JOIN locations l ON e.location_id = l.id
      LEFT JOIN departments d ON e.department_id = d.id
      WHERE pi.employee_id = ?
      ORDER BY pr.period_start DESC
    `, [employeeId]);
    res.json({ payslips: rows });
  } catch (error: any) {
    console.error('Get my payslips error:', error);
    res.status(500).json({ error: 'Failed to retrieve payslips', message: error.message });
  }
});

// -------------------------------------------------------------
// 15. Stream Payslip PDF (/api/payroll/payslips/:id/pdf)
// -------------------------------------------------------------
router.get('/payslips/:id/pdf', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;

    // Check payrollitem first
    let [rows]: any = await pool.query(`
      SELECT 
        pi.*,
        pr.periodStart, pr.periodEnd,
        e.employeeCode, e.fullName, e.designation, e.email,
        COALESCE(pi.pfNo, e.pfNo, '') AS pfNo,
        COALESCE(pi.esiNo, e.esiNo, '') AS esiNo,
        COALESCE(pi.uanNo, e.uanNo, '') AS uanNo,
        COALESCE(pi.bankName, e.bankName, 'HDFC') AS bankName,
        COALESCE(pi.bankAccount, e.bankAccount, '') AS bankAccount,
        COALESCE(pi.salesmanNo, e.salesmanNo, e.employeeCode) AS salesmanNo,
        COALESCE(pi.section, sec.name, d.name, 'KIDS') AS section,
        COALESCE(pi.shiftName, sh.name, 'SHIFT II') AS shift,
        COALESCE(pi.batch, e.batch, 'SHIFT II') AS batch,
        COALESCE(pi.locationCode, l.code, 'BSCTEX') AS locationCode,
        COALESCE(pi.pfPay, e.pfPay, pi.basicSalary, 12000.00) AS pfPay,
        COALESCE(pi.fixedGrossSalary, e.fixedGrossSalary, 16000.00) AS fixedGrossSalary,
        COALESCE(pi.perDaySalary, e.perDaySalary, 516.13) AS perDaySalary,
        COALESCE(pi.daysPayable, e.daysPayable, 31.00) AS daysPayable,
        l.name AS locationName,
        d.name AS departmentName
      FROM payrollitem pi
      JOIN payrollrun pr ON pi.payrollRunId = pr.id
      JOIN employee e ON pi.employeeId = e.id
      JOIN location l ON e.locationId = l.id
      LEFT JOIN department d ON e.departmentId = d.id
      LEFT JOIN section sec ON e.sectionId = sec.id
      LEFT JOIN shift sh ON e.shiftId = sh.id
      WHERE pi.id = ?
    `, [id]);

    if (!rows || rows.length === 0) {
      // Fallback to legacy payroll_items
      [rows] = await pool.query(`
        SELECT pi.*, pr.period_start, pr.period_end,
               e.employee_code, e.full_name as fullName,
               l.name as locationName, d.name as departmentName
        FROM payroll_items pi
        JOIN payroll_runs pr ON pi.payroll_run_id = pr.id
        JOIN employees e ON pi.employee_id = e.id
        LEFT JOIN locations l ON e.location_id = l.id
        LEFT JOIN departments d ON e.department_id = d.id
        WHERE pi.id = ?
        LIMIT 1
      `, [id]);
    }

    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Payslip not found' });
    }

    const p = rows[0];

    // IDOR verification
    if (req.user?.role === 'EMPLOYEE' || req.user?.role === 'SALES_EMPLOYEE') {
      const empId = p.employeeId || p.employee_id;
      if (empId !== req.user?.employeeId) {
        return res.status(403).json({ error: 'Forbidden: You are not authorized to view another employee payslip' });
      }
    }

    const [settingsRows]: any = await pool.query(`SELECT * FROM payroll_settings LIMIT 1`);
    const settings = settingsRows[0] || {};

    const parsedEarnings = safeJsonParse<any[]>(p.earningsConfig, []);
    const parsedDeductions = safeJsonParse<any[]>(p.deductionsConfig, []);

    const earningsList = Array.isArray(parsedEarnings) && parsedEarnings.length > 0 ? parsedEarnings.filter((e: any) => e.enabled !== false).map((e: any) => ({
      label: e.label,
      amount: Number(e.amount || 0),
    })) : [
      { label: 'BASIC PAY', amount: Number(p.basicSalary || p.basic_salary || 12000) },
      { label: 'HRA', amount: Number(p.hra || 4000) },
      ...(Number(p.otPay || p.overtime || p.overtime_pay || 0) > 0 ? [{ label: 'OT', amount: Number(p.otPay || p.overtime || p.overtime_pay) }] : []),
      ...(Number(p.govtHolidayPay || 0) > 0 ? [{ label: 'GOVT.HOLIDAY', amount: Number(p.govtHolidayPay) }] : []),
    ];

    const deductionsList = Array.isArray(parsedDeductions) && parsedDeductions.length > 0 ? parsedDeductions.filter((d: any) => d.enabled !== false).map((d: any) => ({
      label: d.label,
      amount: Number(d.amount || 0),
    })) : [
      { label: 'EMPLOYEE PF', amount: Number(p.employeePf || p.pfDeduction || 1440) },
      { label: 'EMPLOYEE ESI', amount: Number(p.employeeEsi || 153) },
      { label: 'PROF TAX', amount: Number(p.profTax || 0) },
    ];

    const mask = req.query.mask !== 'false';

    const pdfBuffer = await generatePayslipPdf({
      id: p.id,
      employeeCode: p.employeeCode || p.employee_code || 'EMP',
      fullName: p.fullName || p.employee_name || 'Staff Member',
      designation: p.designation || 'Specialist',
      departmentName: p.departmentName || p.department_name || 'Showroom Sales',
      locationName: p.locationName || p.location_name || 'BSC Davangere Store',
      pfNo: p.pfNo,
      esiNo: p.esiNo,
      uanNo: p.uanNo || p.uan,
      bankName: p.bankName || 'HDFC',
      bankAccount: p.bankAccount,
      maskBankAccount: mask,
      salesmanNo: p.salesmanNo || p.employeeCode,
      section: p.section || 'KIDS',
      shift: p.shift || 'SHIFT II',
      batch: p.batch || 'SHIFT II',
      locationCode: p.locationCode || 'BSCTEX',
      periodStart: p.periodStart || p.period_start || new Date().toISOString(),
      periodEnd: p.periodEnd || p.period_end || new Date().toISOString(),
      salaryMonth: p.salaryMonth,
      salaryYear: p.salaryYear,
      pfPay: Number(p.pfPay || p.basicSalary || p.basic_salary || 12000),
      hra: Number(p.hra || 4000),
      fixedGrossSalary: Number(p.fixedGrossSalary || 16000),
      perDaySalary: Number(p.perDaySalary || 516.13),
      daysPayable: Number(p.daysPayable || 31),
      basicSalary: Number(p.basicSalary || p.basic_salary || 12000),
      overtime: Number(p.otPay || p.overtime || p.overtime_pay || 0),
      grossSalary: Number(p.grossSalary || p.totalEarnings || p.gross_earnings || 20375.50),
      grossDeductions: Number(p.grossDeductions || p.totalDeductions || p.total_deductions || 1593.00),
      totalPayable: Number(p.totalPayable || p.netPay || p.net_pay || 18782.50),
      salaryAdvance: Number(p.salaryAdvance || 0),
      loanAdvance: Number(p.loanAdvance || 0),
      netPayable: Number(p.netPayable || p.netPay || p.net_pay || 18782.50),
      netPay: Number(p.netPayable || p.netPay || p.net_pay || 18782.50),
      employerPf: Number(p.employerPf || Math.round(Number(p.basicSalary || 12000) * 0.12)),
      employerEsi: Number(p.employerEsi || Math.round(Number(p.grossSalary || 20375.50) * 0.0325)),
      ctc: Number(p.ctc || 22478.00),
      earningsList,
      deductionsList,
      status: p.status || p.run_status || 'FINALIZED',
    }, {
      companyName: settings.companyName || 'BSC TEXTILES PVT LTD.,',
      companyAddress: settings.companyAddress || 'DENTAL COLLEGE ROAD,, DAVANGERE - 577004',
      signatoryName: settings.signatoryName,
      signatoryDesignation: settings.signatoryDesignation,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="BSC_Payslip_${p.employeeCode || p.employee_code}_${p.salaryMonth || 'Slip'}.pdf"`);
    res.send(pdfBuffer);
  } catch (error: any) {
    console.error('Stream payslip PDF error:', error);
    res.status(500).json({ error: 'Failed to generate payslip PDF', message: error.message });
  }
});

// -------------------------------------------------------------
// 16. HR Edit Payslip Component (/api/payroll/payslips/:id/edit)
// -------------------------------------------------------------
router.put('/payslips/:id/edit', async (req: AuthRequest, res) => {
  try {
    if (!isHrOrAdmin(req.user?.role)) {
      return res.status(403).json({ error: 'Forbidden: Only HR or Admin can edit payslips' });
    }

    const { id } = req.params;
    const { basicSalary, allowances, statutoryDeductions, editReason } = req.body;

    if (!editReason || editReason.trim().length < 5) {
      return res.status(400).json({ error: 'Mandatory documented audit reason required for editing payslips' });
    }

    const [rows]: any = await pool.query('SELECT * FROM payroll_items WHERE id = ? LIMIT 1', [id]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ error: 'Payslip not found' });
    }
    const current = rows[0];

    const basic = basicSalary !== undefined ? Number(basicSalary) : Number(current.basic_salary);
    const allow = allowances !== undefined ? Number(allowances) : Number(current.allowances);
    const statutory = statutoryDeductions !== undefined ? Number(statutoryDeductions) : Number(current.statutory_deductions);

    const gross = basic + allow +
      Number(current.early_incentive || 0) +
      Number(current.sales_incentive || 0) +
      Number(current.attendance_incentive || 0) +
      Number(current.overtime_pay || 0);

    const totalDed = statutory +
      Number(current.late_penalties || 0) +
      Number(current.break_penalties || 0);

    const netPay = Math.round((gross - totalDed) * 100) / 100;

    // Record superseded version in payslip_versions
    await pool.query(`
      INSERT INTO payslip_versions (
        id, payroll_item_id, payroll_run_id, employee_id, version, is_superseded,
        basic_salary, allowances, statutory_deductions, gross_earnings, total_deductions, net_pay,
        edited_by, edit_reason
      ) VALUES (?, ?, ?, ?, 2, FALSE, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `pv_${id}_${Date.now()}`,
      id,
      current.payroll_run_id,
      current.employee_id,
      basic,
      allow,
      statutory,
      gross,
      totalDed,
      netPay,
      req.user?.id || 'system',
      editReason,
    ]);

    // Update active payroll_items
    await pool.query(`
      UPDATE payroll_items 
      SET basic_salary = ?, allowances = ?, statutory_deductions = ?,
          gross_earnings = ?, total_deductions = ?, net_pay = ?
      WHERE id = ?
    `, [basic, allow, statutory, gross, totalDed, netPay, id]);

    res.json({
      message: 'Payslip updated successfully with audit trail and recalculated totals',
      payslip: {
        id,
        basicSalary: basic,
        allowances: allow,
        statutoryDeductions: statutory,
        grossEarnings: gross,
        totalDeductions: totalDed,
        netPay,
        editReason,
      },
    });
  } catch (error: any) {
    console.error('Edit payslip error:', error);
    res.status(500).json({ error: 'Failed to update payslip', message: error.message });
  }
});

// -------------------------------------------------------------
// 17. Payslip Version History (/api/payroll/payslips/:id/versions)
// -------------------------------------------------------------
router.get('/payslips/:id/versions', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const [rows]: any = await pool.query(
      'SELECT * FROM payslip_versions WHERE payroll_item_id = ? ORDER BY created_at DESC',
      [id]
    );
    res.json({ versions: rows });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
