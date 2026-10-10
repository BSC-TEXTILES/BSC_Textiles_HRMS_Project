-- ==============================================================================
-- BSC TEXTILES HRMS — SEED: LEAVE BALANCES, FORMER EMPLOYEES & F&F SETTLEMENTS
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. SEED INITIAL LEAVE BALANCES FOR ALL SEEDED EMPLOYEES (2026)
INSERT INTO `leave_balances` (`id`, `employee_id`, `leave_type_id`, `year`, `total_credited`, `used`, `pending`, `balance`)
SELECT 
  CONCAT('lb_', e.id, '_cl_2026'), e.id, 'lt_cl', 2026, 12.00, 2.00, 0.00, 10.00
FROM employees e
ON DUPLICATE KEY UPDATE `balance`=VALUES(`balance`);

INSERT INTO `leave_balances` (`id`, `employee_id`, `leave_type_id`, `year`, `total_credited`, `used`, `pending`, `balance`)
SELECT 
  CONCAT('lb_', e.id, '_sl_2026'), e.id, 'lt_sl', 2026, 10.00, 1.00, 0.00, 9.00
FROM employees e
ON DUPLICATE KEY UPDATE `balance`=VALUES(`balance`);

INSERT INTO `leave_balances` (`id`, `employee_id`, `leave_type_id`, `year`, `total_credited`, `used`, `pending`, `balance`)
SELECT 
  CONCAT('lb_', e.id, '_el_2026'), e.id, 'lt_el', 2026, 18.00, 3.00, 0.00, 15.00
FROM employees e
ON DUPLICATE KEY UPDATE `balance`=VALUES(`balance`);

INSERT INTO `leave_balances` (`id`, `employee_id`, `leave_type_id`, `year`, `total_credited`, `used`, `pending`, `balance`)
SELECT 
  CONCAT('lb_', e.id, '_lop_2026'), e.id, 'lt_lop', 2026, 365.00, 0.00, 0.00, 365.00
FROM employees e
ON DUPLICATE KEY UPDATE `balance`=VALUES(`balance`);

-- 2. SAMPLE LEAVE APPLICATIONS
INSERT INTO `leave_applications` (`id`, `employee_id`, `leave_type_id`, `start_date`, `end_date`, `is_half_day`, `half_day_session`, `days_count`, `reason`, `status`, `reviewed_by`, `reviewed_at`)
VALUES
('la_demo_01', 'emp_rajesh', 'lt_cl', DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_SUB(CURDATE(), INTERVAL 4 DAY), FALSE, NULL, 2.00, 'Family celebration at hometown', 'APPROVED', 'usr_kavita', DATE_SUB(NOW(), INTERVAL 6 DAY)),
('la_demo_02', 'emp_priya', 'lt_sl', DATE_SUB(CURDATE(), INTERVAL 12 DAY), DATE_SUB(CURDATE(), INTERVAL 12 DAY), TRUE, 'SECOND_HALF', 0.50, 'Dental consultation', 'APPROVED', 'usr_kavita', DATE_SUB(NOW(), INTERVAL 13 DAY)),
('la_demo_03', 'emp_rajesh', 'lt_el', DATE_ADD(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 12 DAY), FALSE, NULL, 3.00, 'Annual festival vacation', 'PENDING', NULL, NULL)
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

-- 3. SEED 2 FORMER EMPLOYEES (EX-EMPLOYEES RETAINED IN SYSTEM)
INSERT INTO `employees` (`id`, `employee_code`, `full_name`, `gender`, `phone`, `email`, `location_id`, `floor_id`, `department_id`, `section_id`, `selling_point_id`, `shift_id`, `base_salary`, `status`, `date_of_joining`)
VALUES
('emp_ex_001', 'EMP-BEL-EX01', 'Anand Kulkarni (Former Lead Cashier)', 'MALE', '+91 9880000091', 'anand.k@bsctextiles.com', 'loc_bel', 'floor_bel_g', 'dept_sarees', 'sec_kanchi', 'sp_bel_01', 'shift_retail_morning', 35000.00, 'EX_EMPLOYEE', '2022-04-15'),
('emp_ex_002', 'EMP-SHI-EX02', 'Sunita Rao (Former Sales Associate)', 'FEMALE', '+91 9880000092', 'sunita.r@bsctextiles.com', 'loc_shi', NULL, NULL, NULL, NULL, 'shift_retail_shi', 28000.00, 'RESIGNED', '2023-01-10')
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

-- 4. SEED CORRESPONDING EXITS
INSERT INTO `employee_exits` (`id`, `employee_id`, `exit_type`, `resignation_date`, `notice_period_days`, `last_working_day`, `reason`, `status`, `initiator_id`)
VALUES
('exit_001', 'emp_ex_001', 'RESIGNATION', '2026-08-01', 30, '2026-08-31', 'Relocating to Bengaluru for higher education', 'PAID', 'usr_admin'),
('exit_002', 'emp_ex_002', 'RESIGNATION', '2026-09-15', 30, '2026-10-15', 'Personal career change to textile design', 'APPROVED', 'usr_vikram')
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

