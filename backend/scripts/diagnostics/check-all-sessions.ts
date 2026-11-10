const { pool } = require('./src/nativeDb.ts');

async function checkSessions() {
  const [rows] = await pool.query('SELECT id, createdAt, lastActivityAt FROM `session` WHERE userId = ? ORDER BY createdAt DESC', ['usr_admin']);
  console.log('All sessions for usr_admin:');
  rows.forEach(r => console.log(' ', r.id, r.createdAt, r.lastActivityAt));
  await pool.end();
}

checkSessions().catch(e => console.error(e));