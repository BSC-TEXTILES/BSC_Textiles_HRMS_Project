import { pool } from '../nativeDb.js';

export async function seedFloorManagerData() {
  console.log('--- Initializing Floor Managers and Floor Payroll Distribution ---');

  // 1. Fetch floors with location codes
  const [floors]: any = await pool.query(`
    SELECT f.id, f.floorNumber, f.name, l.code as locCode
    FROM floor f
    JOIN location l ON f.locationId = l.id
    ORDER BY l.code, f.floorNumber
  `);

  // Map of location code + floorNumber -> user email
  const floorManagerMapping: Record<string, string> = {
    'BEL_0': 'amit.patel@bsctextiles.com',       // Ground Floor BEL
    'BEL_1': 'girish.kamat@bsctextiles.com',     // First Floor BEL
    'BEL_2': 'ramesh.gowda@bsctextiles.com',     // Second Floor BEL
    'BEL_3': 'karthik.nair@bsctextiles.com',     // Third Floor BEL

    'DAV_0': 'manjunath.hebbar@bsctextiles.com', // Ground Floor DAV
    'DAV_1': 'prakash.g@bsctextiles.com',        // First Floor DAV
    'DAV_2': 'suresh.reddy@bsctextiles.com',     // Second Floor DAV
    'DAV_3': 'vinutha.k@bsctextiles.com',        // Third Floor DAV

    'SHI_0': 'raghav.prasad@bsctextiles.com',    // Ground Floor SHI
    'SHI_1': 'harish.v@bsctextiles.com',         // First Floor SHI
    'SHI_2': 'mohan.das@bsctextiles.com',        // Second Floor SHI
    'SHI_3': 'vijay.k@bsctextiles.com',          // Third Floor SHI
  };

  for (const fl of floors) {
    const key = `${fl.locCode}_${fl.floorNumber}`;
    const email = floorManagerMapping[key];
    if (email) {
      const [uRows]: any = await pool.query('SELECT id FROM user WHERE email = ?', [email]);
      if (uRows.length > 0) {
        await pool.query('UPDATE floor SET floorManagerId = ? WHERE id = ?', [uRows[0].id, fl.id]);
        console.log(`Assigned ${email} as Floor Manager to [${fl.locCode}] ${fl.name}`);
      }
    }
  }

  // 2. Distribute employees in each location across their location's floors if null or clustered
  // Find floors per location
  const [belFloors]: any = await pool.query("SELECT f.id FROM floor f JOIN location l ON f.locationId = l.id WHERE l.code = 'BEL' ORDER BY f.floorNumber");
  const [davFloors]: any = await pool.query("SELECT f.id FROM floor f JOIN location l ON f.locationId = l.id WHERE l.code = 'DAV' ORDER BY f.floorNumber");
  const [shiFloors]: any = await pool.query("SELECT f.id FROM floor f JOIN location l ON f.locationId = l.id WHERE l.code = 'SHI' ORDER BY f.floorNumber");

  // Distribute BEL employees evenly across BEL floors
  const [belEmps]: any = await pool.query("SELECT id FROM employee WHERE locationId = (SELECT id FROM location WHERE code = 'BEL')");
  for (let i = 0; i < belEmps.length; i++) {
    const targetFloorId = belFloors[i % belFloors.length]?.id;
    if (targetFloorId) {
      await pool.query('UPDATE employee SET floorId = ? WHERE id = ?', [targetFloorId, belEmps[i].id]);
    }
  }

  // Distribute DAV employees evenly across DAV floors
  const [davEmps]: any = await pool.query("SELECT id, employeeCode FROM employee WHERE locationId = (SELECT id FROM location WHERE code = 'DAV')");
  for (let i = 0; i < davEmps.length; i++) {
    // If Sadashiva (1372), assign to Third Floor (where KIDS wear section is)
    let targetFloorId: string;
    if (davEmps[i].employeeCode === '1372' && davFloors.length > 3) {
      targetFloorId = davFloors[3].id; // Third Floor
    } else {
      targetFloorId = davFloors[i % davFloors.length]?.id;
    }
    if (targetFloorId) {
      await pool.query('UPDATE employee SET floorId = ? WHERE id = ?', [targetFloorId, davEmps[i].id]);
    }
  }

  // Distribute SHI employees evenly across SHI floors
  const [shiEmps]: any = await pool.query("SELECT id FROM employee WHERE locationId = (SELECT id FROM location WHERE code = 'SHI')");
  for (let i = 0; i < shiEmps.length; i++) {
    const targetFloorId = shiFloors[i % shiFloors.length]?.id;
    if (targetFloorId) {
      await pool.query('UPDATE employee SET floorId = ? WHERE id = ?', [targetFloorId, shiEmps[i].id]);
    }
  }

  // Distribute employees across sections within their assigned floor
  const [allActiveEmps]: any = await pool.query('SELECT id, floorId, employeeCode FROM employee WHERE floorId IS NOT NULL');
  for (const emp of allActiveEmps) {
    if (emp.employeeCode === '1372') {
      // Find KIDS section in DAV
      const [kidsSec]: any = await pool.query("SELECT id FROM section WHERE name LIKE '%Kids%' AND locationId = (SELECT id FROM location WHERE code = 'DAV') LIMIT 1");
      if (kidsSec.length > 0) {
        await pool.query('UPDATE employee SET sectionId = ? WHERE id = ?', [kidsSec[0].id, emp.id]);
        continue;
      }
    }
    const [secRows]: any = await pool.query('SELECT id FROM section WHERE floorId = ? ORDER BY id', [emp.floorId]);
    if (secRows.length > 0) {
      // pick a section based on hash/id
      const assignedSecId = secRows[Math.abs(emp.id.charCodeAt(emp.id.length - 1)) % secRows.length].id;
      await pool.query('UPDATE employee SET sectionId = ? WHERE id = ?', [assignedSecId, emp.id]);
    }
  }

  // 3. Backfill & normalize payrollitem data for August 2026
  await pool.query(`
    UPDATE payrollitem pi
    JOIN employee e ON pi.employeeId = e.id
    JOIN location l ON e.locationId = l.id
    LEFT JOIN floor f ON e.floorId = f.id
    SET 
      pi.salaryMonth = COALESCE(pi.salaryMonth, 'Aug'),
      pi.salaryYear = COALESCE(pi.salaryYear, 2026),
      pi.locationCode = COALESCE(pi.locationCode, l.code, 'DAV'),
      pi.grossSalary = CASE 
        WHEN pi.grossSalary > 0 THEN pi.grossSalary 
        ELSE (pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0) + COALESCE(pi.overtime, 0))
      END,
      pi.totalEarnings = CASE 
        WHEN pi.totalEarnings > 0 THEN pi.totalEarnings 
        ELSE (pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0) + COALESCE(pi.overtime, 0))
      END,
      pi.totalDeductions = CASE 
        WHEN pi.totalDeductions > 0 THEN pi.totalDeductions 
        ELSE COALESCE(pi.deductions, 0)
      END,
      pi.totalPayable = CASE 
        WHEN pi.totalPayable > 0 THEN pi.totalPayable 
        ELSE pi.netPay 
      END,
      pi.employeePf = CASE 
        WHEN pi.employeePf > 0 THEN pi.employeePf 
        ELSE ROUND(pi.basicSalary * 0.12)
      END,
      pi.employeeEsi = CASE 
        WHEN pi.employeeEsi > 0 THEN pi.employeeEsi 
        WHEN (pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0)) <= 21000 
          THEN ROUND((pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0)) * 0.0075)
        ELSE 0
      END,
      pi.employerPf = CASE 
        WHEN pi.employerPf > 0 THEN pi.employerPf 
        ELSE ROUND(pi.basicSalary * 0.12)
      END,
      pi.employerEsi = CASE 
        WHEN pi.employerEsi > 0 THEN pi.employerEsi 
        WHEN (pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0)) <= 21000 
          THEN ROUND((pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0)) * 0.0325)
        ELSE 0
      END,
      pi.ctc = CASE 
        WHEN pi.ctc > 0 THEN pi.ctc 
        ELSE (
          (pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0)) + 
          ROUND(pi.basicSalary * 0.12) + 
          CASE WHEN (pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0)) <= 21000 
            THEN ROUND((pi.basicSalary + COALESCE(pi.earlyIncentive, 0) + COALESCE(pi.attendanceIncentive, 0)) * 0.0325) 
            ELSE 0 
          END
        )
      END
    WHERE pi.id != 'pi_bsc_1372_aug2026'
  `);

  console.log('Floor managers assigned, employees distributed across floors, and payroll records normalized!');
}

if (process.argv[1]?.includes('seedFloorManagerData')) {
  seedFloorManagerData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
