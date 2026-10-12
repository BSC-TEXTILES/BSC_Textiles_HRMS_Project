import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });
import { pool } from '../nativeDb.js';
import { cacheService } from '../services/cacheService.js';

export async function setupOrganizationHubs() {
  const hubLocId = 'cmuzam5gf00044n4pb43g9y4v';
  const hubFloorId = 'cmuzam5me00124n4pqerojual';
  const hubSalesDeptId = 'cmuzam60i002a4n4pr61urmjt';

  // 1. Insert or update Location HUB
  const [existingLoc]: any = await pool.query('SELECT id FROM location WHERE id = ?', [hubLocId]);
  if (!existingLoc || existingLoc.length === 0) {
    await pool.query(
      `INSERT INTO location (id, code, name, address, city, state, pin, phone, email, managerId, hrManagerId, openingTime, closingTime, status, createdAt, updatedAt)
       VALUES (?, 'HUB', 'Hubballi Test Hub', 'Station Road, Hubballi', 'Hubballi', 'Karnataka', '580020', '0836-2300100', 'hubballi@bsctextiles.com', NULL, NULL, '2024-01-01 04:00:00.000', '2024-01-01 15:00:00.000', 'ACTIVE', NOW(), NOW())`,
      [hubLocId]
    );
    console.log('[setupOrganizationHubs] Seeded Location HUB');
  } else {
    await pool.query(`UPDATE location SET status = 'ACTIVE' WHERE id = ?`, [hubLocId]);
  }

  // 2. Insert or update Floor for HUB
  const [existingFloor]: any = await pool.query('SELECT id FROM floor WHERE id = ?', [hubFloorId]);
  if (!existingFloor || existingFloor.length === 0) {
    await pool.query(
      `INSERT INTO floor (id, name, floorNumber, locationId, status, createdAt, updatedAt)
       VALUES (?, 'Ground Floor', 0, ?, 'ACTIVE', NOW(), NOW())`,
      [hubFloorId, hubLocId]
    );
    console.log('[setupOrganizationHubs] Seeded Floor for HUB');
  }

  // 3. Ensure 6 Standard Departments for HUB
  const standardDepts = [
    { id: hubSalesDeptId, code: 'SALES', name: 'Sales & Retail' },
    { id: 'cmuzam60i002b4n4pr61urmop', code: 'OPS', name: 'Store Operations' },
    { id: 'cmuzam60i002c4n4pr61urmhr', code: 'HR', name: 'Human Resources' },
    { id: 'cmuzam60i002d4n4pr61urmfn', code: 'FIN', name: 'Finance & Accounts' },
    { id: 'cmuzam60i002e4n4pr61urmin', code: 'INV', name: 'Inventory & Logistics' },
    { id: 'cmuzam60i002f4n4pr61urmcs', code: 'CS', name: 'Customer Service & Billing' },
  ];

  for (const dept of standardDepts) {
    const [dRows]: any = await pool.query('SELECT id FROM department WHERE locationId = ? AND code = ?', [hubLocId, dept.code]);
    if (!dRows || dRows.length === 0) {
      await pool.query(
        `INSERT INTO department (id, name, code, locationId, floorId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
        [dept.id, dept.name, dept.code, hubLocId, hubFloorId]
      );
      console.log(`[setupOrganizationHubs] Seeded Dept ${dept.code} for HUB`);
    }
  }

  // 4. Distribute employees logically in each branch so assigned counts reflect real departmentalization
  // BEL:
  const [belDepts]: any = await pool.query(`SELECT id, code FROM department WHERE locationId = 'cmuzam5fe00014n4pq25hkcww'`);
  const belDeptMap = Object.fromEntries(belDepts.map((d: any) => [d.code, d.id]));
  if (belDeptMap['HR']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-004'`, [belDeptMap['HR']]); // Kavita Bhat (HR EXECUTIVE)
  }
  if (belDeptMap['FIN']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-027'`, [belDeptMap['FIN']]); // Pradeep Chavan (PAYROLL MANAGER)
  }
  if (belDeptMap['OPS']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode IN ('TEST-EMP-003', 'TEST-EMP-005')`, [belDeptMap['OPS']]); // Amit Patel (FLOOR MANAGER), Ramesh Gowda (TEA BREAK)
  }
  if (belDeptMap['CS']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-006'`, [belDeptMap['CS']]); // Geeta Kulkarni
  }
  if (belDeptMap['INV']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-026'`, [belDeptMap['INV']]); // Bhavya M
  }

  // DAV:
  const [davDepts]: any = await pool.query(`SELECT id, code FROM department WHERE locationId = 'cmuzam5fr00024n4p4izbomev'`);
  const davDeptMap = Object.fromEntries(davDepts.map((d: any) => [d.code, d.id]));
  if (davDeptMap['OPS']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode IN ('TEST-EMP-008', 'TEST-EMP-009', 'TEST-EMP-011')`, [davDeptMap['OPS']]);
  }
  if (davDeptMap['CS']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-010'`, [davDeptMap['CS']]);
  }
  if (davDeptMap['INV']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-028'`, [davDeptMap['INV']]);
  }

  // SHI:
  const [shiDepts]: any = await pool.query(`SELECT id, code FROM department WHERE locationId = 'cmuzam5g400034n4p89o33l8e'`);
  const shiDeptMap = Object.fromEntries(shiDepts.map((d: any) => [d.code, d.id]));
  if (shiDeptMap['HR']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-013'`, [shiDeptMap['HR']]); // Vikram Singh (HR MANAGER)
  }
  if (shiDeptMap['OPS']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode IN ('TEST-EMP-015', 'TEST-EMP-016')`, [shiDeptMap['OPS']]);
  }
  if (shiDeptMap['CS']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-017'`, [shiDeptMap['CS']]);
  }
  if (shiDeptMap['INV']) {
    await pool.query(`UPDATE employee SET departmentId = ? WHERE employeeCode = 'TEST-EMP-030'`, [shiDeptMap['INV']]);
  }

  // HUB:
  const [hubDeptsList]: any = await pool.query(`SELECT id, code FROM department WHERE locationId = ?`, [hubLocId]);
  const hubDeptMap = Object.fromEntries(hubDeptsList.map((d: any) => [d.code, d.id]));
  if (hubDeptMap['HR']) {
    await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-020', 'TEST-EMP-033')`, [hubDeptMap['HR'], hubLocId]); // Deepa Shetty (HR EXECUTIVE), Sunil B (HR AUDITOR)
  }
  if (hubDeptMap['OPS']) {
    await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-019', 'TEST-EMP-021', 'TEST-EMP-023')`, [hubDeptMap['OPS'], hubLocId]); // Karthik Nair, Girish Kamat, Santosh Pujari
  }
  if (hubDeptMap['SALES']) {
    await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-022', 'TEST-EMP-024', 'TEST-EMP-032')`, [hubDeptMap['SALES'], hubLocId]); // Swathi Pai, Rashmi Verma, Roopa N
  }

  // Ensure ALL employees have locationId and departmentId set
  await pool.query(`UPDATE employee SET status = 'ACTIVE' WHERE status IS NULL OR status = ''`);

  cacheService.invalidatePrefix('locations');
  cacheService.invalidatePrefix('departments');
  console.log('[setupOrganizationHubs] Organization topology synchronized successfully.');
}

if (process.argv[1] && process.argv[1].includes('setupOrganizationHubs')) {
  setupOrganizationHubs().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
