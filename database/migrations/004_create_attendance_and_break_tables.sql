-- ==============================================================================
-- 004: ATTENDANCE & BREAK TRACKING (SUB-SECOND PUNCTUALITY)
-- Supports dual column names for native SQL + backward compatibility
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS attendance (
    id VARCHAR(36) PRIMARY KEY,
    employeeId VARCHAR(36) NOT NULL,
    locationId VARCHAR(36) NOT NULL,
    shiftId VARCHAR(36) NULL,
    attendanceDate DATE NOT NULL,
    scheduledLogin DATETIME(3) NULL,
    actualLogin DATETIME(3) NULL,
    scheduledLogout DATETIME(3) NULL,
    actualLogout DATETIME(3) NULL,
    earlyLoginSeconds INT NOT NULL DEFAULT 0,
    lateLoginSeconds INT NOT NULL DEFAULT 0,
    earlyLogoutSeconds INT NOT NULL DEFAULT 0,
    overtimeSeconds INT NOT NULL DEFAULT 0,
    totalWorkingSeconds INT NOT NULL DEFAULT 0,
    breakSeconds INT NOT NULL DEFAULT 0,
    effectiveWorkingSeconds INT NOT NULL DEFAULT 0,
    earlyLoginIncentive DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    lateLoginPenalty DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    overtimeIncentive DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    earlyLogoutPenalty DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    status ENUM(
        'PRESENT', 'ABSENT', 'LATE', 'EARLY', 'ON_LUNCH',
        'ON_TEA_BREAK', 'ON_OTHER_BREAK', 'WEEKLY_OFF',
        'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED', 'FACE_VERIFICATION_FAILED'
    ) NOT NULL DEFAULT 'PRESENT',
    faceVerified BOOLEAN NOT NULL DEFAULT FALSE,
    faceMatchPercentage DECIMAL(5, 2) NULL,
    notes TEXT NULL,
    createdAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updatedAt DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    employee_id VARCHAR(36) GENERATED ALWAYS AS (employeeId) VIRTUAL,
    location_id VARCHAR(36) GENERATED ALWAYS AS (locationId) VIRTUAL,
    shift_id VARCHAR(36) GENERATED ALWAYS AS (shiftId) VIRTUAL,
    attendance_date DATE GENERATED ALWAYS AS (attendanceDate) VIRTUAL,
    punch_in DATETIME(3) GENERATED ALWAYS AS (actualLogin) VIRTUAL,
    punch_out DATETIME(3) GENERATED ALWAYS AS (actualLogout) VIRTUAL,
    is_face_verified BOOLEAN GENERATED ALWAYS AS (faceVerified) VIRTUAL,
    early_login_incentive DECIMAL(15, 2) GENERATED ALWAYS AS (earlyLoginIncentive) VIRTUAL,
    late_login_penalty DECIMAL(15, 2) GENERATED ALWAYS AS (lateLoginPenalty) VIRTUAL,
    UNIQUE KEY uq_emp_attendance_date (employeeId, attendanceDate),
    INDEX idx_attendance_lookup (locationId, attendanceDate),
    INDEX idx_attendance_employee (employeeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS breaks (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    attendance_id VARCHAR(36) NOT NULL,
    type ENUM('LUNCH', 'TEA', 'OTHER') NOT NULL DEFAULT 'TEA',
    status ENUM('NOT_STARTED', 'ACTIVE', 'COMPLETED', 'EXCEEDED', 'MANUALLY_ADJUSTED') NOT NULL DEFAULT 'ACTIVE',
    start_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    end_time DATETIME(3) NULL,
    allocated_minutes INT NOT NULL,
    actual_duration_seconds INT NOT NULL DEFAULT 0,
    overrun_seconds INT NOT NULL DEFAULT 0,
    overrun_penalty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    qr_scan_id VARCHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_breaks_active (employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
