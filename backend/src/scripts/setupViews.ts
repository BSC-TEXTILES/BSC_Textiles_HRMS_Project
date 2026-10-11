import { pool } from '../nativeDb.js';

export async function setupViews() {
  console.log('--- Creating Schema Compatibility Views ---');

  // 1. employees view
  await pool.query(`
    CREATE OR REPLACE VIEW employees AS
    SELECT 
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
      qrCodeId,
      dailyQRCodeId,
      30000.00 AS base_salary,
      createdAt,
      createdAt AS created_at,
      updatedAt,
      updatedAt AS updated_at
    FROM employee;
  `);
  console.log('✓ Created/Updated view: employees');

  // 2. locations view
  await pool.query(`
    CREATE OR REPLACE VIEW locations AS
    SELECT * FROM location;
  `);
  console.log('✓ Created/Updated view: locations');

  // 3. departments view
  await pool.query(`
    CREATE OR REPLACE VIEW departments AS
    SELECT * FROM department;
  `);
  console.log('✓ Created/Updated view: departments');

  // 4. shifts view
  await pool.query(`
    CREATE OR REPLACE VIEW shifts AS
    SELECT * FROM shift;
  `);
  console.log('✓ Created/Updated view: shifts');

  // 5. payroll_items view
  await pool.query(`
    CREATE OR REPLACE VIEW payroll_items AS
    SELECT
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
    FROM payrollitem;
  `);
  console.log('✓ Created/Updated view: payroll_items');

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
