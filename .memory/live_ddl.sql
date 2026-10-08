-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: bsc_textiles_hrms
-- ------------------------------------------------------
-- Server version	8.0.46

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `_migrations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `_migrations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `executed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `attendance`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `shiftId` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attendanceDate` date NOT NULL,
  `scheduledLogin` datetime(3) DEFAULT NULL,
  `actualLogin` datetime(3) DEFAULT NULL,
  `scheduledLogout` datetime(3) DEFAULT NULL,
  `actualLogout` datetime(3) DEFAULT NULL,
  `earlyLoginSeconds` int NOT NULL DEFAULT '0',
  `lateLoginSeconds` int NOT NULL DEFAULT '0',
  `earlyLogoutSeconds` int NOT NULL DEFAULT '0',
  `overtimeSeconds` int NOT NULL DEFAULT '0',
  `totalWorkingSeconds` int NOT NULL DEFAULT '0',
  `breakSeconds` int NOT NULL DEFAULT '0',
  `effectiveWorkingSeconds` int NOT NULL DEFAULT '0',
  `earlyLoginIncentive` decimal(15,2) NOT NULL DEFAULT '0.00',
  `lateLoginPenalty` decimal(15,2) NOT NULL DEFAULT '0.00',
  `overtimeIncentive` decimal(15,2) NOT NULL DEFAULT '0.00',
  `earlyLogoutPenalty` decimal(15,2) NOT NULL DEFAULT '0.00',
  `status` enum('PRESENT','ABSENT','LATE','EARLY','ON_LUNCH','ON_TEA_BREAK','ON_OTHER_BREAK','WEEKLY_OFF','OVERTIME','LEFT_STORE','FACE_VERIFIED','FACE_VERIFICATION_FAILED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PRESENT',
  `faceVerified` tinyint(1) NOT NULL DEFAULT '0',
  `faceMatchPercentage` decimal(5,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (`employeeId`) VIRTUAL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (`locationId`) VIRTUAL,
  `shift_id` varchar(36) COLLATE utf8mb4_unicode_ci GENERATED ALWAYS AS (`shiftId`) VIRTUAL,
  `attendance_date` date GENERATED ALWAYS AS (`attendanceDate`) VIRTUAL,
  `punch_in` datetime(3) GENERATED ALWAYS AS (`actualLogin`) VIRTUAL,
  `punch_out` datetime(3) GENERATED ALWAYS AS (`actualLogout`) VIRTUAL,
  `is_face_verified` tinyint(1) GENERATED ALWAYS AS (`faceVerified`) VIRTUAL,
  `early_login_incentive` decimal(15,2) GENERATED ALWAYS AS (`earlyLoginIncentive`) VIRTUAL,
  `late_login_penalty` decimal(15,2) GENERATED ALWAYS AS (`lateLoginPenalty`) VIRTUAL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_emp_att_date` (`employeeId`,`attendanceDate`),
  KEY `idx_att_lookup` (`locationId`,`attendanceDate`),
  KEY `idx_att_emp` (`employeeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `attendancerules`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendancerules` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `loginTime` datetime(3) NOT NULL,
  `logoutTime` datetime(3) NOT NULL,
  `gracePeriodMinutes` int NOT NULL DEFAULT '5',
  `lateThresholdMinutes` int NOT NULL DEFAULT '5',
  `earlyLoginIncentiveEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `earlyLoginRatePerSecond` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `earlyLoginMaxDaily` decimal(15,2) DEFAULT NULL,
  `earlyLoginMaxMonthly` decimal(15,2) DEFAULT NULL,
  `latePenaltyEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `latePenaltyRatePerSecond` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `latePenaltyMaxDaily` decimal(15,2) DEFAULT NULL,
  `latePenaltyMaxMonthly` decimal(15,2) DEFAULT NULL,
  `overtimeIncentiveEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `overtimeRatePerSecond` decimal(10,4) DEFAULT NULL,
  `earlyLogoutPenaltyEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `earlyLogoutRatePerSecond` decimal(10,4) DEFAULT NULL,
  `lunchDurationMinutes` int NOT NULL DEFAULT '100',
  `teaDurationMinutes` int NOT NULL DEFAULT '20',
  `maleLunchMinutes` int NOT NULL DEFAULT '100',
  `femaleLunchMinutes` int NOT NULL DEFAULT '40',
  `maleTeaMinutes` int NOT NULL DEFAULT '20',
  `femaleTeaMinutes` int NOT NULL DEFAULT '15',
  `faceVerificationThreshold` decimal(5,2) NOT NULL DEFAULT '85.00',
  `qrDailyTokenEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `qrOneTimeScan` tinyint(1) NOT NULL DEFAULT '1',
  `scannerRoles` json DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `AttendanceRules_locationId_key` (`locationId`),
  KEY `AttendanceRules_locationId_idx` (`locationId`),
  CONSTRAINT `AttendanceRules_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `audit_logs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_logs` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` enum('CREATE','READ','UPDATE','DELETE','LOGIN','LOGOUT','SCAN','VERIFY','APPROVE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `old_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_audit_user` (`user_id`),
  KEY `idx_audit_action` (`action`),
  KEY `idx_audit_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `auditlog`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `auditlog` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `action` enum('CREATE','READ','UPDATE','DELETE','LOGIN','LOGOUT','SCAN','VERIFY','APPROVE','REJECT','ASSIGN','CONFIGURE','EXPORT','IMPORT') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `oldValue` json DEFAULT NULL,
  `newValue` json DEFAULT NULL,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `userAgent` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `AuditLog_userId_idx` (`userId`),
  KEY `AuditLog_locationId_idx` (`locationId`),
  KEY `AuditLog_action_idx` (`action`),
  KEY `AuditLog_entityType_entityId_idx` (`entityType`,`entityId`),
  KEY `AuditLog_createdAt_idx` (`createdAt`),
  CONSTRAINT `AuditLog_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `breakrule`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `breakrule` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shiftId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeGroup` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `breakType` enum('LUNCH','TEA','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `durationMinutes` int NOT NULL,
  `maxOccurrences` int NOT NULL DEFAULT '1',
  `isPaid` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `BreakRule_locationId_idx` (`locationId`),
  KEY `BreakRule_departmentId_idx` (`departmentId`),
  KEY `BreakRule_floorId_idx` (`floorId`),
  KEY `BreakRule_shiftId_idx` (`shiftId`),
  CONSTRAINT `BreakRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `BreakRule_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `BreakRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `BreakRule_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shift` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `breaks`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `breaks` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attendance_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('LUNCH','TEA','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TEA',
  `status` enum('NOT_STARTED','ACTIVE','COMPLETED','EXCEEDED','MANUALLY_ADJUSTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `start_time` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `end_time` datetime(3) DEFAULT NULL,
  `allocated_minutes` int NOT NULL,
  `actual_duration_seconds` int NOT NULL DEFAULT '0',
  `overrun_seconds` int NOT NULL DEFAULT '0',
  `overrun_penalty` decimal(12,2) NOT NULL DEFAULT '0.00',
  `qr_scan_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_brk_attendance` (`attendance_id`),
  KEY `idx_brk_active` (`employee_id`,`status`),
  CONSTRAINT `fk_brk_attendance` FOREIGN KEY (`attendance_id`) REFERENCES `attendance` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_brk_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `department`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `department` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `managerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Department_locationId_code_key` (`locationId`,`code`),
  KEY `Department_locationId_idx` (`locationId`),
  KEY `Department_floorId_idx` (`floorId`),
  KEY `Department_managerId_fkey` (`managerId`),
  CONSTRAINT `Department_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Department_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Department_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `departments`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floor_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `manager_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_dept_loc_code` (`location_id`,`department_code`),
  KEY `fk_departments_floor` (`floor_id`),
  KEY `idx_departments_location` (`location_id`),
  CONSTRAINT `fk_departments_floor` FOREIGN KEY (`floor_id`) REFERENCES `floors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_departments_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `devices`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `devices` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_type` enum('TABLET','MOBILE','DESKTOP','BIOMETRIC_READER') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TABLET',
  `device_identifier` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `is_authorized` tinyint(1) NOT NULL DEFAULT '1',
  `last_ping_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `device_identifier` (`device_identifier`),
  KEY `idx_dev_loc` (`location_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employee`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employee` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeCode` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `firstName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lastName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fullName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `gender` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dateOfBirth` datetime(3) DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sectionId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shiftId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `designation` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('SUPER_ADMIN','ADMIN','HR_MANAGER','HR_EXECUTIVE','PAYROLL_MANAGER','LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER','TEAM_LEAD','SALES_EMPLOYEE','TEA_BREAK_MANAGER','T_SHOP_OWNER','HR_AUDITOR','EMPLOYEE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EMPLOYEE',
  `status` enum('ACTIVE','INACTIVE','ON_LEAVE','TERMINATED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `joiningDate` datetime(3) NOT NULL,
  `exitDate` datetime(3) DEFAULT NULL,
  `faceProfileId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `qrCodeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dailyQRCodeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Employee_employeeCode_key` (`employeeCode`),
  UNIQUE KEY `Employee_email_key` (`email`),
  KEY `Employee_employeeCode_idx` (`employeeCode`),
  KEY `Employee_locationId_idx` (`locationId`),
  KEY `Employee_floorId_idx` (`floorId`),
  KEY `Employee_departmentId_idx` (`departmentId`),
  KEY `Employee_sectionId_idx` (`sectionId`),
  KEY `Employee_status_idx` (`status`),
  KEY `Employee_shiftId_fkey` (`shiftId`),
  KEY `Employee_faceProfileId_fkey` (`faceProfileId`),
  KEY `Employee_qrCodeId_fkey` (`qrCodeId`),
  KEY `Employee_dailyQRCodeId_fkey` (`dailyQRCodeId`),
  CONSTRAINT `Employee_dailyQRCodeId_fkey` FOREIGN KEY (`dailyQRCodeId`) REFERENCES `qrcode` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Employee_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Employee_faceProfileId_fkey` FOREIGN KEY (`faceProfileId`) REFERENCES `faceprofile` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Employee_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Employee_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Employee_qrCodeId_fkey` FOREIGN KEY (`qrCodeId`) REFERENCES `qrcode` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Employee_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `section` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Employee_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shift` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employeebreak`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employeebreak` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `breakType` enum('LUNCH','TEA','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `breakDate` date NOT NULL,
  `startTime` datetime(3) DEFAULT NULL,
  `endTime` datetime(3) DEFAULT NULL,
  `allowedDuration` int NOT NULL,
  `actualDuration` int DEFAULT NULL,
  `excessDuration` int DEFAULT NULL,
  `status` enum('NOT_STARTED','ACTIVE','COMPLETED','EXCEEDED','MANUALLY_ADJUSTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'NOT_STARTED',
  `qrScanId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `EmployeeBreak_employeeId_breakDate_idx` (`employeeId`,`breakDate`),
  KEY `EmployeeBreak_breakType_idx` (`breakType`),
  KEY `EmployeeBreak_status_idx` (`status`),
  KEY `EmployeeBreak_qrScanId_fkey` (`qrScanId`),
  CONSTRAINT `EmployeeBreak_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EmployeeBreak_qrScanId_fkey` FOREIGN KEY (`qrScanId`) REFERENCES `qrscanrecord` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employeeincentive`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employeeincentive` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `incentiveRuleId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `effectiveFrom` date NOT NULL,
  `effectiveTo` date DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','PENDING_APPROVAL','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `EmployeeIncentive_employeeId_incentiveRuleId_key` (`employeeId`,`incentiveRuleId`),
  KEY `EmployeeIncentive_employeeId_idx` (`employeeId`),
  KEY `EmployeeIncentive_incentiveRuleId_idx` (`incentiveRuleId`),
  CONSTRAINT `EmployeeIncentive_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EmployeeIncentive_incentiveRuleId_fkey` FOREIGN KEY (`incentiveRuleId`) REFERENCES `incentiverule` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employees`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employees` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_code` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `gender` enum('MALE','FEMALE','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'MALE',
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floor_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `section_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `selling_point_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shift_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `base_salary` decimal(12,2) NOT NULL DEFAULT '30000.00',
  `face_enrollment_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','ON_LEAVE','TERMINATED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `date_of_joining` date DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_code` (`employee_code`),
  KEY `fk_emp_floor` (`floor_id`),
  KEY `fk_emp_dept` (`department_id`),
  KEY `fk_emp_section` (`section_id`),
  KEY `fk_emp_sp` (`selling_point_id`),
  KEY `fk_emp_shift` (`shift_id`),
  KEY `idx_emp_code` (`employee_code`),
  KEY `idx_emp_location` (`location_id`),
  CONSTRAINT `fk_emp_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_floor` FOREIGN KEY (`floor_id`) REFERENCES `floors` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_emp_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_shift` FOREIGN KEY (`shift_id`) REFERENCES `shifts` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_emp_sp` FOREIGN KEY (`selling_point_id`) REFERENCES `selling_points` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `employeesellingpoint`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `employeesellingpoint` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `assignedDate` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `isPrimary` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `EmployeeSellingPoint_employeeId_sellingPointId_key` (`employeeId`,`sellingPointId`),
  KEY `EmployeeSellingPoint_employeeId_idx` (`employeeId`),
  KEY `EmployeeSellingPoint_sellingPointId_idx` (`sellingPointId`),
  CONSTRAINT `EmployeeSellingPoint_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `EmployeeSellingPoint_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `face_verification_logs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `face_verification_logs` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `match_confidence` decimal(5,2) NOT NULL,
  `threshold_used` decimal(5,2) NOT NULL DEFAULT '85.00',
  `status` enum('VERIFIED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `captured_image_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verified_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_face_logs` (`employee_id`,`verified_at`),
  CONSTRAINT `fk_face_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `faceprofile`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `faceprofile` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `faceData` longblob NOT NULL,
  `enrolledAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `FaceProfile_employeeId_key` (`employeeId`),
  CONSTRAINT `FaceProfile_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `faceverification`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `faceverification` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `deviceId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `verifiedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `matchPercentage` decimal(5,2) NOT NULL,
  `threshold` decimal(5,2) NOT NULL,
  `result` enum('VERIFIED','FAILED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT 'attendance',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `FaceVerification_employeeId_idx` (`employeeId`),
  KEY `FaceVerification_locationId_idx` (`locationId`),
  KEY `FaceVerification_verifiedAt_idx` (`verifiedAt`),
  KEY `FaceVerification_result_idx` (`result`),
  CONSTRAINT `FaceVerification_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `FaceVerification_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `floor`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `floor` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorNumber` int NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorManagerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assistantManagerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Floor_locationId_floorNumber_key` (`locationId`,`floorNumber`),
  KEY `Floor_locationId_idx` (`locationId`),
  KEY `Floor_floorManagerId_idx` (`floorManagerId`),
  KEY `Floor_assistantManagerId_fkey` (`assistantManagerId`),
  CONSTRAINT `Floor_assistantManagerId_fkey` FOREIGN KEY (`assistantManagerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Floor_floorManagerId_fkey` FOREIGN KEY (`floorManagerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Floor_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `floors`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `floors` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floor_number` int NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `floor_manager_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_floors_location` (`location_id`),
  CONSTRAINT `fk_floors_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `holiday`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `holiday` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `date` date NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isRecurring` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Holiday_date_idx` (`date`),
  KEY `Holiday_locationId_idx` (`locationId`),
  KEY `Holiday_departmentId_fkey` (`departmentId`),
  CONSTRAINT `Holiday_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Holiday_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `holidays`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `holidays` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `holiday_date` date NOT NULL,
  `is_optional` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_hol_loc` (`location_id`),
  CONSTRAINT `fk_hol_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `incentive_grants`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incentive_grants` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rule_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attendance_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'APPROVED',
  `calculation_details` json DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_inc_grant_rule` (`rule_id`),
  KEY `idx_inc_emp` (`employee_id`),
  CONSTRAINT `fk_inc_grant_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_inc_grant_rule` FOREIGN KEY (`rule_id`) REFERENCES `incentive_rules` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `incentive_rules`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incentive_rules` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('EARLY_LOGIN','OVERTIME','PERFECT_ATTENDANCE','SALES_MILESTONE','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `rate_type` enum('PER_SECOND','PER_MINUTE','FIXED','PERCENTAGE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `rate_value` decimal(10,4) NOT NULL,
  `min_threshold` int NOT NULL DEFAULT '0',
  `max_cap` decimal(12,2) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_inc_rule_loc` (`location_id`),
  CONSTRAINT `fk_inc_rule_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `incentiverule`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incentiverule` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `incentiveType` enum('INDIVIDUAL','DEPARTMENT','LOCATION','FLOOR','SELLING_POINT','SALES','ATTENDANCE','PERFORMANCE','EARLY_LOGIN','TARGET','CUSTOM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `calculationType` enum('FIXED_AMOUNT','PER_HOUR','PER_MINUTE','PER_SECOND','PERCENTAGE','TARGET_BASED','PERFORMANCE_BASED','ATTENDANCE_BASED','CUSTOM_RULE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `percentage` decimal(5,2) DEFAULT NULL,
  `targetAmount` decimal(15,2) DEFAULT NULL,
  `effectiveFrom` date NOT NULL,
  `effectiveTo` date DEFAULT NULL,
  `maxDailyAmount` decimal(15,2) DEFAULT NULL,
  `maxMonthlyAmount` decimal(15,2) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','PENDING_APPROVAL','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `IncentiveRule_locationId_idx` (`locationId`),
  KEY `IncentiveRule_departmentId_idx` (`departmentId`),
  KEY `IncentiveRule_floorId_idx` (`floorId`),
  KEY `IncentiveRule_sellingPointId_idx` (`sellingPointId`),
  KEY `IncentiveRule_employeeId_idx` (`employeeId`),
  KEY `IncentiveRule_status_idx` (`status`),
  KEY `IncentiveRule_createdById_fkey` (`createdById`),
  KEY `IncentiveRule_approvedById_fkey` (`approvedById`),
  CONSTRAINT `IncentiveRule_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `IncentiveRule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `IncentiveRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `IncentiveRule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `IncentiveRule_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `IncentiveRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `IncentiveRule_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `incentivetransaction`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `incentivetransaction` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `incentiveRuleId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transactionDate` date NOT NULL,
  `calculationBasis` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `calculatedAmount` decimal(15,2) NOT NULL,
  `calculationDetails` json NOT NULL,
  `status` enum('ACTIVE','INACTIVE','PENDING_APPROVAL','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING_APPROVAL',
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `payrollRunId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `IncentiveTransaction_employeeId_transactionDate_idx` (`employeeId`,`transactionDate`),
  KEY `IncentiveTransaction_incentiveRuleId_idx` (`incentiveRuleId`),
  KEY `IncentiveTransaction_status_idx` (`status`),
  KEY `IncentiveTransaction_approvedById_fkey` (`approvedById`),
  CONSTRAINT `IncentiveTransaction_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `IncentiveTransaction_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `IncentiveTransaction_incentiveRuleId_fkey` FOREIGN KEY (`incentiveRuleId`) REFERENCES `incentiverule` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `leave_requests`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `leave_requests` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `leave_type` enum('CASUAL','SICK','EARNED','UNPAID') COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('PENDING','APPROVED','REJECTED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approved_by` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_leave_emp` (`employee_id`),
  KEY `fk_leave_loc` (`location_id`),
  CONSTRAINT `fk_leave_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_leave_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `live_streams`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `live_streams` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `host_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `stream_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('SCHEDULED','LIVE','PAUSED','ENDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCHEDULED',
  `started_at` datetime(3) DEFAULT NULL,
  `ended_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_stream_loc` (`location_id`),
  KEY `fk_stream_host` (`host_id`),
  CONSTRAINT `fk_stream_host` FOREIGN KEY (`host_id`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_stream_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `livestream`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `livestream` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sectionId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hostId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamUrl` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamKey` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('SCHEDULED','LIVE','PAUSED','ENDED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SCHEDULED',
  `viewerCount` int NOT NULL DEFAULT '0',
  `startedAt` datetime(3) DEFAULT NULL,
  `endedAt` datetime(3) DEFAULT NULL,
  `scheduledAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `LiveStream_streamKey_key` (`streamKey`),
  KEY `LiveStream_locationId_idx` (`locationId`),
  KEY `LiveStream_status_idx` (`status`),
  KEY `LiveStream_hostId_idx` (`hostId`),
  KEY `LiveStream_floorId_fkey` (`floorId`),
  KEY `LiveStream_sectionId_fkey` (`sectionId`),
  KEY `LiveStream_sellingPointId_fkey` (`sellingPointId`),
  CONSTRAINT `LiveStream_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `section` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `LiveStream_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `livestreammessage`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `livestreammessage` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `LiveStreamMessage_streamId_idx` (`streamId`),
  KEY `LiveStreamMessage_userId_idx` (`userId`),
  CONSTRAINT `LiveStreamMessage_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStreamMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `livestreamreaction`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `livestreamreaction` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reactionType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `LiveStreamReaction_streamId_idx` (`streamId`),
  KEY `LiveStreamReaction_userId_idx` (`userId`),
  CONSTRAINT `LiveStreamReaction_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStreamReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `livestreamviewer`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `livestreamviewer` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `joinedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `leftAt` datetime(3) DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `LiveStreamViewer_streamId_userId_key` (`streamId`,`userId`),
  KEY `LiveStreamViewer_streamId_idx` (`streamId`),
  KEY `LiveStreamViewer_userId_idx` (`userId`),
  CONSTRAINT `LiveStreamViewer_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `LiveStreamViewer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `location`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `location` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `city` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `state` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `pin` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `whatsapp` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `managerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `hrManagerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `openingTime` datetime(3) DEFAULT NULL,
  `closingTime` datetime(3) DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','ARCHIVED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Location_code_key` (`code`),
  KEY `Location_code_idx` (`code`),
  KEY `Location_status_idx` (`status`),
  KEY `Location_managerId_fkey` (`managerId`),
  KEY `Location_hrManagerId_fkey` (`hrManagerId`),
  CONSTRAINT `Location_hrManagerId_fkey` FOREIGN KEY (`hrManagerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Location_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `locations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `locations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `city` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `address` text COLLATE utf8mb4_unicode_ci,
  `phone` varchar(30) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','ARCHIVED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `manager_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `notifications`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(150) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('INFO','SUCCESS','WARNING','DANGER','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INFO',
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `link` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_notif_user` (`user_id`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `observation`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observation` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sectionId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `observationType` enum('POSITIVE','IMPROVEMENT','CUSTOMER_SERVICE','SALES','GROOMING','PRODUCT_KNOWLEDGE','ATTENDANCE','DISCIPLINE','SELLING_SKILL','STORE_STANDARD','SAFETY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `level` enum('EXCELLENT','VERY_GOOD','GOOD','NEEDS_IMPROVEMENT','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `score` int NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `actionRequired` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `assignedToId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `dueDate` datetime(3) DEFAULT NULL,
  `status` enum('OPEN','IN_PROGRESS','RESOLVED','CLOSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `videoUrl` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `photoUrl` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `Observation_employeeId_idx` (`employeeId`),
  KEY `Observation_locationId_idx` (`locationId`),
  KEY `Observation_status_idx` (`status`),
  KEY `Observation_createdAt_idx` (`createdAt`),
  KEY `Observation_floorId_fkey` (`floorId`),
  KEY `Observation_sectionId_fkey` (`sectionId`),
  KEY `Observation_sellingPointId_fkey` (`sellingPointId`),
  KEY `Observation_assignedToId_fkey` (`assignedToId`),
  KEY `Observation_createdById_fkey` (`createdById`),
  CONSTRAINT `Observation_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Observation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `Observation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Observation_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Observation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Observation_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `section` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Observation_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `observationattachment`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observationattachment` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileUrl` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileSize` int NOT NULL,
  `uploadedById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `ObservationAttachment_observationId_idx` (`observationId`),
  KEY `ObservationAttachment_uploadedById_fkey` (`uploadedById`),
  CONSTRAINT `ObservationAttachment_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ObservationAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `observationcomment`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observationcomment` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `parentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mentions` json DEFAULT NULL,
  `attachments` json DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ObservationComment_observationId_idx` (`observationId`),
  KEY `ObservationComment_userId_idx` (`userId`),
  KEY `ObservationComment_parentId_idx` (`parentId`),
  CONSTRAINT `ObservationComment_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ObservationComment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `observationcomment` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `ObservationComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `observationreaction`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observationreaction` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `reactionType` enum('ACKNOWLEDGED','COMPLETED','EXCELLENT','REVIEWING','ATTENTION') COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `ObservationReaction_observationId_userId_reactionType_key` (`observationId`,`userId`,`reactionType`),
  KEY `ObservationReaction_observationId_idx` (`observationId`),
  KEY `ObservationReaction_userId_idx` (`userId`),
  CONSTRAINT `ObservationReaction_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `ObservationReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `observations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `observations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_by_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GENERAL',
  `level` enum('EXCELLENT','VERY_GOOD','GOOD','NEEDS_IMPROVEMENT','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'GOOD',
  `description` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `rating` int NOT NULL DEFAULT '3',
  `status` enum('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','CLOSED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OPEN',
  `media_url` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_obs_emp` (`employee_id`),
  KEY `fk_obs_loc` (`location_id`),
  KEY `fk_obs_user` (`created_by_id`),
  CONSTRAINT `fk_obs_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_obs_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_obs_user` FOREIGN KEY (`created_by_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_items`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_items` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payroll_run_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `basic_salary` decimal(12,2) NOT NULL,
  `allowances` decimal(12,2) NOT NULL DEFAULT '0.00',
  `early_incentive` decimal(12,2) NOT NULL DEFAULT '0.00',
  `sales_incentive` decimal(12,2) NOT NULL DEFAULT '0.00',
  `attendance_incentive` decimal(12,2) NOT NULL DEFAULT '0.00',
  `overtime_pay` decimal(12,2) NOT NULL DEFAULT '0.00',
  `late_penalties` decimal(12,2) NOT NULL DEFAULT '0.00',
  `break_penalties` decimal(12,2) NOT NULL DEFAULT '0.00',
  `statutory_deductions` decimal(12,2) NOT NULL DEFAULT '0.00',
  `gross_earnings` decimal(12,2) NOT NULL,
  `total_deductions` decimal(12,2) NOT NULL,
  `net_pay` decimal(12,2) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_pay_items_run` (`payroll_run_id`),
  KEY `idx_payroll_item_emp` (`employee_id`),
  CONSTRAINT `fk_pay_items_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pay_items_run` FOREIGN KEY (`payroll_run_id`) REFERENCES `payroll_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payroll_runs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_runs` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `period_start` date NOT NULL,
  `period_end` date NOT NULL,
  `status` enum('DRAFT','APPROVED','PUBLISHED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `processed_by` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `processed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_payroll_period` (`location_id`,`period_start`,`period_end`),
  CONSTRAINT `fk_payroll_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payrollitem`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payrollitem` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `payrollRunId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `basicSalary` decimal(15,2) NOT NULL,
  `earlyIncentive` decimal(15,2) NOT NULL DEFAULT '0.00',
  `attendanceIncentive` decimal(15,2) NOT NULL DEFAULT '0.00',
  `performanceIncentive` decimal(15,2) NOT NULL DEFAULT '0.00',
  `salesIncentive` decimal(15,2) NOT NULL DEFAULT '0.00',
  `overtime` decimal(15,2) NOT NULL DEFAULT '0.00',
  `deductions` decimal(15,2) NOT NULL DEFAULT '0.00',
  `penalties` decimal(15,2) NOT NULL DEFAULT '0.00',
  `netPay` decimal(15,2) NOT NULL,
  `calculationDetails` json NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `PayrollItem_payrollRunId_idx` (`payrollRunId`),
  KEY `PayrollItem_employeeId_idx` (`employeeId`),
  CONSTRAINT `PayrollItem_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PayrollItem_payrollRunId_fkey` FOREIGN KEY (`payrollRunId`) REFERENCES `payrollrun` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `payrollrun`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payrollrun` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `periodStart` date NOT NULL,
  `periodEnd` date NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'DRAFT',
  `processedBy` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `processedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `penalty_policies`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `penalty_policies` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `violation_type` enum('LATE_LOGIN','EARLY_LOGOUT','BREAK_OVERRUN','UNAUTHORIZED_ABSENCE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `rate_type` enum('PER_SECOND','PER_MINUTE','FIXED','PERCENTAGE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `rate_value` decimal(10,4) NOT NULL,
  `grace_window_seconds` int NOT NULL DEFAULT '0',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_pen_pol_loc` (`location_id`),
  CONSTRAINT `fk_pen_pol_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `penalty_records`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `penalty_records` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `policy_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attendance_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `amount` decimal(12,2) NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `status` enum('APPLIED','WAIVED','APPEALED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'APPLIED',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_pen_rec_pol` (`policy_id`),
  KEY `idx_pen_emp` (`employee_id`),
  CONSTRAINT `fk_pen_rec_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pen_rec_pol` FOREIGN KEY (`policy_id`) REFERENCES `penalty_policies` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `penaltyrule`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `penaltyrule` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `penaltyType` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `calculationType` enum('FIXED_AMOUNT','PER_HOUR','PER_MINUTE','PER_SECOND','PERCENTAGE','TARGET_BASED','PERFORMANCE_BASED','ATTENDANCE_BASED','CUSTOM_RULE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `amount` decimal(15,2) DEFAULT NULL,
  `percentage` decimal(5,2) DEFAULT NULL,
  `maxDailyAmount` decimal(15,2) DEFAULT NULL,
  `maxMonthlyAmount` decimal(15,2) DEFAULT NULL,
  `effectiveFrom` date NOT NULL,
  `effectiveTo` date DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `PenaltyRule_locationId_idx` (`locationId`),
  KEY `PenaltyRule_departmentId_idx` (`departmentId`),
  KEY `PenaltyRule_employeeId_idx` (`employeeId`),
  CONSTRAINT `PenaltyRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyRule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `penaltytransaction`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `penaltytransaction` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `penaltyRuleId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `transactionDate` date NOT NULL,
  `calculationBasis` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `calculatedAmount` decimal(15,2) NOT NULL,
  `calculationDetails` json NOT NULL,
  `status` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `approvedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAt` datetime(3) DEFAULT NULL,
  `payrollRunId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `PenaltyTransaction_employeeId_transactionDate_idx` (`employeeId`,`transactionDate`),
  KEY `PenaltyTransaction_penaltyRuleId_idx` (`penaltyRuleId`),
  KEY `PenaltyTransaction_status_idx` (`status`),
  KEY `PenaltyTransaction_approvedById_fkey` (`approvedById`),
  CONSTRAINT `PenaltyTransaction_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `PenaltyTransaction_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PenaltyTransaction_penaltyRuleId_fkey` FOREIGN KEY (`penaltyRuleId`) REFERENCES `penaltyrule` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qr_codes`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qr_codes` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `valid_date` date NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `expires_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `token` (`token`),
  KEY `fk_qr_emp` (`employee_id`),
  KEY `idx_qr_lookup` (`token`,`valid_date`),
  CONSTRAINT `fk_qr_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qr_scan_records`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qr_scan_records` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qr_code_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scanner_user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scan_type` enum('ATTENDANCE_IN','ATTENDANCE_OUT','BREAK_START','BREAK_END') COLLATE utf8mb4_unicode_ci NOT NULL,
  `scanned_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `is_valid` tinyint(1) NOT NULL DEFAULT '1',
  `rejection_reason` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `fk_scan_qr` (`qr_code_id`),
  KEY `idx_scan_history` (`employee_id`,`scanned_at`),
  CONSTRAINT `fk_scan_emp` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_scan_qr` FOREIGN KEY (`qr_code_id`) REFERENCES `qr_codes` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qrcode`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qrcode` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `token` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('EMPLOYEE','DAILY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `validFrom` datetime(3) NOT NULL,
  `validTo` datetime(3) NOT NULL,
  `isConsumed` tinyint(1) NOT NULL DEFAULT '0',
  `consumedAt` datetime(3) DEFAULT NULL,
  `consumedBy` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purpose` enum('ATTENDANCE_CHECK_IN','ATTENDANCE_CHECK_OUT','LUNCH_START','LUNCH_END','TEA_BREAK_START','TEA_BREAK_END','BREAK_START','BREAK_END','SELLING_POINT_CHECK_IN') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `QRCode_token_key` (`token`),
  KEY `QRCode_employeeId_idx` (`employeeId`),
  KEY `QRCode_token_idx` (`token`),
  KEY `QRCode_validFrom_validTo_idx` (`validFrom`,`validTo`),
  KEY `QRCode_isConsumed_idx` (`isConsumed`),
  KEY `QRCode_locationId_fkey` (`locationId`),
  CONSTRAINT `QRCode_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `QRCode_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `qrscanrecord`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `qrscanrecord` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `qrCodeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scannerId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purpose` enum('ATTENDANCE_CHECK_IN','ATTENDANCE_CHECK_OUT','LUNCH_START','LUNCH_END','TEA_BREAK_START','TEA_BREAK_END','BREAK_START','BREAK_END','SELLING_POINT_CHECK_IN') COLLATE utf8mb4_unicode_ci NOT NULL,
  `result` enum('SUCCESS','ALREADY_SCANNED','EXPIRED','UNAUTHORIZED_SCANNER','LOCATION_MISMATCH','INVALID_TOKEN','EMPLOYEE_INACTIVE','REVOKED') COLLATE utf8mb4_unicode_ci NOT NULL,
  `failureReason` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `scannedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deviceInfo` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `QRScanRecord_employeeId_scannedAt_idx` (`employeeId`,`scannedAt`),
  KEY `QRScanRecord_scannerId_scannedAt_idx` (`scannerId`,`scannedAt`),
  KEY `QRScanRecord_locationId_scannedAt_idx` (`locationId`,`scannedAt`),
  KEY `QRScanRecord_result_idx` (`result`),
  KEY `QRScanRecord_qrCodeId_fkey` (`qrCodeId`),
  KEY `QRScanRecord_sellingPointId_fkey` (`sellingPointId`),
  CONSTRAINT `QRScanRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `QRScanRecord_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `QRScanRecord_qrCodeId_fkey` FOREIGN KEY (`qrCodeId`) REFERENCES `qrcode` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `QRScanRecord_scannerId_fkey` FOREIGN KEY (`scannerId`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `QRScanRecord_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `section`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `section` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `supervisorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Section_locationId_code_key` (`locationId`,`code`),
  KEY `Section_locationId_idx` (`locationId`),
  KEY `Section_floorId_idx` (`floorId`),
  KEY `Section_departmentId_idx` (`departmentId`),
  KEY `Section_supervisorId_fkey` (`supervisorId`),
  CONSTRAINT `Section_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Section_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Section_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `Section_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sections`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sections` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `department_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `section_code` varchar(30) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_sections_dept` (`department_id`),
  CONSTRAINT `fk_sections_dept` FOREIGN KEY (`department_id`) REFERENCES `departments` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `selling_points`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `selling_points` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `section_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(40) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `code` (`code`),
  KEY `idx_sp_section` (`section_id`),
  CONSTRAINT `fk_sp_section` FOREIGN KEY (`section_id`) REFERENCES `sections` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `sellingpoint`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sellingpoint` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sectionId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `managerId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `targetAmount` decimal(15,2) DEFAULT NULL,
  `incentiveRuleId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `performanceScore` decimal(5,2) DEFAULT NULL,
  `status` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `SellingPoint_locationId_code_key` (`locationId`,`code`),
  KEY `SellingPoint_locationId_idx` (`locationId`),
  KEY `SellingPoint_floorId_idx` (`floorId`),
  KEY `SellingPoint_sectionId_idx` (`sectionId`),
  KEY `SellingPoint_departmentId_fkey` (`departmentId`),
  KEY `SellingPoint_managerId_fkey` (`managerId`),
  KEY `SellingPoint_incentiveRuleId_fkey` (`incentiveRuleId`),
  CONSTRAINT `SellingPoint_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `SellingPoint_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SellingPoint_incentiveRuleId_fkey` FOREIGN KEY (`incentiveRuleId`) REFERENCES `incentiverule` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `SellingPoint_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `SellingPoint_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `user` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `SellingPoint_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `section` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `shift`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shift` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `startTime` datetime(3) NOT NULL,
  `endTime` datetime(3) NOT NULL,
  `gracePeriod` int NOT NULL DEFAULT '5',
  `lateThreshold` int NOT NULL DEFAULT '5',
  `earlyLoginIncentive` tinyint(1) NOT NULL DEFAULT '1',
  `earlyLoginRatePerSecond` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `maxDailyEarlyIncentive` decimal(15,2) DEFAULT NULL,
  `maxMonthlyEarlyIncentive` decimal(15,2) DEFAULT NULL,
  `latePenaltyEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `latePenaltyRatePerSecond` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `maxDailyLatePenalty` decimal(15,2) DEFAULT NULL,
  `maxMonthlyLatePenalty` decimal(15,2) DEFAULT NULL,
  `overtimeEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `overtimeRatePerSecond` decimal(10,4) DEFAULT NULL,
  `earlyLogoutPenaltyEnabled` tinyint(1) NOT NULL DEFAULT '0',
  `earlyLogoutRatePerSecond` decimal(10,4) DEFAULT NULL,
  `lunchDurationMinutes` int NOT NULL DEFAULT '100',
  `teaDurationMinutes` int NOT NULL DEFAULT '20',
  `maleLunchMinutes` int NOT NULL DEFAULT '100',
  `femaleLunchMinutes` int NOT NULL DEFAULT '40',
  `maleTeaMinutes` int NOT NULL DEFAULT '20',
  `femaleTeaMinutes` int NOT NULL DEFAULT '15',
  `faceVerificationThreshold` decimal(5,2) NOT NULL DEFAULT '85.00',
  `qrDailyTokenEnabled` tinyint(1) NOT NULL DEFAULT '1',
  `qrOneTimeScan` tinyint(1) NOT NULL DEFAULT '1',
  `scannerRoles` json DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Shift_locationId_code_key` (`locationId`,`code`),
  KEY `Shift_locationId_idx` (`locationId`),
  KEY `Shift_status_idx` (`status`),
  KEY `Shift_departmentId_fkey` (`departmentId`),
  CONSTRAINT `Shift_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `Shift_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `shifts`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `shifts` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `start_time` time NOT NULL,
  `end_time` time NOT NULL,
  `grace_period_minutes` int NOT NULL DEFAULT '5',
  `early_login_rate_per_second` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `late_penalty_rate_per_second` decimal(10,4) NOT NULL DEFAULT '1.0000',
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_shifts_location` (`location_id`),
  CONSTRAINT `fk_shifts_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stream_messages`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stream_messages` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stream_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_msg_stream` (`stream_id`),
  KEY `fk_msg_user` (`user_id`),
  CONSTRAINT `fk_msg_stream` FOREIGN KEY (`stream_id`) REFERENCES `live_streams` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_msg_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `stream_observations`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stream_observations` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `stream_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observation_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestamp_seconds` int NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_so_stream` (`stream_id`),
  KEY `fk_so_obs` (`observation_id`),
  CONSTRAINT `fk_so_obs` FOREIGN KEY (`observation_id`) REFERENCES `observations` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_so_stream` FOREIGN KEY (`stream_id`) REFERENCES `live_streams` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `streamobservation`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `streamobservation` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestampSeconds` int NOT NULL,
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `StreamObservation_streamId_idx` (`streamId`),
  KEY `StreamObservation_observationId_idx` (`observationId`),
  KEY `StreamObservation_createdById_fkey` (`createdById`),
  CONSTRAINT `StreamObservation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StreamObservation_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `StreamObservation_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `streamtimestamp`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `streamtimestamp` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `streamId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `timestampSeconds` int NOT NULL,
  `label` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdById` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `StreamTimestamp_streamId_idx` (`streamId`),
  KEY `StreamTimestamp_createdById_fkey` (`createdById`),
  CONSTRAINT `StreamTimestamp_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `StreamTimestamp_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `livestream` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `system_settings`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `system_settings` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_key` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` json NOT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `setting_key` (`setting_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `user`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `passwordHash` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fullName` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('SUPER_ADMIN','ADMIN','HR_MANAGER','HR_EXECUTIVE','PAYROLL_MANAGER','LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER','TEAM_LEAD','SALES_EMPLOYEE','TEA_BREAK_MANAGER','T_SHOP_OWNER','HR_AUDITOR','EMPLOYEE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EMPLOYEE',
  `permissions` json DEFAULT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `lastLoginAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `User_email_key` (`email`),
  KEY `User_email_idx` (`email`),
  KEY `User_role_idx` (`role`),
  KEY `User_locationId_idx` (`locationId`),
  KEY `User_employeeId_fkey` (`employeeId`),
  CONSTRAINT `User_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `User_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(120) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` enum('SUPER_ADMIN','ADMIN','HR_MANAGER','HR_EXECUTIVE','PAYROLL_MANAGER','LOCATION_MANAGER','FLOOR_MANAGER','DEPARTMENT_MANAGER','TEAM_LEAD','SALES_EMPLOYEE','TEA_BREAK_MANAGER','T_SHOP_OWNER','HR_AUDITOR','EMPLOYEE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'EMPLOYEE',
  `permissions` json DEFAULT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_login_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`),
  KEY `fk_users_employee` (`employee_id`),
  KEY `idx_users_email` (`email`),
  KEY `idx_users_location` (`location_id`),
  CONSTRAINT `fk_users_employee` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_users_location` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `videonote`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `videonote` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `observationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sellingPointId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `videoUrl` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `thumbnailUrl` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration` int DEFAULT NULL,
  `recordedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `VideoNote_employeeId_idx` (`employeeId`),
  KEY `VideoNote_locationId_idx` (`locationId`),
  KEY `VideoNote_observationId_idx` (`observationId`),
  KEY `VideoNote_sellingPointId_fkey` (`sellingPointId`),
  CONSTRAINT `VideoNote_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `VideoNote_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `VideoNote_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `observation` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `VideoNote_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `sellingpoint` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `weekly_offs`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `weekly_offs` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `location_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employee_id` varchar(36) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `day_of_week` enum('MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY') COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('ACTIVE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `fk_wo_loc` (`location_id`),
  CONSTRAINT `fk_wo_loc` FOREIGN KEY (`location_id`) REFERENCES `locations` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `weeklyoffrule`
--

/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `weeklyoffrule` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `floorId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `departmentId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `shiftId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `dayOfWeek` enum('SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','ROTATIONAL') COLLATE utf8mb4_unicode_ci NOT NULL,
  `isRotational` tinyint(1) NOT NULL DEFAULT '0',
  `rotationPattern` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `effectiveFrom` date NOT NULL,
  `effectiveTo` date DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `WeeklyOffRule_locationId_idx` (`locationId`),
  KEY `WeeklyOffRule_employeeId_idx` (`employeeId`),
  KEY `WeeklyOffRule_floorId_idx` (`floorId`),
  KEY `WeeklyOffRule_departmentId_idx` (`departmentId`),
  KEY `WeeklyOffRule_shiftId_idx` (`shiftId`),
  CONSTRAINT `WeeklyOffRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `department` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `WeeklyOffRule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `employee` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `WeeklyOffRule_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `floor` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `WeeklyOffRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `location` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `WeeklyOffRule_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `shift` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-10-08 13:47:27
