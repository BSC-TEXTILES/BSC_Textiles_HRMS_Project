-- ===========================================================================
-- 025: DIGITS-ONLY STORE EMPLOYEE NUMBERS
--
-- Business rule: a stored employee number is digits only. `1604` and `1372`
-- are valid; `EMP1604`, `BSC-1604` and `1604A` are not.
--
-- The column stays a STRING (`varchar(191)`). Converting it to an integer would
-- silently destroy leading zeros — exactly the corruption the rule exists to
-- prevent. Enforcement is therefore a MySQL 8 CHECK constraint over a REGEXP,
-- not a type change.
--
-- Existing non-conforming codes are NOT re-invented:
--   * the embedded digit run is extracted as a PROPOSAL and kept in
--     `employeeCodeProposal`;
--   * the full original value is kept verbatim in `legacyEmployeeCode`;
--   * a proposal that is unique across the roster becomes the new code;
--   * proposals that collide are treated as a conflict — and `01` vs `001` is a
--     conflict, because leading zeros make them textually different but the
--     same identifier. No winner is picked arbitrarily; every member of the
--     group is allocated the next value from the project's own DB-backed
--     allocator (`employee_id_sequence`) and flagged `requiresHrCodeReview`;
--   * codes with no digits at all are allocated the same way and flagged;
--   * every invalid, missing or duplicate code is written to
--     `employee_code_compliance_report` for HR to correct.
--
-- `employee_id_sequence` itself minted `BSC-EMP-1373`, which violates this
-- rule. Its policy is switched to a digits-only sequence here, and the backend
-- default policy is updated to match.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns supporting the rule. Guarded so a re-tried run cannot fail on an
--    already-present column.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `_ensure_025_columns`;
CREATE PROCEDURE `_ensure_025_columns`()
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee'
                    AND COLUMN_NAME = 'employeeCodeProposal') THEN
    ALTER TABLE `employee` ADD COLUMN `employeeCodeProposal` varchar(191) NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee'
                    AND COLUMN_NAME = 'employeeCodeOrigin') THEN
    ALTER TABLE `employee` ADD COLUMN `employeeCodeOrigin` varchar(40) NOT NULL DEFAULT 'hr-assigned';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee'
                    AND COLUMN_NAME = 'requiresHrCodeReview') THEN
    ALTER TABLE `employee` ADD COLUMN `requiresHrCodeReview` tinyint(1) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee'
                    AND COLUMN_NAME = 'employeeCodeReviewedAt') THEN
    ALTER TABLE `employee` ADD COLUMN `employeeCodeReviewedAt` datetime(3) NULL DEFAULT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.COLUMNS
                  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employee'
                    AND COLUMN_NAME = 'employeeCodeReviewedById') THEN
    ALTER TABLE `employee` ADD COLUMN `employeeCodeReviewedById` varchar(191) NULL DEFAULT NULL;
  END IF;
END;

CALL `_ensure_025_columns`();
DROP PROCEDURE IF EXISTS `_ensure_025_columns`;

