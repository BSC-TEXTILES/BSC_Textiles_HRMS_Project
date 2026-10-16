import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres.opoeigmbiwctvqtzxkde:HRMS_Project%402026@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres',
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
