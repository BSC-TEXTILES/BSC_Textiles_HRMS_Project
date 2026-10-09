# MASTER PROMPT: PURE MYSQL 8.0 ARCHITECTURE (ZERO PRISMA)
## BSC Textiles HRMS — Next Generation Workforce Management System

> **Instruction to AI / Developer:**  
> Use this master prompt to replace Prisma ORM completely with a **pure native MySQL 8.0 architecture** across the entire `BSC Textiles HRMS` project.  
> **Strict Rule: DO NOT use Prisma, Prisma Client, Prisma CLI, or any ORM abstraction.** All database operations must use native SQL scripts, parameterized queries, and the high-performance `mysql2/promise` connection pool driver.

---

# 1. CORE MISSION & OBJECTIVE

Transform the database and persistence layer of **BSC Textiles HRMS** into a high-performance, enterprise-grade, native MySQL 8.0 architecture:
1. **Remove Prisma completely:** Uninstall `@prisma/client`, `prisma`, and remove runtime dependencies on Prisma generated clients.
2. **Native Driver:** Use `mysql2` with the `mysql2/promise` interface for all database interactions.
3. **Pure DDL Schema:** Create full, production-ready `.sql` schema definitions with exact constraints, composite indexes, and strict referential integrity.
4. **Native Migration System:** Implement a lightweight, transactional SQL migration runner executing sequentially versioned `.sql` files (`001_initial_schema.sql`, `002_views_and_procedures.sql`, etc.).
5. **Native Seeding:** Provide pure SQL seed scripts (`seed.sql`) populating the database with all 3 locations (`BEL`, `DAV`, `SHI`), all organizational tiers, shifts, test accounts (with pre-hashed bcrypt passwords), and baseline attendance.
6. **Data Access Layer (Repository Pattern):** Build type-safe repositories using parameterized SQL queries (`?` placeholders) preventing SQL injection.
7. **Maintain API Contracts:** Ensure all 26 backend route files and 43 automated integration tests continue to operate with 100% pass rate.

---

# 2. TARGET DIRECTORY STRUCTURE (`database/`)

Replace the `database/prisma/` folder with the following native MySQL project layout:

```text
database/
├── migrations/
│   ├── 001_create_enums_and_extensions.sql
│   ├── 002_create_organization_tables.sql
│   ├── 003_create_user_and_employee_tables.sql
│   ├── 004_create_attendance_and_break_tables.sql
│   ├── 005_create_qr_and_face_tables.sql
│   ├── 006_create_incentive_and_payroll_tables.sql
│   ├── 007_create_operations_and_stream_tables.sql
│   ├── 008_create_audit_and_notification_tables.sql
│   └── 009_create_stored_procedures_and_indexes.sql
├── seeds/
│   ├── 01_locations_and_organization.sql
│   ├── 02_shifts_and_break_policies.sql
│   ├── 03_users_and_test_personas.sql
│   └── 04_sample_attendance_and_roster.sql
├── scripts/
│   ├── migrate.ts                # Native migration runner
│   ├── seed.ts                   # Native SQL seed executor
│   ├── backup.sh                 # Native mysqldump wrapper
│   └── restore.sh                # Native mysql client restore
├── src/
│   ├── pool.ts                   # mysql2/promise Connection Pool
│   ├── transaction.ts            # Atomic Transaction Manager
│   └── repositories/             # Type-safe Repository Classes
│       ├── UserRepository.ts
│       ├── EmployeeRepository.ts
│       ├── AttendanceRepository.ts
│       ├── BreakRepository.ts
│       ├── QRCodeRepository.ts
│       ├── FaceRepository.ts
│       ├── IncentiveRepository.ts
│       ├── PayrollRepository.ts
│       └── AuditRepository.ts
├── package.json
└── README.md
```

---

# 3. COMPLETE DDL SCHEMA SPECIFICATIONS (38 TABLES)

