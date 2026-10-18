-- ===========================================================================
-- 043: one employee-code format — strictly numeric, everywhere
-- ===========================================================================
-- The reported symptom was a boot warning:
--
--   setupFormerEmployees warning: Check constraint
--   'employee_employeeCode_digits_only' is violated.
--
-- The root cause is two conflicting contracts in the same repository:
--
--   * migration 025 installed an ENFORCED check on `employee.employeeCode`
--     (`REGEXP '^[0-9]+$'`, 1-30 characters) after normalising the roster, and
--     every one of the 12 valid employee rows in this database is numeric
--     (100201, 200207, 300213, ...). The device enrollment PINs are numeric too,
--     which is what lets a terminal user ID be matched to an employee at all.
--   * `services/employeeIdService.ts` still defaulted to a `BSC-EMP-` prefix, and
--     `scripts/setupEmployeeImportSchema.ts` seeded that same prefix into
--     `employee_id_sequence`. So the ID generator minted codes the database
--     refuses: an import or self-service create would fail at INSERT, and the
--     demo seeder tripped the constraint on every fresh boot.
--
-- Decision: numeric throughout. That is the format the enforced constraint, the
-- existing valid records and the device PINs all agree on. Alphanumeric was the
-- documented intention of nothing except a default constant and one test that
-- asserted it.
--
-- What this migration does:
--   1. preserves the current policy and the whole sequence table before touching
--      anything, so the change is reversible (restore SQL at the bottom);
--   2. rewrites the policy to the numeric format in `system_settings`;
--   3. re-points the single sequence row to the numeric policy and lifts
--      `next_value` above the highest numeric code already in use, so a newly
--      minted ID can never shadow an existing one;
--   4. changes NO employee row, drops NO constraint, truncates NOTHING.
--
-- The constraint stays exactly as migration 025 defined it. Loosening it to
-- silence the warning would have been the wrong fix: `allocateEmployeeId()` now
-- refuses to mint a code the CHECK would reject, so the two contracts cannot
-- drift apart again.
-- ===========================================================================

