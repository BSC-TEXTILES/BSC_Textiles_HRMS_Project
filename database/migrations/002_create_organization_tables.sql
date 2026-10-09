-- ===========================================================================
-- 002: ORGANIZATIONAL TOPOLOGY TABLES
-- Locations, floors, departments, sections, selling points (Prisma-canonical DDL)
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

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

SET FOREIGN_KEY_CHECKS = 1;
