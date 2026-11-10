import { pool } from './src/nativeDb.js';
import fs from 'node:fs';
import path from 'node:path';

async function runMigrations() {
  console.log('Running database migrations...');
  
  // Read the main schema file
  const schemaPath = path.resolve(__dirname, '..', 'database', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  
  // Execute the entire schema as one batch to handle foreign key checks
  try {
    await pool.query(schema);
    console.log('Main schema executed successfully');
  } catch (err: any) {
    console.error('Error executing schema:', err.message);
  }
  
  console.log('Main schema migration complete.');
  
  // Run seed data
  const seedPath = path.resolve(__dirname, '..', 'database', 'seed.sql');
  if (fs.existsSync(seedPath)) {
    const seed = fs.readFileSync(seedPath, 'utf8');
    try {
      await pool.query(seed);
      console.log('Seed data executed successfully');
    } catch (err: any) {
      console.error('Error seeding:', err.message);
    }
    console.log('Seed data complete.');
  }
  
  await pool.end();
  process.exit(0);
}

runMigrations().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});