CREATE TABLE IF NOT EXISTS `employee_code_compliance_report` (
  `id`                 int AUTO_INCREMENT PRIMARY KEY,
  `employeeId`         varchar(191) NOT NULL,
  `fullName`           varchar(191) NOT NULL,
  `originalCode`       varchar(191) NULL,
  `digitsOnlyProposal` varchar(191) NULL,
  `appliedCode`        varchar(191) NULL,
  `issue`              enum('VALID','INVALID_FORMAT','DUPLICATE_PROPOSAL','MISSING_CODE','NUMERIC_DUPLICATE_IN_ROSTER')
                       NOT NULL,
  `resolution`         enum('KEPT','MIGRATED_EXTRACTED_DIGITS','AUTO_ALLOCATED_FROM_SEQUENCE','AWAITING_HR','RESOLVED_BY_HR')
                       NOT NULL DEFAULT 'AWAITING_HR',
  `requiresHrReview`   tinyint(1)   NOT NULL DEFAULT 1,
  `conflictGroupKey`   varchar(191) NULL,
  `note`               text         NULL,
  `createdAt`          datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdById`        varchar(191) NULL,
  KEY `idx_eccr_employee` (`employeeId`),
  KEY `idx_eccr_open` (`requiresHrReview`, `resolution`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Codes already in the roster that mean the same number (`102` vs `0102`).
CREATE TABLE IF NOT EXISTS `employee_code_number_conflict` (
  `id`                 int AUTO_INCREMENT PRIMARY KEY,
  `numericValue`       bigint       NOT NULL,
  `employeeId`         varchar(191) NOT NULL,
  `legacyEmployeeCode` varchar(191) NULL,
  `employeeCode`       varchar(191) NULL,
  `detectedAt`         datetime(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY `uq_ecnc_value_employee` (`numericValue`, `employeeId`),
  KEY `idx_ecnc_value` (`numericValue`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 2. Switch the allocator to a digits-only policy and make sure it can never
--    mint a number already present in the roster.
-- ---------------------------------------------------------------------------
UPDATE `employee_id_sequence`
   SET `prefix` = '',
       `padding` = 4,
       `format_key` = 'BSC-EMP-DIGITS',
       `sample_format` = LPAD(`next_value`, 4, '0')
 WHERE `format_key` = 'BSC-EMP';

UPDATE `employee_id_sequence` seq
  JOIN (SELECT GREATEST(
               COALESCE(MAX(CASE WHEN e.`employeeCode` REGEXP '^[0-9]+$'
                                 THEN CAST(e.`employeeCode` AS UNSIGNED) END), 0),
               COALESCE(MAX(s2.`next_value`), 0)) + 1 AS floor_value
          FROM `employee` e
         CROSS JOIN `employee_id_sequence` s2
        ) m
   SET seq.`next_value` = m.floor_value;

UPDATE `employee_id_sequence`
   SET `sample_format` = LPAD(`next_value`, `padding`, '0');

-- ---------------------------------------------------------------------------
-- 3. Snapshot the roster codes, extract proposals, detect conflicts.
--    `numericOriginal` / `numericProposal` are materialised here behind an
--    explicit REGEXP guard instead of CAST-ing inline later: under
--    STRICT_TRANS_TABLES a bare `CAST('BSC-BEL-0102' AS UNSIGNED)` is an ERROR,
--    not a warning, so every numeric comparison below reads these columns.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS `_work_025_codes`;
CREATE TABLE `_work_025_codes`
       DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
AS
SELECT e.`id`                                               AS `employeeId`,
       e.`fullName`                                         AS `fullName`,
       e.`employeeCode`                                     AS `originalCode`,
       e.`createdAt`                                        AS `createdAt`,
       REGEXP_REPLACE(e.`employeeCode`, '[^0-9]', '') COLLATE utf8mb4_unicode_ci AS `proposal`,
       CASE WHEN e.`employeeCode` REGEXP '^[0-9]+$' THEN 1 ELSE 0 END        AS `alreadyValid`,
       CASE WHEN REGEXP_REPLACE(e.`employeeCode`, '[^0-9]', '') = '' THEN 1 ELSE 0 END AS `noDigits`,
       CASE WHEN e.`employeeCode` REGEXP '^[0-9]+$'
            THEN CAST(e.`employeeCode` AS UNSIGNED) ELSE 0 END               AS `numericOriginal`,
       CASE WHEN REGEXP_REPLACE(e.`employeeCode`, '[^0-9]', '') <> ''
            THEN CAST(REGEXP_REPLACE(e.`employeeCode`, '[^0-9]', '') AS UNSIGNED)
            ELSE 0 END                                                       AS `numericProposal`,
       0                                                    AS `proposalClashes`
  FROM `employee` e;

ALTER TABLE `_work_025_codes` ADD PRIMARY KEY (`employeeId`);
-- Declared explicitly rather than as `NULL AS appliedCode` in the select list:
-- CREATE TABLE AS SELECT infers a zero-width type for a bare NULL, which then
-- rejects every real value.
ALTER TABLE `_work_025_codes` ADD COLUMN `appliedCode` varchar(191)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

-- 3a. Numeric duplicates that ALREADY exist among valid codes (`102` vs `0102`).
TRUNCATE TABLE `employee_code_number_conflict`;

INSERT INTO `employee_code_number_conflict` (`numericValue`, `employeeId`, `employeeCode`)
SELECT v.`numericOriginal`, v.`employeeId`, v.`originalCode`
  FROM `_work_025_codes` v
 WHERE v.`alreadyValid` = 1
   AND v.`numericOriginal` > 0
   AND (SELECT COUNT(*)
          FROM `_work_025_codes` o
         WHERE o.`alreadyValid` = 1
           AND o.`numericOriginal` = v.`numericOriginal`) > 1;

-- 3b. Proposals that clash with another proposal, or with a code already in the
--     roster, judged by NUMERIC value so `01` and `001` are one identifier.
--     Materialised into a side table first: MySQL rejects a correlated
--     subquery over the same table an UPDATE is writing (ER 1093).
DROP TABLE IF EXISTS `_work_025_clash`;

CREATE TABLE `_work_025_clash`
       DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_unicode_ci
AS
SELECT a.`employeeId`
  FROM `_work_025_codes` a
  LEFT JOIN `_work_025_codes` b
         ON b.`noDigits` = 0
        AND b.`employeeId` <> a.`employeeId`
        AND b.`numericProposal` = a.`numericProposal`
  LEFT JOIN `_work_025_codes` v
         ON v.`alreadyValid` = 1
        AND v.`numericOriginal` = a.`numericProposal`
  LEFT JOIN `employee_code_number_conflict` c
         ON c.`numericValue` = a.`numericProposal`
 WHERE a.`noDigits` = 0
   AND a.`alreadyValid` = 0
   AND (b.`employeeId` IS NOT NULL OR v.`employeeId` IS NOT NULL OR c.`id` IS NOT NULL)
 GROUP BY a.`employeeId`;

UPDATE `_work_025_codes` w
  JOIN `_work_025_clash` x ON x.`employeeId` = w.`employeeId`
   SET w.`proposalClashes` = 1;

DROP TABLE `_work_025_clash`;

-- 3c. Decide the applied code. Conflicts and no-digit rows are left NULL here
--     and filled from the sequence in 3d.
UPDATE `_work_025_codes` SET `appliedCode` = CONVERT(`proposal` USING utf8mb4) COLLATE utf8mb4_unicode_ci
 WHERE `alreadyValid` = 0 AND `noDigits` = 0 AND `proposalClashes` = 0;

UPDATE `_work_025_codes` SET `appliedCode` = `originalCode`
 WHERE `alreadyValid` = 1;

-- 3d. Allocate the unresolved ones from the project's DB-backed sequence, in a
--     deterministic roster order. Set-based rather than a cursor: the sequence
--     was already pushed above MAX(numeric code in the roster) in step 2, so
--     consecutive values from it cannot collide with an existing code, and no
--     retry loop is needed.
SET @alloc_base = (SELECT `next_value` FROM `employee_id_sequence`
                    WHERE `format_key` = 'BSC-EMP-DIGITS' LIMIT 1);
SET @alloc_padding = (SELECT `padding` FROM `employee_id_sequence`
                       WHERE `format_key` = 'BSC-EMP-DIGITS' LIMIT 1);

UPDATE `_work_025_codes` w
  JOIN (SELECT `employeeId`,
               ROW_NUMBER() OVER (ORDER BY `createdAt`, `employeeId`) AS `seq`
          FROM `_work_025_codes`
         WHERE `appliedCode` IS NULL) r ON r.`employeeId` = w.`employeeId`
   SET w.`appliedCode` = LPAD(@alloc_base + r.`seq` - 1, @alloc_padding, '0');

UPDATE `employee_id_sequence`
   SET `next_value` = @alloc_base + (SELECT COUNT(*) FROM `_work_025_codes`
                                      WHERE `alreadyValid` = 0
                                        AND (`proposalClashes` = 1 OR `noDigits` = 1)),
       `sample_format` = LPAD(`next_value`, `padding`, '0')
 WHERE `format_key` = 'BSC-EMP-DIGITS';

-- ---------------------------------------------------------------------------
-- 4. Write the HR correction report BEFORE rewriting anything.
--    Rows this migration owns carry `createdById IS NULL`; rows written later
--    by the application always name an actor, so a re-run refreshes its own
--    report rows without erasing HR's.
-- ---------------------------------------------------------------------------
DELETE FROM `employee_code_compliance_report` WHERE `createdById` IS NULL;

INSERT INTO `employee_code_compliance_report`
      (`employeeId`, `fullName`, `originalCode`, `digitsOnlyProposal`, `appliedCode`,
       `issue`, `resolution`, `requiresHrReview`, `conflictGroupKey`, `note`, `createdById`)
SELECT w.`employeeId`,
       w.`fullName`,
       w.`originalCode`,
       NULLIF(w.`proposal`, ''),
       w.`appliedCode`,
       CASE WHEN w.`noDigits` = 1        THEN 'MISSING_CODE'
            WHEN w.`proposalClashes` = 1 THEN 'DUPLICATE_PROPOSAL'
            WHEN w.`alreadyValid` = 1    THEN 'VALID'
            ELSE 'INVALID_FORMAT' END,
       CASE WHEN w.`noDigits` = 1        THEN 'AUTO_ALLOCATED_FROM_SEQUENCE'
            WHEN w.`proposalClashes` = 1 THEN 'AUTO_ALLOCATED_FROM_SEQUENCE'
            WHEN w.`alreadyValid` = 1    THEN 'KEPT'
            ELSE 'MIGRATED_EXTRACTED_DIGITS' END,
       CASE WHEN w.`alreadyValid` = 1 AND w.`proposalClashes` = 0 THEN 0 ELSE 1 END,
       CASE WHEN w.`proposalClashes` = 1 THEN CONCAT('digits:', w.`proposal`) ELSE NULL END,
       CASE WHEN w.`noDigits` = 1
              THEN 'Original code contains no digits, so nothing could be extracted. A number was allocated from employee_id_sequence and flagged for HR; the original is preserved verbatim in employee.legacyEmployeeCode.'
            WHEN w.`proposalClashes` = 1
              THEN 'The extracted digit run is not unique across the roster (leading zeros ignored, so 01 and 001 are the same identifier). No winner was chosen arbitrarily: every member of the group got a sequence number and HR must confirm the real store number. Original preserved in employee.legacyEmployeeCode.'
            WHEN w.`alreadyValid` = 1
              THEN 'Already digits only; left untouched.'
            ELSE 'Replaced by the digits embedded in the original code. Original preserved verbatim in employee.legacyEmployeeCode.'
       END,
       NULL
  FROM `_work_025_codes` w
 WHERE w.`alreadyValid` = 0
    OR EXISTS (SELECT 1 FROM `employee_code_number_conflict` c WHERE c.`employeeId` = w.`employeeId`);

-- ---------------------------------------------------------------------------
-- 5. Apply the rewrite. `legacyEmployeeCode` keeps the original value, so the
--    correction is fully reversible for every single row.
-- ---------------------------------------------------------------------------
UPDATE `employee` e
  JOIN `_work_025_codes` w ON w.`employeeId` = e.`id`
   SET e.`legacyEmployeeCode`   = COALESCE(e.`legacyEmployeeCode`, w.`originalCode`),
       e.`employeeCodeProposal` = NULLIF(w.`proposal`, ''),
       e.`requiresHrCodeReview` = CASE WHEN w.`alreadyValid` = 1 AND w.`proposalClashes` = 0 THEN 0 ELSE 1 END,
       e.`employeeCodeOrigin`   = CASE WHEN w.`alreadyValid` = 1                     THEN 'hr-assigned'
                                       WHEN w.`noDigits` = 1                         THEN 'sequence-allocated-hr-review'
                                       WHEN w.`proposalClashes` = 1                  THEN 'sequence-allocated-duplicate-conflict'
                                       ELSE 'extracted-digits' END;

UPDATE `employee` e
  JOIN `_work_025_codes` w ON w.`employeeId` = e.`id`
   SET e.`employeeCode` = w.`appliedCode`
 WHERE w.`alreadyValid` = 0
   AND w.`appliedCode` IS NOT NULL;

-- Gender casing differed between the two rosters (legacy 'male', seed 'MALE').
-- The authoritative legacy convention wins; the change is case-only.
UPDATE `employee` SET `gender` = LOWER(`gender`)
 WHERE `gender` IS NOT NULL AND `gender` <> LOWER(`gender`);

DROP TABLE IF EXISTS `_work_025_codes`;

-- ---------------------------------------------------------------------------
-- 6. Hard database enforcement, added only once the roster is provably clean.
--    If the roster is NOT clean this fails loudly rather than enforcing a
--    constraint over corrupted data or quietly skipping the step.
-- ---------------------------------------------------------------------------
DROP PROCEDURE IF EXISTS `_add_025_digits_check`;
CREATE PROCEDURE `_add_025_digits_check`()
BEGIN
  DECLARE v_bad INT;

  SELECT COUNT(*) INTO v_bad FROM `employee` WHERE `employeeCode` NOT REGEXP '^[0-9]+$';
  IF v_bad > 0 THEN
    SELECT `id` AS offending_employeeId, `employeeCode` AS offending_code, `legacyEmployeeCode`
      FROM `employee` WHERE `employeeCode` NOT REGEXP '^[0-9]+$';
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '025 abort: roster still holds non-digit employee codes. Resolve them via employee_code_compliance_report before applying.',
          MYSQL_ERRNO = 1644;
  END IF;

  SELECT COUNT(*) INTO v_bad FROM `employee`
   WHERE `requiresHrCodeReview` = 1 AND `legacyEmployeeCode` IS NULL;
  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = '025 abort: a code flagged for HR review has no preserved original value.',
          MYSQL_ERRNO = 1644;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE()
                    AND CONSTRAINT_NAME = 'employee_employeeCode_digits_only') THEN
    ALTER TABLE `employee`
      ADD CONSTRAINT `employee_employeeCode_digits_only`
          CHECK (`employeeCode` REGEXP '^[0-9]+$' AND CHAR_LENGTH(`employeeCode`) BETWEEN 1 AND 30) ENFORCED;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.CHECK_CONSTRAINTS
                  WHERE CONSTRAINT_SCHEMA = DATABASE()
                    AND CONSTRAINT_NAME = 'employee_reviewedCode_keepsOriginal') THEN
    ALTER TABLE `employee`
      ADD CONSTRAINT `employee_reviewedCode_keepsOriginal`
          CHECK (`requiresHrCodeReview` = 0 OR `legacyEmployeeCode` IS NOT NULL) ENFORCED;
  END IF;
END;

CALL `_add_025_digits_check`();
DROP PROCEDURE IF EXISTS `_add_025_digits_check`;

-- Final state of the enforcement, surfaced into the migration log.
SELECT e.`id`, e.`employeeCode`, e.`legacyEmployeeCode`, e.`employeeCodeProposal`,
       e.`employeeCodeOrigin`, e.`requiresHrCodeReview`
  FROM `employee` e
 ORDER BY LPAD(e.`employeeCode`, 30, '0');
