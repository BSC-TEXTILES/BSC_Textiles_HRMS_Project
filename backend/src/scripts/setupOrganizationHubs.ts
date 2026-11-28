import dotenv from 'dotenv';
dotenv.config();
dotenv.config({ path: '../.env' });
import { pool } from '../nativeDb.js';
import { cacheService } from '../services/cacheService.js';

export async function setupOrganizationHubs() {
  // 1. Ensure canonical showrooms exist in location table
  try {
    await pool.query(`
      INSERT INTO \`location\` (\`id\`, \`code\`, \`name\`, \`address\`, \`city\`, \`state\`, \`pin\`, \`phone\`, \`email\`, \`status\`, \`createdAt\`, \`updatedAt\`)
      VALUES
        ('cmuzam5fe00014n4pq25hkcww', 'BEL', 'Belagavi Head Store', 'Khade Bazar, Belagavi', 'Belagavi', 'Karnataka', '590001', '0831-2400100', 'belagavi@bsctextiles.com', 'ACTIVE', NOW(3), NOW(3)),
        ('cmuzam5fr00024n4p4izbomev', 'DAV', 'Davanagere Mega Store', 'P.B. Road, Davanagere', 'Davanagere', 'Karnataka', '577001', '08192-250100', 'davanagere@bsctextiles.com', 'ACTIVE', NOW(3), NOW(3)),
        ('cmuzam5g400034n4p89o33l8e', 'SHI', 'Shivamogga Flagship', 'B.H. Road, Shivamogga', 'Shivamogga', 'Karnataka', '577201', '08182-270100', 'shivamogga@bsctextiles.com', 'ACTIVE', NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        \`status\` = 'ACTIVE',
        \`updatedAt\` = NOW(3)
    `);
  } catch (err: any) {
    console.warn('[setupOrganizationHubs] Location upsert notice:', err?.message || err);
  }

  // 2. Query actual active locations: BEL, DAV, SHI
  const [locations]: any = await pool.query(`SELECT id, code FROM location WHERE code IN ('BEL', 'DAV', 'SHI')`);
  const locMap = Object.fromEntries(locations.map((l: any) => [l.code, l.id]));

  const belLocId = locMap['BEL'] || 'cmuzam5fe00014n4pq25hkcww';
  const davLocId = locMap['DAV'] || 'cmuzam5fr00024n4p4izbomev';
  const shiLocId = locMap['SHI'] || 'cmuzam5g400034n4p89o33l8e';

  // 3. Ensure baseline ground floors exist
  const floorInserts = [
    { id: 'cmuzam5ia000e4n4powtzmu78', name: 'Ground Floor', floorNumber: 0, locationId: belLocId },
    { id: 'cmuzam5jp000m4n4p99oh4jy1', name: 'Ground Floor', floorNumber: 0, locationId: davLocId },
    { id: 'cmuzam5l2000u4n4pshxdhfny', name: 'Ground Floor', floorNumber: 0, locationId: shiLocId },
  ];
  for (const f of floorInserts) {
    await pool.query(
      `INSERT INTO \`floor\` (\`id\`, \`name\`, \`floorNumber\`, \`locationId\`, \`status\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, ?, ?, ?, 'ACTIVE', NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE \`status\` = 'ACTIVE', \`updatedAt\` = NOW(3)`,
      [f.id, f.name, f.floorNumber, f.locationId]
    ).catch(() => undefined);
  }

  // 4. Ensure core departments exist
  const depts = [
    { code: 'SALES', name: 'Sales & Retail' },
    { code: 'OPS', name: 'Store Operations' },
    { code: 'HR', name: 'Human Resources' },
    { code: 'FIN', name: 'Finance & Accounts' },
    { code: 'INV', name: 'Inventory & Logistics' },
    { code: 'CS', name: 'Customer Service & Billing' },
  ];

  for (const [code, locId] of [['BEL', belLocId], ['DAV', davLocId], ['SHI', shiLocId]]) {
    for (const d of depts) {
      await pool.query(
        `INSERT INTO \`department\` (\`id\`, \`name\`, \`code\`, \`locationId\`, \`createdAt\`, \`updatedAt\`)
         VALUES (?, ?, ?, ?, NOW(3), NOW(3))
         ON DUPLICATE KEY UPDATE \`name\` = VALUES(\`name\`), \`updatedAt\` = NOW(3)`,
        [`dept-${code.toLowerCase()}-${d.code.toLowerCase()}`, d.name, d.code, locId]
      ).catch(() => undefined);
    }
  }

  // 5. Ensure shifts exist
  for (const [code, locId] of [['BEL', belLocId], ['DAV', davLocId], ['SHI', shiLocId]]) {
    await pool.query(
      `INSERT INTO \`shift\` (\`id\`, \`name\`, \`code\`, \`locationId\`, \`startTime\`, \`endTime\`, \`gracePeriod\`, \`lateThreshold\`, \`status\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, 'General Shift', 'GENERAL', ?, '2024-01-01 09:30:00.000', '2024-01-01 19:30:00.000', 15, 30, 'ACTIVE', NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE \`status\` = 'ACTIVE', \`updatedAt\` = NOW(3)`,
      [`shift-gen-${code.toLowerCase()}`, locId]
    ).catch(() => undefined);

    await pool.query(
      `INSERT INTO \`shift\` (\`id\`, \`name\`, \`code\`, \`locationId\`, \`startTime\`, \`endTime\`, \`gracePeriod\`, \`lateThreshold\`, \`status\`, \`createdAt\`, \`updatedAt\`)
       VALUES (?, 'Night Shift', 'NIGHT', ?, '2024-01-01 22:00:00.000', '2024-01-02 06:00:00.000', 5, 15, 'ACTIVE', NOW(3), NOW(3))
       ON DUPLICATE KEY UPDATE \`status\` = 'ACTIVE', \`updatedAt\` = NOW(3)`,
      [`shift-night-${code.toLowerCase()}`, locId]
    ).catch(() => undefined);
  }

  // 6. Ensure ALL employees have status set
  await pool.query(`UPDATE employee SET status = 'ACTIVE' WHERE status IS NULL OR status = ''`).catch(() => undefined);

  cacheService.invalidatePrefix('locations');
  cacheService.invalidatePrefix('departments');
  cacheService.invalidatePrefix('shifts');
  console.log('[setupOrganizationHubs] Organization topology (BEL, DAV, SHI) synchronized successfully.');
}

if (process.argv[1] && process.argv[1].includes('setupOrganizationHubs')) {
  setupOrganizationHubs().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
}
