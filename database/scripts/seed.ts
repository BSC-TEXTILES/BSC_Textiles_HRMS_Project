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

  // Baseline guard: the seed dataset is only for empty (freshly migrated)
  // databases. Re-running it against an existing database would duplicate
  // synthetic rows and could dangle foreign keys, so we refuse instead.
  const [schemaRows]: any = await pool.query(
    `SELECT COUNT(*) AS n FROM information_schema.tables
     WHERE table_schema = DATABASE() AND LOWER(table_name) = 'user'`
  );
  if (schemaRows[0].n === 0) {
    console.error('❌ No schema found (User table missing). Run `npm run db:migrate` first.');
    await pool.end();
    process.exit(1);
  }
  const [userRows]: any = await pool.query('SELECT COUNT(*) AS n FROM `User`');
  if (Number(userRows[0].n) > 0) {
    console.log(`⏩ Baseline data already present (${userRows[0].n} users). Skipping seed.`);
    console.log('   (Seeds only run against empty databases; existing business data is preserved.)');
    console.log('================================================================\n');
    await pool.end();
    process.exit(0);
  }

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
