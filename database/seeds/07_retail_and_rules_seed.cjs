const mysql = require('mysql2/promise');
const path = require('node:path');
// Load the single root .env whether this is run from the repository root or
// from the database workspace.
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true
  });

  console.log('Connected to MySQL...');

  // 1. Update existing sellingpoints with floorId, locationId, status
  await conn.query(`
    UPDATE sellingpoint SET locationId = 'loc_bel', floorId = 'floor_bel_g', category = 'Silk', status = 1 WHERE id = 'sp_bel_01';
    UPDATE sellingpoint SET locationId = 'loc_bel', floorId = 'floor_bel_g', category = 'Silk', status = 1 WHERE id = 'sp_bel_02';
    UPDATE sellingpoint SET locationId = 'loc_bel', floorId = 'floor_bel_1', category = 'Fabrics', status = 1 WHERE id = 'sp_bel_03';
    UPDATE retail_sales_transaction SET locationId = 'loc_bel' WHERE locationId = '' OR locationId IS NULL;
    UPDATE retail_billing_session SET locationId = 'loc_bel' WHERE locationId = '' OR locationId IS NULL;
  `);

  // 2. Insert additional showroom counters to reach 7 counters
  await conn.query(`
    INSERT INTO sellingpoint (id, name, code, category, targetAmount, status, locationId, floorId, sectionId, createdAt, updatedAt)
    VALUES
      ('sp_bel_04', "Men's Suiting Terminal 2", 'CTR-BEL-102', 'Suiting', 150000.00, 1, 'loc_bel', 'floor_bel_1', 'sec_shirting', NOW(3), NOW(3)),
      ('sp_bel_05', 'Kids & Ethnic Wear Counter 1', 'CTR-BEL-201', 'Kids', 120000.00, 1, 'loc_bel', 'floor_bel_2', 'sec_kanchi', NOW(3), NOW(3)),
      ('sp_bel_06', "Bridal & Women's Counter 2", 'CTR-BEL-202', 'Bridal', 250000.00, 1, 'loc_bel', 'floor_bel_2', 'sec_kanchi', NOW(3), NOW(3)),
      ('sp_bel_07', 'Central Cashier & POS Terminal 1', 'CTR-BEL-003', 'Billing', 500000.00, 1, 'loc_bel', 'floor_bel_g', 'sec_kanchi', NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE floorId = VALUES(floorId), category = VALUES(category), status = VALUES(status);
  `);
  console.log('Selling points updated/inserted.');

  // 3. Assign employees to departments and floors
  await conn.query(`
    UPDATE employee SET departmentId = 'dept_sarees', floorId = 'floor_bel_g' WHERE id IN ('emp-demo-100201', 'emp-demo-100202', 'emp-demo-100203');
    UPDATE employee SET departmentId = 'dept_mens', floorId = 'floor_bel_1' WHERE id IN ('emp-demo-100204', 'emp-demo-100205', 'emp_ex_001');
    UPDATE employee SET departmentId = 'dept_womens', floorId = 'floor_bel_2' WHERE id IN ('emp-demo-100206', 'emp_admin');
  `);
  console.log('Employee departments and floors updated.');

  // 4. Seed Face Verification records
  await conn.query(`
    INSERT INTO faceverification (id, employeeId, locationId, deviceId, verifiedAt, matchPercentage, threshold, result, purpose, createdAt)
    VALUES
      ('fv_bel_01', 'emp-demo-100201', 'loc_bel', 'BIO-BEL-001', NOW(3), 94.50, 85.00, 'VERIFIED', 'attendance', NOW(3)),
      ('fv_bel_02', 'emp-demo-100202', 'loc_bel', 'BIO-BEL-001', NOW(3), 96.20, 85.00, 'VERIFIED', 'attendance', NOW(3)),
      ('fv_bel_03', 'emp-demo-100203', 'loc_bel', 'BIO-BEL-001', NOW(3), 88.75, 85.00, 'VERIFIED', 'attendance', NOW(3)),
      ('fv_bel_04', 'emp-demo-100204', 'loc_bel', 'BIO-BEL-001', NOW(3), 91.00, 85.00, 'VERIFIED', 'attendance', NOW(3)),
      ('fv_bel_05', 'emp-demo-100205', 'loc_bel', 'BIO-BEL-001', NOW(3), 86.40, 85.00, 'VERIFIED', 'attendance', NOW(3)),
      ('fv_bel_06', 'emp-demo-100206', 'loc_bel', 'BIO-BEL-001', NOW(3), 74.20, 85.00, 'FAILED', 'attendance', NOW(3)),
      ('fv_bel_07', 'emp_ex_001', 'loc_bel', 'BIO-BEL-001', NOW(3), 97.10, 85.00, 'VERIFIED', 'attendance', NOW(3))
    ON DUPLICATE KEY UPDATE matchPercentage = VALUES(matchPercentage), result = VALUES(result);
  `);
  console.log('Face verification records seeded.');

  // 5. Seed Incentive and Penalty rules
  await conn.query(`
    INSERT INTO incentiverule (id, name, description, incentiveType, calculationType, locationId, amount, targetAmount, status, createdById, effectiveFrom, createdAt, updatedAt)
    VALUES
      ('ir_sales_01', 'Monthly Sales Target Exceed Incentive', 'Cash reward for exceeding counter target', 'SALES', 'TARGET_BASED', 'loc_bel', 2500.00, 100000.00, 'ACTIVE', 'usr_admin_001', '2026-01-01', NOW(3), NOW(3)),
      ('ir_early_01', 'Early Bird Punctuality Reward', 'Incentive for zero late marks in a payroll cycle', 'EARLY_LOGIN', 'FIXED_AMOUNT', 'loc_bel', 1000.00, 0.00, 'ACTIVE', 'usr_admin_001', '2026-01-01', NOW(3), NOW(3)),
      ('ir_saree_01', 'Festive Silk Saree Volume Incentive', 'Per-piece incentive on premium silk sarees', 'INDIVIDUAL', 'FIXED_AMOUNT', 'loc_bel', 500.00, 10.00, 'ACTIVE', 'usr_admin_001', '2026-01-01', NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE status = VALUES(status), amount = VALUES(amount);
  `);

  await conn.query(`
    INSERT INTO penaltyrule (id, name, description, penaltyType, calculationType, locationId, amount, isActive, effectiveFrom, createdAt, updatedAt)
    VALUES
      ('pr_late_01', 'Late Punch Clock-in Penalty', 'Deduction per minute of unexcused late attendance', 'LATE_ARRIVAL', 'PER_MINUTE', 'loc_bel', 1.00, 1, '2026-01-01', NOW(3), NOW(3)),
      ('pr_uniform_01', 'Grooming & Uniform Non-Compliance', 'Fine for missing showroom uniform blazer/saree', 'DISCIPLINARY', 'FIXED_AMOUNT', 'loc_bel', 150.00, 1, '2026-01-01', NOW(3), NOW(3)),
      ('pr_missing_01', 'Unregistered Missing Punch Penalty', 'Penalty for failing to log out terminal punch', 'UNEXCUSED_ABSENCE', 'FIXED_AMOUNT', 'loc_bel', 200.00, 1, '2026-01-01', NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE isActive = VALUES(isActive), amount = VALUES(amount);
  `);
  console.log('Incentive and penalty rules seeded.');

  // 6. Seed attendance record for 2026-10-08 for shift-board department test
  await conn.query(`
    INSERT INTO attendance (id, employeeId, locationId, shiftId, attendanceDate, scheduledLogin, actualLogin, scheduledLogout, actualLogout, status, faceVerified, createdAt, updatedAt)
    VALUES
      ('att_fix_1008_01', 'emp-demo-100201', 'loc_bel', 'shift_gen', '2026-10-08 00:00:00', '2026-10-08 09:30:00', '2026-10-08 09:28:00', '2026-10-08 19:30:00', '2026-10-08 19:35:00', 'PRESENT', 1, NOW(3), NOW(3)),
      ('att_fix_1008_02', 'emp-demo-100204', 'loc_bel', 'shift_gen', '2026-10-08 00:00:00', '2026-10-08 09:30:00', '2026-10-08 09:25:00', '2026-10-08 19:30:00', '2026-10-08 19:32:00', 'PRESENT', 1, NOW(3), NOW(3))
    ON DUPLICATE KEY UPDATE status = VALUES(status);
  `);
  console.log('Attendance on 2026-10-08 seeded.');

  await conn.end();
  console.log('Database configuration complete.');
}
run().catch(console.error);
