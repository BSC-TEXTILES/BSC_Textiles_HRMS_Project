-- 06 · Payroll runs and payslip lines (authoritative legacy schema)
--
-- The live application reads the singular camelCase tables through the `prisma`
-- compatibility shim in backend/src/nativeDb.ts (prisma.user -> `user`,
-- prisma.employee -> `employee`), and GET /api/payroll/payslips queries
-- `payrollitem` / `payrollrun` / `employee`. This seed targets those tables so the
-- payslip ledger, PDF and HR-edit tests have real rows.
--
-- 05_payroll_runs_and_payslips.sql covers the newer plural snake_case tables used
-- by core/repositories/SalarySlipRepository. Both sets are populated because both
-- conventions are still referenced by live routes; consolidating them onto one
-- schema is tracked separately.
--
-- Ids are deterministic so re-applying updates the same rows. Employees with no
-- configured salary fall back to a floor so a payslip never renders ₹0.

SET @pf_wage_ceiling = 15000.00;
SET @salary_floor    = 15000.00;

-- ── Period: August 2026 ────────────────────────────────────────────────────
INSERT INTO payrollrun (id, periodStart, periodEnd, status, processedBy, processedAt, updatedAt)
VALUES ('prun_legacy_202608', '2026-08-01', '2026-08-31', 'PUBLISHED', 'system-seed', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE periodStart = VALUES(periodStart), periodEnd = VALUES(periodEnd), status = VALUES(status);

INSERT INTO payrollitem
  (id, payrollRunId, employeeId, basicSalary, hra, allowances, bonus, earlyIncentive,
   attendanceIncentive, performanceIncentive, salesIncentive, overtime, otPay,
   deductions, penalties, pfDeduction, employeePf, employerPf, taxDeduction, profTax,
   lopDeduction, govtHolidayPay, salaryAdvance, loanAdvance, employeeEsi, employerEsi,
   ctc, grossSalary, fixedGrossSalary, perDaySalary, daysPayable, paidHolidays, paidLeaves,
   totalEarnings, totalDeductions, totalPayable, netPay, calculationDetails, status,
   salaryMonth, salaryYear, locationCode, emailStatus, finalizedBy, finalizedAt, updatedAt)
SELECT
  CONCAT('pitem_legacy_', e.id, '_202608'),
  'prun_legacy_202608',
  e.id,
  GREATEST(e.basicSalary, @salary_floor),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 0.40, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 0.20, 2),
  0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
  0.00, 0.00,
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12, 2),
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12, 2),
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12, 2),
  0.00,
  CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
       WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END,
  0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) / 26, 2),
  31.00, 0.00, 0.00,
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12
        + (CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
                WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END), 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60
        - LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12
        - (CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
                WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END), 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60
        - LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12
        - (CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
                WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END), 2),
  JSON_OBJECT(
    'basis', 'seed',
    'period', '2026-08',
    'formula', 'gross = basic + HRA(40%) + allowances(20%); deductions = PF(12% of basic, ceiling 15000) + Karnataka PT slab'
  ),
  'PUBLISHED',
  'Aug', 2026,
  l.code, 'NOT_SENT', 'system-seed', NOW(3), NOW(3)
  FROM employee e
  LEFT JOIN location l ON l.id = e.locationId
 WHERE e.status IN ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED')
ON DUPLICATE KEY UPDATE
  basicSalary = VALUES(basicSalary),
  hra = VALUES(hra),
  allowances = VALUES(allowances),
  pfDeduction = VALUES(pfDeduction),
  grossSalary = VALUES(grossSalary),
  totalEarnings = VALUES(totalEarnings),
  totalDeductions = VALUES(totalDeductions),
  netPay = VALUES(netPay),
  status = VALUES(status),
  updatedAt = NOW(3);

-- ── Period: September 2026 ─────────────────────────────────────────────────
INSERT INTO payrollrun (id, periodStart, periodEnd, status, processedBy, processedAt, updatedAt)
VALUES ('prun_legacy_202609', '2026-09-01', '2026-09-30', 'PUBLISHED', 'system-seed', NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE periodStart = VALUES(periodStart), periodEnd = VALUES(periodEnd), status = VALUES(status);

INSERT INTO payrollitem
  (id, payrollRunId, employeeId, basicSalary, hra, allowances, bonus, earlyIncentive,
   attendanceIncentive, performanceIncentive, salesIncentive, overtime, otPay,
   deductions, penalties, pfDeduction, employeePf, employerPf, taxDeduction, profTax,
   lopDeduction, govtHolidayPay, salaryAdvance, loanAdvance, employeeEsi, employerEsi,
   ctc, grossSalary, fixedGrossSalary, perDaySalary, daysPayable, paidHolidays, paidLeaves,
   totalEarnings, totalDeductions, totalPayable, netPay, calculationDetails, status,
   salaryMonth, salaryYear, locationCode, emailStatus, finalizedBy, finalizedAt, updatedAt)
SELECT
  CONCAT('pitem_legacy_', e.id, '_202609'),
  'prun_legacy_202609',
  e.id,
  GREATEST(e.basicSalary, @salary_floor),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 0.40, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 0.20, 2),
  0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
  0.00, 0.00,
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12, 2),
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12, 2),
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12, 2),
  0.00,
  CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
       WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END,
  0.00, 0.00, 0.00, 0.00, 0.00, 0.00,
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) / 26, 2),
  30.00, 0.00, 0.00,
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60, 2),
  ROUND(LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12
        + (CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
                WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END), 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60
        - LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12
        - (CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
                WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END), 2),
  ROUND(GREATEST(e.basicSalary, @salary_floor) * 1.60
        - LEAST(GREATEST(e.basicSalary, @salary_floor), @pf_wage_ceiling) * 0.12
        - (CASE WHEN GREATEST(e.basicSalary, @salary_floor) > 25000 THEN 300.00
                WHEN GREATEST(e.basicSalary, @salary_floor) > 21000 THEN 200.00 ELSE 0.00 END), 2),
  JSON_OBJECT(
    'basis', 'seed',
    'period', '2026-09',
    'formula', 'gross = basic + HRA(40%) + allowances(20%); deductions = PF(12% of basic, ceiling 15000) + Karnataka PT slab'
  ),
  'PUBLISHED',
  'Sep', 2026,
  l.code, 'NOT_SENT', 'system-seed', NOW(3), NOW(3)
  FROM employee e
  LEFT JOIN location l ON l.id = e.locationId
 WHERE e.status IN ('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'SUSPENDED')
ON DUPLICATE KEY UPDATE
  basicSalary = VALUES(basicSalary),
  hra = VALUES(hra),
  allowances = VALUES(allowances),
  pfDeduction = VALUES(pfDeduction),
  grossSalary = VALUES(grossSalary),
  totalEarnings = VALUES(totalEarnings),
  totalDeductions = VALUES(totalDeductions),
  netPay = VALUES(netPay),
  status = VALUES(status),
  updatedAt = NOW(3);
