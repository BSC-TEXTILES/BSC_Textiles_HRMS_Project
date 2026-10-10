-- ==============================================================================
-- BSC TEXTILES HRMS — MIGRATION 011: FULL & FINAL SETTLEMENT, LEAVE MANAGEMENT & PAYSLIP AUDIT
-- Native MySQL 8.0 DDL (Zero Prisma)
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. EMPLOYEE EXITS TABLE
CREATE TABLE IF NOT EXISTS `employee_exits` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `exit_type` ENUM('RESIGNATION', 'TERMINATION', 'RETIREMENT', 'ABSCONDING', 'CONTRACT_END') NOT NULL DEFAULT 'RESIGNATION',
  `resignation_date` DATE NOT NULL,
  `notice_period_days` INT NOT NULL DEFAULT 30,
  `last_working_day` DATE NOT NULL,
  `reason` TEXT NOT NULL,
  `status` ENUM('INITIATED', 'CLEARANCE_PENDING', 'SETTLEMENT_PENDING', 'HR_REVIEW', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED', 'REJECTED') NOT NULL DEFAULT 'INITIATED',
  `initiator_id` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_exit_employee` (`employee_id`),
  INDEX `idx_exit_status` (`status`),
  INDEX `idx_exit_lwd` (`last_working_day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. EXIT CLEARANCE TASKS TABLE
CREATE TABLE IF NOT EXISTS `exit_clearance_tasks` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `exit_id` VARCHAR(36) NOT NULL,
  `department` ENUM('IT', 'ACCOUNTS', 'HR', 'STORE_OPS', 'SECURITY') NOT NULL,
  `task_name` VARCHAR(255) NOT NULL,
  `status` ENUM('PENDING', 'CLEARED', 'REJECTED', 'WAIVED') NOT NULL DEFAULT 'PENDING',
  `remarks` TEXT NULL,
  `cleared_by` VARCHAR(36) NULL,
  `cleared_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_clearance_exit` (`exit_id`),
  INDEX `idx_clearance_dept` (`department`),
  INDEX `idx_clearance_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. FULL & FINAL SETTLEMENTS TABLE
CREATE TABLE IF NOT EXISTS `fnf_settlements` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `exit_id` VARCHAR(36) NOT NULL UNIQUE,
  `employee_id` VARCHAR(36) NOT NULL,
  `status` ENUM('DRAFT', 'HR_REVIEW', 'PENDING_APPROVAL', 'APPROVED', 'PAYMENT_PENDING', 'PAID', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `approved_last_working_day` DATE NOT NULL,
  `unpaid_salary_days` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `unpaid_salary_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `gratuity_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `leave_encashment_days` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `leave_encashment_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `bonus_incentive_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `other_earnings` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_earnings` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `notice_shortfall_days` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `notice_recovery_amount` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `salary_advance_recovery` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `loan_balance_recovery` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `asset_damage_recovery` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `statutory_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `other_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `total_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `net_payable` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `calculation_breakdown_json` JSON NULL,
  `statement_pdf_path` VARCHAR(500) NULL,
  `remarks` TEXT NULL,
  `prepared_by` VARCHAR(36) NULL,
  `approved_by` VARCHAR(36) NULL,
  `approved_at` DATETIME NULL,
  `payment_reference` VARCHAR(100) NULL,
  `payment_mode` ENUM('NEFT', 'RTGS', 'UPI', 'CHEQUE', 'BANK_TRANSFER') NULL,
  `payment_date` DATE NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_fnf_emp` (`employee_id`),
  INDEX `idx_fnf_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. F&F ADJUSTMENTS AUDIT TABLE
CREATE TABLE IF NOT EXISTS `fnf_adjustments` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `settlement_id` VARCHAR(36) NOT NULL,
  `field_name` VARCHAR(100) NOT NULL,
  `old_value` VARCHAR(255) NULL,
  `new_value` VARCHAR(255) NULL,
  `reason` TEXT NOT NULL,
  `changed_by` VARCHAR(36) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_fnf_adj_settlement` (`settlement_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. LEAVE TYPES TABLE
CREATE TABLE IF NOT EXISTS `leave_types` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `code` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(100) NOT NULL,
  `annual_quota` DECIMAL(5,2) NOT NULL DEFAULT 12.00,
  `is_paid` BOOLEAN NOT NULL DEFAULT TRUE,
  `carry_forward_max` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `requires_document` BOOLEAN NOT NULL DEFAULT FALSE,
  `description` VARCHAR(255) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. LEAVE BALANCES TABLE
CREATE TABLE IF NOT EXISTS `leave_balances` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `leave_type_id` VARCHAR(36) NOT NULL,
  `year` INT NOT NULL DEFAULT 2026,
  `total_credited` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `used` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `pending` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `balance` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY `uk_emp_leave_year` (`employee_id`, `leave_type_id`, `year`),
  INDEX `idx_lb_employee` (`employee_id`),
  INDEX `idx_lb_type` (`leave_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. LEAVE APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS `leave_applications` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `leave_type_id` VARCHAR(36) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `is_half_day` BOOLEAN NOT NULL DEFAULT FALSE,
  `half_day_session` ENUM('FIRST_HALF', 'SECOND_HALF') NULL,
  `days_count` DECIMAL(5,2) NOT NULL DEFAULT 1.00,
  `reason` TEXT NOT NULL,
  `document_url` VARCHAR(500) NULL,
  `status` ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `reviewed_by` VARCHAR(36) NULL,
  `reviewed_at` DATETIME NULL,
  `rejection_reason` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_la_employee` (`employee_id`),
  INDEX `idx_la_dates` (`start_date`, `end_date`),
  INDEX `idx_la_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. LEAVE LEDGER TABLE (Idempotent Balance Audit)
CREATE TABLE IF NOT EXISTS `leave_ledger` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `employee_id` VARCHAR(36) NOT NULL,
  `leave_type_id` VARCHAR(36) NOT NULL,
  `application_id` VARCHAR(36) NULL,
  `transaction_type` ENUM('CREDIT', 'DEBIT', 'ENCASHMENT', 'ADJUSTMENT', 'LAPSE') NOT NULL,
  `days` DECIMAL(5,2) NOT NULL,
  `balance_after` DECIMAL(5,2) NOT NULL,
  `description` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(36) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_ledger_employee` (`employee_id`),
  INDEX `idx_ledger_type` (`leave_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. PAYSLIP VERSIONS & AUDIT LOG
CREATE TABLE IF NOT EXISTS `payslip_versions` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `payroll_item_id` VARCHAR(36) NOT NULL,
  `payroll_run_id` VARCHAR(36) NOT NULL,
  `employee_id` VARCHAR(36) NOT NULL,
  `version` INT NOT NULL DEFAULT 1,
  `is_superseded` BOOLEAN NOT NULL DEFAULT FALSE,
  `basic_salary` DECIMAL(12,2) NOT NULL,
  `allowances` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `incentives` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `overtime_pay` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `penalties` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `statutory_deductions` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `gross_earnings` DECIMAL(12,2) NOT NULL,
  `total_deductions` DECIMAL(12,2) NOT NULL,
  `net_pay` DECIMAL(12,2) NOT NULL,
  `pdf_path` VARCHAR(500) NULL,
  `edited_by` VARCHAR(36) NULL,
  `edit_reason` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_pv_item` (`payroll_item_id`),
  INDEX `idx_pv_employee` (`employee_id`),
  INDEX `idx_pv_version` (`payroll_item_id`, `version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. INITIAL SEED FOR LEAVE TYPES
INSERT INTO `leave_types` (`id`, `code`, `name`, `annual_quota`, `is_paid`, `carry_forward_max`, `requires_document`, `description`, `is_active`)
VALUES
('lt_cl', 'CL', 'Casual Leave', 12.00, TRUE, 0.00, FALSE, 'Urgent personal matters and unplanned absences', TRUE),
('lt_sl', 'SL', 'Sick Leave', 10.00, TRUE, 5.00, TRUE, 'Medical illness or health recovery requiring leave', TRUE),
('lt_el', 'EL', 'Earned / Annual Leave', 18.00, TRUE, 30.00, FALSE, 'Privilege planned vacation and annual paid leave', TRUE),
('lt_lop', 'LOP', 'Loss of Pay (Unpaid)', 365.00, FALSE, 0.00, FALSE, 'Leave without pay when quotas are exhausted', TRUE)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

SET FOREIGN_KEY_CHECKS = 1;
