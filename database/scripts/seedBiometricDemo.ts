/**
 * Local/demo dataset for the biometric pipeline.
 *
 * The committed `database/seeds/*.sql` files were exported from a production
 * database whose schema has since diverged (they insert into the deprecated
 * plural tables and into columns the current schema does not have), so
 * `npm run db:setup` cannot produce a login-able database on its own. This
 * script creates the minimum consistent dataset the app and the biometric tests
 * need, written against the *current* enforced schema:
 *
 *   - 3 shifts, one per showroom store
 *   - 12 employees with digits-only codes (the CHECK constraint in migration
 *     025 requires digits), each with a distinct device enrollment number
 *   - 3 login users (super admin, HR manager, floor manager) sharing the
 *     documented `password123` credential
 *   - 1 eSSL MB160 device row pointed at the local simulated terminal
 *
 * Idempotent: re-running updates the same rows instead of duplicating them, and
 * it never deletes anything it did not create.
 */

import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const uri = process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms';
const DEMO_TAG = 'demo:mb160';

const SHIFT_CODES = ['DEMO_GENERAL', 'DEMO_MORNING', 'DEMO_EVENING'];

// employeeCode is digits-only by constraint. Enrollment numbers mirror the
// 6-8 digit values an MB160 actually stores, including one deliberately shared
// suffix (see the ambiguity notes in docs/BIOMETRIC_MB160.md).
const EMPLOYEES = [
  { code: '100201', first: 'Rajesh', last: 'Kumar', designation: 'Sales Associate', role: 'SALES_EMPLOYEE', location: 'BEL', shift: 0, enroll: '100201' },
  { code: '100202', first: 'Priya', last: 'Sharma', designation: 'Senior Sales Associate', role: 'SALES_EMPLOYEE', location: 'BEL', shift: 0, enroll: '100202' },
  { code: '100203', first: 'Amit', last: 'Patel', designation: 'Floor Manager', role: 'FLOOR_MANAGER', location: 'BEL', shift: 1, enroll: '100203' },
  { code: '100204', first: 'Kavita', last: 'Bhat', designation: 'HR Executive', role: 'HR_EXECUTIVE', location: 'BEL', shift: 0, enroll: '100204' },
  { code: '100205', first: 'Ramesh', last: 'Gowda', designation: 'Tea Break Manager', role: 'TEA_BREAK_MANAGER', location: 'BEL', shift: 2, enroll: '100205' },
  { code: '100206', first: 'Geeta', last: 'Kulkarni', designation: 'Cashier', role: 'SALES_EMPLOYEE', location: 'BEL', shift: 1, enroll: '100206' },
  { code: '200207', first: 'Suresh', last: 'Reddy', designation: 'Sales Associate', role: 'SALES_EMPLOYEE', location: 'DAV', shift: 0, enroll: '00200207' },
  { code: '200208', first: 'Lakshmi', last: 'Devi', designation: 'Visual Merchandiser', role: 'SALES_EMPLOYEE', location: 'DAV', shift: 1, enroll: '200208' },
  { code: '200209', first: 'Manjunath', last: 'Hebbar', designation: 'Floor Manager', role: 'FLOOR_MANAGER', location: 'DAV', shift: 2, enroll: '200209' },
  { code: '300210', first: 'Ananya', last: 'Hegde', designation: 'Sales Associate', role: 'SALES_EMPLOYEE', location: 'SHI', shift: 0, enroll: '300210' },
  { code: '300211', first: 'Vikram', last: 'Singh', designation: 'HR Manager', role: 'HR_MANAGER', location: 'SHI', shift: 1, enroll: '300211' },
  { code: '300212', first: 'Fatima', last: 'Shaikh', designation: 'Inventory Officer', role: 'SALES_EMPLOYEE', location: 'SHI', shift: 2, enroll: '000300212' },
];

const USERS = [
  { email: 'admin@bsctextiles.com', name: 'System Administrator', role: 'SUPER_ADMIN', employeeIndex: 3 },
  { email: 'vikram.singh@bsctextiles.com', name: 'Vikram Singh', role: 'HR_MANAGER', employeeIndex: 10 },
  { email: 'amit.patel@bsctextiles.com', name: 'Amit Patel', role: 'FLOOR_MANAGER', employeeIndex: 2 },
  { email: 'ramesh.gowda@bsctextiles.com', name: 'Ramesh Gowda', role: 'TEA_BREAK_MANAGER', employeeIndex: 4 },
];

const SIMULATED_DEVICE = {
  id: 'bio-dev-demo-bel-001',
  serialNumber: 'SIMMB160DEMO01',
  name: 'eSSL MB160 Belagavi Demo Terminal',
  model: 'eSSL MB160',
  firmware: 'Simulated Ver 8.0.4.7',
  ip: process.env.DEMO_DEVICE_IP || '127.0.0.1',
  port: Number(process.env.DEMO_DEVICE_PORT) || 4370,
  locationCode: 'BEL',
  timezone: 'Asia/Kolkata',
  commKey: 0,
};

