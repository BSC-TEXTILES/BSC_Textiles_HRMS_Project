const { pool } = require('./src/nativeDb.ts');
const { PasswordService } = require('./src/services/passwordService.ts');

async function checkUser() {
  const [rows] = await pool.query('SELECT id, email, loginId, passwordHash, role, status, isActive FROM `user` WHERE email = ?', ['admin@bsctextiles.com']);
  console.log('User:', rows[0]);
  if (rows[0]) {
    const valid = await PasswordService.verifyPassword('password123', rows[0].passwordHash);
    console.log('Password valid:', valid.valid);
    if (valid.needsRehash) console.log('Needs rehash');
  }
  await pool.end();
}

checkUser().catch(e => console.error(e));