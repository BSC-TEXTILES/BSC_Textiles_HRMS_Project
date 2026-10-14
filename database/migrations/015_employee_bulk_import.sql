-- ===========================================================================
-- 015: BULK EMPLOYEE IMPORT & EMPLOYEE ID MANAGEMENT
-- Workforce Directory bulk CSV import, import history and centralised,
-- concurrency-safe Employee ID allocation.
--
-- NOTE: This file documents the migration. The application also applies the
-- same changes idempotently at boot through
-- `backend/src/scripts/setupEmployeeImportSchema.ts`, which is the authoritative
-- mechanism (it guards every ALTER with an information_schema/SHOW COLUMNS
-- check, so it is safe to run repeatedly and on both MySQL and the offline
-- SQLite desktop build).
--
-- Additive only: every new `employee` column is NULLable, so existing modules
-- (attendance, payroll, biometric, documents, F&F settlement) keep working
-- without change. Existing official Employee IDs — for example `1372`,
-- SADASHIVA LINGARAJAPPA HADIMANI — are never rewritten.
-- ===========================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------------
-- 1. Employee columns required by the CSV contract.
--    Columns that already existed (employeeCode, firstName, lastName, fullName,
--    email, phone, gender, dateOfBirth, locationId, floorId, departmentId,
--    sectionId, shiftId, designation, role, status, joiningDate, uanNo, esiNo,
--    bankAccount, bankIfsc) are intentionally NOT redefined here.
-- ---------------------------------------------------------------------------
ALTER TABLE `employee`
  ADD COLUMN `middleName`                  VARCHAR(191) NULL,
  ADD COLUMN `alternatePhone`              VARCHAR(50)  NULL,
  ADD COLUMN `emergencyContactName`        VARCHAR(191) NULL,
  ADD COLUMN `emergencyContactNumber`      VARCHAR(50)  NULL,
  ADD COLUMN `currentAddress`              VARCHAR(255) NULL,
  ADD COLUMN `permanentAddress`            VARCHAR(255) NULL,
  ADD COLUMN `city`                        VARCHAR(100) NULL,
  ADD COLUMN `state`                       VARCHAR(100) NULL,
  ADD COLUMN `pincode`                     VARCHAR(10)  NULL,
  ADD COLUMN `employmentType`              VARCHAR(30)  NULL,
  ADD COLUMN `employeeCategory`            VARCHAR(30)  NULL,
  ADD COLUMN `confirmationDate`            datetime(3)  NULL,
  ADD COLUMN `reportingManagerId`          VARCHAR(191) NULL,
  ADD COLUMN `payrollEmployeeCode`         VARCHAR(50)  NULL,
  ADD COLUMN `pfApplicable`                tinyint(1)   NULL,
  ADD COLUMN `esiApplicable`               tinyint(1)   NULL,
  ADD COLUMN `panNumber`                   VARCHAR(20)  NULL,
  -- STATUS ONLY. The Aadhaar number itself is never stored on the employee row.
  ADD COLUMN `aadhaarVerificationStatus`   VARCHAR(30)  NULL,
  ADD COLUMN `biometricDeviceEmployeeId`   VARCHAR(50)  NULL,
  ADD COLUMN `attendanceEligible`          tinyint(1)   DEFAULT 1,
  ADD COLUMN `photoReference`              VARCHAR(255) NULL,
  ADD COLUMN `documentStatus`              VARCHAR(30)  NULL,
  ADD COLUMN `remarks`                     VARCHAR(500) NULL,
  -- Legacy / pre-existing identifier preserved ALONGSIDE the official display
  -- ID. `employeeCode` remains the single official Employee ID.
  ADD COLUMN `legacyEmployeeCode`          VARCHAR(191) NULL,
  -- Traceability: which import batch created / last updated this record.
  ADD COLUMN `importBatchId`               VARCHAR(191) NULL;

CREATE INDEX `idx_emp_phone` ON `employee` (`phone`);

