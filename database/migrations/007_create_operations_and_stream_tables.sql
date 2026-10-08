-- ==============================================================================
-- 007: LIVESTREAM, OBSERVATIONS, AND STORE OPERATIONS
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS live_streams (
    id VARCHAR(36) PRIMARY KEY,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,
    location_id VARCHAR(36) NOT NULL,
    host_user_id VARCHAR(36) NOT NULL,
    stream_url VARCHAR(255) NOT NULL,
    stream_key VARCHAR(64) NOT NULL UNIQUE,
    status ENUM('SCHEDULED', 'LIVE', 'ENDED', 'RECORDED') NOT NULL DEFAULT 'SCHEDULED',
    viewer_count INT NOT NULL DEFAULT 0,
    started_at DATETIME(3) NULL,
    ended_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_stream_loc (location_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS observations (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NULL,
    observer_id VARCHAR(36) NOT NULL,
    stream_id VARCHAR(36) NULL,
    type ENUM('SALES_EXCELLENCE', 'GROOMING_STANDARD', 'COUNTER_EMPTY', 'OVERRUN_FLAG', 'AUDIT_NOTE') NOT NULL,
    severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'LOW',
    notes TEXT NOT NULL,
    tags JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_obs_emp (employee_id),
    INDEX idx_obs_loc (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS weekly_offs (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NULL,
    off_day ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY') NOT NULL DEFAULT 'TUESDAY',
    effective_from DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_wo_loc (location_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS holidays (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NULL,
    name VARCHAR(120) NOT NULL,
    holiday_date DATE NOT NULL,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_holiday_date (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