### 3.1 Naming & Type Standards
- Table names: `snake_case` plural (e.g., `users`, `employees`, `attendance_records`, `payroll_runs`).
- Primary keys: `id VARCHAR(36) PRIMARY KEY` (UUIDv4 or CUID).
- Timestamps: `DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)` for microsecond temporal accuracy.
- Money / Incentives: `DECIMAL(12, 2) NOT NULL DEFAULT 0.00`.
- Character Set: `utf8mb4` with Collation `utf8mb4_unicode_ci`.
- Engine: `InnoDB` with `ROW_FORMAT=DYNAMIC`.

### 3.2 Organizational Master Tables
```sql
CREATE TABLE locations (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    code VARCHAR(30) NOT NULL UNIQUE,
    city VARCHAR(80) NOT NULL,
    address TEXT NULL,
    phone VARCHAR(30) NULL,
    email VARCHAR(120) NULL,
    status ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED') NOT NULL DEFAULT 'ACTIVE',
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
```

### 3.3 Users & Employee Master Tables
```sql
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
    INDEX idx_users_email (email),
    INDEX idx_users_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
    CONSTRAINT fk_employees_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    CONSTRAINT fk_employees_floor FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE SET NULL,
    CONSTRAINT fk_employees_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL,
    INDEX idx_employees_code (employee_code),
    INDEX idx_employees_location (location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.4 Attendance & Sub-Second Punctuality
```sql
CREATE TABLE attendance (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    location_id VARCHAR(36) NOT NULL,
    shift_id VARCHAR(36) NULL,
    attendance_date DATE NOT NULL,
    punch_in DATETIME(3) NULL,
    punch_out DATETIME(3) NULL,
    status ENUM(
        'PRESENT', 'ABSENT', 'LATE', 'EARLY', 'ON_LUNCH',
        'ON_TEA_BREAK', 'ON_OTHER_BREAK', 'WEEKLY_OFF',
        'OVERTIME', 'LEFT_STORE', 'FACE_VERIFIED', 'FACE_VERIFICATION_FAILED'
    ) NOT NULL DEFAULT 'PRESENT',
    early_login_incentive DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    late_login_penalty DECIMAL(12, 2) NOT NULL DEFAULT 0.00,
    overtime_seconds INT NOT NULL DEFAULT 0,
    early_seconds INT NOT NULL DEFAULT 0,
    late_seconds INT NOT NULL DEFAULT 0,
    is_face_verified BOOLEAN NOT NULL DEFAULT FALSE,
    calculation_breakdown JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_att_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_att_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    UNIQUE KEY uq_emp_attendance_date (employee_id, attendance_date),
    INDEX idx_attendance_lookup (location_id, attendance_date),
    INDEX idx_attendance_employee (employee_id)
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
    CONSTRAINT fk_breaks_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    CONSTRAINT fk_breaks_attendance FOREIGN KEY (attendance_id) REFERENCES attendance(id) ON DELETE CASCADE,
    INDEX idx_breaks_active (employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.5 QR Identity & Face Verification
```sql
CREATE TABLE qr_codes (
    id VARCHAR(36) PRIMARY KEY,
    employee_id VARCHAR(36) NOT NULL,
    token VARCHAR(64) NOT NULL UNIQUE,
    valid_date DATE NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    expires_at DATETIME(3) NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT fk_qr_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    INDEX idx_qr_token_date (token, valid_date)
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
```

### 3.6 Compensation, Payroll & Audit Ledger
```sql
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
    CONSTRAINT fk_payroll_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
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
    CONSTRAINT fk_items_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs(id) ON DELETE CASCADE,
    CONSTRAINT fk_items_emp FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    INDEX idx_payroll_item_emp (employee_id)
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
    INDEX idx_audit_created (created_at),
    INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

# 4. NATIVE MYSQL2 CONNECTION POOL (`database/src/pool.ts`)

```typescript
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL || 'mysql://root@localhost:3306/bsc_textiles_hrms',
  waitForConnections: true,
  connectionLimit: 25,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  decimalNumbers: true,
  dateStrings: false,
  timezone: '+05:30', // Authoritative Asia/Kolkata timezone
});

export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

