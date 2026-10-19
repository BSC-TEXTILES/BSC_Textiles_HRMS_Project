import { pool } from '../nativeDb.js';

export async function setupViews() {
  console.log('--- Checking Schema Compatibility Views ---');

  const [tables] = await pool.query('SHOW FULL TABLES') as any;
  const baseTableNames = new Set(
    tables
      .filter((t: any) => t.Table_type === 'BASE TABLE')
      .map((t: any) => Object.values(t)[0])
  );

  // Helper to create view only if a base table does not already exist with that name
  const safeCreateView = async (viewName: string, query: string) => {
    if (baseTableNames.has(viewName)) {
      console.log(`✓ Base table already exists: ${viewName} (view creation skipped)`);
      return;
    }
    try {
      await pool.query(`CREATE OR REPLACE VIEW ${viewName} AS ${query}`);
      console.log(`✓ Created/Updated view: ${viewName}`);
    } catch (err: any) {
      console.warn(`[setupViews warning] Could not create view ${viewName}:`, err.message);
    }
  };

  // 1. employees view
  await safeCreateView(
    'employees',
    `SELECT 
      id,
      employeeCode,
      employeeCode AS employee_code,
      firstName,
      lastName,
      fullName,
      fullName AS full_name,
      email,
      phone,
      gender,
      dateOfBirth,
      dateOfBirth AS date_of_birth,
      locationId,
      locationId AS location_id,
      floorId,
      floorId AS floor_id,
      departmentId,
      departmentId AS department_id,
      sectionId,
      sectionId AS section_id,
      shiftId,
      shiftId AS shift_id,
      designation,
      role,
      status,
      joiningDate,
      joiningDate AS joining_date,
      joiningDate AS date_of_joining,
      exitDate,
      exitDate AS exit_date,
      faceProfileId,
      createdAt,
      createdAt AS created_at,
      updatedAt,
      updatedAt AS updated_at
    FROM employee`
  );

  // 2. locations view
  await safeCreateView('locations', 'SELECT * FROM location');

  // 3. departments view
  await safeCreateView('departments', 'SELECT * FROM department');

  // 4. shifts view
  await safeCreateView('shifts', 'SELECT * FROM shift');

  // 5. payroll_items view
  await safeCreateView(
    'payroll_items',
    `SELECT
      id,
      payrollRunId AS payroll_run_id,
      employeeId AS employee_id,
      basicSalary AS basic_salary,
      earlyIncentive AS early_incentive,
      attendanceIncentive AS attendance_incentive,
      performanceIncentive AS performance_incentive,
      salesIncentive AS sales_incentive,
      overtime AS overtime_pay,
      deductions AS total_deductions,
      penalties AS late_penalties,
      0.00 AS break_penalties,
      netPay AS net_pay,
      (basicSalary + earlyIncentive + attendanceIncentive + salesIncentive + overtime) AS gross_earnings,
      COALESCE(allowances, 0) AS allowances,
      (COALESCE(pfDeduction, 0) + COALESCE(taxDeduction, 0)) AS statutory_deductions,
      status,
      createdAt AS created_at,
      updatedAt AS updated_at
    FROM payrollitem`
  );

  console.log('--- Schema Compatibility Views Ready ---');
}

if (process.argv[1]?.includes('setupViews')) {
  setupViews()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to setup views:', err);
      process.exit(1);
    });
}
