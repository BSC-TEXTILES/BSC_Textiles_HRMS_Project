-- ==============================================================================
-- 003: USERS, EMPLOYEES & SHIFTS TABLES
-- Zero Prisma: Native MySQL 8.0 schema
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS shifts (
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

CREATE TABLE IF NOT EXISTS employees (
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
    CONSTRAINT fk_employees_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_employees_floor FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE SET NULL,
    CONSTRAINT fk_employees_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    CONSTRAINT fk_employees_sec FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL,
    CONSTRAINT fk_employees_sp FOREIGN KEY (selling_point_id) REFERENCES selling_points(id) ON DELETE SET NULL,
    CONSTRAINT fk_employees_shift FOREIGN KEY (shift_id) REFERENCES shifts(id) ON DELETE SET NULL,
    INDEX idx_employees_code (employee_code),
    INDEX idx_employees_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
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
    CONSTRAINT fk_users_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL,
    INDEX idx_users_email (email),
    INDEX idx_users_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
