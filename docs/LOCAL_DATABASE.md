# BSC Textiles HRMS — Local SQLite Database Guide

## 1. Local Database Overview
The application uses **SQLite 3** as its primary persistent storage engine for offline single-computer deployment.

* **Primary Database File:** `%APPDATA%\BSCTextiles\data\bsc_textiles.db`
* **Journal Mode:** WAL (Write-Ahead Logging) — enabled for high-speed writes and concurrent reads.
* **Integrity Enforcement:** Foreign keys enabled (`PRAGMA foreign_keys = ON`).

---

## 2. Table Schema Directory
The database schema includes 20 comprehensive business tables:

| Table Name | Description | Key Columns |
|---|---|---|
| `location` | Showrooms (Belagavi, Davanagere, Shivamogga) | `id`, `code`, `name`, `status` |
| `floor` | Showroom floors | `id`, `name`, `floorNumber`, `locationId` |
| `department` | Retail & operations departments | `id`, `name`, `code`, `locationId`, `floorId` |
| `section` | Merchandise sections (Kids, Men's, Silks) | `id`, `name`, `code`, `floorId`, `departmentId` |
| `shift` | Work shift definitions | `id`, `name`, `startTime`, `endTime`, `gracePeriod` |
| `employee` | Employee master records | `id`, `employeeCode`, `fullName`, `basicSalary`, `fixedGrossSalary`, `pfNo`, `esiNo`, `uanNo`, `bankAccount` |
| `user` | Local system users & auth | `id`, `email`, `passwordHash`, `role`, `isActive` |
| `attendancerules` | Statutory policy (₹1.0/sec late fine) | `id`, `locationId`, `latePenaltyRatePerSecond`, `gracePeriodMinutes` |
| `attendance` | Daily attendance & biometric punches | `id`, `employeeId`, `attendanceDate`, `punchIn`, `punchOut`, `lateLoginPenalty` |
| `late_attendance_record` | Late fine calculation ledger | `id`, `employeeId`, `recordDate`, `chargeableLateSeconds`, `calculatedFine`, `approvalStatus` |
| `payrollrun` | Monthly payroll execution batches | `id`, `periodStart`, `periodEnd`, `status` |
| `payrollitem` | Individual employee payslips | `id`, `payrollRunId`, `employeeId`, `employeeCode`, `grossSalary`, `totalDeductions`, `netPay`, `earningsConfig`, `deductionsConfig` |
| `customer` | VIP and retail customer registry | `id`, `fullName`, `phone`, `email`, `city` |
| `wedding_registration` | Bridal and groom wedding CRM | `id`, `brideName`, `groomName`, `weddingDate`, `phone`, `budget`, `status` |
| `wedding_interaction` | Telecaller interaction logs | `id`, `weddingId`, `callOutcome`, `nextFollowUpDate` |
| `customer_feedback` | Showroom ratings and complaints | `id`, `customerName`, `rating`, `isNegative`, `showroomLocation` |
| `showroom_footfall` | Hourly walk-in footfall counts | `id`, `locationId`, `countDate`, `hourSlot`, `count` |
| `visual_merchandising` | Floor display audits and scores | `id`, `locationId`, `floorId`, `auditDate`, `score`, `status` |
| `auditlog` | Local audit trail | `id`, `userId`, `action`, `entity`, `ipAddress` |
| `session` | Local token session storage | `id`, `userId`, `token`, `expiresAt` |

---

## 3. Automatic Initialization & Seeding
On first launch on any Windows machine:
1. The app creates the persistent folder `%APPDATA%\BSCTextiles\data` if missing.
2. If `bsc_textiles.db` does not exist, it runs `database/sqlite/schema.sql` and `database/sqlite/seed.sql`.
3. Seeds all 3 showroom locations, departments, floors, shifts, and the statutory ₹1.0/sec late rule.
4. Pre-seeds Super Admin (`admin@bsctextiles.com`) and HR Manager (`kavita.bhat@bsctextiles.com`).
5. All future launches read and write directly to this file without resetting existing data.

---

## 4. One-Click Migration Utility
To migrate existing MySQL data into SQLite:
```powershell
npm run db:migrate-to-sqlite
```
This utility:
* Automatically connects to MySQL if running.
* Uses schema reflection (`PRAGMA table_info`) to map intersecting columns.
* Migrates locations, floors, departments, sections, employees, users, attendance punches, and historical payroll runs into `%APPDATA%\BSCTextiles\data\bsc_textiles.db`.
