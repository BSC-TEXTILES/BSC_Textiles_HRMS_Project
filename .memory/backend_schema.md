# BSC Textiles HRMS — Master Database & Backend Schema Specification

```text
BSC Textiles Pvt Ltd
Weaving Dreams, Building Futures
Document: Master Backend & Database Schema Architecture (backend_schema.md)
Version: 1.0.0 (Production Architecture)
Database: MySQL 8.0 Enterprise Community Server
ORM: Prisma Client 5.7
```

---

## 1. Executive Schema Overview

The **BSC Textiles HRMS** data layer is structured around an enterprise-grade 3NF normalized relational schema implemented on **MySQL 8.0** and managed via **Prisma ORM**.

### Architectural Tenets
1. **Multi-Location Data Isolation:** Store branches (`Belagavi`, `Davanagere`, `Shivamogga`, `Hubballi`) are strictly partitioned using foreign key relational scoping anchored on `locationId`.
2. **Sub-Second Temporal Precision:** Authoritative timestamps (`punchIn`, `punchOut`, `startTime`, `endTime`, `processedAt`) use server-managed MySQL `DATETIME(3)` with microsecond precision.
3. **Audit Non-Repudiation:** Core operational tables implement immutable transaction logging (`AuditLog`, `QRScanRecord`, `FaceVerificationLog`).
4. **Referential Integrity:** Enforces relational foreign keys, composite indexes, and strict cascade rules (`Cascade` on child items, `Restrict` on core organizational masters).

---

