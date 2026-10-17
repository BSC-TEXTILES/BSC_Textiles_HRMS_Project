import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const connectionString =
  process.env.SUPABASE_POOLER_URL ||
  process.env.SUPABASE_DB_URL ||
  process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[Error] Missing SUPABASE_POOLER_URL, SUPABASE_DB_URL, or DATABASE_URL in environment.');
  process.exit(1);
}

const client = new Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
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
