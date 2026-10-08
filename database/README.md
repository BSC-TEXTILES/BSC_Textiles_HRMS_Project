# BSC Textiles HRMS — Pure Native MySQL 8.0 Architecture (Zero Prisma)

Welcome to the **Native MySQL 8.0 Persistence Engine** for **BSC Textiles HRMS**.

This package provides a zero-ORM, high-performance database tier built with native SQL, parameterized queries, and the `mysql2/promise` connection pool.

---

## 1. Architecture Highlights

- **Zero ORM Overhead:** Zero Prisma, TypeORM, or Sequelize runtime layers. All queries use direct parameterized SQL with `mysql2/promise`.
- **InnoDB Engine:** Full transactional ACID guarantees, foreign key cascade/restrict integrity, and `ROW_FORMAT=DYNAMIC`.
- **Sub-Second Precision:** All temporal fields (`punch_in`, `punch_out`, `start_time`, `end_time`) store timestamps as `DATETIME(3)` for accurate millisecond and sub-second attendance tracking.
- **Enterprise Connection Pool:** Configured for 25 concurrent connections with keep-alive, auto-reconnect, and native `Asia/Kolkata` (+05:30) timezone alignment.
- **Sequential Migration System:** Lightweight migration runner that tracks executed versions via `_migrations`.
- **Repository Pattern:** Clean, decoupled data access repositories for users, employees, attendance, breaks, QR codes, face recognition, incentives, and audit logs.

---

## 2. Directory Layout

```text
database/
├── migrations/                           # Versioned sequential SQL migrations
│   ├── 001_create_enums_and_extensions.sql
│   ├── 002_create_organization_tables.sql
│   ├── 003_create_user_and_employee_tables.sql
│   ├── 004_create_attendance_and_break_tables.sql
│   ├── 005_create_qr_and_face_tables.sql
│   ├── 006_create_incentive_and_payroll_tables.sql
│   ├── 007_create_operations_and_stream_tables.sql
│   ├── 008_create_audit_and_notification_tables.sql
│   └── 009_create_stored_procedures_and_indexes.sql
├── seeds/                                # Versioned seed datasets
│   ├── 01_locations_and_organization.sql
│   ├── 02_shifts_and_break_policies.sql
│   ├── 03_users_and_test_personas.sql
│   └── 04_sample_attendance_and_roster.sql
├── scripts/
│   ├── migrate.ts                        # Sequential migration runner
│   ├── seed.ts                           # Sequential seed executor
│   ├── backup.sh                         # Native mysqldump wrapper
│   └── restore.sh                        # Native mysql restore wrapper
├── src/
│   ├── pool.ts                           # mysql2/promise connection pool
│   ├── transaction.ts                    # Transaction manager (withTransaction)
│   └── repositories/                     # Type-safe repository layer
│       ├── UserRepository.ts
│       ├── EmployeeRepository.ts
│       ├── AttendanceRepository.ts
│       ├── BreakRepository.ts
│       ├── QRCodeRepository.ts
│       ├── FaceRepository.ts
│       ├── IncentiveRepository.ts
│       ├── PayrollRepository.ts
│       └── AuditRepository.ts
├── schema.sql                            # Consolidated full DDL schema
├── seed.sql                              # Consolidated baseline seed data
├── package.json
└── README.md
```

---

## 3. Quick Setup & Execution

### Prerequisites
- MySQL 8.0 running on `localhost:3306`
- Database created: `CREATE DATABASE bsc_textiles_hrms CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`

### Setup Commands
```bash
# From workspace root:
npm run db:setup

# Or inside database/ folder:
npm run db:migrate       # Apply all 9 sequential migrations
npm run db:seed          # Populate all 4 seed datasets
npm run db:schema        # Apply full consolidated schema.sql
```

---

## 4. Default Seed Personas

All seeded personas use the password: `password123`

| Persona | Email | Role | Location |
|---|---|---|---|
| Super Admin | `admin@bsctextiles.com` | SUPER_ADMIN | Belagavi |
| Belagavi HR | `kavita.bhat@bsctextiles.com` | HR_MANAGER | Belagavi |
| Shivamogga HR | `vikram.singh@bsctextiles.com` | HR_MANAGER | Shivamogga |
| Floor Manager | `amit.patel@bsctextiles.com` | FLOOR_MANAGER | Belagavi |
| T-Shop Scanner | `ramesh.gowda@bsctextiles.com` | T_SHOP_OWNER | Belagavi |
| Sales Specialist | `rajesh.kumar@bsctextiles.com` | SALES_EMPLOYEE | Belagavi |
| Sales Staff | `priya.d@bsctextiles.com` | EMPLOYEE | Belagavi |

---

## 5. Repository Usage Example

```typescript
import { UserRepository } from './repositories/UserRepository.js';
import { withTransaction } from './transaction.js';

// Query user by email
const user = await UserRepository.findByEmail('admin@bsctextiles.com');

// Atomic transaction
await withTransaction(async (conn) => {
  await conn.query('UPDATE users SET is_active = ? WHERE id = ?', [true, user.id]);
});
```
