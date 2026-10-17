-- ===========================================================================
-- 022: EMPLOYEE ROSTER CONSOLIDATION — PHASE 1 (backups + schema parity)
--
-- Goal: make the legacy singular/camelCase `employee` table the ONE
-- authoritative employee roster. It is the table `backend/src/nativeDb.ts`
-- maps `prisma.employee` onto, the table `user.employeeId` FKs into, and the
-- table ~35 backend files read. The plural/snake_case `employees` table is
-- demoted to a read-only compatibility VIEW in migration 024 — exactly the
-- design `backend/src/scripts/setupViews.ts` already documents but never
-- applied (it skips any name that still exists as a base table).
--
-- This file moves NO rows. It:
--   1. snapshots every table the later phases touch into `_bak_022_*`
--      (an off-database JSON+SQL dump also lives in backend/backups/);
--   2. gives `employee` the columns `employees` carries so phase 2 can merge
--      without losing anything;
--   3. widens `employee.status` to the full employment-status vocabulary;
--   4. adds the optimistic-concurrency counter used by the HR edit APIs.
--
-- Existing rows, attendance and payroll history are untouched.
-- The backup section is idempotent (DROP + CREATE LIKE + INSERT SELECT) so a
-- partially applied run can be re-tried without a duplicate-key failure.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. In-database backups (CREATE TABLE AS SELECT: a plain data snapshot.
--    CTAS is required rather than CREATE TABLE LIKE because `attendance` carries
--    VIRTUAL GENERATED columns that reject explicit values.)
--    Rollback for phases 2-6 is: TRUNCATE the live table + INSERT ... SELECT
--    (naming the real columns) from its `_bak_022_*` counterpart.
--
--    `leaverequest` holds four rows whose `updatedAt` is the literal zero date
--    '0000-00-00 00:00:00.000' (a pre-existing defect, reported in 025). A
--    byte-faithful snapshot of those rows is impossible under NO_ZERO_DATE, so
--    the mode is relaxed for the snapshot statements only and restored
--    immediately afterwards. No live table is written by this section.
-- ---------------------------------------------------------------------------
SET @pre_022_sql_mode = @@SESSION.sql_mode;
SET SESSION sql_mode = 'IGNORE_SPACE,STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';

-- ---------------------------------------------------------------------------
-- 1b. Snapshot helper. The plural `employees` / `users` / `locations` /
--     `payroll_items` / `payroll_runs` / `employee_documents` /
--     `employee_id_sequence` tables come from the deprecated seed schema and
--     are absent on a freshly migrated database, so each snapshot runs only
--     when its source table exists. Source names are fixed literals below.
--     (Written as PREPARE/EXECUTE because DELIMITER-based procedures cannot be
--     sent through a multi-statement driver.)
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `_bak_022_employee`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee') > 0, 'CREATE TABLE `_bak_022_employee` AS SELECT * FROM `employee`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_employees`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees') > 0, 'CREATE TABLE `_bak_022_employees` AS SELECT * FROM `employees`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_user`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'user') > 0, 'CREATE TABLE `_bak_022_user` AS SELECT * FROM `user`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_users`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users') > 0, 'CREATE TABLE `_bak_022_users` AS SELECT * FROM `users`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_location`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'location') > 0, 'CREATE TABLE `_bak_022_location` AS SELECT * FROM `location`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_locations`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'locations') > 0, 'CREATE TABLE `_bak_022_locations` AS SELECT * FROM `locations`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_attendance`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance') > 0, 'CREATE TABLE `_bak_022_attendance` AS SELECT * FROM `attendance`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_payrollitem`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payrollitem') > 0, 'CREATE TABLE `_bak_022_payrollitem` AS SELECT * FROM `payrollitem`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_payroll_items`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_items') > 0, 'CREATE TABLE `_bak_022_payroll_items` AS SELECT * FROM `payroll_items`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_payrollrun`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payrollrun') > 0, 'CREATE TABLE `_bak_022_payrollrun` AS SELECT * FROM `payrollrun`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_payroll_runs`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_runs') > 0, 'CREATE TABLE `_bak_022_payroll_runs` AS SELECT * FROM `payroll_runs`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_leaverequest`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'leaverequest') > 0, 'CREATE TABLE `_bak_022_leaverequest` AS SELECT * FROM `leaverequest`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_employee_exits`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_exits') > 0, 'CREATE TABLE `_bak_022_employee_exits` AS SELECT * FROM `employee_exits`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_fnf_settlements`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fnf_settlements') > 0, 'CREATE TABLE `_bak_022_fnf_settlements` AS SELECT * FROM `fnf_settlements`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_employee_documents`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_documents') > 0, 'CREATE TABLE `_bak_022_employee_documents` AS SELECT * FROM `employee_documents`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

