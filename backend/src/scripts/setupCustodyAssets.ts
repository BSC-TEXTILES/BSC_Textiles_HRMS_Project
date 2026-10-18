import { pool } from '../nativeDb.js';

export async function setupCustodyAssets(options?: { schemaOnly?: boolean }) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS employee_custody_assets (
      id VARCHAR(191) PRIMARY KEY,
      employeeId VARCHAR(191) NOT NULL,
      assetName VARCHAR(191) NOT NULL,
      assetType ENUM('HANDHELD_SCANNER', 'STAFF_LOCKER', 'RFID_SECURITY_CARD', 'POS_TERMINAL', 'OTHER') DEFAULT 'OTHER',
      serialNumber VARCHAR(191) NOT NULL,
      locationId VARCHAR(191) NULL,
      status ENUM('ASSIGNED', 'ACKNOWLEDGED', 'RETURN_REQUESTED', 'RETURNED') DEFAULT 'ASSIGNED',
      issuedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      acknowledgedAt DATETIME(3) NULL,
      returnedAt DATETIME(3) NULL,
      notes VARCHAR(255) NULL,
      createdAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
      updatedAt DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      INDEX idx_emp (employeeId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  console.log('employee_custody_assets table verified/created.');

  if (options?.schemaOnly) {
    console.log('setupCustodyAssets: schema/reference shaping complete; the invented asset custody records were not seeded (boot fixtures disabled).');
    return;
  }
  const [countRows]: any = await pool.query('SELECT count(*) as c FROM employee_custody_assets');
  if (countRows[0].c === 0) {
    const [emps]: any = await pool.query('SELECT id, employeeCode, fullName, locationId FROM employee LIMIT 50');
    for (const emp of emps) {
      const codeSuffix = (emp.employeeCode || '4029').replace(/[^0-9]/g, '').slice(-4) || '4029';
      await pool.query(
        `INSERT INTO employee_custody_assets (id, employeeId, assetName, assetType, serialNumber, locationId, status, notes)
         VALUES 
         (CONCAT('asset_', UUID()), ?, 'Zebra TC52 Touch Computer', 'HANDHELD_SCANNER', ?, ?, 'ASSIGNED', 'Handheld 2D Barcode RFID Scanner'),
         (CONCAT('asset_', UUID()), ?, 'Staff Locker Key #B-14', 'STAFF_LOCKER', 'KEY-B14-LKR', ?, 'ASSIGNED', 'Basement Locker Wing B'),
         (CONCAT('asset_', UUID()), ?, 'Security RFID Keycard', 'RFID_SECURITY_CARD', '#BEL-VLT-12', ?, 'ASSIGNED', 'Vault Level 1 Active Security Credential')`,
        [
          emp.id, `SN: #TC52-BEL-${codeSuffix}`, emp.locationId,
          emp.id, emp.locationId,
          emp.id, emp.locationId,
        ]
      );
    }
    console.log(`Successfully seeded custody assets for ${emps.length} employees.`);
  } else {
    console.log(`Custody assets already present: ${countRows[0].c} items.`);
  }
}

if (process.argv[1]?.includes('setupCustodyAssets')) {
  setupCustodyAssets()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error setting up custody assets:', err);
      process.exit(1);
    });
}
