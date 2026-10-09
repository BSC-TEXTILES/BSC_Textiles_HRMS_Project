-- ===========================================================================
-- 005: QR BADGES & BIOMETRIC VERIFICATION LOGS
-- QR codes, QR scan audit, face profiles & verification logs (Prisma-canonical DDL)
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

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

SET FOREIGN_KEY_CHECKS = 1;
