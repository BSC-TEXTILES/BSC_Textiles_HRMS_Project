const { pool } = require('./src/nativeDb.ts');

async function checkLocations() {
  const [rows] = await pool.query('SELECT id, code, name FROM location');
  console.log('Locations:', rows);
  await pool.end();
  process.exit(0);
}

checkLocations().catch(e => { console.error(e); process.exit(1); });