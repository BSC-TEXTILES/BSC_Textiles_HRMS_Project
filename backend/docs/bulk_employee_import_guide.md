# BSC Textiles HRMS — Workforce Directory Bulk Employee Import & Employee ID Management Guide

## 1. Overview & Architecture

The **Bulk Employee Import & Employee ID Management** subsystem upgrades the Workforce Directory (`/employees`) into an enterprise-grade staff ingestion and synchronization platform. It connects the Next.js React frontend to the Node.js/Express backend, with MariaDB/MySQL transactions guaranteeing data integrity.

### Key Capabilities
- **Bulk CSV Import:** Ingest hundreds of employee records with comprehensive pre-commit validation.
- **Sample Template Generator:** Real-time generation of `bsc_textiles_employee_import_template.csv` directly from backend schema metadata (`IMPORT_COLUMNS`).
- **Non-Destructive Upsert:** Matches employees via `Employee ID` (`employeeCode`), then verified phone or email. Never merges on fuzzy name similarity.
- **Immutable & Sequential Employee IDs:** Centralized, concurrency-safe sequential allocation (`BSC-EMP-XXXX`) using `SELECT ... FOR UPDATE` row locking.
- **Legacy & Test ID Protection:** Preserves Sadashiva Hadimani (`1372`) and test identifiers (`TEST-EMP-001` through `TEST-EMP-038`).
- **Consistent 49-Column CSV Export:** Workforce directory export shares the exact same 49 columns and formatting rules as the import template.
- **Directory Data Quality Audit:** Real-time audit scanning the database for missing IDs, duplicates, unlinked stores, and anomalous statuses.

---

## 2. API Endpoints Reference

All endpoints are mounted under `/api/v1/employees/import` (and export under `/api/v1/employees/export`) with RBAC and rate-limiting enforcement:

| Endpoint | Method | Permission | Description |
|---|---|---|---|
| `/api/v1/employees/import/template` | `GET` | Authenticated | Download the official sample CSV template with 49 columns and sample records. |
| `/api/v1/employees/import/columns` | `GET` | Authenticated | Retrieve column schema metadata (group, required/optional, DB column, sensitive status). |
| `/api/v1/employees/import/id-policy` | `GET` | Authenticated | Get active Employee ID formatting rules and allocation telemetry. |
| `/api/v1/employees/import/preview` | `POST` | HR / Admin | Upload CSV and preview row-by-row validation, actions, changes, and detected errors before committing. |
| `/api/v1/employees/import/execute` | `POST` | HR / Admin | Atomically commit validated rows in a single database transaction. |
| `/api/v1/employees/import/history` | `GET` | HR / Admin | List recent import batches with success/failure statistics. |
| `/api/v1/employees/import/data-quality`| `GET` | HR / Admin | Run directory-wide data quality audit on all staff records. |
| `/api/v1/employees/export/csv` | `GET` | Authenticated | Export directory respecting location scope, search filters, and masking sensitive columns. |

---

## 3. CSV Column Schema & Field Mapping (49 Columns)

The schema is divided into 6 distinct organizational categories:

### A. Employee Identification (10 Columns)
| Column Name | Required | DB Column | Description & Format |
|---|---|---|---|
| `employee_id` | Optional | `employee.employeeCode` | Primary unique ID (e.g., `BSC-EMP-0036`). Auto-generated if left blank. |
| `employee_code` | Optional | `employee.legacyEmployeeCode` | Secondary legacy or alternate reference code. |
| `first_name` | Required (New) | `employee.firstName` | Legal first name (e.g., `Ananya`). |
| `middle_name` | Optional | `employee.middleName` | Middle name. |
| `last_name` | Required (New) | `employee.lastName` | Surname or family name (e.g., `Hegde`). |
| `full_name` | Optional | `employee.fullName` | Auto-assembled as `First [Middle] Last` if omitted. |
| `designation` | Optional | `employee.designation` | Store role title (e.g., `Senior Floor Executive`). |
| `role` | Optional | `employee.role` | RBAC role: `EMPLOYEE`, `HR_EXECUTIVE`, `STORE_MANAGER`, etc. |
| `employment_type` | Optional | `employee.employmentType` | `FULL_TIME`, `PART_TIME`, `CONTRACT`, `INTERN`. |
| `employment_status` | Optional | `employee.status` | `ACTIVE`, `INACTIVE`, `ON_LEAVE`, `TERMINATED`. |

