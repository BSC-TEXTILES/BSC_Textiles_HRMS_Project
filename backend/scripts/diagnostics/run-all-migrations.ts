import { pool } from './src/nativeDb.js';
import fs from 'node:fs';
import path from 'node:path';

async function runMigrations() {
  console.log('Running database migrations...');
  
  const migrationsDir = path.resolve(__dirname, '..', 'database', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');
    
    console.log(`\nApplying migration: ${file}`);
    
    // Split by semicolon and execute each statement
    const statements = sql.split(';').filter(s => s.trim().length > 0 && !s.trim().startsWith('--'));
    
    for (const statement of statements) {
      const trimmed = statement.trim();
      if (trimmed) {
        try {
          await pool.query(trimmed);
          console.log('  ✓ Executed:', trimmed.substring(0, 80) + (trimmed.length > 80 ? '...' : ''));
        } catch (err: any) {
          // Ignore "table already exists" and "duplicate column" errors
          if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.errno === 1050 ||
              err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060 ||
              err.code === 'ER_DUP_KEYNAME' || err.errno === 1061 ||
              err.code === 'ER_DUP_ENTRY' || err.errno === 1062) {
            console.log('  ⊘ Skipped (already exists):', trimmed.substring(0, 80) + (trimmed.length > 80 ? '...' : ''));
          } else {
            console.error('  ✗ Error:', err.message);
            console.error('  Statement:', trimmed.substring(0, 200));
          }
        }
      }
    }
  }
  
  console.log('\n✅ All migrations completed!');
  
  await pool.end();
  process.exit(0);
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});