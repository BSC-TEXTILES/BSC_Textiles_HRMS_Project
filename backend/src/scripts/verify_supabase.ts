import { Client } from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const connectionString =
  process.env.SUPABASE_POOLER_URL || process.env.SUPABASE_DB_URL || '';
if (!connectionString) {
  console.error(
    '[verify_supabase] SUPABASE_POOLER_URL or SUPABASE_DB_URL must be set. ' +
      'A live connection string used to be hardcoded in this file — it must not come back.'
  );
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl:
    (process.env.PGSSL_REJECT_UNAUTHORIZED || '').trim().toLowerCase() === 'false'
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: true },
});

async function verify() {
  await client.connect();
  const tables = await client.query("SELECT count(*) as cnt FROM information_schema.tables WHERE table_schema = 'public'");
  const users = await client.query('SELECT count(*) as cnt FROM public."user"');
  const employees = await client.query('SELECT count(*) as cnt FROM public."employee"');
  const roles = await client.query('SELECT name, description FROM public."role" ORDER BY name');
  const biometricDevices = await client.query('SELECT id, name, "ipAddress", port, "locationId" FROM public."biometric_devices"');
  
  console.log('✓ Supabase Public Tables:', tables.rows[0].cnt);
  console.log('✓ Supabase Users:', users.rows[0].cnt);
  console.log('✓ Supabase Employees:', employees.rows[0].cnt);
  console.log('\n--- Supabase Roles ---');
  console.table(roles.rows);
  console.log('\n--- Supabase Biometric Terminals ---');
  console.table(biometricDevices.rows);
  
  await client.end();
  process.exit(0);
}

verify().catch(e => {
  console.error('Supabase query failed:', e);
  process.exit(1);
});
