-- ===========================================================================
-- 050: EMPLOYEE ONBOARDING EXTENDED FIELDS & REPOSITORY SCHEMA COMPLETION
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Safe column additions on employee (individual statements allow runner to skip existing columns)
ALTER TABLE `employee` ADD COLUMN `photoUrl` VARCHAR(500) NULL;
ALTER TABLE `employee` ADD COLUMN `address` TEXT NULL;
ALTER TABLE `employee` ADD COLUMN `emergencyContactName` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `emergencyContactPhone` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `emergencyContactRelation` VARCHAR(100) NULL;
ALTER TABLE `employee` ADD COLUMN `reportingManager` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `hrManager` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `employmentType` VARCHAR(50) NOT NULL DEFAULT 'FULL_TIME';
ALTER TABLE `employee` ADD COLUMN `bankName` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `bankAccountNumber` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `bankIfsc` VARCHAR(50) NULL;
ALTER TABLE `employee` ADD COLUMN `previousCompany` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `previousExperienceYears` DECIMAL(4,1) NOT NULL DEFAULT 0.0;
ALTER TABLE `employee` ADD COLUMN `onboardingStatus` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE `employee` ADD COLUMN `fixedGrossSalary` DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `employee` ADD COLUMN `basicSalary` DECIMAL(12,2) NOT NULL DEFAULT 0.00;
ALTER TABLE `employee` ADD COLUMN `perDaySalary` DECIMAL(10,2) NOT NULL DEFAULT 0.00;

SET FOREIGN_KEY_CHECKS = 1;
