const { pool } = require('./src/nativeDb.ts');

async function checkCols() {
  const [cols] = await pool.query('SHOW COLUMNS FROM employee');
  cols.forEach(c => console.log(c.Field));
  await pool.end();
}

checkCols().catch(e => console.error(e));