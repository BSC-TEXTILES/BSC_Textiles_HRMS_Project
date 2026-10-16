-- ===========================================================================
-- 024: EMPLOYEE ROSTER CONSOLIDATION — PHASE 3 (`employees` becomes a VIEW)
--
-- `employee` is now the only base table holding roster rows. The name
-- `employees` is kept as a read/limited-write compatibility VIEW over it, so
-- every existing `FROM employees e` / `JOIN employees e` in the backend keeps
-- working and CANNOT drift, because there is only one underlying row set.
-- This is the design `backend/src/scripts/setupViews.ts` already implements for
-- a fresh database; it never applied here because the base table existed.
--
-- The old base table is renamed to `_deprecated_employees_seed_v2`, not
-- dropped, so the pre-consolidation shape stays available.
--
-- Foreign keys that pointed at the `employees` base table are re-parented to
-- `employee(id)` rather than removed, so referential integrity over payroll /
-- QR / leave / observation / user history is preserved. Every referencing id
-- already resolves (asserted at the end of 023).
--
-- VIEW UPDATABILITY NOTE: every projection below is a bare column reference —
-- no literals, no expressions, no joins. `EmployeeRepository.updateStatus()`
-- issues `UPDATE employees SET status = ?, updated_at = NOW()`, which must
-- reach the base table through the view.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Record the FKs that currently parent on `employees` (rollback reference).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `_deprecated_employees_fk_definitions` (
  `id`                 int AUTO_INCREMENT PRIMARY KEY,
  `constraint_name`    varchar(191) NOT NULL,
  `child_table`        varchar(191) NOT NULL,
  `child_column`       varchar(191) NOT NULL,
  `referenced_table`   varchar(191) NOT NULL,
  `referenced_column`  varchar(191) NOT NULL,
  `rollback_ddl`       text NOT NULL,
  `createdAt`          datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `_deprecated_employees_fk_definitions`
      (`constraint_name`, `child_table`, `child_column`, `referenced_table`, `referenced_column`, `rollback_ddl`)
SELECT k.CONSTRAINT_NAME, k.TABLE_NAME, k.COLUMN_NAME, k.REFERENCED_TABLE_NAME, k.REFERENCED_COLUMN_NAME,
       CONCAT('ALTER TABLE `', k.TABLE_NAME, '` ADD CONSTRAINT `', k.CONSTRAINT_NAME,
              '` FOREIGN KEY (`', k.COLUMN_NAME, '`) REFERENCES `', k.REFERENCED_TABLE_NAME,
              '` (`', k.REFERENCED_COLUMN_NAME, '`)')
  FROM information_schema.KEY_COLUMN_USAGE k
 WHERE k.TABLE_SCHEMA = DATABASE()
   AND k.REFERENCED_TABLE_NAME = 'employees';

-- ---------------------------------------------------------------------------
-- 2. Re-parent each child FK onto `employee(id)`, then demote the base table.
-- ---------------------------------------------------------------------------
ALTER TABLE `breaks`              DROP FOREIGN KEY `fk_brk_employee`;
ALTER TABLE `breaks`              ADD CONSTRAINT `fk_brk_employee` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `face_verification_logs` DROP FOREIGN KEY `fk_face_emp`;
ALTER TABLE `face_verification_logs` ADD CONSTRAINT `fk_face_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `incentive_grants`    DROP FOREIGN KEY `fk_inc_grant_emp`;
ALTER TABLE `incentive_grants`    ADD CONSTRAINT `fk_inc_grant_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `leave_requests`      DROP FOREIGN KEY `fk_leave_emp`;
ALTER TABLE `leave_requests`      ADD CONSTRAINT `fk_leave_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `observations`        DROP FOREIGN KEY `fk_obs_emp`;
ALTER TABLE `observations`        ADD CONSTRAINT `fk_obs_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `payroll_items`       DROP FOREIGN KEY `fk_pay_items_emp`;
ALTER TABLE `payroll_items`       ADD CONSTRAINT `fk_pay_items_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `penalty_records`     DROP FOREIGN KEY `fk_pen_rec_emp`;
ALTER TABLE `penalty_records`     ADD CONSTRAINT `fk_pen_rec_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `qr_codes`            DROP FOREIGN KEY `fk_qr_emp`;
ALTER TABLE `qr_codes`            ADD CONSTRAINT `fk_qr_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `qr_scan_records`     DROP FOREIGN KEY `fk_scan_emp`;
ALTER TABLE `qr_scan_records`     ADD CONSTRAINT `fk_scan_emp` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

ALTER TABLE `users`               DROP FOREIGN KEY `fk_users_employee`;
ALTER TABLE `users`               ADD CONSTRAINT `fk_users_employee` FOREIGN KEY (`employee_id`) REFERENCES `employee` (`id`);

RENAME TABLE `employees` TO `_deprecated_employees_seed_v2`;

-- ---------------------------------------------------------------------------
-- 3. The compatibility view. One row per authoritative roster row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW `employees` AS
SELECT
    e.`id`,
    e.`employeeCode`            AS `employee_code`,
    e.`employeeCode`            AS `employeeCode`,
    e.`legacyEmployeeCode`      AS `legacy_employee_code`,
    e.`firstName`,
    e.`lastName`,
    e.`middleName`,
    e.`fullName`                AS `full_name`,
    e.`fullName`,
    e.`email`,
    e.`phone`,
    e.`alternatePhone`          AS `alternate_phone`,
    e.`gender`,
    e.`dateOfBirth`             AS `date_of_birth`,
    e.`dateOfBirth`,
    e.`locationId`              AS `location_id`,
    e.`locationId`,
    e.`floorId`                 AS `floor_id`,
    e.`floorId`,
    e.`departmentId`            AS `department_id`,
    e.`departmentId`,
    e.`sectionId`               AS `section_id`,
    e.`sectionId`,
    e.`shiftId`                 AS `shift_id`,
    e.`shiftId`,
    e.`legacySellingPointId`    AS `selling_point_id`,
    e.`legacyFloorId`           AS `seed_floor_id`,
    e.`legacyDepartmentId`      AS `seed_department_id`,
    e.`legacySectionId`         AS `seed_section_id`,
    e.`legacyShiftId`           AS `seed_shift_id`,
    e.`designation`,
    e.`role`,
    e.`status`,
    e.`joiningDate`             AS `date_of_joining`,
    e.`joiningDate`,
    e.`exitDate`                AS `exit_date`,
    e.`exitDate`,
    e.`confirmationDate`        AS `confirmation_date`,
    e.`reportingManagerId`      AS `reporting_manager_id`,
    e.`employmentType`          AS `employment_type`,
    e.`employeeCategory`        AS `employee_category`,
    e.`basicSalary`             AS `base_salary`,
    e.`fixedGrossSalary`        AS `fixed_gross_salary`,
    e.`perDaySalary`            AS `per_day_salary`,
    e.`daysPayable`             AS `days_payable`,
    e.`panNumber`               AS `pan_number`,
    e.`pfNo`,
    e.`esiNo`,
    e.`uanNo`,
    e.`bankName`,
    e.`bankAccount`,
    e.`bankIfsc`,
    e.`biometricDeviceEmployeeId` AS `biometric_device_employee_id`,
    e.`attendanceEligible`      AS `attendance_eligible`,
    e.`photoReference`          AS `photo_reference`,
    e.`documentStatus`          AS `document_status`,
    e.`remarks`,
    e.`rowVersion`              AS `row_version`,
    e.`rosterSource`            AS `roster_source`,
    e.`employmentStatusChangedAt`  AS `employment_status_changed_at`,
    e.`employmentStatusChangedById` AS `employment_status_changed_by_id`,
    e.`employmentStatusReason`  AS `employment_status_reason`,
    e.`createdAt`               AS `created_at`,
    e.`createdAt`,
    e.`updatedAt`               AS `updated_at`,
    e.`updatedAt`
  FROM `employee` e;

-- ---------------------------------------------------------------------------
-- 4. Assert: the view exposes exactly the roster, nothing more, nothing less.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `_assert_024_view_parity`;
CREATE PROCEDURE `_assert_024_view_parity`()
BEGIN
  DECLARE v_base INT;
  DECLARE v_view INT;
  SELECT COUNT(*) INTO v_base FROM `employee`;
  SELECT COUNT(*) INTO v_view FROM `employees`;
  IF v_base <> v_view THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '024 abort: `employees` view row count does not match the authoritative `employee` table.',
          MYSQL_ERRNO = 1644;
  END IF;
END;

CALL `_assert_024_view_parity`();
DROP PROCEDURE IF EXISTS `_assert_024_view_parity`;
