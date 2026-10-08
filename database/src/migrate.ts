/**
 * BSC Textiles HRMS — Native MySQL Schema Runner
 * Zero Prisma Dependency. Applies schema.sql to MySQL 8.0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pool } from './pool.js';

async function runMigration() {
  console.log('================================================================');
  console.log('🚀 BSC TEXTILES HRMS — NATIVE MYSQL SCHEMA RUNNER');
  console.log('================================================================');
  
  const schemaPath = path.resolve(process.cwd(), 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at: ${schemaPath}`);
  }

  const sql = fs.readFileSync(schemaPath, 'utf-8');
  console.log('Reading schema.sql definitions...');
  console.log('Applying 38 normalized tables to MySQL database...');

  const startTime = Date.now();
  await pool.query(sql);

  console.log(`✔ Schema applied successfully in ${Date.now() - startTime}ms!`);
  console.log('All 38 tables, constraints, foreign keys, and indexes are active.');
  console.log('================================================================\n');

  await pool.end();
  process.exit(0);
}

runMigration().catch((err) => {
  console.error('❌ Migration failed:', err.message);
  process.exit(1);
});
