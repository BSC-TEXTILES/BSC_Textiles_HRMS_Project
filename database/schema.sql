-- ==============================================================================
-- BSC TEXTILES HRMS — NATIVE MYSQL 8.0 DATABASE SCHEMA (ZERO PRISMA)
-- Company: BSC Textiles Pvt Ltd
-- Tagline: Weaving Dreams, Building Futures
-- Database Engine: MySQL 8.0 Enterprise Community Server (InnoDB)
-- Character Set: utf8mb4 / Collation: utf8mb4_unicode_ci
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. ORGANIZATIONAL TOPOLOGY
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS selling_points;
DROP TABLE IF EXISTS sections;
DROP TABLE IF EXISTS departments;
DROP TABLE IF EXISTS floors;
DROP TABLE IF EXISTS locations;

CREATE TABLE locations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(30) NOT NULL UNIQUE,
    city VARCHAR(80) NOT NULL,
    address TEXT NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(120) NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
    manager_name VARCHAR(120) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE floors (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    name VARCHAR(80) NOT NULL,
    floor_number INT NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    floor_manager_id VARCHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_floors_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    INDEX idx_floors_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE departments (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    floor_id VARCHAR(36) NULL,
    name VARCHAR(100) NOT NULL,
    department_code VARCHAR(30) NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    manager_id VARCHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_departments_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_departments_floor FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE SET NULL,
    UNIQUE KEY uq_dept_loc_code (location_id, department_code),
    INDEX idx_departments_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sections (
    id VARCHAR(36) PRIMARY KEY,
    department_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    section_code VARCHAR(30) NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_sections_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
    INDEX idx_sections_dept (department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE selling_points (
    id VARCHAR(36) PRIMARY KEY,
    section_id VARCHAR(36) NOT NULL,
    code VARCHAR(40) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_sp_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE RESTRICT,
    INDEX idx_sp_section (section_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. SHIFTS & SCHEDULES
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS shifts;

CREATE TABLE shifts (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    grace_period_minutes INT NOT NULL DEFAULT 5,
    early_login_rate_per_second DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
    late_penalty_rate_per_second DECIMAL(10, 4) NOT NULL DEFAULT 1.0000,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_shifts_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    INDEX idx_shifts_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. EMPLOYEES & USERS
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS employees;

CREATE TABLE employees (
    id VARCHAR(36) PRIMARY KEY,
    employee_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(120) NOT NULL,
    gender ENUM('MALE', 'FEMALE', 'OTHER') NOT NULL DEFAULT 'MALE',
    phone VARCHAR(30) NULL,
    email VARCHAR(191) NULL,
    location_id VARCHAR(36) NOT NULL,
    floor_id VARCHAR(36) NULL,
    department_id VARCHAR(36) NULL,
    section_id VARCHAR(36) NULL,
    selling_point_id VARCHAR(36) NULL,
    shift_id VARCHAR(36) NULL,
    base_salary DECIMAL(12, 2) NOT NULL DEFAULT 30000.00,
    face_enrollment_url VARCHAR(255) NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED') NOT NULL DEFAULT 'ACTIVE',
    date_of_joining DATE NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_emp_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_emp_floor FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_section FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_sp FOREIGN KEY (selling_point_id) REFERENCES selling_points(id) ON DELETE SET NULL,
    CONSTRAINT fk_emp_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
    INDEX idx_emp_code (employee_code),
    INDEX idx_emp_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE users (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(191) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(120) NOT NULL,
    role ENUM(
        'SUPER_ADMIN', 'ADMIN', 'HR_MANAGER', 'HR_EXECUTIVE',
        'PAYROLL_MANAGER', 'LOCATION_MANAGER', 'FLOOR_MANAGER',
        'DEPARTMENT_MANAGER', 'TEAM_LEAD', 'SALES_EMPLOYEE',
        'TEA_BREAK_MANAGER', 'T_SHOP_OWNER', 'HR_AUDITOR', 'EMPLOYEE'
    ) NOT NULL DEFAULT 'EMPLOYEE',
    permissions JSON NULL,
    location_id VARCHAR(36) NULL,
    employee_id VARCHAR(36) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_login_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_users_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE SET NULL,
    CONSTRAINT fk_users_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_users_email (email),
    INDEX idx_users_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. ATTENDANCE & BREAK TRACKING
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS breaks;
DROP TABLE IF EXISTS attendance;

CREATE TABLE attendance (
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
    UNIQUE KEY uq_emp_att_date (employeeId, attendanceDate),
    INDEX idx_att_lookup (locationId, attendanceDate),
    INDEX idx_att_emp (employeeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE breaks (
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
    CONSTRAINT fk_brk_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_brk_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
    INDEX idx_brk_active (employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. QR CODE TOKENS & BIOMETRIC VERIFICATION
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS qr_scan_records;
DROP TABLE IF EXISTS qr_codes;
DROP TABLE IF EXISTS face_verification_logs;

CREATE TABLE qr_codes (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    valid_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_qr_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_qr_lookup (token, valid_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE qr_scan_records (
    id VARCHAR(36) PRIMARY KEY,
    qr_code_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NOT NULL,
    scanner_user_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    scan_type ENUM('ATTENDANCE_IN', 'ATTENDANCE_OUT', 'BREAK_START', 'BREAK_END') NOT NULL,
    scanned_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    is_valid BOOLEAN NOT NULL DEFAULT TRUE,
    rejection_reason VARCHAR(100) NULL,
    CONSTRAINT fk_scan_qr FOREIGN KEY (qr_code_id) REFERENCES qr_codes(id) ON DELETE CASCADE,
    CONSTRAINT fk_scan_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_scan_history (employee_id, scanned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE face_verification_logs (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    match_confidence DECIMAL(5, 2) NOT NULL,
    threshold_used DECIMAL(5, 2) NOT NULL DEFAULT 85.00,
    status ENUM('VERIFIED', 'FAILED') NOT NULL,
    captured_image_url VARCHAR(255) NULL,
    verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_face_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_face_logs (employee_id, verified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. INCENTIVES, PENALTIES & PAYROLL
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS incentive_grants;
DROP TABLE IF EXISTS incentive_rules;
DROP TABLE IF EXISTS penalty_records;
DROP TABLE IF EXISTS penalty_policies;
DROP TABLE IF EXISTS payroll_items;
DROP TABLE IF EXISTS payroll_runs;

CREATE TABLE incentive_rules (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    type ENUM('EARLY_LOGIN', 'OVERTIME', 'PERFECT_ATTENDANCE', 'SALES_MILESTONE', 'CUSTOM') NOT NULL,
    rate_type ENUM('PER_SECOND', 'PER_MINUTE', 'FIXED', 'PERCENTAGE') NOT NULL,
    rate_value DECIMAL(10, 4) NOT NULL,
    min_threshold INT NOT NULL DEFAULT 0,
    max_cap DECIMAL(12, 2) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_inc_rule_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE incentive_grants (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    rule_id VARCHAR(36) NOT NULL,
    attendance_id VARCHAR(36) NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'APPROVED',
    calculation_details JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_inc_grant_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_inc_grant_rule FOREIGN KEY (rule_id) REFERENCES incentive_rules(id) ON DELETE RESTRICT,
    INDEX idx_inc_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE penalty_policies (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    violation_type ENUM('LATE_LOGIN', 'EARLY_LOGOUT', 'BREAK_OVERRUN', 'UNAUTHORIZED_ABSENCE') NOT NULL,
    rate_type ENUM('PER_SECOND', 'PER_MINUTE', 'FIXED', 'PERCENTAGE') NOT NULL,
    rate_value DECIMAL(10, 4) NOT NULL,
    grace_window_seconds INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_pen_pol_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE penalty_records (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    policy_id VARCHAR(36) NOT NULL,
    attendance_id VARCHAR(36) NULL,
    amount DECIMAL(12, 2) NOT NULL,
    reason TEXT NULL,
    status ENUM('APPLIED', 'WAIVED', 'APPEALED') NOT NULL DEFAULT 'APPLIED',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_pen_rec_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_pen_rec_pol FOREIGN KEY (policy_id) REFERENCES penalty_policies(id) ON DELETE RESTRICT,
    INDEX idx_pen_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_runs (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status ENUM('DRAFT', 'APPROVED', 'PUBLISHED') NOT NULL DEFAULT 'DRAFT',
    processed_by VARCHAR(120) NOT NULL,
    processed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_payroll_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    INDEX idx_payroll_period (location_id, period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payroll_items (
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
    CONSTRAINT fk_pay_items_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    CONSTRAINT fk_pay_items_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    INDEX idx_payroll_item_emp (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. ROSTER, HOLIDAYS & LEAVES
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS leave_requests;
DROP TABLE IF EXISTS weekly_offs;
DROP TABLE IF EXISTS holidays;

CREATE TABLE weekly_offs (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    employee_id VARCHAR(36) NULL,
    day_of_week ENUM('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY') NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_wo_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE holidays (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    name VARCHAR(120) NOT NULL,
    holiday_date DATE NOT NULL,
    is_optional BOOLEAN NOT NULL DEFAULT FALSE,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_hol_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE leave_requests (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    leave_type ENUM('CASUAL', 'SICK', 'EARNED', 'UNPAID') NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NULL,
    status ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    approved_by VARCHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_leave_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_leave_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 8. OBSERVATIONS, STREAMS & NOTIFICATIONS
-- ------------------------------------------------------------------------------

DROP TABLE IF EXISTS stream_observations;
DROP TABLE IF EXISTS stream_messages;
DROP TABLE IF EXISTS live_streams;
DROP TABLE IF EXISTS observations;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS audit_logs;

CREATE TABLE observations (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    created_by_id VARCHAR(36) NOT NULL,
    type VARCHAR(80) NOT NULL DEFAULT 'GENERAL',
    level ENUM('EXCELLENT', 'VERY_GOOD', 'GOOD', 'NEEDS_IMPROVEMENT', 'CRITICAL') NOT NULL DEFAULT 'GOOD',
    description TEXT NOT NULL,
    rating INT NOT NULL DEFAULT 3,
    status ENUM('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED') NOT NULL DEFAULT 'OPEN',
    media_url VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_obs_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_obs_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_obs_user FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE live_streams (
    id VARCHAR(36) PRIMARY KEY,
    location_id VARCHAR(36) NOT NULL,
    host_id VARCHAR(36) NOT NULL,
    title VARCHAR(150) NOT NULL,
    description TEXT NULL,
    stream_url VARCHAR(255) NULL,
    status ENUM('SCHEDULED', 'LIVE', 'PAUSED', 'ENDED') NOT NULL DEFAULT 'SCHEDULED',
    started_at DATETIME(3) NULL,
    ended_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_stream_loc FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_stream_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stream_messages (
    id VARCHAR(36) PRIMARY KEY,
    stream_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    message TEXT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_msg_stream FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
    CONSTRAINT fk_msg_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE stream_observations (
    id VARCHAR(36) PRIMARY KEY,
    stream_id VARCHAR(36) NOT NULL,
    observation_id VARCHAR(36) NOT NULL,
    timestamp_seconds INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_so_stream FOREIGN KEY (stream_id) REFERENCES live_streams(id) ON DELETE CASCADE,
    CONSTRAINT fk_so_obs FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE notifications (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NULL,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('INFO', 'SUCCESS', 'WARNING', 'DANGER', 'CRITICAL') NOT NULL DEFAULT 'INFO',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    link VARCHAR(255) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE audit_logs (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NULL,
    action ENUM('CREATE', 'READ', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'SCAN', 'VERIFY', 'APPROVE') NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id VARCHAR(36) NOT NULL,
    old_value JSON NULL,
    new_value JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_action (action),
    INDEX idx_audit_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
