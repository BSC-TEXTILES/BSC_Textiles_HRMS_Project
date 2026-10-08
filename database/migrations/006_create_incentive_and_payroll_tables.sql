-- ==============================================================================
-- 006: INCENTIVE RULES, GRANTS, PENALTIES, AND PAYROLL DISBURSEMENT
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS incentive_rules (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    type ENUM('EARLY_LOGIN', 'PERFECT_ATTENDANCE', 'SALES_TARGET', 'OVERTIME', 'FESTIVAL_BONUS') NOT NULL,
    rate_type ENUM('PER_SECOND', 'PER_MINUTE', 'FIXED', 'PERCENTAGE', 'TIERED') NOT NULL DEFAULT 'PER_SECOND',
    rate_value DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
    min_threshold INT NULL,
    max_cap DECIMAL(12, 2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_inc_rules (location_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS incentive_grants (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    rule_id VARCHAR(36) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    granted_date DATE NOT NULL,
    breakdown JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_inc_grants (employee_id, granted_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS penalty_policies (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    violation_type ENUM('LATE_LOGIN', 'BREAK_OVERRUN', 'EARLY_LOGOUT', 'UNAUTHORIZED_ABSENCE') NOT NULL,
    rate_type ENUM('PER_SECOND', 'PER_MINUTE', 'FIXED') NOT NULL DEFAULT 'PER_SECOND',
    rate_value DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
    grace_window_seconds INT NOT NULL DEFAULT 300,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_penalty_pol (location_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_runs (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status ENUM('DRAFT', 'APPROVED', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    processed_by VARCHAR(120) NOT NULL,
    processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_payroll_period (location_id, period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payroll_items (
    id VARCHAR(36) PRIMARY KEY,
    payroll_run_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NOT NULL,
    basic_salary DECIMAL(12, 2) NOT NULL,
    allowances DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    early_incentive DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    sales_incentive DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    attendance_incentive DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    overtime_pay DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    late_penalties DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    break_penalties DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    statutory_deductions DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    gross_earnings DECIMAL(12, 2) NOT NULL,
    total_deductions DECIMAL(12, 2) NOT NULL,
    net_pay DECIMAL(12, 2) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_payroll_item_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
