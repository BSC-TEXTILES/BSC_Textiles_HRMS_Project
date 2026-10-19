import { pool } from '../nativeDb.js';

export async function ensureRawPunchColumns() {
  const [cols]: any = await pool.query('SHOW COLUMNS FROM biometric_raw_punches');
  const existing = new Set(cols.map((c: any) => c.Field));
  const statements = [
    { col: 'employeeId', sql: 'ALTER TABLE `biometric_raw_punches` ADD COLUMN `employeeId` VARCHAR(191) NULL AFTER `deviceId`' },
    { col: 'punchTimeUtc', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `punchTimeUtc` DATETIME(3) NULL COMMENT 'Authoritative UTC wall time of the punch'" },
    { col: 'rawDeviceTimeString', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawDeviceTimeString` VARCHAR(32) NULL COMMENT 'Exactly the timestamp text/number the device sent'" },
    { col: 'rawTimezone', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawTimezone` VARCHAR(64) NULL COMMENT 'Timezone that rawDeviceTimeString was interpreted in'" },
    { col: 'rawVerifyType', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawVerifyType` INT NULL COMMENT 'Unmodified verify code from the terminal'" },
    { col: 'rawPunchState', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `rawPunchState` INT NULL COMMENT 'Unmodified punch status/state byte from the terminal'" },
    { col: 'verifyModeLabel', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `verifyModeLabel` VARCHAR(40) NULL COMMENT 'Method resolved from verify_mode_mapping at ingest'" },
    { col: 'workCode', sql: 'ALTER TABLE `biometric_raw_punches` ADD COLUMN `workCode` VARCHAR(32) NULL' },
    { col: 'matchValue', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `matchValue` DECIMAL(6,2) NULL COMMENT 'Device-reported match score, if the firmware sends one'" },
    { col: 'photoPath', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `photoPath` VARCHAR(500) NULL COMMENT 'Relative path under uploads/attendance/'" },
    { col: 'mappingStatus', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `mappingStatus` ENUM('MAPPED','AMBIGUOUS','UNMAPPED','INVALID_TIME') NOT NULL DEFAULT 'MAPPED'" },
    { col: 'mappingCandidates', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `mappingCandidates` JSON NULL COMMENT 'Employee ids that matched, when ambiguous'" },
    { col: 'normalizedId', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `normalizedId` VARCHAR(64) NULL COMMENT 'Id after trim / leading-zero strip'" },
    { col: 'source', sql: "ALTER TABLE `biometric_raw_punches` ADD COLUMN `source` ENUM('ADMS_PUSH','ZK_PULL','CONNECTOR','MANUAL','CALIBRATION') NOT NULL DEFAULT 'ADMS_PUSH'" },
    { col: 'assignedById', sql: 'ALTER TABLE `biometric_raw_punches` ADD COLUMN `assignedById` VARCHAR(191) NULL' },
    { col: 'assignedAt', sql: 'ALTER TABLE `biometric_raw_punches` ADD COLUMN `assignedAt` DATETIME(3) NULL' }
  ];

  for (const s of statements) {
    if (!existing.has(s.col)) {
      console.log(`[migration] Adding missing column ${s.col} to biometric_raw_punches...`);
      await pool.query(s.sql);
    }
  }

  // Populate punchTimeUtc from punchTime if any rows exist without it
  await pool.query('UPDATE biometric_raw_punches SET punchTimeUtc = punchTime WHERE punchTimeUtc IS NULL AND punchTime IS NOT NULL').catch(() => {});
  console.log('[migration] biometric_raw_punches schema verified.');
}

if (process.argv[1]?.endsWith('ensureRawPunchColumns.ts') || process.argv[1]?.endsWith('ensureRawPunchColumns.js')) {
  ensureRawPunchColumns()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
