const { pool } = require('./src/nativeDb.ts');
const { PasswordService } = require('./src/services/passwordService.ts');

async function createTestUser() {
  // Hash the password with Argon2id
  const passwordHash = await PasswordService.hashPassword('password123');
  console.log('Password hash:', passwordHash);
  
  // Create the test user
  const userId = 'usr_admin';
  const email = 'admin@bsctextiles.com';
  const loginId = 'admin';
  const fullName = 'Rajesh Sharma';
  const role = 'SUPER_ADMIN';
  const permissions = JSON.stringify(["VIEW", "ADD", "EDIT", "DELETE", "APPROVE", "REJECT", "ASSIGN", "EXPORT", "IMPORT", "CONFIGURE", "MANAGE", "RECORD", "UPLOAD", "PUBLISH", "SCAN", "VIEW_SENSITIVE_DATA"]);
  const locationId = 'loc_bel';
  const employeeId = 'emp_admin';
  
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