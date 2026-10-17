-- ===========================================================================
-- 034: CONSENT RECORDS, DATA REQUESTS, RETENTION SCHEDULE, SECURITY CONFIG
--
-- Privacy and configuration storage for the security layer:
--   * `cookie_consent`   — one row per consent state per visitor, versioned so a
--                          policy change re-prompts
--   * `data_request`     — export / erasure / restriction workflow (GDPR, DPDP)
--   * `retention_policy` — how long each log class is kept, and when it was last
--                          purged (the purge itself is executed by the worker)
--   * `security_config`  — the handful of settings an Admin may change at
--                          runtime (password expiry, MFA requirement, …);
--                          everything else stays in the environment
--
-- Additive only.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS `cookie_consent` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `visitorId` VARCHAR(64) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `policyVersion` VARCHAR(20) NOT NULL,
  `necessary` TINYINT(1) NOT NULL DEFAULT 1,
  `analytics` TINYINT(1) NOT NULL DEFAULT 0,
  `preferences` TINYINT(1) NOT NULL DEFAULT 0,
  `ipAddress` VARCHAR(64) NULL,
  `userAgent` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_consent_visitor_version` (`visitorId`, `policyVersion`),
  KEY `idx_consent_user` (`userId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `data_request` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `userId` VARCHAR(191) NOT NULL,
  `type` ENUM('EXPORT', 'ERASURE', 'RESTRICTION', 'CORRECTION') NOT NULL,
  `status` ENUM('PENDING', 'IN_REVIEW', 'COMPLETED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
  `scope` JSON NULL,
  `note` TEXT NULL,
  `artifactPath` VARCHAR(255) NULL,
  `requestedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `verifiedById` VARCHAR(191) NULL,
  `completedAt` DATETIME(3) NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY `idx_data_request_user` (`userId`, `status`),
  KEY `idx_data_request_status` (`status`, `requestedAt`),
  CONSTRAINT `fk_data_request_user` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `retention_policy` (
  `id` VARCHAR(191) NOT NULL PRIMARY KEY,
  `name` VARCHAR(64) NOT NULL,
  `description` VARCHAR(255) NULL,
  `targetTable` VARCHAR(64) NOT NULL,
  `dateColumn` VARCHAR(64) NOT NULL,
  `retentionDays` INT NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `lastPurgedAt` DATETIME(3) NULL,
  `lastPurgedRows` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_retention_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Defaults mirror RETENTION_* in .env.example. A row is only edited by an
-- Admin; the purge job deletes log rows older than `retentionDays`, which is
-- the one place in this migration set where data is removed — and it is the
-- removal the policy exists to require.
INSERT INTO `retention_policy` (`id`, `name`, `description`, `targetTable`, `dateColumn`, `retentionDays`, `enabled`) VALUES
  ('ret_audit_logs',     'Audit logs',        'Tamper-evident audit trail',                'auditlog',      'createdAt', 730, 1),
  ('ret_login_attempts', 'Login attempts',    'Sign-in attempts including failures',       'login_attempt', 'createdAt', 180, 1),
  ('ret_sessions',       'Expired sessions',  'Session rows once they are no longer live', 'session',       'expiresAt',  90, 1),
  ('ret_revoked_tokens', 'Revoked tokens',    'Blocklist entries after natural expiry',    'revoked_token', 'expiresAt',  30, 1),
  ('ret_refresh_tokens', 'Refresh tokens',    'Rotated or revoked refresh tokens',         'refresh_token', 'expiresAt',  30, 1),
  ('ret_security_events','Security events',   'Detection and alert events',                'security_event','createdAt',  365, 1)
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`), `targetTable` = VALUES(`targetTable`),
                        `dateColumn` = VALUES(`dateColumn`);

CREATE TABLE IF NOT EXISTS `security_config` (
  `key` VARCHAR(64) NOT NULL PRIMARY KEY,
  `value` VARCHAR(255) NOT NULL,
  `description` VARCHAR(255) NULL,
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `updatedById` VARCHAR(191) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `security_config` (`key`, `value`, `description`) VALUES
  ('password_expiry_days', '90', '0 disables forced expiry; env PASSWORD_EXPIRY_DAYS is the default'),
  ('mfa_required_for_privileged', 'false', 'Require TOTP for Admin and Super Admin logins'),
  ('single_active_session', 'false', 'Allow only one live session per user'),
  ('admin_ip_allowlist_enabled', 'false', 'Restrict Admin/Super Admin sign-in to the allowlist')
ON DUPLICATE KEY UPDATE `description` = VALUES(`description`);
