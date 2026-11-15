/**
 * BSC Textiles HRMS — Native Sequential Migration Engine
 * Zero Prisma Dependency. Applies versioned SQL files tracking status in _migrations table.
 *
 * The engine itself lives in backend/src/services/schemaBootstrap.ts so that
 * backend startup can install the same schema on an empty database.
 */

import path from 'node:path';
import { pool } from '../src/pool.js';
import { applyMigrations, verifyCoreSchema } from '../../backend/src/services/schemaBootstrap.js';

async function migrate() {
  console.log('================================================================');
  console.log('🚀 BSC TEXTILES HRMS — NATIVE MYSQL MIGRATION RUNNER');
  console.log('================================================================');

  const { applied, skipped } = await applyMigrations(pool, path.resolve(process.cwd()));

  // Older runs could record a migration after skipping a missing-table error.
  // Verify the core tables used by startup before reporting a usable deployment.
  await verifyCoreSchema(pool);
  console.log(`\n🎉 Migrations evaluated: ${applied} applied, ${skipped} already recorded.`);
  console.log('================================================================\n');
  await pool.end();
  process.exit(0);
}

migrate().catch((err) => {
  console.error('❌ Migration failed:', err.message || err);
  if (err.sqlMessage) console.error('   MySQL said:', err.sqlMessage);
  process.exit(1);
});