### B. Contact Information (10 Columns)
| Column Name | Required | DB Column | Description & Format |
|---|---|---|---|
| `mobile_number` | Optional | `employee.phone` | 10-digit Indian mobile number (e.g., `9845012345`). |
| `alternate_mobile_number` | Optional | `employee.alternatePhone` | Secondary contact phone number. |
| `email` | Optional | `employee.email` | Corporate or personal email address. |
| `emergency_contact_name` | Optional | `employee.emergencyContactName` | Emergency contact person name. |
| `emergency_contact_number` | Optional | `employee.emergencyContactNumber` | Emergency contact phone. |
| `current_address` | Optional | `employee.currentAddress` | Current residential street address. |
| `permanent_address` | Optional | `employee.permanentAddress` | Permanent domicile street address. |
| `city` | Optional | `employee.city` | City (e.g., `Belagavi`, `Davanagere`, `Shivamogga`). |
| `state` | Optional | `employee.state` | State (defaults to `Karnataka`). |
| `pincode` | Optional | `employee.pincode` | 6-digit postal code (e.g., `590001`). |

### C. Store & Work Allocation (11 Columns)
| Column Name | Required | DB Column | Description & Format |
|---|---|---|---|
| `location_code` | Required | `location.code` | Canonical hub code: `BEL`, `DAV`, `SHI`. |
| `location_name` | Optional | `location.name` | Descriptive store name (e.g., `Belagavi Retail Hub`). |
| `department` | Optional | `department.code` / `name` | Store department (e.g., `Sales`, `Billing`, `Logistics`). |
| `floor` | Optional | `floor.name` | Assigned floor (e.g., `Ground Floor`, `First Floor`). |
| `section` | Optional | `section.name` | Floor department section (e.g., `Men's Ethnic`, `Silk Sarees`). |
| `shift_id` | Optional | `shift.code` | Standard shift identifier (e.g., `M1`, `G1`). |
| `shift_name` | Optional | `shift.name` | Shift name (e.g., `Morning Retail Shift`). |
| `reporting_manager_employee_id` | Optional | `employee.managerId` | Employee ID of reporting supervisor. |
| `joining_date` | Required (New) | `employee.joiningDate` | Date of joining (`YYYY-MM-DD`). |
| `confirmation_date` | Optional | `employee.confirmationDate` | Probation clearance date (`YYYY-MM-DD`). |
| `employee_category` | Optional | `employee.employeeCategory` | Category: `RETAIL_STAFF`, `OFFICE_STAFF`, `LOGISTICS`. |

### D. HR & Statutory Compliance (11 Columns)
| Column Name | Required | DB Column | Description & Format |
|---|---|---|---|
| `date_of_birth` | Optional | `employee.dateOfBirth` | Birth date (`YYYY-MM-DD`). |
| `gender` | Optional | `employee.gender` | `MALE`, `FEMALE`, `OTHER`. |
| `payroll_employee_code` | Optional | `employee.payrollEmployeeCode` | Reference payroll code. |
| `pf_applicable` | Optional | `employee.pfApplicable` | `TRUE` / `FALSE` for Provident Fund eligibility. |
| `uan_number` | Optional | `employee.uanNo` | 12-digit EPFO Universal Account Number. |
| `esi_applicable` | Optional | `employee.esiApplicable` | `TRUE` / `FALSE` for ESIC insurance eligibility. |
| `esi_number` | Optional | `employee.esiNo` | 17-digit ESIC insurance registration code. |
| `bank_account_reference` | Optional | `employee.bankAccount` | Bank account number (masked in non-privileged exports). |
| `ifsc_code` | Optional | `employee.bankIfsc` | 11-character bank branch IFSC code. |
| `pan_number` | Optional | `employee.panNumber` | 10-character Income Tax PAN code. |
| `aadhaar_verification_status` | Optional | `employee.aadhaarVerificationStatus` | Verification status: `VERIFIED`, `PENDING`, `REJECTED`. |

