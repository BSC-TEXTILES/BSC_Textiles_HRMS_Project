import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

async function main() {
  const connectionString = process.argv[2] || process.env.SUPABASE_DB_URL || 'postgresql://postgres:postgres@localhost:5432/postgres';
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  const tables = await client.query(`SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';`);
  console.log('✓ Total Public Tables in Supabase:', tables.rows[0].count);

  const e1 = await client.query(`
    SELECT "id", "employeeCode", "firstName", "lastName", "fullName", "biometricDeviceEmployeeId" 
    FROM public."employee" 
    WHERE "employeeCode" ILIKE '%1604%' OR "biometricDeviceEmployeeId" ILIKE '%1604%';
  `);
  console.log('✓ Employee 1604 verified in Supabase:', e1.rows[0]);

  const dev = await client.query(`SELECT * FROM public."biometric_devices";`);
  console.log(`✓ Biometric Devices count: ${dev.rows.length}`);
  dev.rows.forEach((d: any) => console.log(`   - [${d.name || d.device_name}] IP: ${d.ip_address || d.ipAddress} | Serial: ${d.serial_number || d.serialNumber}`));

  const punches = await client.query(`SELECT count(*) FROM public."biometric_raw_punches";`);
  console.log('✓ Biometric Raw Punches count:', punches.rows[0].count);

  const att = await client.query(`SELECT count(*) FROM public."attendance";`);
  console.log('✓ Attendance records count:', att.rows[0].count);

  const users = await client.query(`SELECT count(*) FROM public."user";`);
  console.log('✓ User accounts count:', users.rows[0].count);

  const audit = await client.query(`SELECT count(*) FROM public."auditlog";`);
  console.log('✓ Audit logs count:', audit.rows[0].count);

  await client.end();
}

main().catch(console.error);
