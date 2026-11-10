const { pool } = require('./src/nativeDb.ts');

async function createMissingTables() {
  // Create jwt_signing_key table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`jwt_signing_key\` (
        \`kid\` VARCHAR(64) NOT NULL PRIMARY KEY,
        \`algorithm\` VARCHAR(10) NOT NULL DEFAULT 'ES256',
        \`publicKeyPem\` TEXT NOT NULL,
        \`privateKeyPem\` TEXT NULL,
        \`status\` ENUM('active', 'retiring', 'retired') NOT NULL DEFAULT 'retiring',
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`activatedAt\` DATETIME(3) NULL,
        \`retiredAt\` DATETIME(3) NULL,
        \`expiresAt\` DATETIME(3) NULL,
        \`rotatedById\` VARCHAR(191) NULL,
        KEY \`idx_jwt_key_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('jwt_signing_key table created');
  } catch (err) {
    console.error('jwt_signing_key error:', err.message);
  }
  
  // Create ip_rules table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`ip_rules\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`type\` ENUM('allow', 'deny') NOT NULL,
        \`ipAddress\` VARCHAR(64) NULL,
        \`cidr\` VARCHAR(64) NULL,
        \`label\` VARCHAR(120) NULL,
        \`reason\` VARCHAR(255) NULL,
        \`source\` ENUM('manual', 'auto_block') NOT NULL DEFAULT 'manual',
        \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
        \`hits\` INT NOT NULL DEFAULT 0,
        \`expiresAt\` DATETIME(3) NULL,
        \`createdById\` VARCHAR(191) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY \`idx_ip_rules_type\` (\`type\`, \`enabled\`),
        KEY \`idx_ip_rules_expiry\` (\`expiresAt\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('ip_rules table created');
  } catch (err) {
    console.error('ip_rules error:', err.message);
  }
  
  // Create refresh_token table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`refresh_token\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`tokenHash\` CHAR(64) NOT NULL,
        \`familyId\` VARCHAR(64) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`sessionId\` VARCHAR(191) NULL,
        \`rotatedFromId\` VARCHAR(191) NULL,
        \`issuedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`revokedAt\` DATETIME(3) NULL,
        \`revokedReason\` VARCHAR(64) NULL,
        \`userAgent\` VARCHAR(255) NULL,
        \`ipAddress\` VARCHAR(64) NULL,
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`uq_refresh_tokenHash\` (\`tokenHash\`),
        KEY \`idx_refresh_user\` (\`userId\`, \`revokedAt\`),
        KEY \`idx_refresh_family\` (\`familyId\`),
        KEY \`idx_refresh_expiry\` (\`expiresAt\`),
        CONSTRAINT \`fk_refresh_user\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('refresh_token table created');
  } catch (err) {
    console.error('refresh_token error:', err.message);
  }
  
  // Create revoked_token table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`revoked_token\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`jti\` VARCHAR(191) NOT NULL,
        \`userId\` VARCHAR(191) NOT NULL,
        \`reason\` ENUM('LOGOUT','PASSWORD_CHANGE','MFA_CHANGE','ROLE_CHANGE','ADMIN_REVOKE','SESSION_EXPIRED','SECURITY_INCIDENT') NOT NULL,
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`RevokedToken_jti_key\` (\`jti\`),
        KEY \`RevokedToken_userId_idx\` (\`userId\`),
        KEY \`RevokedToken_expiresAt_idx\` (\`expiresAt\`),
        CONSTRAINT \`RevokedToken_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('revoked_token table created');
  } catch (err) {
    console.error('revoked_token error:', err.message);
  }
  
  // Create device_fingerprint table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`device_fingerprint\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`userId\` VARCHAR(191) NOT NULL,
        \`fingerprint\` VARCHAR(191) NOT NULL,
        \`userAgent\` TEXT NOT NULL,
        \`ipAddress\` VARCHAR(191) NOT NULL,
        \`trusted\` TINYINT(1) NOT NULL DEFAULT 0,
        \`lastSeenAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY \`DeviceFingerprint_userId_fingerprint_key\` (\`userId\`, \`fingerprint\`),
        KEY \`DeviceFingerprint_userId_idx\` (\`userId\`),
        CONSTRAINT \`DeviceFingerprint_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('device_fingerprint table created');
  } catch (err) {
    console.error('device_fingerprint error:', err.message);
  }
  
  // Create session table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`session\` (
        \`id\` VARCHAR(191) NOT NULL PRIMARY KEY,
        \`userId\` VARCHAR(191) NOT NULL,
        \`deviceId\` VARCHAR(191) NOT NULL,
        \`ipAddress\` VARCHAR(191) NOT NULL,
        \`userAgent\` TEXT NOT NULL,
        \`locationId\` VARCHAR(191) DEFAULT NULL,
        \`mfaVerified\` TINYINT(1) NOT NULL DEFAULT 0,
        \`riskScore\` INT NOT NULL DEFAULT 0,
        \`permissions\` JSON DEFAULT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`lastActivityAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        \`expiresAt\` DATETIME(3) NOT NULL,
        \`revoked\` TINYINT(1) NOT NULL DEFAULT 0,
        \`revokedAt\` DATETIME(3) DEFAULT NULL,
        \`revokedReason\` VARCHAR(191) DEFAULT NULL,
        KEY \`Session_userId_idx\` (\`userId\`),
        KEY \`Session_deviceId_idx\` (\`deviceId\`),
        KEY \`Session_expiresAt_idx\` (\`expiresAt\`),
        KEY \`Session_revoked_idx\` (\`revoked\`),
        CONSTRAINT \`Session_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`user\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`Session_locationId_fkey\` FOREIGN KEY (\`locationId\`) REFERENCES \`location\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('session table created');
  } catch (err) {
    console.error('session error:', err.message);
  }
  
  await pool.end();
  process.exit(0);
}

createMissingTables().catch(e => { console.error(e); process.exit(1); });