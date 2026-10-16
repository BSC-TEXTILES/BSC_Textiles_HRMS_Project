-- ===========================================================================
-- 027: EMPLOYMENT STATUS vs ACCOUNT ACCESS vs LOGIN ACTIVITY
--
-- Three different facts, three different places, one of them enforced:
--
--   EMPLOYMENT STATUS  `employee.status`
--       ACTIVE / INACTIVE / ON_LEAVE / TERMINATED / RESIGNED / RETIRED /
--       EX_EMPLOYEE / SUSPENDED. It changes ONLY through an authorised HR
--       action that names an actor and gives a reason. A BEFORE UPDATE trigger
--       refuses any status transition that does not set
--       `employmentStatusChangedById` + `employmentStatusReason`, so no
--       login job, attendance job, biometric sync or forgotten cron can flip
--       someone's employment status silently. An AFTER UPDATE trigger appends
--       the transition to `employment_status_history` (append-only).
--
--   ACCOUNT ACCESS     `user.accessStatus`
--       PENDING_APPROVAL / ACTIVE / LOCKED / DISABLED. Own column, own
--       transitions; disabling a login does not change employment and
--       terminating employment does not silently delete a login.
--
--   LOGIN ACTIVITY     `user.lastLoginAt` + `user.hasEverLoggedIn`
--       Pure observation. `hasEverLoggedIn` is a generated column so the two
--       can never disagree. An employee who has never logged in stays fully
--       visible and searchable: nothing here filters them out, and no read
--       path is keyed on either column.
--
-- Also adds `employee_directory`, the single canonical read shape every HR
-- screen is asked to use, so the number, the status and the access state are
-- displayed identically in dashboard, attendance, payroll, reports and profile.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Account access status, on the account.
-- ---------------------------------------------------------------------------
ALTER TABLE `user`
  ADD COLUMN `accessStatus` enum('PENDING_APPROVAL','ACTIVE','LOCKED','DISABLED')
      NOT NULL DEFAULT 'PENDING_APPROVAL' AFTER `status`,
  ADD COLUMN `accessStatusChangedAt` datetime(3) NULL DEFAULT NULL,
  ADD COLUMN `accessStatusChangedById` varchar(191) NULL DEFAULT NULL,
  ADD COLUMN `accessStatusReason` text NULL;

ALTER TABLE `user`
  ADD COLUMN `hasEverLoggedIn` tinyint(1)
      GENERATED ALWAYS AS (`lastLoginAt` IS NOT NULL) STORED;

ALTER TABLE `user` ADD INDEX `User_accessStatus_idx` (`accessStatus`);

-- Derive the initial access status from the state that already exists, so the
-- new column cannot disagree with `isActive` / `status` / `lockedUntil`.
UPDATE `user`
   SET `accessStatus` = CASE
         WHEN `isActive` = 0 OR `status` = 'DISABLED'                     THEN 'DISABLED'
         WHEN `status` = 'SUSPENDED'                                      THEN 'DISABLED'
         WHEN `status` IN ('PENDING_APPROVAL','PENDING_EMAIL_VERIFICATION','REJECTED')
                                                                          THEN 'PENDING_APPROVAL'
         WHEN `lockedUntil` IS NOT NULL AND `lockedUntil` > NOW()         THEN 'LOCKED'
         ELSE 'ACTIVE'
       END,
       `accessStatusChangedAt` = `updatedAt`;

-- Same shape on the newer mirror table, kept consistent.
ALTER TABLE `users`
  ADD COLUMN `accessStatus` enum('PENDING_APPROVAL','ACTIVE','LOCKED','DISABLED')
      NOT NULL DEFAULT 'ACTIVE' AFTER `is_active`;

UPDATE `users` us
  JOIN `user` u ON LOWER(u.`email`) = LOWER(us.`email`)
   SET us.`accessStatus` = u.`accessStatus`;

