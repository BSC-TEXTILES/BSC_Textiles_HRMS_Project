/**
 * BSC Textiles HRMS — Native MySQL Seed Runner
 * Zero Prisma Dependency. Applies seed.sql to MySQL 8.0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pool } from './pool.js';

async function runSeed() {
  console.log('================================================================');
  console.log('🌱 BSC TEXTILES HRMS — NATIVE MYSQL SEED ENGINE');
  console.log('================================================================');

  const seedPath = path.resolve(process.cwd(), 'seed.sql');
  if (!fs.existsSync(seedPath)) {
    throw new Error(`Seed file not found at: ${seedPath}`);
  }

  const sql = fs.readFileSync(seedPath, 'utf-8');
  console.log('Reading seed.sql dataset...');
  console.log('Inserting locations, floors, departments, shifts, employees, and test personas...');

  const startTime = Date.now();
  await pool.query(sql);

  console.log(`✔ Seed dataset populated successfully in ${Date.now() - startTime}ms!`);
  console.log('Pre-configured test accounts ready with password: password123');
  console.log('================================================================\n');

  await pool.end();
  process.exit(0);
}

runSeed().catch((err) => {
  console.error('❌ Seeding failed:', err.message);
  process.exit(1);
});
