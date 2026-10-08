-- ==============================================================================
-- 005: QR BADGES & BIOMETRIC VERIFICATION LOGS
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS qr_codes (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    valid_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_qr_lookup (token, valid_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS qr_scan_records (
    id VARCHAR(36) PRIMARY KEY,
    qr_code_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NOT NULL,
    scanner_user_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    scan_type ENUM('ATTENDANCE_IN', 'ATTENDANCE_OUT', 'BREAK_START', 'BREAK_END') NOT NULL,
    scanned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    rejection_reason VARCHAR(100) NULL,
    INDEX idx_scan_history (employee_id, scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS face_verification_logs (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    match_confidence DECIMAL(5, 2) NOT NULL,
    threshold_used DECIMAL(5, 2) NOT NULL DEFAULT 85.00,
    status ENUM('VERIFIED', 'FAILED') NOT NULL,
    captured_image_url VARCHAR(255) NULL,
    verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_face_logs (employee_id, verified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
