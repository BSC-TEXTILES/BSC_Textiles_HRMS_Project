const { pool } = require('./src/nativeDb.ts');

async function checkLoc() {
  const [rows] = await pool.query('SELECT id, code, name FROM location');
  console.log('location table:', rows);
  const [rows2] = await pool.query('SELECT id, code, name FROM locations');
  console.log('locations table:', rows2);
  await pool.end();
  process.exit(0);
}

checkLoc().catch(e => { console.error(e); process.exit(1); });