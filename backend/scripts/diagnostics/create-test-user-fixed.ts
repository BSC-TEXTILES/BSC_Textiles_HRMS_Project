const { pool } = require('./src/nativeDb.ts');
const { PasswordService } = require('./src/services/passwordService.ts');

async function createTestUser() {
  // Hash the password with Argon2id
  const passwordHash = await PasswordService.hashPassword('password123');
  console.log('Password hash:', passwordHash);
  
  // First, make sure we have a location and employee
  // Check if location exists
  const [locRows] = await pool.query("SELECT id FROM location WHERE code = 'BEL' LIMIT 1");
  let locationId = locRows[0]?.id;
  
  if (!locationId) {
    // Create location
    const [result] = await pool.query(`
      INSERT INTO location (id, code, name, city, state, status, createdAt, updatedAt)
      VALUES ('loc_bel', 'BEL', 'Belagavi Head Store', 'Belagavi', 'Karnataka', 'ACTIVE', NOW(3), NOW(3))
    `);
    locationId = 'loc_bel';
  }
  console.log('Location ID:', locationId);
  
  // Check if employee exists
  const [empRows] = await pool.query("SELECT id FROM employee WHERE employeeCode = 'EMP-CORP-001' LIMIT 1");
  let employeeId = empRows[0]?.id;
  
  if (!employeeId) {
    // Create employee with minimal required fields
    employeeId = 'emp_admin';
    await pool.query(`
      INSERT IGNORE INTO employee (id, employeeCode, firstName, lastName, fullName, email, phone, gender, locationId, role, status, joiningDate, createdAt, updatedAt)
      VALUES ('emp_admin', 'EMP-CORP-001', 'Rajesh', 'Sharma', 'Rajesh Sharma', 'admin@bsctextiles.com', '+91 9880000001', 'MALE', ?, 'EMPLOYEE', 'ACTIVE', NOW(3), NOW(3), NOW(3))
    `, [locationId]);
  }
  console.log('Employee ID:', employeeId);
  
  // Create the test user
  const userId = 'usr_admin';
  const email = 'admin@bsctextiles.com';
  const loginId = 'admin';
  const fullName = 'Rajesh Sharma';
  const role = 'SUPER_ADMIN';
  const permissions = JSON.stringify(["VIEW", "ADD", "EDIT", "DELETE", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "IMPORT", "CONFIGURE", "MANAGE", "RECORD", "UPLOAD", "PUBLISH", "SCAN", "VIEW_SENSITIVE_DATA"]);
  
  try {
    await pool.query(`
      INSERT INTO \`user\` (id, email, loginId, passwordHash, fullName, role, permissions, locationId, employeeId, isActive, status, mustChangePassword, tokenVersion, mfaEnabled, mfaVerified, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'ACTIVE', 0, 0, 0, 1, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE 
        passwordHash = VALUES(passwordHash),
        loginId = VALUES(loginId),
        fullName = VALUES(fullName),
        role = VALUES(role),
        permissions = VALUES(permissions),
        locationId = VALUES(locationId),
        employeeId = VALUES(employeeId),
        isActive = 1,
        status = 'ACTIVE',
        mustChangePassword = 0,
        tokenVersion = 0,
        mfaEnabled = 0,
        mfaVerified = 1,
        updatedAt = NOW(3)
    `, [userId, email, loginId, passwordHash, fullName, role, permissions, locationId, employeeId]);
    
    console.log('Test user created/updated successfully');
  } catch (err) {
    console.error('Error:', err.message);
  }
  
  await pool.end();
  process.exit(0);
}

createTestUser().catch(e => { console.error(e); process.exit(1); });