/**
 * BSC Textiles HRMS — Native Sequential Migration Engine
 * Zero Prisma Dependency. Applies versioned SQL files tracking status in _migrations table.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/pool.js';

async function migrate() {
  console.log('================================================================');
  console.log('🚀 BSC TEXTILES HRMS — NATIVE MYSQL MIGRATION RUNNER');
  console.log('================================================================');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found at: ${migrationsDir}`);
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  console.log(`Found ${files.length} sequential migration files.`);

  for (const file of files) {
    const [rows]: any = await pool.query('SELECT id FROM _migrations WHERE name = ?', [file]);
    if (rows.length === 0) {
      console.log(`  Applying migration: ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      const startTime = Date.now();
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
      console.log(`  ✔ Applied ${file} (${Date.now() - startTime}ms)`);
    } else {
      console.log(`  ⏩ Skipping ${file} (already executed)`);
    }
  }

  console.log('🎉 All migrations evaluated successfully!');
  console.log('================================================================\n');
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
