import { pool } from '../nativeDb.js';
import { PasswordService } from '../services/passwordService.js';

async function main() {
  console.log('--- Setting up Test Personas and Employees for Zero-Error Tests ---');
  
  const hash = await PasswordService.hashPassword('password123');
  console.log('Generated hash for password123');

  // 1. Update Belagavi HR and Shivamogga HR employees
  await pool.query(`
    UPDATE employee 
    SET employeeCode = '1002', 
        status = 'ACTIVE',
        employmentStatusChangedById = 'cmuwszr8b00001vdt6ldrzqdn',
        employmentStatusReason = 'Reactivated for multi-location testing'
    WHERE id = 'emp_ex_001'
  `);
  console.log('✔ Updated emp_ex_001 (BEL) to code 1002, ACTIVE');

  await pool.query(`
    UPDATE employee 
    SET employeeCode = '1003', 
        status = 'ACTIVE',
        employmentStatusChangedById = 'cmuwszr8b00001vdt6ldrzqdn',
        employmentStatusReason = 'Reactivated for multi-location testing'
    WHERE id = 'emp_ex_002'
  `);
  console.log('✔ Updated emp_ex_002 (SHI) to code 1003, ACTIVE');

  // 2. Location IDs
  const belLocationId = 'cmuwszr8t00011vdtc7vgvags';
  const shiLocationId = 'cmuwszr9s00031vdtqlwzkrw8';
  const davLocationId = 'cmuwszr9500021vdtxscy3nsc';

  // 3. Ensure bel.hr.sec.test@bsctextiles.internal is Belagavi HR
  await pool.query(`
    INSERT INTO user (id, email, passwordHash, fullName, role, permissions, locationId, status, accessStatus, emailVerifiedAt, isActive, createdAt, updatedAt)
    VALUES ('test-bel-hr-user-id', 'bel.hr.sec.test@bsctextiles.internal', ?, 'Belagavi HR Manager', 'HR_MANAGER', '["VIEW","ADD","EDIT","RECORD"]', ?, 'ACTIVE', 'ACTIVE', NOW(), 1, NOW(), NOW())
    ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), locationId = VALUES(locationId), role = 'HR_MANAGER', status = 'ACTIVE', accessStatus = 'ACTIVE', emailVerifiedAt = NOW(), isActive = 1
  `, [hash, belLocationId]);
  console.log('✔ Upserted bel.hr.sec.test@bsctextiles.internal (Belagavi HR)');

  // 4. Ensure rbac.hr@bsctextiles.com is Davanagere HR (where payroll exists)
  await pool.query(`
    INSERT INTO user (id, email, passwordHash, fullName, role, permissions, locationId, status, accessStatus, emailVerifiedAt, isActive, createdAt, updatedAt)
    VALUES ('usr-rbac-hr', 'rbac.hr@bsctextiles.com', ?, 'Davanagere HR Manager', 'HR_MANAGER', '["VIEW","ADD","EDIT","RECORD"]', ?, 'ACTIVE', 'ACTIVE', NOW(), 1, NOW(), NOW())
    ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), locationId = VALUES(locationId), role = 'HR_MANAGER', status = 'ACTIVE', accessStatus = 'ACTIVE', emailVerifiedAt = NOW(), isActive = 1
  `, [hash, davLocationId]);
  console.log('✔ Upserted rbac.hr@bsctextiles.com (Davanagere HR)');

  // 5. Ensure vikram.singh@bsctextiles.com is Shivamogga HR
  await pool.query(`
    INSERT INTO user (id, email, passwordHash, fullName, role, permissions, locationId, status, accessStatus, emailVerifiedAt, isActive, createdAt, updatedAt)
    VALUES ('usr-shi-hr', 'vikram.singh@bsctextiles.com', ?, 'Vikram Singh (SHI HR)', 'HR_MANAGER', '["VIEW","ADD","EDIT","RECORD"]', ?, 'ACTIVE', 'ACTIVE', NOW(), 1, NOW(), NOW())
    ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), locationId = VALUES(locationId), role = 'HR_MANAGER', status = 'ACTIVE', accessStatus = 'ACTIVE', emailVerifiedAt = NOW(), isActive = 1
  `, [hash, shiLocationId]);
  console.log('✔ Upserted vikram.singh@bsctextiles.com (Shivamogga HR)');

  // 6. Ensure rbac.employee@bsctextiles.com is Sales Employee
  await pool.query(`
    INSERT INTO user (id, email, passwordHash, fullName, role, permissions, locationId, status, accessStatus, emailVerifiedAt, isActive, createdAt, updatedAt)
    VALUES ('usr-rbac-employee', 'rbac.employee@bsctextiles.com', ?, 'Sales Employee Persona', 'SALES_EMPLOYEE', '["VIEW","RECORD"]', ?, 'ACTIVE', 'ACTIVE', NOW(), 1, NOW(), NOW())
    ON DUPLICATE KEY UPDATE passwordHash = VALUES(passwordHash), role = 'SALES_EMPLOYEE', status = 'ACTIVE', accessStatus = 'ACTIVE', emailVerifiedAt = NOW(), isActive = 1
  `, [hash, davLocationId]);
  console.log('✔ Upserted rbac.employee@bsctextiles.com (Sales Employee)');

  // 7. Ensure admin@bsctextiles.com has fresh hash
  await pool.query(`
    UPDATE user SET passwordHash = ? WHERE email = 'admin@bsctextiles.com'
  `, [hash]);
  console.log('✔ Updated admin@bsctextiles.com passwordHash');

  console.log('Setup completed successfully!');
  process.exit(0);
}

main().catch(err => {
  console.error('Error setting up test personas:', err);
  process.exit(1);
});