async function main() {
  const pool = mysql.createPool({ uri, multipleStatements: true, timezone: '+05:30' });

  let [locations]: any = await pool.query('SELECT id, code FROM location');
  if (locations.length === 0) {
    console.log('— Baseline locations missing; provisioning BEL, DAV, SHI...');
    await pool.query(
      `INSERT INTO location (id, code, name, city, state, pin, status, createdAt, updatedAt)
       VALUES
         ('loc-demo-bel', 'BEL', 'Belagavi Head Store', 'Belagavi', 'Karnataka', '590001', 'ACTIVE', NOW(), NOW()),
         ('loc-demo-dav', 'DAV', 'Davanagere Mega Store', 'Davanagere', 'Karnataka', '577001', 'ACTIVE', NOW(), NOW()),
         ('loc-demo-shi', 'SHI', 'Shivamogga Flagship', 'Shivamogga', 'Karnataka', '577201', 'ACTIVE', NOW(), NOW())
       ON DUPLICATE KEY UPDATE name = VALUES(name), status = 'ACTIVE'`
    );
    [locations] = await pool.query('SELECT id, code FROM location');
  }
  const locationIdByCode = new Map<string, string>(locations.map((l: any) => [l.code, l.id]));

  console.log('— Shifts');
  for (const [index, code] of SHIFT_CODES.entries()) {
    const startHour = [9, 7, 13][index];
    const endHour = [18, 16, 22][index];
    for (const locationCode of locationIdByCode.keys()) {
      const id = `shift-${code.toLowerCase()}-${locationCode.toLowerCase()}`;
      await pool.query(
        `INSERT INTO shift (id, name, code, locationId, startTime, endTime, gracePeriod, lateThreshold,
                            lunchDurationMinutes, teaDurationMinutes, faceVerificationThreshold,
                            qrDailyTokenEnabled, qrOneTimeScan, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, 10, 5, 60, 20, 50, 1, 1, 'ACTIVE', NOW(), NOW())
         ON DUPLICATE KEY UPDATE name = VALUES(name), startTime = VALUES(startTime),
                                 endTime = VALUES(endTime), updatedAt = NOW()`,
        [
          id,
          `${code.split('_')[1].toLowerCase().replace(/^./, (c) => c.toUpperCase())} Shift (${locationCode})`,
          `${code}-${locationCode}`,
          locationIdByCode.get(locationCode),
          `2024-01-01 ${String(startHour).padStart(2, '0')}:00:00.000`,
          `2024-01-01 ${String(endHour).padStart(2, '0')}:00:00.000`,
        ]
      );
    }
  }

  console.log('— Employees');
  const employeeIdByCode = new Map<string, string>();
  for (const employee of EMPLOYEES) {
    const id = `emp-demo-${employee.code}`;
    employeeIdByCode.set(employee.code, id);
    const shiftId = `shift-${SHIFT_CODES[employee.shift].toLowerCase()}-${employee.location.toLowerCase()}`;
    await pool.query(
      `INSERT INTO employee (id, employeeCode, firstName, lastName, fullName, email, phone, gender,
                             locationId, shiftId, designation, role, status, joiningDate,
                             biometricDeviceEmployeeId, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', '2024-04-01 00:00:00.000', ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         firstName = VALUES(firstName), lastName = VALUES(lastName), fullName = VALUES(fullName),
         locationId = VALUES(locationId), shiftId = VALUES(shiftId), designation = VALUES(designation),
         role = VALUES(role), status = 'ACTIVE',
         biometricDeviceEmployeeId = VALUES(biometricDeviceEmployeeId), updatedAt = NOW()`,
      [
        id,
        employee.code,
        employee.first,
        employee.last,
        `${employee.first} ${employee.last}`,
        `${employee.first}.${employee.last}@bsctextiles.com`.toLowerCase(),
        '+91 98000 00000',
        employee.first === 'Priya' || employee.first === 'Geeta' || employee.first === 'Lakshmi' || employee.first === 'Ananya' || employee.first === 'Fatima' || employee.first === 'Kavita' ? 'female' : 'male',
        locationIdByCode.get(employee.location),
        shiftId,
        employee.designation,
        employee.role,
        employee.enroll,
      ]
    );
  }

  console.log('— Login users (password: password123)');
  const passwordHash = await bcrypt.hash('password123', 10);
  for (const user of USERS) {
    const employee = EMPLOYEES[user.employeeIndex];
    const employeeId = employeeIdByCode.get(employee.code)!;
    const id = `usr-demo-${user.email.split('@')[0].replace(/\W/g, '')}`;
    await pool.query(
      `INSERT INTO user (id, email, passwordHash, fullName, role, permissions, locationId, employeeId,
                         isActive, status, accessStatus, mustChangePassword, mfaEnabled, mfaRequired,
                         emailVerifiedAt, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', 'ACTIVE', 0, 0, 0, NOW(3), NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         passwordHash = VALUES(passwordHash), fullName = VALUES(fullName), role = VALUES(role),
         locationId = VALUES(locationId), employeeId = VALUES(employeeId),
         isActive = 1, status = 'ACTIVE', accessStatus = 'ACTIVE', updatedAt = NOW()`,
      [
        id,
        user.email.toLowerCase(),
        passwordHash,
        user.name,
        user.role,
        JSON.stringify(['ALL']),
        locationIdByCode.get(employee.location),
        employeeId,
      ]
    );
  }

  console.log('— Device registry');
  await pool.query(
    `INSERT INTO biometric_devices
       (id, serialNumber, name, model, firmwareVersion, ipAddress, port, commKey, timezone,
        locationId, locationCode, status, protocol, isActive, realtimeEnabled, photoPushEnabled,
        pollIntervalMs, heartbeatTimeoutSeconds, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DISCONNECTED', 'ADMS_PUSH', 1, 1, 0, 2500, 15, NOW(3), NOW(3))
     ON DUPLICATE KEY UPDATE
       name = VALUES(name), model = VALUES(model), firmwareVersion = VALUES(firmwareVersion),
       ipAddress = VALUES(ipAddress), port = VALUES(port), commKey = VALUES(commKey),
       timezone = VALUES(timezone), locationId = VALUES(locationId), locationCode = VALUES(locationCode),
       protocol = VALUES(protocol), isActive = 1, realtimeEnabled = 1, updatedAt = NOW()`,
    [
      SIMULATED_DEVICE.id,
      SIMULATED_DEVICE.serialNumber,
      SIMULATED_DEVICE.name,
      SIMULATED_DEVICE.model,
      SIMULATED_DEVICE.firmware,
      SIMULATED_DEVICE.ip,
      SIMULATED_DEVICE.port,
      SIMULATED_DEVICE.commKey,
      SIMULATED_DEVICE.timezone,
      locationIdByCode.get(SIMULATED_DEVICE.locationCode),
      SIMULATED_DEVICE.locationCode,
    ]
  );

  // Enrollment mappings, so the punch path resolves identity without an admin
  // having to click through the UI first.
  console.log('— Enrollment mappings');
  for (const employee of EMPLOYEES) {
    const normalized = employee.enroll.replace(/^0+/, '') || employee.enroll;
    const lastSix = normalized.length > 6 ? normalized.slice(-6) : normalized.padStart(6, '0');
    await pool.query(
      `INSERT INTO biometric_employee_mappings
         (id, employeeId, enrollmentNumber, normalizedEnrollment, lastSixDigits, serialNumber, showroomCode,
          status, effectiveDate, notes, mappingSource, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', CURDATE(), ?, 'MANUAL', NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE
         employeeId = VALUES(employeeId), normalizedEnrollment = VALUES(normalizedEnrollment),
         lastSixDigits = VALUES(lastSixDigits), status = 'ACTIVE', notes = VALUES(notes), updatedAt = NOW(3)`,
      [
        `map-demo-${employee.code}`,
        employeeIdByCode.get(employee.code),
        employee.enroll,
        normalized,
        lastSix,
        SIMULATED_DEVICE.serialNumber,
        employee.location,
        `${DEMO_TAG} enrollment`,
      ]
    );
  }

  // Report any suffix two demo employees share, so the ambiguity path is
  // visible rather than surprising.
  const [conflicts]: any = await pool.query(
    `SELECT lastSixDigits, COUNT(DISTINCT employeeId) AS claims
       FROM biometric_employee_mappings
      WHERE lastSixDigits IS NOT NULL
      GROUP BY lastSixDigits HAVING claims > 1`
  );

  const [countRows]: any = await pool.query(
    `SELECT (SELECT COUNT(*) FROM employee) AS employees,
            (SELECT COUNT(*) FROM user WHERE isActive = 1) AS users,
            (SELECT COUNT(*) FROM biometric_devices) AS devices`
  );

  console.log('\n✔ Demo dataset ready:', countRows[0]);
  if (conflicts.length > 0) {
    console.log(`⚠ ${conflicts.length} enrollment suffix(es) claim more than one employee — punches for those ids are held as AMBIGUOUS by design:`);
    for (const conflict of conflicts) console.log(`   · lastSix ${conflict.lastSixDigits} → ${conflict.claims} employees`);
  }
  console.log('\nLog in at http://localhost:3000/login as admin@bsctextiles.com / password123');

  await pool.end();
}

main().catch((err) => {
  console.error('❌ Demo dataset failed:', err.message);
  process.exit(1);
});
