import { pool } from '../src/pool.js';

async function checkTables() {
  const [tables] = await pool.query('SHOW TABLES LIKE "mfa_%"');
  console.log('MFA tables:', tables);
  
  const [tables2] = await pool.query('SHOW TABLES LIKE "session"');
  console.log('Session table:', tables2);
  
  const [tables3] = await pool.query('SHOW TABLES LIKE "device_fingerprint"');
  console.log('Device fingerprint table:', tables3);
  
  const [tables4] = await pool.query('SHOW TABLES LIKE "approval_token"');
  console.log('Approval token table:', tables4);
  
  const [tables5] = await pool.query('SHOW TABLES LIKE "password_reset_token"');
  console.log('Password reset token table:', tables5);
  
  const [tables6] = await pool.query('SHOW TABLES LIKE "login_attempt"');
  console.log('Login attempt table:', tables6);
  
  const [tables7] = await pool.query('SHOW TABLES LIKE "revoked_token"');
  console.log('Revoked token table:', tables7);
  
  const [tables8] = await pool.query('SHOW TABLES LIKE "file_upload"');
  console.log('File upload table:', tables8);
  
  const [tables9] = await pool.query('SHOW TABLES LIKE "security_event"');
  console.log('Security event table:', tables9);
  
  await pool.end();
}

checkTables().catch(console.error);