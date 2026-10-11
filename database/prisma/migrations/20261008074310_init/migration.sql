-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE', 'TEA_BREAK_MANAGER', 'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
    `permissions` JSON NULL,
    `locationId` VARCHAR(191) NULL,
    `employeeId` VARCHAR(191) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    INDEX `User_email_idx`(`email`),
    INDEX `User_role_idx`(`role`),
    INDEX `User_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `address` VARCHAR(191) NULL,
    `city` VARCHAR(191) NULL,
    `state` VARCHAR(191) NULL,
    `pin` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `whatsapp` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NULL,
    `hrManagerId` VARCHAR(191) NULL,
    `openingTime` DATETIME(3) NULL,
    `closingTime` DATETIME(3) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Location_code_key`(`code`),
    INDEX `Location_code_idx`(`code`),
    INDEX `Location_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Floor` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `floorNumber` INTEGER NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorManagerId` VARCHAR(191) NULL,
    `assistantManagerId` VARCHAR(191) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Floor_locationId_idx`(`locationId`),
    INDEX `Floor_floorManagerId_idx`(`floorManagerId`),
    UNIQUE INDEX `Floor_locationId_floorNumber_key`(`locationId`, `floorNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Department` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Department_locationId_idx`(`locationId`),
    INDEX `Department_floorId_idx`(`floorId`),
    UNIQUE INDEX `Department_locationId_code_key`(`locationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Section` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `supervisorId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Section_locationId_idx`(`locationId`),
    INDEX `Section_floorId_idx`(`floorId`),
    INDEX `Section_departmentId_idx`(`departmentId`),
    UNIQUE INDEX `Section_locationId_code_key`(`locationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SellingPoint` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NOT NULL,
    `sectionId` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `managerId` VARCHAR(191) NULL,
    `targetAmount` DECIMAL(15, 2) NULL,
    `incentiveRuleId` VARCHAR(191) NULL,
    `performanceScore` DECIMAL(5, 2) NULL,
    `status` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SellingPoint_locationId_idx`(`locationId`),
    INDEX `SellingPoint_floorId_idx`(`floorId`),
    INDEX `SellingPoint_sectionId_idx`(`sectionId`),
    UNIQUE INDEX `SellingPoint_locationId_code_key`(`locationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeSellingPoint` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `sellingPointId` VARCHAR(191) NOT NULL,
    `assignedDate` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `EmployeeSellingPoint_employeeId_idx`(`employeeId`),
    INDEX `EmployeeSellingPoint_sellingPointId_idx`(`sellingPointId`),
    UNIQUE INDEX `EmployeeSellingPoint_employeeId_sellingPointId_key`(`employeeId`, `sellingPointId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Employee` (
    `id` VARCHAR(191) NOT NULL,
    `employeeCode` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `fullName` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `gender` VARCHAR(191) NULL,
    `dateOfBirth` DATETIME(3) NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `sectionId` VARCHAR(191) NULL,
    `shiftId` VARCHAR(191) NULL,
    `designation` VARCHAR(191) NULL,
    `role` ENUM('SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE', 'PAYROLL_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER', 'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE', 'TEA_BREAK_MANAGER', 'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE') NOT NULL DEFAULT 'EMPLOYEE',
    `status` ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    `joiningDate` DATETIME(3) NOT NULL,
    `exitDate` DATETIME(3) NULL,
    `faceProfileId` VARCHAR(191) NULL,
    `qrCodeId` VARCHAR(191) NULL,
    `dailyQRCodeId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Employee_employeeCode_key`(`employeeCode`),
    UNIQUE INDEX `Employee_email_key`(`email`),
    INDEX `Employee_employeeCode_idx`(`employeeCode`),
    INDEX `Employee_locationId_idx`(`locationId`),
    INDEX `Employee_floorId_idx`(`floorId`),
    INDEX `Employee_departmentId_idx`(`departmentId`),
    INDEX `Employee_sectionId_idx`(`sectionId`),
    INDEX `Employee_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shift` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `startTime` DATETIME(3) NOT NULL,
    `endTime` DATETIME(3) NOT NULL,
    `gracePeriod` INTEGER NOT NULL DEFAULT 5,
    `lateThreshold` INTEGER NOT NULL DEFAULT 5,
    `earlyLoginIncentive` BOOLEAN NOT NULL DEFAULT true,
    `earlyLoginRatePerSecond` DECIMAL(10, 4) NOT NULL DEFAULT 1,
    `maxDailyEarlyIncentive` DECIMAL(15, 2) NULL,
    `maxMonthlyEarlyIncentive` DECIMAL(15, 2) NULL,
    `latePenaltyEnabled` BOOLEAN NOT NULL DEFAULT false,
    `latePenaltyRatePerSecond` DECIMAL(10, 4) NOT NULL DEFAULT 1,
    `maxDailyLatePenalty` DECIMAL(15, 2) NULL,
    `maxMonthlyLatePenalty` DECIMAL(15, 2) NULL,
    `overtimeEnabled` BOOLEAN NOT NULL DEFAULT true,
    `overtimeRatePerSecond` DECIMAL(10, 4) NULL,
    `earlyLogoutPenaltyEnabled` BOOLEAN NOT NULL DEFAULT false,
    `earlyLogoutRatePerSecond` DECIMAL(10, 4) NULL,
    `lunchDurationMinutes` INTEGER NOT NULL DEFAULT 100,
    `teaDurationMinutes` INTEGER NOT NULL DEFAULT 20,
    `maleLunchMinutes` INTEGER NOT NULL DEFAULT 100,
    `femaleLunchMinutes` INTEGER NOT NULL DEFAULT 40,
    `maleTeaMinutes` INTEGER NOT NULL DEFAULT 20,
    `femaleTeaMinutes` INTEGER NOT NULL DEFAULT 15,
    `faceVerificationThreshold` DECIMAL(5, 2) NOT NULL DEFAULT 85,
    `qrDailyTokenEnabled` BOOLEAN NOT NULL DEFAULT true,
    `qrOneTimeScan` BOOLEAN NOT NULL DEFAULT true,
    `scannerRoles` JSON NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Shift_locationId_idx`(`locationId`),
    INDEX `Shift_status_idx`(`status`),
    UNIQUE INDEX `Shift_locationId_code_key`(`locationId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttendanceRules` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `loginTime` DATETIME(3) NOT NULL,
    `logoutTime` DATETIME(3) NOT NULL,
    `gracePeriodMinutes` INTEGER NOT NULL DEFAULT 5,
    `lateThresholdMinutes` INTEGER NOT NULL DEFAULT 5,
    `earlyLoginIncentiveEnabled` BOOLEAN NOT NULL DEFAULT true,
    `earlyLoginRatePerSecond` DECIMAL(10, 4) NOT NULL DEFAULT 1,
    `earlyLoginMaxDaily` DECIMAL(15, 2) NULL,
    `earlyLoginMaxMonthly` DECIMAL(15, 2) NULL,
    `latePenaltyEnabled` BOOLEAN NOT NULL DEFAULT false,
    `latePenaltyRatePerSecond` DECIMAL(10, 4) NOT NULL DEFAULT 1,
    `latePenaltyMaxDaily` DECIMAL(15, 2) NULL,
    `latePenaltyMaxMonthly` DECIMAL(15, 2) NULL,
    `overtimeIncentiveEnabled` BOOLEAN NOT NULL DEFAULT false,
    `overtimeRatePerSecond` DECIMAL(10, 4) NULL,
    `earlyLogoutPenaltyEnabled` BOOLEAN NOT NULL DEFAULT false,
    `earlyLogoutRatePerSecond` DECIMAL(10, 4) NULL,
    `lunchDurationMinutes` INTEGER NOT NULL DEFAULT 100,
    `teaDurationMinutes` INTEGER NOT NULL DEFAULT 20,
    `maleLunchMinutes` INTEGER NOT NULL DEFAULT 100,
    `femaleLunchMinutes` INTEGER NOT NULL DEFAULT 40,
    `maleTeaMinutes` INTEGER NOT NULL DEFAULT 20,
    `femaleTeaMinutes` INTEGER NOT NULL DEFAULT 15,
    `faceVerificationThreshold` DECIMAL(5, 2) NOT NULL DEFAULT 85,
    `qrDailyTokenEnabled` BOOLEAN NOT NULL DEFAULT true,
    `qrOneTimeScan` BOOLEAN NOT NULL DEFAULT true,
    `scannerRoles` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AttendanceRules_locationId_key`(`locationId`),
    INDEX `AttendanceRules_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BreakRule` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `departmentId` VARCHAR(191) NULL,
    `floorId` VARCHAR(191) NULL,
    `shiftId` VARCHAR(191) NULL,
    `employeeGroup` VARCHAR(191) NULL,
    `breakType` ENUM('LUNCH', 'TEA', 'OTHER') NOT NULL,
    `durationMinutes` INTEGER NOT NULL,
    `maxOccurrences` INTEGER NOT NULL DEFAULT 1,
    `isPaid` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `BreakRule_locationId_idx`(`locationId`),
    INDEX `BreakRule_departmentId_idx`(`departmentId`),
    INDEX `BreakRule_floorId_idx`(`floorId`),
    INDEX `BreakRule_shiftId_idx`(`shiftId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeBreak` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `breakType` ENUM('LUNCH', 'TEA', 'OTHER') NOT NULL,
    `breakDate` DATE NOT NULL,
    `startTime` DATETIME(3) NULL,
    `endTime` DATETIME(3) NULL,
    `allowedDuration` INTEGER NOT NULL,
    `actualDuration` INTEGER NULL,
    `excessDuration` INTEGER NULL,
    `status` ENUM('NOT_STARTED', 'ACTIVE', 'COMPLETED', 'EXCEEDED', 'MANUALLY_ADJUSTED') NOT NULL DEFAULT 'NOT_STARTED',
    `qrScanId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeBreak_employeeId_breakDate_idx`(`employeeId`, `breakDate`),
    INDEX `EmployeeBreak_breakType_idx`(`breakType`),
    INDEX `EmployeeBreak_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `WeeklyOffRule` (
    `id` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `employeeId` VARCHAR(191) NULL,
    `shiftId` VARCHAR(191) NULL,
    `dayOfWeek` ENUM('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'ROTATIONAL') NOT NULL,
    `isRotational` BOOLEAN NOT NULL DEFAULT false,
    `rotationPattern` VARCHAR(191) NULL,
    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `WeeklyOffRule_locationId_idx`(`locationId`),
    INDEX `WeeklyOffRule_employeeId_idx`(`employeeId`),
    INDEX `WeeklyOffRule_floorId_idx`(`floorId`),
    INDEX `WeeklyOffRule_departmentId_idx`(`departmentId`),
    INDEX `WeeklyOffRule_shiftId_idx`(`shiftId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Holiday` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `date` DATE NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `isRecurring` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Holiday_date_idx`(`date`),
    INDEX `Holiday_locationId_idx`(`locationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaceProfile` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `faceData` LONGBLOB NOT NULL,
    `enrolledAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    UNIQUE INDEX `FaceProfile_employeeId_key`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `FaceVerification` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `deviceId` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `matchPercentage` DECIMAL(5, 2) NOT NULL,
    `threshold` DECIMAL(5, 2) NOT NULL,
    `result` ENUM('VERIFIED', 'FAILED') NOT NULL,
    `purpose` VARCHAR(191) NULL DEFAULT 'attendance',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FaceVerification_employeeId_idx`(`employeeId`),
    INDEX `FaceVerification_locationId_idx`(`locationId`),
    INDEX `FaceVerification_verifiedAt_idx`(`verifiedAt`),
    INDEX `FaceVerification_result_idx`(`result`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QRCode` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `type` ENUM('EMPLOYEE', 'DAILY') NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `validFrom` DATETIME(3) NOT NULL,
    `validTo` DATETIME(3) NOT NULL,
    `isConsumed` BOOLEAN NOT NULL DEFAULT false,
    `consumedAt` DATETIME(3) NULL,
    `consumedBy` VARCHAR(191) NULL,
    `purpose` ENUM('ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT', 'LUNCH_START', 'LUNCH_END', 'TEA_BREAK_START', 'TEA_BREAK_END', 'BREAK_START', 'BREAK_END', 'SELLING_POINT_CHECK_IN') NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `QRCode_token_key`(`token`),
    INDEX `QRCode_employeeId_idx`(`employeeId`),
    INDEX `QRCode_token_idx`(`token`),
    INDEX `QRCode_validFrom_validTo_idx`(`validFrom`, `validTo`),
    INDEX `QRCode_isConsumed_idx`(`isConsumed`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `QRScanRecord` (
    `id` VARCHAR(191) NOT NULL,
    `qrCodeId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `scannerId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `sellingPointId` VARCHAR(191) NULL,
    `purpose` ENUM('ATTENDANCE_CHECK_IN', 'ATTENDANCE_CHECK_OUT', 'LUNCH_START', 'LUNCH_END', 'TEA_BREAK_START', 'TEA_BREAK_END', 'BREAK_START', 'BREAK_END', 'SELLING_POINT_CHECK_IN') NOT NULL,
    `result` ENUM('SUCCESS', 'ALREADY_SCANNED', 'EXPIRED', 'UNAUTHORIZED_SCANNER', 'LOCATION_MISMATCH', 'INVALID_TOKEN', 'EMPLOYEE_INACTIVE', 'REVOKED') NOT NULL,
    `failureReason` VARCHAR(191) NULL,
    `scannedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deviceInfo` VARCHAR(191) NULL,
    `ipAddress` VARCHAR(191) NULL,

    INDEX `QRScanRecord_employeeId_scannedAt_idx`(`employeeId`, `scannedAt`),
    INDEX `QRScanRecord_scannerId_scannedAt_idx`(`scannerId`, `scannedAt`),
    INDEX `QRScanRecord_locationId_scannedAt_idx`(`locationId`, `scannedAt`),
    INDEX `QRScanRecord_result_idx`(`result`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncentiveRule` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `incentiveType` ENUM('INDIVIDUAL', 'DEPARTMENT', 'LOCATION', 'FLOOR', 'SELLING_POINT', 'SALES', 'ATTENDANCE', 'PERFORMANCE', 'EARLY_LOGIN', 'TARGET', 'CUSTOM') NOT NULL,
    `calculationType` ENUM('FIXED_AMOUNT', 'PER_HOUR', 'PER_MINUTE', 'PER_SECOND', 'PERCENTAGE', 'TARGET_BASED', 'PERFORMANCE_BASED', 'ATTENDANCE_BASED', 'CUSTOM_RULE') NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `floorId` VARCHAR(191) NULL,
    `sellingPointId` VARCHAR(191) NULL,
    `employeeId` VARCHAR(191) NULL,
    `amount` DECIMAL(15, 2) NULL,
    `percentage` DECIMAL(5, 2) NULL,
    `targetAmount` DECIMAL(15, 2) NULL,
    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,
    `maxDailyAmount` DECIMAL(15, 2) NULL,
    `maxMonthlyAmount` DECIMAL(15, 2) NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'ACTIVE',
    `createdById` VARCHAR(191) NOT NULL,
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IncentiveRule_locationId_idx`(`locationId`),
    INDEX `IncentiveRule_departmentId_idx`(`departmentId`),
    INDEX `IncentiveRule_floorId_idx`(`floorId`),
    INDEX `IncentiveRule_sellingPointId_idx`(`sellingPointId`),
    INDEX `IncentiveRule_employeeId_idx`(`employeeId`),
    INDEX `IncentiveRule_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `EmployeeIncentive` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `incentiveRuleId` VARCHAR(191) NOT NULL,
    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `EmployeeIncentive_employeeId_idx`(`employeeId`),
    INDEX `EmployeeIncentive_incentiveRuleId_idx`(`incentiveRuleId`),
    UNIQUE INDEX `EmployeeIncentive_employeeId_incentiveRuleId_key`(`employeeId`, `incentiveRuleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `IncentiveTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `incentiveRuleId` VARCHAR(191) NOT NULL,
    `transactionDate` DATE NOT NULL,
    `calculationBasis` VARCHAR(191) NOT NULL,
    `calculatedAmount` DECIMAL(15, 2) NOT NULL,
    `calculationDetails` JSON NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `payrollRunId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `IncentiveTransaction_employeeId_transactionDate_idx`(`employeeId`, `transactionDate`),
    INDEX `IncentiveTransaction_incentiveRuleId_idx`(`incentiveRuleId`),
    INDEX `IncentiveTransaction_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PenaltyRule` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NULL,
    `departmentId` VARCHAR(191) NULL,
    `employeeId` VARCHAR(191) NULL,
    `penaltyType` VARCHAR(191) NOT NULL,
    `calculationType` ENUM('FIXED_AMOUNT', 'PER_HOUR', 'PER_MINUTE', 'PER_SECOND', 'PERCENTAGE', 'TARGET_BASED', 'PERFORMANCE_BASED', 'ATTENDANCE_BASED', 'CUSTOM_RULE') NOT NULL,
    `amount` DECIMAL(15, 2) NULL,
    `percentage` DECIMAL(5, 2) NULL,
    `maxDailyAmount` DECIMAL(15, 2) NULL,
    `maxMonthlyAmount` DECIMAL(15, 2) NULL,
    `effectiveFrom` DATE NOT NULL,
    `effectiveTo` DATE NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PenaltyRule_locationId_idx`(`locationId`),
    INDEX `PenaltyRule_departmentId_idx`(`departmentId`),
    INDEX `PenaltyRule_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PenaltyTransaction` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `penaltyRuleId` VARCHAR(191) NOT NULL,
    `transactionDate` DATE NOT NULL,
    `calculationBasis` VARCHAR(191) NOT NULL,
    `calculatedAmount` DECIMAL(15, 2) NOT NULL,
    `calculationDetails` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `approvedById` VARCHAR(191) NULL,
    `approvedAt` DATETIME(3) NULL,
    `payrollRunId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PenaltyTransaction_employeeId_transactionDate_idx`(`employeeId`, `transactionDate`),
    INDEX `PenaltyTransaction_penaltyRuleId_idx`(`penaltyRuleId`),
    INDEX `PenaltyTransaction_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attendance` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `shiftId` VARCHAR(191) NULL,
    `attendanceDate` DATE NOT NULL,
    `scheduledLogin` DATETIME(3) NULL,
    `actualLogin` DATETIME(3) NULL,
    `scheduledLogout` DATETIME(3) NULL,
    `actualLogout` DATETIME(3) NULL,
    `earlyLoginSeconds` INTEGER NOT NULL DEFAULT 0,
    `lateLoginSeconds` INTEGER NOT NULL DEFAULT 0,
    `earlyLogoutSeconds` INTEGER NOT NULL DEFAULT 0,
    `overtimeSeconds` INTEGER NOT NULL DEFAULT 0,
    `totalWorkingSeconds` INTEGER NOT NULL DEFAULT 0,
    `breakSeconds` INTEGER NOT NULL DEFAULT 0,
    `effectiveWorkingSeconds` INTEGER NOT NULL DEFAULT 0,
    `earlyLoginIncentive` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `lateLoginPenalty` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `overtimeIncentive` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `earlyLogoutPenalty` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `status` ENUM('PRESENT', 'ABSENT', 'LATE', 'EARLY', 'ON_LUNCH', 'ON_TEA_BREAK', 'ON_OTHER_BREAK', 'WEEKLY_OFF', 'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED', 'FACE_VERIFICATION_FAILED') NOT NULL DEFAULT 'ABSENT',
    `faceVerified` BOOLEAN NOT NULL DEFAULT false,
    `faceMatchPercentage` DECIMAL(5, 2) NULL,
    `notes` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Attendance_locationId_attendanceDate_idx`(`locationId`, `attendanceDate`),
    INDEX `Attendance_shiftId_idx`(`shiftId`),
    INDEX `Attendance_status_idx`(`status`),
    UNIQUE INDEX `Attendance_employeeId_attendanceDate_key`(`employeeId`, `attendanceDate`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Observation` (
    `id` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `sectionId` VARCHAR(191) NULL,
    `sellingPointId` VARCHAR(191) NULL,
    `observationType` ENUM('POSITIVE', 'IMPROVEMENT', 'CUSTOMER_SERVICE', 'SALES', 'GROOMING', 'PRODUCT_KNOWLEDGE', 'ATTENDANCE', 'DISCIPLINE', 'SELLING_SKILL', 'STORE_STANDARD', 'SAFETY') NOT NULL,
    `level` ENUM('EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_IMPROVEMENT', 'CRITICAL') NOT NULL,
    `score` INTEGER NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `actionRequired` VARCHAR(191) NULL,
    `assignedToId` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `dueDate` DATETIME(3) NULL,
    `status` ENUM('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    `videoUrl` VARCHAR(191) NULL,
    `photoUrl` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Observation_employeeId_idx`(`employeeId`),
    INDEX `Observation_locationId_idx`(`locationId`),
    INDEX `Observation_status_idx`(`status`),
    INDEX `Observation_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ObservationReaction` (
    `id` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reactionType` ENUM('ACKNOWLEDGED', 'COMPLETED', 'EXCELLENT', 'REVIEWING', 'ATTENTION') NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ObservationReaction_observationId_idx`(`observationId`),
    INDEX `ObservationReaction_userId_idx`(`userId`),
    UNIQUE INDEX `ObservationReaction_observationId_userId_reactionType_key`(`observationId`, `userId`, `reactionType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ObservationComment` (
    `id` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `content` VARCHAR(191) NOT NULL,
    `mentions` JSON NULL,
    `attachments` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ObservationComment_observationId_idx`(`observationId`),
    INDEX `ObservationComment_userId_idx`(`userId`),
    INDEX `ObservationComment_parentId_idx`(`parentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ObservationAttachment` (
    `id` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NOT NULL,
    `fileName` VARCHAR(191) NOT NULL,
    `fileUrl` VARCHAR(191) NOT NULL,
    `fileType` VARCHAR(191) NOT NULL,
    `fileSize` INTEGER NOT NULL,
    `uploadedById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ObservationAttachment_observationId_idx`(`observationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveStream` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `floorId` VARCHAR(191) NULL,
    `sectionId` VARCHAR(191) NULL,
    `sellingPointId` VARCHAR(191) NULL,
    `hostId` VARCHAR(191) NOT NULL,
    `streamUrl` VARCHAR(191) NOT NULL,
    `streamKey` VARCHAR(191) NOT NULL,
    `status` ENUM('SCHEDULED', 'LIVE', 'PAUSED', 'ENDED') NOT NULL DEFAULT 'SCHEDULED',
    `viewerCount` INTEGER NOT NULL DEFAULT 0,
    `startedAt` DATETIME(3) NULL,
    `endedAt` DATETIME(3) NULL,
    `scheduledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `LiveStream_streamKey_key`(`streamKey`),
    INDEX `LiveStream_locationId_idx`(`locationId`),
    INDEX `LiveStream_status_idx`(`status`),
    INDEX `LiveStream_hostId_idx`(`hostId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveStreamViewer` (
    `id` VARCHAR(191) NOT NULL,
    `streamId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `joinedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `leftAt` DATETIME(3) NULL,
    `isActive` BOOLEAN NOT NULL DEFAULT true,

    INDEX `LiveStreamViewer_streamId_idx`(`streamId`),
    INDEX `LiveStreamViewer_userId_idx`(`userId`),
    UNIQUE INDEX `LiveStreamViewer_streamId_userId_key`(`streamId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveStreamMessage` (
    `id` VARCHAR(191) NOT NULL,
    `streamId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LiveStreamMessage_streamId_idx`(`streamId`),
    INDEX `LiveStreamMessage_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `LiveStreamReaction` (
    `id` VARCHAR(191) NOT NULL,
    `streamId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `reactionType` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `LiveStreamReaction_streamId_idx`(`streamId`),
    INDEX `LiveStreamReaction_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StreamObservation` (
    `id` VARCHAR(191) NOT NULL,
    `streamId` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NOT NULL,
    `timestampSeconds` INTEGER NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StreamObservation_streamId_idx`(`streamId`),
    INDEX `StreamObservation_observationId_idx`(`observationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StreamTimestamp` (
    `id` VARCHAR(191) NOT NULL,
    `streamId` VARCHAR(191) NOT NULL,
    `timestampSeconds` INTEGER NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `notes` VARCHAR(191) NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `StreamTimestamp_streamId_idx`(`streamId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NULL,
    `action` ENUM('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'SCAN', 'VERIFY', 'APPROVE', 'REJECT', 'ASSIGN', 'CONFIGURE', 'EXPORT', 'IMPORT') NOT NULL,
    `entityType` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NOT NULL,
    `oldValue` JSON NULL,
    `newValue` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `userAgent` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AuditLog_userId_idx`(`userId`),
    INDEX `AuditLog_locationId_idx`(`locationId`),
    INDEX `AuditLog_action_idx`(`action`),
    INDEX `AuditLog_entityType_entityId_idx`(`entityType`, `entityId`),
    INDEX `AuditLog_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VideoNote` (
    `id` VARCHAR(191) NOT NULL,
    `observationId` VARCHAR(191) NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `locationId` VARCHAR(191) NOT NULL,
    `sellingPointId` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `videoUrl` VARCHAR(191) NOT NULL,
    `thumbnailUrl` VARCHAR(191) NULL,
    `duration` INTEGER NULL,
    `recordedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `VideoNote_employeeId_idx`(`employeeId`),
    INDEX `VideoNote_locationId_idx`(`locationId`),
    INDEX `VideoNote_observationId_idx`(`observationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollRun` (
    `id` VARCHAR(191) NOT NULL,
    `periodStart` DATE NOT NULL,
    `periodEnd` DATE NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DRAFT',
    `processedBy` VARCHAR(191) NULL,
    `processedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PayrollItem` (
    `id` VARCHAR(191) NOT NULL,
    `payrollRunId` VARCHAR(191) NOT NULL,
    `employeeId` VARCHAR(191) NOT NULL,
    `basicSalary` DECIMAL(15, 2) NOT NULL,
    `earlyIncentive` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `attendanceIncentive` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `performanceIncentive` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `salesIncentive` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `overtime` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `deductions` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `penalties` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `netPay` DECIMAL(15, 2) NOT NULL,
    `calculationDetails` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `PayrollItem_payrollRunId_idx`(`payrollRunId`),
    INDEX `PayrollItem_employeeId_idx`(`employeeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `User` ADD CONSTRAINT `User_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_hrManagerId_fkey` FOREIGN KEY (`hrManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Floor` ADD CONSTRAINT `Floor_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Floor` ADD CONSTRAINT `Floor_floorManagerId_fkey` FOREIGN KEY (`floorManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Floor` ADD CONSTRAINT `Floor_assistantManagerId_fkey` FOREIGN KEY (`assistantManagerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Department` ADD CONSTRAINT `Department_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Section` ADD CONSTRAINT `Section_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Section` ADD CONSTRAINT `Section_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Section` ADD CONSTRAINT `Section_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Section` ADD CONSTRAINT `Section_supervisorId_fkey` FOREIGN KEY (`supervisorId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellingPoint` ADD CONSTRAINT `SellingPoint_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellingPoint` ADD CONSTRAINT `SellingPoint_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellingPoint` ADD CONSTRAINT `SellingPoint_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellingPoint` ADD CONSTRAINT `SellingPoint_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellingPoint` ADD CONSTRAINT `SellingPoint_managerId_fkey` FOREIGN KEY (`managerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SellingPoint` ADD CONSTRAINT `SellingPoint_incentiveRuleId_fkey` FOREIGN KEY (`incentiveRuleId`) REFERENCES `IncentiveRule`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeSellingPoint` ADD CONSTRAINT `EmployeeSellingPoint_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeSellingPoint` ADD CONSTRAINT `EmployeeSellingPoint_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `SellingPoint`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_faceProfileId_fkey` FOREIGN KEY (`faceProfileId`) REFERENCES `FaceProfile`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_qrCodeId_fkey` FOREIGN KEY (`qrCodeId`) REFERENCES `QRCode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Employee` ADD CONSTRAINT `Employee_dailyQRCodeId_fkey` FOREIGN KEY (`dailyQRCodeId`) REFERENCES `QRCode`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shift` ADD CONSTRAINT `Shift_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AttendanceRules` ADD CONSTRAINT `AttendanceRules_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreakRule` ADD CONSTRAINT `BreakRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreakRule` ADD CONSTRAINT `BreakRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreakRule` ADD CONSTRAINT `BreakRule_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BreakRule` ADD CONSTRAINT `BreakRule_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeBreak` ADD CONSTRAINT `EmployeeBreak_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeBreak` ADD CONSTRAINT `EmployeeBreak_qrScanId_fkey` FOREIGN KEY (`qrScanId`) REFERENCES `QRScanRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WeeklyOffRule` ADD CONSTRAINT `WeeklyOffRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WeeklyOffRule` ADD CONSTRAINT `WeeklyOffRule_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WeeklyOffRule` ADD CONSTRAINT `WeeklyOffRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WeeklyOffRule` ADD CONSTRAINT `WeeklyOffRule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `WeeklyOffRule` ADD CONSTRAINT `WeeklyOffRule_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Holiday` ADD CONSTRAINT `Holiday_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Holiday` ADD CONSTRAINT `Holiday_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FaceProfile` ADD CONSTRAINT `FaceProfile_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FaceVerification` ADD CONSTRAINT `FaceVerification_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `FaceVerification` ADD CONSTRAINT `FaceVerification_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QRCode` ADD CONSTRAINT `QRCode_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QRCode` ADD CONSTRAINT `QRCode_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QRScanRecord` ADD CONSTRAINT `QRScanRecord_qrCodeId_fkey` FOREIGN KEY (`qrCodeId`) REFERENCES `QRCode`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QRScanRecord` ADD CONSTRAINT `QRScanRecord_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QRScanRecord` ADD CONSTRAINT `QRScanRecord_scannerId_fkey` FOREIGN KEY (`scannerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QRScanRecord` ADD CONSTRAINT `QRScanRecord_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `QRScanRecord` ADD CONSTRAINT `QRScanRecord_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `SellingPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveRule` ADD CONSTRAINT `IncentiveRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveRule` ADD CONSTRAINT `IncentiveRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveRule` ADD CONSTRAINT `IncentiveRule_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveRule` ADD CONSTRAINT `IncentiveRule_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `SellingPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveRule` ADD CONSTRAINT `IncentiveRule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveRule` ADD CONSTRAINT `IncentiveRule_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveRule` ADD CONSTRAINT `IncentiveRule_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeIncentive` ADD CONSTRAINT `EmployeeIncentive_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `EmployeeIncentive` ADD CONSTRAINT `EmployeeIncentive_incentiveRuleId_fkey` FOREIGN KEY (`incentiveRuleId`) REFERENCES `IncentiveRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveTransaction` ADD CONSTRAINT `IncentiveTransaction_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveTransaction` ADD CONSTRAINT `IncentiveTransaction_incentiveRuleId_fkey` FOREIGN KEY (`incentiveRuleId`) REFERENCES `IncentiveRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `IncentiveTransaction` ADD CONSTRAINT `IncentiveTransaction_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PenaltyRule` ADD CONSTRAINT `PenaltyRule_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PenaltyRule` ADD CONSTRAINT `PenaltyRule_departmentId_fkey` FOREIGN KEY (`departmentId`) REFERENCES `Department`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PenaltyRule` ADD CONSTRAINT `PenaltyRule_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PenaltyTransaction` ADD CONSTRAINT `PenaltyTransaction_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PenaltyTransaction` ADD CONSTRAINT `PenaltyTransaction_penaltyRuleId_fkey` FOREIGN KEY (`penaltyRuleId`) REFERENCES `PenaltyRule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PenaltyTransaction` ADD CONSTRAINT `PenaltyTransaction_approvedById_fkey` FOREIGN KEY (`approvedById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attendance` ADD CONSTRAINT `Attendance_shiftId_fkey` FOREIGN KEY (`shiftId`) REFERENCES `Shift`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `SellingPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Observation` ADD CONSTRAINT `Observation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObservationReaction` ADD CONSTRAINT `ObservationReaction_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObservationReaction` ADD CONSTRAINT `ObservationReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObservationComment` ADD CONSTRAINT `ObservationComment_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObservationComment` ADD CONSTRAINT `ObservationComment_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObservationComment` ADD CONSTRAINT `ObservationComment_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `ObservationComment`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObservationAttachment` ADD CONSTRAINT `ObservationAttachment_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ObservationAttachment` ADD CONSTRAINT `ObservationAttachment_uploadedById_fkey` FOREIGN KEY (`uploadedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStream` ADD CONSTRAINT `LiveStream_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStream` ADD CONSTRAINT `LiveStream_floorId_fkey` FOREIGN KEY (`floorId`) REFERENCES `Floor`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStream` ADD CONSTRAINT `LiveStream_sectionId_fkey` FOREIGN KEY (`sectionId`) REFERENCES `Section`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStream` ADD CONSTRAINT `LiveStream_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `SellingPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStream` ADD CONSTRAINT `LiveStream_hostId_fkey` FOREIGN KEY (`hostId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStreamViewer` ADD CONSTRAINT `LiveStreamViewer_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `LiveStream`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStreamViewer` ADD CONSTRAINT `LiveStreamViewer_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStreamMessage` ADD CONSTRAINT `LiveStreamMessage_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `LiveStream`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStreamMessage` ADD CONSTRAINT `LiveStreamMessage_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStreamReaction` ADD CONSTRAINT `LiveStreamReaction_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `LiveStream`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `LiveStreamReaction` ADD CONSTRAINT `LiveStreamReaction_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamObservation` ADD CONSTRAINT `StreamObservation_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `LiveStream`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamObservation` ADD CONSTRAINT `StreamObservation_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamObservation` ADD CONSTRAINT `StreamObservation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamTimestamp` ADD CONSTRAINT `StreamTimestamp_streamId_fkey` FOREIGN KEY (`streamId`) REFERENCES `LiveStream`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `StreamTimestamp` ADD CONSTRAINT `StreamTimestamp_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoNote` ADD CONSTRAINT `VideoNote_observationId_fkey` FOREIGN KEY (`observationId`) REFERENCES `Observation`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoNote` ADD CONSTRAINT `VideoNote_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoNote` ADD CONSTRAINT `VideoNote_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `VideoNote` ADD CONSTRAINT `VideoNote_sellingPointId_fkey` FOREIGN KEY (`sellingPointId`) REFERENCES `SellingPoint`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItem` ADD CONSTRAINT `PayrollItem_payrollRunId_fkey` FOREIGN KEY (`payrollRunId`) REFERENCES `PayrollRun`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PayrollItem` ADD CONSTRAINT `PayrollItem_employeeId_fkey` FOREIGN KEY (`employeeId`) REFERENCES `Employee`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
