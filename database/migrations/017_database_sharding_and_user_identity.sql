-- ==============================================================================
-- BSC TEXTILES HRMS - DATABASE SHARDING, USER IDENTITY & ROUTING REGISTRY
-- Migration 017: Multi-Tenant Location Sharding Architecture
-- ==============================================================================

-- 1. Database Shard Registry Table
CREATE TABLE IF NOT EXISTS `database_shards` (
  `database_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shard_name` VARCHAR(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_code` VARCHAR(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_id` VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `database_name` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `secret_reference` VARCHAR(128) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ENV_MYSQL_DEFAULT',
  `is_control_shard` TINYINT(1) NOT NULL DEFAULT 0,
  `is_writable` TINYINT(1) NOT NULL DEFAULT 1,
  `is_readable` TINYINT(1) NOT NULL DEFAULT 1,
  `status` ENUM('ACTIVE','READ_ONLY','MAINTENANCE','OFFLINE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `health_status` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'HEALTHY',
  `last_health_check_at` DATETIME(3) DEFAULT NULL,
  `latency_ms` INT NOT NULL DEFAULT 0,
  `schema_version` VARCHAR(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '1.0.0',
  `active_connections` INT NOT NULL DEFAULT 0,
  `total_users` INT NOT NULL DEFAULT 0,
  `total_employees` INT NOT NULL DEFAULT 0,
  `notes` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`database_id`),
  KEY `idx_db_shards_status` (`status`),
  KEY `idx_db_shards_loc` (`location_code`),
  KEY `idx_db_shards_location_id` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. User to Database Shard Assignment Table
CREATE TABLE IF NOT EXISTS `user_database_assignments` (
  `id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_id` VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `database_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` ENUM('ACTIVE','MIGRATING','REVOKED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `assignment_type` ENUM('LOCATION_DEFAULT','EXPLICIT_OVERRIDE','CROSS_SHARD_ADMIN') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'LOCATION_DEFAULT',
  `assigned_by` VARCHAR(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_active_assignment` (`user_id`, `status`),
  KEY `idx_uda_database_id` (`database_id`),
  KEY `idx_uda_location_id` (`location_id`),
  KEY `idx_uda_employee_id` (`employee_id`),
  CONSTRAINT `fk_uda_database_id` FOREIGN KEY (`database_id`) REFERENCES `database_shards` (`database_id`) ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Shard Migration Tracking Table
CREATE TABLE IF NOT EXISTS `shard_migrations` (
  `id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `migration_name` VARCHAR(128) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shard_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_id` VARCHAR(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` ENUM('PENDING','IN_PROGRESS','COMPLETED','FAILED','ROLLED_BACK') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `records_migrated` INT NOT NULL DEFAULT 0,
  `details` JSON DEFAULT NULL,
  `error_message` TEXT COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `completed_at` DATETIME(3) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_sm_shard_id` (`shard_id`),
  KEY `idx_sm_status` (`status`),
  KEY `idx_sm_batch_id` (`batch_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Alter user table to add permanent logical database_id
SET @dbname = DATABASE();
SET @tablename = "user";
SET @columnname = "database_id";
SET @preparedStatement = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND COLUMN_NAME = @columnname
  ) > 0,
  "SELECT 1",
  "ALTER TABLE `user` ADD COLUMN `database_id` VARCHAR(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `locationId`;"
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Ensure index on user.database_id
SET @preparedStatementIndex = (SELECT IF(
  (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS
    WHERE
      TABLE_SCHEMA = @dbname
      AND TABLE_NAME = @tablename
      AND INDEX_NAME = 'idx_user_database_id'
  ) > 0,
  "SELECT 1",
  "CREATE INDEX `idx_user_database_id` ON `user` (`database_id`);"
));
PREPARE createIndexIfNotExists FROM @preparedStatementIndex;
EXECUTE createIndexIfNotExists;
DEALLOCATE PREPARE createIndexIfNotExists;

-- 5. Seed Core Shards into registry
INSERT INTO `database_shards` (
  `database_id`, `shard_name`, `location_code`, `location_id`, `database_name`, 
  `secret_reference`, `is_control_shard`, `is_writable`, `is_readable`, `status`, `health_status`, `schema_version`, `notes`
) VALUES
  ('BSC-SHARD-HQ-001', 'Headquarters & Central Control', 'HQ', NULL, 'bsc_textiles_hrms', 'DATABASE_URL_HQ', 1, 1, 1, 'ACTIVE', 'HEALTHY', '1.0.0', 'Primary metadata, security identities, global routing & centralized repository'),
  ('BSC-SHARD-BEL-001', 'Belagavi Operational Store Shard', 'BEL', 'cmuwszr8t00011vdtc7vgvags', 'bsc_shard_bel', 'DATABASE_URL_BEL', 0, 1, 1, 'ACTIVE', 'HEALTHY', '1.0.0', 'Belagavi Head Store showroom operational data, staff & biometric sync'),
  ('BSC-SHARD-DAV-001', 'Davanagere Mega Store Shard', 'DAV', 'cmuwszr9500021vdtxscy3nsc', 'bsc_shard_dav', 'DATABASE_URL_DAV', 0, 1, 1, 'ACTIVE', 'HEALTHY', '1.0.0', 'Davanagere Mega Store showroom operational data, staff & biometric sync'),
  ('BSC-SHARD-SHI-001', 'Shivamogga Flagship Shard', 'SHI', 'cmuwszr9s00031vdtqlwzkrw8', 'bsc_shard_shi', 'DATABASE_URL_SHI', 0, 1, 1, 'ACTIVE', 'HEALTHY', '1.0.0', 'Shivamogga Flagship showroom operational data, staff & biometric sync')
ON DUPLICATE KEY UPDATE
  `shard_name` = VALUES(`shard_name`),
  `database_name` = VALUES(`database_name`),
  `secret_reference` = VALUES(`secret_reference`),
  `is_control_shard` = VALUES(`is_control_shard`),
  `is_writable` = VALUES(`is_writable`),
  `is_readable` = VALUES(`is_readable`),
  `status` = VALUES(`status`),
  `updated_at` = CURRENT_TIMESTAMP(3);

-- 6. Backfill User Database ID and Persistent Assignments
-- 6a. Belagavi users
UPDATE `user` SET `database_id` = 'BSC-SHARD-BEL-001' 
WHERE `locationId` = 'cmuwszr8t00011vdtc7vgvags' AND (`database_id` IS NULL OR `database_id` = '');

-- 6b. Davanagere users
UPDATE `user` SET `database_id` = 'BSC-SHARD-DAV-001' 
WHERE `locationId` = 'cmuwszr9500021vdtxscy3nsc' AND (`database_id` IS NULL OR `database_id` = '');

-- 6c. Shivamogga users
UPDATE `user` SET `database_id` = 'BSC-SHARD-SHI-001' 
WHERE `locationId` = 'cmuwszr9s00031vdtqlwzkrw8' AND (`database_id` IS NULL OR `database_id` = '');

-- 6d. HQ / Global / Super Admin users
UPDATE `user` SET `database_id` = 'BSC-SHARD-HQ-001' 
WHERE (`locationId` IS NULL OR `role` = 'SUPER_ADMIN') AND (`database_id` IS NULL OR `database_id` = '');

-- Fallback for any other user
UPDATE `user` SET `database_id` = 'BSC-SHARD-HQ-001' WHERE `database_id` IS NULL OR `database_id` = '';

-- 6e. Insert records into user_database_assignments from user table
INSERT IGNORE INTO `user_database_assignments` (
  `id`, `user_id`, `employee_id`, `location_id`, `database_id`, `status`, `assignment_type`, `assigned_by`, `assigned_at`
)
SELECT 
  CONCAT('uda_', u.id) AS `id`,
  u.id AS `user_id`,
  u.employeeId AS `employee_id`,
  u.locationId AS `location_id`,
  u.database_id AS `database_id`,
  'ACTIVE' AS `status`,
  IF(u.role = 'SUPER_ADMIN', 'CROSS_SHARD_ADMIN', 'LOCATION_DEFAULT') AS `assignment_type`,
  'SYSTEM_SHARD_MIGRATOR' AS `assigned_by`,
  CURRENT_TIMESTAMP(3) AS `assigned_at`
FROM `user` u
WHERE u.database_id IS NOT NULL;

-- 7. Update Shard Registry Stats
UPDATE `database_shards` ds
SET `total_users` = (
  SELECT COUNT(*) FROM `user_database_assignments` uda 
  WHERE uda.database_id = ds.database_id AND uda.status = 'ACTIVE'
);
