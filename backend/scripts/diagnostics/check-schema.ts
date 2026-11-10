const { pool } = require('./src/nativeDb.ts');

async function checkSchema() {
  const [cols] = await pool.query('SHOW COLUMNS FROM `user`');
  console.log('User table columns:');
  cols.forEach(c => console.log(' ', c.Field, c.Type, c.Null, c.Key, c.Default));
  await pool.end();
  process.exit(0);
}

checkSchema().catch(e => { console.error(e); process.exit(1); });