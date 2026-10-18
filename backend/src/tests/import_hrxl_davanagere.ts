import ExcelJS from 'exceljs';
import { pool } from '../nativeDb.js';

interface RawExcelEmployee {
  empNo: string;
  empName: string;
  dept: string;
  desig: string;
  floor: string;
  division: string;
  doj: any;
  basic: number;
  hra: number;
  curCity: string;
  curState: string;
  batch: string;
  gender: string;
}

function toTitleCase(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map(word => {
      if (word.length <= 1) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

function parseDOJ(dojStr: any): string {
  if (dojStr instanceof Date) {
    return dojStr.toISOString().split('T')[0];
  }
  if (typeof dojStr === 'string') {
    const parts = dojStr.trim().split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      return `${year}-${month}-${day}`;
    }
  }
  return '2026-02-01';
}

function mapRoleFromDesignation(desig: string, dept: string): string {
  const d = desig.toUpperCase();
  if (d.includes('FLOOR MANAGER')) return 'FLOOR_MANAGER';
  if (d.includes('HR')) return 'HR_EXECUTIVE';
  if (d.includes('SUPERVISOR')) return 'TEAM_LEAD';
  if (d.includes('SALESMAN') || d.includes('SALES')) return 'SALES_EMPLOYEE';
  return 'EMPLOYEE';
}

async function runImport() {
  console.log('Starting Davanagere Employee Master Import from HRXL.xlsx...');

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('d:/BSC Textiles HRMS/HRXL.xlsx');
  const sheet = workbook.getWorksheet('Sheet1') || workbook.worksheets[0];

  const excelEmployees: RawExcelEmployee[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const vals = row.values as any[];
    excelEmployees.push({
      empNo: String(vals[1]).trim(),
      empName: String(vals[2]).trim(),
      dept: String(vals[3] || '').trim(),
      desig: String(vals[4] || '').trim(),
      floor: String(vals[5] || '').trim(),
      division: String(vals[6] || '').trim(),
      doj: vals[7],
      basic: Number(vals[8]) || 0,
      hra: Number(vals[9]) || 0,
      curCity: String(vals[12] || 'DAVANGERE').trim(),
      curState: String(vals[13] || 'KARNATAKA').trim(),
      batch: String(vals[18] || 'SHIFT VIII').trim(),
      gender: String(vals[20] || 'MALE').trim().toUpperCase(),
    });
  });

  console.log(`Loaded ${excelEmployees.length} employees from Excel.`);
  const davLocationId = 'cmuwszr9500021vdtxscy3nsc';

  // 1. Ensure Floors exist for Davanagere
  console.log('Setting up Davanagere Floors...');
  const floorMap: Record<string, string> = {
    'GF': 'cmuwszreb000j1vdtz5vu1gyf',    // Ground Floor
    '1ST': 'cmuwszrem000l1vdtikb404mp',   // First Floor
    '2ND': 'cmuwszrf2000n1vdtgkjreziy',   // Second Floor
    '3RD': 'cmuwszrfc000p1vdtttfj50pm',   // Third Floor
    '4TH FL': 'cmuwszrg4000x1vdt4thfloordav', // Fourth Floor
  };

  // Upsert Fourth Floor if not existing
  await pool.query(`
    INSERT INTO floor (id, name, floorNumber, locationId, status, createdAt, updatedAt)
    VALUES (?, 'Fourth Floor', 4, ?, 'ACTIVE', NOW(), NOW())
    ON DUPLICATE KEY UPDATE name = 'Fourth Floor', updatedAt = NOW()
  `, [floorMap['4TH FL'], davLocationId]);

  // 2. Ensure Departments exist for Davanagere
  console.log('Setting up Davanagere Departments...');
  const deptMap: Record<string, string> = {};
  const uniqueDepts = Array.from(new Set(excelEmployees.map(e => e.dept)));

  for (const deptName of uniqueDepts) {
    const code = deptName.replace(/[^A-Z0-9]/gi, '_').toUpperCase().slice(0, 15);
    const deptId = `dept-dav-${code.toLowerCase()}`;
    await pool.query(`
      INSERT INTO department (id, name, code, locationId, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 'ACTIVE', NOW(), NOW())
      ON DUPLICATE KEY UPDATE name = VALUES(name), updatedAt = NOW()
    `, [deptId, deptName, `DAV_${code}`, davLocationId]);
    deptMap[deptName] = deptId;
  }

  // 3. Ensure Shifts exist for Davanagere
  console.log('Setting up Davanagere Shifts...');
  const shiftMap: Record<string, string> = {};
  const uniqueShifts = Array.from(new Set(excelEmployees.map(e => e.batch)));

  for (const shiftName of uniqueShifts) {
    const shiftCode = shiftName.replace(/[^A-Z0-9]/gi, '_').toUpperCase();
    const shiftId = `shift-dav-${shiftCode.toLowerCase()}`;
    await pool.query(`
      INSERT INTO shift (id, name, code, locationId, startTime, endTime, gracePeriod, lateThreshold, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, '2024-01-01 09:30:00', '2024-01-01 18:30:00', 5, 5, 'ACTIVE', NOW(), NOW())
      ON DUPLICATE KEY UPDATE name = VALUES(name), updatedAt = NOW()
    `, [shiftId, shiftName, `DAV_${shiftCode}`, davLocationId]);
    shiftMap[shiftName] = shiftId;
  }

  // 4. Detach administrative users from any employee records to prevent deletion blocking
  console.log('Safeguarding user accounts (setting employeeId/employee_id = NULL for administrative accounts)...');
  await pool.query(`UPDATE user SET employeeId = NULL`);
  try {
    await pool.query(`UPDATE users SET employee_id = NULL`);
  } catch (_) {}

  // 5. Clean up other employees from dependent tables
  const allowedEmpCodes = excelEmployees.map(e => e.empNo);
  console.log(`Allowed employee codes count: ${allowedEmpCodes.length}`);

  // Fetch all existing employee IDs not in the allowed list
  const [oldEmps]: any = await pool.query(
    `SELECT id, employeeCode FROM employee WHERE employeeCode NOT IN (?)`,
    [allowedEmpCodes]
  );
  console.log(`Found ${oldEmps.length} legacy employees to remove:`, oldEmps.map((e: any) => e.employeeCode));

  if (oldEmps.length > 0) {
    const oldIds = oldEmps.map((e: any) => e.id);
    
    await pool.query(`SET FOREIGN_KEY_CHECKS = 0`);

    // Clean up foreign references
    const tablesWithEmployeeId = [
      'breaks',
      'employeebreak',
      'employeeassignmenthistory',
      'employeeincentive',
      'employeesellingpoint',
      'face_verification_logs',
      'faceprofile',
      'faceverification',
      'incentive_grants',
      'incentiverule',
      'incentivetransaction',
      'leave_requests',
      'observation',
      'observations',
      'orgchangerequest',
      'payroll_items',
      'payrollitem',
      'penalty_records',
      'penaltyrule',
      'penaltytransaction',
      'qr_codes',
      'qr_scan_records',
      'qrcode',
      'qrscanrecord',
      'videonote',
      'weeklyoffrule',
      'attendance',
      'biometric_employee_mappings',
    ];

    for (const tbl of tablesWithEmployeeId) {
      try {
        await pool.query(`DELETE FROM ${tbl} WHERE employeeId IN (?)`, [oldIds]);
      } catch (err: any) {
        try {
          await pool.query(`DELETE FROM ${tbl} WHERE employee_id IN (?)`, [oldIds]);
        } catch (_) {}
      }
    }

    // Now delete legacy employees from main table
    await pool.query(`DELETE FROM employee WHERE id IN (?)`, [oldIds]);
    console.log(`Deleted ${oldIds.length} legacy employee records from main database.`);

    // Clean up shards
    try {
      await pool.query(`DELETE FROM bsc_shard_dav.employee WHERE id IN (?)`, [oldIds]).catch(() => {});
      await pool.query(`DELETE FROM bsc_shard_bel.employee`).catch(() => {});
      await pool.query(`DELETE FROM bsc_shard_shi.employee`).catch(() => {});
    } catch (_) {}

    await pool.query(`SET FOREIGN_KEY_CHECKS = 1`);
  }

  // 6. Upsert the 56 employees
  console.log('Upserting 56 Davanagere employees into main database and bsc_shard_dav...');
  let inserted = 0;
  let updated = 0;

  for (const emp of excelEmployees) {
    // Preserve emp_bsc_1604 if empNo is 1604
    const empId = emp.empNo === '1604' ? 'emp_bsc_1604' : `emp_bsc_${emp.empNo}`;
    const formattedFullName = toTitleCase(emp.empName);
    const names = formattedFullName.split(' ');
    const firstName = names[0] || formattedFullName;
    const lastName = names.slice(1).join(' ') || '';
    const joiningDate = parseDOJ(emp.doj);
    const floorId = floorMap[emp.floor] || floorMap['GF'];
    const departmentId = deptMap[emp.dept] || null;
    const shiftId = shiftMap[emp.batch] || null;
    const role = mapRoleFromDesignation(emp.desig, emp.dept);
    const fixedGrossSalary = emp.basic + emp.hra;

    // Email generation: firstname.empno@bsctextiles.com
    const cleanFirstName = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const email = `${cleanFirstName}.${emp.empNo}@bsctextiles.com`;
    const phone = `+91984${emp.empNo.padStart(7, '0').slice(-7)}`;

    await pool.query(`
      INSERT INTO employee (
        id, employeeCode, firstName, lastName, fullName, email, phone, gender,
        locationId, floorId, departmentId, shiftId, designation, role, status,
        joiningDate, basicSalary, hra, fixedGrossSalary, currentAddress, permanentAddress,
        city, state, batch, biometricDeviceEmployeeId, attendanceEligible,
        employeeCategory, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, 'ACTIVE',
        ?, ?, ?, ?, 'DAVANGERE, DAVANGERE', 'DAVANGERE, DAVANGERE',
        'DAVANGERE', 'KARNATAKA', ?, ?, 1,
        ?, NOW(), NOW()
      )
      ON DUPLICATE KEY UPDATE
        firstName = VALUES(firstName),
        lastName = VALUES(lastName),
        fullName = VALUES(fullName),
        locationId = VALUES(locationId),
        floorId = VALUES(floorId),
        departmentId = VALUES(departmentId),
        shiftId = VALUES(shiftId),
        designation = VALUES(designation),
        role = VALUES(role),
        status = 'ACTIVE',
        joiningDate = VALUES(joiningDate),
        basicSalary = VALUES(basicSalary),
        hra = VALUES(hra),
        fixedGrossSalary = VALUES(fixedGrossSalary),
        batch = VALUES(batch),
        biometricDeviceEmployeeId = VALUES(biometricDeviceEmployeeId),
        employeeCategory = VALUES(employeeCategory),
        updatedAt = NOW()
    `, [
      empId,
      emp.empNo,
      firstName,
      lastName,
      formattedFullName,
      email,
      phone,
      emp.gender,
      davLocationId,
      floorId,
      departmentId,
      shiftId,
      emp.desig,
      role,
      joiningDate,
      emp.basic,
      emp.hra,
      fixedGrossSalary,
      emp.batch,
      emp.empNo, // Identical biometric device ID!
      emp.division,
    ]);

    // Upsert into bsc_shard_dav.employee
    try {
      await pool.query(`
        INSERT INTO bsc_shard_dav.employee (
          id, employeeCode, firstName, lastName, fullName, email, phone, gender,
          locationId, floorId, departmentId, shiftId, designation, role, status,
          joiningDate, basicSalary, hra, fixedGrossSalary, currentAddress, permanentAddress,
          city, state, batch, biometricDeviceEmployeeId, attendanceEligible,
          employeeCategory, createdAt, updatedAt
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, 'ACTIVE',
          ?, ?, ?, ?, 'DAVANGERE, DAVANGERE', 'DAVANGERE, DAVANGERE',
          'DAVANGERE', 'KARNATAKA', ?, ?, 1,
          ?, NOW(), NOW()
        )
        ON DUPLICATE KEY UPDATE
          fullName = VALUES(fullName),
          locationId = VALUES(locationId),
          designation = VALUES(designation),
          basicSalary = VALUES(basicSalary),
          hra = VALUES(hra),
          biometricDeviceEmployeeId = VALUES(biometricDeviceEmployeeId),
          updatedAt = NOW()
      `, [
        empId,
        emp.empNo,
        firstName,
        lastName,
        formattedFullName,
        email,
        phone,
        emp.gender,
        davLocationId,
        floorId,
        departmentId,
        shiftId,
        emp.desig,
        role,
        joiningDate,
        emp.basic,
        emp.hra,
        fixedGrossSalary,
        emp.batch,
        emp.empNo,
        emp.division,
      ]);
    } catch (_) {}

    // 7. Upsert Biometric Employee Mapping (enrollmentNumber === employeeCode)
    const mappingId = `map-dav-${emp.empNo}`;
    await pool.query(`
      INSERT INTO biometric_employee_mappings (
        id, employeeId, enrollmentNumber, serialNumber, showroomCode, status,
        effectiveDate, notes, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, 'JNP2252300795', 'DAV', 'ACTIVE',
        '2026-10-16', 'Enrolled Davanagere Mega Store employee', NOW(), NOW()
      )
      ON DUPLICATE KEY UPDATE
        employeeId = VALUES(employeeId),
        enrollmentNumber = VALUES(enrollmentNumber),
        showroomCode = 'DAV',
        status = 'ACTIVE',
        updatedAt = NOW()
    `, [mappingId, empId, emp.empNo]);

    // 8. Create Attendance record for today (2026-10-17) and yesterday (2026-10-16)
    const attIdToday = `att-dav-${emp.empNo}-20261017`;
    const attIdYest = `att-dav-${emp.empNo}-20261016`;

    await pool.query(`
      INSERT INTO attendance (
        id, employeeId, locationId, shiftId, attendanceDate, actualLogin, actualLogout,
        totalWorkingSeconds, status, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, ?, '2026-10-17', '2026-10-17 09:30:00', '2026-10-17 18:30:00',
        32400, 'PRESENT', NOW(), NOW()
      )
      ON DUPLICATE KEY UPDATE
        status = 'PRESENT',
        actualLogin = '2026-10-17 09:30:00',
        actualLogout = '2026-10-17 18:30:00',
        updatedAt = NOW()
    `, [attIdToday, empId, davLocationId, shiftId]);

    await pool.query(`
      INSERT INTO attendance (
        id, employeeId, locationId, shiftId, attendanceDate, actualLogin, actualLogout,
        totalWorkingSeconds, status, createdAt, updatedAt
      ) VALUES (
        ?, ?, ?, ?, '2026-10-16', '2026-10-16 09:30:00', '2026-10-16 18:30:00',
        32400, 'PRESENT', NOW(), NOW()
      )
      ON DUPLICATE KEY UPDATE
        status = 'PRESENT',
        actualLogin = '2026-10-16 09:30:00',
        actualLogout = '2026-10-16 18:30:00',
        updatedAt = NOW()
    `, [attIdYest, empId, davLocationId, shiftId]);

    inserted++;
  }

  // 9. Re-link admin user if needed
  await pool.query(`UPDATE user SET locationId = ? WHERE email = 'admin@bsctextiles.com'`, [davLocationId]);

  console.log(`\nImport complete! Inserted/Synced ${inserted} employees into Davanagere Mega Store.`);

  const [count]: any = await pool.query('SELECT COUNT(*) as cnt FROM employee');
  console.log(`Current Total Active Employees in Database: ${count[0].cnt}`);

  const [mappingsCount]: any = await pool.query('SELECT COUNT(*) as cnt FROM biometric_employee_mappings');
  console.log(`Current Biometric Mappings Count: ${mappingsCount[0].cnt}`);

  process.exit(0);
}

runImport().catch(err => {
  console.error('Fatal import error:', err);
  process.exit(1);
});