## 2. Master Entity-Relationship Diagram (ERD)

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#00758F', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
erDiagram
    LOCATION ||--o{ FLOOR : "has"
    FLOOR ||--o{ DEPARTMENT : "houses"
    DEPARTMENT ||--o{ SECTION : "divides"
    SECTION ||--o{ SELLING_POINT : "designates"

    LOCATION ||--o{ USER : "scopes"
    LOCATION ||--o{ EMPLOYEE : "employs"
    LOCATION ||--o{ ATTENDANCE : "records"
    LOCATION ||--o{ LIVE_STREAM : "broadcasts"

    EMPLOYEE ||--o| USER : "profiles"
    EMPLOYEE ||--o{ ATTENDANCE : "punches"
    EMPLOYEE ||--o{ BREAK : "takes"
    EMPLOYEE ||--o{ QR_CODE : "owns"
    EMPLOYEE ||--o{ QR_SCAN_RECORD : "scans"
    EMPLOYEE ||--o{ FACE_LOG : "verifies"
    EMPLOYEE ||--o{ INCENTIVE_GRANT : "earns"
    EMPLOYEE ||--o{ PENALTY_RECORD : "incurs"
    EMPLOYEE ||--o{ OBSERVATION : "receives"
    EMPLOYEE ||--o{ LEAVE_REQUEST : "requests"
    EMPLOYEE ||--o{ PAYROLL_ITEM : "paid_via"

    ATTENDANCE ||--o{ BREAK : "tracks"
    ATTENDANCE ||--o{ QR_SCAN_RECORD : "validates"

    PAYROLL_RUN ||--o{ PAYROLL_ITEM : "batches"

    INCENTIVE_RULE ||--o{ INCENTIVE_GRANT : "defines"
    SHIFT ||--o{ ATTENDANCE : "schedules"
    WEEKLY_OFF ||--o{ ATTENDANCE : "exempts"

    USER ||--o{ AUDIT_LOG : "executes"
    USER ||--o{ OBSERVATION : "creates"
    USER ||--o{ LIVE_STREAM : "hosts"
    LIVE_STREAM ||--o{ STREAM_MESSAGE : "contains"
    LIVE_STREAM ||--o{ STREAM_OBSERVATION : "pins"
```

---

## 3. Domain ERDs & Functional Sub-Schemas

### 3.1 Organizational Topology Sub-Schema

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1F6FEB', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
erDiagram
    LOCATION {
        string id PK "cuid()"
        string name "Store / Regional Hub"
        string code UK "BEL, DAV, SHI, HUB-TEST"
        string city "City Name"
        enum status "ACTIVE, INACTIVE, ARCHIVED"
        datetime createdAt
    }

    FLOOR {
        string id PK "cuid()"
        string locationId FK
        string name "e.g. Ground Floor, First Floor"
        int floorNumber "0, 1, 2"
        string floorManagerId FK
    }

    DEPARTMENT {
        string id PK "cuid()"
        string locationId FK
        string floorId FK
        string name "e.g. Menswear, Sarees"
        string departmentCode UK
    }

    SECTION {
        string id PK "cuid()"
        string departmentId FK
        string name "e.g. Silk Sarees, Cotton Suits"
        string sectionCode UK
    }

    SELLING_POINT {
        string id PK "cuid()"
        string sectionId FK
        string code UK "Counter POS ID"
        string name "Sales Register Name"
        enum status "ACTIVE, INACTIVE"
    }

    LOCATION ||--o{ FLOOR : "contains"
    FLOOR ||--o{ DEPARTMENT : "houses"
    DEPARTMENT ||--o{ SECTION : "divides"
    SECTION ||--o{ SELLING_POINT : "features"
```

### 3.2 Identity, Authentication & Role Access Sub-Schema

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#263238', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
erDiagram
    USER {
        string id PK "cuid()"
        string email UK "Login email"
        string passwordHash "Bcrypt salt 12 rounds"
        string fullName "Legal staff name"
        enum role "SUPER_ADMIN, HR_MANAGER, etc."
        json permissions "Array of permission codes"
        string locationId FK "Assigned store branch"
        string employeeId FK "Linked personnel record"
        boolean isActive "Account enabled/disabled"
        datetime lastLoginAt
    }

    EMPLOYEE {
        string id PK "cuid()"
        string employeeCode UK "e.g. EMP-BEL-001"
        string fullName "Staff Full Name"
        string gender "MALE / FEMALE / OTHER"
        string phone "Contact number"
        string locationId FK
        string floorId FK
        string departmentId FK
        string sectionId FK
        string sellingPointId FK
        string shiftId FK
        decimal baseSalary "Configured base pay"
        string faceEnrollmentUrl "Enrolled baseline biometric photo"
        enum status "ACTIVE, INACTIVE, ON_LEAVE"
    }

    USER ||--o| EMPLOYEE : "associates"
```

### 3.3 Time, Attendance & Break Sub-Schema

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#2E9D59', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
erDiagram
    SHIFT {
        string id PK "cuid()"
        string name "e.g. Morning Retail Window"
        string startTime "10:30:00"
        string endTime "20:30:00"
        int gracePeriodMinutes "Default: 5"
        decimal earlyLoginRatePerSecond "Default: 1.00"
        decimal latePenaltyRatePerSecond "Default: 1.00"
    }

    ATTENDANCE {
        string id PK "cuid()"
        string employeeId FK
        string locationId FK
        string shiftId FK
        date attendanceDate "YYYY-MM-DD"
        datetime punchIn "Authoritative Check-In"
        datetime punchOut "Authoritative Check-Out"
        enum status "PRESENT, LATE, EARLY, ON_LUNCH, etc."
        decimal earlyLoginIncentive "Earned ₹ incentive"
        decimal lateLoginPenalty "Deducted ₹ penalty"
        int overtimeSeconds "Accumulated overtime"
        boolean isFaceVerified "Biometric confirmation"
    }

    BREAK {
        string id PK "cuid()"
        string employeeId FK
        string attendanceId FK
        enum type "LUNCH, TEA, OTHER"
        enum status "ACTIVE, COMPLETED, EXCEEDED"
        datetime startTime "Break initiation"
        datetime endTime "Break conclusion"
        int allocatedMinutes "100m, 40m, 20m, 15m"
        int actualDurationSeconds "Elapsed seconds"
        int overrunSeconds "Excess seconds beyond policy"
        decimal overrunPenalty "Penalty accrual"
    }

    SHIFT ||--o{ ATTENDANCE : "governs"
    ATTENDANCE ||--o{ BREAK : "contains"
```

### 3.4 QR & Biometric Verification Sub-Schema

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#009688', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
erDiagram
    QR_CODE {
        string id PK "cuid()"
        string employeeId FK
        string token UK ">= 24-char crypto token"
        date validDate "Single-day validity"
        boolean isActive "Revocation flag"
        datetime expiresAt "Midnight invalidation"
    }

    QR_SCAN_RECORD {
        string id PK "cuid()"
        string qrCodeId FK
        string employeeId FK
        string scannerUserId FK
        string locationId FK
        enum scanType "ATTENDANCE_IN, BREAK_START, BREAK_END"
        datetime scannedAt "Timestamp"
        boolean isValid "Scan verification outcome"
        string rejectionReason "Audit reason if rejected"
    }

    FACE_VERIFICATION_LOG {
        string id PK "cuid()"
        string employeeId FK
        string locationId FK
        decimal matchConfidence "0.00% to 100.00%"
        decimal thresholdUsed "85.00%"
        enum status "VERIFIED, FAILED"
        string capturedImageUrl "Audit photo snapshot"
        datetime verifiedAt
    }

    QR_CODE ||--o{ QR_SCAN_RECORD : "records"
```

### 3.5 Payroll & Compensation Sub-Schema

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#F2994A', 'primaryTextColor': '#FFFFFF', 'primaryBorderColor': '#173A5E', 'lineColor': '#6B7280' }}}%%
erDiagram
    PAYROLL_RUN {
        string id PK "cuid()"
        string locationId FK
        date periodStart "First of month"
        date periodEnd "End of month"
        enum status "DRAFT, APPROVED, PUBLISHED"
        string processedBy "User name"
        datetime processedAt
    }

    PAYROLL_ITEM {
        string id PK "cuid()"
        string payrollRunId FK
        string employeeId FK
        decimal basicSalary "Base salary"
        decimal allowances "House & travel allowances"
        decimal earlyIncentive "Aggregated early incentives"
        decimal salesIncentive "Target milestone bonuses"
        decimal attendanceIncentive "Streak bonus"
        decimal overtimePay "Overtime earnings"
        decimal latePenalties "Punctuality deductions"
        decimal breakPenalties "Break overrun deductions"
        decimal statutoryDeductions "PF / ESI"
        decimal grossEarnings "Gross pay"
        decimal totalDeductions "Total deductions"
        decimal netPay "Final net salary"
    }

    PAYROLL_RUN ||--o{ PAYROLL_ITEM : "itemizes"
```

---

## 4. Master Enums Reference

| Enum Name | Defined Values | Application Semantics |
|---|---|---|
| `UserRole` | `SUPER_ADMIN`, `ADMIN`, `HR_MANAGER`, `HR_EXECUTIVE`, `PAYROLL_MANAGER`, `LOCATION_MANAGER`, `FLOOR_MANAGER`, `DEPARTMENT_MANAGER`, `TEAM_LEAD`, `SALES_EMPLOYEE`, `TEA_BREAK_MANAGER`, `T_SHOP_OWNER`, `HR_AUDITOR`, `EMPLOYEE` | System role catalog establishing base permissions and navigation authority. |
| `Permission`| `VIEW`, `ADD`, `EDIT`, `DELETE`, `APPROVE`, `REJECT`, `ASSIGN`, `EXPORT`, `IMPORT`, `CONFIGURE`, `MANAGE`, `RECORD`, `UPLOAD`, `PUBLISH`, `SCAN`, `VIEW_SENSITIVE_DATA` | Granular permission flags checked dynamically per endpoint. |
| `AttendanceStatus`| `PRESENT`, `ABSENT`, `LATE`, `EARLY`, `ON_LUNCH`, `ON_TEA_BREAK`, `ON_OTHER_BREAK`, `WEEKLY_OFF`, `OVERTIME`, `LEFT_STORE`, `FACE_VERIFIED`, `FACE_VERIFICATION_FAILED` | Real-time presence state machine indicators. |
| `BreakType` | `LUNCH`, `TEA`, `OTHER` | Policy classification governing gendered duration limits. |
| `BreakStatus`| `NOT_STARTED`, `ACTIVE`, `COMPLETED`, `EXCEEDED`, `MANUALLY_ADJUSTED` | Break state machine tracking counter duration and overruns. |
| `LocationStatus`| `ACTIVE`, `INACTIVE`, `ARCHIVED` | Store operational status. |
| `FloorStatus`| `ACTIVE`, `INACTIVE` | Showroom floor operational availability. |
| `EmployeeStatus`| `ACTIVE`, `INACTIVE`, `ON_LEAVE`, `TERMINATED` | Staff HR status governing roster and login permissions. |

---

## 5. Performance Indexes & Data Integrity Rules

### Composite Performance Indexes
1. `Attendance_employeeId_attendanceDate_idx`: Accelerates single-employee daily punch lookups.
2. `Attendance_locationId_attendanceDate_idx`: Optimizes branch-wide daily muster roll rendering.
3. `QRCode_token_validDate_idx`: Guarantees sub-millisecond barcode validation on scanner terminals.
4. `Break_employeeId_status_idx`: Delivers instant lookups for active floor break monitoring.
5. `AuditLog_userId_createdAt_idx`: Powers fast compliance and non-repudiation audit filtering.

### Cascade & Deletion Behaviors
- **`ON DELETE CASCADE`:** Applied to ephemeral records (`PayrollItem` under `PayrollRun`, `Break` under `Attendance`).
- **`ON DELETE RESTRICT`:** Applied to organizational master nodes (`Location`, `Floor`, `Department`, `Employee`). Prevents catastrophic accidental data loss when deleting parent entities with historical muster records.
