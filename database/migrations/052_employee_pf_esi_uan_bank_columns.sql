-- ===========================================================================
-- 052: EMPLOYEE PF/ESI/UAN/BANK COLUMNS
-- Adds missing statutory compliance and banking columns to employee table
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- Safe idempotent column additions on employee
ALTER TABLE `employee`
  ADD COLUMN IF NOT EXISTS `pfNo` VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS `esiNo` VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS `uanNo` VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS `bankAccount` VARCHAR(191) NULL,
  ADD COLUMN IF NOT EXISTS `pfApplicable` TINYINT(1) NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS `esiApplicable` TINYINT(1) NULL DEFAULT 1;

-- Create index for PF/ESI lookup
CREATE INDEX IF NOT EXISTS `idx_employee_pfNo` ON `employee` (`pfNo`);
CREATE INDEX IF NOT EXISTS `idx_employee_esiNo` ON `employee` (`esiNo`);
CREATE INDEX IF NOT EXISTS `idx_employee_uanNo` ON `employee` (`uanNo`);

SET FOREIGN_KEY_CHECKS = 1;