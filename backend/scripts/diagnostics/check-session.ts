const { pool } = require('./src/nativeDb.ts');

async function checkSession() {
  // Get the latest session for our test user
  const [rows] = await pool.query('SELECT * FROM `session` WHERE userId = ? ORDER BY createdAt DESC LIMIT 1', ['usr_admin']);
  console.log('Session:', rows[0]);
  await pool.end();
}

checkSession().catch(e => console.error(e));