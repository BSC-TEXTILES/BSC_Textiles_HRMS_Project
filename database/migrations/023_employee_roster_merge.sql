-- ===========================================================================
-- 023: EMPLOYEE ROSTER CONSOLIDATION — PHASE 2 (merge the seed roster in)
--
-- The roster rows that exist only in the plural `employees` table are inserted
-- into `employee`. Every row keeps its existing PRIMARY KEY value
-- (`emp_kavita`, `emp_rajesh`, …) so the history already keyed on those ids —
-- `payroll_items`, `payroll_runs`, `employee_exits`, `fnf_settlements`,
-- `users.employee_id`, `employee_documents`, `qr_codes` — resolves unchanged.
--
-- Nothing is deleted and no history row is touched. `employees` is left intact
-- here and demoted to a compatibility view in 024.
--
-- Deliberate non-inventions (see the `_review_*` report tables):
--   * locationId  — remapped by store CODE (BEL/DAV/SHI), a mechanical map.
--   * floor / department / section / shift / selling point — NOT guessed. The
--     legacy FK column stays NULL and the original seed id is preserved
--     verbatim in the matching `legacy*Id` column for HR to assign.
--   * role        — taken from the `users` row already linked to the employee,
--     otherwise from the `user` row with the same email; else EMPLOYEE.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 2a. Rows present in BOTH tables (only `emp_bsc_1604`): keep the legacy row,
--     backfill only the columns the legacy row leaves empty/zero.
-- ---------------------------------------------------------------------------
UPDATE `employee` e
  JOIN `_bak_022_employees` s ON s.`id` = e.`id`
   SET e.`rosterSource`   = 'present-in-both-tables',
       e.`basicSalary`    = CASE WHEN COALESCE(e.`basicSalary`, 0) = 0
                                 THEN s.`base_salary` ELSE e.`basicSalary` END,
       e.`legacyFloorId`        = COALESCE(e.`legacyFloorId`, s.`floor_id`),
       e.`legacyDepartmentId`   = COALESCE(e.`legacyDepartmentId`, s.`department_id`),
       e.`legacySectionId`      = COALESCE(e.`legacySectionId`, s.`section_id`),
       e.`legacyShiftId`        = COALESCE(e.`legacyShiftId`, s.`shift_id`),
       e.`legacySellingPointId` = COALESCE(e.`legacySellingPointId`, s.`selling_point_id`)
 WHERE 1 = 1;

-- ---------------------------------------------------------------------------
-- 2b. Rows that exist ONLY in `employees` -> insert into `employee`.
--     Rows whose store code cannot be resolved are NOT inserted here (they
--     would break the NOT NULL `locationId` FK); they are reported in 2c and
--     the migration aborts rather than silently dropping a human being.
-- ---------------------------------------------------------------------------
INSERT INTO `employee` (
    `id`, `employeeCode`, `firstName`, `lastName`, `fullName`,
    `email`, `phone`, `gender`,
    `locationId`,
    `legacyFloorId`, `legacyDepartmentId`, `legacySectionId`, `legacySellingPointId`, `legacyShiftId`,
    `role`, `status`,
    `joiningDate`,
    `basicSalary`, `fixedGrossSalary`, `perDaySalary`, `daysPayable`,
    `createdAt`, `updatedAt`, `rowVersion`,
    `rosterSource`, `mergedFromSeedRoster`
)
SELECT
    s.`id`,
    s.`employee_code`,
    TRIM(SUBSTRING_INDEX(s.`full_name`, ' ', 1)),
    COALESCE(NULLIF(TRIM(SUBSTRING(s.`full_name`,
              LENGTH(SUBSTRING_INDEX(s.`full_name`, ' ', 1)) + 2)), ''), ''),
    s.`full_name`,
    LOWER(s.`email`),
    s.`phone`,
    LOWER(s.`gender`),                    -- legacy `employee` convention is lowercase
    tl.`id`,                              -- mapped by store code
    s.`floor_id`, s.`department_id`, s.`section_id`, s.`selling_point_id`, s.`shift_id`,
    COALESCE(
        (SELECT u.`role` FROM `users` u WHERE u.`employee_id` = s.`id` LIMIT 1),
        (SELECT u2.`role` FROM `user` u2 WHERE LOWER(u2.`email`) = LOWER(s.`email`) LIMIT 1),
        'EMPLOYEE'
    ),
    s.`status`,
    COALESCE(s.`date_of_joining`, s.`created_at`, NOW()),
    s.`base_salary`,
    s.`base_salary`,
    ROUND(s.`base_salary` / 31, 2),
    31.00,
    s.`created_at`,
    s.`updated_at`,
    1,
    'seed-employees-table-merged',
    1
  FROM `_bak_022_employees` s
  JOIN `locations` sl ON sl.`id` = s.`location_id`
  JOIN `location`  tl ON tl.`code` = LEFT(sl.`code`, 3)
 WHERE NOT EXISTS (SELECT 1 FROM `employee` e WHERE e.`id` = s.`id`);

