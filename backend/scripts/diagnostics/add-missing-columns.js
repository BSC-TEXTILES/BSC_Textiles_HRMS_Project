const { pool } = require('./src/nativeDb.ts');

async function addMissingColumns() {
  const columns = [
    'ALTER TABLE `user` ADD COLUMN `loginId` VARCHAR(191) NULL',
    'ALTER TABLE `user` ADD COLUMN `lockedUntil` DATETIME(3) NULL',
    'ALTER TABLE `user` ADD COLUMN `mustChangePassword` TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE `user` ADD COLUMN `passwordExpiresAt` DATETIME(3) NULL',
    'ALTER TABLE `user` ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 0',
    'ALTER TABLE `user` ADD COLUMN `mfaEnabled` TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE `user` ADD COLUMN `mfaVerified` TINYINT(1) NOT NULL DEFAULT 0',
    'ALTER TABLE `user` ADD COLUMN `credentialCreatedById` VARCHAR(191) NULL',
    'ALTER TABLE `user` ADD COLUMN `credentialUpdatedById` VARCHAR(191) NULL',
    'ALTER TABLE `user` ADD COLUMN `credentialUpdatedAt` DATETIME(3) NULL',
    'ALTER TABLE `user` ADD COLUMN `mustChangePasswordReason` VARCHAR(64) NULL',
    'ALTER TABLE `user` ADD COLUMN `temporaryPasswordIssuedAt` DATETIME(3) NULL',
    'ALTER TABLE `user` ADD COLUMN `consecutiveLockouts` INT NOT NULL DEFAULT 0',
    'ALTER TABLE `user` ADD COLUMN `unlockedAt` DATETIME(3) NULL',
    'ALTER TABLE `user` ADD COLUMN `unlockedById` VARCHAR(191) NULL',
  ];
  
  for (const sql of columns) {
    try {
      await pool.query(sql);
      console.log('OK:', sql.substring(0, 60) + '...');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
        console.log('SKIP:', sql.substring(0, 60) + '...');
      } else {
        console.error('ERROR:', err.message);
      }
    }
  }
  
  // Add status column with proper enum
  try {
    await pool.query('ALTER TABLE `user` ADD COLUMN `status` ENUM("PENDING_EMAIL_VERIFICATION","PENDING_APPROVAL","ACTIVE","REJECTED","SUSPENDED","DISABLED") NOT NULL DEFAULT "ACTIVE"');
    console.log('OK: status column');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME' || err.errno === 1060) {
      console.log('SKIP: status column');
    } else {
      console.error('ERROR status:', err.message);
    }
  }
  
  const indexes = [
    'ALTER TABLE `user` ADD UNIQUE KEY `uq_user_loginId` (`loginId`)',
    'ALTER TABLE `user` ADD KEY `idx_user_status` (`status`)',
    'ALTER TABLE `user` ADD KEY `idx_user_lockedUntil` (`lockedUntil`)',
    'ALTER TABLE `user` ADD KEY `idx_user_mustChange` (`mustChangePassword`)',
  ];
  
  for (const sql of indexes) {
    try {
      await pool.query(sql);
      console.log('OK Index:', sql);
    } catch (err) {
      if (err.code === 'ER_DUP_KEYNAME' || err.errno === 1061) {
        console.log('SKIP Index:', sql);
      } else {
        console.error('INDEX ERROR:', err.message);
      }
    }
  }
  
  await pool.end();
  process.exit(0);
}

addMissingColumns().catch(e => { console.error(e); process.exit(1); });