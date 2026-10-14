import { pool } from '../nativeDb.js';
import { cacheService } from '../services/cacheService.js';

export async function removeHubballiLocation() {
  console.log('[removeHubballiLocation] Starting removal of Hubballi Test Hub (HUB)...');

  // 1. Find Hubballi location
  const [hubLocs]: any = await pool.query(
    `SELECT id, code, name FROM location WHERE code = 'HUB' OR name LIKE '%Hubballi%'`
  );

  if (!hubLocs || hubLocs.length === 0) {
    console.log('[removeHubballiLocation] No Hubballi location found in database. Already clean.');
    return;
  }

  const hubLocId = hubLocs[0].id;
  console.log(`[removeHubballiLocation] Found Hubballi location ID: ${hubLocId} (${hubLocs[0].name})`);

  // 2. Find Belagavi location to adopt orphaned staff
  const [belLocs]: any = await pool.query(`SELECT id, code, name FROM location WHERE code = 'BEL' LIMIT 1`);
  if (!belLocs || belLocs.length === 0) {
    throw new Error('Belagavi location (BEL) not found in database to adopt staff.');
  }
  const belLocId = belLocs[0].id;
  console.log(`[removeHubballiLocation] Target adopt location: ${belLocId} (${belLocs[0].name})`);

  // 3. Find Belagavi floor
  const [belFloors]: any = await pool.query(`SELECT id, name FROM floor WHERE locationId = ? LIMIT 1`, [belLocId]);
  const belFloorId = belFloors && belFloors.length > 0 ? belFloors[0].id : null;

  // 4. Map Belagavi departments by code
  const [belDepts]: any = await pool.query(`SELECT id, code, name FROM department WHERE locationId = ?`, [belLocId]);
  const belDeptMap = Object.fromEntries(belDepts.map((d: any) => [d.code.toUpperCase(), d.id]));

  // 5. Find Hubballi departments
  const [hubDepts]: any = await pool.query(`SELECT id, code, name FROM department WHERE locationId = ?`, [hubLocId]);
  console.log(`[removeHubballiLocation] Hubballi departments: ${hubDepts.length}`);

  // 6. Reassign employees from Hubballi to Belagavi
  const [emps]: any = await pool.query(`SELECT id, employeeCode, fullName, departmentId FROM employee WHERE locationId = ?`, [hubLocId]);
  console.log(`[removeHubballiLocation] Reassigning ${emps.length} employees to Belagavi...`);

  for (const emp of emps) {
    let targetDeptId = null;
    if (emp.departmentId) {
      const matchHubDept = hubDepts.find((d: any) => d.id === emp.departmentId);
      if (matchHubDept && belDeptMap[matchHubDept.code.toUpperCase()]) {
        targetDeptId = belDeptMap[matchHubDept.code.toUpperCase()];
      }
    }
    if (!targetDeptId && belDeptMap['SALES']) {
      targetDeptId = belDeptMap['SALES'];
    }

    await pool.query(
      `UPDATE employee SET locationId = ?, departmentId = ?, floorId = ? WHERE id = ?`,
      [belLocId, targetDeptId, belFloorId, emp.id]
    );
    console.log(`  -> Employee ${emp.employeeCode} (${emp.fullName}) reassigned to BEL`);
  }

  // 7. Reassign attendance records
  const [attUpdate]: any = await pool.query(`UPDATE attendance SET locationId = ? WHERE locationId = ?`, [belLocId, hubLocId]);
  console.log(`[removeHubballiLocation] Reassigned ${attUpdate.affectedRows} attendance records to BEL.`);

  // 8. Reassign user records if any
  const [userUpdate]: any = await pool.query(`UPDATE user SET locationId = ? WHERE locationId = ?`, [belLocId, hubLocId]);
  console.log(`[removeHubballiLocation] Reassigned ${userUpdate.affectedRows} user records to BEL.`);

  // 9. Reassign or delete shifts, rules
  await pool.query(`DELETE FROM attendancerules WHERE locationId = ?`, [hubLocId]);
  await pool.query(`DELETE FROM breakrule WHERE locationId = ?`, [hubLocId]);
  await pool.query(`DELETE FROM penaltyrule WHERE locationId = ?`, [hubLocId]);
  await pool.query(`DELETE FROM incentiverule WHERE locationId = ?`, [hubLocId]);
  await pool.query(`DELETE FROM shift WHERE locationId = ?`, [hubLocId]);

  // 10. Delete departments and floors of Hubballi
  const [deptDel]: any = await pool.query(`DELETE FROM department WHERE locationId = ?`, [hubLocId]);
  console.log(`[removeHubballiLocation] Deleted ${deptDel.affectedRows} departments of Hubballi.`);

  const [floorDel]: any = await pool.query(`DELETE FROM floor WHERE locationId = ?`, [hubLocId]);
  console.log(`[removeHubballiLocation] Deleted ${floorDel.affectedRows} floors of Hubballi.`);

  // 11. Delete the Hubballi location record itself
  const [locDel]: any = await pool.query(`DELETE FROM location WHERE id = ?`, [hubLocId]);
  console.log(`[removeHubballiLocation] Deleted location Hubballi: ${locDel.affectedRows} row deleted.`);

  // Invalidate caches
  cacheService.invalidatePrefix('locations');
  cacheService.invalidatePrefix('departments');
  console.log('[removeHubballiLocation] Successfully removed Hubballi Test Hub from database!');
}

if (process.argv[1] && process.argv[1].includes('removeHubballiLocation')) {
  removeHubballiLocation()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[removeHubballiLocation] Failed:', err);
      process.exit(1);
    });
}