export async function queryOne<T = any>(sql: string, params: any[] = []): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}
```

---

# 5. ATOMIC TRANSACTION WRAPPER (`database/src/transaction.ts`)

```typescript
import { pool } from './pool.js';
import type { PoolConnection } from 'mysql2/promise';

export async function withTransaction<T>(
  callback: (conn: PoolConnection) => Promise<T>
): Promise<T> {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
```

---

# 6. REPOSITORY IMPLEMENTATION EXAMPLE (`UserRepository.ts`)

```typescript
import { query, queryOne } from '../pool.js';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: string;
  permissions: string[] | null;
  location_id: string | null;
  employee_id: string | null;
  is_active: boolean;
  last_login_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export class UserRepository {
  static async findByEmail(email: string): Promise<UserRow | null> {
    const row = await queryOne<any>(
      `SELECT id, email, password_hash, full_name, role, permissions, 
              location_id, employee_id, is_active, last_login_at, created_at, updated_at
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    if (!row) return null;
    return {
      ...row,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
    };
  }

  static async findById(id: string): Promise<UserRow | null> {
    const row = await queryOne<any>(
      `SELECT id, email, full_name, role, permissions, location_id, employee_id, is_active
       FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!row) return null;
    return {
      ...row,
      permissions: typeof row.permissions === 'string' ? JSON.parse(row.permissions) : row.permissions,
    };
  }

  static async updateLastLogin(id: string): Promise<void> {
    await query(`UPDATE users SET last_login_at = NOW(3) WHERE id = ?`, [id]);
  }
}
```

---

# 7. BUSINESS LOGIC STORED PROCEDURES (OPTIONAL PERFORMANCE UPGRADE)

```sql
DELIMITER $$

CREATE PROCEDURE sp_calculate_early_incentive(
    IN p_employee_id VARCHAR(36),
    IN p_punch_in DATETIME(3),
    IN p_scheduled_start TIME,
    OUT p_early_seconds INT,
    OUT p_incentive_amount DECIMAL(12,2)
)
BEGIN
    DECLARE scheduled_dt DATETIME(3);
    SET scheduled_dt = TIMESTAMP(DATE(p_punch_in), p_scheduled_start);

    IF p_punch_in < scheduled_dt THEN
        SET p_early_seconds = TIMESTAMPDIFF(SECOND, p_punch_in, scheduled_dt);
        SET p_incentive_amount = p_early_seconds * 1.00;
    ELSE
        SET p_early_seconds = 0;
        SET p_incentive_amount = 0.00;
    END IF;
END$$

DELIMITER ;
```

---

# 8. MIGRATION RUNNER SCRIPT (`database/scripts/migrate.ts`)

```typescript
import fs from 'node:fs';
import path from 'node:path';
import { pool } from '../src/pool.js';

async function migrate() {
  console.log('🚀 Running Pure MySQL Migrations...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `);

  const migrationsDir = path.resolve(process.cwd(), 'migrations');
  const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const [rows]: any = await pool.query('SELECT id FROM _migrations WHERE name = ?', [file]);
    if (rows.length === 0) {
      console.log(`  Applying: ${file}...`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf-8');
      const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
      for (const stmt of statements) {
        await pool.query(stmt);
      }
      await pool.query('INSERT INTO _migrations (name) VALUES (?)', [file]);
      console.log(`  ✔ Applied ${file}`);
    }
  }
  console.log('🎉 All migrations applied successfully!');
  await pool.end();
}

migrate().catch(console.error);
```

---

# 9. VALIDATION & TESTING CHECKLIST

When using this prompt to execute the pure MySQL migration:
- [ ] Database created with `utf8mb4` and `utf8mb4_unicode_ci`.
- [ ] All 38 tables migrated with primary keys, indexes, and foreign keys.
- [ ] Synthetic test personas populated in `users` (`password123` hashed via bcrypt).
- [ ] `mysql2/promise` connection pool configured with 25 connections.
- [ ] Location-based security strictly queries `WHERE location_id = ?` on MySQL.
- [ ] Zero Prisma packages left in `package.json` (`npm uninstall @prisma/client prisma`).
- [ ] `npm test` runs with **100% pass rate (43 / 43 tests passing)**.
