-- ===========================================================================
-- 033: CREDENTIALS, REFRESH-TOKEN ROTATION, SESSION AND IP-RULE STORAGE
--
-- Adds what the credential-management and token-rotation layers need:
--   * a real login ID on `user` (unique, Admin-assigned) plus credential
--     attribution and a token version for instant invalidation
--   * `refresh_token` with families, so reusing an old refresh token can revoke
--     the whole lineage instead of one row
--   * `jwt_signing_key` for RS256/ES256 with a `kid` and a rotation grace period
--   * `ip_rules` for the Admin allow/deny list
--   * columns on `login_attempt` and `session` for cooldown and auth method
--
-- Additive only: no table or column is dropped, no row is deleted. Existing
-- users get a login ID backfilled from the local part of their email.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Login identity on `user`
-- ---------------------------------------------------------------------------
ALTER TABLE `user` ADD COLUMN `loginId` VARCHAR(64) NULL;
ALTER TABLE `user` ADD COLUMN `credentialCreatedById` VARCHAR(191) NULL;
ALTER TABLE `user` ADD COLUMN `credentialUpdatedById` VARCHAR(191) NULL;
ALTER TABLE `user` ADD COLUMN `credentialUpdatedAt` DATETIME(3) NULL;
ALTER TABLE `user` ADD COLUMN `tokenVersion` INT NOT NULL DEFAULT 0;
ALTER TABLE `user` ADD COLUMN `mustChangePasswordReason` VARCHAR(64) NULL;
ALTER TABLE `user` ADD COLUMN `temporaryPasswordIssuedAt` DATETIME(3) NULL;
ALTER TABLE `user` ADD COLUMN `consecutiveLockouts` INT NOT NULL DEFAULT 0;
ALTER TABLE `user` ADD COLUMN `unlockedAt` DATETIME(3) NULL;
ALTER TABLE `user` ADD COLUMN `unlockedById` VARCHAR(191) NULL;

-- Backfill: the local part of the email, which is already unique per account.
UPDATE `user` SET `loginId` = LOWER(SUBSTRING_INDEX(`email`, '@', 1)) WHERE `loginId` IS NULL OR `loginId` = '';

-- Disambiguate any collision before the unique index can exist.
UPDATE `user` u
  JOIN (SELECT `loginId` AS lid, MIN(`id`) AS keepId FROM `user` GROUP BY `loginId` HAVING COUNT(*) > 1) d
    ON u.`loginId` = d.lid AND u.`id` <> d.keepId
   SET u.`loginId` = CONCAT(u.`loginId`, '_', LEFT(u.`id`, 6));

ALTER TABLE `user` ADD UNIQUE KEY `uq_user_loginId` (`loginId`);
ALTER TABLE `user` ADD KEY `idx_user_mustChange` (`mustChangePassword`);
ALTER TABLE `user` ADD KEY `idx_user_lockedUntil` (`lockedUntil`);

-- ---------------------------------------------------------------------------
-- 2. Refresh tokens with rotation families
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `refresh_token` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `tokenHash` CHAR(64) NOT NULL,
  `familyId` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `sessionId` VARCHAR(191) NULL,
  `rotatedFromId` VARCHAR(191) NULL,
  `issuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expiresAt` DATETIME(3) NOT NULL,
  `revokedAt` DATETIME(3) NULL,
  `revokedReason` VARCHAR(64) NULL,
  `userAgent` VARCHAR(255) NULL,
  `ipAddress` VARCHAR(64) NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_refresh_tokenHash` (`tokenHash`),
  KEY `idx_refresh_user` (`userId`, `revokedAt`),
  KEY `idx_refresh_family` (`familyId`),
  KEY `idx_refresh_expiry` (`expiresAt`),
  CONSTRAINT `fk_refresh_user` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Signing keys (kid + JWKS + rotation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `jwt_signing_key` (
  `kid` VARCHAR(64) NOT NULL PRIMARY KEY,
  `algorithm` VARCHAR(10) NOT NULL DEFAULT 'ES256',
  `publicKeyPem` TEXT NOT NULL,
  `privateKeyPem` TEXT NULL,
  `status` ENUM('active', 'retiring', 'retired') NOT NULL DEFAULT 'retiring',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `activatedAt` DATETIME(3) NULL,
  `retiredAt` DATETIME(3) NULL,
  `expiresAt` DATETIME(3) NULL,
  `rotatedById` VARCHAR(191) NULL,
  KEY `idx_jwt_key_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. Admin-managed IP allow/deny list
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `ip_rules` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `type` ENUM('allow', 'deny') NOT NULL,
  `ipAddress` VARCHAR(64) NULL,
  `cidr` VARCHAR(64) NULL,
  `label` VARCHAR(120) NULL,
  `reason` VARCHAR(255) NULL,
  `source` ENUM('manual', 'auto_block') NOT NULL DEFAULT 'manual',
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `hits` INT NOT NULL DEFAULT 0,
  `expiresAt` DATETIME(3) NULL,
  `createdById` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_ip_rules_type` (`type`, `enabled`),
  KEY `idx_ip_rules_expiry` (`expiresAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 5. Login attempts: cooldown bookkeeping
-- ---------------------------------------------------------------------------
ALTER TABLE `login_attempt` ADD COLUMN `loginId` VARCHAR(64) NULL;
ALTER TABLE `login_attempt` ADD COLUMN `captchaRequired` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `login_attempt` ADD COLUMN `cooldownUntil` DATETIME(3) NULL;
ALTER TABLE `login_attempt` ADD COLUMN `attemptCount` INT NOT NULL DEFAULT 0;
ALTER TABLE `login_attempt` ADD KEY `idx_login_attempt_login` (`loginId`, `createdAt`);
ALTER TABLE `login_attempt` ADD KEY `idx_login_attempt_ip` (`ipAddress`, `createdAt`);

-- ---------------------------------------------------------------------------
-- 6. Sessions: idle expiry and how the session was authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE `session` ADD COLUMN `idleExpiresAt` DATETIME(3) NULL;
ALTER TABLE `session` ADD COLUMN `authMethod` VARCHAR(20) NOT NULL DEFAULT 'PASSWORD';
ALTER TABLE `session` ADD COLUMN `mfaRequired` TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE `session` ADD COLUMN `tokenFamilyId` VARCHAR(64) NULL;
ALTER TABLE `session` ADD COLUMN `revokedById` VARCHAR(191) NULL;
ALTER TABLE `session` ADD KEY `idx_session_active` (`userId`, `revoked`, `expiresAt`);

-- Existing sessions get an idle deadline so the new validator does not reject
-- them for a missing column.
UPDATE `session` SET `idleExpiresAt` = `expiresAt` WHERE `idleExpiresAt` IS NULL AND `revoked` = 0;