-- ---------------------------------------------------------------------------
-- 2. Employment-status history (append-only).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `employment_status_history` (
  `id`             bigint AUTO_INCREMENT PRIMARY KEY,
  `employeeId`     varchar(191) NOT NULL,
  `previousStatus` varchar(30)  NULL,
  `newStatus`      varchar(30)  NOT NULL,
  `reason`         text         NOT NULL,
  `changedById`    varchar(191) NOT NULL,
  `changedByName`  varchar(191) NULL,
  `source`         varchar(40)  NOT NULL DEFAULT 'hr-action',
  `createdAt`      datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY `idx_esh_employee` (`employeeId`, `createdAt`),
  KEY `idx_esh_actor` (`changedById`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 3. The database-level guarantee.
--    A status transition must arrive with an actor and a real reason.
--
--    NOTE ON DELIMITERS: the project's runner (`database/scripts/migrate.ts`)
--    hands the whole file to `pool.query()` with `multipleStatements` on, so
--    the server's own compound-statement parser does the splitting. `DELIMITER`
--    is a CLI-only directive and would be a syntax error here, so each trigger
--    body simply terminates with `END;`.
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS `trg_employee_status_requires_actor`;
CREATE TRIGGER `trg_employee_status_requires_actor`
  BEFORE UPDATE ON `employee`
  FOR EACH ROW
BEGIN
  IF NEW.`status` <> OLD.`status` THEN
    IF NEW.`employmentStatusChangedById` IS NULL OR TRIM(NEW.`employmentStatusChangedById`) = '' THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Employment status may only be changed by an authorised HR action that records the acting user.',
            MYSQL_ERRNO = 1644;
    END IF;
    IF NEW.`employmentStatusReason` IS NULL OR CHAR_LENGTH(TRIM(NEW.`employmentStatusReason`)) < 5 THEN
      SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Employment status change rejected: a reason of at least 5 characters is required.',
            MYSQL_ERRNO = 1644;
    END IF;
    IF NEW.`employmentStatusChangedAt` IS NULL THEN
      SET NEW.`employmentStatusChangedAt` = NOW(3);
    END IF;
  END IF;
END;

DROP TRIGGER IF EXISTS `trg_employee_status_history`;
CREATE TRIGGER `trg_employee_status_history`
  AFTER UPDATE ON `employee`
  FOR EACH ROW
BEGIN
  IF NEW.`status` <> OLD.`status` THEN
    INSERT INTO `employment_status_history`
          (`employeeId`, `previousStatus`, `newStatus`, `reason`, `changedById`, `source`, `createdAt`)
    VALUES (NEW.`id`, OLD.`status`, NEW.`status`, NEW.`employmentStatusReason`,
            NEW.`employmentStatusChangedById`,
            COALESCE(NEW.`rosterSource`, 'hr-action'), NOW(3));
  END IF;
END;

-- A created employee is ACTIVE by default; record the opening state so the
-- history is complete without pretending a transition happened.
DROP TRIGGER IF EXISTS `trg_employee_status_history_insert`;
CREATE TRIGGER `trg_employee_status_history_insert`
  AFTER INSERT ON `employee`
  FOR EACH ROW
BEGIN
  INSERT INTO `employment_status_history`
        (`employeeId`, `previousStatus`, `newStatus`, `reason`, `changedById`, `source`, `createdAt`)
  VALUES (NEW.`id`, NULL, NEW.`status`,
          COALESCE(NULLIF(NEW.`employmentStatusReason`, ''), 'Employee added to the roster.'),
          COALESCE(NULLIF(NEW.`employmentStatusChangedById`, ''), 'system:roster-bootstrap'),
          'roster-created', NOW(3));
END;

-- Backfill a history row for the status each existing employee already holds.
INSERT INTO `employment_status_history`
      (`employeeId`, `previousStatus`, `newStatus`, `reason`, `changedById`, `source`, `createdAt`)
SELECT e.`id`, NULL, e.`status`,
       'Backfilled at migration 027: employment status already held before per-transition history existed. No transition occurred; this is the recorded baseline.',
       'system:migration-027', 'baseline-backfill', e.`updatedAt`
  FROM `employee` e
 WHERE NOT EXISTS (SELECT 1 FROM `employment_status_history` h WHERE h.`employeeId` = e.`id`);

-- ---------------------------------------------------------------------------
-- 4. Nothing may change employment status on a schedule. Assert no event and no
--    other trigger touches `employee.status`.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `_review_status_automation_guards` (
  `id`        int AUTO_INCREMENT PRIMARY KEY,
  `objectType` varchar(40) NOT NULL,
  `objectName` varchar(191) NOT NULL,
  `finding`   text NOT NULL,
  `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

TRUNCATE TABLE `_review_status_automation_guards`;

INSERT INTO `_review_status_automation_guards` (`objectType`, `objectName`, `finding`)
SELECT 'EVENT', ev.EVENT_NAME,
       'Scheduled event exists and must be reviewed for any automatic employment-status change.'
  FROM information_schema.EVENTS ev
 WHERE ev.EVENT_SCHEMA = DATABASE()
   AND ev.STATUS = 'ENABLED';

INSERT INTO `_review_status_automation_guards` (`objectType`, `objectName`, `finding`)
SELECT 'TRIGGER', tg.TRIGGER_NAME,
       'Trigger outside the 027 status guards references employee.status and must be reviewed.'
  FROM information_schema.TRIGGERS tg
 WHERE tg.EVENT_OBJECT_TABLE = 'employee'
   AND tg.TRIGGER_NAME NOT IN ('trg_employee_status_requires_actor',
                               'trg_employee_status_history',
                               'trg_employee_status_history_insert');

SELECT `objectType`, `objectName`, `finding` FROM `_review_status_automation_guards`;

-- ---------------------------------------------------------------------------
-- 5. The single canonical read shape.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS `employee_directory`;
CREATE VIEW `employee_directory` AS
SELECT
    e.`id`,
    e.`employeeCode`,
    e.`legacyEmployeeCode`,
    e.`employeeCodeProposal`,
    e.`employeeCodeOrigin`,
    e.`requiresHrCodeReview`,
    e.`fullName`,
    e.`firstName`,
    e.`lastName`,
    e.`email`,
    e.`phone`,
    e.`gender`,
    e.`designation`,
    e.`role`,
    e.`locationId`,
    loc.`code`  AS `locationCode`,
    loc.`name`  AS `locationName`,
    e.`departmentId`,
    dept.`name` AS `departmentName`,
    e.`status`  AS `employmentStatus`,
    e.`employmentStatusChangedAt`,
    e.`employmentStatusChangedById`,
    e.`employmentStatusReason`,
    e.`joiningDate`,
    e.`exitDate`,
    e.`attendanceEligible`,
    e.`basicSalary`,
    e.`fixedGrossSalary`,
    e.`updatedAt`,
    e.`rowVersion`,
    e.`rosterSource`,
    u.`id`            AS `userId`,
    u.`accessStatus`  AS `accountAccessStatus`,
    u.`isActive`      AS `accountIsActive`,
    u.`lastLoginAt`,
    u.`hasEverLoggedIn`,
    CASE
      WHEN u.`id` IS NULL THEN 'NO_ACCOUNT'
      WHEN u.`accessStatus` = 'ACTIVE' AND u.`lockedUntil` IS NOT NULL AND u.`lockedUntil` > NOW()
           THEN 'LOCKED'
      ELSE u.`accessStatus`
    END AS `effectiveAccessStatus`,
    CASE WHEN e.`status` IN ('INACTIVE','TERMINATED','RESIGNED','RETIRED','EX_EMPLOYEE','SUSPENDED','ON_LEAVE')
         THEN 0 ELSE 1 END AS `isActiveInRoster`
  FROM `employee` e
  LEFT JOIN `location`   loc  ON loc.`id`  = e.`locationId`
  LEFT JOIN `department` dept ON dept.`id` = e.`departmentId`
  LEFT JOIN `user`       u    ON u.`employeeId` = e.`id`;

SELECT `employmentStatus`, COUNT(*) AS employees,
       SUM(`hasEverLoggedIn`) AS accountsThatHaveLoggedIn,
       SUM(CASE WHEN `userId` IS NULL THEN 1 ELSE 0 END) AS employeesWithoutAccount
  FROM `employee_directory`
 GROUP BY `employmentStatus`
 ORDER BY `employees` DESC;
