-- ===========================================================================
-- 013: FIX AUDITLOG ACTION ENUM AND USER STATUS
-- Widen auditlog.action to varchar(100) and ensure active users are ACTIVE
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE `auditlog` MODIFY COLUMN `action` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL;

UPDATE `user` SET `status` = 'ACTIVE' WHERE `isActive` = 1 AND (`status` IS NULL OR `status` = 'PENDING_EMAIL_VERIFICATION');

SET FOREIGN_KEY_CHECKS = 1;