DROP TABLE IF EXISTS `_bak_022_employee_id_sequence`;
SET @o = IF((SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee_id_sequence') > 0, 'CREATE TABLE `_bak_022_employee_id_sequence` AS SELECT * FROM `employee_id_sequence`', 'SELECT 1');
PREPARE st FROM @o; EXECUTE st; DEALLOCATE PREPARE st;

-- Snapshot mode over: restore the server default strictness for every DDL/DML
-- statement below (and for the rest of the migration run).
SET SESSION sql_mode = @@GLOBAL.sql_mode;

-- ---------------------------------------------------------------------------
-- 2. Column parity. These are preservation/audit columns and carry NO foreign
--    key by design: the values they hold belong to the deprecated seed schema
--    (`floor_bel_g`, `dept_sarees`, `sp_bel_01`, `shift_retail_morning`) and
--    remapping them would be inventing an org assignment HR has not approved.
--    `legacyEmployeeCode` already existed on `employee` for the same purpose.
-- ---------------------------------------------------------------------------
ALTER TABLE `employee`
  ADD COLUMN `legacyFloorId`        varchar(191) NULL DEFAULT NULL,
  ADD COLUMN `legacyDepartmentId`   varchar(191) NULL DEFAULT NULL,
  ADD COLUMN `legacySectionId`      varchar(191) NULL DEFAULT NULL,
  ADD COLUMN `legacyShiftId`        varchar(191) NULL DEFAULT NULL,
  ADD COLUMN `legacySellingPointId` varchar(191) NULL DEFAULT NULL,
  ADD COLUMN `rowVersion`           int NOT NULL DEFAULT 1,
  ADD COLUMN `rosterSource`         varchar(40) NOT NULL DEFAULT 'legacy-employee-table',
  ADD COLUMN `mergedFromSeedRoster` tinyint(1)  NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 3. Employment status vocabulary (HR spec 2d). The four values already in use
--    are a subset of the new set, so no row changes value.
-- ---------------------------------------------------------------------------
ALTER TABLE `employee`
  MODIFY COLUMN `status` enum(
    'ACTIVE','INACTIVE','ON_LEAVE','TERMINATED','RESIGNED','RETIRED','EX_EMPLOYEE','SUSPENDED'
  ) NOT NULL DEFAULT 'ACTIVE';

-- ---------------------------------------------------------------------------
-- 4. Employment-status transitions are written only by an authorised HR action
--    or a configured rule — never automatically by a login or attendance job.
--    These columns record who/why/when for the audit trail.
-- ---------------------------------------------------------------------------
ALTER TABLE `employee`
  ADD COLUMN `employmentStatusChangedAt`   datetime(3)  NULL DEFAULT NULL,
  ADD COLUMN `employmentStatusChangedById` varchar(191) NULL DEFAULT NULL,
  ADD COLUMN `employmentStatusReason`      text         NULL;

-- `employeeCode` deliberately stays varchar(191): digits-only is enforced by a
-- CHECK constraint in 025, and a string column is what preserves leading zeros
-- (`0102`). Converting it to an int would silently corrupt such identifiers.

CREATE INDEX `Employee_status_joiningDate_idx` ON `employee` (`status`, `joiningDate`);
CREATE INDEX `Employee_rosterSource_idx`       ON `employee` (`rosterSource`);
CREATE INDEX `Employee_legacyEmployeeCode_idx` ON `employee` (`legacyEmployeeCode`);
