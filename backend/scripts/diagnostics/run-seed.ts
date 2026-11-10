const { pool } = require('./src/nativeDb.ts');
const fs = require('fs');
const path = require('path');

async function runSeed() {
  const seedPath = path.resolve('..', 'database', 'seed.sql');
  const seed = fs.readFileSync(seedPath, 'utf8');
  try {
    await pool.query(seed);
    console.log('Seed executed successfully');
  } catch (err) {
    console.error('Error:', err.message);
  }
  await pool.end();
  process.exit(0);
}

runSeed().catch(e => { console.error(e); process.exit(1); });