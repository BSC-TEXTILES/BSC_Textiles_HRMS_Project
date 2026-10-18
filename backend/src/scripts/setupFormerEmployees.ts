import { pool } from '../nativeDb.js';

export async function setupFormerEmployees(options?: { schemaOnly?: boolean }) {
  console.log('--- Checking Former Employees & F&F Seed Data ---');

  if (options?.schemaOnly) {
    console.log('setupFormerEmployees: schema/reference shaping complete; the fabricated resigned employees, exits and F&F settlements were not seeded (boot fixtures disabled).');
    return;
  }
  const [existingExits]: any = await pool.query('SELECT COUNT(*) as count FROM employee_exits');
  const [existingFixtures]: any = await pool.query(
    "SELECT COUNT(*) as count FROM employee WHERE id IN ('emp_ex_001', 'emp_ex_002')"
  );
  if (existingExits[0]?.count > 0 || existingFixtures[0]?.count > 0) {
    console.log(`✓ Former-employee fixtures already present (${existingExits[0]?.count || 0} exits).`);
    return;
  }

  // Get valid location and department IDs from DB
  const [locations]: any = await pool.query('SELECT id FROM location LIMIT 3');
  const locBel = locations[0]?.id || 'loc_bel';
  const locShi = locations[2]?.id || locations[0]?.id || 'loc_shi';

  const [depts]: any = await pool.query('SELECT id FROM department LIMIT 2');
  const deptSales = depts[0]?.id || 'dept_sales';
  const deptOps = depts[1]?.id || depts[0]?.id || 'dept_ops';

  const [shifts]: any = await pool.query('SELECT id FROM shift LIMIT 1');
  const shiftId = shifts[0]?.id || null;

  const [adminUsers]: any = await pool.query("SELECT id FROM user WHERE role = 'SUPER_ADMIN' LIMIT 1");
  const adminId = adminUsers[0]?.id || 'usr_admin';

  // Ensure employee.status ENUM allows all former employee statuses
  try {
    await pool.query("ALTER TABLE employee MODIFY COLUMN status ENUM('ACTIVE','INACTIVE','ON_LEAVE','TERMINATED','RESIGNED','RETIRED','EX_EMPLOYEE') NOT NULL DEFAULT 'ACTIVE'");
  } catch (err: any) {
    console.warn('[setupFormerEmployees warning] Could not alter employee.status enum:', err.message);
  }

  // 1. Insert 2 former employees into `employee`
  await pool.query(`
    INSERT INTO employee (
      id, employeeCode, firstName, lastName, fullName, gender, phone, email,
      locationId, departmentId, shiftId, designation, role, status, joiningDate, exitDate, createdAt, updatedAt
    ) VALUES 
    (
  // Digits-only (the enforced employeeCode check) and deliberately outside the
  // ranges the biometric identity tests use for suffix collisions.
      '+'emp_ex_001'+', '+'991001'+', 'Anand', 'Kulkarni', 'Anand Kulkarni (Former Lead Cashier)', 'MALE', '+91 9880000091', 'anand.k@bsctextiles.com',
      ?, ?, ?, 'Former Lead Cashier', 'SALES_EMPLOYEE', 'RESIGNED', '2022-04-15', '2026-08-31', NOW(3), NOW(3)
    ),
    (
      'emp_ex_002', '991002', 'Sunita', 'Rao', 'Sunita Rao (Former Sales Associate)', 'FEMALE', '+91 9880000092', 'sunita.r@bsctextiles.com',
      ?, ?, ?, 'Former Sales Associate', 'SALES_EMPLOYEE', 'RESIGNED', '2023-01-10', '2026-10-15', NOW(3), NOW(3)
    )
    ON DUPLICATE KEY UPDATE status = VALUES(status), exitDate = VALUES(exitDate)
  `, [locBel, deptSales, shiftId, locShi, deptOps, shiftId]);

  // 2. Insert into `employee_exits`
  await pool.query(`
    INSERT INTO employee_exits (
      id, employee_id, exit_type, resignation_date, notice_period_days, last_working_day, reason, status, initiator_id, created_at, updated_at
    ) VALUES
    ('exit_001', 'emp_ex_001', 'RESIGNATION', '2026-08-01', 30, '2026-08-31', 'Relocating to Bengaluru for higher education', 'PAID', ?, NOW(3), NOW(3)),
    ('exit_002', 'emp_ex_002', 'RESIGNATION', '2026-09-15', 30, '2026-10-15', 'Personal career change to textile design', 'APPROVED', ?, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE status = VALUES(status)
  `, [adminId, adminId]);

  // 3. Insert clearance tasks
  await pool.query(`
    INSERT INTO exit_clearance_tasks (id, exit_id, department, task_name, status, remarks, cleared_by, cleared_at)
    VALUES
    ('cl_01_it', 'exit_001', 'IT', 'Email deactivation, POS terminal ID revoked & laptop returned', 'CLEARED', 'All hardware handed over in good condition', ?, '2026-08-31 16:00:00'),
    ('cl_01_acc', 'exit_001', 'ACCOUNTS', 'Advance zero balance clearance & imprest settlement', 'CLEARED', 'No outstanding dues', ?, '2026-08-31 16:30:00'),
    ('cl_01_hr', 'exit_001', 'HR', 'Identity badge, health insurance card & statutory exit interview', 'CLEARED', 'Exit survey completed successfully', ?, '2026-08-31 17:00:00'),
    ('cl_01_ops', 'exit_001', 'STORE_OPS', 'Cash drawer reconciliation & locker keys returned', 'CLEARED', 'Drawer balanced to zero discrepancy', ?, '2026-08-31 17:15:00'),
    ('cl_01_sec', 'exit_001', 'SECURITY', 'Biometric profile revoked & store access badge deactivated', 'CLEARED', 'Access revoked', ?, '2026-08-31 17:30:00'),
    
    ('cl_02_it', 'exit_002', 'IT', 'POS login credentials revocation', 'CLEARED', 'Revoked', ?, '2026-10-10 11:00:00'),
    ('cl_02_acc', 'exit_002', 'ACCOUNTS', 'Outstanding salary advance check', 'CLEARED', 'Checked', ?, '2026-10-10 11:15:00'),
    ('cl_02_hr', 'exit_002', 'HR', 'Uniform & ID card return, exit interview', 'CLEARED', 'Complete', ?, '2026-10-10 11:30:00'),
    ('cl_02_ops', 'exit_002', 'STORE_OPS', 'Floor stock inventory handover', 'CLEARED', 'Handover confirmed', ?, '2026-10-10 11:45:00'),
    ('cl_02_sec', 'exit_002', 'SECURITY', 'Store gate pass & biometrics', 'CLEARED', 'Cleared', ?, '2026-10-10 12:00:00')
    ON DUPLICATE KEY UPDATE status = VALUES(status)
  `, [adminId, adminId, adminId, adminId, adminId, adminId, adminId, adminId, adminId, adminId]);

  // 4. Insert F&F settlements
  await pool.query(`
    INSERT INTO fnf_settlements (
      id, exit_id, employee_id, status, approved_last_working_day,
      unpaid_salary_days, unpaid_salary_amount, gratuity_amount, leave_encashment_days, leave_encashment_amount,
      bonus_incentive_amount, other_earnings, total_earnings,
      notice_shortfall_days, notice_recovery_amount, salary_advance_recovery, loan_balance_recovery,
      asset_damage_recovery, statutory_deductions, other_deductions, total_deductions,
      net_payable, calculation_breakdown_json, remarks, prepared_by, approved_by, approved_at,
      payment_reference, payment_mode, payment_date
    ) VALUES
    (
      'fnf_001', 'exit_001', 'emp_ex_001', 'PAID', '2026-08-31',
      31.00, 35000.00, 0.00, 10.00, 11666.67,
      2500.00, 0.00, 49166.67,
      0.00, 0.00, 0.00, 0.00,
      0.00, 3600.00, 0.00, 3600.00,
      45566.67,
      ?,
      'Settlement verified against August 2026 biometric records and department clearances',
      ?, ?, '2026-09-02 14:00:00',
      'NEFT-BSC-20260905-091244', 'NEFT', '2026-09-05'
    ),
    (
      'fnf_002', 'exit_002', 'emp_ex_002', 'APPROVED', '2026-10-15',
      15.00, 13548.39, 0.00, 6.00, 5419.35,
      1200.00, 0.00, 20167.74,
      0.00, 0.00, 0.00, 0.00,
      0.00, 1400.00, 0.00, 1400.00,
      18767.74,
      ?,
      'Approved by Shivamogga HR. Scheduled for NEFT batch processing.',
      ?, ?, '2026-10-10 10:00:00',
      NULL, NULL, NULL
    )
    ON DUPLICATE KEY UPDATE status = VALUES(status)
  `, [
    JSON.stringify({
      basicMonthlySalary: 35000.00,
      workingDaysInMonth: 31,
      dailyRate: 1129.03,
      leaveEncashmentDays: 10,
      leaveEncashmentRate: 1166.67,
      noticePeriodServedDays: 30,
      gratuityFormula: '15 * last_drawn / 26 * years (Tenure < 5 years = ₹0)',
      statutoryPFDeduction: 1800.00,
      professionalTax: 200.00,
      incomeTaxTDS: 1600.00
    }),
    adminId, adminId,
    JSON.stringify({
      basicMonthlySalary: 28000.00,
      workingDaysInMonth: 31,
      dailyRate: 903.23,
      leaveEncashmentDays: 6,
      leaveEncashmentRate: 903.23,
      noticePeriodServedDays: 30,
      statutoryPFDeduction: 1200.00,
      professionalTax: 200.00
    }),
    adminId, adminId
  ]);

  console.log('✅ Former Employees & F&F Settlement Records initialized successfully!');
}

if (process.argv[1]?.includes('setupFormerEmployees')) {
  setupFormerEmployees()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error in setupFormerEmployees:', err);
      process.exit(1);
    });
}