-- ---------------------------------------------------------------------------
-- 2. Database-backed Employee ID sequence.
--    Allocated under `SELECT ... FOR UPDATE` so simultaneous imports can never
--    mint the same ID. IDs are NEVER derived from a row count or a frontend
--    counter. `next_value` is seeded above the highest existing employee code
--    (numeric legacy IDs such as 1372 and TEST-EMP-*) by the setup script.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employee_id_sequence` (
  `id`            varchar(64)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `format_key`    varchar(64)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `prefix`        varchar(32)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `padding`       int          NOT NULL DEFAULT '4',
  `next_value`    bigint       NOT NULL DEFAULT '1',
  `sample_format` varchar(64)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `updated_at`    datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_id_sequence_format_key` (`format_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The format itself is configurable at runtime through `system_settings`
-- (key: employee_id_format) — see backend/src/services/employeeIdService.ts.
INSERT INTO `employee_id_sequence` (`id`, `format_key`, `prefix`, `padding`, `next_value`, `sample_format`)
VALUES ('BSC-EMP', 'BSC-EMP', 'BSC-EMP-', 4, 1, 'BSC-EMP-0001')
ON DUPLICATE KEY UPDATE `format_key` = `format_key`;

-- ---------------------------------------------------------------------------
-- 3. Import history / audit ledger.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employee_import_batch` (
  `id`              varchar(64)   COLLATE utf8mb4_unicode_ci NOT NULL,
  `batch_ref`       varchar(64)   COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_name`       varchar(255)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `file_hash`       char(64)      COLLATE utf8mb4_unicode_ci NOT NULL,
  `mode`            varchar(20)   COLLATE utf8mb4_unicode_ci NOT NULL,
  `status`          varchar(20)   COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PENDING',
  `total_rows`      int           NOT NULL DEFAULT '0',
  `created_rows`    int           NOT NULL DEFAULT '0',
  `updated_rows`    int           NOT NULL DEFAULT '0',
  `failed_rows`     int           NOT NULL DEFAULT '0',
  `skipped_rows`    int           NOT NULL DEFAULT '0',
  `location_scope`  varchar(191)  COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `imported_by`     varchar(191)  COLLATE utf8mb4_unicode_ci NOT NULL,
  `imported_by_name` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `id_format_used`  varchar(64)   COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rows_json`       mediumtext    COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_report`    mediumtext    COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_details` text          COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at`      datetime(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at`      datetime(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_import_batch_ref_key` (`batch_ref`),
  KEY `employee_import_batch_created_idx` (`created_at`),
  KEY `employee_import_batch_imported_by_idx` (`imported_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- 4. CSV column → database column mapping (see also docs/EMPLOYEE_BULK_IMPORT.md)
--    employee_id                    -> employee.employeeCode        (OFFICIAL ID)
--    employee_code                  -> employee.legacyEmployeeCode
--    first_name                     -> employee.firstName
--    middle_name                    -> employee.middleName
--    last_name                      -> employee.lastName
--    full_name                      -> employee.fullName
--    designation                    -> employee.designation
--    role                           -> employee.role
--    employment_type                -> employee.employmentType
--    employment_status              -> employee.status
--    mobile_number                  -> employee.phone
--    alternate_mobile_number        -> employee.alternatePhone
--    email                          -> employee.email
--    emergency_contact_name         -> employee.emergencyContactName
--    emergency_contact_number       -> employee.emergencyContactNumber
--    current_address                -> employee.currentAddress
--    permanent_address              -> employee.permanentAddress
--    city / state / pincode         -> employee.city / state / pincode
--    location_code                  -> employee.locationId  (resolved via location.code)
--    location_name                  -> validated against location.name
--    department                     -> employee.departmentId (resolved via department.code|name)
--    floor                          -> employee.floorId (resolved via floor.name|number)
--    section                        -> employee.sectionId (resolved via section.code|name)
--    shift_id / shift_name          -> employee.shiftId (resolved via shift.code|name)
--    reporting_manager_employee_id  -> employee.reportingManagerId (resolved via employee.employeeCode)
--    joining_date                   -> employee.joiningDate
--    confirmation_date              -> employee.confirmationDate
--    employee_category              -> employee.employeeCategory
--    date_of_birth                  -> employee.dateOfBirth
--    gender                         -> employee.gender
--    payroll_employee_code          -> employee.payrollEmployeeCode
--    pf_applicable                  -> employee.pfApplicable
--    uan_number                     -> employee.uanNo
--    esi_applicable                 -> employee.esiApplicable
--    esi_number                     -> employee.esiNo
--    bank_account_reference         -> employee.bankAccount       (masked on export)
--    ifsc_code                      -> employee.bankIfsc
--    pan_number                     -> employee.panNumber         (masked on export)
--    aadhaar_verification_status    -> employee.aadhaarVerificationStatus (status only)
--    biometric_enrollment_status    -> computed from employee.faceProfileId (read-only)
--    biometric_device_employee_id   -> employee.biometricDeviceEmployeeId
--    qr_pass_status                 -> computed from employee.qrCodeId (read-only)
--    attendance_eligibility         -> employee.attendanceEligible
--    employee_photo_reference       -> employee.photoReference
--    employee_document_status       -> employee.documentStatus
--    remarks                        -> employee.remarks
-- ---------------------------------------------------------------------------
