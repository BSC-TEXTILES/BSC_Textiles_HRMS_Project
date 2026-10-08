/**
 * BSC Textiles HRMS — Native Sequential Seed Engine
 * Zero Prisma Dependency. Applies versioned seed datasets sequentially.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/pool.js';

async function seed() {
  console.log('================================================================');
  console.log('🌱 BSC TEXTILES HRMS — NATIVE MYSQL SEED RUNNER');
  console.log('================================================================');

  const seedsDir = path.resolve(process.cwd(), 'seeds');
  if (!fs.existsSync(seedsDir)) {
    throw new Error(`Seeds directory not found at: ${seedsDir}`);
  }

  const files = fs.readdirSync(seedsDir).filter((f) => f.endsWith('.sql')).sort();
  console.log(`Found ${files.length} seed files.`);

  for (const file of files) {
    console.log(`  Executing seed: ${file}...`);
    const filePath = path.join(seedsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    const startTime = Date.now();
    await pool.query(sql);
    console.log(`  ✔ Populated ${file} (${Date.now() - startTime}ms)`);
  }

  console.log('✨ All seed datasets populated successfully!');
  console.log('Pre-configured test personas ready with password: password123');
  console.log('================================================================\n');
  await pool.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
