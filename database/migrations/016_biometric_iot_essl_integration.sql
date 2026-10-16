-- ===========================================================================
-- 016: BIOMETRIC ATTENDANCE, IoT & eSSL DEVICE INTEGRATION
-- Hardware device registry, raw immutable punch ledger, employee biometric mappings,
-- and synchronization audit history for BSC Textiles HRMS showrooms (BEL, DAV, SHI).
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. Biometric Devices Registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_devices` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `serialNumber` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `model` VARCHAR(100) NOT NULL DEFAULT 'eSSL SilkBio-101TC',
  `firmwareVersion` VARCHAR(100) NOT NULL DEFAULT 'ZKFinger VX10.0 / v4.2.1-prod',
  `ipAddress` VARCHAR(45) NOT NULL,
  `port` INT NOT NULL DEFAULT 4370,
  `locationId` VARCHAR(36) NULL,
  `locationCode` VARCHAR(10) NOT NULL DEFAULT 'BEL',
  `status` ENUM('CONNECTED', 'DISCONNECTED', 'SYNC_PENDING', 'SYNC_FAILED', 'CONFIG_INCOMPLETE', 'SDK_UNAVAILABLE') NOT NULL DEFAULT 'DISCONNECTED',
  `protocol` ENUM('TCP_SDK', 'UDP_ZK', 'ADMS_PUSH', 'HTTP_CONNECTOR') NOT NULL DEFAULT 'TCP_SDK',
  `lastConnectionAt` DATETIME(3) NULL,
  `lastSyncAt` DATETIME(3) NULL,
  `pendingRecords` INT NOT NULL DEFAULT 0,
  `failedRecords` INT NOT NULL DEFAULT 0,
  `lastError` TEXT NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_biometric_device_serial` (`serialNumber`),
  KEY `idx_biometric_device_loc` (`locationCode`),
  KEY `idx_biometric_device_ip` (`ipAddress`, `port`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Employee Biometric Enrollment Mappings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_employee_mappings` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employeeId` VARCHAR(36) NOT NULL,
  `enrollmentNumber` VARCHAR(64) NOT NULL,
  `serialNumber` VARCHAR(64) NULL,
  `showroomCode` VARCHAR(10) NOT NULL DEFAULT 'BEL',
  `status` ENUM('ACTIVE', 'SUSPENDED', 'TRANSFERRED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  `effectiveDate` DATE NOT NULL,
  `notes` VARCHAR(255) NULL,
  `createdBy` VARCHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_enrollment_showroom` (`enrollmentNumber`, `showroomCode`),
  KEY `idx_biometric_mapping_emp` (`employeeId`),
  KEY `idx_biometric_mapping_enroll` (`enrollmentNumber`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. Raw Immutable Biometric Punch Ledger
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_raw_punches` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `deviceId` VARCHAR(36) NULL,
  `serialNumber` VARCHAR(64) NOT NULL,
  `enrollmentNumber` VARCHAR(64) NOT NULL,
  `punchTime` DATETIME(3) NOT NULL,
  `punchType` ENUM('CHECK_IN', 'CHECK_OUT', 'BREAK_OUT', 'BREAK_IN', 'AUTO_PAIR') NOT NULL DEFAULT 'AUTO_PAIR',
  `verifyMode` INT NOT NULL DEFAULT 1, -- 1: Fingerprint, 2: Face, 3: Card, 4: Password
  `receivedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `syncStatus` ENUM('QUEUED', 'PROCESSED', 'UNMAPPED', 'DUPLICATE', 'ERROR') NOT NULL DEFAULT 'QUEUED',
  `isProcessed` TINYINT(1) NOT NULL DEFAULT 0,
  `processedAt` DATETIME(3) NULL,
  `attendanceId` VARCHAR(36) NULL,
  `errorMessage` TEXT NULL,
  `dedupHash` VARCHAR(64) NOT NULL,
  UNIQUE KEY `uq_biometric_raw_dedup` (`dedupHash`),
  KEY `idx_biometric_raw_serial_time` (`serialNumber`, `punchTime`),
  KEY `idx_biometric_raw_enroll_time` (`enrollmentNumber`, `punchTime`),
  KEY `idx_biometric_raw_status` (`syncStatus`, `isProcessed`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 4. Biometric Device Synchronization Logs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `biometric_sync_logs` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `deviceId` VARCHAR(36) NULL,
  `serialNumber` VARCHAR(64) NOT NULL,
  `triggerType` ENUM('MANUAL_USER', 'POLL_DAEMON', 'CONNECTOR_SERVICE', 'SCHEDULED_CRON') NOT NULL DEFAULT 'MANUAL_USER',
  `recordsPulled` INT NOT NULL DEFAULT 0,
  `recordsInserted` INT NOT NULL DEFAULT 0,
  `recordsSkipped` INT NOT NULL DEFAULT 0,
  `status` ENUM('SUCCESS', 'PARTIAL', 'FAILED', 'UNREACHABLE') NOT NULL DEFAULT 'SUCCESS',
  `errorMessage` TEXT NULL,
  `latencyMs` INT NOT NULL DEFAULT 0,
  `durationMs` INT NOT NULL DEFAULT 0,
  `syncedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_biometric_sync_serial_time` (`serialNumber`, `syncedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
