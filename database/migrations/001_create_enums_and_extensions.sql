-- ==============================================================================
-- 001: MYSQL INITIAL SETTINGS, CHARACTER SET & PREREQUISITES
-- Database Engine: MySQL 8.0 InnoDB
-- Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci
-- ==============================================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Migration registry tracking table
CREATE TABLE IF NOT EXISTS _migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    executed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
