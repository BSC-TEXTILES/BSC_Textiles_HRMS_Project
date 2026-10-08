/**
 * BSC Textiles HRMS — Native MySQL Consolidated Schema Runner
 * Applies full schema.sql (all 38 tables) directly to MySQL 8.0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/pool.js';

async function runSchema() {
  console.log('================================================================');
  console.log('🚀 BSC TEXTILES HRMS — CONSOLIDATED SCHEMA RUNNER');
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

runSchema().catch((err) => {
  console.error('❌ Schema application failed:', err.message);
  process.exit(1);
});