-- ---------------------------------------------------------------------------
-- 2c. Report — never drop — any seed roster row that could not be merged.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `_review_unmerged_seed_employee` (
  `id`               int AUTO_INCREMENT PRIMARY KEY,
  `employeeId`       varchar(191) NOT NULL,
  `employeeCode`     varchar(191) NOT NULL,
  `fullName`         varchar(191) NOT NULL,
  `seedLocationId`   varchar(191) DEFAULT NULL,
  `seedLocationCode` varchar(40)  DEFAULT NULL,
  `reason`           varchar(255) DEFAULT NULL,
  `createdAt`        datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `_review_unmerged_seed_employee`
      (`employeeId`, `employeeCode`, `fullName`, `seedLocationId`, `seedLocationCode`, `reason`)
SELECT s.`id`, s.`employee_code`, s.`full_name`, s.`location_id`, sl.`code`,
       'Seed roster location has no matching store code in the authoritative `location` table; not merged.'
  FROM `_bak_022_employees` s
  LEFT JOIN `locations` sl ON sl.`id` = s.`location_id`
  LEFT JOIN `location`  tl ON tl.`code` = LEFT(sl.`code`, 3)
 WHERE tl.`id` IS NULL
   AND NOT EXISTS (SELECT 1 FROM `_review_unmerged_seed_employee` r WHERE r.`employeeId` = s.`id`);

-- ---------------------------------------------------------------------------
-- 2d. Org-assignment columns left NULL on purpose, listed for HR.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `_review_pending_org_assignment` (
  `id`                 int AUTO_INCREMENT PRIMARY KEY,
  `employeeId`         varchar(191) NOT NULL,
  `employeeCode`       varchar(191) NOT NULL,
  `fullName`           varchar(191) NOT NULL,
  `legacyFloorId`      varchar(191) DEFAULT NULL,
  `legacyDepartmentId` varchar(191) DEFAULT NULL,
  `legacySectionId`    varchar(191) DEFAULT NULL,
  `legacyShiftId`      varchar(191) DEFAULT NULL,
  `legacySellingPointId` varchar(191) DEFAULT NULL,
  `note`               varchar(255) NOT NULL,
  `createdAt`          datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_review_pending_emp` (`employeeId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `_review_pending_org_assignment`
      (`employeeId`, `employeeCode`, `fullName`, `legacyFloorId`, `legacyDepartmentId`,
       `legacySectionId`, `legacyShiftId`, `legacySellingPointId`, `note`)
SELECT e.`id`, e.`employeeCode`, e.`fullName`, e.`legacyFloorId`, e.`legacyDepartmentId`,
       e.`legacySectionId`, e.`legacyShiftId`, e.`legacySellingPointId`,
       'Floor/department/section/shift/selling-point mapping was NOT invented; original seed ids preserved here for HR.'
  FROM `employee` e
 WHERE e.`mergedFromSeedRoster` = 1
   AND (e.`legacyFloorId` IS NOT NULL OR e.`legacyDepartmentId` IS NOT NULL
        OR e.`legacySectionId` IS NOT NULL OR e.`legacyShiftId` IS NOT NULL
        OR e.`legacySellingPointId` IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM `_review_pending_org_assignment` r WHERE r.`employeeId` = e.`id`);

-- ---------------------------------------------------------------------------
-- 2e. Hard assertions. A consolidation that loses a human being must fail the
--     migration, not the payroll run three weeks later.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `_assert_023_roster_merge`;
CREATE PROCEDURE `_assert_023_roster_merge`()
BEGIN
  DECLARE v_unmerged   INT;
  DECLARE v_missing    INT;
  DECLARE v_final_rows INT;
  DECLARE v_expected   INT;

  SELECT COUNT(*) INTO v_unmerged FROM `_review_unmerged_seed_employee`;
  IF v_unmerged > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '023 abort: seed roster rows could not be merged into `employee`. See `_review_unmerged_seed_employee`.',
          MYSQL_ERRNO = 1644;
  END IF;

  -- every id referenced by history or by an account must exist in `employee`
  SELECT COUNT(*) INTO v_missing FROM (
    SELECT pi.`employee_id` AS eid FROM `payroll_items` pi
      WHERE NOT EXISTS (SELECT 1 FROM `employee` e WHERE e.`id` = pi.`employee_id`)
    UNION ALL
    SELECT u.`employee_id` FROM `users` u
      WHERE u.`employee_id` IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM `employee` e WHERE e.`id` = u.`employee_id`)
    UNION ALL
    SELECT ex.`employee_id` FROM `employee_exits` ex
      WHERE NOT EXISTS (SELECT 1 FROM `employee` e WHERE e.`id` = ex.`employee_id`)
    UNION ALL
    SELECT d.`employeeId` FROM `employee_documents` d
      WHERE d.`employeeId` IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM `employee` e WHERE e.`id` = d.`employeeId`)
  ) refs;
  IF v_missing > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '023 abort: history/account rows reference an employee id missing from the authoritative roster.',
          MYSQL_ERRNO = 1644;
  END IF;

  -- row-count sanity: authoritative roster >= union of both rosters
  SELECT COUNT(*) INTO v_final_rows FROM `employee`;
  SELECT COUNT(*) INTO v_expected FROM (
    SELECT `id` FROM `_bak_022_employee`
    UNION
    SELECT `id` FROM `_bak_022_employees`
  ) u;
  IF v_final_rows < v_expected THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '023 abort: consolidated roster is smaller than the union of the two source rosters.',
          MYSQL_ERRNO = 1644;
  END IF;
END;

CALL `_assert_023_roster_merge`();
DROP PROCEDURE IF EXISTS `_assert_023_roster_merge`;

-- Roster snapshot for the migration log (attendance/payroll history is keyed on
-- employee ids, which were preserved, so no history rows needed rewriting).
SELECT e.`id`, e.`employeeCode`, e.`fullName`, l.`code` AS locationCode, e.`status`,
       e.`rosterSource`, e.`mergedFromSeedRoster`
  FROM `employee` e
  LEFT JOIN `location` l ON l.`id` = e.`locationId`
 ORDER BY e.`employeeCode`;
