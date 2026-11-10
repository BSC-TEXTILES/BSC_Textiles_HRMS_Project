const { pool } = require('./src/nativeDb.ts');

async function checkTables() {
  // Check notification table
  const [notifCols] = await pool.query('SHOW COLUMNS FROM notification');
  console.log('Notification columns:', notifCols.map(c => c.Field));
  
  // Check role table
  const [roleCols] = await pool.query('SHOW COLUMNS FROM role');
  console.log('Role columns:', roleCols.map(c => c.Field));
  
  await pool.end();
}

checkTables().catch(e => console.error(e));