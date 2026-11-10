const { pool } = require('./src/nativeDb.ts');

async function checkSession() {
  const [rows] = await pool.query('SELECT id FROM `session` WHERE id = ?', ['sess_17465625-ec49-4cca-a7c8-bbe0a541b4e1']);
  console.log('Session with token ID:', rows);
  const [rows2] = await pool.query('SELECT id FROM `session` WHERE id = ?', ['sess_54e92133-9521-43bd-8809-868175eb89f6']);
  console.log('Session with DB ID:', rows2);
  await pool.end();
}

checkSession().catch(e => console.error(e));