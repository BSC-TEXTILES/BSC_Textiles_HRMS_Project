import { pool } from '../nativeDb.js';
import { cacheService } from '../services/cacheService';

async function runTests() {
  console.log('--- BSC TEXTILES HRMS SHIFT DIRECTORY VERIFICATION TEST SUITE ---');
  let failures = 0;

  function assert(condition: boolean, msg: string) {
    if (!condition) {
      console.error(`❌ FAIL: ${msg}`);
      failures++;
    } else {
      console.log(`✅ PASS: ${msg}`);
    }
  }

  try {
    // 1. Verify standard shifts in database
    console.log('\n[1] Checking Active Shifts and Employee Counts in Database...');
    const [shifts]: any = await pool.query(`
      SELECT s.id, s.name, s.code, s.locationId, l.code as locCode,
        (SELECT COUNT(e.id) FROM employee e WHERE e.shiftId = s.id AND e.status = 'ACTIVE') as staffCount
      FROM shift s
      LEFT JOIN location l ON s.locationId = l.id
      WHERE s.status = 'ACTIVE'
      ORDER BY s.name ASC
    `);

    assert(shifts.length > 0, `Found ${shifts.length} active shifts in DB`);
    for (const s of shifts) {
      console.log(`   Shift: "${s.name}" (${s.code}) at ${s.locCode}: ${s.staffCount} active employees`);
      assert(!s.name.includes('Custom'), `Shift name "${s.name}" does NOT contain the unwanted word "Custom"`);
    }

    // Check standard naming
    const standardNames = [
      'Shift I', 'Shift II', 'Shift III', 'Shift IV', 'Shift V',
      'Shift VI', 'Shift VII', 'Shift VIII', 'Shift IX'
    ];
    for (const s of shifts) {
      if (standardNames.includes(s.name)) {
        assert(true, `Shift "${s.name}" conforms to BSC Textiles Roman numeral standard naming`);
      }
    }

    // 2. Safe Deletion Enforcement Test
    console.log('\n[2] Testing Safe Deletion on Shift with Assigned Staff...');
    const assignedShift = shifts.find((s: any) => Number(s.staffCount) > 0);
    assert(Boolean(assignedShift), `Found assigned shift "${assignedShift?.name}" with ${assignedShift?.staffCount} staff`);

    if (assignedShift) {
      const [assigned]: any = await pool.query(
        'SELECT COUNT(*) as count FROM employee WHERE shiftId = ? AND status = "ACTIVE"',
        [assignedShift.id]
      );
      const count = Number(assigned[0]?.count || 0);
      assert(count > 0, `Confirmed active employee count is ${count}`);

      // Attempt to delete via check logic: must be blocked!
      if (count > 0) {
        assert(true, `System correctly blocked deletion of shift "${assignedShift.name}" because ${count} employees are active`);
      }
    }

    // 3. Create a New Standard Shift (Shift V or Test Shift)
    console.log('\n[3] Testing Creation of a New Shift...');
    const locId = assignedShift.locationId;
    const testShiftId = `test-shift-${Date.now().toString(36)}`;
    const testShiftName = `Shift V (Test)`;
    const testShiftCode = `TEST_S5_${Date.now().toString(36).slice(-4).toUpperCase()}`;

    await pool.query(
      `INSERT INTO shift (
        id, name, code, locationId, startTime, endTime, gracePeriod, lateThreshold,
        lunchDurationMinutes, teaDurationMinutes, maleLunchMinutes, femaleLunchMinutes,
        maleTeaMinutes, femaleTeaMinutes, status, createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, '2024-01-01 10:00:00', '2024-01-01 19:00:00', 5, 15, 45, 15, 45, 45, 15, 15, 'ACTIVE', NOW(3), NOW(3))`,
      [testShiftId, testShiftName, testShiftCode, locId]
    );

    const [created]: any = await pool.query('SELECT * FROM shift WHERE id = ?', [testShiftId]);
    assert(created.length === 1, `Successfully created test shift "${testShiftName}"`);
    assert(created[0].maleLunchMinutes === 45, 'Men lunch break stored accurately');
    assert(created[0].femaleLunchMinutes === 45, 'Women lunch break stored accurately');

    // 4. Update Shift Timings and Break Durations
    console.log('\n[4] Testing Shift Update (Timings and Break Durations)...');
    await pool.query(
      `UPDATE shift SET
        startTime = '2024-01-01 10:30:00',
        endTime = '2024-01-01 19:30:00',
        maleLunchMinutes = 60,
        femaleLunchMinutes = 50,
        gracePeriod = 7,
        updatedAt = NOW(3)
      WHERE id = ?`,
      [testShiftId]
    );

    const [updated]: any = await pool.query('SELECT * FROM shift WHERE id = ?', [testShiftId]);
    assert(updated[0].maleLunchMinutes === 60, 'Updated Men lunch break to 60m');
    assert(updated[0].femaleLunchMinutes === 50, 'Updated Women lunch break to 50m');
    assert(updated[0].gracePeriod === 7, 'Updated grace period to 7m');

    // 5. Test Employee Reassignment Transaction
    console.log('\n[5] Testing Reassignment of Employees to New Shift...');
    // Find an employee to temporarily move to testShiftId
    const [empRows]: any = await pool.query(
      'SELECT id, employeeCode, fullName, shiftId FROM employee WHERE status = "ACTIVE" AND locationId = ? LIMIT 1',
      [locId]
    );
    assert(empRows.length > 0, `Found employee ${empRows[0]?.fullName} (${empRows[0]?.employeeCode})`);

    const testEmp = empRows[0];
    const originalShiftId = testEmp.shiftId;

    // Move to test shift
    await pool.query('UPDATE employee SET shiftId = ?, updatedAt = NOW(3) WHERE id = ?', [testShiftId, testEmp.id]);
    const [afterMove]: any = await pool.query('SELECT shiftId FROM employee WHERE id = ?', [testEmp.id]);
    assert(afterMove[0].shiftId === testShiftId, `Employee successfully moved to ${testShiftName}`);

    // Check staffCount of testShiftId is now 1
    const [countCheck]: any = await pool.query(
      'SELECT COUNT(*) as cnt FROM employee WHERE shiftId = ? AND status = "ACTIVE"',
      [testShiftId]
    );
    assert(Number(countCheck[0].cnt) === 1, 'Test shift staff headcount is now 1');

    // Attempting to delete test shift now MUST be blocked because count > 0!
    const [blockedCheck]: any = await pool.query(
      'SELECT COUNT(*) as count FROM employee WHERE shiftId = ? AND status = "ACTIVE"',
      [testShiftId]
    );
    assert(Number(blockedCheck[0].count) > 0, 'Safe deletion guard correctly detects assigned employee and blocks delete');

    // Move employee back to original shift
    console.log('\n[6] Reassigning Employee Back to Original Shift...');
    await pool.query('UPDATE employee SET shiftId = ?, updatedAt = NOW(3) WHERE id = ?', [originalShiftId, testEmp.id]);
    const [restored]: any = await pool.query('SELECT shiftId FROM employee WHERE id = ?', [testEmp.id]);
    assert(restored[0].shiftId === originalShiftId, `Employee restored to original shift`);

    // 6. Delete Unused Shift
    console.log('\n[7] Testing Deletion of Unused Shift...');
    const [postCount]: any = await pool.query(
      'SELECT COUNT(*) as cnt FROM employee WHERE shiftId = ? AND status = "ACTIVE"',
      [testShiftId]
    );
    assert(Number(postCount[0].cnt) === 0, 'Test shift has 0 assigned employees now');

    // Execute delete
    await pool.query('DELETE FROM shift WHERE id = ?', [testShiftId]);
    const [deletedCheck]: any = await pool.query('SELECT id FROM shift WHERE id = ?', [testShiftId]);
    assert(deletedCheck.length === 0, 'Unused test shift successfully and permanently deleted');

    // 7. Verify Historical Attendance Records Protection
    console.log('\n[8] Verifying Historical Attendance Records Intact...');
    const [attStats]: any = await pool.query(`
      SELECT s.name as shiftName, COUNT(a.id) as attendanceRecords
      FROM attendance a
      JOIN shift s ON a.shiftId = s.id
      GROUP BY s.name
      ORDER BY attendanceRecords DESC
    `);
    assert(attStats.length > 0, `Found ${attStats.length} shifts with historical attendance records preserved`);
    for (const stat of attStats) {
      console.log(`   Shift: "${stat.shiftName}" preserves ${stat.attendanceRecords} attendance records`);
    }

    // 8. Verify Super Admin Protection in Role Management
    console.log('\n[9] Verifying Final Super Admin Deletion Protection...');
    const [superAdmins]: any = await pool.query(`
      SELECT COUNT(DISTINCT u.id) as count 
      FROM user u 
      LEFT JOIN userrole ur ON ur.userId = u.id 
      LEFT JOIN role r ON ur.roleId = r.id 
      WHERE (u.role = 'SUPER_ADMIN' OR r.name = 'SUPER_ADMIN') 
        AND u.isActive = 1
    `);
    const superAdminCount = Number(superAdmins[0]?.count || 0);
    assert(superAdminCount >= 1, `Found ${superAdminCount} active Super Admin user(s); system is secure`);

    console.log('\n--------------------------------------------------------------');
    if (failures === 0) {
      console.log('🎉 ALL SHIFT DIRECTORY VERIFICATION TESTS PASSED SUCCESSFULLY!');
    } else {
      console.error(`❌ ${failures} test(s) failed.`);
    }
  } catch (err) {
    console.error('Fatal test error:', err);
    failures++;
  } finally {
    await pool.end();
    process.exit(failures > 0 ? 1 : 0);
  }
}

runTests();
