const { pool } = require('./src/nativeDb.ts');

async function checkTables() {
  const [tables] = await pool.query('SHOW TABLES');
  console.log('Tables:', tables.map(t => Object.values(t)[0]));
  await pool.end();
  process.exit(0);
}

checkTables().catch(e => { console.error(e); process.exit(1); });