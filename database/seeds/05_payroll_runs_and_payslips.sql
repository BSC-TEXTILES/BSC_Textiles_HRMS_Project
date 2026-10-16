-- 05 · Payroll runs and payslip lines
--
-- Suite 9 of the automated tests asserts that HR can list payslips and that an
-- employee sees only their own, which requires payroll history to exist. Ids are
-- derived deterministically from location/employee and period so re-applying this
-- file updates the same rows instead of duplicating them.
--
-- Amounts are computed from each employee's own base_salary rather than hard-coded,
-- so the figures stay consistent if the roster changes:
--   allowances          = 20% of basic
--   statutory_deductions = 12% of basic (EPF), capped on a ₹15,000.00 wage ceiling
--   gross_earnings      = basic + allowances + incentives + overtime
--   net_pay             = gross − penalties − statutory

SET @period_one_start   = '2026-08-01';
SET @period_one_end     = '2026-08-31';
SET @period_two_start   = '2026-09-01';
SET @period_two_end     = '2026-09-30';
SET @pf_wage_ceiling    = 15000.00;

-- ── Period 1 ───────────────────────────────────────────────────────────────
INSERT INTO payroll_runs (id, location_id, period_start, period_end, status, processed_by)
SELECT CONCAT('prun_', l.code, '_202608'), l.id, @period_one_start, @period_one_end, 'PUBLISHED', 'system-seed'
  FROM locations l
 WHERE EXISTS (SELECT 1 FROM employees e WHERE e.location_id = l.id AND e.status = 'ACTIVE')
ON DUPLICATE KEY UPDATE
  period_start = VALUES(period_start),
  period_end   = VALUES(period_end),
  status       = VALUES(status);

INSERT INTO payroll_items
  (id, payroll_run_id, employee_id, basic_salary, allowances, early_incentive, sales_incentive,
   attendance_incentive, overtime_pay, late_penalties, break_penalties, statutory_deductions,
   gross_earnings, total_deductions, net_pay)
SELECT
  CONCAT('pitem_', e.id, '_202608'),
  CONCAT('prun_', l.code, '_202608'),
  e.id,
  e.base_salary,
  ROUND(e.base_salary * 0.20, 2),
  0.00, 0.00, 0.00, 0.00,
  0.00, 0.00,
  ROUND(LEAST(e.base_salary, @pf_wage_ceiling) * 0.12, 2),
  ROUND(e.base_salary * 1.20, 2),
  ROUND(LEAST(e.base_salary, @pf_wage_ceiling) * 0.12, 2),
  ROUND(e.base_salary * 1.20 - LEAST(e.base_salary, @pf_wage_ceiling) * 0.12, 2)
  FROM employees e
  JOIN locations l ON l.id = e.location_id
 WHERE e.status = 'ACTIVE'
ON DUPLICATE KEY UPDATE
  payroll_run_id        = VALUES(payroll_run_id),
  basic_salary          = VALUES(basic_salary),
  allowances            = VALUES(allowances),
  statutory_deductions  = VALUES(statutory_deductions),
  gross_earnings        = VALUES(gross_earnings),
  total_deductions      = VALUES(total_deductions),
  net_pay               = VALUES(net_pay);

-- ── Period 2 ───────────────────────────────────────────────────────────────
INSERT INTO payroll_runs (id, location_id, period_start, period_end, status, processed_by)
SELECT CONCAT('prun_', l.code, '_202609'), l.id, @period_two_start, @period_two_end, 'PUBLISHED', 'system-seed'
  FROM locations l
 WHERE EXISTS (SELECT 1 FROM employees e WHERE e.location_id = l.id AND e.status = 'ACTIVE')
ON DUPLICATE KEY UPDATE
  period_start = VALUES(period_start),
  period_end   = VALUES(period_end),
  status       = VALUES(status);

INSERT INTO payroll_items
  (id, payroll_run_id, employee_id, basic_salary, allowances, early_incentive, sales_incentive,
   attendance_incentive, overtime_pay, late_penalties, break_penalties, statutory_deductions,
   gross_earnings, total_deductions, net_pay)
SELECT
  CONCAT('pitem_', e.id, '_202609'),
  CONCAT('prun_', l.code, '_202609'),
  e.id,
  e.base_salary,
  ROUND(e.base_salary * 0.20, 2),
  0.00, 0.00, 0.00, 0.00,
  0.00, 0.00,
  ROUND(LEAST(e.base_salary, @pf_wage_ceiling) * 0.12, 2),
  ROUND(e.base_salary * 1.20, 2),
  ROUND(LEAST(e.base_salary, @pf_wage_ceiling) * 0.12, 2),
  ROUND(e.base_salary * 1.20 - LEAST(e.base_salary, @pf_wage_ceiling) * 0.12, 2)
  FROM employees e
  JOIN locations l ON l.id = e.location_id
 WHERE e.status = 'ACTIVE'
ON DUPLICATE KEY UPDATE
  payroll_run_id        = VALUES(payroll_run_id),
  basic_salary          = VALUES(basic_salary),
  allowances            = VALUES(allowances),
  statutory_deductions  = VALUES(statutory_deductions),
  gross_earnings        = VALUES(gross_earnings),
  total_deductions      = VALUES(total_deductions),
  net_pay               = VALUES(net_pay);
