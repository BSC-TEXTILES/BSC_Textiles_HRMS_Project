-- ===========================================================================
-- 052: EMPLOYEE PF/ESI/UAN/BANK COLUMNS
-- Adds missing statutory compliance and banking columns to employee table
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Safe column additions on employee (individual statements allow runner to skip existing columns)
ALTER TABLE `employee` ADD COLUMN `pfNo` VARCHAR(50) NULL;
ALTER TABLE `employee` ADD COLUMN `esiNo` VARCHAR(50) NULL;
ALTER TABLE `employee` ADD COLUMN `uanNo` VARCHAR(50) NULL;
ALTER TABLE `employee` ADD COLUMN `bankAccount` VARCHAR(191) NULL;
ALTER TABLE `employee` ADD COLUMN `pfApplicable` TINYINT(1) NULL DEFAULT 1;
ALTER TABLE `employee` ADD COLUMN `esiApplicable` TINYINT(1) NULL DEFAULT 1;

-- Create index for PF/ESI lookup
ALTER TABLE `employee` ADD INDEX `idx_employee_pfNo` (`pfNo`);
ALTER TABLE `employee` ADD INDEX `idx_employee_esiNo` (`esiNo`);
ALTER TABLE `employee` ADD INDEX `idx_employee_uanNo` (`uanNo`);

SET FOREIGN_KEY_CHECKS = 1;
