-- ===========================================================================
-- 006: INCENTIVE RULES, GRANTS, PENALTIES, AND PAYROLL DISBURSEMENT
-- Incentive rules/transactions, penalties, payroll runs/items (Prisma-canonical DDL)
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

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

SET FOREIGN_KEY_CHECKS = 1;