### E. Attendance & Biometric References (4 Columns)
| Column Name | Required | DB Column | Description & Format |
|---|---|---|---|
| `biometric_enrollment_status` | Optional (Read-only) | — | Current facial enrollment status (`ENROLLED` / `NOT_ENROLLED`). |
| `biometric_device_employee_id` | Optional | `employee.biometricDeviceEmployeeId` | Biometric hardware user ID. |
| `qr_pass_status` | Optional (Read-only) | — | QR pass issuance status (`ISSUED` / `NONE`). |
| `attendance_eligibility` | Optional | `employee.attendanceEligible` | `TRUE` / `FALSE` daily attendance tracking toggle. |

### F. Administrative Metadata (3 Columns)
| Column Name | Required | DB Column | Description & Format |
|---|---|---|---|
| `employee_photo_reference` | Optional | `employee.photoReference` | Profile photograph asset URI. |
| `employee_document_status` | Optional | `employee.documentStatus` | Status: `COMPLETE`, `PENDING`, `REJECTED`. |
| `remarks` | Optional | `employee.remarks` | HR ledger comments. |

---

## 4. Import Modes & Synchronization Logic

1. **Add New Employees (`new`):**
   - Validates that rows do not collide with existing employee IDs, phones, or emails.
   - Any matching row is marked `SKIP` with an explanation.
   - Assigns a new `BSC-EMP-XXXX` ID if `employee_id` is blank.

2. **Update Existing Employees (`update`):**
   - Strictly matches existing staff via `employee_id` (or verified mobile/email).
   - If no match is found, row is marked `ERROR` (`"Update Existing mode never creates records"`).
   - Blank CSV columns leave existing database values untouched (non-destructive).
   - Significant changes (e.g. location transfer, department change, status exit) are highlighted in preview.

3. **Upsert (`upsert`):**
   - Updates matching records and creates new records for unmatched rows.

---

## 5. Employee ID Management & Safety Rules

- **Format:** Configurable sequence defaulting to `BSC-EMP-XXXX` (padding 4 digits).
- **Concurrency Safety:** Allocated via `SELECT next_value FROM employee_id_sequence FOR UPDATE`. Multiple concurrent imports will never receive duplicate IDs.
- **Protection of Legacy Records:**
  - Preserves Sadashiva Lingarajappa Hadimani (`1372`).
  - Preserves test staff codes (`TEST-EMP-001` through `TEST-EMP-038`).
- **Data Cross-Linking:** Employee IDs are foreign keys in `attendance`, `payroll`, `employee_documents`, and biometric tables. Imports never mutate existing IDs to avoid breaking relational integrity.

---

## 6. Permissions & RBAC Enforcement

- **SUPER_ADMIN / ADMIN:** Full import access across all retail stores and head office; cleartext export of sensitive payroll/bank fields.
- **HR_MANAGER:** Full import access for managed stores.
- **Location HR Executives (e.g. Belagavi HR):** Backend enforces strict store isolation. Attempting to import rows with `location_code = DAV` will fail with: `"You are not authorised to import employees for location DAV"`.
- **Employees / Scanners:** No import or export access. Requests return HTTP 403 Forbidden.

---

## 7. Recovery & Audit History

- **Database Atomicity:** Imports execute inside a single transaction. If a database-level error occurs, the entire batch rolls back.
- **Audit Logging:** Every import writes to `employee_import_batch` and the centralized `audit_log`, recording the importer, timestamp, source filename, SHA-256 file hash, total rows, created/updated counts, and error details.
- **Error Reports:** If any rows fail validation during preview, a downloadable error report CSV is immediately generated, specifying the exact row number, employee name, and failed validation rules for offline remediation.