-- 5. SEED CLEARANCE TASKS
INSERT INTO `exit_clearance_tasks` (`id`, `exit_id`, `department`, `task_name`, `status`, `remarks`, `cleared_by`, `cleared_at`)
VALUES
('cl_01_it', 'exit_001', 'IT', 'Email deactivation, POS terminal ID revoked & laptop returned', 'CLEARED', 'All hardware handed over in good condition', 'usr_admin', '2026-08-31 16:00:00'),
('cl_01_acc', 'exit_001', 'ACCOUNTS', 'Advance zero balance clearance & imprest settlement', 'CLEARED', 'No outstanding dues', 'usr_admin', '2026-08-31 16:30:00'),
('cl_01_hr', 'exit_001', 'HR', 'Identity badge, health insurance card & statutory exit interview', 'CLEARED', 'Exit survey completed successfully', 'usr_kavita', '2026-08-31 17:00:00'),
('cl_01_ops', 'exit_001', 'STORE_OPS', 'Cash drawer reconciliation & locker keys returned', 'CLEARED', 'Drawer balanced to zero discrepancy', 'usr_amit', '2026-08-31 17:15:00'),
('cl_01_sec', 'exit_001', 'SECURITY', 'Biometric profile revoked & store access badge deactivated', 'CLEARED', 'Access revoked', 'usr_admin', '2026-08-31 17:30:00'),

('cl_02_it', 'exit_002', 'IT', 'POS login credentials revocation', 'CLEARED', 'Revoked', 'usr_admin', '2026-10-10 11:00:00'),
('cl_02_acc', 'exit_002', 'ACCOUNTS', 'Outstanding salary advance check', 'CLEARED', 'Checked', 'usr_admin', '2026-10-10 11:15:00'),
('cl_02_hr', 'exit_002', 'HR', 'Uniform & ID card return, exit interview', 'CLEARED', 'Complete', 'usr_vikram', '2026-10-10 11:30:00'),
('cl_02_ops', 'exit_002', 'STORE_OPS', 'Floor stock inventory handover', 'CLEARED', 'Handover confirmed', 'usr_vikram', '2026-10-10 11:45:00'),
('cl_02_sec', 'exit_002', 'SECURITY', 'Store gate pass & biometrics', 'CLEARED', 'Cleared', 'usr_admin', '2026-10-10 12:00:00')
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

-- 6. SEED FULL & FINAL SETTLEMENTS
INSERT INTO `fnf_settlements` (
  `id`, `exit_id`, `employee_id`, `status`, `approved_last_working_day`,
  `unpaid_salary_days`, `unpaid_salary_amount`, `gratuity_amount`, `leave_encashment_days`, `leave_encashment_amount`,
  `bonus_incentive_amount`, `other_earnings`, `total_earnings`,
  `notice_shortfall_days`, `notice_recovery_amount`, `salary_advance_recovery`, `loan_balance_recovery`,
  `asset_damage_recovery`, `statutory_deductions`, `other_deductions`, `total_deductions`,
  `net_payable`, `calculation_breakdown_json`, `remarks`, `prepared_by`, `approved_by`, `approved_at`,
  `payment_reference`, `payment_mode`, `payment_date`
)
VALUES
(
  'fnf_001', 'exit_001', 'emp_ex_001', 'PAID', '2026-08-31',
  31.00, 35000.00, 0.00, 10.00, 11666.67,
  2500.00, 0.00, 49166.67,
  0.00, 0.00, 0.00, 0.00,
  0.00, 3600.00, 0.00, 3600.00,
  45566.67,
  JSON_OBJECT(
    'basicMonthlySalary', 35000.00,
    'workingDaysInMonth', 31,
    'dailyRate', 1129.03,
    'leaveEncashmentDays', 10,
    'leaveEncashmentRate', 1166.67,
    'noticePeriodServedDays', 30,
    'gratuityFormula', '15 * last_drawn / 26 * years (Tenure < 5 years = ₹0)',
    'statutoryPFDeduction', 1800.00,
    'professionalTax', 200.00,
    'incomeTaxTDS', 1600.00
  ),
  'Settlement verified against August 2026 biometric records and department clearances',
  'usr_kavita', 'usr_admin', '2026-09-02 14:00:00',
  'NEFT-BSC-20260905-091244', 'NEFT', '2026-09-05'
),
(
  'fnf_002', 'exit_002', 'emp_ex_002', 'APPROVED', '2026-10-15',
  15.00, 13548.39, 0.00, 6.00, 5419.35,
  1200.00, 0.00, 20167.74,
  0.00, 0.00, 0.00, 0.00,
  0.00, 1400.00, 0.00, 1400.00,
  18767.74,
  JSON_OBJECT(
    'basicMonthlySalary', 28000.00,
    'workingDaysInMonth', 31,
    'dailyRate', 903.23,
    'leaveEncashmentDays', 6,
    'leaveEncashmentRate', 903.23,
    'noticePeriodServedDays', 30,
    'statutoryPFDeduction', 1200.00,
    'professionalTax', 200.00
  ),
  'Approved by Shivamogga HR. Scheduled for NEFT batch processing.',
  'usr_vikram', 'usr_admin', '2026-10-10 10:00:00',
  NULL, NULL, NULL
)
ON DUPLICATE KEY UPDATE `status`=VALUES(`status`);

SET FOREIGN_KEY_CHECKS = 1;
