-- ===========================================================================
-- 011: ADD PASSWORD SECURITY FIELDS
-- Password history, rotation, and breach tracking
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `password_history` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `passwordHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `PasswordHistory_userId_idx` (`userId`),
  CONSTRAINT `PasswordHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `user` 
  ADD COLUMN `passwordChangedAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `passwordExpiresAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `failedLoginAttempts` int NOT NULL DEFAULT '0',
  ADD COLUMN `lockedUntil` datetime(3) DEFAULT NULL,
  ADD COLUMN `lastFailedLoginAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `mustChangePassword` tinyint(1) NOT NULL DEFAULT '0';

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 012: ADD MFA FIELDS
-- Multi-factor authentication devices and challenges
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `mfa_device` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('totp','webauthn') COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `secret` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `credentialId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `publicKey` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `counter` bigint NOT NULL DEFAULT '0',
  `transports` json DEFAULT NULL,
  `backupCodes` json DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastUsedAt` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `MfaDevice_userId_idx` (`userId`),
  KEY `MfaDevice_credentialId_idx` (`credentialId`),
  CONSTRAINT `MfaDevice_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `mfa_challenge` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('webauthn_registration','webauthn_authentication') COLLATE utf8mb4_unicode_ci NOT NULL,
  `challenge` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `MfaChallenge_userId_idx` (`userId`),
  KEY `MfaChallenge_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `MfaChallenge_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `user`
  ADD COLUMN `mfaEnabled` tinyint(1) NOT NULL DEFAULT '0',
  ADD COLUMN `mfaRequired` tinyint(1) NOT NULL DEFAULT '0';

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 013: ADD SESSION TABLE
-- Server-side session management with Redis sync
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `session` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userAgent` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mfaVerified` tinyint(1) NOT NULL DEFAULT '0',
  `riskScore` int NOT NULL DEFAULT '0',
  `permissions` json DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `lastActivityAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `expiresAt` datetime(3) NOT NULL,
  `revoked` tinyint(1) NOT NULL DEFAULT '0',
  `revokedAt` datetime(3) DEFAULT NULL,
  `revokedReason` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `Session_userId_idx` (`userId`),
  KEY `Session_deviceId_idx` (`deviceId`),
  KEY `Session_expiresAt_idx` (`expiresAt`),
  KEY `Session_revoked_idx` (`revoked`),
  CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Session_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `device_fingerprint` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fingerprint` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userAgent` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `trusted` tinyint(1) NOT NULL DEFAULT '0',
  `lastSeenAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `DeviceFingerprint_userId_fingerprint_key` (`userId`,`fingerprint`),
  KEY `DeviceFingerprint_userId_idx` (`userId`),
  CONSTRAINT `DeviceFingerprint_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 014: ADD ACCOUNT STATUS AND VERIFICATION TOKENS
-- Account lifecycle management
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `user`
  ADD COLUMN `status` enum('PENDING_EMAIL_VERIFICATION','PENDING_APPROVAL','ACTIVE','REJECTED','SUSPENDED','DISABLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING_EMAIL_VERIFICATION' AFTER `isActive`,
  ADD COLUMN `emailVerifiedAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `emailVerificationToken` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `emailVerificationExpiresAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `approvedAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `rejectedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `rejectedAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `rejectionReason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `suspendedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `suspendedAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `suspensionReason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `disabledById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `disabledAt` datetime(3) DEFAULT NULL,
  ADD COLUMN `disableReason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD KEY `User_status_idx` (`status`),
  ADD KEY `User_approvedById_fkey` (`approvedById`),
  ADD KEY `User_rejectedById_fkey` (`rejectedById`),
  ADD KEY `User_suspendedById_fkey` (`suspendedById`),
  ADD KEY `User_disabledById_fkey` (`disabledById`),
  ADD CONSTRAINT `User_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `User_rejectedById_fkey` FOREIGN KEY (`rejectedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `User_suspendedById_fkey` FOREIGN KEY (`suspendedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `User_disabledById_fkey` FOREIGN KEY (`disabledById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 015: ADD APPROVAL TOKENS
-- Secure tokens for account approval workflow
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `approval_token` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('ACCOUNT_APPROVAL','PASSWORD_RESET','EMAIL_CHANGE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `usedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ApprovalToken_userId_idx` (`userId`),
  KEY `ApprovalToken_tokenHash_idx` (`tokenHash`),
  KEY `ApprovalToken_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `ApprovalToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 016: ADD PASSWORD RESET TOKENS AND LOCKOUT FIELDS
-- Password reset and account lockout tracking
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `password_reset_token` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `tokenHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `used` tinyint(1) NOT NULL DEFAULT '0',
  `usedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `PasswordResetToken_userId_idx` (`userId`),
  KEY `PasswordResetToken_tokenHash_idx` (`tokenHash`),
  KEY `PasswordResetToken_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `PasswordResetToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `login_attempt` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userAgent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `success` tinyint(1) NOT NULL,
  `failureReason` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deviceFingerprint` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `LoginAttempt_email_createdAt_idx` (`email`,`createdAt`),
  KEY `LoginAttempt_ipAddress_createdAt_idx` (`ipAddress`,`createdAt`),
  KEY `LoginAttempt_userId_idx` (`userId`),
  KEY `LoginAttempt_success_idx` (`success`),
  CONSTRAINT `LoginAttempt_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `LoginAttempt_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 017: ADD REVOKED TOKENS TABLE
-- JWT blocklist for immediate revocation
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `revoked_token` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `jti` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` enum('LOGOUT','PASSWORD_CHANGE','MFA_CHANGE','ROLE_CHANGE','ADMIN_REVOKE','SESSION_EXPIRED','SECURITY_INCIDENT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `expiresAt` datetime(3) NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `RevokedToken_jti_key` (`jti`),
  KEY `RevokedToken_userId_idx` (`userId`),
  KEY `RevokedToken_expiresAt_idx` (`expiresAt`),
  CONSTRAINT `RevokedToken_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 018: ADD FILE METADATA AND SECURITY TABLES
-- Secure file upload tracking
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `file_upload` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `originalName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `storedName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mimeType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `extension` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `size` bigint NOT NULL,
  `sha256` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `magicBytes` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('UPLOADING','SCANNING','QUARANTINED','APPROVED','REJECTED','INFECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'UPLOADING',
  `scanResult` json DEFAULT NULL,
  `scanEngine` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scanVersion` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scannedAt` datetime(3) DEFAULT NULL,
  `quarantineReason` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `downloadUrl` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `downloadExpiresAt` datetime(3) DEFAULT NULL,
  `downloadCount` int NOT NULL DEFAULT '0',
  `relatedEntityType` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `relatedEntityId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `FileUpload_userId_idx` (`userId`),
  KEY `FileUpload_status_idx` (`status`),
  KEY `FileUpload_sha256_idx` (`sha256`),
  KEY `FileUpload_relatedEntity_idx` (`relatedEntityType`,`relatedEntityId`),
  KEY `FileUpload_createdAt_idx` (`createdAt`),
  CONSTRAINT `FileUpload_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FileUpload_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `malware_signature` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `pattern` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('hash','yara','regex') COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `MalwareSignature_enabled_idx` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 019: ENHANCE AUDIT LOGS
-- Tamper-resistant audit logging with hash chains
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `auditlog`
  ADD COLUMN `correlationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `sessionId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `riskScore` int NOT NULL DEFAULT '0',
  ADD COLUMN `tags` json DEFAULT NULL,
  ADD COLUMN `hash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `previousHash` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `integrityVerified` tinyint(1) NOT NULL DEFAULT '0',
  ADD KEY `AuditLog_correlationId_idx` (`correlationId`),
  ADD KEY `AuditLog_sessionId_idx` (`sessionId`),
  ADD KEY `AuditLog_riskScore_idx` (`riskScore`),
  ADD KEY `AuditLog_hash_idx` (`hash`);

SET FOREIGN_KEY_CHECKS = 1;

-- ===========================================================================
-- 020: ADD SECURITY EVENTS TABLE
-- Security monitoring and anomaly detection
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `security_event` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('BRUTE_FORCE','PASSWORD_SPRAY','IMPOSSIBLE_TRAVEL','NEW_DEVICE','NEW_LOCATION','PRIVILEGE_ESCALATION','MASS_EXPORT','MALWARE_DETECTED','AUDIT_LOG_GAP','CONFIG_CHANGE','ACCOUNT_TAKEOVER_ATTEMPT','SESSION_HIJACK_ATTEMPT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `severity` enum('LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details` json NOT NULL,
  `riskScore` int NOT NULL DEFAULT '0',
  `acknowledged` tinyint(1) NOT NULL DEFAULT '0',
  `acknowledgedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `acknowledgedAt` datetime(3) DEFAULT NULL,
  `resolved` tinyint(1) NOT NULL DEFAULT '0',
  `resolvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `resolvedAt` datetime(3) DEFAULT NULL,
  `resolutionNotes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `SecurityEvent_type_idx` (`type`),
  KEY `SecurityEvent_severity_idx` (`severity`),
  KEY `SecurityEvent_userId_idx` (`userId`),
  KEY `SecurityEvent_ipAddress_idx` (`ipAddress`),
  KEY `SecurityEvent_createdAt_idx` (`createdAt`),
  KEY `SecurityEvent_acknowledged_idx` (`acknowledged`),
  KEY `SecurityEvent_resolved_idx` (`resolved`),
  CONSTRAINT `SecurityEvent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `SecurityEvent_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `SecurityEvent_acknowledgedById_fkey` FOREIGN KEY (`acknowledgedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `SecurityEvent_resolvedById_fkey` FOREIGN KEY (`resolvedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `security_alert_rule` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `eventType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `condition` json NOT NULL,
  `severity` enum('LOW','MEDIUM','HIGH','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `enabled` tinyint(1) NOT NULL DEFAULT '1',
  `cooldownMinutes` int NOT NULL DEFAULT '60',
  `notificationChannels` json NOT NULL,
  `lastTriggeredAt` datetime(3) DEFAULT NULL,
  `triggerCount` int NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `SecurityAlertRule_enabled_idx` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;