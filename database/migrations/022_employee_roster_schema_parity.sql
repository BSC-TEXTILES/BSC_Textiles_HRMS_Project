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
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `_bak_022_employee`;
CREATE TABLE `_bak_022_employee` AS SELECT * FROM `employee`;

DROP TABLE IF EXISTS `_bak_022_employees`;
CREATE TABLE `_bak_022_employees` AS SELECT * FROM `employees`;

DROP TABLE IF EXISTS `_bak_022_user`;
CREATE TABLE `_bak_022_user` AS SELECT * FROM `user`;

DROP TABLE IF EXISTS `_bak_022_users`;
CREATE TABLE `_bak_022_users` AS SELECT * FROM `users`;

DROP TABLE IF EXISTS `_bak_022_location`;
CREATE TABLE `_bak_022_location` AS SELECT * FROM `location`;

DROP TABLE IF EXISTS `_bak_022_locations`;
CREATE TABLE `_bak_022_locations` AS SELECT * FROM `locations`;

DROP TABLE IF EXISTS `_bak_022_attendance`;
CREATE TABLE `_bak_022_attendance` AS SELECT * FROM `attendance`;

DROP TABLE IF EXISTS `_bak_022_payrollitem`;
CREATE TABLE `_bak_022_payrollitem` AS SELECT * FROM `payrollitem`;

DROP TABLE IF EXISTS `_bak_022_payroll_items`;
CREATE TABLE `_bak_022_payroll_items` AS SELECT * FROM `payroll_items`;

DROP TABLE IF EXISTS `_bak_022_payrollrun`;
CREATE TABLE `_bak_022_payrollrun` AS SELECT * FROM `payrollrun`;

DROP TABLE IF EXISTS `_bak_022_payroll_runs`;
CREATE TABLE `_bak_022_payroll_runs` AS SELECT * FROM `payroll_runs`;

DROP TABLE IF EXISTS `_bak_022_leaverequest`;
CREATE TABLE `_bak_022_leaverequest` AS SELECT * FROM `leaverequest`;

DROP TABLE IF EXISTS `_bak_022_employee_exits`;
CREATE TABLE `_bak_022_employee_exits` AS SELECT * FROM `employee_exits`;

DROP TABLE IF EXISTS `_bak_022_fnf_settlements`;
CREATE TABLE `_bak_022_fnf_settlements` AS SELECT * FROM `fnf_settlements`;

DROP TABLE IF EXISTS `_bak_022_employee_documents`;
CREATE TABLE `_bak_022_employee_documents` AS SELECT * FROM `employee_documents`;

DROP TABLE IF EXISTS `_bak_022_employee_id_sequence`;
CREATE TABLE `_bak_022_employee_id_sequence` AS SELECT * FROM `employee_id_sequence`;

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
