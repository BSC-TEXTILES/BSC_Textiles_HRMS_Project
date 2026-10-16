import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

async function main() {
  const connectionString = process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    console.error('SUPABASE_DB_URL not found');
    return;
  }
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });
  await client.connect();

  await client.query(`
    UPDATE public."biometric_devices"
    SET "ipAddress" = '192.168.100.137',
        "port" = 4370,
        "serialNumber" = 'JNP2252300795',
        "name" = 'eSSL MB160 Davanagere Terminal 1 (Main Entrance)',
        "locationCode" = 'DAV',
        "locationId" = 'cmuwszr9500021vdtxscy3nsc',
        "firmwareVersion" = 'Ver 6.60 Sep 19 2019',
        "model" = 'eSSL MB160'
    WHERE "id" = 'bio-dev-dav-001' OR "serialNumber" = 'JNP2252300795';
  `);

  await client.query(`
    UPDATE public."biometric_devices"
    SET "ipAddress" = '192.168.100.135',
        "port" = 4370,
        "serialNumber" = 'JNP2252300802',
        "name" = 'eSSL MB160 Davanagere Terminal 2 (Staff Lounge)',
        "locationCode" = 'DAV',
        "locationId" = 'cmuwszr9500021vdtxscy3nsc',
        "firmwareVersion" = 'Ver 6.60 Sep 19 2019',
        "model" = 'eSSL MB160'
    WHERE "id" = 'bio-dev-dav-002' OR "serialNumber" LIKE '%2252300802' OR "serialNumber" LIKE '%2252308082';
  `);

  await client.query(`
    UPDATE public."biometric_devices"
    SET "ipAddress" = '192.168.100.136',
        "port" = 4370,
        "serialNumber" = 'JNP2252300797',
        "name" = 'eSSL MB160 Davanagere Terminal 3 (Admin / Billing)',
        "locationCode" = 'DAV',
        "locationId" = 'cmuwszr9500021vdtxscy3nsc',
        "firmwareVersion" = 'Ver 6.60 Sep 19 2019',
        "model" = 'eSSL MB160'
    WHERE "id" = 'bio-dev-dav-003' OR "serialNumber" = 'JNP2252300797';
  `);

  const dev = await client.query(`SELECT "id", "serialNumber", "name", "ipAddress", "port", "locationCode", "firmwareVersion" FROM public."biometric_devices";`);
  console.log('✅ Supabase PostgreSQL biometric_devices verified:');
  dev.rows.forEach(d => console.log(`   - [${d.name}] IP: ${d.ipAddress}:${d.port} | SN: ${d.serialNumber} | Loc: ${d.locationCode} | FW: ${d.firmwareVersion}`));

  await client.end();
}

main().catch(err => {
  console.error('Supabase update failed:', err);
  process.exit(1);
});