-- 1 ── preserve before changing ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `employee_id_sequence_backup_043` (
  `sequence_id`    VARCHAR(64)  NOT NULL,
  `format_key`     VARCHAR(64)  NULL,
  `prefix`         VARCHAR(64)  NULL,
  `padding`        INT          NULL,
  `next_value`     BIGINT       NULL,
  `sample_format`  VARCHAR(64)  NULL,
  `original_updated_at` DATETIME(3) NULL,
  `backed_up_at`   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`sequence_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `employee_id_sequence_backup_043`
  (`sequence_id`, `format_key`, `prefix`, `padding`, `next_value`, `sample_format`, `original_updated_at`)
SELECT s.`id`, s.`format_key`, s.`prefix`, s.`padding`, s.`next_value`, s.`sample_format`, s.`updated_at`
  FROM `employee_id_sequence` s
ON DUPLICATE KEY UPDATE
  `format_key` = VALUES(`format_key`), `prefix` = VALUES(`prefix`), `padding` = VALUES(`padding`),
  `next_value` = VALUES(`next_value`), `sample_format` = VALUES(`sample_format`),
  `original_updated_at` = VALUES(`original_updated_at`);

-- 2 ── the approved format ──────────────────────────────────────────────────
-- `system_settings` is created by no migration in this repository (the
-- desktop/SQLite build owns it), so both statements below run only where the
-- table exists. The numeric policy still applies on a MySQL build because
-- `getEmployeeIdPolicy()` falls back to the sequence row, which step 3 normalises.
DROP PROCEDURE IF EXISTS `_apply_043_policy`;
CREATE PROCEDURE `_apply_043_policy`()
BEGIN
  DECLARE v_has_table INT;
  DECLARE v_previous  TEXT;

  SELECT COUNT(*) INTO v_has_table FROM information_schema.TABLES
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'system_settings';

  IF v_has_table = 1 THEN
    SELECT `setting_value` INTO v_previous FROM `system_settings`
     WHERE `setting_key` = 'employee_id_format' LIMIT 1;

    IF v_previous IS NOT NULL THEN
      -- Preserve the outgoing policy verbatim so the change is reversible.
      -- PREPARE only accepts user variables, hence the @sql naming.
      SET @sql = CONCAT(
        'INSERT INTO `system_settings` (`id`, `setting_key`, `setting_value`, `description`, `updated_at`) ',
        'VALUES (UUID(), ', '''employee_id_format_previous'', ', QUOTE(v_previous), ', ',
        '''Employee ID format as it was before migration 043 (kept for rollback)'', NOW(3)) ',
        'ON DUPLICATE KEY UPDATE `setting_value` = VALUES(`setting_value`), `updated_at` = NOW(3)'
      );
      PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
    END IF;

    SET @sql = CONCAT(
      'UPDATE `system_settings` SET `setting_value` = ',
      '''{"formatKey":"NUMERIC","prefix":"","padding":6,"sampleFormat":"000001"}'', ',
      '`updated_at` = NOW(3) WHERE `setting_key` = ''employee_id_format'''
    );
    PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
  END IF;
END;
CALL `_apply_043_policy`();
DROP PROCEDURE `_apply_043_policy`;

-- 3 ── re-point the sequence and keep it clear of existing codes ────────────
UPDATE `employee_id_sequence` s
  JOIN (
        SELECT COALESCE(MAX(CAST(`employeeCode` AS UNSIGNED)), 0) + 1 AS `next_after_roster`
          FROM `employee`
         WHERE `employeeCode` REGEXP '^[0-9]+$'
       ) m
   SET s.`format_key`    = 'NUMERIC',
       s.`prefix`        = '',
       s.`padding`       = 6,
       s.`sample_format` = LPAD('1', 6, '0'),
       -- GREATEST: never move the counter backwards, never reuse a minted value.
       s.`next_value`    = GREATEST(s.`next_value`, m.`next_after_roster`),
       s.`updated_at`    = NOW(3);

-- A database with no sequence row at all (fresh install) gets one, seeded above
-- the current roster.
INSERT INTO `employee_id_sequence` (`id`, `format_key`, `prefix`, `padding`, `next_value`, `sample_format`, `updated_at`)
SELECT 'NUMERIC', 'NUMERIC', '', 6, COALESCE(m.`next_after_roster`, 1), '000001', NOW(3)
  FROM (
         SELECT COALESCE(MAX(CAST(`employeeCode` AS UNSIGNED)), 0) + 1 AS `next_after_roster`
           FROM `employee`
          WHERE `employeeCode` REGEXP '^[0-9]+$'
       ) m
 WHERE NOT EXISTS (SELECT 1 FROM `employee_id_sequence`)
ON DUPLICATE KEY UPDATE `updated_at` = NOW(3);

-- 4 ── integrity assertions (read-only; expected results are in the comments) ─
-- Every stored code must satisfy the enforced check: expect violations = 0.
SELECT COUNT(*) AS `codes_violating_digits_check`
  FROM `employee`
 WHERE NOT (`employeeCode` REGEXP '^[0-9]{1,30}$');

-- The sequence must sit above the highest existing numeric code.
SELECT s.`format_key`, s.`prefix`, s.`padding`, s.`next_value`, s.`sample_format`,
       (SELECT COALESCE(MAX(CAST(`employeeCode` AS UNSIGNED)), 0) FROM `employee`
         WHERE `employeeCode` REGEXP '^[0-9]+$') AS `highest_roster_code`
  FROM `employee_id_sequence` s;

-- Duplicate employee codes across the roster: expect none.
SELECT `employeeCode`, COUNT(*) AS `n` FROM `employee`
 GROUP BY `employeeCode` HAVING COUNT(*) > 1;

-- ===========================================================================
-- ROLLBACK (this repository's migration engine is forward-only, so reversal is
-- an explicit, reviewed operation — run these statements to restore exactly
-- what step 1 preserved):
--
--   UPDATE `system_settings` nxt
--     JOIN `system_settings` prev ON prev.`setting_key` = 'employee_id_format_previous'
--     SET nxt.`setting_value` = prev.`setting_value`, nxt.`updated_at` = NOW(3)
--   WHERE nxt.`setting_key` = 'employee_id_format';
--
--   UPDATE `employee_id_sequence` s
--     JOIN `employee_id_sequence_backup_043` b ON b.`sequence_id` = s.`id`
--     SET s.`format_key` = b.`format_key`, s.`prefix` = b.`prefix`,
--         s.`padding` = b.`padding`, s.`next_value` = b.`next_value`,
--         s.`sample_format` = b.`sample_format`, s.`updated_at` = b.`original_updated_at`;
--
--   -- Rows minted in numeric form between applying and rolling back are NOT
--   -- removed by the above; restoring a prefixed policy does not make existing
--   -- numeric codes invalid. Roll back only if no employee was created since.
-- ===========================================================================
