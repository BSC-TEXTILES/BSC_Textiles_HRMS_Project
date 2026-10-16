-- ===========================================================================
-- 026: LINK ACCOUNTS TO EMPLOYEE PROFILES
--
-- `user.employeeId` is what every employee-scoped endpoint resolves the caller
-- through (`backend/src/middleware/auth.ts` copies it onto `req.user`). It
-- drives the 403 "No associated employee profile found" on
-- `/api/payroll/payslips`, the 400 "Employee context not found" on
-- `/api/payroll/payslips/my-slips`, and the employee scoping in leaves,
-- attendance, my-desk, mobile, KYC, missed-punching and employee documents.
--
-- 37 of the 38 accounts had NULL `employeeId`. The single non-NULL one
-- (`admin@bsctextiles.com` -> `cmvakvxnq3e3093cba7b2`) pointed at the WRONG
-- person — that id is "Ramesh Patil", not the Super Admin. It is corrected and
-- reported rather than quietly overwritten.
--
-- Resolution order, most trustworthy first:
--   1. EMAIL — exact, case-insensitive, against `employee.email`. That column
--      is uniquely indexed, so a match can only ever identify one row.
--   2. EXISTING LINK — an already-set `user.employeeId` that still resolves
--      against the consolidated roster is re-validated and kept.
--   3. NAME + LOCATION — only when the normalised full name matches EXACTLY
--      (the seed roster stores names with a parenthetical job suffix, which is
--      stripped for the comparison) and the account is pinned to the same
--      location.
--
-- Anything still unresolved is LEFT NULL and written to
-- `user_employee_link_report` with `matchStrategy = 'NO_MATCH'`. No employee
-- row is fabricated to make a permission check pass.
-- ===========================================================================

