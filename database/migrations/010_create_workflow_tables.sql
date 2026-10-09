-- ===========================================================================
-- 010: LEAVE REQUESTS, PUNCH CORRECTIONS, NOTIFICATIONS & DEVICES
-- Leave request workflow, attendance corrections, persisted notifications, device registry (Prisma-canonical DDL)
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE `leaverequest` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `leaveType` enum('CASUAL','SICK','EARNED','UNPAID') COLLATE utf8mb4_unicode_ci NOT NULL,
  `startDate` date NOT NULL,
  `endDate` date NOT NULL,
  `days` int NOT NULL,
  `reason` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED','CANCELLED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `appliedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewNote` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `LeaveRequest_locationId_status_idx` (`locationId`,`status`),
  KEY `LeaveRequest_employeeId_idx` (`employeeId`),
  KEY `LeaveRequest_status_createdAt_idx` (`status`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `attendancecorrection` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `employeeId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `attendanceDate` date NOT NULL,
  `originalLogin` datetime(3) DEFAULT NULL,
  `originalLogout` datetime(3) DEFAULT NULL,
  `requestedLogin` datetime(3) DEFAULT NULL,
  `requestedLogout` datetime(3) DEFAULT NULL,
  `reason` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` enum('PENDING','APPROVED','REJECTED') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `requestedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewedById` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `reviewNote` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `appliedAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `AttendanceCorrection_locationId_status_idx` (`locationId`,`status`),
  KEY `AttendanceCorrection_employeeId_attendanceDate_idx` (`employeeId`,`attendanceDate`),
  KEY `AttendanceCorrection_status_createdAt_idx` (`status`,`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `notification` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `userId` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `title` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `message` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('INFO','WARNING','DANGER','CRITICAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'INFO',
  `entityType` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `entityId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isRead` tinyint(1) NOT NULL DEFAULT '0',
  `readAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `Notification_userId_isRead_createdAt_idx` (`userId`,`isRead`,`createdAt`),
  KEY `Notification_locationId_idx` (`locationId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `device` (
  `id` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(191) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('BIOMETRIC_PUNCH','QR_SCANNER','FACE_CAM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `locationId` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ONLINE','OFFLINE','INACTIVE') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ONLINE',
  `ipAddress` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lastPingAt` datetime(3) DEFAULT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `Device_code_key` (`code`),
  KEY `Device_locationId_idx` (`locationId`),
  KEY `Device_type_idx` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
