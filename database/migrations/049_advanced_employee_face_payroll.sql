-- ===========================================================================
-- 049: ADVANCED EMPLOYEE MANAGEMENT, FACE RECOGNITION & PAYROLL AUTOMATION
-- Multi-angle face samples, kiosk devices, email queue, holiday 2x records, weekly off config
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Multi-Angle Face Registration Samples
CREATE TABLE IF NOT EXISTS `face_registration_sample` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `pose` VARCHAR(50) NOT NULL DEFAULT 'STRAIGHT',
  `embedding` LONGTEXT NOT NULL,
  `qualityScore` DECIMAL(5,2) NOT NULL DEFAULT 95.00,
  `livenessScore` DECIMAL(5,2) NOT NULL DEFAULT 99.00,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `FaceSample_employeeId_idx` (`employeeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Enhance faceprofile table with multi-angle enrollment and configurable threshold
ALTER TABLE `faceprofile`
  ADD COLUMN `multiAngleEnrolled` TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN `threshold` DECIMAL(5,2) NOT NULL DEFAULT 70.00,
  ADD COLUMN `embedding` LONGTEXT NULL;

-- 3. Dedicated Office Attendance Device (Kiosk Mode)
CREATE TABLE IF NOT EXISTS `kiosk_device` (
  `id` VARCHAR(191) NOT NULL,
  `deviceCode` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `locationId` VARCHAR(191) NOT NULL,
  `pinHash` VARCHAR(191) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
  `lastHeartbeat` DATETIME(3) NULL,
  `ipAddress` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `KioskDevice_deviceCode_key` (`deviceCode`),
  KEY `KioskDevice_locationId_idx` (`locationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Email Notification Queue with Retry Mechanism
CREATE TABLE IF NOT EXISTS `email_notification_queue` (
  `id` VARCHAR(191) NOT NULL,
  `recipientEmail` VARCHAR(191) NOT NULL,
  `recipientName` VARCHAR(191) NULL,
  `subject` VARCHAR(255) NOT NULL,
  `bodyHtml` LONGTEXT NOT NULL,
  `eventType` VARCHAR(100) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'PENDING',
  `retryCount` INT NOT NULL DEFAULT 0,
  `maxRetries` INT NOT NULL DEFAULT 3,
  `lastError` TEXT NULL,
  `scheduledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `sentAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `EmailQueue_status_scheduledAt_idx` (`status`, `scheduledAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Holiday Working (2x Double Salary) Records
CREATE TABLE IF NOT EXISTS `holiday_working_record` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `attendanceId` VARCHAR(191) NULL,
  `holidayDate` DATE NOT NULL,
  `holidayName` VARCHAR(191) NOT NULL,
  `multiplier` DECIMAL(4,2) NOT NULL DEFAULT 2.00,
  `baseDailyRate` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `holidayPayAmount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `status` VARCHAR(50) NOT NULL DEFAULT 'CALCULATED',
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `HolidayWorking_employeeId_date_idx` (`employeeId`, `holidayDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Dynamic Sunday & Weekly Off Configuration
CREATE TABLE IF NOT EXISTS `employee_weekly_off_config` (
  `id` VARCHAR(191) NOT NULL,
  `employeeId` VARCHAR(191) NOT NULL,
  `offType` VARCHAR(50) NOT NULL DEFAULT 'FIXED',
  `primaryDay` VARCHAR(20) NOT NULL DEFAULT 'SUNDAY',
  `secondaryDay` VARCHAR(20) NULL,
  `rotationalPattern` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `WeeklyOffConfig_employeeId_key` (`employeeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Add cooldown tracking and sourceChannel to attendance
ALTER TABLE `attendance`
  ADD COLUMN `cooldownUntil` DATETIME(3) NULL,
  ADD COLUMN `sourceChannel` VARCHAR(50) NOT NULL DEFAULT 'WEB';

SET FOREIGN_KEY_CHECKS = 1;