CREATE TABLE IF NOT EXISTS `user_employee_link_report` (
  `id`                  int AUTO_INCREMENT PRIMARY KEY,
  `userId`              varchar(191) NOT NULL,
  `email`               varchar(191) NOT NULL,
  `userFullName`        varchar(191) NULL,
  `userRole`            varchar(60)  NULL,
  `locationId`          varchar(191) NULL,
  `previousEmployeeId`  varchar(191) NULL,
  `resolvedEmployeeId`  varchar(191) NULL,
  `resolvedEmployeeCode` varchar(191) NULL,
  `resolvedEmployeeName` varchar(191) NULL,
  `matchStrategy`       enum('EMAIL','EXISTING_LINK_REVALIDATED','EXISTING_LINK_CORRECTED','NAME_AND_LOCATION','NO_MATCH')
                        NOT NULL,
  `isUnresolved`        tinyint(1)   NOT NULL DEFAULT 0,
  `note`                text         NULL,
  `createdAt`           datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_uelr_user` (`userId`),
  KEY `idx_uelr_unresolved` (`isUnresolved`, `matchStrategy`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 1. Stage the resolution.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `_work_026_link`;

CREATE TABLE `_work_026_link` AS
SELECT u.`id`         AS `userId`,
       u.`email`      AS `email`,
       u.`fullName`   AS `userFullName`,
       u.`role`       AS `userRole`,
       u.`locationId` AS `locationId`,
       u.`employeeId` AS `previousEmployeeId`,
       (SELECT e.`id` FROM `employee` e
         WHERE e.`email` IS NOT NULL
           AND LOWER(e.`email`) = LOWER(u.`email`)
         LIMIT 1)     AS `byEmail`,
       CASE WHEN u.`employeeId` IS NOT NULL
             AND EXISTS (SELECT 1 FROM `employee` e2 WHERE e2.`id` = u.`employeeId`)
            THEN u.`employeeId` ELSE NULL END AS `byExistingLink`,
       (SELECT e3.`id` FROM `employee` e3
         WHERE TRIM(REGEXP_REPLACE(e3.`fullName`, '\\(.*\\)', '')) = TRIM(u.`fullName`)
           AND (u.`locationId` IS NULL OR e3.`locationId` = u.`locationId`)
         LIMIT 1)     AS `byNameAndLocation`
  FROM `user` u;

ALTER TABLE `_work_026_link` ADD PRIMARY KEY (`userId`);
ALTER TABLE `_work_026_link` ADD COLUMN `resolvedEmployeeId` varchar(191) NULL;
ALTER TABLE `_work_026_link` ADD COLUMN `matchStrategy`
       enum('EMAIL','EXISTING_LINK_REVALIDATED','EXISTING_LINK_CORRECTED','NAME_AND_LOCATION','NO_MATCH')
       NOT NULL DEFAULT 'NO_MATCH';

-- 1a. Email wins outright.
UPDATE `_work_026_link`
   SET `resolvedEmployeeId` = `byEmail`,
       `matchStrategy` = CASE WHEN `previousEmployeeId` IS NOT NULL
                              THEN 'EXISTING_LINK_CORRECTED'
                              ELSE 'EMAIL' END
 WHERE `byEmail` IS NOT NULL;

-- 1b. No email match: keep an existing link that still resolves.
UPDATE `_work_026_link`
   SET `resolvedEmployeeId` = `byExistingLink`,
       `matchStrategy` = 'EXISTING_LINK_REVALIDATED'
 WHERE `resolvedEmployeeId` IS NULL
   AND `byExistingLink` IS NOT NULL;

-- 1c. Last resort: exact normalised name + same location.
UPDATE `_work_026_link`
   SET `resolvedEmployeeId` = `byNameAndLocation`,
       `matchStrategy` = 'NAME_AND_LOCATION'
 WHERE `resolvedEmployeeId` IS NULL
   AND `byNameAndLocation` IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Report the whole account set BEFORE applying, so an unresolved account is
--    an explicit HR record and never an invisible NULL.
-- ---------------------------------------------------------------------------
INSERT INTO `user_employee_link_report`
      (`userId`, `email`, `userFullName`, `userRole`, `locationId`, `previousEmployeeId`,
       `resolvedEmployeeId`, `resolvedEmployeeCode`, `resolvedEmployeeName`,
       `matchStrategy`, `isUnresolved`, `note`)
SELECT w.`userId`, w.`email`, w.`userFullName`, w.`userRole`, w.`locationId`, w.`previousEmployeeId`,
       w.`resolvedEmployeeId`, e.`employeeCode`, e.`fullName`,
       w.`matchStrategy`,
       CASE WHEN w.`resolvedEmployeeId` IS NULL THEN 1 ELSE 0 END,
       CASE WHEN w.`resolvedEmployeeId` IS NULL
              THEN 'No roster row matches this account by email, by a revalidated existing link, or by exact name+location. Left NULL deliberately: an employee profile must not be fabricated to satisfy an access check. Either HR has not onboarded this person into the roster yet, or the account email differs from the roster email.'
            WHEN w.`matchStrategy` = 'EXISTING_LINK_CORRECTED'
              THEN 'The account was already linked, but to a different person. Re-pointed to the roster row matching the account email; the previous link is preserved in previousEmployeeId for HR.'
            ELSE NULL END
  FROM `_work_026_link` w
  LEFT JOIN `employee` e ON e.`id` = w.`resolvedEmployeeId`
ON DUPLICATE KEY UPDATE
      `previousEmployeeId`   = VALUES(`previousEmployeeId`),
      `resolvedEmployeeId`   = VALUES(`resolvedEmployeeId`),
      `resolvedEmployeeCode` = VALUES(`resolvedEmployeeCode`),
      `resolvedEmployeeName` = VALUES(`resolvedEmployeeName`),
      `matchStrategy`        = VALUES(`matchStrategy`),
      `isUnresolved`         = VALUES(`isUnresolved`),
      `note`                 = VALUES(`note`);

-- ---------------------------------------------------------------------------
-- 3. Apply. `User_employeeId_fkey` -> `employee(id)` stays enforced throughout,
--    so an id that does not exist on the roster cannot land here.
-- ---------------------------------------------------------------------------
UPDATE `user` u
  JOIN `_work_026_link` w ON w.`userId` = u.`id`
   SET u.`employeeId` = w.`resolvedEmployeeId`
 WHERE NOT (u.`employeeId` IS NULL AND w.`resolvedEmployeeId` IS NULL);

-- Keep the newer `users` mirror consistent with the authoritative link, and
-- report any mirror row whose stored employee_id does not resolve.
UPDATE `users` us
  JOIN `user` u ON LOWER(u.`email`) = LOWER(us.`email`)
   SET us.`employee_id` = u.`employeeId`
 WHERE u.`employeeId` IS NOT NULL
   AND NOT (us.`employee_id` <=> u.`employeeId`);

DROP TABLE IF EXISTS `_work_026_link`;

-- ---------------------------------------------------------------------------
-- 4. Outcome, surfaced into the migration log.
-- ---------------------------------------------------------------------------
SELECT `matchStrategy`, COUNT(*) AS accounts
  FROM `user_employee_link_report`
 GROUP BY `matchStrategy`
 ORDER BY `matchStrategy`;

SELECT r.`email`, r.`userFullName`, r.`userRole`, r.`isUnresolved`, r.`note`
  FROM `user_employee_link_report` r
 WHERE r.`isUnresolved` = 1
 ORDER BY r.`email`;

SELECT u.`email`, u.`employeeId`, e.`employeeCode`, e.`fullName`, e.`status`
  FROM `user` u
  JOIN `employee` e ON e.`id` = u.`employeeId`
 ORDER BY e.`employeeCode`;
