import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });
import { pool } from '../nativeDb.js';
import { cacheService } from '../services/cacheService.js';

export async function setupOrganizationHubs() {
  // Query actual active locations: BEL, DAV, SHI
  const [locations]: any = await pool.query(`SELECT id, code FROM location WHERE code IN ('BEL', 'DAV', 'SHI')`);
  const locMap = Object.fromEntries(locations.map((l: any) => [l.code, l.id]));

  const belLocId = locMap['BEL'];
  const davLocId = locMap['DAV'];
  const shiLocId = locMap['SHI'];

  if (belLocId) {
    const [belDepts]: any = await pool.query(`SELECT id, code FROM department WHERE locationId = ?`, [belLocId]);
    const belDeptMap = Object.fromEntries(belDepts.map((d: any) => [d.code, d.id]));
    if (belDeptMap['HR']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-004', 'TEST-EMP-020', 'TEST-EMP-033')`, [belDeptMap['HR'], belLocId]);
    }
    if (belDeptMap['FIN']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-027'`, [belDeptMap['FIN'], belLocId]);
    }
    if (belDeptMap['OPS']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-003', 'TEST-EMP-005', 'TEST-EMP-019', 'TEST-EMP-021', 'TEST-EMP-023')`, [belDeptMap['OPS'], belLocId]);
    }
    if (belDeptMap['CS']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-006'`, [belDeptMap['CS'], belLocId]);
    }
    if (belDeptMap['INV']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-026'`, [belDeptMap['INV'], belLocId]);
    }
    if (belDeptMap['SALES']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-022', 'TEST-EMP-024', 'TEST-EMP-032')`, [belDeptMap['SALES'], belLocId]);
    }
  }

  if (davLocId) {
    const [davDepts]: any = await pool.query(`SELECT id, code FROM department WHERE locationId = ?`, [davLocId]);
    const davDeptMap = Object.fromEntries(davDepts.map((d: any) => [d.code, d.id]));
    if (davDeptMap['OPS']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-008', 'TEST-EMP-009', 'TEST-EMP-011')`, [davDeptMap['OPS'], davLocId]);
    }
    if (davDeptMap['CS']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-010'`, [davDeptMap['CS'], davLocId]);
    }
    if (davDeptMap['INV']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-028'`, [davDeptMap['INV'], davLocId]);
    }
  }

  if (shiLocId) {
    const [shiDepts]: any = await pool.query(`SELECT id, code FROM department WHERE locationId = ?`, [shiLocId]);
    const shiDeptMap = Object.fromEntries(shiDepts.map((d: any) => [d.code, d.id]));
    if (shiDeptMap['HR']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-013'`, [shiDeptMap['HR'], shiLocId]);
    }
    if (shiDeptMap['OPS']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode IN ('TEST-EMP-015', 'TEST-EMP-016')`, [shiDeptMap['OPS'], shiLocId]);
    }
    if (shiDeptMap['CS']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-017'`, [shiDeptMap['CS'], shiLocId]);
    }
    if (shiDeptMap['INV']) {
      await pool.query(`UPDATE employee SET departmentId = ?, locationId = ? WHERE employeeCode = 'TEST-EMP-030'`, [shiDeptMap['INV'], shiLocId]);
    }
  }

  // Ensure ALL employees have locationId and departmentId set
  await pool.query(`UPDATE employee SET status = 'ACTIVE' WHERE status IS NULL OR status = ''`);

  // Ensure an active Night Shift exists for each hub for overnight roster scheduling
  for (const loc of [
    { id: 'cmuzam5fe00014n4pq25hkcww', code: 'BEL' },
    { id: 'cmuzam5fr00024n4p4izbomev', code: 'DAV' },
    { id: 'cmuzam5g400034n4p89o33l8e', code: 'SHI' },
  ]) {
    const [existingNight]: any = await pool.query('SELECT id FROM shift WHERE locationId = ? AND code = ?', [loc.id, 'NIGHT']);
    if (!existingNight || existingNight.length === 0) {
      await pool.query(
        `INSERT INTO shift (id, name, code, locationId, startTime, endTime, gracePeriod, lateThreshold, status, createdAt, updatedAt)
         VALUES (?, 'Night Shift', 'NIGHT', ?, '2024-01-01 22:00:00.000', '2024-01-02 06:00:00.000', 5, 15, 'ACTIVE', NOW(), NOW())`,
        [`shift-night-${loc.code.toLowerCase()}`, loc.id]
      );
      console.log(`[setupOrganizationHubs] Seeded Night Shift for ${loc.code}`);
    }
  }

  cacheService.invalidatePrefix('locations');
  cacheService.invalidatePrefix('departments');
  console.log('[setupOrganizationHubs] Organization topology (BEL, DAV, SHI) synchronized successfully.');
}

if (process.argv[1] && process.argv[1].includes('setupOrganizationHubs')) {
  setupOrganizationHubs().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
